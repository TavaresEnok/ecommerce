# DESIGN.md — interface da Plataforma

**Versão:** 2.1 · **Data:** 04/10/2026 · **Estado:** rotas redesenhadas (lotes 1–3), evolução de UX/personalização (lotes A–C) e **direção Compasso** para a identidade da plataforma (painel, acesso e administração; §2.1): navegação do painel por tarefas, configurações por assunto, catálogo e edição progressiva, editor de aparência como espaço de trabalho (trilho, prévia, propriedades), três modelos de loja (presets), tema versionado v2 e prévia ao vivo. Estado detalhado em [STATUS.md](docs/design/STATUS.md). A aprovação visual humana desta rodada continua pendente.

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
| Dono da loja (pequeno/médio lojista brasileiro, qualquer segmento) | Painel `/painel/[tenantId]/…` | Cadastrar produtos e variações, ajustar estoque com motivo, montar e publicar a aparência da loja, acompanhar pedidos e pendências financeiras, responder protocolos, pausar vendas, configurar entregas/plano/domínio/verificação em duas etapas |
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

1. Títulos alinhados à esquerda com o conteúdo — sem centralizar títulos de página (exceção: o nome da loja no cabeçalho do modelo Editorial, no desktop).
2. Títulos de página sem legenda acima (a navegação e o topo já dizem onde se está); legendas de 12 px só em grupos de navegação e metadados (D-24).
3. Valores com números tabulares (`font-variant-numeric: tabular-nums`) e alinhados à direita em tabelas.
4. Linhas divisórias discretas (`border`) para separar; superfícies só para áreas de trabalho.
5. Seleção marcada por **cor e forma**: fundo `selection` + marcador de 3 px em `action` (painel); borda de 2 px + ícone de confirmação (vitrine).
6. Fotografias na proporção escolhida no tema (retrato 4:5, quadrada ou paisagem 4:3), a mesma na grade e na página do produto.
7. Cor orienta ações e estados; não decora.
8. Divulgação progressiva: o que é raro (endereço do produto, variações, estoque por local, pausa de vendas, conta de pagamento) fica em blocos recolhíveis com resumo visível no título.

### 2.1 Direção Compasso (identidade da plataforma)

“Compasso” é o **nome interno** da direção visual do painel, do acesso e da administração — não é nome de produto, marca nem logotipo (a regra “Plataforma” acima continua). Integrada em 04/10/2026 a partir do DESIGN.md anexado à rodada, preservando todas as regras funcionais deste documento.

