# Fase 1 — fundação do produto

Execute somente a Fase 1 do SaaS de E-commerce. Leia prompts/00-prompt-mestre.md e docs/PLANO-E-VERIFICACAO.md. Use docs/especificacao.md v1.1, especialmente 1–5, 18.1–18.2, 20–21, 24.1 e 26–28. A Fase 0 não precisa estar concluída para este trabalho local.

## Resultado esperado

Aplicação mínima executável: usuário administrativo autentica, cria/acessa sua loja e consulta/altera uma configuração persistida; outra loja permanece isolada. Banco, migrations, teste automatizado de isolamento, logs e restauração inicial devem funcionar.

## Escopo

1. Inspecione o repositório. Se vazio, estabeleça o projeto principal com apps/web, apps/api, apps/worker e compartilhamentos estritamente necessários, preservando docs/ e prompts/. Não modificar experiments/mercado-pago/ nem o relatório da Fase 0.
2. Fixe versões suportadas de Node, PostgreSQL, framework e ferramentas em arquivos de dependências/configuração. Escolha um gerenciador de pacotes e documente o comando de instalação. UUIDv7 pode ser gerado na aplicação; não exigir PostgreSQL 18 sem necessidade real.
3. Configure desenvolvimento por Docker Compose, API NestJS/Fastify, Next.js, worker mínimo, PostgreSQL e Redis de filas. Cache Redis separado só entra quando necessário. Separe configuração e segredos de teste/produção; nenhuma porta de banco fica publicamente exposta em configuração de produção.
4. Crie migrations de tenants, usuários, sessões, vínculos, convites e configuração mínima de loja. Use uma entidade real de configuração com tenant_id para demonstrar leitura/escrita, sem construir o catálogo inteiro. Banco usa papel de migration separado do papel da aplicação.
5. Implemente autenticação, recuperação, sessões revogáveis, Dono/Funcionário e contexto de loja autorizado. MFA e fluxos de e-mail podem ser verificados com mecanismo local claramente identificado; entrega externa ficará registrada como pendente até a fase apropriada. Não enviar mensagens reais nesta etapa sem autorização.
6. Implemente unidade transacional com contexto local, RLS de leitura/escrita, FKs de mesma loja onde já existirem e negação sem contexto. Workers também usam contexto por job. O Next.js não acessa banco diretamente.
7. Entregue interface mínima utilizável de autenticação/lojas/configuração e erros reais. Configure validação de entrada, logs sanitizados, health checks, rate limiting básico e tratamento consistente de erro.
8. Prepare backup e restore compatíveis com a versão escolhida; execute restauração inicial em banco descartável separado e registre conferências. Destino externo/PITR de produção ainda podem depender de D04, mas o roteiro local deve funcionar.

Não implementar produtos, checkout, gateway, planos pagos ou integrações de evolução. Não criar banco completo de módulos futuros apenas porque estão no modelo lógico.

## Verificação e entregáveis

Crie o runner principal e execute: node scripts/verify.mjs --phase=1. O comando deve instalar/preparar pré-requisitos apenas por procedimento documentado, realizar build/checagens, migrations em banco de teste e testes relevantes, sem tocar em dados reais.

Cubra T01 e T02 com duas lojas, reutilização de conexão e ausência de contexto. Exercite autorização dos endpoints criados, escrita bloqueada por RLS e relação cruzada quando aplicável. Teste como app_user real, nunca somente como superusuário. Registre que o T03 de pedido ainda será implementado quando esse domínio existir.

Entregue README de desenvolvimento, exemplo de variáveis sem segredos, migrations, testes, instruções de restauração e docs/execucao/fase-1.md. Registre versões e escolhas em docs/decisoes/fundacao.md. O runner deve ter o contrato descrito no plano de verificação, sem marcações falsas de homologação externa.

## Ponto de parada

Pare quando a fundação executável, os testes e a restauração inicial estiverem demonstrados, ou quando restar impedimento externo real após concluir o trabalho independente. Não iniciar a Fase 2. Falta de credencial do Mercado Pago, domínio definitivo ou plano comercial não é motivo para abandonar esta fase.
