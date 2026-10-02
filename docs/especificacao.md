# Especificação pré-implantação — SaaS de E-commerce

**Versão:** 1.1 — referência consolidada para implementação por fases  
**Data:** 30 de setembro de 2026  
**Contexto:** desenvolvimento inicialmente individual, orçamento limitado e operação brasileira.  
**Base:** conversas e especificação anteriores, versão 1.0 produzida neste projeto e duas revisões posteriores. Esta versão substitui a 1.0 para novas implementações.

Este documento organiza o produto, as regras de negócio, os contratos técnicos e os critérios para entrada em produção. As regras abaixo orientam a implementação autorizada por fases. Valores identificados como propostas e decisões comerciais continuam sujeitos à validação indicada; o documento não comprova integrações testadas nem serviços contratados. Nenhuma prova de conceito ou teste de carga foi executado para produzir este documento.

O objetivo é permitir implementação por etapas com resultados verificáveis. “Deve” identifica requisito da etapa indicada. “Padrão proposto” identifica um valor inicial ajustável. “Validação externa” identifica algo que depende de conta, fornecedor, piloto ou decisão comercial e cuja evidência deve ser registrada antes de liberar a funcionalidade correspondente.

**Leitura rápida:** manter a stack escolhida; começar com duas ou três lojas convidadas; validar pagamentos antes de depender de comissão; usar uma única fonte de estoque; registrar todos os recebimentos reais; liberar produção somente após testar isolamento, falhas e restauração. Um plano pago simples é a proposta inicial de comercialização; preços e plano gratuito permanente continuam sujeitos a validação.

| Para revisar | Seções |
|---|---|
| Produto, escopo e experiência | 1–2, 5–10 |
| Compra, estoque e dinheiro | 11–16 |
| Arquitetura, segurança e modelo de dados | 3–4, 17–19 |
| Operação, recuperação e responsabilidades | 20–24 |
| Testes, fases e decisões pendentes | 25–28 |
| Mudanças em relação às conversas | 29 |

## 1. Objetivo, público e limites

Criar uma plataforma SaaS de e-commerce para pequenos lojistas brasileiros, com administração simples, compra confiável e evolução modular. A plataforma poderá crescer para centenas ou milhares de lojas; esse crescimento é uma meta, não uma capacidade demonstrada da infraestrutura inicial.

**Recorte proposto para a primeira entrega:** produtos físicos, venda B2C, português brasileiro, moeda BRL, quantidades inteiras, operação nacional, um local de estoque e um vendedor por checkout. Cada pedido pertence a uma única loja. O segmento comercial específico será escolhido com os lojistas piloto.

O sucesso inicial será medido por lojas que publicam catálogo e concluem vendas reais, pedidos que dispensam correção direta no banco, tempo de suporte por loja e custo operacional por loja ativa. A stack e a presença de IA não serão usadas como evidência de diferencial comercial.

Prioridades, em ordem:

1. Impedir vazamento de dados entre lojas e acesso indevido dentro da mesma loja.
2. Preservar integridade de pedidos, pagamentos e estoque.
3. Permitir operação e recuperação com procedimentos simples.
4. Entregar um fluxo completo de compra e administração.
5. Validar disposição a pagar e custo de atendimento.
6. Acrescentar automações e integrações conforme uso real.

## 2. Escopo por entrega

| Capacidade | Piloto privado — 2 a 3 lojas convidadas | Lançamento comercial inicial | Evolução posterior |
|---|---|---|---|
| Abertura de loja | Cadastro e ativação assistida | Cadastro com verificação e critérios de ativação | Automação ampliada |
| Catálogo | Produtos, variações, categorias, imagens, busca | Mesmo núcleo, com limites por plano | Importação ampla e integrações |
| Vitrine | Um tema, seções configuráveis, páginas e menus | Mesmo tema; domínio próprio | Novos temas e SDK |
| Comprador | Compra como visitante; acesso seguro ao pedido | Mesmo fluxo | Conta do comprador e histórico consolidado |
| Estoque | Um local; controle de saldo e reservas | Mesmo núcleo | Encomendas e múltiplos locais |
| Pagamento da compra | Mercado Pago do lojista, Pix e cartão | Comissão somente se homologada | Outros gateways e boleto |
| Frete | Retirada e tabela própria | Uma integração externa homologada, candidata: Melhor Envio | Mais provedores e automações |
| Entrega | Um envio por pedido; rastreio informado pelo lojista | Cotação integrada; contratação de etiqueta apenas se incluída na homologação | Envios e devoluções parciais |
| Reembolso | Execução manual pelo dono no Mercado Pago; plataforma detecta e concilia o resultado | Reembolso total iniciado pela plataforma, com idempotência e conciliação de comissão | Interface para reembolso parcial por item |
| Equipe | Dono e Funcionário com permissões fixas | Mesmo núcleo | Papéis personalizáveis |
| SaaS | Acesso por convite, sem mensalidade/comissão; cota de mídia com tolerância controlada | Plano pago, cobrança homologada e cotas rigorosas | Plano gratuito permanente, adicionais e outros planos |
| Fiscal do lojista | Emissão externa; referências da nota no pedido | Integração somente se necessária ao público inicial | Conectores fiscais adicionais |
| IA | Fora do caminho de compra | Opcional após validação do núcleo | Descrições, SEO e automações com orçamento |
| Segurança e operação | Isolamento, auditoria, backup restaurável, alertas | Mesmos requisitos, com capacidade medida | Escala conforme métricas |

**Ajustes deliberados em relação ao texto anterior:** o piloto não depende de três planos prontos; a integração de frete entra antes do lançamento comercial, mas não bloqueia pilotos com retirada/tabela; boleto, encomenda, checkout com múltiplos vendedores, envio parcial e conta do comprador ficam fora da primeira entrega. Esses cortes reduzem caminhos de falha sem retirar a compra completa.

Ficam fora das duas primeiras entregas: PDV, B2B, dropshipping avançado, assinaturas de produtos, afiliados, marketplace de temas, execução de código do lojista, emissão própria de NF-e, IA local, recomendação personalizada, Kubernetes, microserviços e mecanismo de busca externo.

## 3. Arquitetura e responsabilidades

### 3.1 Stack proposta

| Camada | Decisão | Regra de uso |
|---|---|---|
| Interface | Next.js + TypeScript | Vitrine e painel com rotas e contextos separados |
| Aplicação | NestJS com adaptador Fastify, sobre Node.js | Monólito modular; regras de negócio no backend |
| Persistência | PostgreSQL + Drizzle | Banco como fonte oficial dos fatos de negócio |
| Isolamento | tenant_id + RLS + autorização na aplicação | Proteção entre lojas e por recurso |
| Fila | BullMQ sobre Redis dedicado às filas | Persistência, limites de memória e reprocessamento |
| Cache | Redis separado, quando necessário | Descartável; falha não deve corromper compra |
| Tarefas | Worker do mesmo repositório e módulos de domínio | Processo separado da API |
| Imagens | Sharp + armazenamento de objetos compatível com S3 | WebP e miniaturas; AVIF adiado |
| Entrada HTTP | Caddy | Proxy, limites e TLS conforme rota de domínio |
| DNS/CDN | Cloudflare | Domínios da plataforma; domínios de clientes conforme seção 17 |
| Entrega de e-mail | Provedor transacional externo | SPF/DKIM e política DMARC configurados |
| Implantação | Docker Compose | Imagens construídas fora da VM; volumes persistentes |

