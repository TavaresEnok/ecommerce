# Telas e fluxos — inventário e especificação

Base: commit `0179f4d` + evolução de UX/personalização de 03/10/2026 (lotes A–C), arquivos reais de `apps/web/app` e controladores de `apps/api/src`. Fundamentos e componentes em [DESIGN.md](../../DESIGN.md). Critérios verificáveis em [ACEITE.md](ACEITE.md); lote de cada rota em [IMPLEMENTACAO.md](IMPLEMENTACAO.md).

Legenda de estado: **Implementado** (rota existe hoje), **Previsto** (exigido pela especificação, sem rota/tela própria), **Dependente de integração** (tela existe ou é prevista, mas a parte real depende de conta/fornecedor externo ainda não homologado).

## 1. Inventário de rotas reais

O verificador lê esta tabela: código, rota, estado e arquivo precisam existir.

| Código | Rota | Estado | Arquivo | Conteúdo atual | Componentes envolvidos |
|---|---|---|---|---|---|
| R01 | `/` | Implementado | `apps/web/app/page.tsx` | Entrar, criar acesso local, verificar e-mail, recuperar senha; lojas vinculadas; criar loja; configuração (nome, fuso); equipe e convites; aceitar convite; sair/revogar sessões | — |
| R02 | `/painel/[tenantId]` | Implementado | `apps/web/app/painel/[tenantId]/page.tsx` | Produtos (lista com busca de escopo declarado e filtros na URL; `?novo=1` cadastro; `?produto=<id>` edição progressiva), Estoque (`?aba=estoque`), Imagens (`?aba=midia`), Categorias e locais (`?aba=organizacao`); `?aba=vitrine` → R15 e `?aba=frete` → R16 | `components/panel/catalog.tsx`, `components/panel/MediaUploader.tsx` |
| R03 | `/painel/[tenantId]/pedidos` | Implementado | `apps/web/app/painel/[tenantId]/pedidos/page.tsx` | Lista com próximo passo por pedido e visões rápidas (Precisam de atenção, A enviar, Em separação, Enviados), filtros (recolhidos no celular), conta de pagamento no fim (recolhível; aviso no topo se não houver conta), detalhe com expedição, incidentes, pagamentos, notificações, fiscal, correção de endereço, privacidade, protocolos, histórico | — |
| R04 | `/painel/[tenantId]/atendimento` | Implementado | `apps/web/app/painel/[tenantId]/atendimento/page.tsx` | Protocolos (abertos/atrasados/todos), detalhe, comunicação financeira, assumir, responder, concluir | — |
| R05 | `/painel/[tenantId]/operacao` | Implementado | `apps/web/app/painel/[tenantId]/operacao/page.tsx` | “Hoje”: alertas, contadores que abrem listas filtradas, vendas (pausa recolhida), atalhos; âncoras antigas redirecionam para R16 | `components/panel/Shell.tsx` |
| R06 | `/plataforma` | Implementado | `apps/web/app/plataforma/page.tsx` | MFA, lojas (consultar/suspender/reativar com motivo), alertas por loja, ciclo de cobrança, planos versionados, auditoria | — |
| R07 | `/preview/[tenantId]` | Implementado | `apps/web/app/preview/[tenantId]/[[...path]]/page.tsx` | Rascunho do tema renderizado pela vitrine (início, catálogo, categorias, páginas, produtos), autorizado e noindex; com `?editor=1`, recebe o tema não salvo do editor (R15) | `components/storefront.tsx`, `components/preview-live.tsx` |
| R08 | `/lojas/[slug]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Início montado pelas seções do tema (destaque, produtos, categorias, imagem com texto, texto), busca `?q=` | `components/storefront.tsx`, `components/store-data.ts` |
| R09 | `/lojas/[slug]/categorias/[categoria]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Catálogo filtrado por categoria | idem |
| R10 | `/lojas/[slug]/produtos/[produto]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Produto, imagens, descrição, variação, quantidade, adicionar ao carrinho; JSON-LD; redirecionamento de slug antigo | idem |
| R11 | `/lojas/[slug]/paginas/[pagina]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Página institucional do tema | idem |
| R12 | `/lojas/[slug]/carrinho` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Carrinho, cotação de frete (tabela, retirada, transportadora), dados do comprador, revisão e confirmação | `components/storefront.tsx` (`Cart`), `components/checkout.tsx` (`Checkout`) |
| R13 | `/lojas/[slug]/pedidos/[id]` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Comprovante, estados, nova tentativa de pagamento, solicitações (atendimento, arrependimento, cancelamento, dados), protocolos; acesso por segredo no fragmento `#acesso=` | `components/checkout.tsx` (`OrderView`) |
| R14 | `/lojas/[slug]/atendimento` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Contato geral sem compra e acompanhamento de protocolo por código | `components/checkout.tsx` (`ContactPage`) |
| R15 | `/painel/[tenantId]/aparencia` | Implementado | `apps/web/app/painel/[tenantId]/aparencia/page.tsx` | Editor de aparência: modelo, identidade, layout e fotos, seções da página inicial, menu, rodapé, páginas, histórico; prévia ao vivo celular/computador; salvar rascunho, publicar, restaurar, republicar versão | `components/panel/appearance.tsx`, `components/theme-model.ts`, `components/brand.ts` |
| R16 | `/painel/[tenantId]/configuracoes/[secao]` | Implementado | `apps/web/app/painel/[tenantId]/configuracoes/[secao]/page.tsx` | `loja` (nome, fuso, fornecedor e políticas), `entregas` (formas de entrega e transportadora), `dominio`, `seguranca` (verificação em duas etapas), `plano`, `dados` (exportação e descrição com IA); outra seção → 404 | `components/panel/settings.tsx`, `components/ai-draft.tsx` |
| R17 | `/lojas/[slug]/produtos` | Implementado | `apps/web/app/lojas/[slug]/[[...path]]/page.tsx` | Catálogo completo com faixa de categorias (“Todos os produtos”) | `components/storefront.tsx` |

