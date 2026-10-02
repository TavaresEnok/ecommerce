# SaaS de E-commerce — pacote de execução v1.1

Este pacote contém a especificação consolidada e os prompts para começar o desenvolvimento. São **oito fases, de 0 a 7**. Até a Fase 4 teremos o produto preparado para um piloto; a Fase 5 observa lojas reais, a Fase 6 prepara a comercialização e a Fase 7 é uma evolução opcional.

**Comece pela Fase 1 se ainda não tiver credenciais do Mercado Pago.** A Fase 0 pode ser feita em paralelo, em uma área isolada. A ausência de uma conta externa não deve interromper trabalho local independente.

## Desenvolvimento — Fase 1

Fundação em `apps/api` (NestJS/Fastify), `apps/web` (Next.js), `apps/worker` (BullMQ) e `packages/database` (Drizzle/migrations). O estado e as verificações reais ficam em [`docs/execucao/fase-1.md`](docs/execucao/fase-1.md).

### Pré-requisitos e instalação

- Docker Desktop iniciado com engine Linux e Compose 2.24.4+ (tags `!override`/`!reset`). Builds necessitam acesso aos registries Docker/npm e download do Chromium Playwright. Não há APIs pagas ou envio de dados reais.
- Runtime de referência: Node **24.21.0 LTS**, npm **11.6.2**. Use `.node-version` no gerenciador de versões. O runner é Node puro e pode ser iniciado pelo host, mas compilação/testes sempre usam Node LTS no Docker. Não considerar Node 25 do host como runtime homologado.
- `npm ci` instala versões do lockfile, sem atualizar dependências.

```sh
npm ci
npm run setup
node scripts/setup.mjs --test
docker compose up --build -d --wait web worker
```

Abra **http://localhost:3000**. Cadastre acesso local, use o código LOCAL exibido para verificar o e-mail, entre, crie a loja em rascunho e salve sua configuração. Cada usuário só vê lojas vinculadas. Para testar equipe, crie outro acesso verificado, gere convite pelo Dono e aceite com ID/código no acesso do funcionário. Funcionário lê configuração; somente Dono altera e gerencia equipe.

`setup` gera `.env` e `.local/test.env` com segredos aleatórios separados, sem exibi-los e sem sobrescrever existentes. `.env.example` contém apenas nomes/referência. Não colocar usuários reais neste ambiente. E-mail local NÃO comprova posse real de caixa postal. Recuperação local revoga sessões e exige login novamente. MFA e e-mail externo ainda não habilitados para produção; não há pagamentos reais nesta fase.

Banco, Redis e API não publicam portas no host. Next consulta somente API e não recebe credencial de banco. `docker compose down` para serviços sem apagar dados; não use `--volumes` no projeto de desenvolvimento se quiser preservá-los. Para alterações do código, repita `docker compose up --build -d --wait web worker`. Migrations são aplicadas pelo serviço `migrate`; `docker compose run --rm migrate` repete de forma idempotente. Nunca altere migration já aplicada: adicione outra.

### Verificação da Fase 1

```sh
node scripts/verify.mjs --phase=1
```

O runner exige pré-requisitos já preparados; não instala ferramentas no host. Constrói imagens (incluindo Chromium), compila/checa tipos, aplica migrations em PostgreSQL real, testa `app_user`, isolamento T01/T02, FK composta representativa, autorização, sessões/recuperação/convites, worker, UI Playwright, logs, rate limiting e backup/restore separado. Recria SOMENTE projeto/volumes reservados `ecommerce-phase1-test`, nunca dados de desenvolvimento/produção. Não coloque dados reais nesse projeto. Porta de teste em loopback: 3100; UI dos testes usa `http://web:3000` na rede Docker.

Códigos: **0** todas as verificações/evidências locais requeridas passaram; **1** falha demonstrada; **2** pré-requisito/evidência ausente. Resultado versionável sanitizado em `docs/execucao/evidencias/fase-1/verification.json`; screenshot/dados sintéticos temporários em `artifacts/` (ignorados). T03 de pedido, T26 financeiro e homologação externa NÃO são substituídos por esses testes.

Após o ensaio, pare os containers de teste sem afetar desenvolvimento:

```sh
docker compose --project-name ecommerce-phase1-test --env-file .local/test.env -f compose.yaml -f compose.test.yaml down
```

### Operação

[`docs/backup-e-restore.md`](docs/backup-e-restore.md) traz backup, restore, conferências e limitações. Health via `http://localhost:3000/api/health/live` e `/api/health/ready`. Diagnóstico: `docker compose ps`; `docker compose logs --tail=100 api worker migrate postgres`. Logs não registram corpo, cookies, tokens, senhas ou query string.

