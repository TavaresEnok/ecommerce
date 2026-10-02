# Fase 3 — compra, estoque e pagamentos confiáveis

- **Especificação:** v1.1; execução limitada a `prompts/fase-3-compra-e-pagamentos.md`.
- **Estado:** **PENDENTE_EXTERNA** — núcleo local implementado e verificado com provedor **SIMULADO**; homologação do Mercado Pago (Fase 0) inexistente.
- **Liberação operacional:** **NÃO_SOLICITADA**. Nenhum pagamento, reembolso, publicação ou convite real.
- **Data:** 01/10/2026. Ambiente `ecommerce-phase3-test` (Docker Desktop, Node 24.21.0 nos containers, PostgreSQL 17.9, Redis 7.4.7). Somente dados sintéticos.
- **Resultado:** `node scripts/verify.mjs --phase=3` → **código 0** (verificação técnica local com simulação). A fase não é marcada CONCLUÍDA porque a homologação externa do gateway não existe.

## 0. Diagnóstico ao retomar

Ao iniciar esta sessão o relatório estava EM_ANDAMENTO: existiam migration `0005_purchase.sql`, `packages/purchase`, API e worker, mas **nenhum teste, nenhuma interface de checkout/pedido, nenhum verificador `--phase=3` e nenhum resultado**. **Não existe POC da Fase 0** (`experiments/` ausente). As Fases 1 e 2 foram revalidadas: a repetição integral de `--phase=2` (que inclui T01/T02, fundação, backup e restore) passou em todas as etapas; terminou com código 2 apenas porque fontes foram editadas durante a execução (proteção do runner). A evidência original da Fase 2 foi preservada.

## 1. Entregue

1. **Checkout idempotente (CHK-01..06):** chave por intenção + impressão do conteúdo; mesma chave/conteúdo e nova chave para a mesma versão do carrinho retornam o mesmo pedido; conteúdo diferente → 409. Preço e cotação recalculados no servidor; total enviado só confere. Uma transação cria número comercial, pedido, snapshots (itens, fornecedor, frete, endereço, comprador), reserva integral ordenada, tentativa PREPARED, `checkout_requests` e evento outbox. Gateway só é chamado depois, pelo worker, fora de locks.
2. **Reserva/estoque (seção 12):** reserva integral ou nada; confirmação consome uma vez; liberação por expiração confirmada, cancelamento ou incerteza de 60 min (`PAYMENT_UNCERTAIN`); realocação atômica após pagamento tardio; `PAID_WITHOUT_STOCK` bloqueia e o Dono realoca quando recompõe saldo. Toda alteração gera movimento com chave única.
3. **Estados separados:** pedido, pagamento, entrega, disputa e incidentes; histórico com estado anterior/novo, motivo e autor.
4. **Pagamentos:** contrato `Gateway` (create/search/get); `SimulatedGateway` persistido separado do ledger; candidato `MercadoPagoCandidate`/`OAuthCandidate` sem transporte instalado (desabilitado). Validação de vendedor, ambiente, referência, moeda e valor; recebimentos incompatíveis/excedentes/tardios preservados com incidente. Timeout → UNKNOWN → consulta antes de qualquer reenvio (mesma chave). Webhook com HMAC por conta, janela de 5 min, comparação constante, inbox deduplicada por (conta, event_id) e consulta autoritativa. Conta revogada bloqueia novas cobranças.
5. **Reembolso/disputa (somente leitura no piloto):** devoluções parciais/totais e disputas conciliadas a partir do provedor, sem iniciação de estorno. Anotação do Dono não resolve pendência; apenas confirmação externa.
6. **Outbox/fila:** evento na mesma transação; worker publica com `jobId` estável; consumo com recibo atômico; falhas esgotadas ficam no PostgreSQL com espera exponencial e reprocessamento pelo Dono; perda do Redis reconstruída do banco.
7. **Comprador:** revisão e correção antes da confirmação, comprovante conservável com snapshots e aviso de simulação, consulta autorizada só pelo cookie do carrinho, nova tentativa segura e **protocolo durável** (atendimento, arrependimento, cancelamento) com confirmação imediata e idempotência.
8. **Lojista:** `/painel/{tenant}/pedidos` com lista, detalhe, incidentes e valores devidos, cancelamento (Dono), realocação, anotação, correção auditada de endereço, reprocessamento de eventos e simulador de provedor rotulado.

**Não implementado (fora do escopo):** expedição/envio, notificações por e-mail, atendimento completo, assinatura SaaS, comissão, API de reembolso, frete externo, promoções.

## 2. Arquivos principais

- `packages/database/migrations/0005_purchase.sql` (preexistente) e **`0006_purchase_corrections.sql`** (correções append-only, índices de pendências).
- `packages/purchase/src/index.ts` (núcleo), `mercado-pago.ts` (candidato desabilitado).
- `apps/api/src/purchase.ts`, `cart.ts`; `apps/worker/src/main.ts`.
- `apps/web/components/checkout.tsx`, `storefront.tsx`, `app/lojas/[slug]/[[...path]]/page.tsx`, `app/painel/[tenantId]/pedidos/page.tsx`.
- `tests/purchase.test.mjs`, `tests/purchase-worker.test.mjs`, `tests/purchase-restore.test.mjs`.
- `scripts/verify.mjs`, `scripts/compose.mjs`, `compose.phase3.test.yaml`.
- Contrato: [`docs/api/compra.openapi.yaml`](../api/compra.openapi.yaml). Decisões: [`docs/decisoes/compra-e-pagamentos.md`](../decisoes/compra-e-pagamentos.md).

## 3. Verificações executadas