Observações do inventário:
- Em subdomínio gerenciado ou domínio próprio ativo, `apps/web/proxy.ts` reescreve `/…` para `/lojas/[slug]/…`: as telas R08–R14 são as mesmas sem o prefixo.
- `/lojas/[slug]/robots.txt` e `/lojas/[slug]/sitemap.xml` não têm interface e ficam fora do redesign.
- 404 da vitrine: `apps/web/app/lojas/[slug]/not-found.tsx` (“Página não encontrada” com volta ao início); o proxy responde texto puro (“Loja não encontrada”) para host desconhecido.
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
- **Hierarquia (deslogado, D-37):** desktop com introdução em coluna grafite e formulário de até 30rem; celular com formulário em uma coluna com “Plataforma” (texto) → título “Entrar” → formulário → links para “Criar acesso” e “Recuperar acesso” (seções abaixo, cada uma com seu título). Aviso de ambiente local em `alert-info`. Código LOCAL em caixa com título “Código LOCAL — não é entrega de e-mail”.
- **Hierarquia (logado):** casca simples (sem lateral de loja) → “Suas lojas” como lista com nome, papel e “Abrir painel” → configuração da loja selecionada → equipe (Dono) → “Criar loja” e “Aceitar convite” como seções secundárias. Barra superior com e-mail, “Sair” e “Revogar todas as sessões” (este último em diálogo de confirmação).
- **Ação principal:** deslogado “Entrar”; logado “Abrir painel” da loja escolhida.
- **Dados/API:** `GET auth/session`, `POST auth/login|register|verify-email|recover|reset|logout|revoke-all`, `GET/POST tenants`, `GET/PATCH tenants/:id/settings`, `GET tenants/:id/members`, `PATCH …/members/:id/revoke`, `POST tenants/:id/invitations`, `POST invitations/accept`, `POST tenants/:id/configuration-check`.
- **Estados:** carregando sessão; API indisponível (“Não foi possível conectar à API”); credenciais inválidas; nenhuma loja vinculada (vazio com “Criar loja” e “Aceitar convite”); Funcionário vê configuração somente leitura; código local visível/oculto.
- **Desktop/celular (D-37):** deslogado em duas colunas a partir de 1024 px, uma abaixo disso; no desktop logado, lista de lojas e configuração lado a lado (2/3 + 1/3).
- **Preservar para testes:** formulário “Entrar”, rótulos “E-mail”, “Senha”, “Nome de exibição”; botões “Entrar”, “Sair”, “Salvar configuração” e o nome acessível do botão de loja no formato “Nome — Dono/Funcionário”.
- **Critérios:** A-R01-*.

