# Telas e fluxos — inventário e especificação

Base: commit `0179f4d`, arquivos reais de `apps/web/app` e controladores de `apps/api/src`. Fundamentos e componentes em [DESIGN.md](../../DESIGN.md). Critérios verificáveis em [ACEITE.md](ACEITE.md); lote de cada rota em [IMPLEMENTACAO.md](IMPLEMENTACAO.md).

Legenda de estado: **Implementado** (rota existe hoje), **Previsto** (exigido pela especificação, sem rota/tela própria), **Dependente de integração** (tela existe ou é prevista, mas a parte real depende de conta/fornecedor externo ainda não homologado).

## 1. Inventário de rotas reais

O verificador lê esta tabela: código, rota, estado e arquivo precisam existir.

| Código | Rota | Estado | Arquivo | Conteúdo atual | Componentes envolvidos |
|---|---|---|---|---|---|
| R01 | `/` | Implementado | `apps/web/app/page.tsx` | Entrar, criar acesso local, verificar e-mail, recuperar senha; lojas vinculadas; criar loja; configuração (nome, fuso); equipe e convites; aceitar convite; sair/revogar sessões | — |
| R02 | `/painel/[tenantId]` | Implementado | `apps/web/app/painel/[tenantId]/page.tsx` | Produtos, variações, preço, categorias, locais, ajuste de estoque, mídia, vínculo de imagem; fornecedor/políticas, tema (rascunho/publicação), frete local | `components/storefront.tsx` (`money`) |
| R03 | `/painel/[tenantId]/pedidos` | Implementado | `apps/web/app/painel/[tenantId]/pedidos/page.tsx` | Conta de pagamento (SIMULADA), filtros, lista, detalhe com expedição, incidentes, pagamentos, notificações, fiscal, correção de endereço, privacidade, protocolos, histórico | — |
| R04 | `/painel/[tenantId]/atendimento` | Implementado | `apps/web/app/painel/[tenantId]/atendimento/page.tsx` | Protocolos (abertos/atrasados/todos), detalhe, comunicação financeira, assumir, responder, concluir | — |
| R05 | `/painel/[tenantId]/operacao` | Implementado | `apps/web/app/painel/[tenantId]/operacao/page.tsx` | Alertas, pausar/retomar vendas, exportação, descrição com IA, MFA, plano e faturas, domínio próprio, transportadora | `components/ai-draft.tsx`, `components/commercial.tsx` |
| R06 | `/plataforma` | Implementado | `apps/web/app/plataforma/page.tsx` | MFA, lojas (consultar/suspender/reativar com motivo), alertas por loja, ciclo de cobrança, planos versionados, auditoria | — |
| R07 | `/preview/[tenantId]` | Implementado | `apps/web/app/preview/[tenantId]/[[...path]]/page.tsx` | Rascunho do tema renderizado pela vitrine, autorizado e noindex | `components/storefront.tsx` |
| R08 | `/lojas/[slug]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Início/catálogo, busca `?q=`, categorias, grade de produtos | `components/storefront.tsx`, `components/store-data.ts` |
| R09 | `/lojas/[slug]/categorias/[categoria]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Catálogo filtrado por categoria | idem |
| R10 | `/lojas/[slug]/produtos/[produto]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Produto, imagens, descrição, variação, quantidade, adicionar ao carrinho; JSON-LD; redirecionamento de slug antigo | idem |
| R11 | `/lojas/[slug]/paginas/[pagina]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Página institucional do tema | idem |
| R12 | `/lojas/[slug]/carrinho` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Carrinho, cotação de frete (tabela, retirada, transportadora), dados do comprador, revisão e confirmação | `components/storefront.tsx` (`Cart`), `components/checkout.tsx` (`Checkout`) |
| R13 | `/lojas/[slug]/pedidos/[id]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Comprovante, estados, nova tentativa de pagamento, solicitações (atendimento, arrependimento, cancelamento, dados), protocolos; acesso por segredo no fragmento `#acesso=` | `components/checkout.tsx` (`OrderView`) |
| R14 | `/lojas/[slug]/atendimento` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Contato geral sem compra e acompanhamento de protocolo por código | `components/checkout.tsx` (`ContactPage`) |

