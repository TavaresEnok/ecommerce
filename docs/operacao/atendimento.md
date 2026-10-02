# Procedimento — atendimento ao consumidor (seção 22.5)

Responsável: equipe da loja (Funcionário ou Dono). Decisões com efeito financeiro: Dono. Cobertura do responsável deve ser definida antes da ativação (D08).

## Entrada
- Consumidor com pedido: página do pedido (mesmo navegador ou link do e-mail) → “Abrir solicitação” (atendimento, cancelamento, arrependimento, acesso ou eliminação de dados). Protocolo e horário aparecem na hora; e-mail de confirmação é enfileirado.
- Sem pedido: `/lojas/{loja}/atendimento` → protocolo + código de acompanhamento (exibido uma vez).
- Falha de e-mail não apaga nem altera o protocolo; o horário original permanece.

## Rotina diária (painel → Atendimento)
1. Filtrar **Abertos** e **Atrasados**. Prazo: 5 dias corridos da abertura.
2. “Assumir” o protocolo; responder pelo formulário (o consumidor recebe e-mail e vê no pedido).
3. **Arrependimento/cancelamento com pagamento confirmado** (marcado “comunicação financeira pendente”):
   1. Dono abre o Mercado Pago e comunica/solicita a devolução da transação indicada no pedido **no mesmo dia**.
   2. Registra a referência em “Registrar comunicação” (data/hora, protocolo do MP).
   3. Se o pedido ainda não foi enviado: cancelar o pedido em Pedidos (gera pendência de devolução). Se já foi enviado: combinar devolução física; registrar “devolução física” quando o produto chegar.
   4. Concluir o protocolo como “Aceito”. A devolução só aparece como confirmada quando o gateway informar (ver incidente financeiro).
4. Recusa precisa de justificativa compreensível; desistência do consumidor deve estar escrita no protocolo.
5. Solicitações de dados: exportar dados do comprador (Pedidos → Privacidade) e enviar pelo canal acordado; eliminação só após encerramento do pedido e sem pendências (retenção justificada).

## Não fazer
- Não prometer devolução antes da confirmação do gateway.
- Não bloquear arrependimento por prazo quando a data de recebimento for desconhecida.
- Não editar banco para mudar status de protocolo.
