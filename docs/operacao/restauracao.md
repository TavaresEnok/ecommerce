# Procedimento — restauração e conciliação (seção 21.2, T26/T32)

Responsável: operador da plataforma. Metas propostas: RPO 15 min, RTO 4 h (não comprovadas em produção).

## Mecanismos disponíveis
- **Lógico:** `node scripts/backup.mjs --backup` (pg_dump com `backup_user`) e `--restore-test` em banco separado.
- **Físico + WAL (PITR):** PostgreSQL arquiva WAL em `pg-wal-archive` (`archive_timeout=60`). Base física com `pg_basebackup`. Ensaio automatizado: `node scripts/pitr-drill.mjs --test`.
- **Ledger de eliminações** fora do banco: `privacy-ledger/` no S3.
- Pendente (D04): cópia externa cifrada do WAL/base/S3, retenção 30 dias, chaves de recuperação separadas.

## Passos
1. Registrar incidente (horário, causa provável). Pausar vendas: Dono/operador; não reabrir cobranças.
2. Provisionar ambiente limpo; restaurar banco até o ponto escolhido (PITR: extrair base, `restore_command`, `recovery_target_time`, `recovery.signal`). Restaurar segredos (`PAYMENT_ENCRYPTION_KEY`, senhas de papéis) do cofre — sem eles os tokens das contas não são legíveis.
3. Executar:
   ```sh
   node scripts/ops.mjs post-restore "Restauração <data>: conciliação pendente"
   node scripts/ops.mjs reapply-erasures
   ```
   `post-restore` pausa vendas, converte tentativas PREPARED em UNKNOWN (o worker consulta antes de cobrar), retém e-mails pendentes (HELD) e agenda consulta de todas as tentativas.
4. Subir o worker; conferir lojas, saldos e pedidos de amostra; acompanhar `node scripts/ops.mjs status` até zerar INBOX/OUTBOX backlog.
5. Conciliar a janela afetada com o painel do Mercado Pago (recebimentos e devoluções posteriores ao ponto restaurado). A restauração **não** desfaz cobranças/devoluções reais e não autoriza cobrar de novo.
6. Revisar e-mails HELD (reenviar só os necessários pelo painel do pedido).
7. Teste controlado; retomar vendas (`node scripts/ops.mjs resume-sales <tenant> "motivo"`). Registrar tempos e perda real.

## Ensaios executados
Ver `docs/execucao/fase-4.md`: restore lógico + reconciliação com provedor SIMULADO (T26), reaplicação de eliminação (T32) e PITR em container limpo com RPO/RTO medidos em dados sintéticos.
