---
version: 1
slug: "apps-web-components-panel"
primary_target: "apps/web/components/panel"
related_targets: ["apps/web/components/storefront.tsx"]
---

# Painel da loja e vitrines — evolução Compasso (04/10/2026)

Escopo: painel (`apps/web/components/panel`, rotas `/painel/*`, `/`, `/plataforma`) em modo Operate; vitrines dos três modelos e checkout (`components/storefront.tsx`, `checkout.tsx`) em modo Persuade, cada loja com identidade própria.
Público: lojista brasileiro de qualquer segmento (painel); comprador visitante (vitrine).
Restrições: regras de negócio, contratos financeiros e testes preservados; sem paginação, lote ou busca global inventados; reordenar/remover imagens de produto não existe na API.

## Direction contract

THESIS: o painel é uma única área de trabalho clara, não um mural de cartões cinza-e-branco; recusa o kit SaaS de caixas idênticas com sombra.
OWN-WORLD: lateral mineral #F4F6F8 de 224 px, plano branco; azul #2548D8 só em ação, seleção e foco; Manrope compacta nos títulos, IBM Plex Sans na leitura; raios 8/12/16.
STORY: o lojista acha o produto, entende preço e saldo de relance e edita sem perder o lugar; o comprador vê produto inteiro, preço e total sem ruído.
FIRST VIEWPORT: catálogo com título 32 px e “Novo produto” à direita, barra de busca larga, lista de linhas de 72 px com miniatura de 48 px, nome em até duas linhas e preço tabular alinhado à direita.
FORM: assinatura = listas com miniaturas úteis e números alinhados + seleção azul precisa; direção fixada pelo brief (Compasso), sem sorteio; caminho code-led (sem geração de imagem).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
