# Plano de aplicação do redesign

Base: commit `0179f4d`. Aplica [DESIGN.md](../../DESIGN.md) às rotas reais de [TELAS-E-FLUXOS.md](TELAS-E-FLUXOS.md), verificando com [ACEITE.md](ACEITE.md). **Não** acrescenta funcionalidades de negócio, fases, rotas de servidor, dependências ou integrações. Mudanças são de apresentação, organização de tela e componentes de interface; chamadas de API, autorização, idempotência e regras ficam como estão.

## 1. Situação atual que o plano considera

- `apps/web` tem 9 arquivos de página e 5 componentes, todos `'use client'` (exceto vitrine/preview no servidor), com JSX em linhas longas e estilos globais mínimos em `apps/web/app/style.css` (cores `#164d8f`, `#f6b942`, fonte `system-ui`).
- Cada página repete: `api()`, `act()`, `fields()`, leitura de sessão/CSRF e descoberta do papel (Dono) via `GET /api/tenants`.
- Não existe pasta `public/`, `layout.tsx` por área, `not-found.tsx`, `error.tsx`, biblioteca de componentes ou de ícones.
- `apps/web/proxy.ts` reescreve **todo** caminho em host de loja para `/lojas/[slug]/…`, exceto `_next/static`, `_next/image` e `favicon.ico` (ver risco R-2).
- Testes Playwright em `tests/*.test.mjs` usam rótulos, nomes de botão, headings e `aria-label` de formulários (lista na §5).

## 2. Padrões → arquivos

| Padrão (DESIGN.md) | Arquivo a criar/alterar | Observação |
|---|---|---|
| Tokens e base (§3, §4) | `apps/web/app/style.css` (reescrever) | Copiar o `:root` de `docs/design/preview/styles.css` e as regras de base/componentes necessárias. Remover cores antigas. Estender `docs/design/verificar.mjs` para também comparar este arquivo com `tokens.json`. |
| Fonte IBM Plex Sans | `apps/web/app/fonts/*.woff2` + `OFL-IBM-Plex.txt` (copiar de `docs/design/preview/fonts/`) | `@font-face` com `url("./fonts/…")` dentro de `style.css`: o Next emite os arquivos em `/_next/static/media`, caminho que o proxy já não reescreve. Não usar `public/fonts` sem ajustar o matcher do proxy. |
| Metadados | `apps/web/app/layout.tsx` | Título “Plataforma” (hoje “Fundação — E-commerce”); manter `lang="pt-BR"` e `robots` noindex do painel. |
| Ícones | `apps/web/components/ui/icons.tsx` (novo) | Os 17 símbolos SVG do protótipo como componentes; `aria-hidden` por padrão. |
| Componentes (§6) | `apps/web/components/ui/` (novo): `Button.tsx`, `Field.tsx`, `MoneyInput.tsx`, `StatusBadge.tsx`, `Alert.tsx`, `FinancialAlert.tsx`, `DataTable.tsx`, `EmptyState.tsx`, `Loading.tsx`, `Dialog.tsx`, `PageHeader.tsx`, `SubNav.tsx`, `Summary.tsx` | Componentes de apresentação sem chamada de API. |
| Rótulos de estado (§8.2) | `apps/web/components/ui/status.ts` (novo) | Centraliza rótulo + tom; `components/checkout.tsx` passa a importar daqui. |
| Formatação | `apps/web/components/ui/format.ts` (novo) | `money()` (re-exportado de `storefront.tsx` para não quebrar imports), `toCents()` da §6 MoneyInput, `formatDate(iso, timezone)`. |
| Cliente de API do painel | `apps/web/components/panel/api.ts` (novo) | Extrai o `api()`/`act()` repetido, sem mudar URL, método, cabeçalhos (CSRF) ou tratamento de erro. |
| Casca do painel (§5.1) | `apps/web/app/painel/[tenantId]/layout.tsx` (novo, convenção do App Router — não cria URL) + `apps/web/components/panel/Shell.tsx` | Lateral, topo 64 px, contexto da loja (nome/papel via `GET /api/tenants` + `GET /api/tenants/:id/settings`), indicador “Pagamentos simulados” (`GET purchase/accounts`), estado de vendas (`GET operations/status`). Ao trocar `tenantId`, limpar estado (G-14). |
| Casca da plataforma (§5.4) | `apps/web/app/plataforma/page.tsx` + `components/panel/Shell.tsx` em modo `global` | Faixa `context-global`; bloco “Inspecionando”. |
| Marca da loja (§11) | `apps/web/components/brand.ts` (novo) | Mesmo algoritmo do verificador; usado em `Storefront` para definir `--store-*` no elemento raiz. Teste unitário com os quatro exemplos de `tokens.json`. |
| Vitrine/checkout | `apps/web/components/storefront.tsx`, `apps/web/components/checkout.tsx` | Reorganizar markup e classes; manter `api()`, `intentKey`, `accessHeader` e fluxos. |
| 404/erro da vitrine | `apps/web/app/lojas/[slug]/[[...path]]/not-found.tsx`, `apps/web/app/not-found.tsx`, `apps/web/app/error.tsx` (novos, convenção) | Sem nova URL. O texto puro do proxy (“Loja não encontrada”) continua para hosts desconhecidos. |

