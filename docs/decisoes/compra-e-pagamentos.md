# Compra e pagamentos — contrato candidato v1

Referência: especificação v1.1, Fase 3. Não há POC da Fase 0. Este contrato é candidato, não homologação do Mercado Pago.

- Família candidata: Payments v1 / Checkout Transparente; nunca Orders nem Checkout Pro. Pix e cartão reais ficam desligados até POC de duas contas OAuth. Comissão sempre zero nesta fase.
- Interface normalizada: criar com chave estável de tentativa, consultar por referência, obter transação autoritativa e ler devoluções/disputas. UNKNOWN não autoriza uma nova cobrança.
- Simulação persistida em PostgreSQL representa o provedor, separada do ledger de negócio. Disponível apenas em development/test com configuração explícita. Não movimenta dinheiro e não é sandbox.
- Valor em centavos BIGINT/BigInt e strings decimais no HTTP. BRL explícito. A API candidata deve serializar a quantia decimal sem passar por float; respostas não podem confiar em conversão Number.
- Conta/environment/referência/valor/moeda são conferidos antes de escolher principal. Recebimentos incompatíveis da conta correta são preservados e bloqueiam entrega.
- Reserva 40min, Pix 30min, margem 5min, retenção sob incerteza 60min desde origem. Consultar antes de liberar; atraso de emissão renova atomicamente somente até limite. Sem gateway I/O nos locks.
- Worker de pagamentos independente; PostgreSQL é fonte de pendências, BullMQ é transporte. Publicação não significa execução. Descoberta por função SECURITY DEFINER limitada a identificadores de roteamento, sem exceção RLS nas tabelas de negócio.
- Credenciais AES-256-GCM com AAD tenant/account. Nenhum PAN/CVV, credencial ou token em job/log/evento. OAuth real e tokenização requerem POC; nenhuma variável permite habilitar produção nesta entrega.
- Documentação consultada via Context7: /mercadopago/sdk-nodejs (PaymentCreateRequest, get/search), /taskforcesh/bullmq (jobId, retry/idempotência), /nestjs/docs.nestjs.com (Fastify guards/request/reply). Consulta de documentação não comprova conta, assinatura, expiração ou condições comerciais.
- Reembolsos apenas leitura/correlação. Referência anotada pelo dono não confirma devolução. Não há endpoint que inicie estorno externo.

## Complementos da execução da Fase 3 (2026-10-01)

- Tentativa UNKNOWN sem `external_id` e com reserva ativa é reenviada **somente com a mesma chave idempotente**; antes disso sempre há consulta por referência. Se a consulta encontra o recurso, não há nova criação.
- Expiração confirmada pelo gateway (todas as tentativas encerradas e consultadas há < 2 min) libera a reserva e marca `CANCELLED/UNPAID`. Sem essa confirmação, a reserva só é liberada após 60 min, com `PAYMENT_UNCERTAIN`, sem declarar “não pago”.
- Nova tentativa do comprador só existe quando todas as anteriores estão REJECTED/CANCELLED/EXPIRED, pedido OPEN sem principal e reserva ativa. PENDING/UNKNOWN bloqueiam (cancelamento ativo no gateway depende da homologação). Chave idempotente própria.
- Correção de endereço é append-only (`order_address_corrections`), restrita ao Dono, antes do envio; o endereço original permanece no pedido.
- Outbox: falha que esgota as tentativas do BullMQ incrementa `failures` com espera exponencial no PostgreSQL; após 5 falhas o evento fica visível e o Dono pode reprocessar.
- Resposta ao comprador omite histórico, notas internas, IDs de provedor e transação principal.
- Índices parciais de pendências (attempts/outbox/inbox/incidentes abertos) registrados com EXPLAIN ANALYZE como app_user em fixture pequena; não é ensaio de capacidade.
