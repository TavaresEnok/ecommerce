# Comercialização — decisões da Fase 6

Especificação v1.1, seções 5, 7, 10, 14–17, 19 e 22. Orientação do responsável (02/10/2026): preço e provedores podem ficar para depois; implementar o que não depende de terceiros e decidir o restante pela melhor opção técnica. Nada aqui é preço aprovado, contratação ou liberação comercial.

## MFA e administração da plataforma
- **TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos)** implementado com `node:crypto`, segredo AES-256-GCM (`MFA_ENCRYPTION_KEY`, fora do banco), janela ±1 passo, proteção contra replay (`last_used_step`) e 10 códigos de recuperação de uso único (hash). A sessão guarda `mfa_at`.
- Exigem MFA confirmado na sessão: devolução pela plataforma, contratação/troca/cancelamento de plano, domínio próprio e **toda** a administração da plataforma. Escolha: não exigir MFA para o login comum, para não travar a operação diária do piloto; ações de risco ficam atrás do MFA.
- Papel de administrador da plataforma é separado das lojas; concedido/revogado **só pelo operador** com credencial de migração (`scripts/platform-admin.mjs`). A aplicação não consegue se promover. Toda ação e toda consulta de dados de uma loja exigem motivo e geram `access.platform_audit`.

## Planos, assinatura, faturas e cotas
- Catálogo global `platform.plan_versions` (exceção documentada à regra de `tenant_id`, como `access.users`): versões **imutáveis** (só o estado muda); ACTIVE de plano pago exige preço > 0 e recorrência mensal (CHECK no banco). Comissão fixa em 0.
- PILOT v1 (seção 16.1): 100 produtos ativos, 500 variações ativas, 1 GiB de mídia com **tolerância**, 2 pessoas. Lojas existentes migradas para PILOT.
- Estados TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELLED; upgrade/downgrade no próximo ciclo sem proporcional; cancelamento ao fim do período; **tolerância de 7 dias** (padrão proposto, a confirmar na política comercial). SUSPENDED/CANCELLED bloqueiam apenas **novas vendas** no backend; pedidos, conciliação, devoluções, exportação e faturamento continuam.
- Fatura com valor imutável (privilégio de coluna), uma por assinatura/período (UNIQUE), cobrança idempotente por fatura, eventos do provedor deduplicados e status sempre relido do provedor.
- **Provedor de cobrança recorrente: não escolhido (D07).** Implementado contrato `BillingProvider` + simulador no banco (somente development/test). Fora disso, contratar plano pago retorna 409.
- Cotas no servidor com lock da loja (concorrência na última vaga resolvida). Downgrade não apaga dados; bloqueia só o crescimento.

## Mídia (T38)
- Planos `STRICT`: o original entra no armazenado e o tamanho derivado máximo (8 MiB) é reservado na mesma transação, com `armazenado + reservado ≤ cota` garantido por UPDATE condicional. A reserva termina uma vez (READY → COMMITTED; falha/abandono → RELEASED na conciliação, que recalcula os contadores). PILOT mantém a tolerância da seção 7.

## Reembolso iniciado pela plataforma (T18)
- Dono + MFA. Intenção persistida (REQUESTED) antes da chamada; lock do pedido serializa o saldo: recebido − devoluções confirmadas (inclusive as feitas no painel) − solicitações abertas. Chave idempotente própria. Recusa → FAILED + incidente REFUND_FAILED; resposta perdida → UNKNOWN + REFUND_UNCERTAIN, retomada pelo worker **consultando antes** e repetindo só com a mesma chave. CONFIRMED somente quando o provedor lista a devolução. Disputa aberta bloqueia.
- Mercado Pago: adaptador candidato `POST /v1/payments/{id}/refunds` com `X-Idempotency-Key`, **não homologado** (Fase 0).

## Domínio próprio (T28/T37)
- Escolha: **Caddy On-Demand TLS** como provedor padrão (alternativa prevista na seção 17.1) porque não depende de conta/orçamento de terceiro; Cloudflare for SaaS continua opção (`provider` na tabela) quando D03 for decidido.
- Ciclo PENDING_VERIFICATION → PENDING_TLS → ACTIVE / FAILED / DISABLED. Prova: TXT `_ecommerce-challenge.<host>` com token novo por cadastro; roteamento: CNAME para `PLATFORM_HOST` (ou A iguais). Unicidade global só entre domínios **verificados** (cadastros pendentes não bloqueiam o dono real). ACTIVE só depois que HTTPS entrega exatamente esta loja (`data-store`). Endpoint interno `ask` autoriza certificado apenas para hostnames comprovados; bloqueado no proxy público.
- Canônico por ação explícita: canonical/sitemap/JSON-LD passam ao domínio; GET/HEAD do endereço antigo recebem 301 com caminho e parâmetros; POST/checkout/webhook nunca são redirecionados. Remoção desativa o vínculo e reverte o canônico; outra loja precisa de nova prova. Revalidação periódica: 3 falhas → FAILED.

## Frete integrado (T31)
- Interface `ShippingProvider` + simulador; **agregador não escolhido (D09)** — Melhor Envio continua candidato, sem código não testado. Embalagem: uma caixa (maior comprimento/largura, alturas empilhadas, pesos somados), limites 30 kg / lado 1 m / soma 2 m; item sem peso/dimensão não é cotado. Provedor chamado fora de transação; validade = mínimo(15 min, provedor); mudança de configuração incrementa a versão da regra e invalida cotações; falha → 503 sem frete grátis, métodos locais continuam. Compra de etiqueta não incluída.
