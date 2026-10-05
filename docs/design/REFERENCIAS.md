# Referências de design — fontes, status de consulta e aplicação

**Data da tentativa de consulta:** 02/10/2026 · **Ambiente:** sessão de nuvem do Claude Code com política de rede restrita.

## Status de acesso

Todas as seis referências foram tentadas por `curl` e pela ferramenta de busca de páginas. O proxy de saída do ambiente respondeu **403 (CONNECT negado por política)** para `shopify.dev`, `www.carbondesignsystem.com`, `hydrogen.shop`, `baymard.com`, `www.radix-ui.com` e `www.w3.org`. Portanto:

- **Nenhum conteúdo dessas páginas foi lido nesta sessão.** O status de cada uma é “referência fornecida; não consultada nesta sessão”.
- Os princípios abaixo vêm do texto do pedido do responsável e de conhecimento geral prévio sobre esses materiais. Não são citações nem observações visuais.
- Não há captura, imagem, trecho de código ou identidade copiados de nenhum desses sites.
- Para consultar numa próxima sessão, liberar esses domínios em *Network access* nas configurações do ambiente e atualizar a coluna “Status” com data e conteúdo efetivamente acessado.

Único recurso externo efetivamente obtido: pacote npm `@ibm/plex-sans` 1.1.0 (registro `registry.npmjs.org`, permitido), licença SIL OFL 1.1, do qual foram copiados três arquivos WOFF2 Latin-1 e a licença para `docs/design/preview/fonts/`.

## Referências e aplicação

| # | Fonte | Status | Princípio usado (do pedido / conhecimento geral) | Aplicação concreta neste projeto |
|---|---|---|---|---|
| 1 | Shopify Polaris — https://shopify.dev/docs/api/polaris | Referência fornecida; não consultada nesta sessão | Consistência de componentes e de linguagem nas superfícies administrativas de comércio | Um conjunto único de componentes do painel (DESIGN.md §6), rótulos de estado centralizados (§8.2), uma ação principal por área, contexto da loja persistente. **Não** adotar Polaris, web components ou dependência da Shopify. |
| 2 | IBM Carbon — Data table — https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines | Referência fornecida; não consultada nesta sessão | Tabela com cabeçalho, barra de ferramentas, busca, filtros, ações e paginação | DataTable (§6) para produtos, pedidos, protocolos e lojas — **somente** com operações suportadas: hoje a API do painel não pagina nem faz ações em lote; filtros de pedidos existem no servidor (`payment_status`, `fulfillment_status`, `order_status`, `number`, `pending`); filtro de produtos é local sobre até 100 itens e isso é dito na interface. Não instalar Carbon. |
| 3 | Hydrogen Demo Store — https://hydrogen.shop/ | Referência fornecida; não consultada nesta sessão — **nenhuma observação visual foi feita** | Vitrine navegável: catálogo, página de produto, adaptação a telas menores | Usado só como tema de estudo. A composição da vitrine (DESIGN.md §10, protótipo Composição 4) é original: imagem 4:5 protagonista, compra ao lado, informação em lista com divisórias, relacionados em grade simples. Não copiar imagens, identidade nem código. |
| 4 | Baymard — campos no checkout — https://baymard.com/research-articles/checkout-flow-average-form-fields | Referência fornecida; não consultada nesta sessão | A quantidade de campos que o comprador precisa administrar pesa na dificuldade; reduzir etapas sozinho não elimina essa dificuldade | Checkout mantém só os campos do contrato atual (CEP, rua, número, cidade, UF, complemento opcional, nome, e-mail, método), agrupados em Entrega / Seus dados / Pagamento, com etapas concluídas resumidas. Nenhum campo obrigatório removido; nenhum campo novo (bairro, telefone, CPF) sem decisão de produto — ver pendência em STATUS.md. |
| 5 | Radix — Dialog — https://www.radix-ui.com/primitives/docs/components/dialog | Referência fornecida; não consultada nesta sessão | Diálogo com foco inicial, fechamento coerente, nome acessível e retorno de foco | Componente Dialog (§6) sobre `<dialog>` nativo: `aria-labelledby`/`aria-describedby`, foco inicial no campo, Esc fecha, foco volta ao botão de origem — **verificado** no protótipo pelo script de captura. Não adicionar Radix: o projeto não tem biblioteca de componentes e o elemento nativo atende. |
| 6 | W3C — WCAG 2.2 Quick Reference — https://www.w3.org/WAI/WCAG22/quickref/ | Referência fornecida; não consultada nesta sessão | Contraste, teclado, foco, redimensionamento e formulários | Requisitos convertidos em verificações (DESIGN.md §13 e ACEITE.md): contraste calculado pelo verificador, foco visível, alvos de toque de 44×44 px nas ações principais (piso absoluto de 24 px do critério 2.5.8; ver DESIGN.md §13 e D-15), rótulos e erros associados, reflow em 320 px, mensagens de estado. **Não** se declara conformidade total com base em teste automatizado. |

## Referência externa × proposta original

| Material | Natureza |
|---|---|
| Sites acima | Referências externas de **princípio**. Nenhuma captura ou trecho reproduzido. |
| `docs/design/preview/index.html` e `styles.css` | **Proposta visual autoral** deste projeto: prancha de tokens/componentes e cinco composições, com dados fictícios. |
| Ilustrações de produto no protótipo | SVG simples desenhados para o protótipo, marcados como **ilustração demonstrativa**. Não são fotos comerciais nem podem ser usados como imagem de produto real. |
| IBM Plex Sans | Fonte de terceiros sob OFL 1.1, redistribuída com a licença. |
| Capturas em `docs/design/preview/capturas/` | Renderizações do nosso protótipo (Chromium headless), não de sites externos. |

