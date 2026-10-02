# Fase 6 — preparar a comercialização

- **Especificação:** v1.1; execução limitada a `prompts/fase-6-lancamento-comercial.md`.
- **Estado:** **PENDENTE_EXTERNA** — parte técnica independente de terceiros implementada e verificada com provedores SIMULADOS; faltam decisões comerciais, provedores homologados e a evidência real da Fase 5.
- **Liberação operacional/comercial:** **NÃO_SOLICITADA**. Nenhuma cobrança de lojista, preço publicado, domínio de cliente, contratação ou migração de produção.
- **Data:** 02/10/2026. Instrução do responsável: preço e provedores ficam para depois; implementar o que não depende de terceiros e escolher a melhor opção técnica nas dúvidas.

## 1. Entregue

| Item do escopo | Entrega | Dependência externa restante |
|---|---|---|
| 1. Planos/assinatura/faturas/cotas | Versões imutáveis, PILOT migrado, assinatura com estados da 16.2, faturas imutáveis e únicas por período, ciclo/renovação, troca no próximo ciclo, cancelamento ao fim do período, tolerância de 7 dias, cotas no servidor com lock | Preço e política (D07) |
| 2. Cobrança SaaS | Contrato `BillingProvider`, simulador, webhook assinado e deduplicado, inadimplência sem afetar pedidos anteriores | Provedor de recorrência e fiscal (D07) |
| 3. Reembolso pela plataforma | Intenção persistida, saldo serializado, idempotência, consulta antes de repetir, recusa/incerteza visíveis, disputa bloqueia; adaptador MP candidato | Homologação Mercado Pago (Fase 0) |
| 4. Comissão | Mantida **desabilitada** (CHECK `commission_bps=0`) | Decisão de plano com comissão + T30 |
| 5. Cota rigorosa de mídia | Reserva atômica, expiração, conciliação; PILOT mantém tolerância | — |
| 6. Domínio próprio | Ciclo 17.2 completo com prova TXT, roteamento, TLS sob demanda (Caddy), prova HTTPS da loja, canônico/301, remoção e revalidação | `PLATFORM_HOST`, DNS público, HTTPS real (D03) |
| 7. Frete integrado | Interface + simulador, embalagem, validade, invalidação, falha sem frete grátis | Agregador e credenciais (D09) |
| 8. Administração da plataforma | Papel concedido pelo operador, MFA obrigatório, motivo e auditoria; suspensão, planos, alertas, ciclo de cobrança; painel `/plataforma` | Processo fiscal SaaS e políticas (D07/D08) |
| Segurança | **MFA TOTP** para Donos e administradores (pendência da Fase 4) | — |

Decisões: [`docs/decisoes/comercial.md`](../decisoes/comercial.md). Contrato: [`docs/api/comercial.openapi.yaml`](../api/comercial.openapi.yaml). Checklist e deploy/rollback: [`docs/operacao/configuracao-comercial.md`](../operacao/configuracao-comercial.md).

Arquivos principais: migration `0009_commercial.sql`; `packages/purchase/src/{billing,domains,shipping}.ts` e reembolso em `index.ts`; `packages/media` (reserva); `apps/api/src/{mfa,platform,domains}.ts`, `catalogue.ts`, `stores.ts`, `cart.ts`, `purchase.ts`, `operations.ts`; `apps/web/proxy.ts`, `components/commercial.tsx`, `app/plataforma/page.tsx`; `infra/Caddyfile` (validado com `caddy validate`); `scripts/platform-admin.mjs`; testes `tests/commercial.test.mjs`, `tests/commercial-ui.test.mjs`.

## 2. Verificações

| Execução | Resultado |
|---|---|
| `tests/commercial.test.mjs` (iterações locais) | Falhas corrigidas: regex de CEP corrompida no endpoint de transportadora; contagem dupla do original na reserva de mídia (armazenado+reservado passava da cota) — agora reserva só o derivado máximo; asserções do teste ajustadas a corpos de erro em objeto e ao catálogo global de planos |
| `tests/commercial-ui.test.mjs` | Rolagem horizontal no celular com valores longos (chave MFA/TXT) corrigida no CSS |
| `node scripts/capacity.mjs` (T33 sobre o código da Fase 6, 1+30+5 min) | **Aprovado**: 50 878 requisições, 839 pedidos; leitura p95 **165 ms**; checkout p95 **93 ms**; 0% falhas; 0 violações; 1 vencedor entre 20 na última unidade; emissão pelo gateway simulado mediana 1,9 s / p95 4,3 s. Ambiente não equivalente à VM alvo |
| `verify --phase=6` (1ª) | Código 1: regressão real — o teste da fundação convidava uma 3ª pessoa no PILOT (limite da seção 16.1 = 1 Dono + 1 Funcionário). Teste reordenado: expiração testada antes e a 3ª pessoa agora deve receber 409; nenhuma asserção removida |
| `verify --phase=6` (final, 03:06–03:10 UTC, fontes `f209b61e…2e7b`) | **Código 2 — PENDENTE_EXTERNA**. 16/16 etapas técnicas aprovadas: núcleo+operação+instrumentos+comercial 48/48, worker/UI/T27/interface comercial 8/8, Fase 2 12/12, fundação 13/13, pós-backup 1/1, pós-restore 4/4, logs, S3, CLI, backup/restore, PITR. Pendências: observação real da Fase 5 e decisões comerciais/provedores |

Cobertura simulada: MFA (ativação, recuperação, replay, nova sessão); administração (papel só via operador, MFA, motivo, auditoria, suspensão); planos (sem preço não ativa, imutáveis, PILOT protegido); **T29** (contratação, webhook assinado e deduplicado, renovação sem duplicar, falha → PAST_DUE → SUSPENDED bloqueando só vendas novas, pagamento reabre, troca no próximo ciclo, cancelamento); **cotas** (última vaga concorrente, equipe); **T38**; **T18**; **T28/T37**; **T31**; **T33**. T30 não se aplica (sem comissão).

Evidências: [`verification.json`](evidencias/fase-6/verification.json), [`commercial.json`](evidencias/fase-6/commercial.json), [`commercial-ui.json`](evidencias/fase-6/commercial-ui.json), [`capacidade.json`](evidencias/fase-6/capacidade.json), capturas `phase6-{owner,platform}-{390,1440}.png`.

## 3. Pendências (IDs D)

| ID | O que falta | Responsável |
|---|---|---|
| D07 | Preço, recorrência, inadimplência, cancelamento, emissão fiscal da receita SaaS; provedor de cobrança | Produto + financeiro/contabilidade |
| D03 | Domínio da plataforma, DNS/HTTPS; manter Caddy On-Demand ou contratar Cloudflare for SaaS | Responsável + operação |
| D09 | Agregador de frete, credenciais, compra de etiqueta | Produto + desenvolvimento |
| D02/Fase 0 | Homologar devolução por API e pagamentos reais | Titular da conta MP |
| Fase 5 | Observação real do piloto (pré-requisito da Fase 6 pelo plano) | Responsável + lojistas |
| D04 | Backup externo e retenção/compressão de WAL | Operação |

## 4. Próximo passo
Registrar as decisões D03/D07/D09 em `evidencias/fase-6/decisoes-comerciais.json`, homologar os provedores escolhidos substituindo os simuladores pelos adaptadores reais e repetir `node scripts/verify.mjs --phase=6`. Não iniciar a Fase 7.

## Substitutos simulados (02/10/2026)

As dependências externas desta fase foram exercitadas com substitutos locais fictícios. Veja [substitutos-simulados.md](substitutos-simulados.md). Isso **não** encerra as pendências reais listadas acima.
