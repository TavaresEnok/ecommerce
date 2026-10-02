# DESIGN.md — interface da Plataforma

**Versão:** 1.0 · **Data:** 02/10/2026 · **Commit examinado:** `0179f4d` (fases 0 a 7) · **Estado:** materiais preparados; nenhuma rota do aplicativo foi redesenhada ainda.

Este documento orienta toda mudança de interface em `apps/web`. Ele **complementa** `docs/especificacao.md` (v1.1) e não altera regras de pagamento, estoque, pedidos, permissões, isolamento entre lojas, privacidade ou obrigações ao consumidor. Quando houver conflito, a especificação vence e este documento deve ser corrigido.

**Nome do produto:** não há nome definitivo. Use “Plataforma” como identificação provisória. Não crie logotipo, marca ou slogan.

Documentos relacionados (leitura obrigatória antes de mexer na interface):

| Documento | Para quê |
|---|---|
| [docs/design/tokens.json](docs/design/tokens.json) | Fonte única de cores, tipografia, espaço, raios, movimento e layout |
| [docs/design/TELAS-E-FLUXOS.md](docs/design/TELAS-E-FLUXOS.md) | Inventário de rotas reais e especificação de cada tela |
| [docs/design/ACEITE.md](docs/design/ACEITE.md) | Matriz verificável por rota e cenário |
| [docs/design/IMPLEMENTACAO.md](docs/design/IMPLEMENTACAO.md) | Arquivos a alterar, componentes, riscos e três lotes |
| [docs/design/REFERENCIAS.md](docs/design/REFERENCIAS.md) | Referências externas e o que foi aproveitado |
| [docs/design/STATUS.md](docs/design/STATUS.md) | O que está pronto, verificações e como iniciar o prompt 2 |
| [docs/design/preview/index.html](docs/design/preview/index.html) | Protótipo navegável (abrir direto no navegador, sem build) |

---

## 1. Público e tarefas

| Quem | Onde | Tarefas que a interface precisa tornar óbvias |
|---|---|---|
| Dono da loja (pequeno/médio lojista brasileiro) | Painel `/painel/[tenantId]/…` | Cadastrar produtos e variações, ajustar estoque com motivo, publicar vitrine, acompanhar pedidos e pendências financeiras, responder protocolos, pausar vendas, configurar plano/domínio/MFA |
| Funcionário | Painel, com permissões fixas | Catálogo, estoque, pedidos e envio. **Não** vê ações reservadas ao Dono (gateway, cancelamento de pedido pago, equipe, plano, domínio) — a interface oculta ou desabilita com motivo, mas a autorização continua no servidor |
| Comprador visitante | Vitrine `/lojas/[slug]/…` ou domínio da loja | Encontrar produto, escolher variação, entender custo total, comprar sem conta, acompanhar pedido pelo link seguro, abrir atendimento/arrependimento |
| Administrador da plataforma | `/plataforma` | Ver lojas, alertas, planos e auditoria; suspender/reativar com motivo; inspecionar uma loja de forma auditada |

Princípio: a interface transmite **organização, confiança e cuidado com o catálogo**. A identidade aparece na composição, no ritmo tipográfico, no tratamento dos produtos e na consistência das interações — não em ornamentos.

## 2. Direção: comércio claro, identidade discreta, execução cuidadosa

- **Painel:** navegação lateral, contexto da loja sempre visível, títulos curtos, uma ação principal por área, tabelas quando há comparação entre itens.
- **Vitrine:** produto como protagonista; imagens amplas em proporção única; tipografia precisa; filtros compreensíveis; nada de banner genérico.
- **Checkout:** composição calma, custos legíveis a todo momento, feedback explícito; a loja continua presente sem competir com a compra.
- **Administração da plataforma:** mesma base do painel, com faixa de contexto global escura e indicação explícita da loja inspecionada.

**Assinatura visual** (aplicar em todas as superfícies):

1. Títulos alinhados à esquerda com o conteúdo — sem centralizar títulos de página.
2. Pequenas legendas funcionais (12 px, peso 500) acima de títulos e valores: “Catálogo”, “Pagamento”.
3. Valores com números tabulares (`font-variant-numeric: tabular-nums`) e alinhados à direita em tabelas.
4. Linhas divisórias discretas (`border`) para separar; superfícies só para áreas de trabalho.
5. Seleção marcada por **cor e forma**: fundo `selection` + marcador de 3 px em `action` (painel); borda de 2 px + ícone de confirmação (vitrine).
6. Fotografias em proporção única 4:5.
7. Cor orienta ações e estados; não decora.

**Proibido:** transformar toda informação em card; métricas/gráficos decorativos; blocos promocionais em telas operacionais; WebGL; animação ao rolar; bibliotecas novas apenas para ornamentar.

## 3. Fundamentos

Os valores abaixo são os de [tokens.json](docs/design/tokens.json). O verificador calcula o contraste de cada combinação usada.

