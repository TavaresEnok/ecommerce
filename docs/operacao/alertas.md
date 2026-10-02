# Alertas, responsáveis e saúde

Fonte: worker (`{"event":"alert",...}` em log a cada 60 s), painel → Operação, `node scripts/ops.mjs status`. Canal externo de aviso (e-mail/telefone) depende de D05/D06 — até lá o operador consulta diariamente.

| Código | Severidade | Limite | Responsável | Procedimento |
|---|---|---|---|---|
| FINANCIAL_INCIDENT_OPEN | crítico | qualquer | Dono | incidente-financeiro.md |
| PAYMENT_UNCERTAIN | crítico | qualquer | Dono + operador | incidente-financeiro.md (nova consulta) |
| FINANCIAL_COMMUNICATION_PENDING | crítico | qualquer | Dono | atendimento.md passo 3 |
| INBOX_BACKLOG | crítico | > 5 min | Operador | verificar worker/PostgreSQL; logs `payment_inbox_retry` |
| OUTBOX_FAILED | crítico | ≥ 5 falhas | Operador | corrigir causa; “Reprocessar eventos” no pedido |
| OUTBOX_BACKLOG | aviso | > 5 min | Operador | verificar worker/Redis (`/health/ready`) |
| NOTIFICATION_BACKLOG | aviso | > 15 min | Operador | provedor de e-mail configurado? (`mail_provider_not_configured`) |
| NOTIFICATION_FAILED | aviso | qualquer | Dono | reenviar no pedido após corrigir destinatário/provedor |
| SUPPORT_OVERDUE | aviso | prazo vencido | Equipe da loja | atendimento.md |

## Saúde
- API: `/health/live`, `/health/ready` (PostgreSQL + Redis). Worker: heartbeat a cada 5 s (healthcheck Compose).
- Redis de filas: `noeviction` + AOF. Perda do Redis é reconstruída a partir da outbox (T21).
- PostgreSQL: `pg_stat_archiver` (falhas de arquivamento) e uso de disco — monitoramento de host pendente (D06).
- Logs: JSON com rotação 10 MB × 3; cookies, CSRF, tokens e URLs de banco são removidos.
- Não implementado: alerta de certificado/HTTPS e de backup externo atrasado (dependem de D03/D04).