### Componentes existentes a reutilizar (não reescrever a lógica)

- `money()` e tipos `Product`, `Variant`, `Theme`, `StoreData` de `components/storefront.tsx`.
- `loadStore`, `loadProduct`, `loadStoreOptional`, `decimal` de `components/store-data.ts`.
- `Checkout`, `OrderView`, `ContactPage`, `Thread` de `components/checkout.tsx` (inclui idempotência, token de acesso e polling de 5 s).
- `AiDraftSection` (`components/ai-draft.tsx`) e `CommercialSections` (`components/commercial.tsx`): aplicar componentes de UI por dentro, mantendo `aria-label` das regiões.
- Mensagens `help` de alertas em `operacao/page.tsx` e `kinds` de protocolos.

## 3. Riscos e mitigação

| ID | Risco | Mitigação |
|---|---|---|
| R-1 | Testes Playwright quebram por mudança de texto/rótulo | Manter os seletores da §5; se um texto precisar mudar, atualizar o teste **no mesmo commit** e registrar no relatório. |
| R-2 | Arquivos estáticos em host de loja são reescritos pelo proxy para `/lojas/[slug]/…` | Fontes e ícones via pipeline do Next (`/_next/static`). Se criar `public/`, incluir o prefixo no `matcher` de `proxy.ts` e testar em `slug.localhost`. |
| R-3 | Casca do painel faz requisições extras e mostra dados de outra loja ao trocar | Carregar contexto por `tenantId`; resetar estado no efeito; teste G-14 com Loja A/B. |
| R-4 | “Simplificar” formulários remove campo obrigatório ou envia formato diferente | Editores (atributos, páginas, menu) geram **o mesmo JSON** de hoje; `MoneyInput` envia a mesma string de centavos; testes de API não mudam. |
| R-5 | Botão “Salvar” global fingindo atomicidade | Uma ação por operação da API (DESIGN §9). |
| R-6 | Estado financeiro mal comunicado (pendente parecendo sucesso) | Tons da §8.2; ACEITE A-R03-03/04/05, A-R13-01. |
| R-7 | Cores de marca ilegíveis | `brand.ts` + A-R02-13/A-R08-03. |
| R-8 | Fonte serifada sem Georgia no Linux | Pilha `Georgia, "Times New Roman", serif` cai para a serifada do sistema (no ambiente de captura: DejaVu/Liberation Serif). Aceitável; preços usam a família principal. |
| R-9 | Hidratação/desabilitação pré-hidratação (Fase 2 registrou timeout de clique) | Manter o padrão atual de botões desabilitados até `ready` onde ele existe. |
| R-10 | Verificador da fase usa digest das fontes | Mudanças de UI alteram o digest; reexecutar `scripts/verify.mjs` da fase vigente para gerar nova evidência — não editar evidências antigas. |
| R-11 | Arquivos grandes de uma linha dificultam revisão | Ao tocar um arquivo, formatá-lo de forma legível no mesmo commit, sem mudar comportamento. |

## 4. Lotes internos

Os lotes são etapas de implementação **desta mesma entrega de interface**, não fases de negócio. Cada lote termina com: typecheck/build de `apps/web`, verificador de design, capturas em 390/768/1440 das rotas do lote, linhas do ACEITE preenchidas, e suítes de UI afetadas executadas (ou registradas como não executadas, com o motivo).

### Lote 1 — Base e painel

Escopo: tokens, fontes, `style.css`, componentes `ui/`, `status.ts`, `format.ts`, cliente `panel/api.ts`, casca do painel, e as rotas abaixo.