[`docs/decisoes/fundacao.md`](docs/decisoes/fundacao.md) registra versões, papéis, contexto, permissões e pendências D04/D05/D06. `compose.production.yaml`/Caddyfile são preparação NÃO executada nem autorização para publicação: requerem `.env.production` separado, hostname/HTTPS e segredos próprios. Banco/Redis continuam sem portas; LOCAL_MAILBOX é recusado em produção. Antes de dados reais, homologar e-mail/provisionamento, MFA pertinente, backup externo cifrado/PITR e operação. Sem dados financeiros nesta fase; não prometer compra funcional.

## Loja navegável — Fase 2

Estado e evidências: [`docs/execucao/fase-2.md`](docs/execucao/fase-2.md). Catálogo/variantes/categorias, saldo auditado, mídia privada S3/Sharp, rascunho/publicação, páginas/menu, fornecedor TESTE, busca, SEO, carrinho e frete local. **Não cria pedidos, reserva estoque ou cobra.**

```sh
npm run setup
node scripts/setup.mjs --test
docker compose up --build -d --wait web worker
node scripts/seed.mjs --local
node scripts/verify.mjs --phase=2
```

O seed só usa `http://localhost:3000`, cria duas lojas sintéticas novas sem apagar dados e grava acessos aleatórios em `.local/demo.json` (ignorado; não compartilhar/versionar). Abra as URLs impressas `/lojas/aurora-...` e `/lojas/brisa-...`. As mesmas vitrines respondem em `slug.localhost:3000`; hostname desconhecido dá 404, não escolhe loja padrão. Se o navegador/rede não resolver `*.localhost`, use as rotas `/lojas/slug` de conveniência local.

Demonstração: entre com um acesso de `.local/demo.json`, selecione sua loja e **Gerenciar catálogo e vitrine**. Cadastre/ative produto, ajuste saldo com motivo e local, envie PNG/JPEG/WebP, atualize o processamento e vincule a mídia ao produto. Salve fornecedor TESTE, tema/página/menu, veja o preview autorizado e publique a vitrine local. Pesquise `cafe` ou SKU, escolha variação, adicione ao carrinho e cote CEP `01001000` ou retirada. CEP `99999999` não tem entrega por tabela. Alterar preço/endereço/itens/regra exige nova cotação. Checkout mostra que ainda está desabilitado.

SeaweedFS **4.17** oferece S3 **local privado** em volume `storage-data`, sem porta no host. `setup` adiciona somente variáveis/chaves ausentes, preservando segredos existentes. API/worker recebem apenas S3/app_user; web não recebe banco/storage. Original temporário não é público; somente WebP processado e referenciado pode ser servido. Cota piloto 1 GiB, 10 MB/40 MP por arquivo, no máximo 2 uploads por tenant; worker concorrência 1. Reconciliação horária e botão **Reconciliar mídia e retomar pendências** recuperam contadores/arquivos pendentes; temporários vencem em 24 h. Não é a reserva comercial da Fase 6.

O verificador da Fase 2 recria apenas `ecommerce-phase2-test` (dados sintéticos), porta **3200**, executa tipos, T22/T23/T37, regressões da fundação, Playwright 1440×900 e 390×844, logs e backup/restore PostgreSQL separado. Evidência: `docs/execucao/evidencias/fase-2/verification.json`; screenshots em `artifacts/phase2-*.png`. Não reescreve o relatório/evidência da Fase 1. Para parar testes sem apagar desenvolvimento:

```sh
docker compose --project-name ecommerce-phase2-test --env-file .local/test.env -f compose.yaml -f compose.test.yaml -f compose.phase2.test.yaml down
```

Diagnóstico: `docker compose ps`, `docker compose logs --tail=100 api worker storage-init migrate`. Falha de storage bloqueia upload/publicação dependente; publicação anterior permanece. Backup PostgreSQL preserva referências de mídia, **não copia o bucket**. O volume local deve ser preservado; backup/restore externo cifrado do bucket e homologação D04 seguem pendentes antes de dados reais. Não use `down --volumes` no desenvolvimento. E-mail, DNS/TLS, fornecedor/políticas reais e liberações operacionais continuam externos. Testes locais sempre noindex; robots não é autorização de preview/painel.

## Como usar o pacote de prompts

