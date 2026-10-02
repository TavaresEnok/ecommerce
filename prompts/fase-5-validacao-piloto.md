# Fase 5 — observar e ajustar o piloto real

Execute somente a Fase 5. Leia prompts/00-prompt-mestre.md, docs/PLANO-E-VERIFICACAO.md e docs/execucao/fase-4.md. Use docs/especificacao.md v1.1, especialmente 1–2, 12–16, 20–22, 24–28.

## Resultado esperado

Evidência de que duas ou três lojas convidadas conseguem operar o produto, acompanhada de problemas corrigidos, custo observado e decisão fundamentada sobre iniciar a comercialização. Esta fase depende de pessoas e uso real; não pode ser concluída apenas escrevendo código ou gerando dados sintéticos.

## Antes de agir

Confirme no relatório os critérios do piloto e a autorização para ativação. Se faltar autorização/acesso/dados de uso, prepare os instrumentos de observação e instruções de onboarding, relate exatamente o necessário e mantenha PENDENTE_EXTERNA. Não convide pessoas, envie mensagens ou faça compra real sem autorização aplicável.

Se a ativação já estiver autorizada e o ambiente correspondente estiver identificado, execute somente as ações operacionais autorizadas. Não pedir novamente uma permissão já concedida. Preserve dados e mantenha as rotinas de backup/monitoramento.

## Escopo

1. Prepare um roteiro curto de onboarding: identidade da loja, catálogo, frete, conexão com gateway, políticas, venda, expedição e atendimento. Identifique quais passos exigem participação do lojista; não invente aceite, conta ou identidade.
2. Instrumente e registre resultados por loja sem expor dados pessoais: publicação, compra concluída, operações que exigiram suporte, falhas de checkout, incidentes, devoluções, tempo de resolução, recursos consumidos e custo observado.
3. Observe o uso real disponível e converse com lojistas somente se autorizado. Se houver relatos fornecidos pelo responsável, use-os indicando origem e data. Não transformar ausência de reclamação em evidência de sucesso.
4. Corrija bugs e dificuldades que impeçam o fluxo principal, mantendo a stack e o escopo. Priorize isolamento, dinheiro, estoque e perda de dados. Cada correção recebe verificação de regressão pertinente.
5. Revise o procedimento manual de reembolso/atendimento e quem o executa. Se a operação manual gerar atraso incompatível com o serviço, registrar o problema e sua prioridade; não esconder o custo de suporte nem dispensar direitos do consumidor.
6. Execute o ensaio T33 antes de ampliar número de lojas/tráfego, em ambiente equivalente e com integrações externas simuladas para carga. Registre limites da medição; não prometer capacidade de mil lojas com base no tamanho da VM.
7. Produza um relatório de aprendizado: problemas, correções, limitações abertas, custo por loja/pedido quando houver base suficiente, tempo de suporte e proposta para a oferta inicial. Indicadores sem amostra suficiente permanecem inconclusivos.

Não construir novas funcionalidades comerciais, campanhas, ERP ou IA. A fase serve para ajustar a operação existente e decidir o próximo passo com evidência.

## Verificação e entregáveis

Atualize e execute: node scripts/verify.mjs --phase=5. O comando roda regressões pertinentes e confere evidências; não compra, convida, publica ou fabrica observações. Ele deve retornar pendência se faltarem dados reais necessários à conclusão.

Registre demonstrações reais do fluxo T27, ensaios/procedimentos aplicáveis, T33 quando exigido para ampliação e evidências sanitizadas. Em docs/execucao/fase-5.md, declare quais lojas participaram por identificador não sensível, período observado, volume efetivo, incidentes e limitações da amostra. Deixe dados identificáveis em local restrito.

## Ponto de parada

Pare com o relatório e as correções verificadas. Recomende avançar, ajustar ou continuar observação, com motivos concretos. Se ainda não há uso suficiente, mantenha PENDENTE_EXTERNA; não invente prazo, resultado ou faturamento. Não iniciar a Fase 6, criar monitoramento recorrente ou permanecer esperando indefinidamente por vendas futuras.
