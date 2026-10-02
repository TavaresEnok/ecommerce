---
name: ecommerce-domain
description: "Modelos de domínio, entidades e regras de negócio do SaaS de comércio eletrônico"
---

# E-Commerce Domain & Business Rules

## Entidades Principais
- **Tenant (Loja):** Configurações, domínio/subdomínio, status e limites.
- **Product & Inventory:** Catálogo, variações (SKUs), preços em centavos (`BIGINT`), estoque atômico.
- **Cart & Order:** Carrinho persistente, cálculo de frete, snapshot de preços no momento da compra.
- **Customer:** Vínculo ao tenant com suporte a login unificado sem vazamento de dados de compras.