### 3.1 Cor — plataforma (painel e administração)

| Token | Valor | Uso | Contraste conferido |
|---|---|---|---|
| `canvas` | `#F5F7F8` | Fundo do painel | texto 13,63:1 |
| `surface` | `#FFFFFF` | Área de trabalho e formulários | texto 14,65:1 |
| `surface-subtle` | `#EEF2F3` | Cabeçalho de tabela, agrupamentos, botão desabilitado | secundário 5,55:1 |
| `text` | `#172B35` | Texto principal | — |
| `text-muted` | `#52636B` | Ajuda e metadados | 6,26:1 em surface |
| `border` | `#D8E1E5` | **Só** separadores decorativos | 1,33:1 — nunca limite de controle |
| `control-border` | `#71838D` | Limite de campos, checkbox, botão secundário | 3,94:1 em surface (≥ 3:1) |
| `action` | `#006B60` | Botão principal (texto branco) e links | 6,42:1 |
| `action-hover` | `#00574E` | Hover/pressionado | 8,49:1 com branco |
| `selection` | `#E5F3EF` | Fundo de selecionado, sempre com marcador `action` | texto 12,84:1 |
| `focus` | `#2459C4` | Contorno de foco 2 px, afastamento 2 px | 6,36:1 em surface |
| `danger` | `#B42318` | Erro, incidente, ação destrutiva | 6,57:1; 5,70:1 em `danger-subtle` |
| `warning` | `#8A4B08` | Pendente/aviso, sempre com texto | 6,14:1 em `warning-subtle` |
| `success` | `#166534` | Sucesso **confirmado** | 6,30:1 em `success-subtle` |

