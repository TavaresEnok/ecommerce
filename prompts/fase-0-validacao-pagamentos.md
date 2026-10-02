# Fase 0 — validar Mercado Pago

Execute somente a Fase 0 do SaaS de E-commerce. Leia prompts/00-prompt-mestre.md e docs/PLANO-E-VERIFICACAO.md. Use docs/especificacao.md v1.1, especialmente 3, 11–15, 24.1, 26–28. Produza a prova de conceito e as evidências possíveis agora; não termine apenas com um plano.

## Resultado esperado

Uma POC isolada que demonstre o fluxo de conta do lojista, criação/consulta de pagamento Pix e cartão, idempotência, notificações e leitura de devolução executada pelo gateway. O resultado deve dizer quais capacidades estão comprovadas e quais ainda dependem da conta/ambiente.

## Escopo

1. Inspecione o ambiente e crie/reutilize experiments/mercado-pago/ como projeto isolado em Node/TypeScript, com dependências e configuração próprias. Não alterar o package.json/lockfile do produto nem consumir seu banco. Isso permite a Fase 1 em paralelo.
2. Consulte documentação oficial atual do fluxo de checkout/split proposto. Registre família de API, SDK/versões, endpoints, permissões e limitações. Não misture exemplos de Payments, Orders e Checkout Pro.
3. Implemente conexão OAuth, associação explícita de vendedor/ambiente, proteção do callback, renovação/revogação conforme o contrato real e armazenamento seguro das referências/credenciais. Não exponha tokens no relatório.
4. Implemente criação e consulta de Pix/cartão para duas contas de vendedor, com total esperado, referência da operação, chave idempotente e vencimento aceito pelo gateway. Use componentes oficiais de captura/tokenização; PAN/CVV não entram no servidor.
5. Implemente recepção durável e validação dos webhooks aplicáveis, deduplicação por evento, consulta autoritativa do recurso e correlação por conta. Um retorno de navegador não confirma pagamento.
6. Exercite timeout após criação, evento repetido/atrasado/fora de ordem, vendedor ou valor incorreto e pagamento ainda desconhecido. Simulações controladas testam o código, separadas de evidências externas.
7. Exercite devolução pelo painel de teste do Mercado Pago e leitura de total/parcial. Registre limitações de saldo, estorno via API e reversão de comissão para a Fase 6; não construir o motor completo de reembolso do produto nesta POC.
8. Verifique comissão/split quando a conta/ambiente permitirem. Enquanto não comprovada, registre DESABILITADA e mantenha separado o resultado de viabilidade do piloto sem comissão. Não fazer cobrança real para testar sem autorização específica aplicável.

Use persistência mínima isolada e testes suficientes para provar comportamento após retry/reinício. Não implementar catálogo, tema, login do SaaS, assinatura ou banco completo do produto.

## Verificação e entregáveis

Crie e execute o comando único: node experiments/mercado-pago/verify.mjs. Ele verifica o projeto isolado, seus testes e a evidência externa requerida, seguindo os códigos de resultado do plano de verificação. Não executar transações reais como parte automática do verificador.

Entregue README de execução da POC, exemplo de variáveis sem segredos, testes, matriz capacidade × método × ambiente × evidência e contrato proposto do adaptador de pagamento. Grave o relatório em docs/execucao/fase-0.md e decisões específicas em docs/decisoes/mercado-pago.md, sem alterar decisões de outras fases em execução.

Se faltarem contas/credenciais/URL externa, conclua código local, testes e instruções que não dependem delas. Relate PENDENTE_EXTERNA e o acesso exato faltante; não declare o gateway homologado. A Fase 1 pode avançar independentemente.

## Ponto de parada

Pare depois de entregar POC, verificações e relatório. Registre se o núcleo do piloto está homologado e se comissão está homologada ou desabilitada. Não iniciar a Fase 1, integrar a POC automaticamente ao produto ou ativar vendas reais. O código experimental é referência; só o contrato comprovado e partes revisadas serão incorporados na Fase 3.
