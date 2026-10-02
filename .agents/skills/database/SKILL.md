---
name: database
description: "Padrões de modelagem, tipos de dados e performance no PostgreSQL com Drizzle"
---

# Database & SQL Rules

## Tipos de Dados e Convenções
1. **Identificadores:** UUIDv7 para todas as primary keys (ordenadas por timestamp).
2. **Dinheiro:** Sempre use **BIGINT** em centavos (ex: R$ 10,50 = 1050). **NUNCA use float ou double**.
3. **Data e Hora:** Sempre use **TIMESTAMPTZ** em UTC.
4. **Foreign Keys:** Toda relação entre tabelas deve possuir FK explícita.
5. **Índices & EXPLAIN:** Antes de criar índices, execute `EXPLAIN ANALYZE` via PostgreSQL MCP. Garanta que consultas frequentes usem índices compostos iniciando por `tenant_id`.
