# Vitrine e compra — continuação do redesign

Rodada de 06/10/2026, branch `codex/redesign-workspace`. Componentes reais do Next em build de produção, com servidor HTTP sintético compartilhado pelo SSR e pelas chamadas do navegador (estas encaminhadas por Playwright). Não valida o proxy de produção. Produtos, contatos, políticas e valores são demonstrativos; fotos das fixtures já existentes.

## Capturas

| Tela | Desktop | Celular |
|---|---|---|
| Ateliê | [1440](loja-atelie-1440.jpg) | [390](loja-atelie-390.jpg) |
| Editorial | [1440](loja-editorial-1440.jpg) | [390](loja-editorial-390.jpg) |
| Essencial | [1440](loja-essencial-1440.jpg) | [390](loja-essencial-390.jpg) |
| Produto | [1440](produto-1440.jpg) | [390](produto-390.jpg) |
| Revisão | [1440](checkout-revisao-1440.jpg) | [390](checkout-revisao-390.jpg) |

Inspeção visual: três vitrines desktop, Ateliê celular, produto desktop e revisão celular. Capturas pequenas usam a área visível na vitrine e a página inteira no produto/revisão. Não demonstram pedidos reais.

## Verificação

- `npm run typecheck -w @ecommerce/web` e `npm run build -w @ecommerce/web`: aprovados.
- `node docs/design/verificar.mjs` e `node docs/design/tokens-css.mjs --check`: aprovados; 52 pares de contraste e 117 variáveis existentes.
- `scripts/vitrine-redesign-check.mjs`: aprovado em 320, 390, 768 e 1440 px. 28 medidas de reflow sem rolagem horizontal ou erros de JavaScript; 10 capturas. Foco de busca/Escape, menu/estado/foco, galeria, variação esgotada, inclusão no carrinho, entrega, comprador, revisão e recuperação de confirmação incerta após 503 e recarga. As duas requisições de confirmação têm corpo idêntico, incluindo a chave. Comprovante continua aguardando pagamento.
- Troca de loja verifica somente identidade na interface; não comprova isolamento de servidor.
- `scripts/redesign-check.mjs`: regressão de acesso, catálogo, Hoje, menu e ações por papel, aprovada nas quatro larguras.
- [resultado.json](resultado.json) registra cenários e medidas.

Reprodução: `npm ci`, build do frontend e `node scripts/vitrine-redesign-check.mjs` na raiz com Chromium do Playwright. `CHROMIUM_EXECUTABLE` aceita navegador instalado e `WEB_TEST_PORT` altera a porta padrão 3411. O script inicia e encerra Next e a API sintética.

Nesta sessão o CLI agent-browser não iniciou seu daemon; foi usado Playwright diretamente. Downloads padrão de navegador falharam; Chromium veio de `@sparticuz/chromium`, sem adicionar dependência ao projeto. Node local 24.19.0 está abaixo do intervalo exigido (>=24.21.0 <25); repetir no CI com a versão declarada.

Sem Docker: suites completas com PostgreSQL/Redis/worker, autorização/RLS e gateway não executadas. Zoom real e leitor de tela não verificados. Aprovação visual humana pendente. Nenhuma mudança de API, schema, dinheiro ou lógica de confirmação.
