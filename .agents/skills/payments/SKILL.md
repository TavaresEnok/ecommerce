---
name: payments
description: "Tratamento de pagamentos, idempotência, webhooks e conciliação"
---

# Payments & Gateway Integration

## Regras Críticas
1. **Idempotência:** Chave de idempotência única salva no banco para cada tentativa de cobrança e requisição de webhook.
2. **Status UNKNOWN:** O status `UNKNOWN` (timeout de rede, erro 504 no gateway) **NÃO** é falha (`FAILED`). Nunca tente cobrar novamente automaticamente sem consultar o gateway.
3. **Webhooks:** Não confie unicamente na notificação push do webhook. Sempre verifique a assinatura e consulte ativamente a API do gateway para confirmar a liquidação.
4. **Padrão Outbox:** Notificações de mudança de status financeiro devem passar por tabela Outbox transacional.
5. **Casos de Borda:** Lógica defensiva para:
   - Pagamento tardio (cliente paga boleto/pix após cancelamento do pedido).
   - Pagamento em excesso / duplicado.
   - Estorno parcial e estorno total.
