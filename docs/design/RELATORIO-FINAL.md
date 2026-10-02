# Relatório final — implementação do redesign (prompt 2)

**Data:** 02/10/2026 · **Branch:** `claude/gallant-fermat-6x20fs` · **Base:** `831d9a2` (materiais de design sobre o commit de produto `0179f4d`)
**Commits desta entrega:** `f4e5e5e` (lote A), `d445f81` (lote B), `6160a61` (lote C), `1500fbb` e `2a6531e` (correções encontradas na verificação) e o commit de documentação que acompanha este relatório.

> Este redesign **não** torna o sistema pronto para produção. Pagamentos seguem SIMULADOS, a devolução continua orientada no provedor, e não houve aprovação visual do responsável nem auditoria de acessibilidade com leitor de tela.

## 1. Situação em três eixos

| Eixo | Situação | Base |
|---|---|---|
| **Implementação** | Concluída nos três lotes (A, B, C); rotas R01–R14 redesenhadas, nenhuma rota nova de servidor, nenhuma regra de negócio ou resposta de API alterada | §2–§3 |
| **Funcional** | Suítes de UI aprovadas, com uma falha **preexistente** (T23); typecheck de todos os workspaces e build aprovados; 24 verificações extras de aceite e 12 de teclado aprovadas | §4 |
| **Visual** | Capturas reais em 390/768/1440, 320 px e zoom de 200%, examinadas por mim; 88 critérios do ACEITE preenchidos (57 aprovados, 7 aprovados parcialmente ou com ressalva, 11 parciais, 1 alterado por decisão, 12 sem execução). **Aprovação visual do responsável: pendente** | §5, [ACEITE.md](ACEITE.md) |

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
- Fotos fora da proporção do tema ganham faixas neutras grandes na moldura 4:5 (sem corte nem distorção, por decisão D-16). Convém orientar o lojista a enviar na proporção do tema ou permitir escolher a proporção.
- No preview, links de produto e do menu apontam para `/lojas/preview/…` e dão 404 (comportamento anterior mantido).
- O 409 do cadastro de produto não distingue endereço de SKU; o erro fica no resumo do formulário, não no campo.
- “Pagamento indisponível” depende de um sinal global (simulação desligada no ambiente); uma loja sem conta conectada só descobre na confirmação. Corrigir pede mudança de API — fora do redesign.
- No celular o resumo do pedido fica depois da etapa atual (D-17); o critério A-R12-07, que pedia o resumo antes, foi registrado como “alterado”.
- Doze cenários do ACEITE sem evidência: A-R01-03, A-R01-05, A-R02-06, A-R02-10, A-R02-12, A-R03-02, A-R03-05, A-R03-10, A-R04-04, A-R05-06, A-R08-04, A-R13-05.
- Sem leitor de tela real e sem auditoria completa de acessibilidade; nenhuma declaração de conformidade WCAG.
- Checkout continua sem bairro, telefone ou CPF (decisão de produto, não alterada).
- T23 (upload de 10 MB via proxy do Next) segue falhando e não pertence a este trabalho.

## 7. Como reproduzir

1. Subir o ambiente local (README/`compose.yaml`), criar dados com `node scripts/seed.mjs --local` e os dados de demonstração usados nas capturas (pedidos pendente/pago/recusado/excedente, Funcionário, administrador com MFA) em `.local/demo-ui.json` (fora do git).
2. `node docs/design/capturar-rotas.mjs depois` (+ `--widths=320`, `--widths=1280 --zoom=2`), `node docs/design/verificar-teclado.mjs`, `node docs/design/verificar-aceite.mjs` (altera dados de demonstração).
3. Suítes: `node --test tests/<suíte>.test.mjs` com `BASE_URL` apontando para a web de teste.