1. Copie as pastas docs/ e prompts/ deste pacote para a raiz do repositório em que o agente trabalhará. Se houver arquivos com os mesmos nomes, compare antes de substituir. A especificação ativa deve ficar em docs/especificacao.md, identificada como versão 1.1.
2. Abra esse repositório no agente de código. Envie **o conteúdo de um único arquivo de fase** da tabela abaixo. Ele já manda ler o prompt mestre e as seções pertinentes da especificação; não precisa colar os oito prompts juntos.
3. Se o agente não tiver acesso aos arquivos, anexe a especificação, o prompt mestre, o plano de verificação e o prompt da fase ativa. Não depender de outra conversa lembrar o documento.
4. Ao concluir, o agente entrega relatório com verificações, evidências externas pendentes e ponto de retomada. Leia o resultado antes de enviar a fase seguinte.
5. Quando houver pendência externa, resolva apenas o necessário e reenvie **o mesmo prompt**, pedindo para retomar do relatório. Trabalho já correto é preservado.

O [prompt mestre](prompts/00-prompt-mestre.md) define como trabalhar; a [especificação v1.1](docs/especificacao.md) define o produto; o [plano de verificação](docs/PLANO-E-VERIFICACAO.md) define como comprovar cada entrega. As [pendências externas](docs/CHECKLIST-EXTERNO.md) indicam quando conta, acesso ou decisão humana realmente fazem falta.

## Os oito prompts

| Fase | Resultado | Arquivo para enviar |
|---|---|---|
| 0 | Prova de conceito do Mercado Pago | [Fase 0 — pagamentos](prompts/fase-0-validacao-pagamentos.md) |
| 1 | Fundação: ambiente, acesso, lojas, banco, isolamento e backup inicial | [Fase 1 — fundação](prompts/fase-1-fundacao.md) |
| 2 | Loja navegável: catálogo, imagens, tema, SEO, carrinho e frete local | [Fase 2 — loja](prompts/fase-2-loja-navegavel.md) |
| 3 | Compra confiável: reserva, pedido, pagamento e incidentes | [Fase 3 — compra](prompts/fase-3-compra-e-pagamentos.md) |
| 4 | Operação do piloto: painel, entrega, atendimento, notificações e recuperação | [Fase 4 — piloto operável](prompts/fase-4-piloto-operavel.md) |
| 5 | Validar uso real, corrigir problemas e medir custos/suporte | [Fase 5 — piloto observado](prompts/fase-5-validacao-piloto.md) |
| 6 | Comercialização: plano pago, cobrança, reembolso integrado, domínio e frete | [Fase 6 — comercial](prompts/fase-6-lancamento-comercial.md) |
| 7 | Primeira evolução opcional: rascunho de descrição com IA e custo controlado | [Fase 7 — evolução](prompts/fase-7-evolucao-controlada.md) |

A Fase 7 não é requisito para vender o SaaS. Ela propõe uma primeira melhoria delimitada, condicionada ao interesse dos lojistas e à escolha de orçamento/provedor. Não significa implementar marketing, ERP e todas as integrações de uma vez.

## O que ficou mais simples

- No piloto, o dono devolve valores pelo Mercado Pago e a plataforma acompanha o resultado confirmado. Automatizar a iniciação de reembolso fica para a Fase 6.
- Mídia tem tolerância pequena de cota no piloto, com limites por arquivo/processamento e concorrência. A reserva rigorosa de espaço entra no comercial.
- Recuperação e conciliação pós-restauração podem ser manuais, desde que ensaiadas e documentadas.
- Direitos do consumidor e SEO básico passam a ter critérios explícitos.

Veja as alterações no [histórico da versão](docs/CHANGELOG.md). Segurança entre lojas, saldo consistente, idempotência e registro de todo recebimento continuam obrigatórios.

## O que este pacote entrega agora

A documentação original define as oito fases. A base implementada inclui a fundação e a loja navegável; consulte os relatórios da [Fase 1](docs/execucao/fase-1.md) e [Fase 2](docs/execucao/fase-2.md) para os estados efetivamente verificados. Fases seguintes e integrações externas não foram implementadas ou homologadas. O runner aceita `--phase=1` e `--phase=2`; relatórios/resultados não são considerados aprovados sem execução.

As fases 0 e 1 só devem ser executadas simultaneamente com diretórios/branches separados, evitando alterações concorrentes nos mesmos arquivos. A POC escreve em experiments/mercado-pago/ e em seu próprio relatório; a fundação é responsável pelo projeto principal. Ninguém deve reescrever o contrato de pagamento presumindo resultados ainda não observados.

Os prompts adotam objetivo, contexto, limites e verificação explícitos, conforme a [orientação de prompting da documentação oficial OpenAI](https://learn.chatgpt.com/docs/prompting). Não exigem modelo específico.
