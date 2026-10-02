# Fase 0 — validar Mercado Pago

- **Especificação:** v1.1, seções 3, 11–15, 24.1, 26–28; prompt `prompts/fase-0-validacao-pagamentos.md`.
- **Estado:** **PENDENTE_EXTERNA**. POC, testes locais e roteiro prontos. Em 02/10/2026 o responsável forneceu access token e public key de uma **conta de vendedor de teste** (guardados só em `experiments/mercado-pago/.env`, fora do Git; recomendada a troca, pois foram colados no chat).
- **Liberação operacional:** NÃO_SOLICITADA. Nenhuma transação real ou de teste no gateway foi executada.
- **Data:** 01/10/2026. Host Windows, Node 25.0.0 (requisito ≥ 24).
- **Observação:** esta fase foi executada **depois** das Fases 1–4 (que a registravam como inexistente). O núcleo do produto usa o contrato candidato equivalente com provedor SIMULADO; a substituição só ocorre após a homologação abaixo.

## Entregue
- `experiments/mercado-pago/` isolado (sem dependências; SQLite próprio): `src/client.ts` (Payments v1 + OAuth/PKCE), `src/service.ts` (vendedores, tentativas, inbox durável, conciliação), `src/primitives.ts` (dinheiro, cifra, assinatura do webhook), `src/server.ts` (servidor de homologação SANDBOX), `test/` (gateway simulado + 7 testes), `verify.mjs`, `README.md`, `.env.example`.
- Decisões e matriz: [`docs/decisoes/mercado-pago.md`](../decisoes/mercado-pago.md). O `.dockerignore` do produto exclui `experiments/`.

## Verificação

| Comando | Resultado |
|---|---|
| `node --test test/poc.test.ts` | 7/7 aprovados (SIMULADO): dinheiro sem float; manifesto/assinatura/janela do webhook; OAuth de 2 vendedores com state único, PKCE, tokens cifrados, renovação, revogação e conta trocada recusada; Pix e cartão por vendedor sem `application_fee` e sem PAN; timeout após criação e falha antes do provedor com uma única cobrança após reinício; inbox deduplicada, fora de ordem, assinatura forjada, vendedor e valor incompatíveis; devolução parcial/total lida duas vezes |
| `node experiments/mercado-pago/verify.mjs` | **Código 2 — PENDENTE_EXTERNA** (testes locais aprovados; `evidence/external.json` ausente) |

## Homologação no sandbox (02/10/2026)
Script `experiments/mercado-pago/src/homologate.ts` (recusa rodar se `/users/me` não marcar `test_user`; não imprime credenciais). Resultado registrado em `evidence/external.json`:
- **Conta de teste confirmada** (vendedor MLB, `test_user`).
- **Criação de pagamento recusada pelo gateway:** `401 Unauthorized use of live credentials` — com credenciais de vendedor de teste o comprador também precisa ser um **comprador de teste** do painel; o e-mail fictício usado não é aceito. Nada foi cobrado. Pix, cartão, idempotência, consulta e devoluções por API ficam prontos no script e serão executados assim que houver o e-mail do comprador de teste.

## Pendências (acesso exato)
| O que falta | Responsável |
|---|---|
| **E-mail de um comprador de teste** (painel → Contas de teste) para executar Pix/cartão/devolução com o token já fornecido | Titular da conta |
| Client ID/Client Secret da aplicação e um 2º vendedor de teste (OAuth de dois vendedores) | Titular da conta |
| URL HTTPS pública (túnel) para OAuth e webhook; assinatura secreta do webhook | Operação |
| Executar o roteiro do README (OAuth ×2, Pix, cartão via Brick, timeout/consulta, devolução parcial/total no painel, revogação) e rodar `verify.mjs` | Desenvolvimento + titular |
| Confirmar: manifesto da assinatura, limites de `date_of_expiration`, leitura com token revogado | Desenvolvimento |
| Split/comissão (T30) | Fase 6, se houver plano com comissão |

## Próximo passo
Com as credenciais de teste configuradas no `.env` da POC (fora do Git), executar o roteiro e repetir `node experiments/mercado-pago/verify.mjs` até código 0; então trocar o `SimulatedGateway` do produto pelo adaptador homologado (Fase 3).

## Substitutos simulados (02/10/2026)

As dependências externas desta fase foram exercitadas com substitutos locais fictícios. Veja [substitutos-simulados.md](substitutos-simulados.md). Isso **não** encerra as pendências reais listadas acima.