Observações do inventário:
- Em subdomínio gerenciado ou domínio próprio ativo, `apps/web/proxy.ts` reescreve `/…` para `/lojas/[slug]/…`: as telas R08–R14 são as mesmas sem o prefixo.
- `/lojas/[slug]/robots.txt` e `/lojas/[slug]/sitemap.xml` não têm interface e ficam fora do redesign.
- Não existe `not-found.tsx` nem `error.tsx`: 404 da vitrine usa a página padrão do Next.js e o proxy responde texto puro (“Loja não encontrada”). Tratamento visual de 404/erro entra no lote 3 sem criar rota nova (arquivos convencionais do App Router).
- Não existe rota própria de checkout nem de confirmação: o checkout fica em R12 e a confirmação/acompanhamento em R13 (decisão D-07: manter).

## 2. Previsto e dependente de integração (sem inventar URL)

| Código | Item | Estado | Onde aparece | O que o redesign faz agora |
|---|---|---|---|---|
| P01 | Onboarding / ativação assistida da loja | Previsto (especificação §2, §22.3; roteiro em `docs/operacao/onboarding-lojista.md`) | Não há rota; loja nasce em rascunho em R01 | Em R01, após criar a loja, mostrar lista de próximos passos que **já existem** (catálogo, fornecedor, tema, frete, conta de pagamento) com links para R02/R03/R05. Não criar rota nem fluxo novo. |
| P02 | Conta do comprador e histórico | Evolução posterior (especificação §2) | — | Nada. |
| P03 | Reembolso iniciado pela plataforma | Dependente de integração: API `POST /tenants/:tenantId/purchase/orders/:orderId/refunds` existe, **sem interface**; depende da homologação Mercado Pago (Fase 0, D02, T18) | R03 | Não expor botão. Manter procedimento manual do piloto (FinancialAlert). |
| I01 | Pagamento real Pix (QR/copia e cola) e cartão (formulário do gateway) | Dependente de integração (D02) | R12, R13 | Reservar o espaço na etapa Pagamento e no acompanhamento; enquanto SIMULADO, dizer isso. Não desenhar QR/cartão falsos. |
| I02 | Conectar conta Mercado Pago (OAuth) | Dependente de integração (D02) | R03 “Conta de pagamento” | Manter “Conectar conta SIMULADA” rotulada como simulação. |
| I03 | Domínio próprio real (DNS/TLS público) | Dependente de integração (D03) | R05 | Tela existe; aplicar layout; estados de domínio com rótulos da §8.2. |
| I04 | Transportadora real | Dependente de integração (D09) | R05, R12 (opção “Transportadora (cotação)”) | Tela existe; rotular simulador. |
| I05 | E-mail transacional real | Dependente de integração (D05) | R03 notificações, R13 | Estado “Simulada” explícito. |
| I06 | IA real para descrição | Dependente de integração (D11) | R05 | Seção existente; “desligado pela plataforma” quando for o caso. |
| I07 | Cobrança SaaS real | Dependente de integração (D07) | R05 plano e faturas, R06 ciclo de cobrança | Tela existe; preço vazio até decisão D07. |

## 3. Especificação por tela

Formato de cada tela: usuário · tarefa · hierarquia · ação principal · dados/API · estados · desktop/celular · critérios (IDs do ACEITE).

### R01 — Acesso e lojas (`/`)

