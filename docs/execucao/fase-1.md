# Execução — Fase 1: Fundação do produto

- Especificação: **v1.1**, §§1–5, 18.1–18.2, 20–21, 24.1 e 26–28.
- Estado: **CONCLUÍDA — fundação técnica local**.
- Liberação operacional: **NÃO_SOLICITADA**. Não houve publicação, convite real, e-mail externo, compra, cobrança ou contratação.
- Data: **2026-10-01** (evidências com horários UTC).
- Ambiente: Windows, Docker Desktop/engine Linux 29.7.2, Compose 5.4.0; somente dados sintéticos.
- Responsável pela execução: agente de implementação nesta sessão. Não é homologação humana/externa.

## Resultado entregue

Fluxo real de ponta a ponta: usuário administrativo cadastra/verifica acesso em modo local, autentica, cria/acessa loja em rascunho, consulta/altera configuração persistida e revoga sessões. Outra loja permanece isolada. Funcionário aceita convite vinculado ao seu e-mail, lê configuração, não altera configurações nem gerencia equipe e perde acesso imediatamente ao revogar seu vínculo. Esses recursos não simulam persistência: API e worker usam PostgreSQL real.

Estrutura e arquivos principais:

| Área | Entrega / arquivos |
|---|---|
| Ambiente | `package.json`, `package-lock.json`, `.node-version`, `Dockerfile`, `compose.yaml`, `compose.test.yaml`; versões exatas, build Linux/Node LTS, limites, health checks e segredos locais separados |
| API modular | `apps/api/src/access.ts`, `stores.ts`, `infrastructure.ts`, `security.ts`, `dto.ts`, `main.ts` — NestJS/Fastify, validação, autorização, CSRF, cookies, rate limit, erros e logs sanitizados |
| Interface | `apps/web/app/page.tsx`, `layout.tsx`, `style.css`, `next.config.mjs` — cadastro/verificação/recuperação locais, login, lojas, configuração, convites, equipe e logout; sem acesso direto ao banco |
| Worker | `apps/worker/src/main.ts` — BullMQ/Redis, configuração-check somente leitura com contexto por job, confirmação de usuário/vínculo/recurso e encerramento controlado |
| Banco | `packages/database/src/index.ts`, `schema.ts`, `migrations/0001_foundation.sql`, `infra/postgres/` — UUIDv7, TIMESTAMPTZ, contexto transacional, RLS/FORCE, FKs compostas e papéis segregados |
| Ferramentas | `scripts/setup.mjs`, `migrate.mjs`, `verify.mjs`, `backup.mjs`, `compose.mjs` — migrations com checksum/lock, runner 0/1/2, backup e restore separado |
| Testes | `tests/foundation.test.mjs`, `tests/restore.test.mjs` — PostgreSQL real, app_user, HTTP e Chromium Playwright |
| Operação preparada | `compose.production.yaml`, `infra/Caddyfile`, `docs/backup-e-restore.md` — preparação sem execução/publicação de produção |
| Decisões | `docs/decisoes/fundacao.md` — versões, limites locais, papéis, identidade global e recuperação |

Nenhum catálogo, checkout, gateway, plano pago, domínio de cliente ou módulo futuro foi criado. `docs/`, `prompts/`, skills e instruções locais foram preservados. Não existia `.git`; não houve init, branch ou commit. Fase 0 não foi modificada.

## Versões e decisões

Runtime testado: **Node 24.21.0 LTS / npm 11.6.2** no Docker. Host encontrado: Node 25.0.0 / npm 11.6.2; o host inicia o runner, mas não substitui o runtime homologado para esta fase.

PostgreSQL 17.9, Redis de filas 7.4.7, NestJS 12.1.2/Fastify 5.12.5, Drizzle 0.45.3, BullMQ 5.79.0, UUID 13.0.2, Next.js 16.3.8/React 19.3.0, TypeScript 5.9.3 e Playwright 1.63.0. Dependências externas e lockfile fixados. Redis de cache não foi necessário.

