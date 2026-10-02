## Commit message

You are an expert at writing Git commits. Your job is to write a short clear commit message that summarizes the changes.

If you can accurately express the change in just the subject line, don't include anything in the message body. Only use the body when it is providing *useful* information.

Don't repeat information from the subject line in the message body.

Only return the commit message in your response. Do not include any additional meta-commentary about the task. Do not include the raw diff output in the commit message.

Follow good Git style:

- Separate the subject from the body with a blank line
- Try to limit the subject line to 50 characters
- Capitalize the subject line
- Do not end the subject line with any punctuation
- Use the imperative mood in the subject line
- Wrap the body at 72 characters
- Keep the body short and concise (omit it entirely if not useful)

---

## Production SaaS Rules & AI Guardrails

### 1. Architecture
- **Stack Fixa:** Monólito modular com **NestJS + Fastify**, **Drizzle ORM**, **PostgreSQL**, **BullMQ** e **Next.js**.
- **Não crie microserviços:** Mantenha o monólito modular coeso. Não invente arquiteturas distribuídas desnecessárias.
- **Não troque a stack:** Não substitua bibliotecas nem altere a stack sem motivo concreto e solicitação explícita.
- **Consultas a documentações:** Utilize o Context7 MCP para consultar a documentação oficial e atualizada das bibliotecas (Nest, Fastify, Drizzle, BullMQ, etc.) antes de assumir APIs desatualizadas.

### 2. Multi-Tenant
- **`tenant_id` Obrigatório:** Toda tabela e entidade de dados deve conter explicitamente a coluna `tenant_id`.
- **Row-Level Security (RLS) Obrigatório:** O isolamento de dados entre tenants deve ser garantido a nível de banco de dados via RLS no PostgreSQL.
- **Transações com Contexto:** Sempre execute `SET LOCAL app.current_tenant_id = '...'` dentro de cada transação.
- **Privilégios:** O usuário da aplicação (`app_user`) NUNCA deve ser owner ou superuser do banco de dados (para que o RLS não seja burlado).
- **Cache Seguro:** Chaves de cache no Redis/memória devem sempre prefixar o `tenant_id` (ex: `tenant:{id}:produtos`).
- **Chaves Estrangeiras:** Utilize FKs compostas `(tenant_id, id)` para impedir que um tenant referencie dados de outro.

### 3. Database & SQL
- **Identificadores:** Utilize **UUIDv7** (ordenáveis cronologicamente) para chaves primárias.
- **Dinheiro e Moeda:** Utilize **BIGINT** em centavos (ou formato monetário inteiro) para valores financeiros. **NUNCA use float ou double para dinheiro**.
- **Datas:** Utilize sempre **TIMESTAMPTZ** (UTC com timezone).
- **Índices e Performance:** Use `EXPLAIN ANALYZE` (via PostgreSQL MCP) antes de inventar ou remover índices. Toda busca frequente por tenant deve ser coberta por índice.

### 4. Payments & Webhooks
- **Idempotência Rigorosa:** Toda operação de cobrança e webhook deve possuir chave de idempotência no banco de dados.
- **Estado de Transação:** O status `UNKNOWN` **NÃO** significa `FAILED`. Em caso de dúvida ou timeout de rede, nunca reprocesse ou duplique cobrança.
- **Webhooks:** Não confie cegamente no payload do webhook. Valide a assinatura e consulte ativamente a API do gateway para confirmar o status da transação.
- **Padrão Outbox:** Emissões de eventos críticos de pagamento e conciliação devem usar o padrão Transactional Outbox.
- **Casos de Borda:** Trate explicitamente: pagamentos tardios (late payment), pagamentos em excesso (excess payment), estornos parciais/totais e conciliação.

### 5. Testing & Quality Assurance
- **Não assuma que "compilou = funciona":** Código pronto é código testado e verificado.
- **Testes com Playwright MCP:** Utilize o Playwright para validar vitrine, painel de administração, carrinho de compras, fluxo completo de checkout e, fundamentalmente, testar o **isolamento entre lojas** (garantir que Loja A nunca enxergue dados da Loja B e que funcionários não acessem cobranças de outros tenants).
- **Testes Unitários e E2E:** Cobrir cenários críticos de negócio e regressão.