### R02 — Catálogo (`/painel/[tenantId]`)

- **Usuário:** Dono e Funcionário.
- **Tarefa:** encontrar produtos; cadastrar; editar o essencial (nome, preço, disponibilidade, situação, descrição) e, quando preciso, organização/endereço, imagens, variações e estoque por local.
- **Hierarquia (lista):** PageHeader “Produtos” (contagem, “Novo produto”) → busca cujo rótulo diz o escopo (“Buscar em N produtos”; no limite de 100, “Buscar nos primeiros 100 produtos (A–Z)” + aviso) → filtros Situação/Categoria (sempre visíveis ≥ 768 px; no celular atrás de “Filtros” com contagem) → chips dos filtros aplicados → linhas compactas (celular: foto, nome, categoria, preço, saldo; primeiro item visível em 390×844) ou tabela (desktop). Busca e filtros ficam na URL e são lembrados ao voltar da edição.
- **Hierarquia (edição, `?produto=<id>`):** “‹ Produtos” → h1 nome + situação + “Ver na loja” → Informações principais (nome; preço editável quando há uma variação, faixa + “Editar nas variações” quando há várias; disponível para venda + “Ajustar estoque”; situação; descrição) → bloco recolhível “Organização e endereço” (categoria e endereço; abre sozinho com erro) → barra de salvar fixa → Imagens (MediaUploader; vínculo automático ao terminar) → recolhíveis “Variações” e “Estoque por local”. Sair com alterações pergunta antes.
- **Cadastro (`?novo=1`):** página própria (Nome, Preço, SKU, Descrição, Categoria, Endereço na loja preenchido a partir do nome); conflito de endereço/SKU volta ao campo certo com a mensagem da API.
- **Ação principal:** lista “Novo produto”; edição “Salvar alterações”; cadastro “Cadastrar produto”.
- **Dados/API:** `GET tenants/:id/catalogue` (até 100 produtos por nome), `POST catalogue/products` (pré-checagem de endereço e SKU → 409 com mensagem), `PATCH catalogue/products/:id`, `POST catalogue/products/:id/variants`, `PATCH catalogue/variants/:id`, `POST catalogue/categories|locations|adjustments|media|media/maintenance|products/:id/media`.
- **Estados:** carregando; nenhum produto (“Cadastre o primeiro produto”); busca sem resultado (“Nada encontrado para …” + “Limpar busca e filtros”); produto sem foto; variação esgotada; envio de imagem (conferindo, na fila, enviando %, processando no servidor, pronta, falhou + tentar de novo); conflitos 409; saldo insuficiente; salvar parcial (nome salvo, preço não) explicado.
- **Desktop/celular:** tabela ≥ 768 px; linhas compactas abaixo; edição em coluna única de até 52rem.
- **Preservar para testes:** heading “Produtos”, formulários “Cadastrar produto” e “Ajustar estoque” com os rótulos atuais, “Limpar busca e filtros”, “Carregando dados autorizados do catálogo…”.
- **Critérios:** A-R02-*, UX01, UX02, UX04, UX05, UX06, UI01.

### R03 — Pedidos (`/painel/[tenantId]/pedidos`)