- **Tese:** uma mesa de trabalho mineral e precisa. Lateral em `canvas` (#F4F6F8, 224 px), plano de trabalho branco, seções separadas por **divisórias**, não por caixas; azul (#2548D8) **só** para ação, seleção e foco.
- **Tipos:** títulos (h1–h3 do painel, nome da loja na lateral, título do bloco aberto no editor) em **Manrope** 600/700 com tracking −0,01 em; corpo, rótulos, números e formulários em IBM Plex Sans (D-02 e D-06 continuam).
- **Forma:** raios 8 (controles) / 12 (superfícies) / 16 px (diálogos); pílula só em filtros segmentados, visões rápidas e selos. Sombra só em camada sobreposta (`shadow-overlay`, `shadow-menu`).
- **Primeira dobra:** título + ação principal à direita, busca larga e o primeiro item da lista visível em 390×844 (produto a y ≈ 300 px).
- **Sem caixa dentro de caixa:** listas de seções, links do tema, opções de entrega/pagamento e o modelo atual do editor são **linhas divididas**; o selecionado ganha fundo `selection`/marcador de 3 px, não outra moldura.
- **Lojas:** a direção **não** se aplica às vitrines. Cada modelo (Editorial, Essencial, Ateliê) mantém neutros, fontes e composição próprios (§11), e as personalizações existentes continuam valendo. Os tokens `store-*` da “Casa Ipê” do material anexado ficam registrados só como **direção de demonstração** (D-35): não viraram tokens nem fixture, e nenhuma loja existente (Barro & Trama, Atelier Norte, Essencial Casa Digital) foi renomeada.

**Proibido:** transformar toda informação em card; métricas/gráficos decorativos; blocos promocionais em telas operacionais; WebGL; animação ao rolar; bibliotecas novas apenas para ornamentar.

### 2.2 Redesign do espaço de trabalho (05/10/2026)

A solicitação de novo redesign substitui a lateral mineral da direção anterior por uma lateral grafite no desktop. Mantém o plano de trabalho claro, Manrope/IBM Plex Sans, os tokens existentes e as vitrines independentes. Esta rodada abrange o acesso, a casca compartilhada do painel, o catálogo e a página Hoje.

- Lateral: `context-global` com `on-context-global` e `on-context-global-muted`; foco `focus-on-dark`. Item selecionado e hover claro usam `focus`, com marcador lateral na seleção. Identificação provisória “Plataforma”, contexto da loja e conta da equipe separados.
- Acesso deslogado: introdução à esquerda e formulário à direita a partir de 1024 px; abaixo disso, formulário em uma coluna. Aviso local depois do formulário, códigos e erros preservados.
- Catálogo: busca e filtros em faixa de trabalho, tabela com cabeçalho discreto; linhas compactas no celular. Limite de 100 e filtros na URL preservados.
- Hoje: quatro links com contadores de pendências retornados por `/operations/status`; nenhum faturamento ou gráfico inventado. Alertas e vendas lado a lado no desktop, empilhados no celular. Zero significa ausência daquela pendência, não ausência de pedidos para enviar.
- Evidência desta rodada: [redesign-workspace](docs/design/evidencias/redesign-workspace/README.md). A API nos testes foi sintética; os resultados anteriores de integração não certificam este commit.

## 3. Fundamentos

Os valores abaixo são os de [tokens.json](docs/design/tokens.json). O verificador calcula o contraste de cada combinação usada.

### 3.1 Cor — plataforma (painel e administração)

| Token | Valor | Uso | Contraste conferido |
|---|---|---|---|
| `canvas` | `#F4F6F8` | Lateral do painel, palco da prévia, hover de linha | texto 15,04:1 |
| `surface` | `#FFFFFF` | Plano de trabalho e formulários | texto 16,29:1 |
| `surface-subtle` | `#EDF0F4` | Agrupamentos, prefixo de campo, botão desabilitado | secundário 5,63:1 |
| `text` | `#17212B` | Texto principal | — |
| `text-muted` | `#526070` | Ajuda e metadados | 6,43:1 em surface |
| `border` | `#DCE2E8` | **Só** divisórias | 1,31:1 — nunca limite de controle |
| `control-border` | `#778391` | Limite de campos, checkbox, botão secundário | 3,86:1 em surface (≥ 3:1) |
| `action` | `#2548D8` | Botão principal (texto branco) e links | 7,01:1 |
| `action-hover` | `#1937B5` | Hover | 9,31:1 com branco |
| `action-pressed` | `#142C91` | Pressionado (`:active`) | 11,67:1 com branco |
| `selection` | `#EEF2FF` | Fundo de selecionado, texto/marcador em `action` | `action` 6,27:1; texto 14,57:1 |
| `focus` | `#2548D8` | Contorno de foco 2 px, afastamento 2 px | 7,01:1 em surface |
| `danger` | `#B42332` | Erro, incidente, ação destrutiva | 6,51:1; 5,88:1 em `danger-subtle` (#FFF0F1) |
| `warning` | `#805000` | Pendente/aviso, sempre com texto | 6,22:1 em `warning-subtle` (#FFF3D8) |
| `success` | `#176247` | Sucesso **confirmado** | 6,54:1 em `success-subtle` (#EAF5EE) |

Valores da direção Compasso (§2.1, D-31) com os **nomes de token anteriores** — nenhum componente mudou de nome. Continuam (D-03): `on-action` (#FFFFFF), `focus-on-dark` (#8DB0F7), `context-global` (#17212B) com `on-context-global` (#FFFFFF) e `on-context-global-muted` (#C9D6DC), `scrim` (rgba 23,33,43,0.48). O verificador confere 52 combinações.

Regras:
- Estado nunca depende só de cor: sempre texto + forma do marcador.
- `success` só para fato confirmado (pagamento confirmado pelo gateway, entrega registrada, salvo). “Aguardando confirmação” usa `warning`.
- `danger` em botão só para ação destrutiva/irreversível, nunca para “Cancelar” de formulário (esse é secundário).
- Cor literal no código é proibida fora da definição de tokens. Exceção: cor de marca da loja (`theme.color`) e cores de conteúdo (ilustração, swatch de variação).

### 3.2 Cor — vitrine (tokens `store.*`)

A vitrine **não** usa `action` da plataforma. Base neutra: `bg` #FFFFFF, `surface` #F6F5F2, `text` #1D1F1E (16,57:1), `text-muted` #5A5F5C (6,51:1), `border` #E2E3E0, `control-border` #767B78 (4,31:1), `focus` #2459C4. Cada modelo tem seus neutros (`store.preset.<modelo>.*`, contraste conferido pelo verificador):

| Modelo | `bg` | `surface` | `text` | `text-muted` | `border` | `control-border` |
|---|---|---|---|---|---|---|
| Editorial | #FFFFFF | #F3F2F0 | #171717 | #575757 | #E4E2DF | #767676 |
| Essencial | #FFFFFF | #F2F4F7 | #101828 | #475467 | #E4E7EC | #667085 |
| Ateliê | #FBF9F5 | #F0ECE4 | #2B2620 | #5E554A | #E3DDD2 | #7A7064 |

Sobre fotos (texto do destaque e controles da galeria): `store.color.overlay-scrim` / `on-overlay` e `control-on-media` / `overlay-ink`. A marca vem de `theme.brand.color` e é transformada pelo **algoritmo de marca** (§11), calculado **sobre o fundo do modelo**. Estados financeiros e de erro na vitrine reutilizam `danger`/`warning`/`success` da plataforma para que o comprador leia o mesmo significado em qualquer loja.

### 3.3 Tipografia

- **Títulos da plataforma (Compasso):** Manrope 500/600/700 (SIL OFL 1.1, npm `@fontsource/manrope` 5.3.0, subconjunto latino em `apps/web/app/fonts/` com a licença ao lado; token `font.family.display`, fallback IBM Plex Sans). Aplicada a h1–h3 do painel/acesso/administração (h1 e h2 em 700), ao nome da loja na lateral e ao título do bloco aberto do editor. Nunca em corpo, tabela, preço ou formulário.
- **Família do corpo:** IBM Plex Sans (SIL OFL 1.1), hospedada no projeto — subconjunto Latin-1 nos pesos 400, 500 e 600 (`docs/design/preview/fonts/`, ~65 KB no total). Cobre acentos do português, `R$`, `–`, `—`, `·`, `…`, `×`. **Fallback efetivo:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Sem carregamento remoto. Na implementação, servir de `apps/web/public/fonts/` com `font-display: swap`.
- **Mono** (`font.family.mono`) apenas para identificadores técnicos: ID externo de pagamento, protocolo, registro TXT. SKU pode usar mono em tabelas técnicas; na vitrine usa a família principal.
- **Escala:** 12 / 14 / 16 / 20 / 24 / 32 px em rem (`--font-size-12` … `--font-size-32`). Formulários sempre 16 px (evita zoom no iOS e melhora leitura). Tabelas 14 px com altura de linha 1,43. 12 px só para legendas/metadados — nunca informação essencial isolada (preço, estado, erro).
- **Pesos:** 400 texto; 500 rótulos, botões, navegação; 600 títulos e totais.
- **Títulos:** h1 32 px desktop / 24 px celular; h2 de seção no painel 18 px/700; h3 16 px. Altura de linha 1,25.
- **Números:** valores monetários, quantidades e horários com `tabular-nums`. IBM Plex Sans possui algarismos tabulares (verificado no protótipo: “R$ 111,11” e “R$ 888,88” têm a mesma largura).
- **Vitrine:** `theme.brand.font` controla só a família de **títulos**: `plex` → IBM Plex Sans; `bodoni` → Bodoni Moda (serifa de alto contraste, Editorial); `archivo` → Archivo (sem serifa firme, Essencial); `fraunces` → Fraunces (serifa suave, Ateliê); `serif` → Georgia/serif do sistema. Todas OFL 1.1, hospedadas em `apps/web/app/fonts/` (subconjunto latino, com as licenças ao lado), sem carregamento remoto. Corpo, formulários e preços continuam em IBM Plex Sans (D-06: algarismos tabulares e legibilidade).

### 3.4 Espaço, raio, sombra, ícone

- Escala de espaço: 4, 8, 12, 16, 24, 32, 48, 64 px (`--space-N`). Nada fora da escala.
- Raios (Compasso): 8 px controles (`radius-control`), 12 px superfícies (`radius-surface`), 16 px diálogos (`radius-dialog`). No painel, pílula (`radius-pill`) **somente** para filtro segmentado, visões rápidas e selo de estado. Na vitrine, o formato dos botões vem do tema (`brand.button`: arredondado, reto ou pílula — `store.radius.button-*`).
- Sombra: `shadow-overlay` só em camada sobreposta (diálogo) e `shadow-menu` em menus e no quadro do celular da prévia. Superfícies normais usam divisória, não sombra.
- Ícones: não há biblioteca de ícones no projeto e **não** se adiciona uma só para isso. Usar o conjunto mínimo de SVG em traço 1,6 px, 20×20 (16 px em texto pequeno), `currentColor`, definido no protótipo (busca, mais, alerta, confirmação, relógio, info, fechar, sem imagem, enviar, catálogo, vitrine, pedidos, atendimento, operação, olho, voltar). Ícone sempre acompanha texto ou tem `aria-label`; decorativo recebe `aria-hidden="true"`.

### 3.5 Movimento

- Feedback: 120 ms (cor, foco) e 180 ms (abrir diálogo/expandir), curva `cubic-bezier(0.2, 0, 0, 1)`.
- Nunca atrasar uma ação para animar. Sem animação de rolagem, parallax ou carrossel automático.
- `prefers-reduced-motion: reduce` zera transições e animações (inclui o pulso do esqueleto de carregamento).

## 4. Tokens: como usar

1. A fonte é [`docs/design/tokens.json`](docs/design/tokens.json). Cada folha tem `type`, `value`, `description`.
2. Nome da variável CSS: `platform.color.text-muted` → `--color-text-muted`; `platform.font.size.14` → `--font-size-14`; `store.color.accent-text` → `--store-color-accent-text`. Tokens com `"css": false` (breakpoints) não viram variável (CSS não aceita variável em media query): use os valores equivalentes em `em` (48em e 64em; D-22).
3. O bloco `:root` do CSS contém **somente** variáveis geradas dos tokens, com o mesmo valor. Fora de `:root`, nenhuma cor literal. O verificador (`node docs/design/verificar.mjs`) falha se houver divergência — no prompt 2 ele deve ser estendido para `apps/web/app/style.css`.
4. Variáveis locais de componente, se necessárias, começam com `--_` e não são tokens.
5. Tokens da loja (`--store-*`) são redefinidos por loja no elemento raiz da vitrine (`<main data-store>`), com valores calculados no servidor a partir de `theme.color` e `theme.font`.

## 5. Layout e navegação

### 5.1 Painel da loja

```
≥1024 px                                    <1024 px
┌────────────┬─────────────────────────┐    ┌──────────────────────────────┐
│ Loja       │ ‹ Voltar (quando houver)│    │ [≡ Menu] Loja / área [Simul.]│  ← barra de 56 px
│ Dono/slug  │ Título (h1)     [Ações] │    ├──────────────────────────────┤
│ ● vendas   │ meta                    │    │ Título (h1)                  │
│ ○ simulado │─────────────────────────│    │ [Ação principal]             │
│ Dia a dia  │ Seção (divisória)       │    │ Conteúdo em coluna única     │
│ Catálogo   │ Seção (divisória)       │    └──────────────────────────────┘
│ Loja (Dono)│                         │    Menu = <dialog> com os mesmos grupos,
│ Conta      │  plano branco           │    fecha ao navegar e devolve o foco.
└────────────┴─────────────────────────┘
 lateral canvas 224 px
```

- **Sem barra de topo no desktop** (Compasso, D-32): área e estado já estavam na lateral e no título; “Recebendo pedidos” e “Pagamentos simulados” aparecem uma vez só, no bloco da loja. Seções do conteúdo são separadas por divisórias (sem caixa branca sobre cinza); tabelas sem moldura lateral.
- Lateral 224 px (`--layout-sidebar`) a partir de 1024 px. Abaixo disso, barra fixa com **botão “Menu”** (`aria-expanded`, `aria-controls`) que abre um `<dialog>` com a mesma navegação. Motivo (D-23): a faixa com todos os itens empurrava o primeiro produto para y = 1068 px em 390×844; com o menu, ele aparece a y ≈ 300 px.
- Bloco de contexto da loja: nome, papel (Dono/Funcionário), slug, estado de vendas e “Pagamentos simulados” enquanto a conta for SIMULADA; “Trocar loja” e “Sair” no rodapé do menu.
- Grupos por tarefa (rótulos do usuário, não da arquitetura):
  - **Dia a dia:** Hoje (`/operacao`: alertas, contadores que levam às listas filtradas, pausa de vendas recolhida e atalhos), Pedidos, Atendimento.
  - **Catálogo:** Produtos (`/painel/[id]`), Estoque (`?aba=estoque`), Imagens (`?aba=midia`), Categorias e locais (`?aba=organizacao`).
  - **Loja** (só Dono): Aparência (`/aparencia`), Dados da loja, Entregas, Domínio (`/configuracoes/loja|entregas|dominio`).
  - **Conta:** Segurança, Plano e faturas (Dono), Dados e IA (`/configuracoes/seguranca|plano|dados`).
  - Endereços antigos continuam válidos: `?aba=vitrine` → Aparência; `?aba=frete` → Entregas; âncoras de `/operacao` (`#seguranca`, `#plano`, `#dominio`, `#transportadora`, `#dados`, `#ia`) → página correspondente.
- Item atual: `aria-current="page"`, fundo `selection` e texto/ícone em `action`. Rótulos dos grupos são texto (`<p>`), não títulos, para que o primeiro título da página seja o h1.
- **Produtos (lista):** desktop em tabela de linhas de 72 px com miniatura de 48 px, nome como link que cobre a linha, situação, saldo e preço alinhado à direita, seta de abrir; celular em linhas com miniatura de 56 px, nome inteiro e preço/saldo em linha própria (a faixa de preço não espreme o nome). Sem paginação, ações em lote ou busca global — a API não oferece.
- Conteúdo: até 80rem (`layout.content-max`) + margens de 32 px; tabelas ocupam a largura útil; formulários longos têm coluna principal de até 46–52rem. A barra de salvar só fica fixa no rodapé (`sticky-actions`) **enquanto há alterações não salvas**, com `scroll-padding-bottom` para não cobrir o campo em foco.
- **Edição de produto:** a partir de 1200 px, formulário à esquerda e Imagens numa coluna lateral fixa (capa grande, demais em grade, “N imagens · até 10”, envio compacto). Atalhos “Ajustar estoque” e “Editar nas variações” abrem o bloco, rolam até ele e levam o foco ao título. **Limite real da API:** não há reordenar nem remover imagem do produto (`product_media` não tem coluna de posição — a ordem é a do envio, `order by id` —, o papel da aplicação não tem `DELETE` nessa tabela e só existe a rota de vincular); a tela diz isso em texto e não mostra controles falsos.
- Telas de edição têm link “‹ Voltar” para a lista (preservando busca e filtros) e protegem alterações não salvas: sair por link interno ou fechar a aba pergunta “Descartar alterações?”.

### 5.2 Vitrine

- Largura máxima conforme o tema (`layout.width`: estreita 960, padrão 1200, ampla 1440 px), margens `clamp(16px, 4vw, 40px)`.
- Cabeçalho: nome da loja (fonte de títulos do tema; logo do tema quando existir, nunca logotipo inventado), menu do tema, busca, Carrinho. Desktop numa linha (Editorial: nome centralizado entre menu e ações). Celular: botão de menu (abre `<dialog>` com menu e categorias), nome e carrinho; a busca fica sempre visível no Essencial e atrás do botão de lupa nos outros modelos.
- Rotas públicas: início, `/produtos` (catálogo completo, com faixa de categorias), `/categorias/[slug]`, `/produtos/[slug]`, `/paginas/[slug]`, carrinho, atendimento e pedido.
- Aviso de loja sintética/ambiente de teste numa faixa fina acima do cabeçalho enquanto aplicável.
- Rodapé: links e nota do tema, bloco obrigatório “Fornecedor e atendimento” (seção 22.5 da especificação) e políticas em blocos recolhíveis.

### 5.3 Checkout

- Cabeçalho reduzido: nome da loja + “Continuar comprando”. Sem menu e sem busca.
- Etapas visíveis: Carrinho → Entrega → Seus dados → Revisão. Etapa concluída vira resumo com botão “Alterar…”.
- Itens com miniatura de 56 px, nome e total da linha na mesma linha, preço unitário e código abaixo, quantidade com o mesmo seletor −/+ da página do produto (grava na hora; o campo aceita digitar e grava ao sair) e “Remover” ao lado. Entrega e pagamento como linhas divididas dentro do bloco da etapa. Endereço na ordem usual: CEP, rua, número, complemento, cidade, UF. Ao mudar de etapa, o foco vai para o título da etapa nova. Rodapé compacto durante a compra (fornecedor, contato e políticas continuam acessíveis).
- Desktop: coluna principal (até 46rem) + resumo do pedido fixo à direita (22rem). Celular (< 1024 px): **resumo recolhível no topo** com o total (ou subtotal, antes do frete) sempre visível na própria linha; ao abrir, itens, frete e total. Na revisão, itens, entrega (forma, prazo, endereço) e total ficam junto do botão “Confirmar compra de R$ X” (D-25).

### 5.4 Administração da plataforma

- Mesma casca do painel, com **faixa `context-global`** no topo: “Administração da plataforma · acesso global · MFA confirmado · toda ação exige motivo e é auditada”.
- Ao consultar uma loja: bloco “Inspecionando: nome (slug) · estado” com borda de 2 px `context-global`, horário e motivo registrados. Nunca reutilizar a navegação da loja inspecionada como se o administrador fosse integrante.

### 5.5 Responsividade

| Largura | Comportamento |
|---|---|
| ≥ 1024 px | Lateral fixa; duas colunas em edição/detalhe; editor de aparência com controles e prévia lado a lado; checkout com resumo lateral |
| 768–1023 px | Navegação pelo botão “Menu”; tabelas completas (rolagem horizontal **dentro** da tabela só como último recurso); colunas laterais descem; editor alterna “Editar”/“Prévia” |
| < 768 px | Coluna única; lista de produtos em linhas compactas (foto, nome, preço, saldo) e filtros atrás de “Filtros”; demais tabelas viram lista empilhada (`data-label`); botões de ação quebram linha; nada essencial escondido |

Testar 390, 768 e 1440 px (e 320 px como limite). Zoom de 200% e 400% (zoom **real** do navegador — `scripts/zoom-check.mjs` usa `chrome.tabs.setZoom` numa janela de 1280 px; mudar o viewport não comprova zoom) e reflow de 320 px CSS não podem cortar conteúdo nem exigir rolagem horizontal da página. No CSS os pontos de quebra são escritos em `em` (48em = 768 px e 64em = 1024 px com a fonte padrão de 16 px) para que quem aumenta a fonte do navegador receba o layout mais estreito em vez de colunas espremidas (D-22). A lista de pedidos do painel, com seis colunas de texto, empilha até 1279 px.

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
| **PageHeader** | Link “‹ Voltar” opcional + h1 + meta (situação, contagem, data) + ações à direita (quebram abaixo no celular). Sem legenda acima do título. Uma ação primária no máximo. |
| **Navegação do painel** | Grupos da §5.1 (`useNav`); lateral ≥ 1024 px; abaixo disso, botão “Menu” + `<dialog class="drawer">` que fecha ao trocar de rota e devolve o foco ao botão. |
| **ContextBar** | Loja (lateral), plataforma (`context-global`), inspeção, prévia privada (`warning` + ícone olho), ambiente simulado. |
| **Fold** | `<details class="fold">` com título + resumo do conteúdo no `summary` e seta que gira; abre sozinho quando há erro dentro (ex.: endereço do produto repetido). |
| **LeaveGuard** | `useLeaveGuard(dirty)`: intercepta links internos e `beforeunload` e pergunta “Descartar alterações?” num ConfirmDialog. |
| **MediaUploader** | Botão “Adicionar imagens” (input de arquivo nativo associado) + área de arrastar (versão compacta quando o produto já tem imagens); confere tipo, 10 MB e 40 megapixels antes de enviar; fila de 2; progresso real por arquivo (“Enviando 45%”), “Processando no servidor…”, “Pronta”, erro com “Tentar de novo” e “Tirar da lista”. Na edição do produto, a imagem pronta já é vinculada; se o vínculo falhar, “Vincular de novo” repete só o vínculo, sem reenviar o arquivo. Nome acessível contém o texto visível (“Tirar da lista arquivo.jpg”). |
| **Busca e filtros de lista** | Rótulo declara o escopo real (“Buscar em 12 produtos”; no limite, “Buscar nos primeiros 100 produtos (A–Z)” + aviso); filtros na URL; no celular atrás de “Filtros” com contagem; filtros aplicados como chips removíveis. |
| **Visões rápidas** | Links em pílula (`nav.view-tabs`, `aria-current`) que aplicam combinações de filtros do servidor (ex.: Pedidos → “Precisam de atenção”, “A enviar”, “Enviados”). |
| **StoreProductCard** | Imagem na proporção do tema, nome (link, até 3 linhas), preço “a partir de” quando variações têm preços diferentes, “Esgotado” ou “N opções” em texto. Sem foto: área com ícone e o nome da categoria. Um só produto na seção vira destaque (foto + nome + “Ver produto”); dois não deixam meia grade vazia. |
| **VariantPicker** | Rádios nativos estilizados como opções; selecionada: borda 2 px `store.accent-text` + `accent-tint` + ícone ✓; esgotada: tracejada, `disabled`, “esgotada” no rótulo. A opção escolhida aparece na legenda (“Opção · Azul”). |
| **Stepper de quantidade** | − / campo / +, botões de 44 px; limite pela disponibilidade carregada; erro do servidor junto ao campo. |
| **Galeria** | Foto principal + contador “1 de N” com anterior/próxima sobre a foto e miniaturas (`aria-current`); sem foto: quadro baixo “foto ainda não enviada”. |
| **Editor de aparência** | Espaço de trabalho (Compasso): **trilho** com o modelo atual (miniatura esquemática + resumo + “Trocar modelo”) e as partes da loja; **prévia** ao centro; **propriedades** da parte escolhida à direita (≥ 1200 px; entre 1024 e 1199 px trilho e propriedades à esquerda; abaixo, “Editar”/“Prévia” com botões `aria-pressed`). Trocar modelo abre sob demanda miniaturas comparáveis na mesma escala; no celular, “Ver na prévia” e uma faixa “Aplicar / Cancelar” na própria Prévia. A prévia de computador é desenhada em 1280 px e reduzida, com a escala escrita (“Largura de 1280 px, em 43%”); “Ampliar prévia” esconde trilho e propriedades (≈ 90% em 1440 px). Seção em edição ganha contorno na prévia sem rolar a cada tecla. Ver §11. |
| **Lista de seções** | Linhas divididas (número, título até 2 linhas — nunca cortado em uma —, tipo; ações na mesma linha quando o painel tem ≥ 30rem, abaixo do título quando é estreito). Reordenar **sem arrastar** (botões ↑/↓ com anúncio em `aria-live`), editar, ocultar, duplicar, remover (com confirmação), adicionar por tipo. |
| **Editor de links** | Cada link = texto + “Leva para” (início, catálogo, categoria, produto, página, carrinho, atendimento; endereço externo `https://` como opção avançada). Destino inexistente é recusado no servidor. |

## 7. Estados de tela (todas as rotas)

| Estado | Regra |
|---|---|
| Carregando | Texto explícito + `aria-busy`; manter casca e contexto da loja visíveis |
| Vazio | EmptyState com motivo e ação; nunca tabela vazia sem explicação |
| Erro de campo | Mensagem junto ao campo, valor preservado, foco no primeiro campo inválido; resumo no topo do formulário quando houver mais de um |
| Erro do servidor | Usar a mensagem do erro estável da API; manter dados digitados; oferecer “Tentar novamente” quando a operação for idempotente |
| Erro de rede/sessão | “Não foi possível conectar…”; sessão vencida no meio do trabalho vira aviso “Sessão expirada” (“A última ação não foi salva…”) com “Entrar novamente”, sem apagar o formulário (o LeaveGuard pergunta antes de sair) |
| Sem permissão | Funcionário vê controles de Dono desabilitados com “Somente o Dono…” ou não os vê; nunca erro técnico |
| Sucesso | `role="status"` perto da ação (“Alteração persistida.”), sem toast que some sozinho antes de ser lido |
| Bloqueado | Botão desabilitado + lista de motivos vinda do servidor (`impediments`) |
| Conteúdo longo | Nomes longos quebram linha (`overflow-wrap: break-word` no corpo: quebra no meio da palavra só quando ela não cabe, sem reduzir a largura mínima das colunas); IDs/códigos quebram em qualquer ponto (`anywhere`); tabelas não estouram a página |

## 8. Conteúdo e linguagem

### 8.1 Regras

- Português do Brasil, frases curtas, verbo no infinitivo para ações (“Salvar informações”, “Registrar envio”). Sem jargão técnico na vitrine; no painel, nada de códigos internos ou siglas como rótulo (“Conta simulada (sem dinheiro real)”, não “SIMULATED”; “Verificação em duas etapas”, não “MFA”; “Endereço do domínio”, não “Hostname”). Códigos de incidente (`EXCESS_PAYMENT`) só como detalhe secundário ao lado do texto.
- Escopo honesto: busca e listas dizem o que realmente cobrem (“Buscar em 12 produtos”; “primeiros 100 por nome”); estimativas e limites nunca ficam implícitos.
- Sem prova social inventada: nada de avaliações, contagem de compradores, selos, descontos ou escassez que não venham de dado real (“Últimas 3 unidades” só a partir do saldo real).
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

- Produto é protagonista: imagem principal grande (proporção do tema), contador e miniaturas, informação de compra à direita (desktop, fixa ao rolar) e logo abaixo da imagem (celular).
- Preço em 24 px/600 tabular; “a partir de” quando houver preços diferentes; disponibilidade em texto (“Em estoque”, “Últimas N unidades” até 5, “Esgotado” com “fale com a loja”).
- Descrição aberta; cuidados e entrega/trocas em blocos recolhíveis com seta.
- Seleção de variação por opções visíveis (não select) quando houver até ~8 valores por opção; acima disso, select nativo.
- Busca e categorias: busca com rótulo “Buscar produto ou SKU”; categorias como links de navegação, não chips decorativos.
- Imagens: usar só WebP processado da loja (`/api/public/stores/[slug]/media/[id]/[size]`); `width`/`height` declarados; `alt` = nome do produto + variação; carregamento tardio fora da primeira dobra.
- Produto sem foto: área tracejada com ícone e “Sem foto” — nunca imagem genérica de banco de imagens.
- Ilustrações SVG do protótipo são **demonstrativas** e não podem ir para o produto como se fossem fotos.
- O bloco “Fornecedor e atendimento”, avisos de loja sintética e preview privado são obrigatórios conforme a especificação.

## 11. Temas por loja e marca

**Autonomia:** a vitrine é da loja. Nenhum elemento da Plataforma aparece na vitrine além do necessário (avisos legais/ambiente). O link “Painel” atual no menu da vitrine deve sair do menu público (decisão D-08).

**Tema v2 (esquema versionado, validado no servidor — `apps/api/src/theme.ts`).** Nenhum HTML, CSS ou script do lojista é aceito; tudo é escolha entre valores permitidos ou texto simples (sem `<` `>` nem caracteres de controle), com limites:

| Parte | Conteúdo | Limites e regras |
|---|---|---|
| `preset` | `editorial`, `essencial`, `atelie` | Define composição, neutros e comportamento (não só cor) |
| `title`, `description` | Nome e descrição curta | 100 / 300 caracteres |
| `brand` | `color` (#RRGGBB), `font` (`plex`, `bodoni`, `archivo`, `fraunces`, `serif`), `button` (`rounded`, `square`, `pill`), `logo` (imagem da loja ou nenhuma) | Cor clara é aceita e ajustada pelo algoritmo abaixo |
| `layout` | `width` (`narrow`/`regular`/`wide`), `density` (`comfortable`/`compact`), `ratio` (`portrait`/`square`/`landscape`), `fit` (`cover`/`contain`) | — |
| `sections` | `hero` (título, texto, imagem, ponto focal, composição `overlay`/`split`/`stacked`, botão), `products` (todos / categoria / escolhidos, 4–24), `categories`, `image_text` (lado da imagem), `text`; cada uma com `id` e `hidden` | Até 12 seções; até 12 produtos escolhidos; ids únicos |
| `menu`, `footer.links` | Links `{label, to}` com destino tipado: `home`, `catalog`, `category`, `product`, `page`, `cart`, `contact`, `external` (só `https://`, sem usuário/senha) | Até 10 e 8 links; página inexistente é recusada |
| `pages` | Páginas institucionais (endereço, título, texto) | Até 10; endereços únicos |
| `assets` | Derivado (logo + imagens das seções) | Cada imagem precisa existir **nesta** loja (RLS + FK composta em `theme_media`) |

- **v1 → v2:** temas antigos continuam aceitos e são convertidos de forma determinística (`fromV1`: modelo Essencial, destaque com a mensagem principal, categorias, produtos, menu e páginas preservados). A leitura é tolerante (`normalize`): conteúdo inválido vira um tema mínimo seguro com o nome e a cor da loja — a vitrine nunca quebra. Migração `0011_theme_v2.sql` aceita `schema_version` 1 e 2.
- **Rascunho, publicação e histórico:** salvar envia `base_revision_id`; se outra sessão gravou depois, a API responde 409 e nada é sobrescrito (o editor mostra “O rascunho mudou em outra sessão” e oferece recarregar). Publicar publica exatamente a revisão vista na tela (409 se o rascunho mudou). “Trazer a versão publicada para o rascunho” descarta o rascunho atual (a API também aceita uma publicação do histórico); “Republicar esta versão…” republica uma publicação anterior com `expected_published_id` (409 se a publicação mudou). Histórico = últimas 10 publicações.
- **Modelos (presets)** — diferem em composição, não só em cor:

| | Editorial | Essencial | Ateliê |
|---|---|---|---|
| Para | Moda e acessórios | Utilidades e tecnologia | Casa e artesanato |
| Abertura | Foto em tela cheia; texto em faixa escura à direita no desktop (fora do produto) e **abaixo** da foto no celular | Categorias primeiro (blocos de mesma altura na largura toda), sem foto grande nem banner | Foto e texto lado a lado |
| Produtos | Retrato 4:5, grade arejada, nomes em peso regular | Grade densa **sem cartões**: palco claro de proporção única, foto inteira ocupando o lado maior; busca comercial no cabeçalho | Quadrada, 4 por linha, nomes na serifa suave, preço discreto |
| Títulos | Bodoni Moda | Archivo | Fraunces |
| Botões | Retos | Arredondados | Pílula |
| Cabeçalho (desktop) | Nome centralizado | Nome à esquerda + busca larga | Nome à esquerda |

- **Trocar de modelo** mostra a prévia antes de aplicar, explica o que muda (composição, fontes, botões, proporção) e o que fica (textos, imagens, menu, páginas, cor); usar as seções sugeridas do modelo é opcional (as imagens já escolhidas são reaproveitadas).
- **Prévia ao vivo:** o editor envia o tema ainda não salvo por `postMessage` (mesma origem) para `/preview/[id]?editor=1`, que usa o **mesmo componente** da loja pública; alterna celular (390 px) e largura total. Só `/preview/*` pode ser exibido em quadro, e só pela própria origem (`X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'`); o resto continua `DENY` (Next e Caddy).
- **Estados do editor:** “Alterações não salvas” · “Rascunho salvo, loja ainda não publicada” · “Rascunho salvo, ainda não publicado” (rascunho diferente do que está no ar) · “No ar, sem alterações pendentes” (conteúdo do rascunho igual ao da publicação; “Publicar” fica desabilitado) · “Rascunho salvo” (quando a revisão não está entre as 20 recentes e não dá para comparar) · publicado (“Aparência publicada na loja.”) · erro com motivo. Botões dizem a ação em curso (“Salvando…”, “Publicando…”); sair com alterações pergunta antes.

**Algoritmo de marca** (`apps/web/components/brand.ts`, idêntico ao do verificador; `themeStyle()` aplica sobre o fundo do modelo):

1. `fill = accent`; se nem branco nem `store.text` alcançam 4,5:1 sobre `fill`, escurecer `accent` (mistura com preto em passos de 5%) até o branco alcançar 4,5:1.
2. `onFill` = branco se ≥ 4,5:1 sobre `fill`; senão `store.text`.
3. `border` = `fill` se `fill` tem ≥ 3:1 sobre o fundo; senão `store.text` (botão claro ganha contorno escuro).
4. `text` (links, marcador de seleção) = `accent` se ≥ 4,5:1 sobre o fundo; senão escurecido até 4,5:1.
5. `tint` = 10% de `text` + 90% de branco; texto sobre `tint` é sempre `store.text`.

Exemplos verificados: #9A3B26 e #245742 sem ajuste; #F2C94C (amarelo) mantém botão amarelo com texto e contorno escuros e links em #856F2A; #E0457B escurece o preenchimento para #CA3E6F. O editor mostra o resultado e, quando há ajuste, explica “A loja usa uma versão ajustada desta cor” com as cores usadas — sem bloquear a escolha. Teste automatizado: botão da loja com #F2C94C mede ≥ 4,5:1 (`tests/theme.test.mjs`).

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
- Redimensionamento: 200% e 400% de zoom real e 320 px CSS sem perda de conteúdo (verificado em 7 telas representativas com `scripts/zoom-check.mjs`; registro no RELATORIO-FINAL).
- Idioma `lang="pt-BR"`, títulos de página únicos, link “Ir para o conteúdo”, landmarks (`header`, `nav`, `main`, `aside`, `footer`).

## 14. Manutenção

1. **Mudar um token:** editar `tokens.json` → `node docs/design/tokens-css.mjs` (regenera o bloco `:root` entre `/* tokens:inicio */` e `/* tokens:fim */` em `apps/web/app/style.css` e no `styles.css` do protótipo; `--check` só confere) → `node docs/design/verificar.mjs` → registrar decisão na §15.
2. **Novo componente:** especificar nesta seção 6 (estados e acessibilidade) → acrescentar à prancha do protótipo se for reutilizado em mais de uma tela → linha no ACEITE.
3. **Nova tela/rota:** inventário em TELAS-E-FLUXOS.md (código Rnn), cenário no ACEITE.md, lote no IMPLEMENTACAO.md — o verificador cruza os três.
4. **Revisão visual:** lojas de demonstração dos três modelos e casos difíceis com `node scripts/fixtures/seed-presets.mjs` (fotos CC0 com origem em `scripts/fixtures/fotos.json`; contas em `.local/demo-presets.json`, fora do Git) e capturas com `scripts/design-review.mjs` (`REVIEW_LABEL`, `REVIEW_ONLY=loja|painel`, `REVIEW_SIZES`; mede rolagem horizontal, posição do primeiro item e erros de console). `node docs/design/capturar-preview.mjs` (protótipo); para as rotas reais, preparar o ambiente isolado e os dados com [`docs/design/ambiente/`](docs/design/ambiente/README.md) e rodar `node docs/design/capturar-rotas.mjs <rótulo>` (390/768/1440; `--widths=320` para reflow; `--widths=1280 --zoom=2` **simula** o reflow do zoom de 200% — não aciona o zoom do navegador; `--texto=200` aumenta a fonte-raiz como a configuração de tamanho de fonte do navegador; `--only=R10,R12-dados` filtra), `node docs/design/verificar-teclado.mjs` e `node docs/design/verificar-aceite.mjs`. No projeto de desenvolvimento: `scripts/capture-pages.mjs` (`CAPTURE_LABEL`, `CAPTURE_SIZES`, `CAPTURE_ONLY`, `CAPTURE_PRODUCT` para manter o mesmo produto antes/depois), `scripts/ux-checks.mjs` e `scripts/zoom-check.mjs` (zoom real 200/400%), todos no contêiner `tests`. Ler o HTML não substitui olhar as capturas; registrar quais imagens foram examinadas.
5. Não alterar a stack, não adicionar biblioteca de UI/ícones/animação sem problema concreto e solicitação explícita.
6. Toda tela nova preserva os seletores usados pelos testes ou atualiza os testes no mesmo commit (lista em IMPLEMENTACAO.md).
7. **Tema:** mudar o esquema exige atualizar `apps/api/src/theme.ts` (validação + conversão), `apps/web/components/theme-model.ts` (tipos e modelos), `tests/theme-schema.test.mjs` e `tests/theme.test.mjs` (rodam no verificador oficial a partir da fase 2) e a tabela da §11.

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
| D-16 | *(Substituída por D-28.)* Imagens sempre inteiras (`object-fit: contain`), nunca cortadas nem distorcidas: grade e miniaturas na proporção do tema (`store.layout.media-ratio`, 4:5); a moldura principal do produto acompanha a proporção da foto, limitada entre 4:5 e 4:3, e cabe na altura da tela no desktop; imagem do tema na proporção enviada, só com altura máxima | Sem editor de imagem nem nova configuração de tema; fotos em paisagem deixam de ganhar faixas enormes e nada some da foto |
| D-17 | *(Revisão substituída por D-25.)* Checkout no celular: etapas concluídas viram resumos com “Alterar”; itens recolhem depois do frete; na revisão o resumo lateral repetido sai | Só o estado pertinente fica aberto; editar uma etapa mantém os dados das outras |
| D-18 | Confirmação de compra sem resposta conclusiva (rede, tempo esgotado, 5xx, 429) = “Não sabemos se a compra foi registrada”: a mesma intenção (chave + conteúdo) fica na memória e no `sessionStorage` e só “Verificar compra” a reenvia; itens, entrega e dados ficam travados até resolver. Só 400 e 409 (respostas depois da verificação de pedido existente no servidor) dizem “Nenhum pedido foi criado por esta confirmação” | Nunca afirmar que o pedido não existe depois de resposta perdida; a proteção do servidor por chave e por carrinho/versão (`checkoutExisting`) impede duplicidade mesmo sem `sessionStorage` |
| D-19 | *(Ampliada por D-27.)* Preview privado navegável em `/preview/[tenantId]/…` para início, páginas do rascunho e produtos; categoria, busca, carrinho, atendimento e pedidos aparecem como texto “(indisponível no preview)” ou página “Não disponível no preview” com volta ao início do preview | Nenhum link do preview leva a 404 nem à loja pública; cada página pede o rascunho à API com a sessão de quem abre (autorização e noindex preservados) |
| D-20 | Revisão visual reproduzível: projeto Compose isolado `ecommerce-design-demo` e gerador de dados versionados em `docs/design/ambiente/` | Capturas e verificações não dependem de preparação manual de uma sessão anterior |
| D-21 | Pedido anonimizado mostra “Dados pessoais anonimizados”/“endereço anonimizado” no painel e no comprovante, sem os marcadores técnicos da API nem link de e-mail fictício | Linguagem do usuário; o dado anonimizado não é apresentado como se fosse real |
| D-22 | Pontos de quebra em `em`; corpo com `overflow-wrap: break-word` (não `anywhere`); lista de pedidos do painel empilhada até 1279 px; topo do painel com altura mínima, não fixa | Com fonte do navegador em 200% o checkout e o menu da loja quebravam uma letra por linha e o topo do painel sobrepunha textos; em 768 px a data da lista de pedidos quebrava por caractere e a coluna de pendências ficava cortada |
| D-23 | Painel: grupos por tarefa (Dia a dia, Catálogo, Loja, Conta) e, abaixo de 1024 px, botão “Menu” com `<dialog>` no lugar da faixa com todos os itens (revoga “não há menu escondido”) | Em 390×844 o primeiro produto ficava a y = 1068 px; agora ≈ 300 px. A faixa crescia com cada nova área (14 itens) |
| D-24 | Configurações separadas por assunto em `/configuracoes/[secao]` e `/aparencia`; `/operacao` vira “Hoje”; títulos sem legenda acima | Uma página com segurança, plano, domínio, frete, dados e IA misturava tarefas raras com a rotina; endereços antigos redirecionam |
| D-25 | Checkout no celular: resumo recolhível no topo com o total sempre visível; na revisão, itens + entrega + total junto do botão de confirmar | O comprador via o total só no fim da página; contratos (idempotência, recálculo, resultado incerto) intocados |
| D-26 | Tema v2 versionado e validado no servidor, com conversão determinística do v1, leitura tolerante e proteção contra sobrescrita (`base_revision_id`, publicação da revisão exata, `expected_published_id` no reverter) | Personalização real sem aceitar HTML/CSS do lojista; duas sessões não se sobrescrevem em silêncio; lojas nunca ficam quebradas por tema antigo ou inválido |
| D-27 | Prévia ao vivo no editor via iframe `/preview/[id]?editor=1` + `postMessage` da mesma origem, com o **mesmo** componente da loja; catálogo e categorias passam a ter versão privada; só `/preview/*` pode ser enquadrado e só pela própria origem | Um renderizador só (o que se vê é o que publica); demais rotas continuam `X-Frame-Options: DENY` |
| D-28 | Proporção (`portrait`/`square`/`landscape`) e enquadramento (`cover`/`contain`) das fotos viram escolhas do tema, com ponto focal nas imagens de seção | Modelos precisam compor de forma diferente (retrato arejado × quadrado denso × foto inteira em fundo claro) |
| D-29 | Três modelos (Editorial, Essencial, Ateliê) com neutros, fontes, botões, cabeçalho e seções próprios; trocar de modelo preserva o conteúdo e mostra a prévia antes | Lojas de segmentos diferentes ficavam iguais; o lojista não perde o que já escreveu |
| D-30 | Imagens de demonstração só CC0/domínio público (Openverse, maioria do diretório de fotos do WordPress), com origem registrada; nenhuma foto de concorrente, marca ou pessoa identificável usada como modelo | Licença verificável; demonstração honesta e sem identidade de terceiros |
| D-31 | Direção **Compasso** para a plataforma: mesmos nomes de token com novos valores (canvas #F4F6F8, ação/foco #2548D8, seleção #EEF2FF, estados recalibrados), `action-pressed`, raios 8/12/16, lateral 224 px, `content-max` 80rem, títulos em Manrope | Identidade própria e mais precisa para a ferramenta de trabalho sem renomear tokens nem tocar nas vitrines; contraste conferido (52 combinações) |
| D-32 | Sem barra de topo no desktop do painel; estado de vendas e pagamento simulado só no bloco da loja; seções do conteúdo com divisórias, sem caixa branca | Remove a repetição de “Recebendo pedidos”/“Pagamentos simulados” e a composição cinza + cartões brancos |
| D-33 | Editor de aparência como espaço de trabalho (trilho, prévia com escala informada e opção de ampliar, propriedades de uma parte por vez; no desktop o bloco aberto não fecha pelo título) e estado “No ar, sem alterações pendentes” calculado comparando o conteúdo das revisões | Títulos de seção cortados, prévia minúscula sem escala e “Publicar” sempre ativo induziam publicação desnecessária; nenhuma regra de rascunho/publicação mudou |
| D-34 | Essencial com busca no cabeçalho, categorias em blocos de mesma altura, grade sem cartões e foto inteira no palco; Editorial com texto fora do produto (à direita no desktop, abaixo no celular) e nova foto CC0 de abertura; Ateliê com foto do processo coerente com o texto | Problemas apontados na revisão: busca e categorias pouco comerciais, foto da abertura sem o produto e imagem sem relação com o texto |
| D-35 | Tokens `store-*` “Casa Ipê” do material da direção ficam só registrados como exemplo de demonstração, sem fixture nem token | Uma fonte única de tokens; não renomear lojas de exemplo existentes nem impor identidade às vitrines |
| D-36 | Mídia do produto sem reordenar/remover na interface | Limite real da API (sem coluna de posição, sem `DELETE` para o papel da aplicação, só rota de vincular); exige decisão de produto e migração |

| D-37 | Novo espaço de trabalho: lateral grafite, acesso dividido, faixa de catálogo e resumo de pendências em Hoje | Solicitação de novo redesign; reutiliza tokens e fontes, mantém contratos e temas de vitrine |
