# Procedimento — deploy e rollback

Pré-requisito para produção: D03 (domínio/HTTPS), D04 (backup externo), D05 (e-mail), D06 (VM). Nada aqui autoriza publicar.

## Deploy
1. Em máquina de build: `npm ci`, `node scripts/verify.mjs --phase=4` com código 0.
2. Gerar imagens identificadas (`docker compose build`; tag = SHA-256 das fontes do `verification.json`). Builds não rodam na VM de produção.
3. Registrar no histórico de deploy: imagem, migrations novas, configuração alterada, horário, responsável.
4. Na VM: backup lógico + conferir arquivamento de WAL (`pg_stat_archiver`) antes da migration.
5. `docker compose -f compose.yaml -f compose.production.yaml --env-file .env.production up -d migrate` (migrations só aditivas; checksum/lock em `scripts/migrate.mjs`).
6. Subir `api`, `worker`, `web`, `caddy`; aguardar health `ready`.
7. Verificação: vitrine, painel, `node scripts/ops.mjs status` sem alertas novos; compra de teste somente no ambiente adequado.

## Rollback
- Aplicação: voltar para a imagem anterior. Migrations são expansivas, então a versão anterior continua compatível; **não** fazer rollback destrutivo de banco.
- Eventos pendentes (outbox/inbox/notificações) permanecem no PostgreSQL e são retomados pela versão anterior; payloads são versionados (`payload_version=1`).
- Se a migration falhou: o runner aborta em transação; corrigir e gerar nova migration. Nunca editar migration aplicada.
- Falha que comprometa consistência financeira: pausar vendas de todas as lojas, seguir `restauracao.md`.
