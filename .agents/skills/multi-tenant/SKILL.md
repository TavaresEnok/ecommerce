---
name: multi-tenant
description: "Regras críticas de isolamento multi-tenant e RLS no PostgreSQL"
---

# Multi-Tenant Guardrails

## Regras Obrigatórias
1. **`tenant_id` Obrigatório:** Toda tabela e entidade deve possuir a coluna `tenant_id`.
2. **Row-Level Security (RLS):** Toda tabela de tenant deve ter RLS ativado no PostgreSQL (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
3. **Transações:** Sempre execute `SET LOCAL app.current_tenant_id = '...'` dentro do bloco de transação antes de qualquer operação.
4. **Privilégios:** O usuário `app_user` nunca deve ter privilégio `BYPASSRLS` ou ser `SUPERUSER`.
5. **Cache:** Chaves de cache no Redis sempre devem incluir o `tenant_id` (ex: `tenant:{id}:...`).
6. **Chaves Estrangeiras:** Foreign keys devem ser compostas `(tenant_id, id)` para impedir vazamento entre lojas.
