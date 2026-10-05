# Relatório final — implementação do redesign (prompt 2)

> **Atualização de 04/10/2026:** evolução de UX, interface e personalização (lotes A–C de 03/10) em [§10](#10-evolução-de-ux-interface-e-personalização-0304102026).

**Data:** 02/10/2026 · **Branch:** `claude/gallant-fermat-6x20fs` · **Base:** `831d9a2` (materiais de design sobre o commit de produto `0179f4d`)
**Commits desta entrega:** `f4e5e5e` (lote A), `d445f81` (lote B), `6160a61` (lote C), `1500fbb` e `2a6531e` (correções encontradas na verificação) e o commit de documentação que acompanha este relatório.

> Este redesign **não** torna o sistema pronto para produção. Pagamentos seguem SIMULADOS, a devolução continua orientada no provedor, e não houve aprovação visual do responsável nem auditoria de acessibilidade com leitor de tela.

## 1. Situação em três eixos (03/10/2026, commit `ff73c7d` + documentação)

| Eixo | Situação | Base |
|---|---|---|
| **Implementação** | Lotes A, B e C concluídos; rodada de correções da revisão de `7f5572d` concluída (§8). Nenhuma regra de negócio nem resposta de API alterada | §2–§3, §8 |
| **Funcional** | **Não concluído só pelo T23.** O 429 do G-13 foi resolvido em `6a0d195` (isolamento do limitador entre lotes de suítes, sem mudar o limite): duas execuções completas da fase 7 com código 0, 16/16. `verificar-aceite.mjs` 65/65, `verificar-teclado.mjs` 12/12, Tab 159/159. **T23** (upload de 10 MB + 1 → 500 em ~15% pelo proxy do Next) segue intermitente | §4, §8, §9, [verificação](evidencias/verificacao/LEIA-ME.md) |
| **Visual** | ACEITE: 88 critérios — **86 aprovados**, **1 parcial** (G-13: falta só o T23) e **1 alterado** (A-R12-07). **Aprovação visual do responsável: pendente** | §5, [ACEITE.md](ACEITE.md) |

A entrega **não** está concluída como um todo enquanto o T23 (parte do G-13) seguir intermitente.

## 2. Rotas alteradas

| Rota | Arquivo(s) | O que mudou |
|---|---|---|
| R01 `/` | `app/page.tsx` | Acesso (entrar, cadastro, verificação, recuperação), escolha de loja com papel, estado “Nenhuma loja vinculada”, configuração, equipe e revogação em diálogo |
| R02 `/painel/[tenantId]` | `app/painel/[tenantId]/page.tsx`, `layout.tsx`, `components/panel/{Shell,catalog,storefront-settings}.tsx` | Casca com navegação lateral/faixa; catálogo com busca local que declara o escopo, filtros de status/categoria, tabela que vira lista no celular; cadastro e edição de produto, variações, imagens, estoque; “Vitrine e frete” com prévia de marca (`?aba=`) |
| R03 `/painel/[tenantId]/pedidos` | `app/painel/[tenantId]/pedidos/page.tsx` | Filtros reais do servidor na URL; detalhe com **síntese derivada do estado** (“Pagamento recebido · devolução pendente de R$ X · envio bloqueado”), alerta financeiro curto com próxima ação e “Como resolver no piloto” expansível, “Valores registrados na compra”, pagamentos com totais recebido/devolvido/a devolver, pendências, expedição com uma ação por vez e motivos do bloqueio, “Atualizar situação do pagamento”. Nenhum botão inicia devolução pela API |
| R04 `/painel/[tenantId]/atendimento` | `app/painel/[tenantId]/atendimento/page.tsx` | Lista com filtro na URL e protocolo como link; conversa, resposta, conclusão e comunicação ao meio de pagamento antes da resposta |
| R05 `/painel/[tenantId]/operacao` | `app/painel/[tenantId]/operacao/page.tsx`, `components/commercial.tsx`, `components/ai-draft.tsx` | Alertas, vendas (pausar/retomar), MFA, plano e faturas, domínio, transportadora, IA, exportação |
| R06 `/plataforma` | `app/plataforma/page.tsx` | Faixa de contexto global, MFA antes de tudo, consultas e ações sempre com motivo em diálogo, auditoria |
| R07 `/preview/[tenantId]` | `app/preview/[tenantId]/page.tsx`, `components/storefront.tsx` | Faixa “Preview privado do rascunho — não publicado”, busca e carrinho desativados, acesso negado com “Entrar no painel” |
| R08–R11 vitrine | `app/lojas/[slug]/[[...path]]/page.tsx`, `components/storefront.tsx`, `app/lojas/[slug]/{not-found,error}.tsx` | Cor e fonte de títulos de cada loja pelo algoritmo de marca; grade 2/3/4 colunas com moldura 4:5 sem distorção; busca com vazio explicado; categorias com `aria-current`; produto com galeria protagonista, título logo abaixo da trilha, variações acessíveis por setas, um único `role=status` com “Ver carrinho”; 404 e erro próprios da vitrine. JSON-LD, metadados, canonical e redirecionamento de slug preservados |
| R12 `/lojas/[slug]/carrinho` | `components/checkout.tsx` | Etapas Carrinho → Entrega → Seus dados → Revisão na mesma rota; só a etapa atual aberta; concluídas viram resumo com “Alterar” sem perder o resto; foco no título a cada etapa; conflito de preço/frete volta à entrega com dados mantidos; chave de idempotência por intenção |
| R13 `/lojas/[slug]/pedidos/[id]` | `components/checkout.tsx` | Comprovante com aguardando confirmação (reserva até HH:MM vinda da API), nova tentativa, pendência, selos, rastreio, solicitações e protocolos |
| R14 `/lojas/[slug]/atendimento` | `components/checkout.tsx` | Contato geral com protocolo, código de acompanhamento com “Copiar código”, consulta |

## 3. Componentes e fundamentos

- **Tokens:** `docs/design/tokens.json` gera o bloco `:root` de `apps/web/app/style.css` e do protótipo (`docs/design/tokens-css.mjs`; `--check` confere). Meta de toque `layout.touch-target` = 44 px.
- **Fonte:** IBM Plex Sans 400/500/600 (Latin-1, OFL) em `apps/web/app/fonts/`, carregada por `@font-face` do próprio app.
- **Isolamento:** `.surface-panel` e `.surface-store` definem apelidos (`--_bg`, `--_primary-*`, `--_link`…); regras de elemento com `:where()` (D-11).
- **`components/ui/`:** `format.ts` (dinheiro em centavos/BigInt, datas com fuso), `status.ts` (rótulos e tons de todos os estados, `incident()`, `humanize()` para códigos), `icons.tsx`, `kit.tsx` (Badge, StatusBadge, Alert, Feedback, EmptyState, Loading, PageHeader, Field com ids de acessibilidade, MoneyInput, ConfirmDialog nativo com retorno de foco, CopyButton, useDirty, useTitle).
- **`components/panel/`:** `api.ts` (chamada com CSRF, mensagens), `Shell.tsx` (contexto da loja), `catalog.tsx`, `storefront-settings.tsx`.
- **`components/brand.ts`:** algoritmo de marca (mesmo cálculo do verificador); a cor armazenada nunca é alterada.

## 4. Testes e verificações (resultados reais)

Ambiente: Postgres 17.9, Redis e SeaweedFS do `compose.yaml` em contêiner; API, worker e web (`next build --webpack` + `next start`) no host com Node 24.21.0; suítes de UI no contêiner `mcr.microsoft.com/playwright:v1.63.0-noble`. Dados sintéticos (`example.test`), pagamentos SIMULADOS, nenhuma credencial de produção.

| Verificação | Resultado (última execução, 02/10/2026) |
|---|---|
| `npm run typecheck` (api, web, worker, database, media, purchase) | aprovado, saída 0 |
| `npm run build -w @ecommerce/web` | aprovado |
| `node docs/design/verificar.mjs` | aprovado (“Materiais de design coerentes.”) |
| `node docs/design/tokens-css.mjs --check` | “em dia” para app e protótipo |
| `tests/foundation.test.mjs` | 13/13 |
| `tests/storefront.test.mjs` | 10/12 — falha **T23** (e a suíte que a contém): upload de 10 MB + 1 passa pelo proxy do Next e vira 500 (EPIPE). Reproduzida na web da base `831d9a2` em worktree separada: **preexistente**, fora do escopo visual |
| `tests/purchase-worker.test.mjs` | 4/4 |
| `tests/pilot-flow.test.mjs` | 3/3 |
| `tests/commercial-ui.test.mjs` | 1/1 |
| `node docs/design/verificar-teclado.mjs` | 12/12 ([teclado.json](evidencias/depois/teclado.json)) |
| `node docs/design/verificar-aceite.mjs` | 24/24 após correções ([aceite.json](evidencias/depois/aceite.json)) |

Seletores de teste atualizados (mesmo comportamento, mesmas asserções): número do pedido e “Contato geral” passaram de botão para link; “Configuração salva.”; heading “Produtos”. Nenhum teste removido, nenhuma validação enfraquecida. `scripts/verify.mjs` (verificação completa por fase) **não** foi executado.

Jornadas exercitadas: navegação do painel; cadastro de produto com erro de SKU repetido e edição; interpretação do pedido com excedente/devolução pendente; vitrine → produto → carrinho → entrega → dados → revisão → comprovante; pagamento pendente e recusado (com nova tentativa); preço alterado entre cotação e confirmação; duplo clique na confirmação (1 pedido); loja sem conta de pagamento; Funcionário sem ações do Dono; administração com e sem MFA.

## 5. Capturas

- [`evidencias/antes/`](evidencias/antes/): 26 cenários da base em 390 e 1440 px (52 imagens), antes de qualquer mudança.
- [`evidencias/depois/`](evidencias/depois/): 49 cenários em 390/768/1440 (147), 15 em 320 px, 14 em 1280 px com zoom 200% (viewport CSS de 640 px) e 18 das verificações de aceite. Métricas automáticas por captura em [`resultado.json`](evidencias/depois/resultado.json): rolagem horizontal 0 px em todas; nenhum controle sem nome; nenhum alvo < 24 px; nenhuma ação principal < 44 px em telas estreitas; erros de console só os esperados (401 da sessão anônima em `/`, 409 do SKU repetido, 404 de CEP sem atendimento/pedido não autorizado/página inexistente).
- Os conjuntos intermediários dos lotes A, B e C foram examinados durante a implementação e removidos depois de substituídos pelo conjunto final, para não inflar o repositório.

**Capturas examinadas visualmente no conjunto final** (além das métricas): R10-produto-foto-1440, R10-adicionado-390, R12-dados-320, R06-plataforma-320, R03-pedido-excedente-1280-z200, R02-novo-erro-390, R04-protocolo-1440, R02-funcionario-vitrine-1440, R07-preview-390, aceite-A-R12-04-1440 e as capturas de falha das verificações de aceite. Do conjunto intermediário do lote C (mesmo código, antes dos últimos ajustes de CSS): R10-produto-390, R10-produto-foto-1440, R08-vitrine-b-1440, R08-vitrine-c-390, R12-cep-sem-atendimento-390, R12-revisao-390, R13-pendente-390; e as capturas das suítes (`phase2-store-390`, `phase3-order-1440`). As demais capturas do conjunto final foram conferidas só pelas métricas automáticas.

**Fotos reais:** o produto “Caneca café aurora” recebeu fotos de amostra do repositório scikit-image (v0.22.0: `coffee.png` em paisagem, um recorte em retrato e `chelsea.png`), usadas apenas no banco local de demonstração (não foram adicionadas ao código). Licença conforme a documentação do scikit-image, não conferida nesta sessão. As demais imagens de demonstração são gráficos gerados localmente e identificados como “IMAGEM DE TESTE”.

**Marcas testadas:** loja A `#245742` (fonte do sistema), loja B `#F2C94C` com títulos serifados (baixo contraste: a interface usa a cor ajustada pelo algoritmo, a armazenada continua `#F2C94C`), loja C `#314A8F`. Georgia não existe no Linux do ambiente; a serifada renderizada é a do sistema.

## 6. Revisão crítica

**O que ficou melhor**
- O pedido agora diz o que importa antes dos detalhes: a síntese vem do estado real (pagamento, devoluções confirmadas, pendências abertas, motivo do bloqueio), o alerta financeiro dá a próxima ação em uma frase e o passo a passo fica expansível. Códigos como `EXCESS_PAYMENT` aparecem só como “Código para suporte”.
- A vitrine deixou de herdar a identidade da Plataforma: cada loja aparece com sua cor e fonte de títulos, o link “Painel” saiu do menu público, e nenhum conteúdo do protótipo (Ateliê Ipê, “Composição”, ilustrações) entrou nas rotas reais.
- O checkout no celular mostra uma etapa por vez; corrigir uma etapa não apaga as outras; os prazos (validade da cotação, reserva, prazo de entrega) vêm da API.

**Defeitos encontrados na verificação e corrigidos**
1. Login com senha errada mostrava “Sua sessão expirou” (todo 401 virava sessão). Agora mostra o motivo do servidor (“Credenciais inválidas.”).
2. Todo 409 na confirmação era tratado como “preço ou frete mudou”, inclusive “O Dono precisa conectar a conta SIMULADA”. Agora só conflitos de preço/frete/disponibilidade voltam à entrega; os demais ficam na revisão com a mensagem do servidor.
3. A chave de idempotência era só por cotação: corrigir dados depois de uma falha geraria “Chave reutilizada com conteúdo diferente”. Agora a chave cobre cotação + dados enviados (repetir a mesma intenção continua sem duplicar — verificado com duplo clique).
4. Botões da administração tinham o mesmo nome acessível para lojas homônimas (“Consultar BRISA TESTE”); agora incluem o endereço da loja.
5. Rolagem horizontal: lista de pedidos em 768 px (trilha de grade sem `minmax(0,1fr)`) e selo longo da plataforma em 320 px.
6. Alvos de toque: links curtos do menu da loja e “Limpar filtros” abaixo de 44 px no celular.
7. Mensagem de conflito com título errado (“Não foi possível calcular a entrega”) e texto duplicado; substituída por “Os valores mudaram antes da confirmação”.
8. Preview: carrinho e busca levavam a rotas inexistentes; o aviso espremia o nome da loja.

**Fragilidades que continuam (pendências reais)**
- Na grade da vitrine (moldura 4:5), fotos em paisagem ainda ganham faixas neutras (sem corte nem distorção, D-16); na página do produto a moldura acompanha a foto entre 4:5 e 4:3.
- O 409 do cadastro de produto não distingue endereço de SKU; o erro fica no resumo do formulário, não no campo.
- “Pagamento indisponível” depende de um sinal global (simulação desligada no ambiente); uma loja sem conta conectada só descobre na confirmação. Corrigir pede mudança de API — fora do redesign.
- No celular o resumo do pedido fica depois da etapa atual (D-17); o critério A-R12-07, que pedia o resumo antes, foi registrado como “alterado”.
- Os doze cenários antes sem evidência foram exercitados na rodada de 03/10 (§8).
- Sem leitor de tela real e sem auditoria completa de acessibilidade; nenhuma declaração de conformidade WCAG.
- Checkout continua sem bairro, telefone ou CPF (decisão de produto, não alterada).
- T23 (upload de 10 MB via proxy do Next) segue falhando e não pertence a este trabalho.

## 7. Como reproduzir

1. Subir o ambiente local (README/`compose.yaml`), criar dados com `node scripts/seed.mjs --local` e os dados de demonstração usados nas capturas (pedidos pendente/pago/recusado/excedente, Funcionário, administrador com MFA) em `.local/demo-ui.json` (fora do git).
2. `node docs/design/capturar-rotas.mjs depois` (+ `--widths=320`, `--widths=1280 --zoom=2`), `node docs/design/verificar-teclado.mjs`, `node docs/design/verificar-aceite.mjs` (altera dados de demonstração).
3. Suítes: `node --test tests/<suíte>.test.mjs` com `BASE_URL` apontando para a web de teste.

## 8. Rodada de correções sobre a revisão de `7f5572d` (03/10/2026)

**Checkout sem resposta conclusiva** (`components/checkout.tsx`, D-18): rejeição conclusiva (400/409 depois da verificação de pedido existente) × resultado desconhecido (rede, tempo esgotado, 5xx, 429). No desconhecido a mesma intenção (chave + conteúdo) é guardada na memória e no `sessionStorage`, itens/entrega/dados ficam travados e só “Verificar compra” reenvia; nunca se afirma que o pedido não existe. Proteção do servidor mantida sem alteração: `checkoutExisting` devolve o pedido existente pela chave (mesmo conteúdo) e pelo carrinho + versão (qualquer chave); lacuna documentada: 503 (fila) é lançado antes da verificação de pedido existente, por isso é tratado como desconhecido. Testes CK-01…CK-05 em `verificar-aceite.mjs`.

**Reprodutibilidade** (D-20): `docs/design/ambiente/` (Compose isolado `ecommerce-design-demo`, `gerar-dados.mjs`, `rodada-completa.sh`, README com dependências e limpeza restrita ao projeto de teste). `.local/demo-ui.json` (senhas e segredo MFA sintéticos) fica fora do git, modo 0600. Demonstração: três rodadas completas do zero nesta sessão (`limpar → subir → dados → capturas → teclado → aceite`).

**Preview** (D-19): `/preview/[tenantId]/[[...path]]` com início, páginas e produtos do rascunho; o resto como “indisponível no preview”. PV-01: 9 links, 0 quebrados, 0 para a loja pública; anônimo negado; rascunho não vaza; noindex.

**Defeitos encontrados nesta rodada e corrigidos**
1. Texto em 200% (fonte do navegador 32 px): checkout e menu da loja com uma letra por linha, topo do painel sobreposto, lateral com palavras partidas. Causa: `overflow-wrap: anywhere` no corpo e pontos de quebra em px. Correção D-22 (pontos de quebra em `em`, `break-word`, topo com altura mínima).
2. Lista de pedidos em 768 px: data quebrada por caractere e coluna “Pendências” cortada (a métrica de rolagem dava 0 px). Correção: empilhada até 1279 px.
3. Capturas de texto 200%: o `fullPage` do Playwright redefine a fonte durante a captura (as imagens saíam com 16 px); agora a página é capturada com janela alta.
4. Teste: “pedido mais recente” lia `body[0]` de `purchase/orders`, que ordena o número como texto (defeito **preexistente da API**, não usado pela interface; tarefa separada sugerida). Teste: conexão keep-alive fechada durante reinício do worker → uma repetição só para erro de soquete.
5. Fotos: moldura do produto acompanha a proporção da foto (entre 4:5 e 4:3), miniaturas e imagem do tema inteiras, sem corte nem distorção (D-16 revisada).

**Zoom:** `--zoom=2` é só simulação de reflow (viewport CSS 640 + `deviceScaleFactor` 2). O zoom **real** do navegador passou a ser testado com `--zoom-real` (extensão local que chama `chrome.tabs.setZoom`, o mesmo zoom de Ctrl +/−): 15 cenários em 200% e 400%, rolagem 0 px. O `screenshot` do Playwright ignora esse zoom (sai cortado); a captura é feita pelo CDP.

**Tab completo:** `capturar-rotas.mjs --tab` percorre a página inteira em 159 cenários × largura (14 rotas, 390/768/1440): 3.102 paradas sem problema (nome, visibilidade, contorno ≥ 2 px, não encoberto, sem armadilha); saltos para cima só em troca de coluna no desktop. O script começava o Tab do último clique nos cenários com interação; corrigido antes da evidência final. Texto em 200% usa a preferência real de fonte do Chromium (`Page.setFontSizes`).

**Tokens:** `tokens-css.mjs --check` normaliza só `\r\n` e grava no EOL do arquivo; `tokens-css.test.mjs` 8/8 (LF, CRLF, diferença real detectada em ambos, conteúdo preservado).

**Imagens examinadas visualmente nesta rodada** (`evidencias/depois/`): R01-lojas-1440, R01-acesso-390, R02-produtos-390, R02-produto-editar-1440, R03-pedido-excedente-390, R03-pedidos-1440, R03-pedidos-768 (antes e depois da correção), R03-pedidos-1024, R04-protocolo-1440, R04-atendimento-390, R05-operacao-390, R05-operacao-1440, R06-plataforma-1440, R06-plataforma-320, R07-preview-390, R07-preview-indisponivel-1440, R07-preview-produto-1440, R08-vitrine-a-390, R08-vitrine-b-1440, R09-categoria-390, R09-categoria-1440, R10-produto-foto-retrato-390, R10-variacao-esgotada-1440, R11-pagina-390, R11-pagina-1440, R12-resultado-desconhecido-390, R12-revisao-1440, R12-dados-320, R12-dados-1280-t200 e R02-produtos-1280-t200 (antes e depois), R13-pendente-390, R13-pendente-1440, R14-atendimento-390, R14-atendimento-1440, R03-pedido-excedente-1280-z200, aceite-falha-A-R01-06. As 14 rotas foram vistas em celular e desktop; as demais imagens só pelas métricas de `resultado.json`.

**Verificação por fase:** [evidências e procedimento](evidencias/verificacao/LEIA-ME.md). T23 (upload de 10 MB pelo proxy do Next, ~15% de 500 por EPIPE) e o 429 do pilot-flow reproduzem na base com o mesmo procedimento; ficaram como tarefas separadas. Nenhuma integração externa refeita; nada aqui é homologação real.

**Defeito no script da rodada (encontrado depois, corrigido):** a primeira versão de `rodada-completa.sh` saía com 0 mesmo quando teclado e aceite falhavam (as falhas só eram impressas e o último comando era `grep`). Os resultados desta rodada foram lidos nos logs e em `aceite.json`, não no código de saída: a última rodada teve aceite com saída 1 (A-R01-06, registrado acima). Agora cada etapa tem o código de saída verificado e a rodada sai com 1 se alguma falhar; testado numa cópia isolada com `node` simulado (tudo passa → 0; teclado e aceite falham → 1; só aceite → 1; capturas → 1; preparação → 1 e interrompe) e a versão anterior reproduzida com saída 0 no mesmo cenário.

**Pendências abertas:** T23 (upload de 10 MB + 1 pelo proxy do Next, intermitente; tarefa separada); limite por IP em produção agrupa todos os clientes atrás do proxy (tarefa separada); leitor de tela real; aprovação visual do responsável; ordenação de `purchase/orders`; campos do checkout (decisão de produto).

## 9. G-13: limite de requisições e isolamento entre testes (03/10/2026, `6a0d195`)

- **Causa provada:** a API limita por IP do socket (`trustProxy: false`), em janela fixa de 1 min. Todo o tráfego dos testes passa pelo proxy do Next e chega com o IP do contêiner web, então as suítes dividiam uma única cota.
  - As suítes de API gastam 785 requisições em ~20 s e as de interface começavam dentro da mesma janela.
  - O navegador recebeu 429 em `purchase/accounts` e `operations/support`, e a tela mostrou “Limite de requisições excedido”.
  - Sozinha, nenhuma suíte passa de 232 requisições.
  - A prova anterior (“4 respostas 429 novas”) misturava 429 esperados do limite de IA e foi corrigida.
- **Correção sem mudar o limite:** `scripts/verify.mjs` espera vencer a janela aberta por outro lote antes de cada lote e registra a espera.
- **Repetibilidade:** `commercial.test.mjs` com ID de evento único.
- **Resultado:** duas execuções completas da fase 7 com código 0 (16/16), contra 4 falhas do pilot-flow em 5 sequências antes. O custo é ≈ 3 min de espera por execução.
- **Fora do escopo, registrado como tarefa:** em produção (Caddy → Next → API) o mesmo `trustProxy: false` faz todos os clientes dividirem a cota de 120/min.
- **T23:** segue intermitente (passou nas duas execuções, o que não o resolve).

## 10. Evolução de UX, interface e personalização (03–04/10/2026)

**Commits (locais, em `main`, sem push):** `2bab597` (código e testes), `b1ddf97` (lojas de exemplo e scripts de revisão), `50ef541` (documentação e evidências), `17383a9` (nome do formulário do desafio de MFA) e o commit deste relatório. Critérios em [ACEITE.md §3](ACEITE.md); decisões D-23 a D-30 em [DESIGN.md §15](../../DESIGN.md).

### 10.1 As cinco falhas apontadas — antes e depois

Antes: capturas da loja de demonstração antiga, removidas do diretório em 04/10 e preservadas no histórico do Git (`git show 240694e:docs/design/evidencias/capturas-locais/<arquivo>`). Conjunto atual completo (47 telas × 390/1440, 05/10, depois da rodada Compasso; o conjunto de 04/10 fica no histórico em `9bcc3f2`): [`evidencias/capturas-locais/`](evidencias/capturas-locais/). Depois: [`evidencias/evolucao-ux/`](evidencias/evolucao-ux/) (lojas de exemplo; conteúdo diferente, mesmas larguras).

| Falha | O que mudou | Antes → depois |
|---|---|---|
| 4.1 Navegação móvel e catálogo | Faixa com todos os itens trocada por botão “Menu” + `<dialog>` agrupado por tarefa; lista de produtos em linhas compactas com filtros atrás de “Filtros”. Primeiro produto: y = 1068 px → 301 px em 390×844 | catálogo 390 `05-painel-catalogo-390.png` (commit `240694e`) → [produtos 390](evidencias/evolucao-ux/painel-produtos-390.jpg), [menu aberto](evidencias/evolucao-ux/painel-menu-aberto-390.jpg) |
| 4.2 Configurações, edição de produto e pedidos | Uma página por tarefa (`/configuracoes/*`, `/aparencia`), “Hoje” no lugar de “Operação”; edição de produto progressiva com proteção de saída; pedidos com próximo passo e visões rápidas | operação 390 `11-painel-operacao-390.png` (commit `240694e`) → [hoje](evidencias/evolucao-ux/painel-hoje-390.jpg), [entregas](evidencias/evolucao-ux/painel-entregas-390.jpg); produto `06-painel-produto-editar-390.png` (commit `240694e`) → [produto](evidencias/evolucao-ux/painel-produto-editar-390.jpg); pedidos `08-painel-pedidos-390.png` (commit `240694e`) → [pedidos](evidencias/evolucao-ux/painel-pedidos-390.jpg) |
| 4.3 Linguagem e escopo da busca | Sem “SIMULATED”, “MFA”, “Hostname” nem legenda repetida; busca diz o que cobre (“Buscar em 12 produtos”; no limite, “primeiros 100 (A–Z)” + aviso) | [busca no limite](evidencias/evolucao-ux/painel-busca-limite-390.jpg), [segurança](evidencias/evolucao-ux/painel-seguranca-390.jpg) |
| 4.4 Identidade da loja e casos-limite | Três modelos com composição própria; fotos CC0 com origem registrada; loja vazia, de um produto (destaque), de dois produtos, sem foto, título longo, PNG transparente e foto de 240 px | vitrine antiga 1440 `14-vitrine-inicio-1440.png` (commit `240694e`) → [Editorial](evidencias/evolucao-ux/loja-editorial-1440.jpg), [Essencial](evidencias/evolucao-ux/loja-essencial-1440.jpg), [Ateliê](evidencias/evolucao-ux/loja-atelie-1440.jpg); [vazia](evidencias/evolucao-ux/loja-caso-vazia-390.jpg), [um produto](evidencias/evolucao-ux/loja-caso-um-1440.jpg), [cor clara](evidencias/evolucao-ux/loja-caso-contraste-390.jpg) |
| 4.5 Envio de imagens, menu e estados | Envio em português com estados reais (conferindo, fila, enviando %, processando, pronta, erro com recuperação); menu e rodapé por destinos escolhidos em listas, reordenáveis sem arrastar; estados de foco, desabilitado, salvo, não salvo e conflito | [envios](evidencias/evolucao-ux/painel-imagens-envios-1440.jpg), [menu](evidencias/evolucao-ux/painel-aparencia-menu-1440.jpg), [editor](evidencias/evolucao-ux/painel-aparencia-1440.jpg) |

### 10.2 Personalização: como usar e o que é persistido

1. Painel → **Loja → Aparência**. Escolher um **modelo** (a prévia muda antes de aplicar; textos, imagens, menu, páginas e cor são preservados; usar as seções sugeridas é opcional).
2. **Identidade:** nome, descrição, logo, cor (com explicação quando a loja usa uma versão ajustada para contraste), fonte dos títulos, formato dos botões. **Layout e fotos:** largura, densidade, proporção e enquadramento.
3. **Página inicial:** adicionar, editar, ocultar, duplicar, remover e reordenar seções (destaque, produtos, categorias, imagem com texto, texto). **Menu / Rodapé:** links por destino (início, catálogo, categoria, produto, página, carrinho, atendimento, site externo `https://`). **Páginas da loja.**
4. **Prévia** ao vivo em Celular (390 px) e Computador (1280 px reduzido), com o mesmo componente da loja pública.
5. **Salvar rascunho** grava no servidor (sobrevive a recarregar e a outra sessão; se outra sessão salvou antes, nada é sobrescrito). **Publicar** publica exatamente o rascunho da tela. **Histórico:** trazer a versão publicada de volta para o rascunho ou republicar uma das últimas 10 publicações.

Persistido no servidor: tudo acima (tema v2, `theme_revisions` imutáveis + `theme_media`). Publicado: só o que passou por “Publicar”. Restaurável: a publicada (para o rascunho) e as 10 últimas publicações (republicar). Não persistido: a escolha Celular/Computador e o modo Editar/Prévia.

### 10.3 Telas e interações realmente inspecionadas

- Capturas examinadas por mim (rodadas b1–b4, 68 capturas cada, 390 e 1440): as três lojas (início, catálogo, produto, sem foto, esgotado), os três casos-limite e 17 telas do painel. Problemas vistos e corrigidos: imagem do bloco “imagem com texto” alta demais no Ateliê; blocos recolhíveis da página do produto sem seta e com vão; produto sem foto com quadro enorme; galeria mais estreita que a coluna; loja com um produto com grade quase vazia; filtros do catálogo desalinhados no desktop; **prévia do editor escondida no desktop** (regra do modo celular vencia por especificidade) e **bloqueada pelo `X-Frame-Options: DENY`**; prévia “Computador” mostrando o layout de celular; mensagem de conflito duplicada; pedidos com “SIMULATED” e conta de pagamento antes da lista; loja sem pedidos mostrando filtros inúteis; PNG “transparente” que tinha o quadriculado desenhado na imagem.
- Interações automatizadas e conferidas (`scripts/ux-checks.mjs`, rodada c2): menu por teclado, edição com erro e proteção de saída, busca no limite (101 produtos), envio válido e inválido, menu criado/reordenado/salvo/reaberto, 9 telas em 320 e 640 px, resumo do checkout até a revisão (sem confirmar).
- Testes de ponta a ponta do tema (`tests/theme.test.mjs`): duas sessões, publicação exata, histórico, isolamento, cor clara, editor em 390/1440.

### 10.4 Testes e verificador

Verificador oficial `node scripts/verify.mjs --phase=7` no commit `17383a9` (04/10/2026, início 03:09 UTC, ~11 min): **código 2** — as **18 etapas locais aprovadas** (contrato de evidências, preparação isolada, build Node LTS, migrações/S3/saúde, tipos, núcleo transacional com worker parado, worker real com interface e T27, fase 2 com T22/T23/T37 e Playwright, **tema v2** — `theme-schema` + `theme` com 7/7 —, regressões da fundação, logs sanitizados, persistência S3, CLI do operador, backup, fatos após o backup, restore, conferências após restore, PITR). O código 2 vem só das pendências **externas** que a regra do projeto exige (Mercado Pago, domínio HTTPS, e-mail, backup externo, operação, piloto real, decisões comerciais, IA real). Evidência: [`docs/execucao/evidencias/fase-7/verification.json`](../execucao/evidencias/fase-7/verification.json). `worktreeClean: false` porque pastas de ferramentas de terceiros não versionadas (`.claude/`, `.agents/`, `agency-agents/`, `.mcp.json`, `skills-lock.json`) estavam no diretório.

**Primeira execução do dia (commit `50ef541`): código 1.** Parou em `commercial-ui.test.mjs` (390 px): o formulário do desafio de verificação em duas etapas da sessão (`MfaChallenge`) ainda se chamava “Confirmar MFA”, enquanto o teste já usava o nome novo. Corrigido em `17383a9` (mesmo nome nos dois formulários) e reexecutado do zero.

Outras verificações: `npm run typecheck` sem erros; build do web e da API dentro da imagem (etapa “Build em Node LTS”); `node docs/design/verificar.mjs` coerente (51 contrastes, 17 rotas); `node docs/design/tokens-css.mjs --check` em dia; `caddy validate` do `Caddyfile.staging` válido; `node --test tests/theme-schema.test.mjs` no host (4/4); `scripts/ux-checks.mjs` rodada c2 (6/6) + CK-RESUMO; `scripts/design-review.mjs` rodada b4 (68 capturas, rolagem horizontal 0, nenhum erro de console).

### 10.5 Limitações e pendências

- Linhas antigas do ACEITE cujas telas mudaram estão como **“reexecutar”**: `verificar-aceite.mjs` e `verificar-teclado.mjs` foram atualizados, mas não rodaram no ambiente `ecommerce-design-demo` nesta rodada.
- AX01 **parcial**: zoom real do navegador em 200%/400%, percurso completo de Tab nas telas novas e leitor de tela não foram exercitados.
- O estado “Enviando N%” do envio de imagens não foi observado nos testes locais (envio rápido demais); “Tentar de novo” após falha de rede não foi exercitado.
- Na rodada c1, a verificação UX04 falhou uma vez por ler o campo antes da nova renderização; o script passou a esperar o estado do campo e as rodadas seguintes passaram. Registrado para não esconder intermitência.
- As capturas “antes” usam a loja de demonstração antiga; as “depois” usam as lojas de exemplo (conteúdo diferente).
- Sem teste com usuários, sem medição de conversão e sem comparação objetiva com concorrentes.

### 10.6 O que depende de você ou de integração externa

- **Avaliação visual final** dos três modelos, das fotos escolhidas e da hierarquia do painel.
- Nome do produto, logotipo e domínio continuam indefinidos (“Plataforma”).
- Pagamento real (Mercado Pago), e-mail transacional real e domínio público seguem dependentes de homologação externa; tudo aqui usa pagamento **simulado** e dados de teste.

### 10.7 Como iniciar e abrir os três modelos

```bash
docker compose up -d --wait              # projeto de desenvolvimento em http://localhost:3000
node scripts/fixtures/seed-presets.mjs   # seis lojas de exemplo (só se ainda não existirem); acessos em .local/demo-presets.json
```

Abra os endereços `store` de `.local/demo-presets.json` (chaves `editorial`, `essencial`, `atelie`, `vazia`, `um`, `contraste`) — por exemplo `/lojas/atelier-norte-<sufixo>`, `/lojas/essencial-casa-<sufixo>`, `/lojas/barro-e-trama-<sufixo>` — e o editor em `/painel/<tenantId>/aparencia` com a conta correspondente.

## 11. Rodada Compasso: identidade da plataforma e correções de UX (04/10/2026)

Pedido: integrar a direção “Compasso” (nome interno) ao DESIGN.md, corrigir os problemas apontados no painel, no editor, nas lojas e no checkout, e entregar comparações antes/depois com verificação real. Base: commit `9bcc3f2`. Evidências curadas em [`evidencias/compasso-9bcc3f2/`](evidencias/compasso-9bcc3f2/README.md).

### 11.1 Ferramentas: disponíveis × usadas

| Ferramenta | Situação real | Uso |
|---|---|---|
| Skill Frontend Design | disponível | Direção e acabamento do painel e do editor |
| Skill UI/UX Pro Max | disponível; **Python ausente** (o script de busca não roda) | Consulta direta aos CSV, sem instalar nada. Aplicadas: #113 (não cortar texto essencial → títulos de seção em até 2 linhas), #115 (chips que quebram linha), #100 (foco não encoberto → `scroll-padding-bottom` com a barra de salvar), #19 (sem saltos de conteúdo). Paletas sugeridas (vibrantes) recusadas por contrariar a direção |
| Skill Web Design Guidelines | disponível; fonte baixada | Revisão dos arquivos alterados (achados na §11.4) |
| Skill Impeccable | disponível (`.claude/skills/impeccable`) | `context`, contrato de direção em `apps/web/.impeccable/surfaces/apps-web-components-panel.md`, `detect` (só “fonte muito usada”: Fraunces do Ateliê, mantida pela autonomia dos modelos), crítica/acabamento por revisor em rodada limitada; caminho por código (sem geração de imagem). Esta seção faz o papel do registro final (“documentador”) |
| Agentes UI Designer / UX Architect / Brand Guardian | **não existem como tipos de agente** nesta sessão | Dois revisores somente leitura com agente genérico + arquivo de perfil: “acabamento Impeccable” e “UX Architect + Web Interface Guidelines”. Um integrador (esta sessão) editou; revisores não editaram arquivos |
| Playwright MCP | **não carregado** nesta sessão (nenhuma ferramenta `playwright` disponível) | Alternativa declarada: Playwright do contêiner `tests` (`capture-pages.mjs`, `ux-checks.mjs`, `zoom-check.mjs`) |
| Figma | não usado (opcional) | — |

### 11.2 Problema → mudança

| Área | Problema | Mudança |
|---|---|---|
| Painel | Cinza + cartões brancos; “Recebendo pedidos”/“Pagamentos simulados” repetidos no topo e na lateral | Lateral `canvas` 224 px, plano branco, seções por divisórias, sem barra de topo no desktop; estado só no bloco da loja; títulos em Manrope; seleção #EEF2FF/azul (D-31, D-32) |
| Catálogo | Primeiro produto baixo no celular; faixa de preço espremia o nome | Linhas com miniatura de 56 px, nome inteiro e preço/saldo em linha própria; desktop em tabela de 72 px com linha clicável e preço à direita; 1º produto a y = 300 px em 390×844. Sem paginação, lote ou busca global inventados |
| Edição de produto | Vazios; galeria e envio pouco claros; atalhos que “não faziam nada” | Coluna de Imagens fixa (capa grande + grade, “N imagens · até 10”, envio compacto); “Ajustar estoque”/“Editar nas variações” rolam até o bloco e levam o foco; barra de salvar fixa só com alterações; “Vincular de novo” se o vínculo da imagem falhar; reutilizar imagem mostra onde ela já é usada |
| Mídia | Reordenar/remover pedidos | **Não implementado** (D-36): `product_media` sem coluna de posição (ordem = `order by id`), papel da aplicação sem `DELETE`, só rota de vincular. A tela diz isso em texto, sem controles falsos |
| Editor | Modelos sempre abertos; títulos de seção cortados; prévia pequena sem escala; “Publicar” sempre ativo | Trilho com modelo atual + “Trocar modelo” sob demanda (miniaturas comparáveis); partes da loja no trilho e propriedades de uma parte por vez; títulos em até 2 linhas; seções em linhas divididas; “Largura de 1280 px, em N%” + “Ampliar prévia” (43% → 90% em 1440); “No ar, sem alterações pendentes” desabilita Publicar; “Salvando…”/“Publicando…”; campo hexadecimal digitável; contorno da seção sem rolar a cada tecla; celular com “Editar/Prévia” (`aria-pressed`) e “Aplicar/Cancelar” dentro da Prévia. Rascunho, publicação exata, restaurar e proteção ao sair inalterados (D-33) |
| Ateliê | Foto de “Como fazemos” sem relação com o texto | Foto CC0 de peças queimadas em lote |
| Editorial | Abertura com close de orelha; depois, foto de rua dominada por um drinque | Foto CC0 de bolsa/pasta de couro (StockSnap, Snufkin); texto em faixa à direita sobre o tecido liso no desktop e **abaixo** da foto no celular. Origem só em 960 px: no desktop largo a foto fica levemente suave (pendência) |
| Essencial | Busca e categorias pouco comerciais; fotos pequenas em molduras; categorias em meia largura e alturas diferentes | Busca larga no cabeçalho; categorias em blocos de mesma altura na largura toda (e no menu); grade sem cartões com a foto ocupando o lado maior do palco. Sem banners nem métricas |
| Checkout | Bloco de item alto; rótulos de entrega vagos; rodapé completo durante a compra; foco voltava ao topo | Miniatura + nome + total na linha; quantidade −/+ que grava na hora (campo digitável) e “Remover” na mesma linha; entrega/pagamento em linhas divididas; endereço CEP → rua → número → complemento → cidade/UF; foco no título da etapa nova; rodapé compacto. Idempotência, “Não sabemos se a compra foi registrada” e recálculo inalterados |
| Pedidos | Cartões de ~200 px no celular; só “Nº” clicável; visões interceptavam o clique | Cartão compacto (Nº + total, próximo passo, situação + data); linha inteira abre o pedido; visões são links reais (Ctrl/clique do meio funcionam) |
| Hoje | “Tudo em dia” com pedidos pagos esperando envio | “Sem alertas” + atalho “Ver pedidos pagos a enviar” (a API de situação não conta a fila; nenhum número inventado) |
| Administração | “Sair da administração” não saía; mensagem de MFA sem saída | “Voltar às suas lojas”; texto condicional com link |

### 11.3 Lotes

- **A:** linha de base (`compasso-antes`, 94 capturas), catálogo, produto e editor no desktop/celular; inspeção antes de propagar (`compasso-a1`).
- **B:** propagação para todas as rotas do inventário de `capture-pages.mjs` (acesso, painel, configurações ×6, administração, prévia, vitrine e as seis lojas de exemplo) — `compasso-b1`/`compasso-depois`.
- **C:** revisão por dois revisores, correções em um lote, recaptura (`compasso-r2`, 94 + 24 limites), zoom real, verificações e documentação.

### 11.4 Revisão: achados e destino

Revisor de acabamento (veredito “corrigir”) e revisor de UX + Web Interface Guidelines. **Corrigidos:** palco do Essencial, foto do Editorial, rótulos/ordem/foco do checkout, bloco do item, “Últimas 1 unidades” → “Última unidade”, seções e modelo sem caixa dentro de caixa, captura da troca de modelo, vazios e barra de salvar da edição, “Hoje”, prévia pequena, estado de publicação, campo hexadecimal, rolagem da prévia a cada tecla, `summary` que esvaziava a coluna pelo teclado, rádios sem `name`, `tablist` sem painéis, nomes repetidos (“Usar esta imagem”, “Adicionar”), foco do trilho, `sessionStorage` lido na renderização (divergência de hidratação), busca que podia apagar teclas, link do carrinho sem nome no celular, categorias desiguais, `.thumb` duplicado, `overscroll-behavior` do menu, `touch-action`, `aria-label` que não continha o texto visível, cliques do meio nas visões de pedidos, rótulos de grupo da navegação como `h2` antes do `h1` (ids com espaço), slug colado à borda, contraste da seta das linhas. **Não corrigidos (pendências):** mostrar só os modos de entrega que a loja oferece (a API pública não expõe isso; exige mudança de API), barra fixa de salvar no editor celular, imagem repetida na loja de um produto só, rodapé no fim da página em telas curtas, largura do logo (sem dimensão conhecida), placeholder com exemplo de SKU.

### 11.5 Verificações (resultados reais)

- **Verificador oficial** `node scripts/verify.mjs --phase=7` (05/10/2026, início 02:50 UTC, árvore de trabalho sobre `9bcc3f2` com as mudanças desta rodada): **código 2 com as 18 etapas locais aprovadas** (build Node LTS, tipos, núcleo transacional, worker real com interface e T27, fase 2 com Playwright, **tema v2 e editor em 390/1440**, regressões, logs, S3, CLI, backup, restore, PITR). O 2 vem só das homologações externas (Mercado Pago e demais). Execuções anteriores: uma interrompida por mim para aplicar a correção da faixa lateral (sem resultado); uma com **código 1**: `tests/theme.test.mjs` exigia a prévia em x > 600 px (posição do layout antigo, controles à esquerda); no espaço de trabalho a prévia fica na coluna central (x = 529). A asserção passou a exigir a intenção — prévia e campo “Nome da loja” visíveis ao mesmo tempo, lado a lado e sem sobreposição — e o seletor do modo passou de `tab` para botão com `aria-pressed`. Nenhum teste removido, nenhum limite aumentado.
- Tipos do web (`tsc --noEmit`) sem erros; `node docs/design/verificar.mjs` coerente (52 contrastes, 17 rotas); `node docs/design/tokens-css.mjs --check` em dia; `node --test docs/design/tokens-css.test.mjs` 8/8.
- `scripts/ux-checks.mjs` (rodada `compasso-r2`, projeto de desenvolvimento): UX02, UX04, UX06, UI02, AX01 e CK-RESUMO aprovados; UI01 falhou só pelo seletor antigo (“Tirar contrato.pdf da lista”; o nome acessível passou a conter o texto visível, “Tirar da lista contrato.pdf”) e passou após atualizar o seletor (`compasso-r2-ui01`).
- **Zoom real** (`scripts/zoom-check.mjs`, Chromium completo com a extensão `zoom-ext`, janela de 1280 px): 200% (largura CSS 640) e 400% (largura CSS 320) em painel-produtos, painel-produto, painel-aparência, painel-pedidos, loja Essencial, produto e carrinho — rolagem horizontal 0 px, título visível, sem erros de página (`compasso-zoom` antes do lote de correções e `compasso-r2-zoom` depois). A primeira tentativa falhou porque o `chromium-headless-shell` não carrega extensões; resolvido com o canal `chromium`.
- **Capturas:** `compasso-r2` com 94 telas (1440×900 e 390×844) e `compasso-r2-limites` com 24 (768 e 320): 0 erros, rolagem horizontal 0 px; 1º produto do catálogo a y = 300 px em 390×844. `compasso-r3` (carrinho e editor) depois da 2ª rodada de veredito.
- **Imagens examinadas** nesta rodada: catálogo, edição de produto, aparência (padrão, modelos, ampliada, celular), pedidos 390, carrinho 390 (r2 e r3), Essencial início 1440, Editorial início 1440/390 (duas fotos), zoom 400% de produtos.
- **2ª rodada de veredito** (revisor de acabamento): itens 1, 2 e 4–8 resolvidos; a regressão apontada (faixa lateral de 3 px na opção de entrega escolhida) virou fundo + contorno de 1 px, e o passo concluído do checkout ganhou ✓. Ficaram abertos: o título “Seu carrinho” durante a etapa Entrega (mantido porque os roteiros de aceite esperam esse título) e a Transportadora exibida mesmo quando a loja não oferece (depende da API).

### 11.6 Pendências reais

- **Aprovação visual humana** desta rodada (não houve).
- Reordenar/remover imagens do produto (D-36) e modos de entrega por loja no checkout: exigem mudança de API/banco.
- Foto de abertura do Editorial com origem de 960 px (suave em telas largas); trocar por foto CC0 de maior resolução quando houver.
- Leitor de tela não foi exercitado; percurso completo de Tab só nas telas cobertas por `ux-checks.mjs`/`verificar-teclado.mjs`.
- `verificar-aceite.mjs`/`verificar-teclado.mjs` (ambiente `ecommerce-design-demo`) não rodaram nesta rodada; o seletor do carrinho em `verificar-aceite.mjs` foi atualizado para o novo controle de quantidade.
- Integrações continuam **simuladas**: pagamento (Mercado Pago aguarda homologação), e-mail transacional e domínio público. Nada foi publicado em lojas reais; temas foram publicados só nas lojas de teste.