| Rota | Entrega | Critério de conclusão |
|---|---|---|
| R01 `/` | Acesso em coluna central; lojas como lista com “Abrir painel”; configuração/equipe com componentes; próximos passos P01; diálogo para revogar sessões | A-R01-01…07 aprovados; `tests/foundation.test.mjs` verde |
| R02 `/painel/[tenantId]` | Casca; listagem em DataTable com busca/filtro locais; edição de produto na mesma rota (`?produto=`) com seções e lateral; editor de atributos; MoneyInput; vitrine e frete com prévia de marca | A-R02-01…14 aprovados; heading “Cadastrar produto simples” e fluxos de `tests/storefront.test.mjs` verdes |

Também conclui G-01, G-02, G-05, G-07, G-09, G-10, G-11 para a casca e os componentes.

### Lote 2 — Operação

| Rota | Entrega | Critério de conclusão |
|---|---|---|
| R03 `/painel/[tenantId]/pedidos` | Lista com filtros do servidor em DataTable; detalhe em duas colunas; FinancialAlert; expedição com bloqueios; diálogos de cancelar e anonimizar (substituem `confirm()`) | A-R03-01…10 aprovados; `tests/purchase-worker.test.mjs` e `tests/pilot-flow.test.mjs` verdes |
| R04 `/painel/[tenantId]/atendimento` | SegmentedFilter, tabela de protocolos, conversa + lateral | A-R04-01…04 aprovados; `tests/pilot-flow.test.mjs` verde |
| R05 `/painel/[tenantId]/operacao` | Alertas com instrução, vendas, seções de conta com SubNav; `AiDraftSection` e `CommercialSections` com componentes | A-R05-01…06 aprovados; `tests/commercial-ui.test.mjs` verde |
| R06 `/plataforma` | Casca global, tabela de lojas, consulta/suspensão em diálogo com motivo, “Inspecionando” estruturado, planos e auditoria em tabelas | A-R06-01…05 aprovados; `tests/commercial-ui.test.mjs` verde |

### Lote 3 — Vitrine e compra

| Rota | Entrega | Critério de conclusão |
|---|---|---|
| R07 `/preview/[tenantId]` | Faixa de preview privado; vitrine com tokens da loja | A-R07-01…02 aprovados |
| R08 `/lojas/[slug]` | Cabeçalho da loja, busca, categorias, grade 4:5, estados vazios; `brand.ts`; link “Painel” fora do menu (D-08) | A-R08-01…04 aprovados; `tests/storefront.test.mjs` verde |
| R09 `/lojas/[slug]/categorias/[categoria]` | Mesma grade com categoria atual | A-R09-01 aprovado |
| R10 `/lojas/[slug]/produtos/[produto]` | Galeria, VariantPicker, compra, informações; JSON-LD inalterado | A-R10-01…05 aprovados; testes de SEO (T37) verdes |
| R11 `/lojas/[slug]/paginas/[pagina]` | Leitura institucional | A-R11-01 aprovado |
| R12 `/lojas/[slug]/carrinho` | Etapas, resumo, CEP sem atendimento, revisão e confirmação | A-R12-01…07 aprovados; `tests/purchase-worker.test.mjs` verde |
| R13 `/lojas/[slug]/pedidos/[id]` | Comprovante, estado financeiro, solicitações e protocolos | A-R13-01…05 aprovados |
| R14 `/lojas/[slug]/atendimento` | Contato geral e acompanhamento | A-R14-01…02 aprovados; `tests/pilot-flow.test.mjs` verde |

Também conclui G-03, G-04, G-06, G-08, G-12, G-13, G-14, G-15 para todo o escopo.

### Lotes A–C — Evolução de UX e personalização (03/10/2026)

Critérios em [ACEITE.md §3](ACEITE.md) (UX01–QA01). Contratos financeiros, de estoque e de permissão inalterados; API de tema ampliada de forma aditiva (v1 continua aceito).