- **Usuário:** qualquer pessoa da equipe (deslogada ou logada). Ambiente local usa códigos LOCAL em vez de e-mail.
- **Tarefa:** entrar; criar acesso e verificar e-mail; recuperar senha; escolher loja; criar loja em rascunho; ajustar nome/fuso; convidar/revogar funcionário (Dono); aceitar convite.
- **Hierarquia (deslogado):** coluna central de até 28rem com “Plataforma” (texto) → título “Entrar” → formulário → links para “Criar acesso” e “Recuperar acesso” (seções abaixo, cada uma com seu título). Aviso de ambiente local em `alert-info`. Código LOCAL em caixa com título “Código LOCAL — não é entrega de e-mail”.
- **Hierarquia (logado):** casca simples (sem lateral de loja) → “Suas lojas” como lista com nome, papel e “Abrir painel” → configuração da loja selecionada → equipe (Dono) → “Criar loja” e “Aceitar convite” como seções secundárias. Barra superior com e-mail, “Sair” e “Revogar todas as sessões” (este último em diálogo de confirmação).
- **Ação principal:** deslogado “Entrar”; logado “Abrir painel” da loja escolhida.
- **Dados/API:** `GET auth/session`, `POST auth/login|register|verify-email|recover|reset|logout|revoke-all`, `GET/POST tenants`, `GET/PATCH tenants/:id/settings`, `GET tenants/:id/members`, `PATCH …/members/:id/revoke`, `POST tenants/:id/invitations`, `POST invitations/accept`, `POST tenants/:id/configuration-check`.
- **Estados:** carregando sessão; API indisponível (“Não foi possível conectar à API”); credenciais inválidas; nenhuma loja vinculada (vazio com “Criar loja” e “Aceitar convite”); Funcionário vê configuração somente leitura; código local visível/oculto.
- **Desktop/celular:** coluna única nos dois; no desktop logado, lista de lojas e configuração lado a lado (2/3 + 1/3).
- **Preservar para testes:** formulário “Entrar”, rótulos “E-mail”, “Senha”, “Nome de exibição”; botões “Entrar”, “Sair”, “Salvar configuração” e o nome acessível do botão de loja no formato “Nome — Dono/Funcionário”.
- **Critérios:** A-R01-*.

### R02 — Catálogo e vitrine (`/painel/[tenantId]`)

- **Usuário:** Dono e Funcionário (fornecedor, tema e frete: só Dono).
- **Tarefa:** listar e encontrar produtos; cadastrar produto simples; editar informações e status; adicionar variações; ajustar preço; ajustar estoque com motivo; enviar/vincular imagens; organizar categorias/locais; (Dono) perfil do fornecedor, tema e publicação, frete local.
- **Hierarquia:** casca do painel → PageHeader “Produtos” (ações: “Novo produto” principal, “Ajustar estoque”) → SubNav `Produtos · Estoque · Mídia · Categorias e locais` → DataTable de produtos. Edição: visão de produto na mesma rota (`?produto=<id>` proposto, D-09) com coluna principal (Informações, Variações, Imagens, Estoque) e lateral (Publicação, Organização, Descrição com IA). Vitrine e frete: seção própria (`#vitrine`) com Fornecedor e políticas, Tema (rascunho → preview → publicar) e Frete local.
- **Ação principal:** listagem “Novo produto”; edição “Salvar informações”; vitrine “Publicar vitrine local” (depois de salvar rascunho).
- **Dados/API:** `GET tenants/:id/catalogue` (produtos+variações, categorias, locais, saldos, movimentos, mídia; até 100), `POST catalogue/products`, `PATCH catalogue/products/:id` (nome, slug, descrição, status, categoria), `POST catalogue/products/:id/variants` (SKU, preço, atributos 1–5, peso/dimensões), `PATCH catalogue/variants/:id` (preço, peso, dimensões), `POST catalogue/categories|locations|adjustments|media|media/maintenance|products/:id/media`; `GET tenants/:id/storefront`, `POST storefront/profile|draft|publish|shipping`.
- **Estados:** carregando catálogo; nenhum produto (vazio com “Cadastrar primeiro produto”); busca sem resultado; produto sem foto; variação esgotada; mídia processando/falhou; cota de mídia excedida (409); SKU/slug em conflito (409); saldo insuficiente ao reduzir (409); Funcionário sem acesso a fornecedor/tema/frete; publicação falhou (rascunho preservado).
- **Desktop/celular:** tabela completa ≥ 768 px; lista empilhada < 768 px; edição em duas colunas ≥ 1024 px, coluna única abaixo.
- **Preservar para testes:** heading “Cadastrar produto simples” (formulário de criação, pode ficar dentro de “Novo produto”), formulários com `aria-label` atuais, botões “Publicar vitrine local”, campo de JSON substituído só se o teste for atualizado junto.
- **Protótipo:** Composições 1 e 2.
- **Critérios:** A-R02-*.