- Conforme §§4 TEN-06 e 18, usuários/sessões/tokens administrativos são globais e restritos ao papel de acesso; não foi inventado tenant fictício. Dados de loja têm tenant_id. Enumeração sem tenant permite somente vínculos do ator autenticado; dados de loja continuam negados sem tenant.
- `migration_user` possui objetos; `auth_user` acessa somente identidade; `app_user` acessa somente dados de loja, nunca é owner/superuser/BYPASSRLS nem herda migration_user. Web não recebe credenciais; worker não recebe credencial de autenticação; API/worker não recebem credenciais de migration/backup/bootstrap.
- Contexto via Drizzle transaction + set_config parametrizado/is_local=true, equivalente a SET LOCAL. Mesma conexão em cada operação; autorização de vínculo ativo no backend.
- `backup_user` é operacional, somente SELECT e BYPASSRLS, sem superuser/escrita/ownership. É necessário para dump completo sem retirar FORCE RLS; sua credencial não vai à aplicação. Restore usa migration_user.
- Senhas scrypt com sal, tokens opacos de 256 bits persistidos somente como hash, sessão revogável, recuperação/verificação/convites com prazo e uso único. Cookie host-only/HttpOnly/SameSite=Strict, Secure e prefixo __Host- em produção; Origin exata + CSRF HMAC por sessão.
- Configuração mínima conservadora: Dono altera e gerencia equipe; Funcionário lê. Permissões futuras de catálogo/pedido não foram alteradas antecipadamente.
- Cadastro/verificação/recuperação/convite usam códigos **LOCAL** na tela, sem envio externo. Não comprovam posse real de e-mail e não servem para usuários reais. Produção recusa LOCAL_MAILBOX; provisionamento/e-mail externo não estão liberados.

## Verificações executadas

Comando obrigatório, última execução:

```sh
node scripts/verify.mjs --phase=1
```

**Resultado: código 0.** Início `2026-10-01T03:22:10.059Z`, fim `2026-10-01T03:24:22.903Z` (~2 min 13 s, com cache de downloads/build). Árvore fonte vinculada pelo digest:

`71fec3a2849b191127b7aaeb28e6127cb5bf4780590a8aac28ed5f12ef05fb9c`

Evidência gerada: [`evidencias/fase-1/verification.json`](evidencias/fase-1/verification.json). Relatórios de execução e artefatos temporários não entram no digest; o runner recusa alteração da árvore durante a verificação.

| Etapa | Resultado real |
|---|---|
| Preparação | Recriação apenas de projeto/volumes sintéticos ecommerce-phase1-test; desenvolvimento preservado |
| Build | Quatro workspaces compilados na imagem Node LTS, com npm ci e lockfile |
| Tipos | Quatro workspaces verificados; nenhum erro |
| Migrations | Banco vazio real migrado; API, web, PostgreSQL, Redis e worker saudáveis |
| Fundação | **13 testes Node aprovados (12 subtestes + agregador), 0 falhas, 0 ignorados** |
| Logs | Logs estruturados presentes; sentinela sensível enviada em corpo/header/query não apareceu; nenhuma URL de banco/hash de senha registrada em logs API/worker |
| Backup | pg_dump PostgreSQL 17, somente leitura, FORCE RLS mantido (~0,68 s) |
| Restore | pg_restore em **ecommerce_restore**, separado da origem (~0,99 s) |
| Conferências | **1 teste de restore aprovado**, duas lojas, app_user real; dados/vínculos/usuários e RLS preservados; ~4,99 s incluindo container, 77 ms de conferências internas |

Cobertura demonstrada:

