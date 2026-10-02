# Fase 4 — piloto operável

- **Especificação:** v1.1; execução limitada a `prompts/fase-4-piloto-operavel.md`.
- **Estado:** **PENDENTE_EXTERNA** — preparação local implementada e verificada; faltam homologações e decisões externas (seção 5).
- **Liberação operacional:** **NÃO_SOLICITADA**. Nenhum lojista convidado, nenhuma publicação, e-mail externo, pagamento ou devolução real.
- **Data:** 01/10/2026. Ambiente `ecommerce-phase4-test` (Docker Desktop, Node 24.21.0, PostgreSQL 17.9 com arquivamento de WAL, Redis 7.4.7, SeaweedFS S3 local). Dados sintéticos.
- **Resultado do verificador:** `node scripts/verify.mjs --phase=4` → **código 0** (execução final 17:12–17:18 UTC, fontes `3cfbe8d2…fe51`, já incluindo a POC da Fase 0). Verificação técnica local; não substitui homologação externa.

## 1. Entregue

1. **Painel de pedidos:** filtros (pedido, pagamento, entrega, número, “somente com pendências”), valor devido e protocolos abertos na lista; aviso explícito de ação financeira mesmo com pagamento PAID; recebimentos com ID externo; histórico; permissões Dono × Funcionário.
2. **Expedição:** separação, envio único com transportadora/rastreio manual, retirada pronta e retirada comprovada, entrega → COMPLETED, devolução física sem repor estoque. Backend revalida pagamento, disputa, pendências, solicitações de cancelamento/arrependimento e baixa de estoque a cada passo.
3. **Atendimento (22.5):** protocolo vinculado ao pedido e contato geral sem compra (código de acompanhamento), confirmação imediata, horário original imutável, mensagens, responsável, prazo de 5 dias com atraso destacado, conclusão com resultado. Arrependimento/cancelamento aceito exige registro prévio da comunicação ao meio de pagamento (Dono) quando há pagamento.
4. **Notificações transacionais:** fila durável no PostgreSQL gravada na transação do fato; worker com retentativa exponencial, FAILED após 6 tentativas e reenvio pelo Dono. Link do comprador com segredo no fragmento (hash, 90 dias, revogável). Provedor externo **não** homologado: `LOCAL` marca SIMULATED.
5. **Incidente financeiro manual:** procedimento + “Solicitar nova consulta”; somente confirmação do gateway encerra devoluções; revisões não financeiras concluídas apenas pelo Dono.
6. **Suspensão/pausa:** pausa pelo Dono e suspensão pelo operador (CLI) bloqueiam novas compras; pedidos, conciliação, devoluções, expedição e atendimento continuam; página do pedido acessível com loja suspensa; trilha de eventos.
7. **Privacidade:** exportação da loja e do comprador (Dono, 15 min), eliminação por anonimização com retenção justificada, ledger externo no S3 e reaplicação após restauração.
8. **Operação:** status/alertas por loja (worker a cada 60 s, painel e CLI), saúde, limites e logs existentes; WAL arquivado + ensaio PITR; pós-restauração que pausa vendas, retém e-mails e força consulta antes de cobrar.

## 2. Arquivos principais

- Migration `packages/database/migrations/0007_operations.sql`.
- `packages/purchase/src/operations.ts`, `notifications.ts`; integração em `index.ts`; `packages/media` (ledger).
- `apps/api/src/operations.ts`; buyer/link em `apps/api/src/purchase.ts`; worker `apps/worker/src/main.ts`.
- Web: `components/checkout.tsx` (comprovante, protocolos, contato), páginas `painel/[tenantId]/{pedidos,atendimento,operacao}`.
- Scripts: `scripts/ops.mjs`, `ops-tasks.mjs`, `pitr-drill.mjs`, `verify.mjs`; `compose.yaml` (WAL, e-mail), `infra/postgres/Dockerfile`, `compose.phase4.test.yaml`.
- Testes: `tests/operations.test.mjs`, `pilot-flow.test.mjs`, `post-backup.test.mjs`, `recovery.test.mjs` (+ regressões das Fases 1–3).
- Documentos: [`decisoes/piloto-operavel.md`](../decisoes/piloto-operavel.md), [`api/operacao.openapi.yaml`](../api/operacao.openapi.yaml), procedimentos em [`docs/operacao/`](../operacao/).

## 3. Verificações

| Execução | Resultado |
|---|---|
| Testes isolados na pilha `ecommerce-phase4-test` | 1ª rodada: falta de estoque no seed (corrigido com ajuste auditado no teste); ENOMEM no Chromium com 4 pilhas Docker ativas (pilhas de teste 2/3 paradas); PITR falhou pela saída `INSERT 0 1` do psql (corrigido com `-q`); fixture PREPARED processada pelo worker antes do backup (crash simulado com lease) |
| `verify --phase=4` (1ª) | Código 1: etapa pós-backup recebeu 429 do limite de 1000 req/min do teste (limite mantido; teste aguarda a janela) |
| `verify --phase=4` (2ª e final, repetida após a POC da Fase 0) | **Código 0** nas duas — todas as etapas abaixo |

