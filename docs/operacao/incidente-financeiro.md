# Procedimento — incidente financeiro do piloto

Responsável: Dono da loja (execução no Mercado Pago) com apoio do operador da plataforma. Alertas: `FINANCIAL_INCIDENT_OPEN`, `PAYMENT_UNCERTAIN`, `FINANCIAL_COMMUNICATION_PENDING`.

| Código | Significado | Ação |
|---|---|---|
| REFUND_ACTION_REQUIRED | Há valor recebido a devolver (cancelado, excedente, incompatível, sem estoque) | Devolver no painel do MP |
| EXCESS_PAYMENT | Segunda transação aprovada | Devolver a transação EXCESS; a principal continua paga |
| PAYMENT_VALUE_MISMATCH | Valor/moeda diferente do esperado | Devolver e orientar nova compra |
| PAID_WITHOUT_STOCK | Pago sem saldo | Recompor estoque e “Realocar” **ou** devolver |
| PAYMENT_UNCERTAIN | Gateway sem resposta conclusiva por 60 min | “Solicitar nova consulta”; nunca cobrar de novo |
| PARTIAL_REFUND_REVIEW | Devolução parcial antes do envio | Conferir o que entregar; Dono conclui a revisão |
| GATEWAY_IDENTITY_MISMATCH | Recurso de outro vendedor/ambiente | Investigar; Dono conclui a revisão após análise |

## Passos
1. Painel → Pedidos → filtro “Somente com pendências”. O pedido mostra o valor devido mesmo quando o resumo está PAID.
2. Copiar o **ID externo** da transação indicada.
3. No painel do Mercado Pago (conta da loja), executar a devolução total/parcial dessa transação.
4. Anotar a referência no incidente (“Anotar”). **A anotação não encerra a pendência.**
5. Clicar “Solicitar nova consulta ao gateway”. A conciliação lê a devolução; o incidente fica RESOLVED e o valor devido zera somente com a confirmação.
6. Se após 24 h a devolução não aparecer, verificar saldo da conta no MP e repetir a consulta; manter o alerta aberto.

Proibido: alterar status/valores direto no banco, marcar devolvido por anotação ou iniciar estorno por API (Fase 6).
Ensaio executado: testes T16/T17/T35 (provedor SIMULADO) — ver relatório da Fase 4. Ensaio no sandbox real depende da Fase 0.