- **T01** nos recursos existentes: IDs/Host não concedem leitura/escrita de outra loja; sessão obrigatória; tentativa de alteração cruzada negada na API e RLS de SELECT/INSERT/UPDATE no PostgreSQL.
- **T02**: pool max=1 alternando A/B/A com mesmo PID; contexto descartado em commit/rollback; ausência de contexto nega leitura/escrita. Não testado somente como superusuário.
- FK composta configuração → vínculo de outra loja rejeitada com PostgreSQL 23503; RLS de escrita rejeita com 42501. **Não substitui T03 de item/variação de pedido**, domínio ainda inexistente.
- Papéis reais, ausência de herança privilegiada, quatro tabelas de loja com ENABLE/FORCE RLS, UUIDv7/formato/unicidade/persistência.
- Convite por e-mail correto, expiração e uso único; Funcionário não altera configuração/não gerencia equipe/não acessa loja B; revogação com sessão ainda válida retira acesso imediatamente.
- E-mail local verificado antes de acesso; sessão/token persistido como hash; recuperação de uso único revoga sessões; senha antiga deixa de autenticar; logout e revogação global efetivos.
- CSRF/origem incorretos negados; campos inesperados/entrada vazia rejeitados; duplicidade retorna conflito 409; rate limit retorna 429, não 500.
- Worker conclui job válido e rejeita recurso/ator de outra loja.
- Playwright/Chromium: login de dois donos, somente a loja correta na lista, alteração de A persistida após reload, B inalterada, leitura cruzada negada e layout móvel sem overflow.
- EXPLAIN ANALYZE real das consultas mínimas via PostgreSQL no container; planos em `artifacts/query-plans.json`. PostgreSQL MCP indisponível; não se afirma execução por MCP. Nenhum índice especulativo de performance foi adicionado.

Verificações adicionais:

| Comando/procedimento | Resultado |
|---|---|
| `npm install --no-audit --no-fund` / resolução final deduplicada | Executados; lockfile final reproduzido por npm ci no Docker |
| `npm audit --omit=dev` | **0 vulnerabilidades** após correções; checagem de dependências, não pentest completo |
| `node scripts/verify.mjs --phase=99` | **Código 2 esperado**; entrada não implementada recusada, nenhuma outra fase executada |
| `docker compose up -d --wait --wait-timeout 120 web worker` | Ambiente de desenvolvimento final saudável, dados anteriores preservados |
| Playwright MCP em `http://localhost:3000` | Fluxo final conferido em `2026-10-01T03:25:36.056Z`; cadastro/verificação locais, login, criação de loja, configuração persistida após reload e logout; responsável: agente; sem credenciais registradas |

Referência da conferência MCP: [`evidencias/fase-1/conferencia-interface.md`](evidencias/fase-1/conferencia-interface.md). Evidência assistida pelo agente não equivale a revisão humana ou homologação externa. Artefatos/screenshot sintéticos ficam em `artifacts/`, ignorados; dumps/tokens/senhas não estão em relatórios.

### Falhas encontradas e corrigidas

Execuções anteriores falharam e **não foram tratadas como aprovadas**:

1. Tipos de health BullMQ/log Fastify: chamadas atualizadas para APIs reais.
2. Script init PostgreSQL CRLF no Windows: imagem PostgreSQL normaliza LF antes de executar; .editorconfig/.gitattributes adicionados.
3. Typecheck Next tentava gravar cache como usuário sem privilégios: incremental desabilitado no typecheck, sem elevar permissões.
4. POST sem corpo com Content-Type JSON: cliente/interface corrigidos para não enviar header JSON sem corpo.
5. Drizzle encapsula erro PostgreSQL em cause: testes verificam o código real; conflitos também tratados pelo filtro.
6. Rate limiting funcionava mas filtro transformava 429 em 500: status de transporte preservado com mensagens sanitizadas; ready isento de limite para manter monitoramento.
7. pg_dump pelo migration_user era bloqueado por FORCE RLS: papel operacional somente-leitura para backup, sem enfraquecer a aplicação/RLS.
8. Auditoria encontrou 8 vulnerabilidades nas versões iniciais: versões corrigidas (Nest estável atual/Fastify/UUID), resolução npm deduplicada e runner completo repetido. A duplicação inicial de tipos Fastify/cookie foi corrigida pela versão única fixada na raiz/API, não por any ou remoção de autenticação.

## Restauração inicial e limites

