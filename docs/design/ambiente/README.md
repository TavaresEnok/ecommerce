# Ambiente da revisão visual (capturas e verificações de interface)

Reproduz, numa sessão nova, os dados e as rotas usados por [`capturar-rotas.mjs`](../capturar-rotas.mjs), [`verificar-teclado.mjs`](../verificar-teclado.mjs) e [`verificar-aceite.mjs`](../verificar-aceite.mjs). Tudo é **sintético** (`example.test`) e os pagamentos são **SIMULADOS**. Não use este ambiente com dados reais nem como homologação.

## Dependências

| Item | Para quê | Observação |
|---|---|---|
| Docker Engine + Compose v2 (≥ 2.17, `additional_contexts`) | serviços (Postgres 17.9, Redis, SeaweedFS, API, worker, web) | imagens do Docker Hub e build com `npm ci` (registro npm). Em rede com inspeção TLS, `subir` gera fora do git um Dockerfile derivado com a CA de `DESIGN_BUILD_CA` (ou `/root/.ccr/ca-bundle.crt`); o Dockerfile versionado não muda |
| Node ≥ 22 no host + `npm ci` na raiz | `gerar-dados.mjs` (usa `scripts/seed.mjs` e `sharp` de `packages/media`) e os scripts de captura | não instala nada globalmente |
| `.local/test.env` | segredos locais do ambiente de teste | `node scripts/setup.mjs --test` (gera sem exibir; não sobrescreve) |
| Chromium | capturas e verificações | [`navegador.mjs`](navegador.mjs): Playwright do repositório; se o navegador dele não estiver baixado, `PLAYWRIGHT_CHROMIUM=<executável>` ou `/opt/pw-browsers/chromium`; ou rode o script no contêiner `mcr.microsoft.com/playwright:v1.63.0-noble` (abaixo) |
| Fotos (opcional) | testar fotos reais na caneca | `--fotos=<pasta>` com `.png/.jpg`; sem a opção, são gerados gráficos rotulados “IMAGEM DE TESTE” |

## Preparação e execução

```bash
npm ci                                              # dependências do host (uma vez)
node scripts/setup.mjs --test                       # .local/test.env (uma vez)
node docs/design/ambiente/ambiente.mjs subir        # projeto Compose ecommerce-design-demo, web em http://localhost:3400
node docs/design/ambiente/ambiente.mjs dados        # cria lojas, pedidos, protocolos, funcionário e admin com MFA → .local/demo-ui.json
node docs/design/capturar-rotas.mjs depois          # capturas 390/768/1440 (+ --widths=320; --widths=1280 --zoom=2 simula o reflow do zoom; --texto=200 aumenta a fonte-raiz)
node docs/design/verificar-teclado.mjs              # foco, diálogo, variação por setas, etapas do checkout
node docs/design/verificar-aceite.mjs               # cenários do ACEITE fora das suítes (ALTERA os dados sintéticos)
```

- O pedido “aguardando pagamento” vence em 40 minutos (reserva real do domínio). Para recriá-lo sem refazer o resto: `node docs/design/ambiente/ambiente.mjs dados --so-pendente`.
- `verificar-aceite.mjs --only=ID,ID` executa só alguns cenários; ele expede pedidos, pausa e retoma vendas, suspende e reativa uma loja de teste e cria pedidos. Para recomeçar do zero: `limpar`, `subir`, `dados`.
- No contêiner do Playwright (sem Chromium no host): `docker run --rm --network host -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble node docs/design/capturar-rotas.mjs depois`.

## O que fica onde

| Arquivo | Conteúdo | Versionado? |
|---|---|---|
| [`compose.design.yaml`](compose.design.yaml) | sobreposição de `compose.yaml` + `compose.test.yaml`: imagem `ecommerce-design-demo:local`, porta `127.0.0.1:3400`, origem pública e limite por IP | sim |
| [`ambiente.mjs`](ambiente.mjs) | `subir`, `dados`, `status`, `descer`, `limpar` | sim |
| [`gerar-dados.mjs`](gerar-dados.mjs) | dados sintéticos pela API (o papel de administrador é concedido por `scripts/platform-admin.mjs` dentro do projeto) | sim |
| `.local/test.env` | segredos do ambiente de teste | **não** (`.local/` é ignorado) |
| `.local/demo-ui.json` | URLs, IDs, cookies de carrinho e senhas/segredo MFA das contas sintéticas | **não**; modo 0600 |
| `docs/design/evidencias/` | capturas e resultados (sem senhas, cookies ou tokens) | sim |

## Limpeza (restrita aos dados de teste)

```bash
node docs/design/ambiente/ambiente.mjs descer       # para os serviços, mantém os volumes
node docs/design/ambiente/ambiente.mjs limpar       # remove serviços e volumes SÓ do projeto ecommerce-design-demo e apaga .local/demo-ui.json
```

`limpar` usa sempre `--project-name ecommerce-design-demo`; não toca no projeto de desenvolvimento (`ecommerce-foundation`) nem nos de verificação (`ecommerce-phaseN-test`). As imagens `ecommerce-design-demo*:local` podem ser removidas com `docker image rm`.