- **Usuário:** Dono e Funcionário (cancelar, anotar incidente, realocar, reprocessar eventos, corrigir endereço, privacidade e conta de pagamento: só Dono).
- **Tarefa:** saber o que fazer primeiro; separar, enviar, marcar retirada, confirmar entrega; tratar incidente financeiro pelo procedimento do piloto; registrar referência fiscal; atender privacidade.
- **Hierarquia (lista):** PageHeader “Pedidos” → aviso se não há conta de pagamento (com “Conectar conta SIMULADA”) → “Pedidos recentes” → visões rápidas (Todos, Precisam de atenção, A enviar, Em separação, Enviados) → filtros do servidor (recolhidos no celular) → tabela: Pedido, **Próximo passo** (devolver valor, responder disputa, resolver pendência, responder solicitação, aguardar pagamento, separar, registrar envio, confirmar entrega, concluído), Pagamento, Entrega, Total, Data; linhas com pendência financeira marcadas à esquerda → bloco recolhível “Conta de pagamento” (conta simulada, sem dinheiro real; revogar). Sem nenhum pedido: só o estado vazio.
- **Hierarquia (detalhe):** inalterada — trilha `Pedidos / Nº` → h1 “Pedido nº N” → estados → FinancialAlert → itens e totais, pagamentos, expedição com bloqueios, incidentes, histórico → lateral com comprador, entrega e ações.
- **Ação principal:** na lista, abrir o pedido do topo de “Precisam de atenção”; no detalhe, a próxima ação de expedição permitida.
- **Dados/API:** `GET tenants/:id/operations/orders?payment_status&fulfillment_status&order_status&number&pending`, demais rotas do detalhe inalteradas; nenhuma regra financeira mudou (o próximo passo é só leitura dos estados).
- **Estados:** carregando; nenhum pedido; nenhum pedido precisa de atenção; filtro sem resultado; resultado desconhecido (UNKNOWN = “Aguardando confirmação do pagamento”, nunca “recusado”); excedente/devolução pendente; disputa; cancelado; retirada.
- **Preservar para testes:** heading “Pedidos recentes”, formulário “Filtrar pedidos” (`#f-pay`…), links “Nº N”, headings “Expedição”, “Notificações ao comprador”, “Protocolos do consumidor”.
- **Critérios:** A-R03-*, UX03, UX05.

### R04 — Atendimento (`/painel/[tenantId]/atendimento`)

- **Usuário:** Dono e Funcionário (registrar comunicação financeira: só Dono).
- **Tarefa:** ver protocolos por prazo; responder; registrar comunicação ao meio de pagamento em arrependimento/cancelamento de pedido pago; concluir com resultado.
- **Hierarquia:** PageHeader “Atendimento” + texto curto do prazo legal → SegmentedFilter `Abertos · Atrasados · Todos` → DataTable (tipo, pedido, situação, prazo, alerta financeiro) → detalhe em duas colunas: conversa (mensagens em ordem cronológica) e lateral (contato, pedido vinculado, comunicação financeira, conclusão).
- **Ação principal:** “Responder”; quando houver obrigação financeira sem registro, o bloco de comunicação aparece antes da resposta.
- **Dados/API:** `GET operations/support?filter=`, `GET operations/support/:id`, `POST …/assign|reply|resolve|financial`.
- **Estados:** nenhum protocolo; atrasado (tom ação); comunicação financeira pendente; concluído (somente leitura); falha de notificação.
- **Preservar para testes:** heading “Protocolos”, botão de protocolo com nome iniciando pelo tipo (“Contato geral…”), formulário “Responder consumidor”.
- **Critérios:** A-R04-*.

### R05 — Hoje (`/painel/[tenantId]/operacao`)

- **Usuário:** Dono e Funcionário (pausar/retomar: só Dono).
- **Tarefa:** ver o que pede atenção agora e ir direto para a lista certa.
- **Hierarquia:** PageHeader “Hoje” → Alertas (“Sem alertas” ou contadores — pedidos com pendência, aguardando pagamento, protocolos — que abrem as listas filtradas, mais os alertas operacionais com instrução) → Vendas (estado; pausa num bloco recolhível com motivo obrigatório) → Atalhos (cadastrar produto, ver pedidos, editar aparência, ver loja publicada).
- **Dados/API:** `GET operations/status`, `POST operations/sales/pause|resume`.
- **Estados:** sem alertas; alertas críticos; loja suspensa; vendas pausadas.
- **Endereços antigos:** `#seguranca`, `#plano`, `#dominio`, `#transportadora`, `#dados`, `#ia` redirecionam para R16.
- **Preservar para testes:** heading “Alertas”, formulário “Pausar vendas” (dentro do bloco “Pausar novas vendas”), “Novas vendas pausadas.”, “Retomar vendas”.
- **Critérios:** A-R05-01, A-R05-02, UX03.

### R06 — Administração da plataforma (`/plataforma`)

