# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Lojista (Dono):** pequeno lojista brasileiro de qualquer segmento que tem — ou quer ter — uma loja e deseja vender online criando a própria loja virtual. Configura loja, catálogo, vitrine, pagamento, equipe, plano e domínio. Usa o painel no computador e no celular.
- **Funcionário:** permissões fixas definidas pelo Dono: catálogo, imagens, estoque, pedidos e registro de envio. Não gerencia equipe, gateway, plano ou domínio.
- **Comprador visitante:** compra sem criar conta, acompanha o pedido por link seguro e abre atendimento ou arrependimento pelo próprio pedido.
- **Administrador da plataforma:** acesso separado com MFA obrigatório. Toda ação exige motivo e fica auditada; o acesso a uma loja para suporte também.

## Product Purpose

Plataforma SaaS de e-commerce para pequenos lojistas brasileiros, com administração simples, compra confiável e evolução modular (`docs/especificacao.md` §1).

O sucesso inicial é medido por:

- lojas que publicam catálogo e concluem vendas reais;
- pedidos que dispensam correção direta no banco;
- tempo de suporte por loja;
- custo operacional por loja ativa.

## Positioning

Confirmado pelo responsável em 02/10/2026. As três razões valem em conjunto:

1. **Simplicidade e suporte próximo:** menos recursos, configuração guiada e atendimento próximo.
2. **Custo baixo e previsível:** plano simples, sem comissão sobre as vendas. O preço ainda está pendente (D07). A especificação mantém uma comissão opcional apenas se homologada (§14.5), e essa diferença deve ser resolvida em D07.
3. **Dinheiro direto na conta Mercado Pago do lojista:** o pagamento vai para a conta do próprio lojista, sem intermediação da plataforma. A integração real ainda não está homologada (D02); hoje os pagamentos são simulados.

## Operating Context

- Brasil, português brasileiro, moeda BRL.
- Cada loja tem a sua vitrine: hoje subdomínio gerenciado; domínio próprio depende de D03.
- O painel administrativo roda no navegador, em desktop e celular.
- O piloto é privado, com 2 a 3 lojas convidadas e cadastro/ativação assistidos.
- Pagamentos via Mercado Pago do lojista, com Pix e cartão.
- Frete por retirada ou tabela própria; agregador externo candidato: Melhor Envio (D09).
- Nota fiscal emitida fora da plataforma; o pedido guarda as referências da nota.
- Atendimento ao consumidor dentro da plataforma, conforme o Decreto 7.962/2013 e o CDC: protocolo com confirmação imediata, resposta em até 5 dias e arrependimento em 7 dias.
- E-mails transacionais do pedido.

## Capabilities and Constraints

**Já implementado** (código verificado localmente; integrações externas simuladas):

- catálogo com variações, categorias, imagens (JPEG, PNG e WebP até 10 MB) e busca com tratamento de acentos;
- vitrine com um tema oficial: cores e fontes permitidas, logo, banners, menus, páginas e seções reordenáveis;
- carrinho e checkout de visitante;
- estoque em um único local, com reservas;
- pedidos com estados separados de pedido, pagamento e entrega;
- atendimento com protocolo;
- equipe Dono/Funcionário;
- MFA;
- planos versionados;
- domínio próprio;
- operação: alertas, pausa de vendas e exportação;
- rascunho de descrição por IA (desligado por padrão).

**Restrições confirmadas (especificação):**

- "Todo tipo de produto" vale dentro do recorte das primeiras entregas: produtos físicos, B2C, quantidades inteiras, um local de estoque e um vendedor por checkout. Produtos digitais, serviços, B2B e marketplace estão fora.
- Conteúdo do lojista nunca executa JavaScript nem insere HTML sem sanitização.
- Nenhum dado pessoal em URLs. Links de acesso ao pedido não carregam scripts analíticos de terceiros.
- A compra distingue os estados processando, aguardando pagamento, pago e ação necessária. Nunca exibir confirmação financeira apenas porque o navegador voltou do gateway.
- SEO e vitrine não inventam avaliações, estoque ou promoções.
- Dados simulados ficam sempre identificados como simulação/demonstração.

**Terminologia:** loja, vitrine, painel, Dono, Funcionário, comprador, produto, variação, SKU, pedido, protocolo, plano, domínio próprio.

**Decisões em aberto:**

- nome e marca do produto (indefinidos);
- preço e plano (D07);
- domínio da plataforma (D03);
- frete externo (D09);
- política fiscal por segmento (D10);
- IA (D11);
- pagamento real (D02);
- termos e privacidade (D08);
- lojas piloto (D01).

## Evidence on Hand

- Especificação e plano: `docs/especificacao.md` v1.1 e `docs/PLANO-E-VERIFICACAO.md`.
- Relatórios de execução e revisão: `docs/execucao/`.
- Capturas funcionais da interface atual em `docs/execucao/evidencias/`. São registros de teste, não referências de design.
- **Ausentes, não fabricar:** nome, logo e marca; lojas e clientes reais; depoimentos, números de vendas, imprensa; preços aprovados. Os dados de demonstração e do piloto simulado são fictícios e não podem aparecer como reais.

## Product Principles

1. **Simples antes de completo:** cada tela resolve a tarefa do lojista com o mínimo de decisões. Recurso novo só entra com uso real.
2. **Confiança na compra:** valores e estados de pagamento sempre fiéis ao que foi confirmado. Falhas são recuperáveis sem recriar o pedido.
3. **O dinheiro é do lojista:** recebimento direto na conta dele e custo previsível, sem comissão sobre vendas.
4. **Cada loja é do seu dono:** isolamento total entre lojas. A vitrine carrega a identidade do lojista, não a da plataforma.
5. **Honestidade operacional:** simulado é rotulado como simulado; nada de dados, selos ou indicadores inventados.

## Accessibility & Inclusion

- Requisito da especificação (§8): interface responsiva, operável por teclado, com rótulos, foco visível, erros próximos dos campos e mensagens que permitam tentar de novo.
- Metas adotadas para o redesenho de 02/10/2026:
  - contraste de 4,5:1 para texto comum e 3:1 para texto grande e elementos essenciais;
  - alvos de toque de 44 × 44 px;
  - zoom de 200% sem perda de conteúdo;
  - respeito a movimento reduzido.
- Nível WCAG formal ainda não definido.