| Lote | Rota | Entrega | Arquivos principais |
|---|---|---|---|
| A | R02 `/painel/[tenantId]` | Navegação por tarefas e menu móvel; lista de produtos com busca de escopo declarado, filtros na URL e linhas compactas; cadastro em página própria; edição progressiva com proteção de saída; envio de imagens com estados reais | `components/panel/Shell.tsx`, `catalog.tsx`, `MediaUploader.tsx`, `ui/kit.tsx`, `apps/api/src/catalogue.ts` (pré-checagem de endereço/SKU) |
| A | R05 `/painel/[tenantId]/operacao` | “Hoje”: alertas, contadores para listas filtradas, pausa recolhida, atalhos; âncoras antigas redirecionam | `app/painel/[tenantId]/operacao/page.tsx` |
| A | R16 `/painel/[tenantId]/configuracoes/[secao]` | Configurações por assunto (loja, entregas, domínio, segurança, plano, dados e IA) | `components/panel/settings.tsx`, `app/painel/[tenantId]/configuracoes/[secao]/page.tsx` |
| B | R15 `/painel/[tenantId]/aparencia` | Editor de aparência com modelos, seções, menu/rodapé por destinos, páginas, histórico, prévia ao vivo e proteção contra sobrescrita | `components/panel/appearance.tsx`, `theme-model.ts`, `brand.ts`, `preview-live.tsx`, `apps/api/src/theme.ts`, `storefront.ts`, migração `0011_theme_v2.sql` |
| B | R07 `/preview/[tenantId]` | Prévia com catálogo e categorias; tema não salvo do editor por `postMessage`; enquadramento só pela mesma origem | `app/preview/[tenantId]/[[...path]]/page.tsx`, `next.config.mjs`, `infra/sites.caddy` |
| B | R08 `/lojas/[slug]`, R17 `/lojas/[slug]/produtos`, R09, R10, R11 | Loja montada pelas seções do tema nos três modelos; catálogo completo; produto com galeria, opções, quantidade e informações recolhíveis; casos de poucos produtos e sem foto | `components/storefront.tsx`, `app/style.css`, `app/fonts/`, `docs/design/tokens.json` |
| C | R03 `/painel/[tenantId]/pedidos` | Fila com próximo passo, visões rápidas, filtros recolhidos no celular, conta de pagamento no fim | `app/painel/[tenantId]/pedidos/page.tsx` |
| C | R12 `/lojas/[slug]/carrinho` | Resumo recolhível no topo com total; itens e entrega junto da confirmação | `components/checkout.tsx` |
| C | todas | Sessão expirada, 320 px/zoom, teclado, movimento reduzido | `ui/kit.tsx`, `app/style.css` |

Testes novos: `tests/theme-schema.test.mjs` (esquema, v1→v2, leitura tolerante) e `tests/theme.test.mjs` (duas sessões, publicação exata, histórico, isolamento entre lojas, contraste de cor clara, editor com prévia em 390/1440) — ambos no verificador oficial a partir da fase 2. Verificações de interação reproduzíveis no projeto de desenvolvimento: `scripts/ux-checks.mjs`; capturas: `scripts/design-review.mjs`; dados: `scripts/fixtures/seed-presets.mjs`.

### Rodada Compasso (04/10/2026)

Identidade da plataforma (tokens com novos valores e mesmos nomes, Manrope, lateral 224 px, sem topo no desktop, seções por divisórias), editor como espaço de trabalho, Essencial/Editorial/Ateliê e checkout corrigidos. Arquivos: `docs/design/tokens.json`, `apps/web/app/style.css`, `apps/web/app/fonts/manrope-*`, `components/panel/{Shell,catalog,appearance,MediaUploader}.tsx`, `components/{storefront,checkout,preview-live,theme-model}.tsx`, `app/painel/[tenantId]/{operacao,pedidos}/page.tsx`, `app/plataforma/page.tsx`, fixtures em `scripts/fixtures/`. Seletores alterados junto com os testes: modo do editor passou de `tab` para botão com `aria-pressed` (`tests/theme.test.mjs`), botão “Tirar da lista arquivo” (`scripts/ux-checks.mjs`), quantidade do carrinho com “Aumentar quantidade de …” (`docs/design/verificar-aceite.mjs`). Registro completo: RELATORIO-FINAL §11.

## 5. Contrato de seletores usados pelos testes (preservar)

**Alterações da evolução de 03/10/2026 (mesmo commit, asserções preservadas):** `commercial-ui` navega para `/configuracoes/seguranca|plano|dominio|entregas` (antes tudo em `/operacao`), botão “Ativar verificação em duas etapas” (antes “Configurar MFA”), form “Confirmar código de verificação” (antes “Confirmar MFA”), campo “Endereço do domínio” (antes “Hostname”); `storefront` usa searchbox “Buscar produtos” e botão “Buscar” (antes “Buscar produto ou SKU”/“Pesquisar”).

**Alterações feitas na implementação do redesign (mesmo commit da tela, comportamento testado preservado):** número do pedido e protocolo passaram de botão para **link** (`getByRole('link', { name: /^Nº \d+$/ })` em `purchase-worker` e `pilot-flow`; `getByRole('link', { name: /^Contato geral/ })` em `pilot-flow`); o status da configuração passou a “Configuração salva.” (`foundation`); o heading do catálogo passou a “Produtos” (`storefront`). Nenhuma asserção funcional foi removida.