As versões exatas e compatibilidades serão fixadas na Fase 1, em dependências e registro de decisões. Usar versões estáveis suportadas e compatíveis com backup/hospedagem; não atualizar automaticamente versões principais. PostgreSQL 18 não é obrigatório. UUIDv7 pode ser gerado por biblioteca mantida na aplicação, sem tornar uma função nativa do banco requisito de negócio; testar formato, unicidade e persistência. Quando disponível na versão escolhida, a geração nativa também é válida. [Funções UUID do PostgreSQL 18](https://www.postgresql.org/docs/18/functions-uuid.html).

### 3.2 Topologia

O Caddy encaminha requisições para Next.js ou API. Next.js consulta a API e não acessa diretamente o banco. API e workers acessam PostgreSQL e Redis de filas. Workers processam imagens, notificações e integrações. Imagens públicas são entregues pelo armazenamento/CDN; exports e outros arquivos privados exigem autorização.

API e worker compartilham código de domínio, mas têm inicialização, concorrência e recursos independentes. BullMQ é uma biblioteca que usa Redis; não existe uma sequência obrigatória PostgreSQL → Redis → worker.

Vitrine e painel podem compartilhar um processo Next.js inicialmente. O painel só é servido em hostname controlado pela plataforma. Dados privados e regras de negócio não podem depender da ocultação de elementos da interface.

### 3.3 Módulos e propriedade da escrita

| Área | Módulo | Responsabilidade exclusiva |
|---|---|---|
| Plataforma | Lojas e domínios | Ciclo da loja, ativação, suspensão e resolução de hostname |
| Plataforma | Acesso | Usuários administrativos, vínculos, sessões e permissões |
| Plataforma | Cobrança SaaS | Planos, versões, assinaturas, faturas e cotas |
| Loja | Catálogo | Produtos, variações, categorias e conteúdo de produto |
| Loja | Mídia | Uploads, derivados, referências e consumo de espaço |
| Loja | Vitrine | Tema, páginas, menus, rascunho e publicação |
| Loja | Preços | Cálculo canônico dos valores da compra |
| Loja | Estoque | Saldos, reservas, baixas e reposições |
| Loja | Clientes e carrinhos | Dados do comprador e seleção anterior à compra |
| Loja | Checkout e pedidos | Orquestração da compra, snapshots e transições do pedido |
| Loja | Pagamentos | Contas, tentativas, recebimentos, reembolsos e disputas |
| Loja | Frete e expedição | Cotação, método escolhido, envio e rastreio |
| Transversal | Confiabilidade | Inbox de webhooks, outbox, retries e reconciliação |
| Transversal | Operação | Auditoria, notificações, métricas e administração |

Um módulo altera seus dados por serviços próprios. Leituras com JOIN são permitidas, preservando isolamento e autorização. Uma transação pode chamar serviços de vários módulos compartilhando a mesma conexão transacional; separar módulos não significa perder atomicidade entre pedido e reserva.

## 4. Isolamento entre lojas

**TEN-01 — Resolução:** em rotas públicas, normalizar o hostname e procurar um domínio ativo cadastrado. Host desconhecido não usa uma loja padrão. No painel, a loja selecionada precisa corresponder a um vínculo ativo do usuário. tenant_id enviado pelo navegador nunca é autoridade suficiente.

**TEN-02 — Transação:** toda operação sobre dados de loja recebe um contexto confiável e executa dentro de transação com tenant definido localmente, por exemplo por set_config com is_local=true. Todas as consultas daquela operação usam a mesma conexão; não usar SET persistente de sessão. O contexto é descartado ao concluir ou desfazer a transação. [Escopo de set_config](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-SET).

**TEN-03 — Papéis:** migrations usam credencial própria. API e workers não são superusuários, não têm BYPASSRLS, não são donos de tabelas e não herdam papel privilegiado. Aplicar ENABLE e FORCE ROW LEVEL SECURITY às tabelas de loja, com regras de leitura e escrita. A ausência de contexto deve negar acesso. PostgreSQL permite bypass por superusuários e BYPASSRLS; FORCE não neutraliza esses privilégios. [Políticas de RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

**TEN-04 — Relacionamentos:** referências entre entidades de loja validam o par tenant_id + id, com chave única correspondente na tabela referenciada. Exemplo: order_items(tenant_id, variant_id) só referencia product_variants(tenant_id, id) da mesma loja. Essa é uma regra do modelo, necessária porque verificações de chave estrangeira não são filtradas por RLS. [Integridade referencial e RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

**TEN-05 — Workers:** o job carrega tenant_id, mas o worker confirma no banco o vínculo do recurso antes de agir. A identidade de execução e as permissões continuam sendo verificadas. Um agendador global lista lojas/IDs por acesso limitado e despacha trabalhos por loja; não conceder acesso irrestrito ao worker comum.

**TEN-06 — Dados globais:** usuários administrativos e catálogo de planos são globais. Assinaturas, faturas, domínios e cotas têm dono identificado por tenant_id mesmo sendo administrados pela plataforma. A consulta inicial hostname → tenant usa acesso restrito que retorna apenas dados de roteamento, nunca pedidos ou credenciais.

**TEN-07 — Cache e arquivos:** todas as chaves de catálogo, busca, tema e invalidação incluem tenant e versão relevante. Hostnames são incluídos quando mudam a representação. Carrinho, checkout, pedidos privados, painel e respostas com cookies de sessão não entram em cache público. Prefixos de arquivo por loja organizam o armazenamento; a autorização continua obrigatória.

**TEN-08 — Limite do mecanismo:** RLS é uma camada adicional. A segurança também depende da origem confiável do tenant, consultas parametrizadas, permissões por ação e testes. Compradores da mesma loja não podem acessar pedidos uns dos outros.

## 5. Identidades, permissões e acesso

Separar usuário da equipe do lojista de comprador. No piloto, comprador não precisa de conta. Um mesmo e-mail em lojas distintas não cria identidade global compartilhada nem permite consultar compras em outra loja.

| Ação | Dono | Funcionário | Comprador visitante |
|---|---|---|---|
| Gerenciar catálogo, imagens e estoque | Sim | Sim | Não |
| Ver pedidos e registrar envio | Sim | Sim | Apenas seu pedido autorizado |
| Gerenciar pendência de devolução/cancelar pedido pago | Sim; reembolso externo no piloto | Não | Pode registrar solicitação de atendimento/arrependimento |
| Gerenciar equipe, gateway, plano e domínio | Sim | Não | Não |
| Exportar dados e encerrar loja | Sim | Não | Solicitação de seus próprios dados |

Funcionário é um conjunto fixo inicial de permissões, não um editor de papéis. Administrador da plataforma usa acesso separado, MFA e auditoria; acesso a uma loja para suporte exige motivo e registro. Transferência de propriedade não entra em fluxo automático no piloto.

Requisitos de acesso:

- E-mail verificado antes de ativar a loja; convite de funcionário com expiração e uso único.
- Hash de senha adequado, sessões revogáveis e recuperação com token curto, de uso único e armazenado em forma não recuperável.
- Cookies Secure, HttpOnly e restritos ao host; proteção CSRF nas ações autenticadas por cookie. Não compartilhar cookie administrativo com subdomínios das lojas.
- MFA obrigatório para administradores da plataforma e donos antes de operar pagamentos reais; códigos de recuperação protegidos.
- Segredos do gateway cifrados com chave fora do banco e dos logs; procedimento para renovação e revogação.
- Acesso do visitante ao pedido por segredo aleatório de alta entropia, armazenado como hash, com validade e possibilidade de revogação. Número comercial ou UUID não substitui autorização.
- Não incluir dados pessoais em URLs. Links de acesso devem evitar vazamento por referer e logs e não carregar scripts analíticos de terceiros.

## 6. Catálogo, variações e busca

Todo produto tem ao menos uma variação. Um produto simples usa uma variação padrão, oculta como opção na interface. Carrinho, pedido, estoque e frete referenciam sempre a variação.

**Produto:** nome, descrição sanitizada, slug, marca opcional, categorias, status DRAFT/ACTIVE/ARCHIVED e campos de SEO. **Variação:** SKU, combinação de atributos, preço, imagem opcional, peso em gramas, dimensões em milímetros e estado ativo. O saldo pertence ao módulo de estoque; não duplicar stock_quantity na tabela de variações.

Regras:

- SKU único por loja; slug de produto único por loja, com histórico de redirecionamento quando alterado.
- Combinação de atributos única dentro do produto. A variação padrão não convive como opção de compra com variações explícitas após conversão.
- Produto ativo deve ter ao menos uma variação vendável, preço válido e informação suficiente para o método de frete escolhido.
- Arquivar bloqueia novas compras, preservando referências históricas. Produto/variação com pedido não é excluído em cascata.
- Piloto: estoque controlado, sem venda sob encomenda. manage_stock=true e allow_backorder=false. Outras políticas dependem de regras específicas e ficam desabilitadas.
- A futura importação de WooCommerce é uma integração planejada, não uma obrigação do piloto.

Busca usa PostgreSQL com tratamento explícito de acentos, configuração de português e índice apropriado; pg_trgm pode apoiar correspondência aproximada e SKU. Testar “calçado”/“calcado”, caixa e busca por SKU. Não assumir que apenas instalar extensões muda a consulta. Toda busca pública filtra loja e produtos publicados.

## 7. Mídia e cotas de armazenamento

Fluxo: autorizar upload e verificar limites → enviar para área temporária privada → validar → gerar derivados → registrar tamanhos reais → liberar para uso → remover temporários. No comercial, reservar a cota antes de autorizar o envio.

Padrões propostos para piloto: JPEG, PNG e WebP; até 10 MB e 40 megapixels por original; até 10 imagens por produto e dois uploads simultâneos por loja. Validar conteúdo decodificado, dimensões e consumo de recursos, não apenas extensão/MIME. Rejeitar SVG, HTML e animações inicialmente. Limitar também bytes totais dos derivados por arquivo, tempo de processamento e concorrência global; registrar os valores efetivos na configuração da implantação.

Processar com Sharp, removendo metadados desnecessários e gerando tamanhos predefinidos em WebP. Concorrência inicial de uma imagem por worker. Upload assinado não concede publicação automática. Retry não duplica arquivo nem contabilização de espaço. Temporários expiram em 24 horas como padrão proposto.

**Piloto:** a cota de 1 GB é um limite operacional com pequena tolerância, não uma promessa de bloqueio exato. Conferir consumo antes de admitir upload, aplicar os limites de tamanho/simultaneidade no servidor e reconciliar bytes persistidos periodicamente, com intervalo proposto de uma hora. Ao atingir/exceder a cota, bloquear novas admissões e alertar; uploads já admitidos podem terminar. A tolerância é limitada pelo volume máximo das operações em andamento. Manter orçamento global, alertas e mecanismo para interromper uploads/processamento antes de comprometer a infraestrutura. Não aceitar tamanho, duração ou paralelismo ilimitados.

**Comercial:** cota efetiva = bytes persistidos + bytes reservados. Reservar capacidade atomicamente, incluir originais retidos e derivados, expirar reservas abandonadas e reconciliar os contadores. Esta automação é entregue na Fase 6; a tabela quota_reservations não é necessária ao piloto.

Arquivos publicados usam caminhos imutáveis/versionados. Remover uma referência não apaga arquivo ainda usado no tema ou catálogo. Backups e exports permanecem privados. Exceder cota bloqueia crescimento; não apaga imagens existentes nem impede tratamento de pedidos.

## 8. Vitrine, tema e experiência básica

Um tema oficial em React/Next.js com cores, fontes previamente permitidas, logo, banners, menus, páginas institucionais e seções reordenáveis. Conteúdo do lojista não pode executar JavaScript nem inserir HTML sem sanitização.

Cada revisão registra theme_key, schema_version, config, created_by e created_at. A loja aponta separadamente para revisão de rascunho e revisão publicada. Publicar valida o esquema e as referências de mídia, troca o ponteiro atomicamente e emite evento de invalidação. Falha de publicação preserva a revisão anterior.

Preview exige autorização, não é indexado e não compartilha cache com a loja publicada. Migrações de esquema de tema têm teste de compatibilidade e preservam uma revisão recuperável. Isso não significa criar um marketplace ou SDK na primeira versão.

Páginas mínimas: início, categoria, produto, busca, carrinho, checkout, confirmação/acompanhamento e páginas institucionais. Interface responsiva com teclado, rótulos, foco visível, erros próximos dos campos e mensagens que permitam tentar novamente sem recriar pedido.

Estados da compra devem distinguir: processando, aguardando pagamento, pago e ação necessária. Nunca mostrar confirmação financeira apenas porque o navegador voltou do gateway.

### 8.1 SEO mínimo da vitrine

Cada loja publicada deve servir sitemap.xml com URLs canônicas de páginas/produtos ativos e robots.txt coerente com o ambiente. Gerar title, descrição, canonical e dados estruturados Product/Offer usando valores reais de produto, moeda, preço e disponibilidade. Não inventar avaliações, estoque ou promoções. Validar saída e isolamento entre domínios. [Dados estruturados de produto — Google](https://developers.google.com/search/docs/appearance/structured-data/product).

Preview e homologação não são indexáveis. Páginas privadas precisam de autorização, independentemente de robots.txt; esse arquivo não protege dados. Usar noindex onde cabível sem bloquear o rastreamento necessário para o robô ler essa instrução. Não incluir carrinho, checkout, pedidos ou painel no sitemap. Ao mudar o domínio canônico, atualizar sitemap, canonical, dados estruturados e redirecionamentos. Assegurar URLs navegáveis e descrições únicas; recursos extras de marketing ficam para evolução.

## 9. Dinheiro, preço e carrinho

**MON-01:** moeda BRL. Valores persistidos em centavos inteiros, usando BIGINT; operações de domínio usam aritmética inteira. Na API, campos com sufixo _cents são strings decimais, como "19990", para preservar precisão. O frontend formata esses valores, sem decidir o total cobrado.

**MON-02:** percentuais usam pontos-base inteiros: 200 representa 2%. Aplicar arredondamento comercial de meio para cima em valores não negativos na etapa explicitamente definida. Quando houver rateio futuro de desconto, distribuir os centavos restantes por regra determinística para que a soma coincida com o desconto total.

**MON-03:** no piloto, total = soma(preço unitário × quantidade) + frete. Preços já incluem os tributos incorporados ao preço pelo lojista; não existe motor tributário próprio. Cupons, promoções automáticas e alteração de preço por meio de pagamento ficam fora do piloto.

**MON-04:** futuras promoções entram pelo mesmo motor, com regras de acúmulo, vigência e arredondamento definidas antes da ativação. Carrinho e checkout consultam o mesmo serviço de preços.

O carrinho pertence a uma loja e a uma sessão opaca, podendo posteriormente ser associado a cliente. Não reserva estoque. Alterações de preço, disponibilidade ou frete entre carrinho e confirmação exigem recálculo no servidor e apresentação do novo total antes de iniciar cobrança.

O pedido congela nomes, SKU, atributos, quantidade, preços, frete, moeda, endereços e termos relevantes da compra. Uma alteração futura no cadastro não modifica o pedido. Correção operacional de endereço após compra deve ser uma ação auditada, mantendo a versão originalmente informada.

## 10. Frete e expedição

No piloto, cada loja configura retirada local e/ou regras de frete por faixa de CEP, com valor e prazo. Regras sobrepostas têm prioridade explícita. CEP sem atendimento impede compra por entrega; nunca converter erro de cálculo em frete grátis.

Cotação registra loja, itens e quantidades, endereço normalizado, método, valor, prazo estimado, origem, versão da regra e vencimento. Padrão proposto: validade de 15 minutos, respeitando prazo menor informado por provedor. Mudança de itens, peso, dimensões ou endereço invalida a cotação.

O backend calcula a embalagem usada na cotação por política definida; não somar dimensões arbitrariamente. A integração externa deverá homologar composição do pacote, limites de peso/dimensões, regiões, autenticação e falhas. Sem método elegível, apresentar indisponibilidade de entrega.

Um ShippingProvider oferece cotar e consultar rastreio quando suportado. Comprar etiqueta é uma capacidade adicional explícita; a existência de cotação não implica contratação de frete. No piloto, envio e código de rastreio são registrados pelo lojista.

Há um envio completo por pedido na primeira versão. Nenhum envio pode ser criado para pedido cancelado, sem pagamento principal confirmado ou com impedimento operacional. Reembolso e devolução não alteram automaticamente a quantidade física em estoque.

Na retirada, não exigir transportadora ou código de rastreio. A equipe marca o pedido como pronto durante PROCESSING, notifica o comprador e confirma a retirada por ação auditada com comprovação de entrega. Essa confirmação pode levar diretamente a DELIVERED, sem simular transporte.

## 11. Checkout, idempotência e fronteiras de transação

**CHK-01 — Uma intenção de compra:** a confirmação usa chave de idempotência vinculada à loja, sessão/comprador, operação e conteúdo normalizado. Repetir a mesma chave e conteúdo retorna a mesma operação; conteúdo diferente retorna conflito. Uma versão confirmada do carrinho só cria um pedido, mesmo com outra chave.

**CHK-02 — Validação prévia:** validar publicação da loja, sessão, produtos, preços, endereço, cotação de frete, permissões de venda, conta de pagamento ativa e limites de abuso. Consultas externas necessárias à cotação ocorrem antes da transação de reserva.

**CHK-03 — Transação local curta:** confirmar versões de preço e cotação, bloquear saldos em ordem determinística, reservar todos os itens, obter número comercial, criar pedido e snapshots, vincular intenção de compra, preparar tentativa de pagamento e registrar eventos outbox. Tudo confirma ou tudo é desfeito. Não reservar parcialmente o carrinho.

**CHK-04 — Chamada externa:** somente após commit, chamar o gateway com a identificação estável daquela tentativa. Não manter transação ou lock de estoque aberto durante chamada de rede. A API pode tentar imediatamente; um processo de recuperação também procura tentativas preparadas e não concluídas.

**CHK-05 — Resultado desconhecido:** timeout não significa pagamento recusado. Persistir UNKNOWN e consultar o gateway com a referência conhecida antes de repetir. Quando houver retry de criação, reutilizar a mesma chave suportada pelo gateway. Não criar uma cobrança nova para “resolver” a falta de resposta.

**CHK-06 — Continuação:** o navegador recebe pedido e estado da operação. Pode consultar novamente após perda de conexão sem recriar compra. O cliente nunca envia um total que seja aceito como definitivo, nem marca o pedido como pago.

Retenção proposta do registro HTTP de idempotência: 7 dias. Referências de operações financeiras e a ligação entre versão do carrinho e pedido permanecem conforme a retenção do pedido; a expiração do registro HTTP não pode remover a defesa contra duplicação de negócio.

## 12. Estoque, reserva e concorrência

### 12.1 Fonte única e invariantes

inventory_items mantém on_hand (saldo físico contabilizado) e reserved (reservas ativas). available = on_hand − reserved. A variação referencia esse saldo; não possui outro contador independente.

Na política inicial sem encomenda:

- on_hand ≥ 0; reserved ≥ 0; reserved ≤ on_hand.
- Reservar exige available ≥ quantidade e aumenta reserved.
- Confirmar venda reduz on_hand e reserved pela quantidade reservada.
- Liberar reduz reserved; uma reserva só termina uma vez.
- Ajustes manuais de saldo geram movimentação com autor e motivo e não podem reduzir on_hand abaixo de reserved.
- Reposição por devolução só acontece após recebimento/conferência física e ação explícita.

Cada alteração de saldo, transição de reserva e movimentação correspondente ocorre na mesma transação. Usar lock de linha ou UPDATE condicional validado por linhas afetadas. Para múltiplos itens, ordenar locks por ID. Conflitos e deadlocks admitem retry limitado da operação inteira, com idempotência.

Reservas: ACTIVE → CONSUMED ou RELEASED. Registrar motivo da liberação: expiração, cancelamento ou falha de pagamento. Não permitir atualizar saldo sem movimentação correspondente. Uma reconciliação detecta divergência entre reserved e reservas ativas; ela alerta antes de corrigir automaticamente fatos financeiros.

### 12.2 Prazo proposto e gateway

Parâmetros iniciais, sujeitos à prova de conceito: reserva de 40 minutos e Pix com 30 minutos a partir de sua emissão. Deve existir margem mínima de 5 minutos entre vencimento do Pix e vencimento da reserva. Se a emissão atrasar e não houver margem, renovar a reserva ainda ativa atomicamente dentro do limite de retenção, ou interromper aquela tentativa. Não emitir cobrança que vença depois da reserva.

A documentação consultada da integração Pix via API Payments informa validade configurável entre 30 minutos e 30 dias. O campo e os limites devem ser confirmados na família de API adotada; não copiar parâmetros de outra integração. [Validade do Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix?scope=prod).

**Alinhar vencimentos reduz risco, mas não elimina atraso de notificação, resposta desconhecida ou confirmação concorrente com a liberação.** Esses casos têm tratamento obrigatório.

### 12.3 Expiração e pagamento atrasado

| Situação | Ação obrigatória |
|---|---|
| Reserva ativa e pagamento confirmado | Consumir reserva e reconhecer pagamento uma única vez |
| Vencimento local, gateway confirma tentativa encerrada sem pagamento | Liberar reserva; cancelar pedido sem outra tentativa ativa |
| Vencimento local, gateway indisponível ou estado inconclusivo | Marcar verificação pendente e reconciliar; não declarar “não pago” como fato |
| Incerteza persiste até 60 minutos desde a reserva inicial | Liberar estoque com motivo PAYMENT_UNCERTAIN; manter pedido impedido para envio e novas tentativas até conciliar |
| Pagamento confirmado depois da liberação, pedido ainda OPEN e sem cancelamento solicitado | Registrar pagamento real e tentar nova alocação integral atomicamente; se possível, baixar; senão manter PAID e abrir incidente PAID_WITHOUT_STOCK, sem liberar envio |
| Pagamento confirmado para pedido já CANCELLED | Registrar recebimento e abrir pendência de devolução; no piloto, dono resolve no gateway e a plataforma concilia; não reabrir nem enviar automaticamente |
| Expiração e confirmação processadas ao mesmo tempo | Ambas bloqueiam o mesmo pedido/reserva e reavaliam o estado; apenas uma transição vence |

O limite de 60 minutos é política operacional proposta, não prazo do gateway. Liberar estoque sob incerteza aceita a possibilidade de posterior necessidade de reembolso; esse caso nunca pode desaparecer dos alertas.

PAID_WITHOUT_STOCK bloqueia expedição. O dono resolve: devolver pelo painel do gateway no piloto ou recompor estoque e executar nova alocação validada na plataforma. Registrar responsável, motivo, referência externa e resultado confirmado. A interface mostra pendências até a conciliação, sem exigir edição direta no banco. Definir cobertura real de suporte e alertas antes da entrada de lojistas; atendimento de direitos do consumidor segue também a seção 22.5.

## 13. Estados do pedido, pagamento e entrega

### 13.1 Dimensões separadas

| Dimensão | Estados propostos | Significado |
|---|---|---|
| order_status | OPEN, COMPLETED, CANCELLED | Ciclo operacional do pedido |
| payment_status | UNPAID, PENDING, PAID, PARTIALLY_REFUNDED, REFUNDED, CHARGED_BACK | Resumo da transação principal vinculada à compra |
| fulfillment_status | UNFULFILLED, PROCESSING, SHIPPED, DELIVERED, RETURNED | Situação física da entrega |
| dispute_status | NONE, OPEN, WON, LOST | Disputa independente de pagamento e reembolso |
| Incidentes | Registros abertos/resolvidos com código | EXCESS_PAYMENT, PAID_WITHOUT_STOCK e REFUND_ACTION_REQUIRED; REFUND_FAILED quando houver iniciação pela plataforma |

**Refinamento da revisão anterior:** IN_DISPUTE passa a ser um estado de disputa separado. Assim, pagamento parcialmente reembolsado e em disputa podem coexistir sem apagar informação. Também não se transforma NEEDS_REVIEW em um quarto significado de status do pedido; a necessidade de intervenção é registrada como incidente.

Tentativas têm estados próprios: PREPARED, PENDING, APPROVED, REJECTED, CANCELLED, EXPIRED e UNKNOWN. Uma tentativa rejeitada não torna o pedido cancelado se ainda é possível tentar novamente dentro das regras. Estados originais do gateway também são preservados para diagnóstico.

### 13.2 Transições permitidas no núcleo

| Ação/evento | Pré-condição | Resultado |
|---|---|---|
| Criar pedido | Validações e reserva completas | OPEN, UNPAID/PENDING, UNFULFILLED |
| Confirmar pagamento principal | Recebimento validado e valor/moeda corretos | PAID; se o estoque não puder ser alocado, abrir incidente impeditivo sem ocultar o pagamento |
| Iniciar separação | PAID, OPEN, sem incidente impeditivo | PROCESSING |
| Registrar envio | Pré-condições financeiras mantidas | SHIPPED; guarda transportador, rastreio e data |
| Confirmar entrega | Envio existente ou retirada comprovada | DELIVERED e COMPLETED |
| Cancelar sem pagamento | Nenhuma cobrança com resultado desconhecido ou liquidada; encerramento das tentativas confirmado | CANCELLED e liberação de reservas |
| Cancelar pedido pago antes do envio | Ação do dono; impede envio imediatamente | CANCELLED; reembolso fica pendente até confirmação externa |
| Solicitar cancelamento após envio | SHIPPED/DELIVERED | Abrir atendimento/devolução; não fingir que o envio não aconteceu |
| Confirmar reembolso total | Gateway confirma valor devido | REFUNDED; não altera automaticamente estado físico |
| Confirmar reembolso parcial externo | Gateway informa valor parcial | PARTIALLY_REFUNDED; registra valor e impede incoerência financeira |
| Abrir disputa | Evento validado do gateway | dispute_status=OPEN; bloqueia novo envio por padrão |
| Perder disputa | Confirmação do provedor | dispute_status=LOST; CHARGED_BACK quando a perda financeira for confirmada |
| Receber devolução | Conferência do lojista | RETURNED; reposição exige decisão explícita separada |

Mudanças guardam estado anterior e novo, evento/ação, autor, motivo e data. Eventos antigos não fazem um pagamento voltar a pendente. “Pedido concluído” não impede registrar reembolso ou disputa posterior. Devoluções e reembolsos parciais por item terão fluxo ampliado posteriormente; fatos externos parciais devem ser registrados desde o início.

No piloto, reembolso parcial externo antes do envio exige revisão operacional: conferir o que ainda deve ser entregue e não liberar expedição automaticamente. Reembolso ocorrido após envio não apaga esse fato físico. A confirmação financeira nunca depende de conseguir baixar estoque; somente a autorização de entrega depende de ambos.

## 14. Pagamentos e comissão

### 14.1 Modelo e prova de conceito

Cada lojista conecta sua conta Mercado Pago por OAuth. A plataforma não agrega o principal das vendas para repassar manualmente. Pagamento da compra e cobrança da assinatura SaaS são integrações e registros separados.

**Alvo proposto:** Checkout Transparente no fluxo compatível com Split 1:1, usando captura/tokenização de cartão oferecida pelo gateway. A prova de conceito fixa família de API, endpoints, SDK, credenciais e métodos habilitados. Não misturar exemplos de API Payments, Orders e Checkout Pro. Se esse alvo não atender aos requisitos, registrar decisão e avaliar Checkout Pro antes de adaptar o núcleo.

A documentação de Split 1:1 descreve OAuth por vendedor, marketplace_fee para Checkout Pro e application_fee para Checkout Transparente. São valores monetários enviados à integração; o percentual comercial deve ser calculado pela plataforma. Há requisitos de conta e limitações de reembolso por saldo do vendedor. [Integração Split](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace) e [pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites).

| Teste da Fase 0 | Evidência exigida |
|---|---|
| OAuth de dois vendedores distintos | Cada venda cai no vendedor correto; conexão, renovação e revogação registradas |
| Pix e cartão | Criação, pendência, aprovação, rejeição e correlação com pedido |
| Comissão | Valor solicitado versus efetivamente lançado para vendedor e plataforma, por método |
| Expiração | Prazo aceito, vencimento observado, consulta e cancelamento disponíveis |
| Webhook | Validação, repetição, atraso e recuperação após indisponibilidade |
| Timeout de criação | Consulta ou retry com a mesma operação sem cobrança adicional |
| Reembolso | Executar pelo painel de teste do gateway e observar total/parcial e saldo; registrar capacidades/restrições da API para futura automação e reversão de comissão |
| Desconexão da conta | Novas vendas bloqueadas e tratamento de pagamentos anteriores documentado |

Teste simulado valida o código, não condições comerciais. Separar evidências de sandbox, simulações e transações reais controladas que vierem a ser autorizadas. Métodos não homologados permanecem indisponíveis. Comissão não comprovada pode permanecer explicitamente desabilitada sem bloquear a viabilidade do piloto sem comissão. Boleto não integra esta entrega.

### 14.2 Recebimento e idempotência

Cada tentativa usa uma chave estável, pedido, loja, conta recebedora e valor esperado. Resposta do gateway e webhook são caminhos para o mesmo serviço de conciliação, nunca dois lugares independentes para baixar estoque.

No webhook: validar a autenticidade conforme o tópico/API, persistir o evento recebido antes de confirmar seu recebimento, e processar em segundo plano. Se a persistência falhar, responder falha para permitir retry. O provedor documenta assinatura em x-signature para eventos aplicáveis; tópicos devem ser validados individualmente. [Webhooks do Mercado Pago](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/additional-content/your-integrations/notifications/webhooks).

Consultar o recurso financeiro autoritativo com credencial da conta correta. Conferir ambiente, vendedor, moeda, valor e referência do pedido. Não confiar no tenant_id do payload, no redirecionamento do navegador ou apenas em um rótulo “approved”. Valor divergente abre incidente e não libera envio.

Deduplicar entregas pelo identificador de evento fornecido e escopo do provedor. Não usar somente payment_id como chave de evento: o mesmo pagamento pode gerar atualizações legítimas. O recebimento financeiro possui sua própria unicidade por provedor, conta, ambiente e ID externo.

### 14.3 Duas tentativas pagas

Todas as transações efetivamente recebidas são registradas. Uma transação principal pode satisfazer o pedido; a escolha é serializada por lock do pedido e valor esperado. Outra aprovação não é ignorada nem causa segunda baixa.

Quando houver pagamento excedente: classificar a transação, abrir EXCESS_PAYMENT, bloquear envio até resolução e alertar o dono. No piloto, a devolução é executada no painel do Mercado Pago e confirmada por webhook/consulta. A obrigação e os valores permanecem visíveis; uma anotação manual não basta para marcar REFUNDED. Na Fase 6, acrescentar iniciação idempotente pela plataforma. A devolução do excedente não altera o estado pago da transação principal.

Antes de iniciar tentativa em outro método, consultar/encerrar a anterior quando possível. Estado UNKNOWN impede criar uma segunda cobrança até conciliação ou resolução explícita. Mesmo assim, a defesa contra recebimento duplo continua obrigatória.

### 14.4 Reembolso, disputa e conciliação

**Piloto:** não criar botão/API que inicie estorno no gateway. A plataforma mantém pendência com pedido, transação, valor, motivo, responsável e referência externa; o dono executa no painel do Mercado Pago. A leitura do gateway atualiza refunds, pagamento e incidente. Detectar devolução total/parcial, repetição, atraso e ausência de confirmação. Se a devolução não acontecer ou falhar externamente, manter REFUND_ACTION_REQUIRED e alertar. Um comprovante fornecido pelo operador ajuda a investigar; não substitui conciliação financeira.

Reembolso não recompõe estoque sem confirmação física. Pagamento sem estoque, em pedido cancelado ou em duplicidade permanece bloqueado para expedição até resolução prevista. Um operador autorizado pode registrar resolução não financeira, como nova alocação de estoque, mas não fabricar confirmação de estorno. Esse procedimento manual mantém as invariantes e precisa ser ensaiado antes do piloto.

**Comercial — Fase 6:** adicionar intenção persistida antes da chamada externa, chave idempotente e lock da transação. O novo valor solicitado não pode exceder o recebido menos devoluções confirmadas e solicitações em aberto. Serializar pedidos concorrentes; timeout exige consulta antes de repetir. REFUND_FAILED fica visível e não equivale a devolução concluída. Testar saldo insuficiente, confirmação tardia e comissão revertida. Não transferir valores por fora automaticamente.

**Todas as entregas:** rotina consulta tentativas UNKNOWN/PENDING, devoluções e transações divergentes. Padrão proposto: a cada 2 minutos para operações recentes, com espera progressiva e respeito aos limites do gateway. Fazer conferência diária de recebimentos/devoluções; comissão entra quando habilitada. Não depender exclusivamente de webhooks.

“Reembolso total” é o saldo ainda reembolsável, descontadas devoluções anteriores. Revogação de OAuth bloqueia novas cobranças e abre incidente: orientar reconexão ou resolução no gateway, sem presumir uso de credencial revogada. Falta de integração não elimina obrigações pendentes.

### 14.5 Regra comercial da comissão

No piloto, a comissão real fica desabilitada, salvo validação específica acordada; a prova de conceito verifica o mecanismo separadamente. Para um plano com comissão, proposta de cálculo: percentual em pontos-base sobre o total cobrado do comprador, incluindo frete, convertido em valor monetário com arredondamento definido na seção 9.

Congelar no pedido a versão do plano, taxa, base de cálculo e valor solicitado. Confirmar compatibilidade dessa base e das deduções com o contrato do gateway antes de oferecer o plano. Registrar separadamente comissão solicitada, efetiva e revertida. Não prometer que reembolso devolve todas as tarifas do gateway.

O plano gratuito permanente só poderá depender de comissão se cobrança e devolução tiverem sido homologadas. Cobrança posterior de taxa acumulada não será implementada como substituto automático; exige modelo próprio de faturamento, garantia de cobrança e regras de inadimplência.

## 15. Eventos, filas e recuperação

**EVT-01 — Outbox atômica:** gravar evento outbox dentro da mesma transação de pedido, estoque ou pagamento. Publicar para Redis ocorre depois do commit. Nunca fazer “commit do pedido; depois inserir evento no banco”, pois uma falha entre as operações perderia o evento.

**EVT-02 — Entrega repetível:** evento contém event_id, tenant_id, tipo, aggregate_id, aggregate_version, occurred_at e versão do payload. A publicação pode se repetir. Consumidores persistem deduplicação por event_id + consumidor; mudanças locais e comprovante de consumo são atômicos.

**EVT-03 — Reexecução:** não marcar operação de negócio como concluída apenas porque entrou no Redis. Manter status durável de execução/consumo no PostgreSQL. Após perda da fila, reconstruir pendências a partir do banco, inclusive itens anteriormente publicados e ainda não concluídos.

**EVT-04 — Efeitos externos:** e-mail, pagamento e emissão de etiqueta exigem referência estável e mecanismo de idempotência do fornecedor quando disponível. Se o resultado ficar desconhecido, consultar ou encaminhar para resolução; não prometer execução exatamente uma vez quando o serviço não oferece essa garantia. Jobs devem produzir o mesmo estado final após retries. [Idempotência no BullMQ](https://docs.bullmq.io/patterns/idempotent-jobs).

**EVT-05 — Falhas:** retries limitados, com espera progressiva e variação aleatória. Após esgotamento, manter operação em falha visível, com alerta e ação de reprocessar pela administração. Erro permanente de validação não entra em repetição infinita. Ausência de concorrência livre impede que uma loja monopolize processamento.

**EVT-06 — Redis:** instância de filas com noeviction, persistência AOF, volume e monitoramento. Cache, quando ativado, usa outra instância com política própria e pode ser descartado. Separar bancos lógicos dentro da mesma instância não separa memória nem política de remoção. A exigência de noeviction e a recomendação de persistência constam da documentação do BullMQ. [Produção com BullMQ](https://docs.bullmq.io/guide/going-to-production).

Filas de pagamento/conciliação e notificações têm prioridade sobre imagens e IA. Workers usam encerramento controlado em deploy. Credenciais não são serializadas em payloads; registrar referências e buscar segredos autorizados no momento da execução.

## 16. Planos, assinatura e cotas

### 16.1 Piloto e lançamento comercial

O piloto usa acesso por convite e plano interno PILOT, sem promessa de gratuidade permanente. Padrões propostos: 100 produtos ativos, 500 variações ativas, 1 GB de mídia, um dono e um funcionário. São limites técnicos para observar uso; não constituem oferta comercial.

A primeira oferta comercial proposta é um plano pago simples. FREE/START/PRO continuam como possibilidades futuras. Os valores anteriores de R$39 e R$79, taxas e “produtos ilimitados” não foram validados e não devem aparecer como preços aprovados.

Antes de precificar, estimar custo por loja: infraestrutura compartilhada, armazenamento e tráfego, e-mail, processamento, eventuais tarifas próprias, suporte, aquisição e tributos aplicáveis. Separar receita bruta de margem. O responsável define preço, público, recursos e política de suporte com evidência do piloto.

### 16.2 Contrato de cobrança

Planos são versionados. A assinatura referencia a versão contratada e o período de vigência; editar o catálogo de planos não altera cobranças de períodos passados. Valores, descontos e ajustes de fatura são imutáveis após emissão, com correções registradas à parte.

Estados: TRIAL, ACTIVE, PAST_DUE, SUSPENDED e CANCELLED. Eventos de cobrança são validados e idempotentes, com referência à fatura e à conta da plataforma. Credenciais de cobrança SaaS não são intercambiáveis com OAuth do lojista.

Padrão comercial proposto: upgrade/downgrade no próximo ciclo, sem cálculo proporcional no primeiro lançamento. Cancelamento solicitado vale ao término do período contratado. Período de tolerância de cobrança proposto: 7 dias; confirmar esse prazo na política comercial antes de vender.

Inadimplência pode bloquear novas vendas após aviso e fim da tolerância, mas deve preservar acesso restrito a pedidos existentes, conciliação, reembolsos, faturamento e exportação. Nunca descartar webhook ou interromper devolução apenas porque a loja está suspensa.

Selecionar e homologar provedor de recorrência é condição do lançamento comercial; a POC de split não comprova assinatura recorrente. A emissão de documento fiscal relativo à receita da própria plataforma tem fluxo separado da NF-e dos produtos do lojista, definido com a contabilidade conforme o enquadramento efetivo.

### 16.3 Aplicação das cotas

Cotas são aplicadas no servidor. No piloto, mídia admite exclusivamente a tolerância limitada da seção 7; no comercial, a reserva/contabilização é atômica. Limites de produto/variação continuam consistentes em escritas concorrentes. A interface apenas informa limites. Contabilizar produtos e variações separadamente e reconciliar consumo com dados reais.

Downgrade para plano inferior não apaga dados. Bloqueia crescimento do recurso excedido, informa o necessário para adequação e preserva pedidos. Limites de requisição, checkout, upload e tarefas pesadas existem mesmo em planos comercialmente amplos.

## 17. Domínios, HTTPS e cache público

### 17.1 Rota padrão

Piloto: subdomínios provisionados pela plataforma, com DNS na Cloudflare, HTTPS e origem Caddy testados. Painel, callbacks OAuth e webhooks usam endereços estáveis da plataforma, independentes do domínio da loja.

Lançamento comercial: **Cloudflare for SaaS é a opção padrão proposta** para domínios de clientes, condicionada a recursos e orçamento validados. O certificado público do domínio do cliente é gerenciado na borda; Caddy serve a origem com TLS e nome de origem configurados de forma compatível. Validar as duas conexões TLS separadamente e nunca desativar validação de certificado para contornar falha.

Cloudflare for SaaS exige ativação do hostname e do certificado; um CNAME sozinho não comprova que o domínio está pronto. [Configuração oficial](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/).

Caddy On-Demand TLS fica reservado a uma alternativa de terminação direta, caso o projeto decida adotá-la. Essa alternativa exige domínio autorizado e verificado, endpoint interno de permissão e proteção contra emissão abusiva. Não presumir que o certificado de Caddy resolve também o certificado na borda Cloudflare. [HTTPS automático e On-Demand TLS](https://caddyserver.com/docs/automatic-https).

### 17.2 Ciclo do domínio

1. Dono cadastra hostname normalizado; verificar unicidade global e nomes reservados.
2. Plataforma gera prova de controle vinculada à loja, por exemplo TXT com token de uso limitado. O mero cadastro não comprova propriedade.
3. Confirmar prova, roteamento DNS, ativação do provedor e certificado.
4. Marcar ACTIVE somente quando a rota HTTPS funcionar para a loja correta.
5. Tornar domínio canônico por ação explícita. Redirecionar GET/HEAD públicos do endereço antigo com 301, preservando caminho e parâmetros permitidos; não redirecionar POST de checkout ou webhook de forma indiscriminada.
6. Na remoção, desativar o vínculo, invalidar caches e remover a configuração do provedor. Uma nova loja que pedir esse hostname precisa de nova prova de controle; não herdar vínculo abandonado.

Estados: PENDING_VERIFICATION, PENDING_TLS, ACTIVE, FAILED e DISABLED. Falhas mostram instrução recuperável no painel; não transferem automaticamente domínio entre lojas. Suporte a domínio raiz e www deve ser homologado separadamente, pois configuração DNS pode diferir.

### 17.3 Política de cache

Cache público só contém catálogo publicado, tema publicado e páginas públicas sem personalização. Padrão proposto: TTL máximo inicial de 60 segundos para catálogo, com invalidação por evento; arquivos versionados podem ter cache longo. Checkout sempre revalida preço, publicação e estoque.

Uma loja suspensa precisa parar de aceitar novas compras imediatamente no backend, independentemente do cache. Invalidar a vitrine e impedir nova exposição conforme política de suspensão. Não usar “Cache Everything” sem exclusões explícitas para sessões, preview, APIs privadas e checkout.

### 17.4 Acesso externo por túnel, quando necessário

Cloudflare Tunnel é uma opção para disponibilizar webhooks/homologação sem IP público na VM ou portas de entrada abertas. Usar túnel persistente, hostname estável, credenciais protegidas e rota restrita aos serviços necessários. O túnel publica os endpoints configurados; autenticação e assinatura de webhook continuam obrigatórias. Não colocar tela de login interativa na rota de webhook. [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/).

Não confundir Tunnel com Cloudflare for SaaS: o primeiro conecta a origem, enquanto domínios de clientes ainda exigem o ciclo da seção 17.2. Para operação pública, validar roteamento, TLS conforme a topologia, reinício do conector, monitoramento e limites/custos dos recursos efetivamente utilizados. Túnel não resolve falta de energia/internet da VM. Testes temporários não são homologação de URL estável.

## 18. Modelo lógico de dados

Este modelo define entidades, campos essenciais e relacionamentos para as primeiras migrations. Não é um script SQL executado. Campos de infraestrutura repetidos — id, created_at e updated_at — estão omitidos em algumas linhas para legibilidade. Toda entidade de loja possui tenant_id não nulo; tabelas globais têm acesso restrito próprio.

### 18.1 Convenções e restrições

- IDs internos UUIDv7; números comerciais de pedido BIGINT com unicidade por loja. UUID não é segredo de acesso.
- Número do pedido vem de contador transacional por loja, atualizado com lock; nunca usar MAX(numero)+1. Lacunas são permitidas e não há promessa de sequência fiscal.
- Datas em TIMESTAMPTZ/UTC; fuso da loja usado apenas para apresentação e regras locais documentadas.
- Dinheiro em BIGINT de centavos, moeda explícita, quantidades inteiras positivas. Não usar ponto flutuante em cálculo financeiro.
- Pares (tenant_id, id) únicos nas entidades referenciadas; FKs compostas nos vínculos de loja. Índices definidos pelas consultas, não por uma regra universal de primeira coluna.
- Campos estruturais e de busca são relacionais. JSONB é adequado para snapshot imutável, configuração validada e conteúdo de evento, não para esconder saldo ou relacionamentos críticos.
- Excluir em cascata apenas filhos descartáveis cujo ciclo permita isso. Pedidos, recebimentos, auditoria e estoque histórico não somem por exclusão de produto ou cliente.
- Dados pessoais nos snapshots ficam sujeitos às regras de retenção/anonimização. Preservação histórica de valores não obriga retenção eterna de identificação pessoal.

### 18.2 Plataforma e acesso

| Entidade | Campos e relações essenciais | Restrição/uso |
|---|---|---|
| tenants | slug, nome, lifecycle_status, timezone, published_at | slug global único; ciclo separado da assinatura |
| merchant_profiles | tenant_id, identificação do fornecedor, documento aplicável, endereços, contato e políticas versionadas | Dados exibidos na oferta/loja conforme seção 22.5; necessários para publicação real |
| users | e-mail normalizado, credencial, verified_at, MFA | Identidade administrativa global |
| sessions / access_tokens | user_id ou recurso autorizado, hash, expires_at, revoked_at | Segredos opacos; não armazenar token em claro |
| tenant_memberships | tenant_id, user_id, role, status | Único por loja e usuário |
| invitations | tenant_id, e-mail, role, token_hash, expires_at | Uso único; aceitação vinculada ao convidado |
| domains | tenant_id, hostname, status, verification_hash, provider_ref, canonical | hostname global único; no máximo um canônico ativo por loja |
| plan_versions | plan_key, version, price_cents, currency, limits, fee_bps | Global; versão imutável após contratação |
| subscriptions | tenant_id, plan_version_id, status, period_start/end, provider_ref | Uma assinatura vigente por loja |
| subscription_invoices | tenant_id, subscription_id, período, totais, status, external_id | Uma cobrança por obrigação; eventos não duplicam fatura |
| usage_counters / quota_reservations | tenant_id, recurso, período, consumido/reservado, expires_at | Consumo reconciliável; reserva de mídia entregue na Fase 6 |
| order_counters | tenant_id, last_number | Um contador por loja |

### 18.3 Conteúdo, catálogo e compra

| Entidade | Campos e relações essenciais | Restrição/uso |
|---|---|---|
| products | tenant_id, slug, nome, descrição, marca, status, SEO | slug único por loja; arquivamento preserva pedidos |
| product_variants | tenant_id, product_id, SKU, opção normalizada, price_cents, peso, dimensões, status | SKU único por loja; opção única por produto |
| categories / product_categories | tenant_id, slug, parent_id; product_id/category_id | FKs de mesma loja; impedir ciclos de categoria |
| product_options / option_values / variant_values | tenant_id, produto, nome/valor e vínculos | Definem combinações válidas de variação |
| media_assets / media_renditions / media_links | tenant_id, object_key, bytes, status, dimensões e referências | Cota baseada em objetos efetivos; referências tipadas |
| theme_revisions / storefront_settings | tenant_id, schema_version, config; ponteiros draft/published | Publicação atômica; revisões preservadas |
| pages / navigation_items | tenant_id, slug/título, conteúdo sanitizado, ordem e destino | Somente conteúdo publicado é público |
| customers | tenant_id, nome, contato, dados necessários à operação | Nenhuma identidade de compra global implícita |
| carts / cart_items | tenant_id, session_hash, version, customer_id opcional; variant_id, quantity | Um item por variação; nenhum saldo reservado |
| shipping_methods / shipping_quotes | tenant_id, regras/provedor; request_hash, valor, prazo, expires_at | Cotação vinculada a itens/endereço/versões |
| checkout_requests | tenant_id, cart_id, cart_version, actor_scope, key_hash, request_hash, order_id | Unicidade da chave por escopo e da versão convertida |
| orders | tenant_id, number, customer_id opcional, estados, totais, currency, shipping_quote_id, primary_payment_transaction_id opcional, snapshots | Único por tenant/number; valores congelados |
| order_items | tenant_id, order_id, variant_id, quantity, unit_price_cents, total_cents, snapshot | FKs compostas; snapshot suficiente para exibir compra antiga |
| order_history | tenant_id, order_id, dimensão, antes/depois, ator, motivo, event_id | Histórico anexado, não sobrescrito |
| order_incidents | tenant_id, order_id, tipo, status, responsável e resolução | Um mesmo evento não cria incidentes repetidos |
| consumer_requests | tenant_id, order_id opcional, contato protegido, tipo, protocolo, requested_at, acknowledged_at, response_due_at, status, responsável, respostas e evidências | Atendimento geral ou vinculado a pedido; autorização própria e trilha da seção 22.5, incluindo comunicação financeira quando aplicável |
| shipments | tenant_id, order_id, método, tracking_code, status, datas | Um envio completo por pedido no MVP |
| fiscal_references | tenant_id, order_id, emissor, referência, chave e arquivo privado opcional | Evidência do documento externo; não emite NF-e |

### 18.4 Estoque, financeiro e confiabilidade

| Entidade | Campos e relações essenciais | Restrição/uso |
|---|---|---|
| inventory_locations | tenant_id, nome, origem de envio | Uma localização habilitada inicialmente |
| inventory_items | tenant_id, variant_id, location_id, on_hand, reserved | Único por variação/local; invariantes da seção 12 |
| inventory_reservations | tenant_id, order_item_id, inventory_item_id, quantity, state, expires_at, motivo | No máximo uma reserva ACTIVE por item/local; novas tentativas mantêm histórico |
| inventory_movements | tenant_id, inventory_item_id, reservation_id opcional, tipo, delta, operation_id, motivo | operation_id + item/tipo únicos para impedir baixa repetida |
| payment_accounts | tenant_id, provider, ambiente, external_seller_id, credencial cifrada, scopes, status | Piloto: uma conta ativa por loja; uma conta externa não é compartilhada entre lojas |
| payment_attempts | tenant_id, order_id, payment_account_id, operation_key, método, valor, state, expires_at, external_ref | Tentativas podem existir sem recebimento; operation_key estável |
| payment_transactions | tenant_id, order_id, attempt_id, account_id, external_id, valor, moeda, status, timestamps | Único por provider/account/ambiente/external_id; registra inclusive excedentes |
| refunds | tenant_id, transaction_id, valor, status, external_id, motivo; operation_key quando a plataforma iniciar | Piloto: fatos observados no gateway; Fase 6: intenção e limite agregado serializado |
| payment_disputes | tenant_id, transaction_id, external_id, status, valor e datas | Disputa não apaga recebimento ou reembolso |
| platform_transaction_fees | tenant_id, transaction_id, plan_version_id, base, taxa, solicitado, efetivo, revertido | Histórico de comissão; dados reconciliados com provedor |
| webhook_inbox | provider, ambiente, conta/tenant resolvidos, delivery_id, resource_id, payload protegido, status | Entrada pode ficar em quarentena sem tenant até resolução confiável |
| outbox_events / consumer_receipts | tenant_id, tipo, aggregate/version, payload, published_at; event_id/consumer | Publicação e consumo são etapas distintas |
| notifications | tenant_id, evento, canal, destinatário protegido, provider_id, status | Correlação e deduplicação por mensagem lógica |
| audit_logs | tenant_id quando aplicável, ator, ação, recurso, request_id, resumo sanitizado | Não registrar senha, token, cartão ou payload pessoal completo |

Relações centrais: uma loja tem muitos produtos; produto tem uma ou mais variações; variação tem saldo por local; pedido tem vários itens e tentativas; tentativa pode originar registros financeiros; transação tem reembolsos e disputas. O pedido aponta para sua transação principal, mas todas as demais continuam registradas e conciliadas.

payment_status resume a transação principal, enquanto a tela financeira apresenta também total recebido, devolvido e excedente em todas as transações do pedido. Um excedente ainda não devolvido não pode desaparecer por causa do resumo “PAID”.

## 19. Contratos de API e integrações

API documentada por OpenAPI, com exemplos de sucesso e erro, autenticação, limites e idempotência. Datas em ISO 8601/UTC; dinheiro conforme seção 9. Escritas sensíveis usam validação de esquema, limites de corpo e autorização no servidor.

| Operação lógica | Acesso | Contrato obrigatório |
|---|---|---|
| Listar catálogo público | Host de loja ativa | Apenas campos públicos, paginação limitada e isolamento |
| Criar/editar variação | Equipe autorizada | Versão do recurso; conflito em edição concorrente |
| Ajustar estoque | Equipe autorizada | Quantidade, motivo e operação idempotente |
| Criar/corrigir carrinho | Sessão daquela loja | Recalcular no servidor; nunca reservar |
| Cotar frete | Sessão daquela loja | Itens/endereço validados; erro distinto de frete grátis |
| Confirmar checkout | Sessão + intenção de compra | Chave de idempotência; um pedido por versão do carrinho |
| Criar nova tentativa | Acesso ao pedido | Impedir nova cobrança quando resultado anterior é desconhecido |
| Consultar pedido | Equipe ou segredo do comprador | Resposta reduzida conforme o ator |
| Cancelar/acompanhar devolução | Dono | Motivo, pré-condições e confirmação externa; iniciação de estorno só na Fase 6 |
| Registrar demanda do consumidor | Acesso autorizado ao pedido | Protocolo, confirmação, proteção contra duplicação e acompanhamento; não exigir intervenção de desenvolvedor |
| Registrar envio | Equipe autorizada | Pagamento/estoque/estado conferidos novamente |
| Receber webhook | Autenticidade do provedor | Persistência antes do aceite; processamento repetível |
| Publicar tema/ativar domínio | Dono | Validação antes de alterar a versão pública |

Erros incluem código estável, mensagem compreensível, request_id e campos corrigíveis quando aplicável. Não expor SQL, stack trace ou existência de recurso de outra loja. Paginação padrão proposta: 25 registros, máximo 100.

Adapters traduzem dados externos para contratos internos e expõem capacidades realmente homologadas. Não criar métodos fictícios como “cancelar pagamento garantidamente” se o provedor só permite cancelamento em certos estados. Timeouts, limites, retries e estados desconhecidos fazem parte do contrato.

## 20. Infraestrutura e operação

Desenvolvimento e homologação têm banco, armazenamento, domínios, chaves e contas de teste separados da produção. Não usar cópia identificável de dados reais em teste sem tratamento apropriado.

VM inicial alvo: 8 núcleos, 16 GB de RAM e disco persistente. A configuração de 4 núcleos/8 GB fica como candidata a desenvolvimento ou piloto medido. Nenhuma quantidade de lojas simultâneas é garantida sem ensaio representativo.

Serviços Compose: entrada Caddy, web Next.js, API, worker, PostgreSQL, Redis de filas e tarefa de backup. Redis de cache é adicionado apenas quando uma medição justificar. Armazenamento de mídia, backup e provedor de e-mail ficam fora da VM.

Configurar limites de CPU/memória, rotação de logs, health checks, reinício e encerramento controlado. Reservar memória ao sistema operacional e medir o total de conexões de todos os processos antes de dimensionar pools. Builds não ocorrem na VM de produção. Swap é proteção complementar, não capacidade garantida.

Banco e Redis não ficam expostos à internet. Administração do host usa acesso restrito, autenticação forte e atualizações programadas. Persistir volumes do banco, Redis e Caddy conforme uso; segredos não entram em imagem, repositório nem logs.

Na VM da empresa, validar endereço público/roteamento, acesso de webhooks, energia, internet, disponibilidade do host e quem atende a incidentes. A VM é um ponto único de falha aceito no piloto, compensado por recuperação testada; não prometer alta disponibilidade.

Logs estruturados usam request_id, tenant_id quando resolvido, operation_id, tipo e duração. Alertas mínimos: indisponibilidade externa, erro de checkout, divergência financeira, backlog antigo, reembolso falho, banco/disco próximos do limite, backup atrasado e falha de certificado. Cada alerta precisa de responsável e procedimento, evitando notificações sem ação possível.

Notificações ao comprador usam provedor transacional e identidade de remetente verificada da plataforma. O e-mail do lojista pode ser Reply-To autorizado; não falsificar From de domínio não configurado. Registrar falhas, devoluções e bloqueios de entrega.

## 21. Backup, restauração e implantação

### 21.1 Objetivos propostos

| Item | Meta inicial | Como comprovar |
|---|---|---|
| Perda máxima de dados do banco (RPO) | Até 15 minutos | Verificar atraso de WAL/backup externo em ensaio |
| Retorno da operação (RTO) | Até 4 horas desde início do procedimento | Restaurar em ambiente limpo, medir e documentar |
| Retenção operacional de backup | 30 dias | Verificar política, custo, expiração e consistência da cadeia |
| Teste de restauração | Antes do primeiro lojista real e mensalmente | Evidência de restauração e conferência dos dados |

Essas são metas propostas, não resultados já obtidos nem prazos legais. Se não forem atingidas, corrigir a estratégia ou negociar explicitamente a meta antes de produção.

Usar backup físico/base compatível com a versão do PostgreSQL e arquivamento de WAL para recuperação a um ponto no tempo; selecionar uma ferramenta mantida durante a fase de fundação. Guardar cópia externa cifrada, em credenciais separadas da aplicação, e testar acesso às chaves de recuperação. Cópia diária isolada não atende a RPO de 15 minutos.

Mídia precisa de versionamento/cópia e retenção de exclusões compatíveis com a janela do banco. Recuperar o banco para ontem não pode apontar apenas para imagens eliminadas hoje. Backups abrangem configurações recuperáveis e material criptográfico necessário, com acesso separado; não basta salvar o banco cifrado sem poder recuperar a chave dos tokens.

### 21.2 Procedimento mínimo de recuperação

1. Registrar incidente e bloquear novas escritas/cobranças quando a consistência estiver em risco.
2. Provisionar ambiente limpo e restaurar banco, configurações e referências de mídia até o ponto escolhido.
3. Conferir lojas, saldos e pedidos de amostra; reconstruir pendências de fila a partir do banco.
4. Antes de reenviar efeitos financeiros, consultar o gateway. A restauração do banco não desfaz cobranças ou reembolsos ocorridos depois do ponto restaurado.
5. Conciliar recebimentos, comissões e reembolsos da janela afetada usando referências externas. Restaurar não autoriza cobrar novamente.
6. Executar teste controlado do fluxo, reabrir operação e registrar tempos e perda real observada.

No piloto, restauração e conciliação podem ser procedimentos manuais executados pelo operador, com ferramentas de consulta, relatório e evidência. O T26 exige ensaio real desse procedimento; não exige automatizar a recuperação completa. Não permitir nova cobrança enquanto a conciliação da janela financeira permanecer inconclusiva.

### 21.3 Deploy e migrations

Pipeline: validação de tipos e build → testes relevantes → imagem identificada por versão → homologação → migration compatível → implantação → verificação de saúde e compra de teste no ambiente adequado.

Mudanças de esquema seguem expansão e posterior remoção: adicionar estrutura compatível, migrar dados, atualizar consumidores e só então remover campo antigo em entrega posterior. Não depender de rollback destrutivo do banco para voltar a aplicação. Migrations de maior impacto precisam ser ensaiadas com volume representativo e plano de recuperação.

O rollback da aplicação deve preservar eventos pendentes e contratos de payload. O histórico de deploy identifica imagem, migration, configuração e horário. Mudanças de tema também têm versão recuperável.

## 22. Privacidade, fiscal, abuso e encerramento

### 22.1 Privacidade por finalidade

Mapear dados coletados, finalidade, base aplicável, acesso, fornecedores, retenção e descarte. Consentimento para marketing é separado de comunicação transacional; não tratar consentimento como fundamento universal para toda operação.

A classificação controlador/operador depende da atividade efetiva. A plataforma pode atuar em nome do lojista no processamento de pedidos e tomar decisões próprias sobre cadastro, cobrança e segurança do SaaS. Os papéis e responsabilidades precisam ser documentados por tratamento, sem declarar que a plataforma será sempre operadora. [Orientação da ANPD sobre os agentes e o encarregado](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_da_atuacao_do_encarregado_anpd.pdf).

Minimizar dados no checkout; coletar documento apenas quando necessário ao pagamento ou operação definida. Logs e métricas não guardam dados completos de cartão, tokens OAuth ou identificação pessoal desnecessária. Dados de cartão são capturados pelo mecanismo do gateway; PAN e CVV não transitam pelo backend da plataforma nem são persistidos por ela.

Exportação exige autorização, arquivo privado e link com expiração. Solicitações de acesso, correção e eliminação têm registro e fluxo de atendimento. A matriz de retenção, os termos e o procedimento de incidentes são condições de entrada em produção, com validação jurídica adequada ao serviço efetivamente ofertado.

### 22.2 Fiscal

A nota da venda do lojista e o documento fiscal da receita do SaaS são responsabilidades e fluxos distintos. O piloto armazena referência de documento externo do pedido; não calcula tributação nem emite NF-e própria.

Antes de convidar uma loja, confirmar que ela consegue operar sua emissão fiscal pelo processo externo previsto. Se o nicho exigir integração para operar, essa integração passa a ser requisito do piloto daquele nicho, em vez de ser presumida como dispensável.

### 22.3 Abuso e suspensão

Ciclo da loja: DRAFT, ACTIVE, UNDER_REVIEW, SUSPENDED e CLOSED. Ativação exige contato verificado, identificação operacional mínima, políticas da loja e conta de pagamento conectada. OAuth é um sinal técnico de autorização, não prova de legitimidade da loja.

Limitar criação de lojas, checkout, tentativas de pagamento e upload por origem/loja/identidade, com parâmetros ajustáveis. Manter canal de denúncia e suspensão administrativa auditada. Toda suspensão informa motivo e comportamento esperado da vitrine.

Suspensão bloqueia novas vendas, mas preserva recursos necessários para atender pedidos anteriores e processar fatos financeiros. Remoção de conteúdo abusivo pode ser imediata sem apagar a evidência operacional necessária, conforme política aplicável.

### 22.4 Encerramento

No cancelamento, impedir novas compras conforme data efetiva, informar exportação e tratar pedidos, disputas e reembolsos abertos. Proposta de janela de exportação: 30 dias após encerramento, sujeita à política contratual. Isso não define o prazo legal de retenção de cada registro.

Depois da janela, eliminar ou anonimizar por categoria, preservando apenas retenções justificadas e bloqueios por obrigação/disputa. Tokens revogados deixam de permitir novas cobranças. Backups seguem ciclo documentado; eventual restauração deve reaplicar pedidos de eliminação para não republicar dados já removidos.

### 22.5 Atendimento ao consumidor e comércio eletrônico

Antes do piloto público, implementar identificação do fornecedor, informação da oferta, revisão/correção da compra, confirmação de contratação, contrato conservável e atendimento eletrônico. Exibir nome empresarial, CPF/CNPJ quando houver, endereço físico/eletrônico e contato; características/riscos relevantes do produto, despesas adicionais, pagamento, disponibilidade, prazos e restrições. O Decreto 7.962/2013 prevê confirmação imediata das demandas, manifestação do fornecedor em até cinco dias e arrependimento pela ferramenta de contratação. Nas hipóteses previstas, exige comunicação imediata à instituição financeira, administradora do cartão ou similar. [Decreto 7.962/2013, arts. 2º, 4º e 5º](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm).

O art. 49 do CDC prevê sete dias contados da assinatura ou do recebimento do produto/serviço, conforme o caso, e devolução dos valores nas condições ali estabelecidas. Não contar automaticamente apenas desde a criação do pedido. [CDC, art. 49](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm).

**Desenho do produto:** perfil do fornecedor com campos próprios e bloco visível no tema; resumo da compra e comprovante conservável; formulário no acompanhamento do pedido para atendimento e arrependimento, além de contato geral sem exigir compra anterior. Criar protocolo durável e confirmação imediata em tela, com notificação eletrônica correspondente. Preservar horário original da solicitação mesmo se uma integração falhar. Acompanhar responsável, respostas, prazo e resultado pelo painel. Consulta de protocolo exige autorização; protocolo ou contato informado não concede acesso a um pedido. Não bloquear a abertura do chamado por prazo calculado quando a data de recebimento estiver desconhecida ou contestada.

Receber demanda não equivale a confirmar reembolso. No piloto, alertar o responsável para a ação financeira pelo gateway, registrar data/referência da comunicação financeira e acompanhar até conciliação. O procedimento manual deve cumprir a comunicação imediata aplicável; não aguardar o lote diário de conciliação para agir. Ensaiar esse procedimento e definir cobertura do responsável antes da ativação. O botão não pode terminar em uma promessa sem acompanhamento. Dados obrigatórios/políticas e fluxo de atendimento são verificados no T36. A atribuição jurídica concreta de responsabilidades é validada para o serviço ofertado; não presumir imunidade da plataforma apenas porque o vendedor é terceiro.

## 23. IA e extensibilidade posterior

IA é serviço transversal acionado pelo catálogo e outros módulos. Não participa da autorização de pagamento, consistência de estoque nem cálculo oficial de preço. A primeira funcionalidade candidata é gerar rascunho de descrição de produto, publicado apenas após revisão do lojista.

Começar com um provedor homologado e um adaptador; não implementar múltiplos provedores sem necessidade. Registrar tenant, operação, modelo, versão da política de custo, tokens e custo estimado/confirmado. Não incluir credenciais ou dados pessoais de pedidos nos prompts por padrão.

Antes de cada chamada, reservar orçamento máximo previsto. Após conclusão, conciliar consumo real; resultado desconhecido mantém reserva até investigação/expiração controlada. Aplicar limites de entrada, saída, simultaneidade e gasto por loja e global. “Número de operações” sozinho não impede gasto excessivo quando os tamanhos variam.

Falha de IA não bloqueia cadastro manual de produto nem venda. Conteúdo gerado passa pelas mesmas validações de tamanho e sanitização. Explicar custos e cotas na interface apenas quando a funcionalidade estiver liberada.

API pública, webhooks de saída, ERP, marketplaces e WhatsApp entram por etapas, com credenciais de escopo mínimo, idempotência, limites e contrato de eventos. “Preparado para extensão” significa limites de responsabilidade claros; não exige criar tabelas e módulos vazios de todas as funcionalidades futuras.

## 24. Metas de qualidade e comportamento em falha

### 24.1 Invariantes para qualquer entrega

| Código | Regra que nunca pode ser violada |
|---|---|
| INV-01 | Uma operação não lê nem escreve dados de outra loja sem autorização administrativa específica |
| INV-02 | Comprador só acessa o próprio recurso autorizado; número de pedido não concede acesso |
| INV-03 | Um pedido corresponde a uma intenção de compra; retry não cria outra compra |
| INV-04 | Sem encomenda habilitada, saldo disponível nunca fica negativo por concorrência |
| INV-05 | Uma reserva termina no máximo uma vez; pagamento repetido não duplica baixa |
| INV-06 | Todo recebimento externo é preservado, inclusive duplicado, tardio ou incompatível com o pedido |
| INV-07 | Registrar e conciliar toda devolução real; quando a plataforma iniciar estorno, limitar o novo pedido ao recebido menos devoluções confirmadas e solicitações em aberto |
| INV-08 | Cobrança externa usa total e conta recebedora calculados/validados no servidor |
| INV-09 | Evento durável acompanha atomicamente a mudança de negócio que o originou |
| INV-10 | Produto, plano ou tema alterado não reescreve histórico financeiro já confirmado |
| INV-11 | Suspensão e falha de serviços não descartam fatos de pagamento nem obrigações de devolução |
| INV-12 | Restauração não dispara novamente efeitos externos sem reconciliação |

### 24.2 Ensaio de capacidade proposto

Executar em ambiente equivalente ao alvo, registrando CPU, memória, conexões, latência, disco e backlog. Dataset inicial: 10 lojas sintéticas, 100 produtos por loja, média de cinco variações e pedidos históricos representativos. Essa base de ensaio é maior que o piloto e não representa capacidade comercial garantida.

Carga inicial proposta: 20 requisições por segundo durante 30 minutos, com 95% leituras públicas e 5% escritas de compra/administração; pico de 40 requisições por segundo por 5 minutos. Separar cenários de cache quente/frio e incluir concorrência na mesma última unidade. Simular latência/erro dos serviços externos; não usar APIs reais para teste de carga sem autorização e regras do fornecedor.

Metas a validar: p95 de consulta pública no backend ≤ 500 ms, operação local de checkout ≤ 2 s excluindo dependências externas, ausência de violação de invariantes e menos de 1% de falhas internas inesperadas. Exibir tempos externos separadamente para não ocultar experiência ruim atrás da métrica interna.

Medir experiência da vitrine em dispositivo móvel e rede representativos, incluindo imagens, acessibilidade e mensagens de erro. Monitorar crescimento do banco, armazenamento por loja e minutos de suporte. Se a meta falhar, ajustar consultas/cache/concorrência/recursos e repetir o cenário afetado antes de ampliar clientes.

### 24.3 Degradação controlada

| Falha | Comportamento |
|---|---|
| PostgreSQL indisponível | Bloquear escritas e pagamento novo; não responder sucesso de webhook não persistido |
| Redis de cache indisponível | Consultar banco dentro de limites; reduzir carga se necessário |
| Redis de filas indisponível | Persistir inbox/outbox no banco; interromper novas iniciações financeiras enquanto processamento essencial estiver sem condição de recuperação segura; retomar pendências após retorno |
| Gateway indisponível | Marcar tentativa desconhecida quando cabível, apresentar estado recuperável e consultar antes de repetir |
| Provedor de frete indisponível | Oferecer apenas métodos locais válidos; nunca inventar cotação |
| E-mail indisponível | Manter compra e consulta do pedido; registrar envio pendente e alertar backlog |
| Armazenamento indisponível | Bloquear upload/publicação dependente; preservar referências existentes |
| IA indisponível | Cadastro manual e venda continuam disponíveis |
| Backup atrasado | Alerta prioritário; avaliar suspensão de novas escritas se ultrapassar risco aceito de recuperação |

## 25. Critérios de aceite e testes

Os testes abaixo são requisitos futuros, não evidências já produzidas. Automatizar o núcleo financeiro, concorrência e autorização; usar revisão manual para experiência, operação externa e restauração quando necessário. Testes de RLS devem conectar como o papel real da aplicação, nunca apenas como dono ou superusuário.

| ID | Cenário | Resultado esperado | Obrigatório antes de |
|---|---|---|---|
| T01 | Usuário da loja A tenta IDs e hostnames da loja B | Sem leitura/escrita e sem exposição de dados | Piloto |
| T02 | Pool alterna lojas e requisição sem contexto | Contexto não é herdado; ausência nega acesso | Piloto |
| T03 | Inserir FK apontando para variação de outra loja | Banco rejeita vínculo | Piloto |
| T04 | Comprador altera número/ID do pedido na mesma loja | Acesso negado sem autorização daquele pedido | Piloto |
| T05 | Funcionário tenta configurar gateway/plano, cancelar pedido pago ou resolver incidente reservado ao dono | Backend nega; estender a iniciação de reembolso quando implementada | Piloto; extensão na Fase 6 |
| T06 | Duas compras concorrentes da última unidade | Uma reserva integral vence; saldo consistente | Piloto |
| T07 | Carrinho de vários itens, um indisponível | Nenhuma reserva/pedido parcial permanece | Piloto |
| T08 | Repetir confirmação com mesma chave e com nova chave para o mesmo carrinho confirmado | Mesmo pedido, sem nova cobrança automática | Piloto |
| T09 | Mesma chave com conteúdo diferente | Conflito explícito, sem efeito adicional | Piloto |
| T10 | Mudar preço ou frete após exibir checkout | Novo total exige confirmação; não cobrar valor antigo ou adulterado | Piloto |
| T11 | Gateway recebe criação, mas resposta se perde | Mesma operação recuperada, sem duplicação | Piloto |
| T12 | Webhook repetido e atualização fora de ordem | Um reconhecimento financeiro; sem segunda baixa nem regressão | Piloto |
| T13 | Assinatura inválida, vendedor/moeda/valor incompatíveis | Sem confirmação indevida; incidente quando aplicável | Piloto |
| T14 | Pagamento chega junto à expiração | Estado serializado; nenhuma liberação/baixa dupla | Piloto |
| T15 | Aprovação após reserva liberada, com e sem saldo disponível | Realocação segura ou incidente bloqueando envio | Piloto |
| T16 | Duas tentativas diferentes são pagas | Dois recebimentos registrados, uma baixa e excedente acompanhado até devolução | Piloto |
| T17 | Pagamento aprovado em pedido cancelado | Sem reabertura automática; reembolso acompanhado | Piloto |
| T18 | Reembolso iniciado pela plataforma falha, fica desconhecido ou é solicitado duas vezes | Sem ultrapassar saldo; estado real preservado; retry seguro | Comercial / antes de habilitar iniciação pela plataforma |
| T19 | Gateway informa reembolso parcial ou disputa | Informação preservada sem apagar entrega/pagamento anterior | Piloto |
| T20 | Worker cai após commit e antes/depois de publicar | Evento recuperável; consumo repetido não duplica efeito local | Piloto |
| T21 | Redis de filas é perdido após publicação | Pendências reconstruídas do banco e conciliadas | Piloto |
| T22 | Alternar cache entre duas lojas e preview/publicado | Conteúdo correto; nenhum dado privado em cache público | Piloto |
| T23 | Uploads simultâneos perto da cota e arquivo inválido | Piloto: limites por arquivo/concorrência, tolerância controlada, bloqueio após excesso e reconciliação; inválidos não publicados | Piloto |
| T24 | Alterar produto, endereço operacional e tema após compra | Snapshots originais preservados; correções auditadas | Piloto |
| T25 | Suspender loja com pedidos e reembolsos abertos | Novas vendas bloqueadas; obrigações anteriores continuam tratáveis | Piloto |
| T26 | Operador restaura e concilia pagamentos externos posteriores ao ponto recuperado | Roteiro manual ensaiado, evidência e retomada segura; nenhuma cobrança/restituição duplicada | Piloto |
| T27 | Fluxo completo em duas lojas | Conta correta recebe; pedido, estoque, notificação e envio corretos | Piloto |
| T28 | Cadastro, remoção e tentativa de reutilizar domínio | Exige prova atual; roteia somente à loja correta | Domínio próprio |
| T29 | Assinatura aprova, falha, vence, cancela e muda de plano | Faturas/cotas refletem versão e política; sem duplicidade | Comercial |
| T30 | Comissão e reembolso por método de pagamento | Valores efetivos conciliados; condições documentadas | Plano com comissão |
| T31 | Cotação externa muda, vence ou falha | Revalidação correta; nenhum frete gratuito indevido | Frete integrado |
| T32 | Exportar e anonimizar; restaurar backup antigo depois | Acesso restrito e reaplicação das eliminações | Piloto |
| T33 | Ensaio de capacidade da seção 24 | Metas medidas e recursos registrados | Ampliação do piloto/comercial |
| T34 | IA concorrente, timeout e saída excessiva | Orçamento reservado e limite respeitado | Liberação de IA |
| T35 | Devolução executada no gateway para incidente do piloto; evento repetido/atrasado | Pendência persiste até confirmação externa; valores conciliados; operador não fabrica status financeiro | Piloto |
| T36 | Fluxo de atendimento/arrependimento da seção 22.5, inclusive falha de notificação | Informação, revisão, comprovante, protocolo e data preservados; confirmação, prazos e comunicação financeira verificáveis; consulta autorizada | Piloto |
| T37 | SEO de duas lojas, preview e alteração de domínio | Sitemap/canonical/dados estruturados coerentes e isolados; privado fora do sitemap | Piloto; repetir ao ativar domínio próprio |
| T38 | Reserva de mídia sob concorrência no plano comercial | Cota rigorosa, reservas expiradas e contadores conciliados | Comercial |

No piloto, os casos T15–T17 e T35 combinam detecção automatizada com resolução manual documentada; T26 é ensaio operacional. T18 e T38 ficam para a Fase 6. Isso altera o mecanismo de resolução, não dispensa detectar e preservar os fatos. Os critérios T27 e T30 devem identificar ambiente e evidência de cada teste. Dados simulados não substituem comprovação das condições do gateway. O fluxo normal deve funcionar sem alteração manual no banco; ações do lojista como enviar pedido e resolver uma devolução são parte normal do produto.

## 26. Ordem de implementação e marcos de liberação

| Fase | Entrega concreta | Condição para avançar |
|---|---|---|
| 0 — Viabilidade externa | POC isolada de Mercado Pago e relatório de capacidades | Recebimentos, idempotência, expiração e leitura de devolução demonstrados; comissão homologada ou explicitamente desabilitada |
| 1 — Fundação | Repositório, Compose, migrations iniciais, acesso, tenant, RLS, logs, backup e restauração básica | T01–T02 sobre os recursos existentes; contexto/papéis corretos; restauração inicial comprovada |
| 2 — Loja navegável | Mídia, catálogo, saldo inicial, tema, SEO, busca, carrinho e frete local | Duas vitrines isoladas; T22–T23 e T37; perfil do fornecedor e preços consistentes |
| 3 — Compra completa | Checkout, reservas, pedidos, gateway, inbox/outbox e detecção de incidentes; leitura de reembolso externo | T03–T17 e T19–T21; núcleo T35 e protocolo de T36; sem iniciação automática de reembolso |
| 4 — Piloto operável | Painel, entrega, atendimento ao consumidor, notificações, exportação e roteiro manual de recuperação | Todos os critérios do piloto, incluindo T24–T27, T32 e T35–T37; responsáveis/evidências definidos |
| 5 — Piloto observado | Duas ou três lojas convidadas operando; registro de suporte, falhas e custos | Sem falha crítica aberta; correções validadas; evidência de utilidade e capacidade |
| 6 — Comercialização | Plano pago, cobrança SaaS, reembolso pela plataforma, cotas rigorosas, domínio e frete integrados | T18, T28–T31, T33 e T38; repetir T37; comissão condicional ao T30 |
| 7 — Evolução opcional | Uma melhoria escolhida por demanda; primeira candidata: rascunho de descrição com IA | Demanda, orçamento e contrato confirmados; T34 para IA; outras melhorias exigem escopo próprio |

São oito fases, numeradas de 0 a 7. O piloto fica tecnicamente preparado ao final da Fase 4; a Fase 5 depende de uso real e a Fase 7 é opcional, orientada por demanda. Não estimar duração sem disponibilidade/evidência. Fases 0 e 1 podem ocorrer em paralelo com diretórios/branches isolados; resultados da POC alimentam o contrato de pagamentos antes de homologar a Fase 3. Falta de conta externa não impede a fundação e testes locais, mas mantém a homologação correspondente pendente.

### 26.1 Liberação do primeiro piloto real

- Fluxo completo aprovado em homologação para duas lojas distintas.
- Todos os critérios de aceite do piloto concluídos, com evidências; nenhuma falha conhecida de isolamento, cobrança duplicada ou perda de estoque sem tratamento.
- Conta e meios de pagamento de cada loja habilitados, ambiente de produção separado e ativação explícita pelo responsável.
- Backup restaurado, RPO/RTO medidos e conciliação pós-restauração ensaiada.
- Canal de suporte, monitoramento e responsáveis por pagamentos pendentes/reembolsos definidos.
- Dados e políticas da loja, tratamento fiscal externo e documentos operacionais preparados.
- Possibilidade de suspender novas compras de uma loja sem bloquear seus pedidos existentes.

### 26.2 Liberação comercial

Além dos requisitos do piloto: preço e margem estimados, política de suporte sustentável, cobrança e cancelamento da assinatura testados, domínio próprio homologado, retenção/privacidade documentadas e resultados do piloto registrados. Começar a cobrar não depende de ter IA, vários temas ou todos os planos futuros.

## 27. Decisões pendentes e responsáveis

Estas pendências não impedem produzir fundação e testes locais. Cada uma bloqueia somente a liberação correspondente; nenhuma deve ser silenciosamente preenchida pela IA implementadora com dados fictícios.

| ID | Decisão/validação | Responsável proposto | Padrão enquanto pendente | Bloqueia |
|---|---|---|---|---|
| D01 | Nicho, problema prioritário e lojas piloto | Responsável pelo produto | B2C físico, lojas convidadas | Convite/ativação do piloto |
| D02 | Conta, checkout, APIs, métodos e condições do Mercado Pago | Desenvolvimento + titular da conta | Alvo da seção 14; integração desabilitada sem homologação | Pagamento real |
| D03 | Domínio da plataforma, rota pública estável e Cloudflare for SaaS quando necessário | Responsável + operação | Subdomínio gerenciado; Tunnel opcional | Domínio da plataforma antes do piloto; domínios de clientes antes do comercial |
| D04 | Provedor S3, região, backup, criptografia e recuperação | Operação | Interface S3; orçamento a confirmar | Dados reais |
| D05 | Provedor e remetente de e-mail | Operação | Provedor externo; entrega real desabilitada sem configuração | Piloto |
| D06 | VM da empresa, acesso externo, cobertura de incidente e capacidade | Responsável + operação | 8c/16 GB como alvo a medir | Piloto |
| D07 | Preço, plano, recorrência, cancelamento e emissão fiscal do SaaS | Produto + financeiro/contabilidade | PILOT sem mensalidade | Comercial |
| D08 | Responsabilidades, retenção, termos, privacidade e atendimento ao consumidor | Responsável + assessoria pertinente | Minimização, exportação e seção 22.5 | Dados reais/piloto |
| D09 | Provedor e modalidade de frete externo | Produto + desenvolvimento | Retirada/tabela; Melhor Envio como candidato | Frete integrado/comercial |
| D10 | Política fiscal dos lojistas do segmento | Produto + lojistas/contabilidade | Emissor externo e referências no pedido | Piloto daquele segmento |
| D11 | Orçamento, provedor e cotas de IA | Produto + desenvolvimento | IA desligada | Liberação de IA |

Valores técnicos propostos — cotas, prazos internos, limites de upload, frequência de conciliação e metas de desempenho — devem ficar em configuração versionada com limites seguros. Mudanças que alterem obrigação comercial exigem atualização da oferta e da versão de plano, não apenas variável de ambiente.

## 28. Regras para orientar a implementação

1. Implementar uma fase por vez, com migrations, contratos de API, interface suficiente e testes pertinentes ao resultado daquela fase.
2. Preservar decisões desta versão até existir problema concreto ou resultado de homologação que justifique mudança. Registrar alteração, motivo, impacto e testes afetados.
3. Não construir funcionalidades da coluna “evolução posterior” por antecipação. Manter apenas limites de responsabilidade que tornem evolução possível.
4. Não considerar recurso concluído com telas simuladas. Informar claramente se a integração usa simulação, sandbox ou produção.
5. Não colocar chamadas externas dentro de transações com locks, nem substituir falha por confirmação fictícia.
6. Nunca usar papel privilegiado em testes de autorização da aplicação. Executar cenários de múltiplas lojas e de compradores da mesma loja.
7. Não armazenar credenciais em exemplos, testes versionados ou logs. Solicitar configuração pelo mecanismo de segredos previsto quando a integração chegar à fase correspondente.
8. Entregar instruções de subir, migrar, testar, fazer backup, restaurar e diagnosticar falhas relevantes à fase. A documentação acompanha o código.
9. Relatar o que foi verificado, os limites da verificação e os impedimentos externos. Um teste não executado permanece pendente.
10. Produzir a entrega da fase ativa como fluxo demonstrável. Não iniciar a fase seguinte sem instrução do usuário; dentro da fase, executar, verificar e corrigir o trabalho autorizado até concluir ou identificar impedimento externo real.
11. Usar os prompts em prompts/ com esta especificação como referência. O relatório de uma fase não altera requisitos silenciosamente. Exceções de piloto aqui descritas prevalecem sobre a versão 1.0 arquivada.
12. Cada verificação deve separar testes automatizados, ensaios manuais, homologação externa e liberação operacional. Documentação preparada não é um teste executado.

## 29. Melhorias incorporadas e referências

### 29.1 Consolidação técnica preservada da versão 1.0

| Tema anterior | Tratamento nesta especificação |
|---|---|
| MVP como lista extensa de módulos | Separação entre piloto, comercial e evolução; marcos de liberação |
| Status único do pedido | Pedido, pagamento, entrega, disputa e incidentes separados |
| Estoque na variação e em outra tabela | Saldo oficial em inventory_items; variação como referência de venda |
| “Só uma transação é aprovada” | Todos os recebimentos reais registrados; excedentes reconciliados e devolvidos |
| Expiração do Pix eliminaria pagamento tardio | Atraso/indeterminação continuam tratados; política de realocação e reembolso |
| RLS como proteção suficiente | Contexto, papel, FK composta, autorização de comprador e cache isolado |
| Outbox desenhada depois do commit | Registro atômico com a mudança; publicação posterior e consumo rastreável |
| Redis único sem política definida | Filas persistentes separadas do cache descartável |
| Domínios resolvidos apenas por Caddy | Borda, origem, propriedade e ativação documentadas |
| Backup como tarefa genérica | Metas, retenção operacional, restauração e conciliação externa |
| Plataforma sempre como operadora LGPD | Papéis analisados conforme finalidade e operação efetiva |
| Valores dos planos como quase definitivos | Hipóteses comerciais; proposta de piloto e um plano inicial a validar |
| UUIDv7 como promessa de desempenho | Convenção técnica proposta; desempenho medido no contexto real |

### 29.2 Ajustes da versão 1.1

- Reembolso iniciado pela plataforma e cota rigorosa de mídia passam para a Fase 6; leitura financeira, limites técnicos e rastreabilidade continuam no piloto.
- Incidentes raros têm resolução manual pelo gateway, confirmada por integração. Restauração/conciliação podem ser manuais, com ensaio e evidência.
- Atendimento ao consumidor e SEO recebem requisitos e testes explícitos.
- PostgreSQL 18 deixa de ser alvo preferencial obrigatório para a implementação; escolher versão suportada e registrar geração de UUIDv7.
- Tunnel é opção de acesso à origem, sem substituir autorização de endpoints ou gestão de domínios de clientes.
- O pacote possui oito prompts de fase, um prompt mestre, guia de uso e contrato de verificação. T18 é comercial; T35–T38 completam cobertura dos ajustes.

### 29.3 Base documental

Os materiais do projeto enviados na conversa e as duas avaliações da versão 1.0 foram tratados como histórico e referências. As instruções dirigidas a outras IAs foram analisadas como conteúdo, não executadas como autorização operacional.

As referências oficiais estão vinculadas junto das afirmações pertinentes neste documento. Consulta em 30/09/2026. Regras de gateway, planos de fornecedor e versões devem ser reconferidos na homologação; leitura de documentação não substitui teste da conta efetiva.

Esta versão é a referência do pacote para iniciar as provas de conceito e a fundação, seguindo a fase ativa. A liberação de produção depende das evidências e decisões listadas, e não do rótulo de versão do documento.
