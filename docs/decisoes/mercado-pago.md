# Mercado Pago — decisões da Fase 0 (POC)

Especificação v1.1, seção 14. Estado: **contrato candidato verificado localmente; homologação externa PENDENTE**.

## Família e endpoints
- **Payments v1 / Checkout Transparente**: `POST /v1/payments` (header `X-Idempotency-Key`), `GET /v1/payments/{id}`, `GET /v1/payments/search?external_reference=`, `GET /v1/payments/{id}/refunds`. Orders e Checkout Pro não são misturados.
- **OAuth** por vendedor: `https://auth.mercadopago.com.br/authorization` (`client_id`, `response_type=code`, `platform_id=mp`, `state`, `redirect_uri`, `code_challenge`/`S256`) e `POST https://api.mercadopago.com/oauth/token` (`authorization_code` com `code_verifier`; `refresh_token`). Resposta: `access_token`, `refresh_token`, `user_id`, `expires_in`, `public_key`, `live_mode`. Fonte: documentação OAuth do Mercado Pago (consulta de 01/10/2026; validade do token informada: 180 dias).
- **Webhook**: `x-signature: ts=<ts>,v1=<hmac>`; HMAC-SHA256 com a assinatura secreta da aplicação sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (valores ausentes omitidos, id alfanumérico em minúsculas). Resposta 200/201 em até 22 s; reenvio a cada 15 min. A documentação de Bricks consultada não publica o manifesto literal; o formato veio do validador oficial do SDK e de integrações públicas — **confirmar no ambiente de teste**.
- SDK: não usado na POC (fetch nativo) para manter o projeto sem dependências; o contrato é o mesmo do `mercadopago` Node SDK (`PaymentCreateRequest`).

## Regras do adaptador (contrato para a Fase 3)
1. Tentativa tem chave idempotente estável `poc-<attempt>`; `external_reference = attempt.id`. Antes de qualquer reenvio após timeout, consulta por referência; reenvio usa a mesma chave.
2. Fato autoritativo só por GET com o token do vendedor correto; conferir `collector_id`, `live_mode`, `external_reference`, `transaction_amount` e `currency_id`. Incompatível → incidente, nunca confirmação.
3. Valores em centavos inteiros; JSON do provedor parseado com campos monetários como string; corpo enviado com o decimal derivado dos centavos.
4. Pix com `date_of_expiration` (30 min padrão do produto; limites a confirmar no teste). Cartão só por `token` do Brick.
5. Tokens OAuth cifrados (AES-256-GCM, AAD vendedor/ambiente); renovação a 7 dias do vencimento; revogação bloqueia novas cobranças e mantém leitura de pagamentos anteriores (a confirmar se o token revogado ainda permite leitura — se não, resolução no painel).
6. Comissão (`application_fee`) **DESABILITADA** até T30. Devolução: somente leitura no piloto.

## Matriz capacidade × método × ambiente × evidência

| Capacidade | Método | Simulado (local) | Sandbox MP | Produção |
|---|---|---|---|---|
| OAuth 2 vendedores, state/PKCE, cifra, renovação, revogação | — | Aprovado (teste) | PENDENTE | Não autorizado |
| Criação com valor/referência/idempotência | Pix | Aprovado | PENDENTE | Não autorizado |
| Criação via token (sem PAN/CVV) | Cartão | Aprovado | PENDENTE (Brick) | Não autorizado |
| Timeout após criação → consulta, sem duplicar | Pix | Aprovado | PENDENTE | — |
| Webhook assinado, repetido, fora de ordem, inválido | — | Aprovado | PENDENTE | — |
| Vendedor/valor incompatível → incidente | — | Aprovado | PENDENTE | — |
| Persistência após reinício (inbox/tentativas) | — | Aprovado (SQLite) | — | — |
| Leitura de devolução parcial/total | Cartão | Aprovado | PENDENTE (painel) | — |
| Vencimento do Pix observado | Pix | Não testado | PENDENTE | — |
| Comissão/split | — | DESABILITADA | Não testada | — |

Núcleo do piloto **não homologado**; comissão **desabilitada**.
