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

## 5. Contrato de seletores usados pelos testes (preservar)

| Teste | Seletores |
|---|---|
| `tests/foundation.test.mjs` | form “Entrar”; rótulos “E-mail”, “Senha”, “Nome de exibição”; botões “Entrar”, “Sair”, “Salvar configuração”, “Loja A — Dono”, “Loja B — Dono” (formato “Nome — Papel”); `role=status` |
| `tests/storefront.test.mjs` | headings “Cadastrar produto simples”, título da loja (ex.: “AURORA TESTE”), título do rascunho, nome do produto, “Seu carrinho”, “Fornecedor e atendimento”; searchbox “Buscar produto ou SKU”; botões “Pesquisar”, “Adicionar ao carrinho”, “Calcular frete”; form “Calcular frete”; rótulos “CEP”, “Rua”, “Número”, “Cidade”, “UF”; link “Ver carrinho”, link com nome do produto; texto “Centro TESTE:”; `role=status`/`alert` |
| `tests/purchase-worker.test.mjs` | forms “Calcular frete”, “Dados do comprador”, “Abrir solicitação”; rótulos “Nome completo”, “E-mail para comprovante”, “Tipo”, “Mensagem”; botões “Revisar pedido”, “Corrigir dados”, “Confirmar compra de R$ …”, “Enviar solicitação”, “Nº N”; headings “Pedidos recentes”, “Protocolos do consumidor”, “Pedido nº N”, “Seu carrinho”; textos “COMPROVANTE · PAGAMENTO SIMULADO”, “Pago”, “Pedido não autorizado.”, “Revise antes de confirmar”, “Protocolo … registrado em” |
| `tests/pilot-flow.test.mjs` | form “Contato geral”, “Responder consumidor”; rótulos “Nome”, “E-mail”, “Mensagem”; botões “Enviar”, “Contato geral…”, “Nº N”; headings “Alertas”, “Expedição”, “Notificações ao comprador”, “Protocolos”; texto “Código de acompanhamento:” |
| `tests/commercial-ui.test.mjs` | regiões “Verificação em duas etapas”, “Plano e faturas”; forms “Confirmar MFA”, “Cadastrar domínio”, “Configurar transportadora”; rótulos “Código”, “Hostname”, “CEP de origem”; botões “Configurar MFA”, “Ativar”, “Confirmar”, “Cadastrar”, “Salvar”; headings “Lojas”, “Planos (versões imutáveis)”; textos “confirmado nesta sessão”, “Códigos de recuperação”, “Transportadora configurada.”, “PILOT v1”, “Piloto”, `_ecommerce-challenge.` |

## 6. Como verificar cada lote

```sh
node docs/design/verificar.mjs                 # tokens, contraste, protótipo, documentos
npm run typecheck -w @ecommerce/web            # tipos
npm run build -w @ecommerce/web                # build Next
node scripts/verify.mjs --phase=7              # suítes completas em Docker (requer Docker e .local/test.env)
```

Capturas das rotas reais: usar o seed (`node scripts/seed.mjs --local`) e Playwright em 390/768/1440, gravando em `artifacts/` (ignorado) e registrando o resultado no ACEITE. Se Docker não estiver disponível no ambiente, registrar “não executado” com o motivo — não marcar como aprovado.