### R03 — Pedidos (`/painel/[tenantId]/pedidos`)

- **Usuário:** Dono e Funcionário (cancelar, anotar incidente, realocar, reprocessar eventos, corrigir endereço, privacidade e conta de pagamento: só Dono).
- **Tarefa:** encontrar pedidos com pendência; entender estado em quatro dimensões; separar, enviar, marcar retirada, confirmar entrega; tratar incidente financeiro pelo procedimento do piloto; registrar referência fiscal; atender privacidade.
- **Hierarquia:** lista: PageHeader “Pedidos” → filtros do servidor (pagamento, entrega, pedido, número, “somente com pendências”) → DataTable (Nº, data, comprador, total, pagamento, entrega, pendências). Detalhe: trilha `Pedidos / Nº` → h1 “Pedido nº N” → faixa de estados → FinancialAlert (se houver) → coluna principal (Itens e totais, Pagamentos e recebimentos com total recebido/devolvido/a devolver, Expedição com bloqueios, Incidentes, Histórico) → lateral (Comprador, Entrega, Notificações, Protocolos, Documento fiscal, Ações do Dono). Conta de pagamento sai do topo da lista para um bloco compacto “Conta de pagamento: SIMULADA · Conectada” com link para gerenciar.
- **Ação principal:** a próxima ação de expedição permitida (Iniciar separação → Registrar envio / Marcar pronto para retirada → Confirmar entrega). Com bloqueio: botão desabilitado + motivos do servidor.
- **Dados/API:** `GET tenants/:id/operations/orders?…`, `GET purchase/orders/:id`, `GET operations/orders/:id/impediments|notifications`, `POST operations/orders/:id/process|ship|pickup-ready|deliver|return|fiscal|reconcile|access/revoke|erase|incidents/:iid/resolve`, `POST purchase/orders/:id/cancel|address|outbox/retry|reallocate|incidents/:iid/note`, `GET/POST purchase/accounts…`, `POST operations/exports`, `POST purchase/attempts/:id/simulate` (somente SIMULADO).
- **Estados:** carregando; nenhum pedido; filtro sem resultado; pagamento aguardando; resultado desconhecido (UNKNOWN); excedente/devolução pendente; pago sem estoque; disputa aberta; cancelado; retirada; notificação falhou; eventos com falha; comprador anonimizado.
- **Desktop/celular:** lista em tabela ≥ 768 px, empilhada abaixo; detalhe em duas colunas ≥ 1024 px.
- **Preservar para testes:** heading “Pedidos recentes” (pode ser o título da lista), botão de pedido com nome “Nº N”, headings “Expedição”, “Notificações ao comprador”, “Protocolos do consumidor”.
- **Protótipo:** Composição 3.
- **Critérios:** A-R03-*.

### R04 — Atendimento (`/painel/[tenantId]/atendimento`)

- **Usuário:** Dono e Funcionário (registrar comunicação financeira: só Dono).
- **Tarefa:** ver protocolos por prazo; responder; registrar comunicação ao meio de pagamento em arrependimento/cancelamento de pedido pago; concluir com resultado.
- **Hierarquia:** PageHeader “Atendimento” + texto curto do prazo legal → SegmentedFilter `Abertos · Atrasados · Todos` → DataTable (tipo, pedido, situação, prazo, alerta financeiro) → detalhe em duas colunas: conversa (mensagens em ordem cronológica) e lateral (contato, pedido vinculado, comunicação financeira, conclusão).
- **Ação principal:** “Responder”; quando houver obrigação financeira sem registro, o bloco de comunicação aparece antes da resposta.
- **Dados/API:** `GET operations/support?filter=`, `GET operations/support/:id`, `POST …/assign|reply|resolve|financial`.
- **Estados:** nenhum protocolo; atrasado (tom ação); comunicação financeira pendente; concluído (somente leitura); falha de notificação.
- **Preservar para testes:** heading “Protocolos”, botão de protocolo com nome iniciando pelo tipo (“Contato geral…”), formulário “Responder consumidor”.
- **Critérios:** A-R04-*.

### R05 — Operação e conta (`/painel/[tenantId]/operacao`)

