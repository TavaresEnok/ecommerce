# Piloto operável — decisões da Fase 4

Referência: especificação v1.1, Fase 4. Decisões locais e reversíveis; nenhuma altera contrato comercial.

## Expedição
- Um envio por pedido (`shipments` com UNIQUE por pedido). Separação, envio, retirada pronta e retirada comprovada revalidam no backend: pedido OPEN, principal PAID, disputa NONE/WON, nenhuma pendência aberta (exceto `GATEWAY_UNAVAILABLE`), nenhuma solicitação de cancelamento/arrependimento aberta e reserva já consumida.
- Funcionário opera expedição (seção 5). Devolução física marca RETURNED e **não** repõe estoque; reposição é ajuste auditado separado.
- Retirada exige comprovação textual (quem retirou/documento conferido) e leva a DELIVERED/COMPLETED sem transportadora.

## Atendimento (22.5)
- `consumer_requests` virou o protocolo único: vinculado a pedido (acesso pelo cookie do carrinho ou link do e-mail) ou contato geral (código de acompanhamento exibido uma vez, armazenado como hash). Horário original imutável; mensagens append-only; prazo padrão de 5 dias.
- Funcionário responde e conclui protocolos; **aceitar** cancelamento/arrependimento é exclusivo do Dono e exige registro prévio da comunicação ao meio de pagamento quando há pagamento principal. Essa comunicação é registro do ato feito no Mercado Pago, não confirmação de devolução.
- Concluir como recusado/desistência remove o bloqueio de expedição criado pela solicitação.

## Notificações
- Mensagens são inseridas em `notifications` na mesma transação do fato (pedido, pagamento, envio, protocolo). O worker entrega com retentativa exponencial; após 6 falhas fica FAILED e o Dono reenvia.
- Provedor externo **não homologado (D05)**. `MAIL_PROVIDER=local` (somente development/test) registra como SIMULATED sem envio. Sem provedor, mensagens ficam PENDING e geram alerta de backlog; nunca são descartadas.
- Link do e-mail leva um segredo de 256 bits no **fragmento** (`#acesso=`), que não chega ao servidor, logs nem Referer; armazenado como hash, validade de 90 dias, revogável pelo Dono e na eliminação.

## Suspensão e pausa
- Pausa de vendas pelo Dono (`sales_paused_at`) e suspensão pelo operador (`scripts/ops.mjs suspend`) bloqueiam checkout e novas tentativas. Pedidos, conciliação, devoluções, expedição de pedidos pagos e atendimento continuam. Toda mudança gera `tenant_lifecycle_events`.
- Não existe ainda papel de administrador da plataforma com MFA (seção 5); a suspensão é operação de host via CLI. MFA é pré-requisito para pagamento real.

## Privacidade
- Exportações: Dono, link interno de 15 min com segredo em cabeçalho, registro em `data_exports`.
- Eliminação: Dono, somente pedidos encerrados sem pendência/disputa aberta (retenção justificada). Anonimiza comprador, endereços, mensagens do consumidor, e-mails e revoga links; preserva fatos financeiros. Grava primeiro um ledger sem dados pessoais no S3 (`privacy-ledger/`) e reaplica após restauração (`scripts/ops.mjs reapply-erasures`).

## Recuperação
- PostgreSQL arquiva WAL (`archive_timeout=60`) em volume local; ensaio PITR automatizado (`scripts/pitr-drill.mjs`). Destino externo cifrado e ferramenta mantida (pgBackRest/WAL-G) ficam para D04.
- Pós-restauração: `scripts/ops.mjs post-restore` pausa vendas, converte PREPARED em UNKNOWN (consulta antes de cobrar), retém e-mails pendentes como HELD e agenda consulta de todas as tentativas.

## Alertas
- Worker calcula status por loja a cada 60 s e emite `{"event":"alert"}` em log estruturado; painel “Operação” e `scripts/ops.mjs status` mostram os mesmos códigos. Encaminhamento a canal externo (e-mail/telefone do responsável) depende de D05/D06.
