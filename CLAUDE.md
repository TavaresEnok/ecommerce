# CLAUDE.md

As regras gerais do projeto (stack, multi-tenant, banco, pagamentos, testes e mensagens de commit) estão em [AGENTS.md](AGENTS.md).

## Interface e design

Antes de qualquer mudança de interface em `apps/web` (páginas, componentes, estilos, textos de tela), leia:

1. [DESIGN.md](DESIGN.md) — direção, fundamentos, componentes, conteúdo, temas por loja e regras de manutenção.
2. [docs/design/TELAS-E-FLUXOS.md](docs/design/TELAS-E-FLUXOS.md), [docs/design/ACEITE.md](docs/design/ACEITE.md) e [docs/design/IMPLEMENTACAO.md](docs/design/IMPLEMENTACAO.md) — rotas reais, critérios verificáveis e lotes.
3. [docs/design/tokens.json](docs/design/tokens.json), o protótipo em [docs/design/preview/index.html](docs/design/preview/index.html) e o estado em [docs/design/STATUS.md](docs/design/STATUS.md).

Esses documentos complementam `docs/especificacao.md` e não mudam regras de negócio. Rode `node docs/design/verificar.mjs` após mexer em tokens, estilos ou nesses documentos.