- **Usuário:** administrador da plataforma com MFA confirmado.
- **Tarefa:** ver lojas e alertas; consultar loja de forma auditada; suspender/reativar com motivo; gerir versões de plano; executar ciclo de cobrança; ler auditoria.
- **Hierarquia:** faixa `context-global` → SubNav `Lojas · Alertas · Planos · Auditoria` → DataTable de lojas (nome, slug, ciclo, plano, assinatura, ação “Consultar…”) → ação abre diálogo pedindo motivo → resultado em bloco “Inspecionando” (detalhe estruturado, não JSON cru) → suspender/reativar em diálogo com motivo.
- **Ação principal:** “Consultar loja…”.
- **Dados/API:** `GET platform/tenants`, `GET platform/tenants/:id?reason=`, `POST platform/tenants/:id/suspend|reactivate|plan`, `GET/POST platform/plans`, `POST platform/plans/:id/activate|retire`, `GET platform/alerts|audit`, `POST platform/billing/run|ai/policy`.
- **Estados:** sem MFA (instrução para ativar); MFA a confirmar; nenhuma loja; nenhum alerta; plano rascunho/ativo/aposentado; ação negada.
- **Preservar para testes:** headings “Lojas”, “Planos (versões imutáveis)”; textos “PILOT v1”, “Piloto”.
- **Critérios:** A-R06-*.

### R07 — Prévia privada (`/preview/[tenantId]`)

- **Usuário:** integrante autorizado da loja.
- **Tarefa:** conferir o rascunho antes de publicar (aberta sozinha ou dentro do editor R15).
- **Hierarquia:** faixa “Prévia privada do rascunho, não publicada” com “Voltar ao editor” (fora do editor) → loja renderizada pelo **mesmo** componente da loja pública. Início, catálogo, categorias, páginas e produtos têm versão privada; busca e carrinho não aparecem; carrinho, atendimento e pedidos digitados na barra mostram “Indisponível na prévia” com “Voltar ao início da prévia”; compra desativada no produto.
- **Estados:** negado/rascunho inexistente (mensagem + “Entrar no painel”).
- **Segurança:** `noindex`; só esta rota pode ser exibida em quadro, e só pela mesma origem.
- **Critérios:** A-R07-*, PV-01, TH02, FN02.

### R08/R09 — Catálogo, busca e categoria (`/lojas/[slug]`, `/lojas/[slug]/categorias/[categoria]`)

- **Usuário:** comprador.
- **Tarefa:** navegar pelo catálogo, buscar por nome/SKU, filtrar por categoria.
- **Hierarquia:** cabeçalho da loja → mensagem principal do tema (texto, sem banner genérico; imagem do tema só se o lojista enviou) → busca → categorias como navegação → grade de StoreProductCard (2 colunas celular, 3–4 desktop) → rodapé com fornecedor.
- **Ação principal:** abrir produto.
- **Dados/API:** `GET public/stores/:slug?q=&category=` (até 100 produtos ativos), mídia `public/stores/:slug/media/:id/small|large`.
- **Estados:** nenhum produto publicado; busca sem resultado (“Nenhum produto encontrado para ‘termo’” + limpar busca); produto sem foto; esgotado; loja sintética; loja suspensa (404 da vitrine, pedidos continuam em R13).
- **Preservar para testes:** heading (h1) com o título da loja — único; o rodapé não repete o título como outro heading —, searchbox “Buscar produtos”, botão “Buscar”, links de produto cujo nome acessível é só o nome do produto, heading “Fornecedor e atendimento”.
- **Critérios:** A-R08-*, A-R09-*.

### R15 — Aparência (`/painel/[tenantId]/aparencia`)

- **Usuário:** Dono (Funcionário vê “Somente o Dono altera a aparência”).
- **Tarefa:** escolher um modelo, ajustar identidade e layout, montar a página inicial, editar menu/rodapé/páginas, conferir na prévia e publicar; voltar atrás com segurança.
- **Hierarquia:** PageHeader “Aparência” (estado: alterações não salvas / rascunho salvo / ainda não publicada; “Ver loja publicada”; ações “Salvar rascunho” e “Publicar”) → aviso de conflito quando outra sessão salvou → controles (desktop à esquerda; celular em “Editar”): Modelo (prévia tentativa + o que muda/o que fica + opção de usar as seções sugeridas), Identidade (nome, descrição, logo, cor com explicação do ajuste de contraste, fonte dos títulos, botões), Layout e fotos, Página inicial (lista de seções com ↑/↓, editar, ocultar, duplicar, remover, adicionar), Menu, Rodapé, Páginas da loja, Histórico (trazer a publicada para o rascunho; republicar versão) → prévia (desktop à direita, fixa; celular em “Prévia”) com Celular (390 px) e Computador (1280 px reduzido para caber).
- **Dados/API:** `GET tenants/:id/storefront` (rascunho v2 normalizado, estado, histórico, categorias), `GET catalogue` (produtos e imagens), `POST storefront/draft` (com `base_revision_id`), `POST storefront/publish` (revisão exata), `POST storefront/draft/restore`, `POST storefront/rollback` (`expected_published_id`), `POST catalogue/media`.
- **Estados:** carregando; erro ao abrir; sem rascunho; alterações não salvas (sair pergunta antes); rascunho salvo; publicado; conflito 409 (nada gravado, recarregar); validação 400 com o motivo; dados da loja incompletos ao publicar (link para R16 loja); imagem de outra loja recusada.
- **Preservar para testes:** heading “Aparência”, campo “Nome da loja”, botões “Salvar rascunho” e “Publicar”, iframe “Prévia da loja com as alterações”, abas “Editar”/“Prévia”, alerta “O rascunho mudou em outra sessão”, mensagens “Rascunho salvo. A loja publicada só muda quando você publicar.” e “Aparência publicada na loja.”.
- **Critérios:** TH01–TH04, UI01, UI02, A-R02-12.