Adições necessárias (registradas como decisão D-03): `on-action` (#FFFFFF), `focus-on-dark` (#8DB0F7), `danger-subtle` (#FCEBEA), `warning-subtle` (#FDF2E2), `success-subtle` (#E7F4EC), `context-global` (#172B35) com `on-context-global` (#FFFFFF) e `on-context-global-muted` (#C9D6DC), `scrim` (rgba 23,43,53,0.48). Nenhum valor inicial foi alterado: todas as combinações usadas passaram.

Regras:
- Estado nunca depende só de cor: sempre texto + forma do marcador.
- `success` só para fato confirmado (pagamento confirmado pelo gateway, entrega registrada, salvo). “Aguardando confirmação” usa `warning`.
- `danger` em botão só para ação destrutiva/irreversível, nunca para “Cancelar” de formulário (esse é secundário).
- Cor literal no código é proibida fora da definição de tokens. Exceção: cor de marca da loja (`theme.color`) e cores de conteúdo (ilustração, swatch de variação).

### 3.2 Cor — vitrine (tokens `store.*`)

A vitrine **não** usa `action` da plataforma. Base neutra: `bg` #FFFFFF, `surface` #F6F5F2, `text` #1D1F1E (16,57:1), `text-muted` #5A5F5C (6,51:1), `border` #E2E3E0, `control-border` #767B78 (4,31:1), `focus` #2459C4. A marca vem de `theme.color` e é transformada pelo **algoritmo de marca** (§11). Estados financeiros e de erro na vitrine reutilizam `danger`/`warning`/`success` da plataforma para que o comprador leia o mesmo significado em qualquer loja.

### 3.3 Tipografia

- **Família:** IBM Plex Sans (SIL OFL 1.1), hospedada no projeto — subconjunto Latin-1 nos pesos 400, 500 e 600 (`docs/design/preview/fonts/`, ~65 KB no total). Cobre acentos do português, `R$`, `–`, `—`, `·`, `…`, `×`. **Fallback efetivo:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Sem carregamento remoto. Na implementação, servir de `apps/web/public/fonts/` com `font-display: swap`.
- **Mono** (`font.family.mono`) apenas para identificadores técnicos: ID externo de pagamento, protocolo, registro TXT. SKU pode usar mono em tabelas técnicas; na vitrine usa a família principal.
- **Escala:** 12 / 14 / 16 / 20 / 24 / 32 px em rem (`--font-size-12` … `--font-size-32`). Formulários sempre 16 px (evita zoom no iOS e melhora leitura). Tabelas 14 px com altura de linha 1,43. 12 px só para legendas/metadados — nunca informação essencial isolada (preço, estado, erro).
- **Pesos:** 400 texto; 500 rótulos, botões, navegação; 600 títulos e totais.
- **Títulos:** h1 32 px desktop / 24 px celular; h2 20 px; h3 16 px. Altura de linha 1,25.
- **Números:** valores monetários, quantidades e horários com `tabular-nums`. IBM Plex Sans possui algarismos tabulares (verificado no protótipo: “R$ 111,11” e “R$ 888,88” têm a mesma largura).
- **Vitrine:** `theme.font` controla só a família de **títulos** (`store.font.family.display`): `system` → IBM Plex Sans; `serif` → Georgia/Times New Roman/serif. Corpo, formulários e preços continuam em IBM Plex Sans (decisão D-06: Georgia tem algarismos de estilo antigo, ruins para preços).

### 3.4 Espaço, raio, sombra, ícone

- Escala de espaço: 4, 8, 12, 16, 24, 32, 48, 64 px (`--space-N`). Nada fora da escala.
- Raios: 6 px controles (`radius-control`), 8 px superfícies (`radius-surface`), 12 px diálogos (`radius-dialog`). Pílula (`radius-pill`) **somente** para filtro segmentado e selo de estado.
- Sombra: `shadow-overlay` só em camada sobreposta (diálogo). Superfícies normais usam borda, não sombra.
- Ícones: não há biblioteca de ícones no projeto e **não** se adiciona uma só para isso. Usar o conjunto mínimo de SVG em traço 1,6 px, 20×20 (16 px em texto pequeno), `currentColor`, definido no protótipo (busca, mais, alerta, confirmação, relógio, info, fechar, sem imagem, enviar, catálogo, vitrine, pedidos, atendimento, operação, olho, voltar). Ícone sempre acompanha texto ou tem `aria-label`; decorativo recebe `aria-hidden="true"`.

### 3.5 Movimento

- Feedback: 120 ms (cor, foco) e 180 ms (abrir diálogo/expandir), curva `cubic-bezier(0.2, 0, 0, 1)`.
- Nunca atrasar uma ação para animar. Sem animação de rolagem, parallax ou carrossel automático.
- `prefers-reduced-motion: reduce` zera transições e animações (inclui o pulso do esqueleto de carregamento).

## 4. Tokens: como usar

1. A fonte é [`docs/design/tokens.json`](docs/design/tokens.json). Cada folha tem `type`, `value`, `description`.
2. Nome da variável CSS: `platform.color.text-muted` → `--color-text-muted`; `platform.font.size.14` → `--font-size-14`; `store.color.accent-text` → `--store-color-accent-text`. Tokens com `"css": false` (breakpoints) não viram variável (CSS não aceita variável em media query): use os valores literais 768px e 1024px.
3. O bloco `:root` do CSS contém **somente** variáveis geradas dos tokens, com o mesmo valor. Fora de `:root`, nenhuma cor literal. O verificador (`node docs/design/verificar.mjs`) falha se houver divergência — no prompt 2 ele deve ser estendido para `apps/web/app/style.css`.
4. Variáveis locais de componente, se necessárias, começam com `--_` e não são tokens.
5. Tokens da loja (`--store-*`) são redefinidos por loja no elemento raiz da vitrine (`<main data-store>`), com valores calculados no servidor a partir de `theme.color` e `theme.font`.

## 5. Layout e navegação

### 5.1 Painel da loja

```
≥1024 px                                  <1024 px
┌──────────┬──────────────────────────┐   ┌──────────────────────────────┐
│ Loja     │ Topo 64 px: trilha ·     │   │ Loja · papel      Trocar loja│
│ Dono     │ ambiente · vendas · conta│   │ [Catálogo][Vitrine][Pedidos] │
│──────────│──────────────────────────│   │ [Atendimento][Operação]      │
│ Catálogo │ Legenda                  │   │ Abrir vitrine · Preview · Sair│
│ Vitrine  │ Título (h1)      [Ações] │   ├──────────────────────────────┤
│ Pedidos  │ Subnavegação             │   │ Trilha · ambiente            │
│ Atendim. │ Conteúdo                 │   │ Título  [Ações quebram linha]│
│ Operação │                          │   │ Conteúdo em coluna única     │
└──────────┴──────────────────────────┘   └──────────────────────────────┘
```

- Lateral 240 px (`--layout-sidebar`) a partir de 1024 px. Abaixo disso a mesma navegação vira **faixa superior com todos os itens visíveis**, quebrando em linhas — não há menu escondido.
- Bloco de contexto da loja no topo da lateral: nome, papel (Dono/Funcionário) e “Trocar loja” (`/`).
- Grupos: **Loja** (Catálogo → `/painel/[id]`, Vitrine e frete → `/painel/[id]#vitrine`), **Vendas** (Pedidos, Atendimento), **Conta** (Operação). Rodapé: Abrir vitrine (`/lojas/[slug]`), Preview do rascunho (`/preview/[id]`), Sair.
- Item atual: `aria-current="page"`, fundo `selection`, marcador 3 px `action`.
- Topo 64 px: trilha (`nav` com lista ordenada), indicador **“Pagamentos simulados”** enquanto a conta de pagamento for SIMULADA, estado de vendas (Recebendo pedidos / Vendas pausadas / Suspensa) e e-mail da conta.
- Conteúdo: margens fluidas `clamp(16px, 3vw, 40px)`; tabelas ocupam a largura útil; formulários longos têm coluna principal de até 46rem (736 px) e coluna lateral de 18rem para publicação/organização.

### 5.2 Vitrine

- Largura máxima 1200 px, margens `clamp(16px, 4vw, 40px)`.
- Cabeçalho: nome da loja (texto em `store.font.family.display`, nunca logotipo inventado; usar o logo do tema quando existir), menu do tema, busca, Carrinho. Desktop numa linha; celular: nome + carrinho, menu em linhas, busca em largura total.
- Aviso de loja sintética/ambiente de teste numa faixa fina acima do cabeçalho enquanto aplicável.
- Rodapé: bloco obrigatório “Fornecedor e atendimento” (seção 22.5 da especificação), entrega/restrições e políticas.

### 5.3 Checkout

- Cabeçalho reduzido: nome da loja + “Continuar comprando”. Sem menu e sem busca.
- Etapas visíveis: Carrinho → Entrega → Seus dados → Revisão. Etapa concluída vira resumo com botão “Alterar…”.
- Desktop: coluna principal (até 46rem) + resumo do pedido fixo à direita (22rem). Celular: resumo **antes** do formulário, sempre aberto (custos nunca escondidos).

### 5.4 Administração da plataforma

- Mesma casca do painel, com **faixa `context-global`** no topo: “Administração da plataforma · acesso global · MFA confirmado · toda ação exige motivo e é auditada”.
- Ao consultar uma loja: bloco “Inspecionando: nome (slug) · estado” com borda de 2 px `context-global`, horário e motivo registrados. Nunca reutilizar a navegação da loja inspecionada como se o administrador fosse integrante.

### 5.5 Responsividade

| Largura | Comportamento |
|---|---|
| ≥ 1024 px | Lateral fixa; duas colunas em edição/detalhe; checkout com resumo lateral |
| 768–1023 px | Navegação em faixa superior; tabelas completas (rolagem horizontal **dentro** da tabela só como último recurso); colunas laterais descem |
| < 768 px | Coluna única; tabelas viram lista empilhada (`data-label` por célula); botões de ação quebram linha; nada essencial escondido |

Testar 390, 768 e 1440 px. Zoom de 200% e reflow de 320 px CSS não podem cortar conteúdo nem exigir rolagem horizontal da página.

## 6. Componentes

Implementar como componentes React em `apps/web/components/ui/` (ver IMPLEMENTACAO.md). Cada um aceita apenas o necessário; estados abaixo são obrigatórios.

| Componente | Especificação |
|---|---|
| **Button** | Variantes `primary` (action), `secondary` (surface + control-border), `danger`, `quiet` (link). Altura mínima 40 px (`--layout-control-height`); `sm` 32 px só em tabelas. Desabilitado: `surface-subtle` + `text-muted` e **motivo visível ao lado** via `aria-describedby`. Durante envio: texto muda (“Salvando…”), `aria-busy`, desabilitado contra duplo clique. |
| **Field** | Rótulo visível acima (14 px/500), controle 16 px, ajuda em `hint`, erro abaixo com ícone e `aria-invalid` + `aria-describedby`. Opcional marcado “(opcional)”; obrigatório não usa só asterisco. |
| **MoneyInput** | Prefixo “R$”, `inputmode="decimal"`, aceita `64,90`, `1.234,56`. Converte para string de centavos **sem ponto flutuante**: remover `R$`, espaços e pontos de milhar; separar na vírgula; validar `^\d+$` e até 2 casas; resultado `inteiro + casas.padEnd(2,'0')` sem zeros à esquerda. Exibe com o `money()` existente (`components/storefront.tsx`). O total cobrado continua sendo do servidor. |
| **Select / Checkbox / Radio** | Nativos, estilizados. Grupo com `fieldset` + `legend`. |
| **SegmentedFilter** | Botões com `aria-pressed`, contagem tabular, pílula; selecionado com borda 2 px `action` + `selection`. Só para filtros com poucas opções. |
| **StatusBadge** | Texto + marcador de forma: círculo cheio = confirmado (success); anel = pendente (warning); losango = exige ação (danger); traço = informativo (neutral). Rótulos e tons na §8.2. |
| **Alert** | `info`, `success`, `warning`, `danger`; ícone + título + corpo; borda esquerda 4 px. `role="alert"` só para erro que interrompe; `role="status"` para confirmação; `role="note"` para orientação permanente. |
| **FinancialAlert** | Variante de Alert `danger` para incidentes (`EXCESS_PAYMENT`, `REFUND_ACTION_REQUIRED`, `PAID_WITHOUT_STOCK`, divergências): valor devido no título, passos numerados do procedimento do piloto e a frase “A anotação não confirma a devolução”. |
| **DataTable** | Barra de ferramentas (busca, filtros), cabeçalho `surface-subtle`, linhas 14 px, números à direita, ação por linha à direita, seleção com marcador, legenda (`caption`) com unidade/regra, rodapé com contagem (“Mostrando X de Y”) e limite real da API. **Só** operações que o backend suporta: hoje não há paginação no servidor nem ações em lote. < 768 px: lista empilhada. |
| **EmptyState** | Borda tracejada, ícone, título, explicação do porquê e próxima ação real. Diferenciar “ainda não há” de “busca sem resultado”. |
| **Loading** | Texto (“Carregando pedidos autorizados…”) com `role="status"` + esqueleto opcional; `aria-busy` na região. Nunca só spinner. |
| **Dialog** | `<dialog>` nativo com `showModal()` (ou componente acessível equivalente): `aria-labelledby` (título) e `aria-describedby` (consequência); foco inicial no primeiro campo ou no botão menos destrutivo; Esc e “Voltar” fecham; foco retorna ao botão de origem; ação destrutiva à direita em `danger`. Usar para cancelar pedido, anonimizar dados, revogar acesso, suspender loja — substitui `confirm()`. |
| **Summary / Totals** | `dl` com rótulo `text-muted` e valor; totais alinhados à direita, total geral 20 px/600 com divisória. < 480 px: rótulo acima do valor. |
| **PageHeader** | Legenda + h1 + meta (data, contagem) + ações à direita (quebram abaixo no celular). Uma ação primária no máximo. |
| **SubNav** | Seções dentro da mesma rota (`Produtos · Estoque · Mídia · Categorias e locais`) com `aria-current`. |
| **ContextBar** | Loja (lateral), plataforma (`context-global`), inspeção, preview privado (`warning` + ícone olho), ambiente simulado. |
| **StoreProductCard** | Imagem 4:5, nome (link), preço “a partir de” quando variações têm preços diferentes, “esgotada” em texto. Sem foto: área tracejada “Sem foto”. |
| **VariantPicker** | Rádios nativos estilizados como opções; selecionada: borda 2 px `store.accent-text` + `accent-tint` + ícone ✓; esgotada: tracejada, `disabled`, “· esgotada” no rótulo e explicação. |

## 7. Estados de tela (todas as rotas)

| Estado | Regra |
|---|---|
| Carregando | Texto explícito + `aria-busy`; manter casca e contexto da loja visíveis |
| Vazio | EmptyState com motivo e ação; nunca tabela vazia sem explicação |
| Erro de campo | Mensagem junto ao campo, valor preservado, foco no primeiro campo inválido; resumo no topo do formulário quando houver mais de um |
| Erro do servidor | Usar a mensagem do erro estável da API; manter dados digitados; oferecer “Tentar novamente” quando a operação for idempotente |
| Erro de rede/sessão | “Não foi possível conectar” / “Entre no painel para continuar” com link; não apagar formulário |
| Sem permissão | Funcionário vê controles de Dono desabilitados com “Somente o Dono…” ou não os vê; nunca erro técnico |
| Sucesso | `role="status"` perto da ação (“Alteração persistida.”), sem toast que some sozinho antes de ser lido |
| Bloqueado | Botão desabilitado + lista de motivos vinda do servidor (`impediments`) |
| Conteúdo longo | Nomes longos quebram linha (`overflow-wrap:anywhere`), IDs/códigos quebram, tabelas não estouram a página |

## 8. Conteúdo e linguagem

### 8.1 Regras

- Português do Brasil, frases curtas, verbo no infinitivo para ações (“Salvar informações”, “Registrar envio”). Evitar jargão técnico na vitrine; no painel, códigos (`EXCESS_PAYMENT`) aparecem só como detalhe secundário ao lado do texto.
- Dinheiro: `R$ 1.234,56` via `money()` a partir de `*_cents` string. Nunca `Number()`/`parseFloat` em valor monetário.
- Datas: `dd/mm/aaaa às hh:mm` no fuso da loja (`settings.timezone`), com “(horário de Brasília)” quando for America/Sao_Paulo. Persistência continua em UTC.
- Honestidade de ambiente: enquanto integração for SIMULADA, mostrar “simulado” no painel (topo) e no checkout/comprovante. Nenhuma tela pode sugerir pagamento real, devolução concluída ou e-mail entregue sem confirmação.
- Botão de demonstração/protótipo nunca simula sucesso de compra.

### 8.2 Rótulos e tons de estado

| Campo | Valor da API → rótulo (tom) |
|---|---|
| `order_status` | OPEN → Aberto (neutro) · COMPLETED → Concluído (sucesso) · CANCELLED → Cancelado (neutro) |
| `payment_status` | UNPAID → Não pago (neutro) · PENDING → Aguardando confirmação (pendente) · PAID → Pago (sucesso) · PARTIALLY_REFUNDED → Parcialmente devolvido (pendente) · REFUNDED → Devolvido (neutro) · CHARGED_BACK → Contestado (ação) |
| `fulfillment_status` | UNFULFILLED → Não enviado · PROCESSING → Em separação · SHIPPED → Enviado · RETURNED → Devolvido à loja (neutros) · DELIVERED → Entregue (sucesso) |
| `dispute_status` | NONE → Sem disputa (neutro) · OPEN → Disputa aberta (ação) · WON → Disputa vencida (sucesso) · LOST → Disputa perdida (ação) |
| Tentativa de pagamento | PREPARED → Preparada · PENDING → Aguardando (pendente) · APPROVED → Aprovada (sucesso) · REJECTED → Recusada · CANCELLED → Cancelada · EXPIRED → Expirada (neutros) · UNKNOWN → Resultado em verificação (pendente; **nunca** “recusado”) |
| Incidente | Qualquer OPEN → tom ação, com texto “Ação financeira pendente” para EXCESS_PAYMENT, REFUND_ACTION_REQUIRED, PAYMENT_VALUE_MISMATCH, REFUND_VALUE_MISMATCH; “Revisão necessária” para PARTIAL_REFUND_REVIEW, GATEWAY_IDENTITY_MISMATCH, GATEWAY_UNAVAILABLE; “Pago sem estoque” para PAID_WITHOUT_STOCK; “Pagamento incerto” para PAYMENT_UNCERTAIN; “Devolução falhou” para REFUND_FAILED · RESOLVED → Resolvido (neutro) |
| Produto | DRAFT → Rascunho · ARCHIVED → Arquivado (neutros) · ACTIVE → Ativo (sucesso) |
| Mídia | UPLOADING → Enviando · PENDING → Processando (pendente) · READY → Pronta (sucesso) · FAILED → Falhou (ação) · DELETED → Removida |
| Loja (`lifecycle_status`) | DRAFT → Rascunho · ACTIVE → Ativa (sucesso) · SUSPENDED → Suspensa (ação) |
| Assinatura | TRIAL → Em teste · ACTIVE → Ativa (sucesso) · PAST_DUE → Em atraso (pendente) · SUSPENDED → Suspensa (ação) · CANCELLED → Cancelada |
| Domínio | PENDING_VERIFICATION → Aguardando verificação · PENDING_TLS → Aguardando certificado (pendentes) · ACTIVE → Ativo (sucesso) · FAILED → Falhou (ação) · DISABLED → Desativado |
| Protocolo | OPEN → Aberto · IN_PROGRESS → Em atendimento (neutros) · RESOLVED → Concluído (sucesso) · prazo vencido → Atrasado (ação) |
| Notificação | PENDING → Pendente · HELD → Retida (pendentes) · SENT → Enviada (sucesso) · SIMULATED → Simulada (neutro) · FAILED → Falhou (ação) |

Os rótulos de comprador já existentes em `components/checkout.tsx` (`labels`) são a base; centralizar em `components/ui/status.ts`.

## 9. Formulários

1. Pedir só o que o contrato da compra/operação exige; agrupar por assunto (Entrega, Seus dados, Pagamento). Não remover campo obrigatório por estética, não adicionar campo novo sem decisão de produto.
2. Rótulo visível, `autocomplete` correto (`postal-code`, `address-line1`, `address-level2`, `address-level1`, `name`, `email`, `one-time-code`, `new-password`).
3. Validação no servidor é a autoridade; no cliente, só ajuda (padrões e formatos).
4. Um botão de salvar por operação da API. A edição de produto tem seções que salvam separadamente (informações; nova variação; ajuste de estoque; mídia) porque a API grava cada uma em requisição própria — **nunca** um botão “Salvar tudo” que finja atomicidade.
5. Substituir campos JSON brutos (atributos de variação, páginas, menu, mídia do tema) por editores de pares/listas que geram o mesmo JSON aceito pela API.
6. Após erro, foco no resumo de erros (`tabindex="-1"`) ou no primeiro campo inválido; após sucesso, mensagem `role="status"`.

## 10. Vitrine

- Produto é protagonista: imagem principal grande (4:5), miniaturas abaixo, informação de compra à direita (desktop) e logo abaixo da imagem (celular).
- Preço em 24 px/600 tabular; “a partir de” quando houver preços diferentes; disponibilidade em texto (“18 disponíveis”, “esgotada”).
- Seleção de variação por opções visíveis (não select) quando houver até ~8 valores por opção; acima disso, select nativo.
- Busca e categorias: busca com rótulo “Buscar produto ou SKU”; categorias como links de navegação, não chips decorativos.
- Imagens: usar só WebP processado da loja (`/api/public/stores/[slug]/media/[id]/[size]`); `width`/`height` declarados; `alt` = nome do produto + variação; carregamento tardio fora da primeira dobra.
- Produto sem foto: área tracejada com ícone e “Sem foto” — nunca imagem genérica de banco de imagens.
- Ilustrações SVG do protótipo são **demonstrativas** e não podem ir para o produto como se fossem fotos.
- O bloco “Fornecedor e atendimento”, avisos de loja sintética e preview privado são obrigatórios conforme a especificação.

## 11. Temas por loja e marca

**Autonomia:** a vitrine é da loja. Nenhum elemento da Plataforma aparece na vitrine além do necessário (avisos legais/ambiente). O link “Painel” atual no menu da vitrine deve sair do menu público (decisão D-08).

**Personalização prevista** (especificação §8, editor atual): título, descrição, mensagem principal, cor (`theme.color`), fonte (`system`/`serif`), páginas, menu, mídias do tema. O redesign não cria opções novas de tema.

**Algoritmo de marca** (implementar em `apps/web/components/brand.ts`, executar no servidor ao montar a vitrine; idêntico ao do verificador):

1. `fill = accent`; se nem branco nem `store.text` alcançam 4,5:1 sobre `fill`, escurecer `accent` (mistura com preto em passos de 5%) até o branco alcançar 4,5:1.
2. `onFill` = branco se ≥ 4,5:1 sobre `fill`; senão `store.text`.
3. `border` = `fill` se `fill` tem ≥ 3:1 sobre o fundo; senão `store.text` (botão claro ganha contorno escuro).
4. `text` (links, marcador de seleção) = `accent` se ≥ 4,5:1 sobre o fundo; senão escurecido até 4,5:1.
5. `tint` = 10% de `text` + 90% de branco; texto sobre `tint` é sempre `store.text`.

Exemplos verificados: #9A3B26 e #245742 sem ajuste; #F2C94C (amarelo) mantém botão amarelo com texto e contorno escuros e links em #856F2A; #E0457B escurece o preenchimento para #CA3E6F. No editor de tema, mostrar a prévia do resultado e a frase “Usaremos uma versão mais escura para textos e links para manter a leitura” quando houver ajuste — sem bloquear a escolha.

## 12. Checkout e estados financeiros

- Custos sempre visíveis: itens, subtotal, frete, total; validade da cotação; recálculo explícito (“O total mudou de R$ X para R$ Y; revise antes de confirmar”) quando o servidor recusar a cotação/preço.
- Botão final: “Confirmar compra de R$ X” (valor no rótulo). Durante envio: desabilitado e “Confirmando…”; a mesma chave de idempotência é reutilizada em nova tentativa.
- CEP sem atendimento: erro junto ao CEP, alternativa de retirada quando existir; nunca frete grátis por falha.
- Após confirmar: página do pedido com estado **Aguardando confirmação do pagamento** (`warning`), prazo do Pix e reserva; atualização automática; “O retorno do navegador não confirma pagamento”.
- “Pago” só quando a API informar `PAID`. Pendência da loja: “Há uma pendência em análise pela loja. O envio fica bloqueado até a resolução.”
- Pix QR/copia-e-cola e formulário de cartão dependem da homologação do Mercado Pago (Fase 0/D02) — sem tela que finja esses elementos.

## 13. Acessibilidade (requisitos verificáveis)

Alvo de trabalho: critérios pertinentes de WCAG 2.2 nível AA. **Nenhum teste automatizado comprova conformidade total**; registrar o que foi verificado em [ACEITE.md](docs/design/ACEITE.md).

- Contraste: texto ≥ 4,5:1; texto grande e componentes/estados/foco ≥ 3:1 (verificador).
- Teclado: toda ação alcançável por Tab, ordem lógica, sem armadilha; diálogo prende foco e devolve ao fechar.
- Foco visível: contorno 2 px `focus`, afastamento 2 px, não encoberto por cabeçalho fixo (`scroll-padding-top`).
- Alvos de toque: **ações principais com no mínimo 44×44 px** (`layout.touch-target` = 2,75 rem) em telas < 768 px ou ponteiro grosso — botões não compactos, opções de variação, rádios de entrega/pagamento, links de navegação da loja e categorias, miniaturas da galeria, campos. Ações secundárias compactas dentro de linhas (`btn-sm`: Editar, Remover, Copiar) ficam com 40 px nessas telas e 32 px no desktop; nada fica abaixo de 24×24 px (WCAG 2.2, 2.5.8). Padrão de controle no desktop: 40 px.
- Formulários: rótulos, instruções, erros identificados em texto e associados; dados preservados após erro; sem pedir de novo o que já foi informado no mesmo fluxo.
- Mensagens de estado anunciadas (`role="status"`/`alert`) sem mover foco.
- Redimensionamento: 200% de zoom e 320 px CSS sem perda de conteúdo.
- Idioma `lang="pt-BR"`, títulos de página únicos, link “Ir para o conteúdo”, landmarks (`header`, `nav`, `main`, `aside`, `footer`).

## 14. Manutenção

1. **Mudar um token:** editar `tokens.json` → `node docs/design/tokens-css.mjs` (regenera o bloco `:root` entre `/* tokens:inicio */` e `/* tokens:fim */` em `apps/web/app/style.css` e no `styles.css` do protótipo; `--check` só confere) → `node docs/design/verificar.mjs` → registrar decisão na §15.
2. **Novo componente:** especificar nesta seção 6 (estados e acessibilidade) → acrescentar à prancha do protótipo se for reutilizado em mais de uma tela → linha no ACEITE.
3. **Nova tela/rota:** inventário em TELAS-E-FLUXOS.md (código Rnn), cenário no ACEITE.md, lote no IMPLEMENTACAO.md — o verificador cruza os três.
4. **Revisão visual:** `node docs/design/capturar-preview.mjs` (protótipo); `node docs/design/capturar-rotas.mjs <rótulo>` (rotas reais em 390/768/1440; `--widths=320` para reflow; `--widths=1280 --zoom=2` para zoom de 200%; `--only=R10,R12-dados` filtra) e `node docs/design/verificar-teclado.mjs` (foco, diálogo, variação por setas, etapas do checkout). Ambos usam os dados sintéticos de `.local/demo-ui.json` (fora do git). Ler o HTML não substitui olhar as capturas.
5. Não alterar a stack, não adicionar biblioteca de UI/ícones/animação sem problema concreto e solicitação explícita.
6. Toda tela nova preserva os seletores usados pelos testes ou atualiza os testes no mesmo commit (lista em IMPLEMENTACAO.md).

## 15. Decisões registradas

| ID | Decisão | Motivo |
|---|---|---|
| D-01 | Valores iniciais de cor mantidos sem ajuste | Todas as 38 combinações usadas passaram (§3.1) |
| D-02 | IBM Plex Sans hospedada (Latin-1, 400/500/600), fallback de sistema | Disponível legitimamente via npm `@ibm/plex-sans` 1.1.0, licença OFL 1.1; ~65 KB; sem rede em tempo de uso |
| D-03 | Tokens adicionais (`on-action`, `*-subtle`, `focus-on-dark`, `context-global*`, `scrim`) | Necessários para alertas, faixa global e diálogo com contraste conferido |
| D-04 | Tokens da vitrine separados (`store.*`), base neutra quente | A cor da plataforma não deve aparecer nas lojas |
| D-05 | Algoritmo de marca corrige uso, não a escolha | Preserva autonomia do lojista e garante leitura |
| D-06 | `theme.font` afeta só títulos da vitrine | Preços e formulários precisam de algarismos tabulares e legibilidade |
| D-07 | Checkout continua em `/lojas/[slug]/carrinho`, organizado em etapas visuais | Evita nova rota e mudança de estado de cliente; mantém contrato atual |
| D-08 | Link “Painel” sai do menu público da vitrine | Separação de contextos; o painel tem endereço próprio |
| D-09 | Edição de produto dentro de `/painel/[tenantId]` (parâmetro `?produto=<id>` proposto) | Sem nova rota de servidor; permite link direto e preserva contexto |
| D-10 | Ícones SVG mínimos próprios, sem biblioteca | Não há família instalada; regra de não adicionar dependência ornamental |
| D-11 | Isolamento por superfície: `.surface-panel` (painel, acesso, plataforma) e `.surface-store` (vitrine) definem apelidos `--_bg`, `--_text`, `--_primary-*`, `--_link`… e as regras de elemento usam `:where()` (especificidade zero) | Componentes (`.btn`, `.field`, `.badge`) servem às duas superfícies sem que a cor de uma vaze para a outra; classes vencem regras de elemento sem `!important` |
| D-12 | `tokens.json` gera o `:root` do CSS (`docs/design/tokens-css.mjs`) | Uma fonte só; o verificador falha se o CSS divergir |
| D-13 | Estado de tela na URL: `?aba=` (catálogo, vitrine, frete), `?produto=<id>`, `?novo=1`, `?pedido=<id>` + filtros, `?protocolo=<id>`, `?filtro=` | Link direto, botão Voltar e recarga preservam contexto sem novas rotas de servidor |
| D-14 | Número do pedido e protocolo viram **links** (antes botões); testes passaram a usar `getByRole('link', …)` com a mesma asserção | Abrem um endereço; leitor de tela anuncia o papel correto |
| D-15 | Alvo de toque de 44 px para ações principais (token `layout.touch-target`) | Pedido do responsável; substitui a meta “≥ 24 px” como padrão de projeto — 24 px continua sendo o piso absoluto |
| D-16 | Na vitrine, a moldura da galeria segue `store.layout.media-ratio` (4:5) com `object-fit: contain`; no desktop a moldura cabe na altura da tela | Foto nunca é cortada nem distorcida; fotos fora da proporção ganham faixas neutras (recomendar ao lojista enviar na proporção do tema) |
| D-17 | Checkout no celular: etapas concluídas viram resumos com “Alterar”; itens recolhem depois do frete; na revisão o resumo lateral repetido sai | Só o estado pertinente fica aberto; editar uma etapa mantém os dados das outras |
