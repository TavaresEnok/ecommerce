# Checklist de configuração comercial (Fase 6)

Nenhum item abaixo foi executado em produção. Marque somente com evidência e responsável.

## Decisões do responsável
- [ ] **D07** Preço, recorrência, política de cancelamento, tolerância de inadimplência (padrão técnico: 7 dias) e emissão fiscal da receita SaaS.
- [ ] **D07** Provedor de cobrança recorrente (conta da plataforma, separada das contas dos lojistas) — implementar adaptador de `BillingProvider` e homologar aprovação, falha, atraso, cancelamento e webhook.
- [ ] **D03** Domínio da plataforma (`PLATFORM_HOST`), DNS e rota pública; manter Caddy On-Demand ou contratar Cloudflare for SaaS.
- [ ] **D09** Agregador de frete, credenciais, contrato e se haverá compra de etiqueta.
- [ ] **T30** Somente se houver plano com comissão.

## Configuração técnica
1. `npm run setup` em cada ambiente (gera `MFA_ENCRYPTION_KEY`; guardar no cofre junto com `PAYMENT_ENCRYPTION_KEY` — sem elas MFA e tokens não são recuperáveis após restauração).
2. Conceder administração: `node scripts/platform-admin.mjs grant <email> "<motivo>"`; o administrador ativa MFA no painel.
3. Criar a versão do plano pago em `/plataforma` (rascunho) e ativar só após D07.
4. Definir `PLATFORM_HOST` no API/web/Caddy; validar `infra/Caddyfile` (`caddy validate`) e testar o `ask` interno.
5. Rodar `node scripts/verify.mjs --phase=6` e `node scripts/capacity.mjs` no ambiente equivalente.
6. Registrar decisões em `docs/execucao/evidencias/fase-6/decisoes-comerciais.json` (decisão, responsável, data, provedor/ambiente homologado, referência). Sem esse arquivo o verificador retorna pendência.

## Deploy e rollback
Seguir `deploy-rollback.md`. A migration 0009 é aditiva (novas tabelas/colunas, função de resolução substituída com o mesmo contrato) e migra todas as lojas para o PILOT. Rollback de aplicação para a Fase 5 é compatível: tabelas novas ficam sem uso; a regra de frete CARRIER fica inativa para a versão anterior, que só cota PICKUP/TABLE.
