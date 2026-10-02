# Matriz de aceite da interface

Usada no prompt 2 (implementação) e em toda mudança visual posterior. Cada linha é verificável por teste automatizado (Playwright), verificador de tokens ou inspeção manual registrada. **Resultado** e **Evidência** começam como “não executado”; preencher com `aprovado`/`reprovado`/`não aplicável` + data, ambiente, comando ou captura. Teste automatizado aprovado não equivale a conformidade total com WCAG.

Larguras padrão: **390**, **768** e **1440** px (altura 900). “Teclado” = navegação só com Tab/Shift+Tab/Enter/Espaço/Esc. Rotas e telas: [TELAS-E-FLUXOS.md](TELAS-E-FLUXOS.md). Lote de cada rota: [IMPLEMENTACAO.md](IMPLEMENTACAO.md).

## 1. Critérios gerais (todas as rotas do escopo)

| ID | Cenário | Como verificar | Esperado | Resultado | Evidência |
|---|---|---|---|---|---|
| G-01 | Tokens e CSS correspondem | `node docs/design/verificar.mjs` (estendido a `apps/web/app/style.css`) | Saída 0; nenhuma cor literal fora de `:root` | não executado | não executado |
| G-02 | Contraste das combinações usadas | verificador + inspeção de novos pares | Texto ≥ 4,5:1; componentes, foco e estados ≥ 3:1 | não executado | não executado |
| G-03 | Sem rolagem horizontal da página | Playwright: `scrollWidth ≤ innerWidth` em 390/768/1440 | Nenhuma rota rola na horizontal | não executado | não executado |
| G-04 | Reflow e zoom | 320 px CSS e zoom 200% em 1280 px | Conteúdo e ações acessíveis sem perda | não executado | não executado |
| G-05 | Foco visível | Tab pela página; captura do elemento focado | Contorno 2 px `focus` com afastamento; não encoberto pelo topo | não executado | não executado |
| G-06 | Ordem de teclado | Tab do início ao fim | Ordem segue a leitura; sem armadilha; “Ir para o conteúdo” primeiro | não executado | não executado |
| G-07 | Nome acessível de controles | Playwright: todo input/select/textarea/button tem nome | Nenhum controle sem nome | não executado | não executado |
| G-08 | Estado não depende só de cor | Inspeção dos selos/alertas | Todo estado tem texto; forma do marcador conforme DESIGN §6 | não executado | não executado |
| G-09 | Movimento reduzido | Playwright `reducedMotion: 'reduce'` | Transições/animações ≤ 0,01 ms | não executado | não executado |
| G-10 | Fonte e números | `document.fonts.check('16px "IBM Plex Sans"')`; larguras de “111,11” e “888,88” | Fonte local carregada (ou fallback documentado); números tabulares | não executado | não executado |
| G-11 | Dinheiro sem ponto flutuante | Revisão de código: `money()`/conversão de string em centavos | Nenhum `Number`/`parseFloat` em valor monetário | não executado | não executado |
| G-12 | Honestidade de ambiente | Painel e checkout com conta SIMULADA | “Pagamentos simulados”/“SIMULADO” visível; nenhuma confirmação financeira sem `PAID` | não executado | não executado |
| G-13 | Regressão de testes | `node scripts/verify.mjs --phase=7` (ou fase vigente) | Suítes de UI existentes passam com seletores preservados ou atualizados no mesmo commit | não executado | não executado |
| G-14 | Isolamento entre lojas na interface | Playwright com duas lojas (Loja A/Loja B) | Painel/vitrine de A nunca exibe dados de B; trocar loja limpa estado anterior | não executado | não executado |
| G-15 | Mensagens de estado | Ações com sucesso/erro | Sucesso em `role="status"`, erro em `role="alert"`, sem mover foco indevidamente | não executado | não executado |

## 2. Por rota

