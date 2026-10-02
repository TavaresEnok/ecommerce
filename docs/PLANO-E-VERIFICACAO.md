# Plano e verificação — v1.1

Este documento organiza execução e evidência; os requisitos do produto estão em especificacao.md. Na entrega deste pacote, **todas as fases estão NÃO_INICIADAS**. Arquivos de prompt não são evidência de implementação.

## Dependências e comandos

| Fase | Depende de | Comando a implementar e executar | Evidência principal |
|---|---|---|---|
| 0 | Especificação; contas apenas para homologação externa | node experiments/mercado-pago/verify.mjs | Matriz de capacidades, testes locais e resultados do gateway separados |
| 1 | Especificação e ambiente de desenvolvimento | node scripts/verify.mjs --phase=1 | Build, migrations, isolamento, acesso e restauração local inicial |
| 2 | Fundação técnica funcionando | node scripts/verify.mjs --phase=2 | Catálogo/vitrine de duas lojas, mídia, SEO e frete local |
| 3 | Fase 2; contrato de pagamento derivado da Fase 0 | node scripts/verify.mjs --phase=3 | Concorrência, idempotência, recebimentos e incidentes |
| 4 | Fase 3 | node scripts/verify.mjs --phase=4 | Todos os critérios do piloto, operação e ensaios manuais |
| 5 | Fase 4 e autorização/acesso para piloto real | node scripts/verify.mjs --phase=5 | Observações reais, falhas, suporte, custo e decisão de avanço |
| 6 | Evidência suficiente da Fase 5 e decisões comerciais | node scripts/verify.mjs --phase=6 | Cobrança SaaS, reembolso integrado, domínio, frete e cotas |
| 7 | Base comercial estável e demanda/orçamento para a melhoria | node scripts/verify.mjs --phase=7 | Uma melhoria opcional validada; inicialmente descrição com IA |

Na Fase 0, a POC e seu verificador são independentes do package.json/lockfile do produto. A Fase 1 cria o verificador principal e cada fase seguinte adiciona somente o necessário. Se a POC já existir, o verificador principal pode chamá-la sem recriar sua implementação.

Os comandos acima são um contrato futuro. Não há runner pronto neste pacote documental. Não executar comandos inexistentes como se uma falha de arquivo ausente fosse teste de negócio.

## Comportamento do verificador

- Um comando reúne build/checagem de tipos/testes pertinentes e verifica a presença e validade básica das evidências exigidas da fase. Preservar testes essenciais de fases anteriores afetadas pela mudança.
- Executar em ambiente de teste identificado. Jamais limpar banco, volume ou storage real para preparar teste. Testes de concorrência/RLS usam banco real com migrations reais e papel da aplicação.
- Código de saída 0: verificações requeridas executadas sem falha e evidências obrigatórias da fase registradas. Código 1: falha demonstrada. Código 2: pré-requisito/evidência obrigatória ausente. Separar esses resultados no relatório.
- Uma aprovação técnica parcial é útil e deve ser registrada mesmo quando o resultado geral for pendente por dependência externa. A Fase 1 não depende da homologação do Mercado Pago.
- Evidência manual contém data, ambiente, procedimento, responsável e referência do resultado, sem segredos/dados pessoais desnecessários. O runner pode verificar sua presença e vínculo à versão testada; não pode inventar que alguém executou o procedimento.
- Não considerar um teste ignorado, uma simulação ou um documento de roteiro como comprovação externa. Qualquer dispensa precisa de justificativa e decisão humana registrada; critérios essenciais não são silenciosamente removidos.
- O verificador não faz compra/reembolso real, publicação, contratação ou convite como efeito colateral. Essas ações ocorrem em rotina separada, conforme autorização, e seus resultados alimentam o relatório.
- Não é necessário criar uma plataforma de testes genérica. Um runner Node pequeno que compõe ferramentas existentes e produz resumo é suficiente.

## Estados de execução

| Estado | Significado |
|---|---|
| NÃO_INICIADA | Nenhuma implementação desta fase registrada |
| EM_ANDAMENTO | Trabalho necessário ainda pode prosseguir |
| PENDENTE_EXTERNA | Parte local preparada/verificada; faltam acesso, decisão ou evidência externa que impede concluir a fase |
| CONCLUÍDA | Entregáveis e critérios da fase satisfeitos com evidência |

Relatar separadamente **liberação operacional**: NÃO_SOLICITADA, PENDENTE ou AUTORIZADA, com referência da autorização quando houver. Concluir código não publica produção automaticamente. A Fase 4 pode entregar a preparação completa do piloto e registrar autorização de ativação ainda pendente; a Fase 5 exige essa autorização e observação real.

## Distribuição de testes

| Fase | Critérios relevantes |
|---|---|
| 0 | Casos da seção 14.1; contratos e testes isolados que depois apoiarão T11–T19/T35; não declarar testes integrados concluídos ainda |
| 1 | T01–T02 em recursos mínimos reais; verificação estrutural de FK/RLS; autenticação/permissões entregues; ensaio de backup inicial |
| 2 | T03 em relações já existentes; T22, T23 e T37; perfil da loja/parte de T36; repetir T01–T02 |
| 3 | T03–T17, T19–T21 e T24; núcleo financeiro de T35; protocolo e confirmação de T36; excluir T18 desta etapa |
| 4 | Todos os critérios marcados Piloto: T01–T17, T19–T27, T32, T35–T37, com ensaios manuais pertinentes |
| 5 | Regressões afetadas, fluxo real T27, procedimentos T26/T35/T36 quando aplicáveis e T33 antes da ampliação |
| 6 | T18, T28–T31, T33 e T38; repetir T37 ao mudar domínio e regressões críticas de compra; T30 só bloqueia plano com comissão |
| 7 | T34 para IA, regressões relevantes de mídia/catálogo/cotas e verificação de que compra independe do recurso |

T03 completo de item de pedido só é possível depois de existir pedido; teste representativo da Fase 1 não substitui esse teste. T05 é ampliado quando novos endpoints privilegiados entram. T26/T32 podem ser ensaios manuais com procedimento e evidência. T15–T17/T35 exigem detecção automatizada e resolução manual verificável no piloto, não automação de estorno.

## Encerramento da fase

Relatório: docs/execucao/fase-N.md. Evidências detalhadas podem ficar em docs/execucao/evidencias/fase-N/ ou em sistema restrito identificado no relatório. Não versionar dados de clientes reais, tokens ou dumps de produção. Cada fase modifica seu próprio relatório para evitar conflito entre as Fases 0 e 1.

Persistir limitações e o comando exato usado. Corrigir falhas de implementação antes de concluir. Quando só restar dependência externa, preservar o trabalho e explicar o passo faltante; não iniciar outra fase automaticamente nem esperar indefinidamente por eventos que ainda não ocorreram.
