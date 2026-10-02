# Backup e restauração local — Fase 1

Especificação v1.1, PostgreSQL 17.9. Ensaio usa dados sintéticos e projeto Docker `ecommerce-phase1-test`, completamente separado de `ecommerce-foundation`.

## Procedimento

1. Subir o ambiente e concluir as migrations (README).
2. `node scripts/backup.mjs --backup` cria `/tmp/foundation.dump` dentro do container PostgreSQL, com pg_dump custom e papel operacional backup_user (somente leitura com BYPASSRLS), mantendo FORCE RLS intacto. A restauração usa migration_user. Não exibe senha.
3. Copiar para destino LOCAL restrito, se quiser preservá-lo: `docker compose cp postgres:/tmp/foundation.dump .local/foundation.dump`. Dumps nunca entram no Git ou em relatórios.
4. `node scripts/backup.mjs --restore-test` cria **ecommerce_restore**, sem remover ou alterar ecommerce, e executa pg_restore com fail-fast. Se o destino já existe, o comando falha: nunca o remove silenciosamente. Para novo ensaio manual, operador deve escolher ambiente descartável e remover apenas esse destino após conferência explícita.
5. `node scripts/verify.mjs --phase=1` faz automaticamente backup/restore no projeto de teste e confere configuração, autoria, vínculos, usuários verificados, RLS e negação sem contexto como app_user. Salva resultado sanitizado em `docs/execucao/evidencias/fase-1/verification.json`. Dump temporário fica no container sintético, não no relatório.
6. Comparar duas lojas e confirmar schema/roles. Em teste, executar pelo runner; não reusar o comando de teste contra URL de produção. O runner recria SOMENTE volumes de ecommerce-phase1-test.

## Diagnóstico

`docker compose ps` e `docker compose logs --tail=100 api worker migrate postgres` (nunca publicar segredos ou dumps). Health live indica processo; ready confere banco e Redis. Se restore falhar, preservar erro/backup, não substituir origem nem afirmar sucesso. O dump usa proprietário/papéis já criados pelo init.sh; em host limpo é necessário provisionar papéis com novas senhas antes de restaurar. Senhas de papéis não fazem parte de pg_dump do banco.

## Limites e produção

Esse ensaio comprova restauração lógica inicial, não disaster recovery do piloto nem T26 financeiro completo. pgBackRest é a escolha para backup físico + WAL/PITR PostgreSQL 17, mas destino externo cifrado, credenciais segregadas, recuperação de chaves e retenção dependem de D04/Operação. Sem isso, dados reais NÃO estão liberados. Não afirmar RPO/RTO/retencão propostos como medidos. O tempo medido pelo runner é somente deste ensaio sintético.

No piloto: bloquear escritas, provisionar ambiente limpo, recuperar banco/configuração/mídia, conferir amostras, reconstruir pendências e conciliar fatos externos posteriores ao ponto restaurado ANTES de reabrir cobranças. A restauração não desfaz efeitos do gateway e não autoriza repeti-los. Pagamentos/mídia inexistem na Fase 1; o ensaio correspondente será ampliado quando existirem.