| Etapa | Resultado |
|---|---|
| Build Node LTS, migrations 0001–0007, S3, saúde, tipos | aprovado |
| Núcleo Fase 3 (23) + operação Fase 4 (10) com worker parado | 33/33 |
| Worker real: T21, interface comprador, T27 em duas lojas, interface de operação | 7/7 |
| Regressão Fase 2 (T22/T23/T37…) e fundação (T01/T02…) | 12/12 e 13/13 |
| Logs sanitizados (incl. ausência do segredo de link) e alertas emitidos | aprovado |
| CLI `ops.mjs status` | 10 lojas; alertas FINANCIAL_INCIDENT_OPEN, PAYMENT_UNCERTAIN, FINANCIAL_COMMUNICATION_PENDING |
| Backup → fatos pós-backup (pagamentos, devolução, eliminação) → restore | aprovado |
| Pós-restore: fundação, vitrine, compra, T26/T32 | 4/4 |
| PITR em container limpo | ponto-alvo exato; **RPO observado 59,3 s** (archive_timeout 60 s); **RTO do ensaio 6,4 s** (banco sintético) |

Evidências: [verification.json](evidencias/fase-4/verification.json), [operations.json](evidencias/fase-4/operations.json), [pilot-flow.json](evidencias/fase-4/pilot-flow.json), [post-backup.json](evidencias/fase-4/post-backup.json), [recovery.json](evidencias/fase-4/recovery.json), [pitr.json](evidencias/fase-4/pitr.json) e capturas phase4-{contact,support,orders,operation}-{390,1440}.png na mesma pasta.

## 4. Critérios de aceite do piloto

| Critério | Situação |
|---|---|
| T01–T17, T19–T24 | Aprovados automaticamente (Fases 1–3, repetidos aqui) com provedor SIMULADO |
| T25 suspensão | Aprovado: vendas bloqueadas; pagamento, devolução, expedição, atendimento e consulta continuam |
| T26 restauração + conciliação | **Ensaio executado** (dump lógico antigo, pós-restore, estado do provedor reproduzido, 2 pagamentos e devolução conciliados, 0 cobranças novas, 30 e-mails retidos). Provedor SIMULADO; RTO real de produção não medido |
| T27 fluxo completo em duas lojas | Aprovado **em simulação**: conta da própria loja recebe, estoque, 4 e-mails (SIMULATED), envio e entrega. **Homologação real pendente** (Fase 0, e-mail) |
| T32 exportação/eliminação/restauração antiga | Aprovado: exportação com expiração/permissão, eliminação bloqueada em pedido aberto, ledger externo reaplicado no backup antigo |
| T35 devolução no gateway | Aprovado no simulador; ensaio no painel de teste do MP pendente (Fase 0) |
| T36 atendimento/arrependimento | Aprovado: protocolo, confirmação, prazos, comunicação financeira antes do aceite, falha de notificação preservando data, acesso autorizado |
| T37 SEO | Aprovado (regressão Fase 2) |

**Seção 26.1 não está atendida**: homologação real em duas lojas, contas de pagamento, ambiente de produção, backup externo, canal de suporte/monitoramento, dados/políticas reais e autorização de ativação dependem dos itens da seção 5.

## 5. Pendências externas e decisões (seção 26.1)

| Item | Decisão | Responsável | Estado |
|---|---|---|---|
| Mercado Pago: POC da Fase 0, contas OAuth de teste, webhook HTTPS, cartão tokenizado | D02 | Titular da conta + desenvolvimento | PENDENTE — pagamentos reais bloqueados |
| MFA para Donos/administradores antes de pagamento real; console de administrador da plataforma | Seção 5 | Desenvolvimento | PENDENTE |
| Provedor de e-mail e remetente verificado | D05 | Operação | PENDENTE — mensagens ficam PENDING sem provedor |
| Domínio da plataforma, DNS, HTTPS (Caddy) e rota pública | D03 | Responsável + operação | PENDENTE |
| Backup externo cifrado (WAL/base/S3), retenção 30 dias, chaves separadas, ferramenta mantida | D04 | Operação | PENDENTE — ensaio só com volume local |
| VM, monitoramento de host/disco, canal de alerta e pessoa de plantão | D06 | Responsável + operação | PENDENTE |
| Termos, privacidade, retenção, responsabilidades e cobertura do atendimento | D08 | Responsável + assessoria | PENDENTE |
| Lojas piloto, dados reais do fornecedor, emissão fiscal externa | D01/D10 | Responsável + lojistas | PENDENTE |
| Autorização de ativação | 26.1 | Responsável | NÃO_SOLICITADA |

## 6. Como executar

```sh
npm ci
npm run setup
docker compose up --build -d --wait web worker
node scripts/seed.mjs --local
node scripts/verify.mjs --phase=4
node scripts/ops.mjs status
```

O `compose.yaml` agora inicia o PostgreSQL com arquivamento de WAL; na pilha de desenvolvimento existente é preciso recriar o container `postgres` (`docker compose up -d --build postgres`) para aplicar.

## 7. Próximo passo

Fase 0 com credenciais de teste do Mercado Pago; depois homologar e-mail, domínio/HTTPS e backup externo, e só então pedir autorização para a Fase 5.

## Substitutos simulados (02/10/2026)

As dependências externas desta fase foram exercitadas com substitutos locais fictícios. Veja [substitutos-simulados.md](substitutos-simulados.md). Isso **não** encerra as pendências reais listadas acima.
