# Fase 4 — preparar o piloto para operação

Execute somente a Fase 4. Leia prompts/00-prompt-mestre.md, docs/PLANO-E-VERIFICACAO.md e docs/execucao/fase-3.md. Use docs/especificacao.md v1.1, especialmente 5, 8, 10, 12–15, 17, 19–22, 24–28.

## Resultado esperado

O lojista consegue operar pedidos, entrega/retirada, atendimento e incidentes por interfaces e procedimentos definidos. O responsável consegue monitorar, suspender novas vendas, exportar dados e restaurar/conciliar a operação. O piloto fica pronto para ativação explícita, sem exigir edição manual de banco.

## Escopo

1. Conclua o painel de pedidos: filtros, estados, valores, histórico, recebimentos, incidentes e permissões. Excedente ou reembolso pendente deve aparecer claramente, mesmo se o resumo do pedido estiver PAID.
2. Implemente separação, envio único, rastreio manual e retirada comprovada. Revalide pagamento, cancelamento e impedimentos no backend antes de permitir entrega. Devolução financeira não repõe estoque automaticamente.
3. Conclua atendimento ao consumidor da seção 22.5: acesso seguro, contato geral ou vinculado a pedido, protocolo, confirmação, acompanhamento, responsável, prazos, alertas e registro de resolução. Preserve data original mesmo se a notificação falhar. Verifique perfil público do fornecedor, revisão da compra e comprovante conservável. Ensaie a comunicação financeira imediata aplicável, registrando data/referência e responsável; não confundir o alerta interno com comunicação ao agente financeiro. Não substituir esse fluxo por link sem acompanhamento.
4. Crie notificações transacionais com provedor externo homologado, remetente verificado e tratamento de falhas. Em testes, use remetentes/destinatários autorizados; registre simulações separadamente. E-mail indisponível não deve apagar pedido nem protocolo.
5. Entregue o fluxo operacional manual de incidentes financeiros: identificar transação, orientar dono a agir no Mercado Pago, registrar referência e solicitar nova consulta. Apenas confirmação externa pode marcar o estorno. Proíba intervenção direta no banco como procedimento normal.
6. Implemente suspensão de loja e bloqueio de novas compras, preservando tratamento de pedidos/reembolsos anteriores. Conclua exportação privada, solicitações de dados e anonimização conforme a política validada.
7. Configure logs/alertas úteis, health checks, limites, volumes e operação do worker. Verifique domínio da plataforma e HTTPS. Tunnel é opcional conforme necessidade de acesso externo; não habilite domínios de clientes sem o ciclo próprio.
8. Conclua backup externo, procedimento de restauração e conciliação posterior. O procedimento pode ser manual: prepare roteiro, execute em ambiente isolado, meça RPO/RTO e documente conferências. Não exigir automação completa, nem afirmar que um roteiro não executado foi testado.

Não implementar cobrança SaaS, iniciação de reembolso, cota rigorosa comercial, marketplace de temas ou novas integrações. Corrija os problemas da operação atual antes de ampliar escopo.

## Verificação e entregáveis

Atualize e execute: node scripts/verify.mjs --phase=4.

Conclua todos os critérios do piloto: T01–T17, T19–T27, T32 e T35–T37. T18 e T38 ficam para a Fase 6. Execute T26/T32/T35/T36 como combinação de testes e ensaios manuais quando cabível, registrando evidência. Valide o fluxo integral T27 em duas lojas e verifique a interface em uso móvel/desktop.

Entregue procedimentos de atendimento, incidente financeiro, suspensão, deploy/rollback e restauração; relacionamentos de responsáveis e alertas; configuração sem segredos; e docs/execucao/fase-4.md. Use dados sintéticos nos materiais versionados.

## Ponto de parada

Informe se os critérios da seção 26.1 foram atendidos e se a liberação operacional foi autorizada. Sem contas, domínio, e-mail, backup externo ou decisão necessária, conclua preparação independente e marque a evidência faltante. A fase técnica não autoriza convidar lojistas, publicar produção ou receber pagamento real automaticamente. Pare antes de iniciar a Fase 5.