Ensaio real em banco descartável separado preservou configurações e autoria, vínculos, usuários verificados e políticas RLS de duas lojas. Sem contexto o app_user não lê dados restaurados; tentativa de atualização cruzada não altera outra loja. Nenhum efeito financeiro foi executado: esse domínio não existe.

Esse resultado **não comprova** RPO de 15 minutos, RTO de 4 horas, retenção de 30 dias, recuperação de mídia ou T26 financeiro completo. Procedimento local em `docs/backup-e-restore.md`. pgBackRest com WAL/PITR/cópia externa cifrada é a escolha para a preparação operacional, ainda dependente de D04.

## Pendências — não bloqueiam a conclusão técnica da Fase 1

| Pendência | Responsável | Marco / limite |
|---|---|---|
| D04: destino externo de backup, criptografia/chaves recuperáveis, WAL/PITR e retenção | Operação + responsável | Antes de dados reais/piloto; restore lógico local já demonstrado |
| D05: provedor/remetente, entrega externa e verificação real de e-mail/provisionamento assistido | Operação + desenvolvimento | Antes de usuários reais/piloto; mecanismo LOCAL explicitamente limitado |
| MFA de dono/administrador de plataforma | Desenvolvimento + operação | Obrigatório antes de operar pagamentos reais; administrador de plataforma/pagamentos não existem nesta fase |
| D06: host de produção, incidentes, recursos e capacidade medida | Responsável + operação | Antes do piloto; não há SLA/capacidade comercial demonstrados |
| D02: Mercado Pago e autorização externa | Titular + desenvolvimento | Fase 0/integração financeira; não bloqueia esta fundação |
| T03 de pedido, T05 financeiro, T26/T32 completos e demais testes de fases futuras | Desenvolvimento/operação conforme plano | Não implementados/ensaiados nesta fase; não declarados aprovados |

Não há impedimento local restante para os critérios da Fase 1. A conclusão técnica **não libera piloto ou produção**.

## Como executar e diagnosticar

Pré-requisitos: Node LTS indicado/npm, Docker Desktop iniciado (Linux/Compose compatível), acesso aos registries para instalar/buildar. Não necessita Mercado Pago ou domínio definitivo.

```sh
npm ci
npm run setup
node scripts/setup.mjs --test
docker compose up --build -d --wait web worker
```

Abra **http://localhost:3000**. Crie seu próprio acesso local, verifique com código LOCAL exibido, entre, crie a loja em rascunho e altere sua configuração. O ambiente de desenvolvimento foi deixado disponível; contém apenas amostras sintéticas da conferência MCP. Não existem credenciais compartilhadas de demonstração; senhas do ensaio foram geradas aleatoriamente e não registradas.

- Verificar: `node scripts/verify.mjs --phase=1`. Só apaga volumes do projeto reservado ecommerce-phase1-test; nunca coloque dados reais nele.
- Migrations: automáticas no serviço migrate; repetir com `docker compose run --rm migrate`.
- Backup: `node scripts/backup.mjs --backup`.
- Restore em base nova separada: `node scripts/backup.mjs --restore-test`; falha se ecommerce_restore já existir, sem remoção silenciosa. Ver documento de recuperação.
- Saúde: `/api/health/live` e `/api/health/ready` pela web.
- Diagnóstico: `docker compose ps`; `docker compose logs --tail=100 api worker migrate postgres`.
- Parar desenvolvimento preservando volumes: `docker compose down`; não usar --volumes para preservar seus dados.
- Segredos em .env/.local/test.env, ignorados e separados; setup preserva valores existentes. Nenhuma porta de banco/Redis/API publicada. Preparação de produção permanece não executada.

Mais instruções e comandos de limpeza exclusivamente de teste em `README.md`.

## Ponto de parada e próximo passo

**Parada ao final da Fase 1.** Pode avançar tecnicamente à Fase 2 quando o usuário solicitar: ler `prompts/fase-2-loja-navegavel.md` e este relatório, preservando a fundação e repetindo T01/T02 sobre os novos recursos. Nenhum trabalho da Fase 2 foi iniciado automaticamente.
