# Redesign do espaço de trabalho

Implementação sobre `91c0680`, branch `codex/redesign-workspace`, rodada de 05/10/2026 (America/Fortaleza). Escopo: acesso deslogado, casca compartilhada do painel, lista de produtos e Hoje. Vitrines, editor de temas, API e checkout não foram redesenhados nesta rodada.

## Capturas

Todas renderizam componentes reais do Next em build de produção, com respostas de API sintéticas interceptadas pelo Playwright. Fotografias de produtos vêm das fixtures CC0 já existentes no projeto. Os nomes, contadores e preços nas capturas são demonstrativos.

| Tela | Desktop | Celular |
|---|---|---|
| Acesso | [1440](acesso-1440.jpg) | [390](acesso-390.jpg) |
| Catálogo | [1440](catalogo-1440.jpg) | [390](catalogo-390.jpg) |
| Hoje | [1440](hoje-1440.jpg) | [390](hoje-390.jpg) |

Há também capturas em 320 e 768 px. Examinadas visualmente: acesso 1440, catálogo 1440/390 e Hoje 1440/390. O arquivo [resultado.json](resultado.json) registra as medidas de reflow e erros de JavaScript.

## Verificação

- `npm run typecheck -w @ecommerce/web`: aprovado.
- `npm run build -w @ecommerce/web`: aprovado.
- `node docs/design/verificar.mjs`: aprovado, 52 pares de contraste dos tokens e 17 rotas.
- `node docs/design/tokens-css.mjs --check`: aprovado.
- `scripts/redesign-check.mjs`: aprovado; 12 capturas, busca, filtros, registro/retorno, login inválido com e-mail preservado, contadores, menu/Escape/foco e ocultação das ações do Dono para Funcionário.

Para reproduzir: iniciar o frontend na porta 3400 e executar `WEB_URL=http://localhost:3400 node scripts/redesign-check.mjs` com Chromium instalado para Playwright. `CHROMIUM_EXECUTABLE` aceita outro caminho de Chromium. Nesta sessão, os downloads padrão dos navegadores falharam; Chromium foi obtido do pacote npm `@sparticuz/chromium`, sem adicioná-lo ao projeto. O CLI agent-browser falhou ao iniciar o daemon; a validação foi feita diretamente com Playwright.

Integração com backend, autorização de servidor/RLS, compra, zoom real e leitor de tela não foram executados nesta rodada. Docker não está disponível neste ambiente. Node local 24.19.0 está abaixo do intervalo declarado pelo projeto (>=24.21.0); tipos e build passaram, mas o CI deve repetir os checks na versão exigida. A aprovação visual humana continua pendente.