- **Usuário:** Dono (Funcionário vê alertas e IA conforme permissão atual).
- **Tarefa:** entender alertas e o que fazer; pausar/retomar vendas; exportar dados; IA de descrição; MFA; plano e faturas; domínio próprio; transportadora.
- **Hierarquia:** PageHeader “Operação” → Alertas (lista com código, quantidade e instrução — texto de `help` atual) → Vendas → Conta: MFA, Plano e faturas, Domínio próprio, Transportadora → Dados: Exportação → Descrição com IA. SubNav por âncoras.
- **Ação principal:** depende do alerta; sem alertas, nenhuma ação principal destacada.
- **Dados/API:** `GET operations/status`, `POST operations/sales/pause|resume|exports|carrier`, `GET/POST tenants/:id/ai/settings`, `POST catalogue/products/:id/ai-description`, `…/ai-generations/:id/save|discard`, `GET auth/session`, `POST auth/mfa/setup|enable|verify`, `GET tenants/:id/billing`, `POST billing/plan|cancel`, `GET/POST tenants/:id/domains`, `POST domains/:id/verify|canonical|disable`.
- **Estados:** sem alertas (sucesso); alertas críticos; loja suspensa pela plataforma (vendas bloqueadas, explicação); vendas pausadas; MFA não configurado / não confirmado nesta sessão; códigos de recuperação exibidos uma vez; assinatura em atraso; nenhum plano publicado (D07); domínio em cada estado; IA desligada.
- **Preservar para testes:** heading “Alertas”, regiões “Verificação em duas etapas” e “Plano e faturas”, formulários “Confirmar MFA”, “Cadastrar domínio”, “Configurar transportadora”, botões “Configurar MFA”, “Ativar”, “Confirmar”, “Cadastrar”, “Salvar”, textos “confirmado nesta sessão”, “Códigos de recuperação”, “Transportadora configurada.”.
- **Critérios:** A-R05-*.

### R06 — Administração da plataforma (`/plataforma`)

- **Usuário:** administrador da plataforma com MFA confirmado.
- **Tarefa:** ver lojas e alertas; consultar loja de forma auditada; suspender/reativar com motivo; gerir versões de plano; executar ciclo de cobrança; ler auditoria.
- **Hierarquia:** faixa `context-global` → SubNav `Lojas · Alertas · Planos · Auditoria` → DataTable de lojas (nome, slug, ciclo, plano, assinatura, ação “Consultar…”) → ação abre diálogo pedindo motivo → resultado em bloco “Inspecionando” (detalhe estruturado, não JSON cru) → suspender/reativar em diálogo com motivo.
- **Ação principal:** “Consultar loja…”.
- **Dados/API:** `GET platform/tenants`, `GET platform/tenants/:id?reason=`, `POST platform/tenants/:id/suspend|reactivate|plan`, `GET/POST platform/plans`, `POST platform/plans/:id/activate|retire`, `GET platform/alerts|audit`, `POST platform/billing/run|ai/policy`.
- **Estados:** sem MFA (instrução para ativar); MFA a confirmar; nenhuma loja; nenhum alerta; plano rascunho/ativo/aposentado; ação negada.
- **Preservar para testes:** headings “Lojas”, “Planos (versões imutáveis)”; textos “PILOT v1”, “Piloto”.
- **Critérios:** A-R06-*.

### R07 — Preview privado (`/preview/[tenantId]`)

- **Usuário:** integrante autorizado da loja.
- **Tarefa:** conferir o rascunho do tema antes de publicar.
- **Hierarquia:** faixa fixa de aviso “Preview privado do rascunho — não publicado” (tom pendente, ícone olho) com link “Voltar ao painel” → vitrine renderizada com tokens da loja. Carrinho/atendimento/pedidos mostram “Não disponível no preview”.
- **Estados:** negado/rascunho inexistente (mensagem + “Entrar no painel”).
- **Preservar para testes:** heading do título do rascunho.
- **Critérios:** A-R07-*.

### R08/R09 — Catálogo, busca e categoria (`/lojas/[slug]`, `/lojas/[slug]/categorias/[categoria]`)

