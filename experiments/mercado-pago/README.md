# POC Mercado Pago — Fase 0

Projeto isolado (sem dependências, sem banco do produto, sem lockfile do produto). Node ≥ 24 (TypeScript nativo e `node:sqlite`).

- Família: **Payments v1 / Checkout Transparente** (`/v1/payments`), OAuth por vendedor (`/oauth/token`, PKCE S256). Não usa Orders nem Checkout Pro.
- Cartão: somente `token` gerado no navegador pelo Card Payment Brick/SDK JS oficial; o servidor recusa PAN/CVV.
- Comissão (`application_fee`): **DESABILITADA** — o construtor rejeita habilitar.
- Devolução: somente **leitura** (`/v1/payments/{id}` e `/refunds`); a POC não inicia estorno.

## Verificar

```sh
node experiments/mercado-pago/verify.mjs
```

Código 0: testes locais + evidência externa completa. Código 2: falta evidência externa (estado atual). Código 1: falha. Os testes usam `test/fake-gateway.ts` — **simulação**, não sandbox.

## Homologação manual (ambiente de TESTE do Mercado Pago)

Pré-requisitos (titular da conta): aplicação no painel de desenvolvedores, duas contas de **vendedor de teste** e uma de **comprador de teste**, URL HTTPS pública (túnel) cadastrada como redirect e webhook (`/webhooks/mercadopago`, tópico Pagamentos) e a assinatura secreta do webhook.

1. Copie `.env.example` para `.env` e preencha fora do Git. `POC_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. `node --env-file=.env src/server.ts` e exponha a porta pelo túnel.
3. Conecte os dois vendedores: abra `https://SEU-TUNEL/oauth/start?seller=loja-a` (e `loja-b`) logado como cada vendedor de teste.
4. Pix: `curl -X POST 127.0.0.1:8787/charge -d '{"seller":"loja-a","method":"PIX","amount_cents":"100","payer_email":"<comprador de teste>"}'`; pague com o comprador de teste; aguarde o webhook.
5. Cartão: gere `card_token` com o Card Payment Brick (chave pública da conta do vendedor) e chame `/charge` com `method:"CARD"`, `card_token`, `payment_method_id`.
6. Timeout/consulta: `/recover` com o `attempt` — consulta por `external_reference`.
7. Devolução: faça devolução parcial e depois total **no painel do vendedor de teste**; chame `/recover` e confirme `refunded_cents`.
8. Revogação: desconecte a aplicação na conta do vendedor e chame `/revoke`; nova cobrança deve ser recusada.
9. Rode `verify.mjs`. `evidence/external.json` guarda capacidade, método, ambiente, data e IDs do provedor — sem tokens nem dados do comprador.

Não executar transações reais. Produção exige autorização específica e não é suportada por esta POC (`MP_ENVIRONMENT=SANDBOX`).
