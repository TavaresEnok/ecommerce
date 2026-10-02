# Fase 3 — compra, estoque e pagamentos confiáveis

Execute somente a Fase 3. Leia prompts/00-prompt-mestre.md, docs/PLANO-E-VERIFICACAO.md e os relatórios das Fases 0 e 2. Use docs/especificacao.md v1.1, especialmente 4–5, 9–15, 18–19, 22.5, 24.1 e 25–28.

## Resultado esperado

Um comprador conclui checkout, obtém pedido e pagamento; a aplicação reconhece o resultado financeiro correto, preserva snapshots e controla estoque sob concorrência. Falhas e casos raros são registrados e recuperáveis.

## Escopo

1. Incorpore o contrato de pagamento comprovado na POC. Reutilize apenas código revisado compatível com os módulos do produto; não copiar credenciais, banco ou dependências experimentais indiscriminadamente. Se a homologação estiver pendente, desenvolva contra contrato explícito e simulações, mantendo o resultado externo pendente.
2. Implemente checkout idempotente por intenção/carrinho, conferência de preço/frete e transação única de pedido, número comercial, snapshots, reservas e outbox. Nenhuma chamada ao gateway fica dentro de lock/transação de estoque.
3. Implemente reserva integral, confirmação, expiração, ajuste e realocação conforme seção 12. Requisições concorrentes pela última unidade não podem vender saldo negativo. Pagamento real é registrado mesmo quando a realocação falha.
4. Implemente estados separados de pedido, pagamento, entrega, disputa e incidentes. Não iniciar expedição nesta fase; entregue a base e consulta suficiente para verificar os estados.
5. Integre conta OAuth, Pix/cartão, chaves estáveis, consulta após timeout, inbox durável, validação de webhook, deduplicação e conciliação periódica. Valide vendedor, ambiente, valor e moeda. Retorno do navegador não é comprovação financeira.
6. Preserve todas as transações aprovadas. Em duplicidade, pedido cancelado ou falta de estoque, abra incidente, bloqueie entrega e prepare a pendência operacional. **No piloto, a devolução é feita no painel do gateway**; aqui implemente leitura, correlação e confirmação externa, sem iniciação automática de reembolso.
7. Implemente outbox atômica, consumo repetível, tratamento de falha e reconstrução de pendências após perda do Redis. Não confundir “publicado” com “executado”.
8. Entregue revisão dos dados antes da confirmação, correção de erros, comprovante conservável e acesso seguro ao pedido. Inclua protocolo durável para solicitações do consumidor e confirmação em tela; a interface de atendimento/notificações completa será concluída na Fase 4.

Não implementar assinatura SaaS, comissão comercial, API de reembolso, frete externo, promoções ou expansão. A POC pode comprovar comissão, mas ela permanece desabilitada no piloto.

## Verificação e entregáveis

Atualize e execute: node scripts/verify.mjs --phase=3.

Cubra T03–T17, T19–T21 e T24; o núcleo de T35; e protocolo/confirmação de T36. Excluir T18 desta entrega, pois ele testa iniciação de reembolso comercial. Use PostgreSQL real nos testes transacionais. Inclua crash entre commit e publicação, recebimento tardio/duplo, expiração concorrente, valor incorreto e recuperação de tentativa UNKNOWN.

Separe testes simulados dos resultados externos do gateway. Para ainda não habilitar piloto real, registre o que falta em operação/notificações/atendimento. Entregue migrations, contratos OpenAPI, testes, procedimento de verificar um pedido e docs/execucao/fase-3.md.

## Ponto de parada

Pare após implementar/verificar o núcleo de compra e documentar pendências. O resultado pode estar tecnicamente demonstrado com homologação externa ainda pendente; informe isso sem marcar a fase concluída. Não ativar lojas reais nem iniciar a Fase 4 automaticamente.