| ID | Rota | Cenário | Larguras | Como verificar | Esperado | Resultado | Evidência |
|---|---|---|---|---|---|---|---|
| A-R01-01 | R01 `/` | Entrar com credenciais válidas | 390, 1440 | Teclado: preencher e Enter | Lista “Suas lojas”; foco no título | não executado | não executado |
| A-R01-02 | R01 `/` | Credenciais inválidas | 390 | Enviar senha errada | Erro junto ao formulário, e-mail preservado | não executado | não executado |
| A-R01-03 | R01 `/` | Carregando sessão / API fora | 1440 | Atrasar/derrubar API | “Carregando…” e depois “Não foi possível conectar à API” | não executado | não executado |
| A-R01-04 | R01 `/` | Nenhuma loja vinculada | 390, 768 | Usuário novo | Estado vazio com “Criar loja” e “Aceitar convite”; próximos passos P01 após criar | não executado | não executado |
| A-R01-05 | R01 `/` | Funcionário vê configuração | 1440 | Entrar como Funcionário | Campos somente leitura com explicação; sem equipe | não executado | não executado |
| A-R01-06 | R01 `/` | Revogar todas as sessões | 1440 | Teclado: abrir diálogo, Esc, reabrir, confirmar | Diálogo com foco inicial e retorno; sessão encerrada após confirmar | não executado | não executado |
| A-R01-07 | R01 `/` | Nome de loja longo (100 caracteres) | 390 | Criar loja com nome longo | Quebra de linha sem estouro | não executado | não executado |
| A-R02-01 | R02 `/painel/[tenantId]` | Casca do painel e contexto | 390, 768, 1440 | Capturas | Lateral ≥ 1024; faixa com todos os itens < 1024; loja e papel visíveis | não executado | não executado |
| A-R02-02 | R02 `/painel/[tenantId]` | Listagem de produtos | 768, 1440 | Capturas + tabela | Colunas Produto, Status, Variações, Disponível, Preço, ação; números à direita | não executado | não executado |
| A-R02-03 | R02 `/painel/[tenantId]` | Listagem no celular | 390 | Captura | Lista empilhada com rótulos; sem rolagem horizontal | não executado | não executado |
| A-R02-04 | R02 `/painel/[tenantId]` | Catálogo vazio | 1440 | Loja nova | Vazio com “Cadastrar primeiro produto” | não executado | não executado |
| A-R02-05 | R02 `/painel/[tenantId]` | Busca local sem resultado | 1440 | Buscar termo inexistente | “Nenhum produto corresponde à busca” + limpar; contagem atualizada em `role="status"` | não executado | não executado |
| A-R02-06 | R02 `/painel/[tenantId]` | Carregando catálogo | 1440 | Atrasar API | Texto “Carregando dados autorizados…”; casca visível | não executado | não executado |
| A-R02-07 | R02 `/painel/[tenantId]` | SKU duplicado (409) | 390, 1440 | Criar variação com SKU existente | Erro junto ao SKU + resumo; demais campos preservados; foco no resumo | não executado | não executado |
| A-R02-08 | R02 `/painel/[tenantId]` | Preço em reais → centavos | 1440 | Digitar `1.234,56` e `64,9` | Envia `"123456"` e `"6490"`; recusa `12,345` | não executado | não executado |
| A-R02-09 | R02 `/painel/[tenantId]` | Produto sem foto e mídia processando | 1440 | Produto sem imagem; upload em andamento | Placeholder “Sem foto”; estado “Processando” e depois “Pronta” | não executado | não executado |
| A-R02-10 | R02 `/painel/[tenantId]` | Ajuste que deixa saldo < reservado | 1440 | Delta negativo grande | Erro “Saldo insuficiente.” junto à quantidade | não executado | não executado |
| A-R02-11 | R02 `/painel/[tenantId]` | Funcionário em fornecedor/tema/frete | 1440 | Entrar como Funcionário | Seções do Dono ausentes ou desabilitadas com motivo | não executado | não executado |
| A-R02-12 | R02 `/painel/[tenantId]` | Publicar tema | 1440 | Teclado: salvar rascunho → preview → publicar | Status de sucesso; falha preserva publicação anterior com mensagem | não executado | não executado |
| A-R02-13 | R02 `/painel/[tenantId]` | Cor de marca de baixo contraste | 1440 | Escolher #F2C94C no tema | Prévia mostra ajuste e explicação; escolha não bloqueada | não executado | não executado |
| A-R02-14 | R02 `/painel/[tenantId]` | Nome de produto longo e 100 produtos | 390, 1440 | Dados sintéticos | Quebra correta; rodapé “Mostrando 100 de 100 · limite atual” | não executado | não executado |
| A-R03-01 | R03 `/painel/[tenantId]/pedidos` | Lista com filtros do servidor | 768, 1440 | Aplicar filtros e “somente com pendências” | Resultado e contagem; filtros mantidos ao abrir/voltar | não executado | não executado |
| A-R03-02 | R03 `/painel/[tenantId]/pedidos` | Nenhum pedido / filtro vazio | 390 | Loja sem pedidos; filtro sem resultado | Vazios distintos | não executado | não executado |
| A-R03-03 | R03 `/painel/[tenantId]/pedidos` | Pagamento aguardando | 1440 | Pedido PENDING | Selo “Aguardando confirmação” (pendente), nunca sucesso | não executado | não executado |
| A-R03-04 | R03 `/painel/[tenantId]/pedidos` | Excedente / devolução pendente | 390, 1440 | Pedido com EXCESS_PAYMENT (T16) | FinancialAlert com valor; total recebido/devolvido/a devolver coerentes; expedição bloqueada com motivo | não executado | não executado |
| A-R03-05 | R03 `/painel/[tenantId]/pedidos` | Resultado desconhecido | 1440 | Tentativa UNKNOWN | “Resultado em verificação”; sem ação de nova cobrança | não executado | não executado |
| A-R03-06 | R03 `/painel/[tenantId]/pedidos` | Fluxo de expedição | 1440 | Teclado: separar → enviar → entregar; e retirada | Uma ação principal por vez; mensagens de status | não executado | não executado |
| A-R03-07 | R03 `/painel/[tenantId]/pedidos` | Cancelar pedido (Dono) | 1440 | Teclado no diálogo | Motivo obrigatório; texto sobre devolução pendente; foco retorna | não executado | não executado |
| A-R03-08 | R03 `/painel/[tenantId]/pedidos` | Funcionário | 1440 | Entrar como Funcionário | Sem cancelar/anotar/realocar/privacidade/conta | não executado | não executado |
| A-R03-09 | R03 `/painel/[tenantId]/pedidos` | Detalhe no celular | 390 | Captura | Coluna única; itens empilhados; totais legíveis | não executado | não executado |
| A-R03-10 | R03 `/painel/[tenantId]/pedidos` | Comprador anonimizado e endereço longo | 1440 | Dados sintéticos | Textos quebram; dados anonimizados indicados | não executado | não executado |
| A-R04-01 | R04 `/painel/[tenantId]/atendimento` | Abertos/atrasados/todos | 390, 1440 | Alternar filtro | `aria-pressed`; atrasado com selo de ação e texto | não executado | não executado |
| A-R04-02 | R04 `/painel/[tenantId]/atendimento` | Comunicação financeira pendente | 1440 | Arrependimento de pedido pago | Bloco antes da resposta; só Dono registra | não executado | não executado |
| A-R04-03 | R04 `/painel/[tenantId]/atendimento` | Responder e concluir | 1440 | Teclado | Mensagem enviada; formulário limpo; concluído somente leitura | não executado | não executado |
| A-R04-04 | R04 `/painel/[tenantId]/atendimento` | Nenhum protocolo / mensagem longa | 390 | Dados sintéticos | Vazio explicado; mensagem com quebra de linha preservada | não executado | não executado |
| A-R05-01 | R05 `/painel/[tenantId]/operacao` | Alertas | 390, 1440 | Loja com e sem alertas | Lista com instrução por código; sem alertas = sucesso | não executado | não executado |
| A-R05-02 | R05 `/painel/[tenantId]/operacao` | Pausar/retomar vendas | 1440 | Teclado | Motivo obrigatório; estado no topo atualizado | não executado | não executado |
| A-R05-03 | R05 `/painel/[tenantId]/operacao` | MFA | 390, 1440 | Configurar e confirmar | Chave e códigos de recuperação com aviso “exibidos uma vez” | não executado | não executado |
| A-R05-04 | R05 `/painel/[tenantId]/operacao` | Domínio em cada estado | 1440 | Cadastrar/verificar/remover | Rótulos da DESIGN §8.2; TXT legível e copiável; remoção em diálogo | não executado | não executado |
| A-R05-05 | R05 `/painel/[tenantId]/operacao` | Plano/faturas sem plano publicado | 1440 | Ambiente atual | “Nenhum plano pago publicado… (D07)” | não executado | não executado |
| A-R05-06 | R05 `/painel/[tenantId]/operacao` | IA desligada e incerta | 1440 | Plataforma desligada; geração UNKNOWN | Mensagens existentes preservadas | não executado | não executado |
| A-R06-01 | R06 `/plataforma` | Contexto global | 390, 1440 | Captura | Faixa `context-global` sempre visível | não executado | não executado |
| A-R06-02 | R06 `/plataforma` | MFA pendente | 1440 | Sessão sem MFA confirmado | Só o formulário de MFA; nada da lista | não executado | não executado |
| A-R06-03 | R06 `/plataforma` | Consultar loja com motivo | 1440 | Teclado no diálogo | Bloco “Inspecionando” com horário e motivo; dados estruturados | não executado | não executado |
| A-R06-04 | R06 `/plataforma` | Suspender/reativar | 1440 | Diálogo | Motivo obrigatório; auditoria lista a ação | não executado | não executado |
| A-R06-05 | R06 `/plataforma` | Tabela de lojas no celular | 390 | Captura | Lista empilhada legível | não executado | não executado |
| A-R07-01 | R07 `/preview/[tenantId]` | Aviso de preview | 390, 1440 | Abrir preview | Faixa “Preview privado do rascunho”; carrinho indisponível | não executado | não executado |
| A-R07-02 | R07 `/preview/[tenantId]` | Acesso negado | 1440 | Outro usuário | Mensagem + “Entrar no painel” | não executado | não executado |
| A-R08-01 | R08 `/lojas/[slug]` | Grade de produtos | 390, 768, 1440 | Capturas | 2 colunas no celular; imagens 4:5; preços tabulares | não executado | não executado |
| A-R08-02 | R08 `/lojas/[slug]` | Busca sem resultado | 390 | `?q=inexistente` | Mensagem com termo e limpar busca | não executado | não executado |
| A-R08-03 | R08 `/lojas/[slug]` | Marca da loja | 1440 | Lojas A e B com cores diferentes | Cada loja com sua cor; nenhuma cor da plataforma; link “Painel” fora do menu | não executado | não executado |
| A-R08-04 | R08 `/lojas/[slug]` | Loja sem produtos | 1440 | Loja publicada vazia | Estado vazio da vitrine | não executado | não executado |
| A-R09-01 | R09 `/lojas/[slug]/categorias/[categoria]` | Categoria atual | 390, 1440 | Navegar | `aria-current` na categoria; título da categoria | não executado | não executado |
| A-R10-01 | R10 `/lojas/[slug]/produtos/[produto]` | Escolher variação por teclado | 390, 1440 | Setas entre opções | Preço/estoque/SKU atualizam; seleção com borda + ícone | não executado | não executado |
| A-R10-02 | R10 `/lojas/[slug]/produtos/[produto]` | Variação esgotada | 1440 | Variação com saldo 0 | Opção desabilitada com “esgotada” em texto | não executado | não executado |
| A-R10-03 | R10 `/lojas/[slug]/produtos/[produto]` | Adicionar ao carrinho | 390 | Clique/Enter | `role="status"` com “Ver carrinho”; botão desabilitado durante envio | não executado | não executado |
| A-R10-04 | R10 `/lojas/[slug]/produtos/[produto]` | Quantidade acima do saldo | 1440 | Erro do servidor | Erro junto à quantidade | não executado | não executado |
| A-R10-05 | R10 `/lojas/[slug]/produtos/[produto]` | Sem foto e descrição longa | 390 | Dados sintéticos | Placeholder “Sem foto”; texto com quebras preservadas | não executado | não executado |
| A-R11-01 | R11 `/lojas/[slug]/paginas/[pagina]` | Leitura | 390, 1440 | Página longa | Largura de leitura limitada; 404 para inexistente | não executado | não executado |
| A-R12-01 | R12 `/lojas/[slug]/carrinho` | Carrinho vazio | 390 | Sessão nova | “Seu carrinho está vazio” + voltar ao catálogo | não executado | não executado |
| A-R12-02 | R12 `/lojas/[slug]/carrinho` | Etapas completas por teclado | 390, 1440 | Carrinho → entrega → dados → revisão | Etapas indicadas; resumos com “Alterar”; total sempre visível | não executado | não executado |
| A-R12-03 | R12 `/lojas/[slug]/carrinho` | CEP sem atendimento | 390 | CEP 99999999 | Erro junto ao CEP, dados preservados, alternativa de retirada | não executado | não executado |
| A-R12-04 | R12 `/lojas/[slug]/carrinho` | Total mudou (T10) | 1440 | Alterar preço após cotação | Novo total exibido e exigido antes de confirmar | não executado | não executado |
| A-R12-05 | R12 `/lojas/[slug]/carrinho` | Confirmação repetida (T08) | 1440 | Duplo clique / recarregar | Botão desabilitado; mesmo pedido | não executado | não executado |
| A-R12-06 | R12 `/lojas/[slug]/carrinho` | Pagamento indisponível | 1440 | Sem conta conectada | “Pagamento indisponível… Nenhum pedido será criado.” | não executado | não executado |
| A-R12-07 | R12 `/lojas/[slug]/carrinho` | Resumo no celular | 390 | Captura | Resumo antes do formulário, aberto; custos legíveis | não executado | não executado |
| A-R13-01 | R13 `/lojas/[slug]/pedidos/[id]` | Aguardando confirmação | 390, 1440 | Pedido PENDING | Alert pendente; atualização automática; sem “Pago” | não executado | não executado |
| A-R13-02 | R13 `/lojas/[slug]/pedidos/[id]` | Pago e enviado | 1440 | Pedido PAID/SHIPPED | Selos corretos; rastreio legível | não executado | não executado |
| A-R13-03 | R13 `/lojas/[slug]/pedidos/[id]` | Não autorizado | 390 | Sem token | “Pedido não autorizado.” + orientação | não executado | não executado |
| A-R13-04 | R13 `/lojas/[slug]/pedidos/[id]` | Abrir arrependimento | 390 | Teclado | Protocolo imediato com data/prazo; texto “não confirma cancelamento nem devolução” | não executado | não executado |
| A-R13-05 | R13 `/lojas/[slug]/pedidos/[id]` | Loja suspensa | 1440 | Suspender loja | Pedido continua acessível com aviso | não executado | não executado |
| A-R14-01 | R14 `/lojas/[slug]/atendimento` | Contato e código | 390, 1440 | Enviar formulário | Protocolo, código exibido uma vez (copiar), prazo | não executado | não executado |
| A-R14-02 | R14 `/lojas/[slug]/atendimento` | Código inválido / erro de rede | 390 | Consultar com código errado | Erro sem apagar dados | não executado | não executado |
