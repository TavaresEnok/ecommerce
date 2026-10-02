# Decisões — Fundação (especificação v1.1)

## Escopo e versões

Fase 1 somente. Monólito modular com módulos Acesso e Lojas, Next.js sem acesso ao banco, worker BullMQ do mesmo repositório. Não existem catálogo, checkout, pagamentos, planos pagos ou integrações reais.

Versões fixas: Node 24.21.0 LTS (imagem Debian Bookworm), npm 11.6.2, PostgreSQL 17.9, Redis de filas 7.4.7, NestJS 12.1.2/Fastify 5.12.5, Drizzle 0.45.3, BullMQ 5.79.0, Next.js 16.3.8, React 19.3.0, TypeScript 5.9.3, Playwright 1.63.0. Pacotes sem intervalos; package-lock.json é obrigatório. Node 25 encontrado no host não é o runtime de referência: o runner compila/executa em Node LTS no Docker. Atualizações de patches exigem repetição do runner; revisar avisos de segurança antes de qualquer produção.

## Revisão de segurança das versões

A auditoria real (`npm audit --omit=dev`) encontrou 8 vulnerabilidades nas versões iniciais Nest 11.1.16/UUID 13.0.0. UUID foi atualizado para 13.0.2; Nest 11.2.7 ainda fixava Fastify 5.11.3 vulnerável. A fundação, ainda sem usuários reais ou contrato publicado, passou para a versão estável suportada Nest 12.1.2, cujo adaptador depende nativamente de Fastify 5.12.5 corrigido. Não há troca de stack nem override forçado de dependência interna. A validação desta escolha fica vinculada ao resultado mais recente do runner completo em docs/execucao/evidencias/fase-1/verification.json. A versão exata de UUID é **13.0.2**. Fastify 5.12.5 também é fixado na raiz para que plugins hoisted e API compartilhem o mesmo módulo/tipos (a primeira resolução npm duplicou o módulo e perdeu augmentation de cookies); `npm ci` com o lockfile final reproduz a resolução deduplicada.

## Identidade global e contexto

A especificação §§4 TEN-06 e 18.1–18.2 explicitamente define usuários administrativos/sessões como globais e dados de loja com tenant_id. Isso prevalece sobre a regra genérica de tenant_id em toda tabela dos resumos/skills. Não inventar tenant fictício para uma identidade que participa de várias lojas.

`auth_user`: acesso somente ao schema access (usuários, sessões e tokens globais). `app_user`: somente ao schema shop, sem superuser, BYPASSRLS, ownership ou herança de migration_user. API Acesso usa auth_user; módulo Lojas e worker usam app_user. Web não recebe credenciais de banco. Worker não recebe credencial de autenticação. API/worker não recebem credenciais de migration/bootstrap. `migration_user` é proprietário dos objetos, sem superuser/BYPASSRLS; CREATEDB é usado para restauração local (retirar em produção se o provisionamento ficar com operação). Bootstrap postgres só na inicialização do container. `backup_user` é papel operacional segregado, NOSUPERUSER com BYPASSRLS e somente SELECT nos schemas access/shop/migrations, sem escrita/ownership/herança pela aplicação. FORCE RLS impede pg_dump pelo owner sem bypass; papel somente-leitura para backup evita retirar FORCE ou privilegiar migrations/API. Sua senha só vai para o container PostgreSQL/tarefa operacional, nunca API/web/worker.

Todos os dados de loja têm ENABLE/FORCE RLS e USING/WITH CHECK. A unidade Drizzle usa set_config parametrizado com is_local=true, equivalente a SET LOCAL. Operações de loja usam a mesma conexão transacional. Identidade vem da sessão opaca validada; IDs enviados não concedem permissão. Autorizações obtêm lock compartilhado do vínculo ativo para serializar com revogação.

Exceção restrita e necessária: enumeração dos próprios vínculos administrativos pode ocorrer sem tenant, mas exige current_user_id local e retorna somente vínculos do usuário. Configuração/loja/convites sem tenant continuam negados. Sem qualquer contexto até os vínculos retornam zero. A API lê cada nome de loja em nova unidade autorizada por tenant.

FK composta real de configuração/convite → vínculo da mesma loja. FKs para identidade global são simples, pois identidade não pertence a um tenant. T03 de item/variação de pedido não é implementado nem declarado aprovado.

## Acesso e fronteiras locais

Senha: scrypt N=65536/r=8/p=1 com sal aleatório e comparação constante; mínimo 12, máximo 128 caracteres. IDs UUIDv7 via uuid, sem dependência do PostgreSQL 18. Tokens aleatórios de 256 bits só persistem como SHA-256; recuperação expira em 15 min, verificação em 30 min, convite em 24 h, todos de uso único. Sessão expira em 7 dias; logout/revogação global/reset invalidam no banco.

Cookie HttpOnly/SameSite=Strict, host-only e Secure/`__Host-` em produção. Origin exata + token HMAC por sessão em escritas autenticadas, inclusive logout; origem também obrigatória em login/cadastro/reset para evitar login CSRF. Não persistir token de sessão no navegador via localStorage. Backend valida campos e permissões, não apenas botões.

Cadastro/convites/recuperação local apresentam códigos diretamente na resposta/tela, apenas quando APP_ENV é development/test e LOCAL_MAILBOX=true. Esse mecanismo não comprova posse real de e-mail e só é seguro em ambiente local restrito, sem usuários/dados reais. Produção recusa LOCAL_MAILBOX e abertura autônoma; e-mail externo e provisionamento assistido ficam pendentes de D05 e da fase apropriada. MFA de produção continua obrigatório antes de pagamentos reais; não há administrador de plataforma nem pagamentos nesta entrega. Não apresentar código local como MFA real.

Funcionário lê configuração, mas somente Dono altera configuração e gerencia equipe; é uma escolha conservadora local para a entidade mínima, não altera as permissões futuras de catálogo/pedido da seção 5. Job configuration-check é somente leitura e revalida usuário/vínculo/recurso no banco antes de retornar resultado.

## Operação e backup

Compose local expõe somente a web em loopback; banco/Redis/API sem portas no host. Configuração de produção remove a porta web e prepara Caddy por perfil explícito; não foi autorizada publicação. Cache separado não é necessário. Filas têm AOF/noeviction. Pools: API 4 shop + 2 access; worker 2; conexão de health da fila separada; capacidade real não ensaiada.

Restauração inicial usa pg_dump/pg_restore da mesma imagem PostgreSQL 17 e banco ecommerce_restore separado. Para produção, ferramenta selecionada: pgBackRest com backup físico e arquivamento WAL/PITR para destino cifrado externo; integração/provedor/chaves dependem de D04. Backup lógico local NÃO atende nem comprova RPO 15 min, RTO 4 h ou retenção 30 dias. Essas metas permanecem pendentes. Não existem efeitos financeiros para repetir nesta fase.

Índices iniciais são somente constraints de integridade (PK/UNIQUE/FKs compostas); nenhum índice especulativo de performance foi criado. Runner registra EXPLAIN ANALYZE das consultas mínimas antes de qualquer evolução de índices. PostgreSQL MCP não está disponível; execução real é via cliente PostgreSQL no container, documentada, sem simular uma consulta MCP.