## Consulta de 03/10/2026 — evolução de UX e personalização

Sessão do Claude Code no computador do responsável, com acesso à web. Páginas abertas por busca de página (texto) e pelo navegador embutido. Nenhuma imagem, texto, código, nome de tema ou identidade foi copiado; o que segue são princípios e a aplicação própria neste projeto. Concorrentes foram consultados só como referência de categoria, nunca como modelo a reproduzir.

| Fonte (URL) | Status do acesso | Princípio observado | Aplicação concreta |
|---|---|---|---|
| Shopify Themes e preset do tema Dawn — https://themes.shopify.com/ , https://themes.shopify.com/themes/dawn/presets/dawn | Acessado (texto) | Um tema oferece *presets* que mudam composição e tipografia, não só cor; a página inicial é montada por seções | Três modelos com composição própria (DESIGN §11, D-29); página inicial por seções tipadas |
| Loja de demonstração do Dawn — https://theme-dawn-demo.myshopify.com/ , `/collections/all` | Acessado (navegador) | Catálogo completo como rota própria, com o primeiro produto logo no início no celular | Rota `/produtos` (R17) e medida UX01 |
| Nuvemshop — https://www.nuvemshop.com.br/layouts | **404** | — | — |
| Nuvemshop — https://www.nuvemshop.com.br/loja-layouts-nuvem e `/rio` | Acessado (texto); **loja de demonstração não aberta** | Temas apresentados por segmento de negócio, com opções de identidade sobre uma base pronta | Descrição de cada modelo pelo segmento (“Para moda e acessórios…”) e troca de modelo preservando o conteúdo |
| WooCommerce — https://woocommerce.com/products/themes/ | **404** | — | — |
| WooCommerce — https://woocommerce.com/product-category/themes/ e `/products/hypermarket/` | Acessado (texto) | Temas como ponto de partida por tipo de loja; catálogos grandes pedem grade densa e busca em destaque | Modelo Essencial: busca sempre visível, categorias primeiro, grade densa |
| Baymard — https://baymard.com/research e `/research/apparel-and-accessories` | Acesso parcial: títulos públicos, conteúdo pago | Não aplicado além de princípios gerais já registrados em 02/10 | — |
| IBM Carbon — Data table (uso) — https://carbondesignsystem.com/components/data-table/usage/ | Acessado (texto) | Barra com busca e filtros, filtros aplicados visíveis, ações em lote só quando existem | Lista de produtos com busca de escopo declarado, filtros na URL e chips removíveis; sem ações em lote (a API não tem) |
| Shopify Polaris — https://shopify.dev/docs/api/polaris , `/app-home/polaris-web-components` , tabela em `/app-home/latest/web-components/layout-and-structure/table` | Acessado (texto) | Tabelas administrativas viram linhas compactas em telas pequenas | Lista de produtos em linhas compactas no celular (foto, nome, preço, saldo) |
| W3C — WCAG 2.2 Quick Reference — https://www.w3.org/WAI/WCAG22/quickref/ | Acessado (texto) | 1.4.10 reflow em 320 px; 2.4.11 foco não encoberto; 2.5.7 movimentos de arrastar têm alternativa; 2.5.8 tamanho do alvo | Verificação em 320/640 px (AX01); reordenar seções e links com botões ↑/↓ (sem arrastar); alvos de 44 px |

Limitações: a loja de demonstração da Nuvemshop e as páginas de demonstração de temas da WooCommerce não foram abertas; a Baymard não foi lida (conteúdo pago). Nenhum teste com usuários foi feito; não há afirmação de superioridade sobre concorrentes nem de efeito em conversão.

### Recursos de terceiros incorporados nesta rodada

| Recurso | Origem | Licença | Onde |
|---|---|---|---|
| Bodoni Moda 500/600, Archivo 500/600/700, Fraunces 400/600 (subconjunto latino, WOFF2) | pacotes npm `@fontsource/bodoni-moda`, `@fontsource/archivo`, `@fontsource/fraunces` 5.3.0 (registro npm) | SIL OFL 1.1 | `apps/web/app/fonts/` com `OFL-*.txt` |
| 42 imagens de demonstração (41 fotos + 1 ilustração PNG) | Openverse (API pública), filtro `cc0,pdm`, maioria do diretório de fotos do WordPress; uma ilustração com o quadriculado de fundo convertido em transparência real | CC0 / domínio público; origem, autor e URL de cada arquivo em `scripts/fixtures/fotos.json` | `scripts/fixtures/fotos/` (só para dados de demonstração; uma foto com marca visível foi descartada) |
| Manrope 500/600/700 (subconjunto latino, WOFF2) — rodada Compasso | pacote npm `@fontsource/manrope` 5.3.0 | SIL OFL 1.1 | `apps/web/app/fonts/` com `OFL-Manrope.txt` |
| 2 fotos de demonstração novas (Ateliê “Como fazemos”; abertura do Editorial) — rodada Compasso | Openverse: Jennifer Bourn (c3323814, CC0) e Snufkin/StockSnap (3213eb9e, CC0) | CC0 | `scripts/fixtures/fotos/` + `fotos.json` |