| Comando | Resultado |
|---|---|
| `npm run typecheck` (host, Node 25) | Sem erros |
| `node scripts/verify.mjs --phase=2` (regressão, antes das edições) | Todas as etapas passaram; código 2 por fonte alterada durante a execução |
| `node scripts/verify.mjs --phase=3` (1ª) | Código 1: núcleo 23/23 aprovado; teste de interface falhou — `crypto.randomUUID` indisponível em HTTP não seguro. Corrigido com `getRandomValues` |
| Reexecução isolada `tests/purchase-worker.test.mjs` | 4/4 aprovados |
| `node scripts/verify.mjs --phase=3` (final, árvore estável, 16:22–16:26 UTC) | **Código 0**: build/tipos; núcleo 23/23; worker/UI 4/4; regressão Fase 2 12/12; fundação T01/T02 13/13; logs sanitizados; S3 após reinício; backup; restore; conferências pós-restore 3/3. SHA-256 das fontes `36aace0f…09c0` |

Evidências: [`verification.json`](evidencias/fase-3/verification.json), [`purchase.json`](evidencias/fase-3/purchase.json), [`purchase-worker.json`](evidencias/fase-3/purchase-worker.json), [`purchase-restore.json`](evidencias/fase-3/purchase-restore.json), capturas [`phase3-order-390.png`](evidencias/fase-3/phase3-order-390.png), [`phase3-order-1440.png`](evidencias/fase-3/phase3-order-1440.png), [`phase3-admin-390.png`](evidencias/fase-3/phase3-admin-390.png), [`phase3-admin-1440.png`](evidencias/fase-3/phase3-admin-1440.png).

### Cobertura (simulada, PostgreSQL real, papel `app_user`)

| ID | Teste |
|---|---|
| T03 | FKs compostas de itens/reservas e RLS FORCE em todas as tabelas |
| T04 | Outro carrinho, sem cookie, outra loja, outro tenant no painel → 404 |
| T05 | Funcionário lê; não conecta/revoga conta, cancela, realoca, corrige endereço nem simula |
| T06 | Duas compras concorrentes da última unidade → 201 + 409, saldo nunca negativo |
| T07 | Item indisponível → 409 sem pedido/reserva; `allocate` não reserva parcialmente |
| T08/T09 | Mesma chave e nova chave → mesmo pedido; conteúdo diferente → 409 |
| T10 | Total adulterado e preço alterado → 409; nova cotação exigida |
| T11 | Resposta perdida e criação nunca entregue → uma única cobrança simulada |
| T12 | Webhook triplicado, consultas repetidas e fato antigo → um recebimento, sem regressão |
| T13 | Assinatura inválida/expirada → 401; vendedor, valor e moeda incompatíveis → incidente, sem PAID |
| T14 | Expiração e confirmação concorrentes (3 repetições) → consumo único |
| Expiração | Encerramento confirmado → CANCELLED/UNPAID; incerteza → PAYMENT_UNCERTAIN após 60 min |
| T15 | Realocação com saldo; sem saldo → PAID_WITHOUT_STOCK + realocação do Dono |
| T16 | Duas tentativas pagas → PRINCIPAL + EXCESS, uma baixa, devolução confirmada resolve |
| T17/T35 | Pagamento em cancelado não reabre; anotação não resolve; devolução parcial/repetida/total concilia |
| T19 | Devolução parcial + disputa aberta/perdida preservadas |
| T20 | Evento não publicado; consumo concorrente e cross-tenant → um recibo |
| T21 | Jobs publicados e eliminados do Redis → reconstruídos e executados uma vez (worker real) |
| T24 | Preço, fornecedor e tema alterados → snapshots intactos; UPDATE negado; correção auditada |
| T36 (protocolo) | Protocolo durável, idempotente, conflito em conteúdo diferente, visível ao lojista |
| Interface | Desktop 1440 e móvel 390: produto → frete → revisão/correção → confirmação → comprovante → pago → protocolo; intruso negado; painel de pedidos; sem overflow nem erro JS |
| Restore | Pedido, recebimento, incidentes e recibos preservados; tentativas enviadas não voltam a PREPARED |

T18 excluído (iniciação de reembolso, Fase 6). **Nenhum resultado acima é homologação externa.**

## 4. Pendências

| Pendência | Responsável | Bloqueia |
|---|---|---|
| Fase 0: conta/aplicação Mercado Pago de teste, dois vendedores, URL HTTPS de webhook (D02) | Titular da conta + desenvolvimento | Pagamento real; conclusão da Fase 3 |
| Captura/tokenização oficial de cartão, cancelamento de Pix pendente, assinatura real de webhook | Desenvolvimento após POC | Métodos reais |
| MFA de donos antes de pagamentos reais (seção 5) | Desenvolvimento | Pagamento real |
| Notificações, atendimento completo, expedição, suspensão, exportação, backup externo, T25–T27/T32 | Fase 4 | Piloto |

## 5. Como executar

```sh
npm ci
npm run setup
docker compose up --build -d --wait web worker
node scripts/seed.mjs --local
node scripts/verify.mjs --phase=3
```

Demonstração local (`PAYMENT_SIMULATION=true` só em development/test): entre no portal, abra **Pedidos e pagamentos**, conecte a conta SIMULADA, compre pela vitrine e use “Enviar evento simulado” para aprovar/rejeitar/devolver. **Procedimento para verificar um pedido:** painel → pedido → conferir estados, recebimentos (PRINCIPAL/EXCESS/INCOMPATIBLE), incidentes abertos com valor devido e histórico; comprador confere o comprovante pelo mesmo navegador.

## 6. Próximo passo

Executar a Fase 0 com credenciais de teste do Mercado Pago para substituir o simulador pelo adaptador homologado, e a Fase 4 (operação do piloto).
