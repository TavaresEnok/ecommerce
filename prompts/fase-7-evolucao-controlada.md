# Fase 7 — primeira evolução opcional: descrição com IA

Execute somente a Fase 7, limitada à melhoria descrita aqui. Leia prompts/00-prompt-mestre.md, docs/PLANO-E-VERIFICACAO.md e os relatórios das Fases 5 e 6. Use docs/especificacao.md v1.1, especialmente 6, 9, 15–16, 23, 24.1 e 25–28.

## Resultado esperado

O lojista gera um rascunho de descrição de produto, revisa e decide se quer salvá-lo. O recurso tem custo limitado por loja e pela plataforma, e não interfere na compra. Esta fase é opcional: não é condição para lançar ou cobrar pelo SaaS.

## Condição de entrada

Confirme demanda registrada no piloto e decisão D11 sobre provedor, modelo e orçamento. Se o responsável ainda não priorizou essa melhoria, registre-a como proposta e não a implemente por mera antecipação. Se a melhoria já foi escolhida, mas faltar credencial, conclua o trabalho local independente e relate a homologação pendente.

Se o usuário explicitamente selecionar outra melhoria nesta execução, não acumule as duas. Registre o novo escopo e seus critérios antes de implementar, preservando uma única entrega delimitada. Não interpretar este prompt como autorização para construir toda a lista de evolução.

## Escopo da descrição com IA

1. Crie um serviço transversal pequeno com um provedor homologado e contrato substituível. Consulte documentação atual de uso, autenticação, limites e preços do fornecedor antes de fixar estimativa de custo. Não implementar vários provedores sem necessidade.
2. Defina entrada limitada a dados do produto autorizados. Não enviar dados de compradores, pedidos, documentos pessoais ou segredos. Conteúdo do produto é dado, não instrução para ferramentas ou execução de código.
3. Reserve orçamento máximo estimado antes da chamada, aplique limites por operação/loja/globais e reconcilie consumo após o resultado. Proteja chamadas concorrentes, retry, timeout e estado desconhecido para evitar gasto duplicado ou ilimitado.
4. Entregue ação de gerar rascunho, estado de processamento, erro recuperável, comparação/revisão e salvamento explícito pelo lojista. A geração não publica o produto automaticamente nem sobrescreve edição mais recente sem tratar conflito.
5. Registre modelo, operação, consumo, custo estimado/confirmado e referência da política de preço sem copiar dados sensíveis aos logs. Conteúdo gerado usa as mesmas regras de sanitização e limites do catálogo.
6. Implemente desligamento por loja/global. Falha do provedor, falta de orçamento ou suspensão desse recurso preserva cadastro manual, checkout, pagamentos e pedidos.

Não construir atendimento autônomo, recomendações, múltiplos modelos, marketing ou ações que alterem preço/estoque usando saída de IA.

## Verificação e entregáveis

Atualize e execute: node scripts/verify.mjs --phase=7. Cubra T34, autorização, edição concorrente, sanitização, orçamento sob concorrência e comportamento sem provedor. Reexecute as regressões de catálogo/cotas afetadas e comprove que a compra continua funcionando com o recurso desligado.

Simulações podem comprovar reserva/reconciliação de custo, mas não uso real do fornecedor. Chamadas pagas só ocorrem com autorização/orçamento aplicáveis, fora do verificador automático padrão. Registre evidências separadas em docs/execucao/fase-7.md, incluindo se há demanda confirmada e quais limites foram adotados.

## Ponto de parada

Pare após entregar uma melhoria verificada ou preparar o que é independente da pendência externa. Não avançar para outra integração nem habilitar recurso pago para todos os lojistas automaticamente. O relatório deve permitir decidir sua liberação e o próximo item de evolução com dados de uso.