### R16 — Configurações (`/painel/[tenantId]/configuracoes/[secao]`)

- **Usuário:** Dono (Funcionário vê “Somente o Dono…” onde couber; Segurança e Dados e IA valem para qualquer integrante).
- **Tarefa:** uma tarefa por página: dados da loja e do fornecedor, entregas, domínio, segurança da conta, plano e faturas, dados e IA.
- **Hierarquia:** PageHeader com o nome da seção → aviso de verificação em duas etapas quando a ação exige → formulário/listas da seção.
- **Dados/API:** os mesmos de antes (settings, storefront/profile, storefront/shipping, operations/carrier, domains, auth/mfa, billing, operations/exports, ai).
- **Estados:** carregando; vazio (sem formas de entrega, sem domínio); verificação pendente; códigos de recuperação exibidos uma vez; domínio em cada estado; nenhum plano pago publicado; IA desligada pela plataforma.
- **Preservar para testes:** regiões “Verificação em duas etapas”, “Plano e faturas”, “Domínio próprio”, “Descrição com IA”; formulários “Confirmar código de verificação”, “Cadastrar domínio” (campo “Endereço do domínio”), “Configurar transportadora”; botões “Ativar verificação em duas etapas”, “Ativar”, “Confirmar”, “Cadastrar”, “Salvar”; textos “confirmado nesta sessão”, “Códigos de recuperação”, “Transportadora configurada.”.
- **Critérios:** A-R05-03 a A-R05-06, UX03.

### R17 — Catálogo da loja (`/lojas/[slug]/produtos`)

- **Usuário:** comprador. **Tarefa:** ver todos os produtos e trocar de categoria. **Hierarquia:** “Todos os produtos” + contagem → faixa de categorias (`aria-current`) → grade do modelo. **Estados:** loja sem produtos; produto sem foto/esgotado. **Critérios:** UX01 (primeiro produto visível em 390×844), UI03.

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
- **Celular (< 1024 px):** resumo recolhível no topo com o total (subtotal antes do frete) na própria linha; na revisão, itens, entrega e total junto de “Confirmar compra de R$ X” (D-25).
- **Critérios:** A-R12-*, CK-RESUMO, FN01.

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

1. **Lojista publica a primeira loja:** R01 entrar → criar loja → R02 cadastrar produto → preço → estoque → imagem → R16 dados da loja (fornecedor e políticas) → R15 escolher modelo, ajustar e conferir na prévia → publicar → R16 entregas → R03 conectar conta (SIMULADA) → abrir a loja (R08).
2. **Compra:** R08/R09 → R10 variação → adicionar → R12 carrinho → entrega → dados → revisão → confirmar → R13 aguardando confirmação → pago.
3. **Pedido com pendência financeira:** R05 alerta → R03 lista “somente com pendências” → detalhe → FinancialAlert → gateway externo → anotar referência → nova consulta → incidente resolvido pelo gateway → expedição liberada.
4. **Arrependimento:** R13 abrir solicitação → R04 protocolo → comunicação financeira (Dono) → resposta → conclusão.
5. **Suporte da plataforma:** R06 lista → consultar com motivo → bloco Inspecionando → suspender com motivo (diálogo) → vitrine deixa de vender; R13 continua acessível.