| Teste | Seletores |
|---|---|
| `tests/foundation.test.mjs` | form “Entrar”; rótulos “E-mail”, “Senha”, “Nome de exibição”; botões “Entrar”, “Sair”, “Salvar configuração”, “Loja A — Dono”, “Loja B — Dono” (formato “Nome — Papel”); `role=status` |
| `tests/storefront.test.mjs` | heading “Produtos” no painel, título da loja (ex.: “AURORA TESTE”, h1 único — o rodapé não o repete como heading), título do rascunho, nome do produto, “Seu carrinho”, “Fornecedor e atendimento”; searchbox “Buscar produtos”; botões “Buscar”, “Adicionar ao carrinho”, “Calcular frete”; form “Calcular frete”; rótulos “CEP”, “Rua”, “Número”, “Cidade”, “UF”; link “Ver carrinho”, link cujo nome acessível é só o nome do produto (preço fora do link); texto “Centro TESTE:”; `role=status`/`alert` |
| `tests/purchase-worker.test.mjs` | forms “Calcular frete”, “Dados do comprador”, “Abrir solicitação”; rótulos “Nome completo”, “E-mail para comprovante”, “Tipo”, “Mensagem”; botões “Revisar pedido”, “Corrigir dados”, “Confirmar compra de R$ …”, “Enviar solicitação”; link “Nº N”; headings “Pedidos recentes”, “Protocolos do consumidor”, “Pedido nº N”, “Seu carrinho”; textos “COMPROVANTE · PAGAMENTO SIMULADO”, “Pago”, “Pedido não autorizado.”, “Revise antes de confirmar”, “Protocolo … registrado em” |
| `tests/pilot-flow.test.mjs` | form “Contato geral”, “Responder consumidor”; rótulos “Nome”, “E-mail”, “Mensagem”; botão “Enviar”; links “Contato geral…”, “Nº N”; headings “Alertas”, “Expedição”, “Notificações ao comprador”, “Protocolos”; texto “Código de acompanhamento:” |
| `tests/commercial-ui.test.mjs` | rotas `/configuracoes/seguranca|plano|dominio|entregas`; regiões “Verificação em duas etapas”, “Plano e faturas”; forms “Confirmar código de verificação”, “Cadastrar domínio”, “Configurar transportadora”; rótulos “Código”, “Endereço do domínio”, “CEP de origem”; botões “Ativar verificação em duas etapas”, “Ativar”, “Confirmar”, “Cadastrar”, “Salvar”; headings “Lojas”, “Planos (versões imutáveis)”; textos “confirmado nesta sessão”, “Códigos de recuperação”, “Transportadora configurada.”, “PILOT v1”, “Piloto”, `_ecommerce-challenge.` |
| `tests/theme.test.mjs` | heading “Aparência”; campo “Nome da loja”; botões “Salvar rascunho”, “Publicar”; abas “Editar”/“Prévia”; iframe “Prévia da loja com as alterações”; alerta “O rascunho mudou em outra sessão”; texto “Rascunho salvo. A loja publicada só muda quando você publicar.”; link “Ver produtos” da loja |

## 6. Como verificar cada lote

```sh
node docs/design/verificar.mjs                 # tokens, contraste, protótipo, documentos
npm run typecheck -w @ecommerce/web            # tipos
npm run build -w @ecommerce/web                # build Next
node scripts/verify.mjs --phase=7              # suítes completas em Docker (requer Docker e .local/test.env)
node docs/design/tokens-css.mjs --check        # :root do CSS em dia com tokens.json
```

Evolução de UX (projeto de desenvolvimento, dados de teste): `node scripts/fixtures/seed-presets.mjs` cria as seis lojas de exemplo (três modelos + vazia, um produto, cor clara/imagens irregulares) e grava os acessos em `.local/demo-presets.json`; `scripts/design-review.mjs` e `scripts/ux-checks.mjs` rodam no contêiner `tests` (comandos no cabeçalho de cada arquivo).

Capturas das rotas reais: usar o seed (`node scripts/seed.mjs --local`) e Playwright em 390/768/1440, gravando em `artifacts/` (ignorado) e registrando o resultado no ACEITE. Se Docker não estiver disponível no ambiente, registrar “não executado” com o motivo — não marcar como aprovado.