- **Usuário:** comprador.
- **Tarefa:** navegar pelo catálogo, buscar por nome/SKU, filtrar por categoria.
- **Hierarquia:** cabeçalho da loja → mensagem principal do tema (texto, sem banner genérico; imagem do tema só se o lojista enviou) → busca → categorias como navegação → grade de StoreProductCard (2 colunas celular, 3–4 desktop) → rodapé com fornecedor.
- **Ação principal:** abrir produto.
- **Dados/API:** `GET public/stores/:slug?q=&category=` (até 100 produtos ativos), mídia `public/stores/:slug/media/:id/small|large`.
- **Estados:** nenhum produto publicado; busca sem resultado (“Nenhum produto encontrado para ‘termo’” + limpar busca); produto sem foto; esgotado; loja sintética; loja suspensa (404 da vitrine, pedidos continuam em R13).
- **Preservar para testes:** heading do título da loja, searchbox “Buscar produto ou SKU”, botão “Pesquisar”, links com nome do produto, heading “Fornecedor e atendimento”.
- **Critérios:** A-R08-*, A-R09-*.

### R10 — Produto (`/lojas/[slug]/produtos/[produto]`)

- **Usuário:** comprador.
- **Tarefa:** avaliar produto, escolher variação e quantidade, adicionar ao carrinho.
- **Hierarquia:** trilha → galeria (4:5) → nome (h1, fonte de título da loja), preço, nota de frete → VariantPicker → disponibilidade + SKU → quantidade + “Adicionar ao carrinho” → descrição, cuidados/riscos (`supplier.risks`), entrega e trocas → relacionados (opcional, só se houver dados; hoje a API não fornece relacionados — usar categoria apenas se for implementado sem nova API, senão omitir).
- **Ação principal:** “Adicionar ao carrinho” (cor da loja).
- **Dados/API:** `GET public/stores/:slug/products/:product`, `POST public/stores/:slug/cart/items`.
- **Estados:** variação esgotada; todas esgotadas (botão desabilitado + “Produto esgotado”); quantidade acima do saldo (erro do servidor junto ao campo); adicionado (“Variação adicionada ao carrinho. Ver carrinho”); sem foto; slug antigo (redirecionamento 301).
- **Preservar para testes:** heading com nome do produto, botão “Adicionar ao carrinho”, link “Ver carrinho”, status após adicionar.
- **Protótipo:** Composição 4.
- **Critérios:** A-R10-*.

### R11 — Página institucional (`/lojas/[slug]/paginas/[pagina]`)

- **Usuário:** comprador. **Tarefa:** ler políticas/sobre. **Hierarquia:** cabeçalho → título → texto (`white-space: pre-wrap`, largura de leitura ~70 caracteres) → rodapé. **Estados:** página inexistente (404). **Critérios:** A-R11-*.

### R12 — Carrinho e checkout (`/lojas/[slug]/carrinho`)

- **Usuário:** comprador.
- **Tarefa:** revisar itens, mudar quantidades, cotar entrega, informar dados, revisar e confirmar compra.
- **Hierarquia:** etapas (Carrinho → Entrega → Seus dados → Revisão) → coluna principal com a etapa atual e as concluídas resumidas → Resumo do pedido (itens, subtotal, frete, total, validade da cotação). Etapa Entrega: método (tabela de CEP, retirada, transportadora quando configurada) + endereço. Seus dados: nome completo, e-mail para comprovante, forma de pagamento. Revisão: resumos com “Alterar”, aviso de reserva de 40 minutos e políticas, botão “Confirmar compra de R$ X”.
- **Ação principal:** por etapa: “Calcular frete” → “Revisar pedido” → “Confirmar compra de R$ X”.
- **Dados/API:** `GET/POST public/stores/:slug/cart`, `…/cart/items`, `…/cart/quotes`, `…/cart/quotes/validate`, `GET …/payment-methods`, `POST …/cart/checkout` (chave de idempotência em `sessionStorage`).
- **Estados:** carrinho vazio (“Seu carrinho está vazio” + voltar ao catálogo); item indisponível/acima do saldo; CEP sem atendimento; cotação vencida/mudou (novo total exige confirmação); pagamento indisponível (“Nenhum pedido será criado”); erro ao confirmar com repetição segura; ambiente SIMULADO.
- **Preservar para testes:** heading “Seu carrinho”; formulário “Calcular frete” com rótulos “CEP”, “Rua”, “Número”, “Cidade”, “UF”; botão “Calcular frete”; formulário “Dados do comprador” com “Nome completo” e “E-mail para comprovante”; botões “Revisar pedido”, “Corrigir dados”, “Confirmar compra de R$ X”; texto “Revise antes de confirmar”.
- **Protótipo:** Composição 5.
- **Critérios:** A-R12-*.

