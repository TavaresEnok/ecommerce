---
name: architecture
description: "Regras permanentes de arquitetura para o monólito modular NestJS + Fastify"
---

# Architecture Rules

## Stack Tecnológica
- **Backend:** Monólito modular com NestJS + Fastify.
- **ORM / Banco:** Drizzle ORM + PostgreSQL.
- **Filas e Jobs:** BullMQ + Redis.
- **Frontend:** Next.js (App Router).

## Guardrails
1. **Não crie microserviços:** Mantenha os módulos bem delimitados dentro do monólito.
2. **Não altere a stack:** Não substitua bibliotecas nem adicione dependências pesadas sem justificativa formal.
3. **Documentação Atualizada:** Use o Context7 MCP para consultar APIs do NestJS, Fastify, Drizzle e BullMQ em vez de assumir assinaturas antigas.