### R13 — Comprovante e acompanhamento (`/lojas/[slug]/pedidos/[id]`)

- **Usuário:** comprador com segredo de acesso (fragmento `#acesso=`, movido para `sessionStorage`).
- **Tarefa:** guardar comprovante; saber se o pagamento foi confirmado; acompanhar envio; abrir atendimento/arrependimento/cancelamento; acompanhar protocolos.
- **Hierarquia:** legenda “Comprovante” (+ “pagamento simulado” quando aplicável) → h1 “Pedido nº N” → Alert de estado financeiro (aguardando/pendência) → estados → itens e totais → entrega e comprador → fornecedor → “Tentar pagar novamente” (quando permitido) → solicitações e protocolos.
- **Ação principal:** quando aguardando pagamento: nenhuma ação além de aguardar (atualiza sozinho); quando todas as tentativas falharam: “Tentar pagar novamente”.
- **Dados/API:** `GET public/stores/:slug/orders/:id` (cabeçalho `X-Order-Token`), `POST …/orders/:id/attempts`, `POST …/orders/:id/requests`, `GET/POST …/requests/:rid(/messages)`.
- **Estados:** não autorizado (“Pedido não autorizado.” + orientação); aguardando confirmação; pago; pendência da loja; enviado/retirada; cancelado; loja suspensa (pedido continua acessível); protocolo registrado com prazo.
- **Preservar para testes:** heading “Pedido nº N”, texto “COMPROVANTE · PAGAMENTO SIMULADO”, “Pago”, formulário “Abrir solicitação” (rótulos “Tipo”, “Mensagem”), botão “Enviar solicitação”, mensagem “Protocolo … registrado em …”.
- **Protótipo:** estado pendente na Composição 5.
- **Critérios:** A-R13-*.

### R14 — Fale com a loja (`/lojas/[slug]/atendimento`)

- **Usuário:** qualquer visitante. **Tarefa:** enviar mensagem sem compra; acompanhar protocolo com código.
- **Hierarquia:** título → explicação curta → formulário (Nome, E-mail, Mensagem) → confirmação com protocolo, código (exibido uma vez, botão copiar) e prazo → “Acompanhar protocolo”.
- **Estados:** enviado; código inválido; erro de rede com dados preservados.
- **Preservar para testes:** formulário “Contato geral”, rótulos “Nome”, “E-mail”, “Mensagem”, botão “Enviar”, texto “Código de acompanhamento:”.
- **Critérios:** A-R14-*.

## 4. Fluxos principais

1. **Lojista publica a primeira vitrine:** R01 entrar → criar loja → R02 cadastrar produto → variação/preço → estoque → imagem → Vitrine e frete: fornecedor → tema → preview (R07) → publicar → frete → R03 conectar conta (SIMULADA) → abrir vitrine (R08).
2. **Compra:** R08/R09 → R10 variação → adicionar → R12 carrinho → entrega → dados → revisão → confirmar → R13 aguardando confirmação → pago.
3. **Pedido com pendência financeira:** R05 alerta → R03 lista “somente com pendências” → detalhe → FinancialAlert → gateway externo → anotar referência → nova consulta → incidente resolvido pelo gateway → expedição liberada.
4. **Arrependimento:** R13 abrir solicitação → R04 protocolo → comunicação financeira (Dono) → resposta → conclusão.
5. **Suporte da plataforma:** R06 lista → consultar com motivo → bloco Inspecionando → suspender com motivo (diálogo) → vitrine deixa de vender; R13 continua acessível.
