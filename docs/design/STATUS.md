# Status dos materiais de design

**Data:** 03/10/2026 · **Base:** `0179f4d` (produto, fases 0 a 7) + `831d9a2` (materiais) · **Branch:** `claude/gallant-fermat-6x20fs`
**Estado:** redesign **implementado nas rotas reais R01–R14** (lotes A, B e C) + rodada de correções de 03/10. ACEITE: 86 aprovados, 1 reprovado preexistente (G-13), 1 alterado. **Entrega não concluída como um todo** enquanto G-13 (429 do pilot-flow e T23, preexistentes) seguir reprovado — detalhes, resultados e pendências em [RELATORIO-FINAL.md](RELATORIO-FINAL.md); critérios em [ACEITE.md](ACEITE.md). **Não houve aprovação visual do responsável.** O redesign **não** torna o sistema pronto para produção.

## 0. Implementação (prompt 2) — registro de progresso

| Lote | Situação | Verificação |
|---|---|---|
| A — fundamentos, acesso e painel | **Concluído** (tokens gerados em `apps/web/app/style.css`, fonte em `apps/web/app/fonts/`, componentes `components/ui/`, casca `components/panel/Shell.tsx` + `app/painel/[tenantId]/layout.tsx`, R01 e R02) | typecheck/build ok; `foundation.test.mjs` aprovado; `storefront.test.mjs` aprovado exceto T23 (falha preexistente do proxy do Next com upload de 10 MB rejeitado — reproduzida na web da base `831d9a2`); capturas em 390/768/1440 examinadas |
| B — operação e administração | **Concluído** (R03 com filtros na URL e síntese do estado, R04, R05 com `commercial.tsx`/`ai-draft.tsx`, R06 com contexto global) | typecheck/build ok; `purchase-worker`, `pilot-flow` e `commercial-ui` aprovados (seletores de número do pedido e protocolo passaram de botão para link); capturas em 390/768/1440 examinadas |
| C — vitrine e compra | **Concluído** (R07–R14: vitrine com marca por loja, produto com galeria 4:5 sem distorção, checkout em etapas na mesma rota, comprovante, contato; 404 e erro da vitrine) | typecheck/build ok; `storefront` (exceto T23 preexistente), `purchase-worker` e `pilot-flow` aprovados; capturas examinadas |
| Rodada de correções (03/10) | **Concluída** (`ff73c7d` + documentação): checkout sem resposta conclusiva, preview navegável, ambiente reproduzível, texto 200% e lista de pedidos em 768 px (D-22) | `verificar-aceite.mjs` 65/65, `verificar-teclado.mjs` 12/12, rodada do zero; verify continuado: falhas da branch ⊂ falhas da base ([verificação](evidencias/verificacao/LEIA-ME.md)) |
| Verificação final e correções | **Concluído** (`1500fbb` + documentação): login com senha errada, 409 na confirmação, chave de idempotência, nomes acessíveis da administração, estouros em 768/320 px, alvos de 44 px, preview | 5 suítes de UI (T23 preexistente), `verificar-teclado.mjs` 12/12, `verificar-aceite.mjs` 24/24, capturas 390/768/1440 + 320 px + zoom 200% em `evidencias/depois/`; ACEITE preenchido |

Ambiente usado: Postgres 17.9/Redis/SeaweedFS do `compose.yaml` em contêiner; API, worker e web no host com Node 24.21.0; suítes de UI no contêiner oficial `mcr.microsoft.com/playwright:v1.63.0-noble` com `--network host --add-host web:127.0.0.1`. Detalhes no relatório final.

## 1. O que foi preparado

| Arquivo | Conteúdo |
|---|---|
| [`DESIGN.md`](../../DESIGN.md) | Documento central: público, direção, fundamentos, tokens, componentes, navegação, responsividade, conteúdo e rótulos de estado, formulários, vitrine, algoritmo de marca, checkout, acessibilidade, manutenção e decisões D-01…D-10 |
| [`REFERENCIAS.md`](REFERENCIAS.md) | Seis referências com status (todas **não consultadas**: rede bloqueada), princípio e aplicação; distinção entre referência e proposta original |
| [`TELAS-E-FLUXOS.md`](TELAS-E-FLUXOS.md) | Inventário R01–R14 de rotas reais com arquivo, itens previstos/dependentes de integração (P01–P03, I01–I07) e especificação por tela |
| [`tokens.json`](tokens.json) | 79 variáveis (plataforma + loja), algoritmo de marca com 4 exemplos, 38 verificações de contraste |
| [`ACEITE.md`](ACEITE.md) | 15 critérios gerais + 73 cenários por rota, todos “não executado” |
| [`IMPLEMENTACAO.md`](IMPLEMENTACAO.md) | Arquivos a alterar, componentes a reutilizar, riscos R-1…R-11, lotes 1–3 com critério por rota, contrato de seletores dos testes |
| [`preview/index.html`](preview/index.html) + [`preview/styles.css`](preview/styles.css) | Protótipo navegável sem build: fundamentos, componentes e cinco composições (listagem de produtos, edição de produto, detalhe de pedido, produto na vitrine, checkout) |
| [`preview/fonts/`](preview/fonts/) | IBM Plex Sans 400/500/600 Latin-1 (WOFF2) + licença OFL |
| [`preview/capturas/`](preview/capturas/) | 21 capturas JPEG (7 seções × 390/768/1440) do protótipo |
| [`verificar.mjs`](verificar.mjs) | Verificador sem dependências |
| [`capturar-preview.mjs`](capturar-preview.mjs) | Capturas e checagens no navegador (Playwright/Chromium) |
| [`../../CLAUDE.md`](../../CLAUDE.md) | Seção curta apontando para estes documentos (arquivo não existia; AGENTS.md preservado) |

## 2. Decisões principais

- Valores iniciais de cor mantidos: as 38 combinações usadas passam (texto ≥ 4,5:1; controles/foco ≥ 3:1). `border` (1,33:1) fica restrito a separadores decorativos.
- Fonte efetiva: **IBM Plex Sans** (npm `@ibm/plex-sans` 1.1.0, OFL), hospedada; fallback `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Vitrine com tokens próprios (`store.*`); cor do tema passa pelo algoritmo de marca (corrige o uso, não a escolha do lojista).
- `theme.font` afeta só títulos da vitrine; preços e formulários na família principal.
- Checkout continua em `/lojas/[slug]/carrinho`, com etapas visuais; edição de produto continua em `/painel/[tenantId]`.
- Sem biblioteca nova (componentes, ícones, animação).
- Lista completa: DESIGN.md §15.

## 3. Verificações efetuadas

| Verificação | Comando | Resultado |
|---|---|---|
| JSON, contraste, correspondência tokens ↔ CSS, cores literais, IDs e referências do HTML, recursos remotos, valores monetários (formatação, linhas, somas), contraste exibido, links dos documentos, inventário ↔ arquivos ↔ ACEITE ↔ IMPLEMENTACAO | `node docs/design/verificar.mjs` | **Aprovado** (saída 0) |
| Teste de mutação do verificador (total e contraste alterados de propósito) | edição temporária + verificador | Falhas detectadas; arquivo restaurado |
| Renderização em Chromium headless em 390, 768 e 1440 px; rolagem horizontal; fonte carregada; números tabulares; nome acessível de controles; contorno de foco no primeiro Tab; diálogo (foco inicial, Esc, retorno de foco); movimento reduzido | `node docs/design/capturar-preview.mjs` | **Aprovado** após correções; capturas examinadas visualmente |

Problemas encontrados nas capturas e corrigidos: tabela de produtos rolava 44 px na horizontal em 768 px; legenda da tabela virava coluna estreita no celular; células com vários elementos se espalhavam na lista empilhada; estado vazio aparecia sempre (`hidden` vencido por `display:grid`); prefixo “R$” quebrava; e-mail quebrava no resumo do checkout em 390 px; botões “Ações do Dono” colados em 768 px; botão do diálogo da prancha esticado; links de exemplos de marca com cor da plataforma; barra fixa do protótipo encobrindo capturas.

Revisão crítica (registrada):
- **Mesmo produto?** Sim: mesma família, escala, raios, selos e ritmo de legenda + título nas cinco telas; o painel usa `action` e a vitrine usa a cor da loja sobre a mesma base.
- **Autonomia da loja:** a vitrine não mostra cor nem nome da Plataforma; o link “Painel” sai do menu público (D-08). Fonte de título e cor vêm do tema.
- **Ação principal evidente:** uma por área (Novo produto, Salvar informações, próxima ação de expedição, Adicionar ao carrinho, Confirmar compra de R$ X). No pedido com excedente a ação principal fica bloqueada com motivo — intencional.
- **Formulários preservam contexto:** erro junto ao campo + resumo; dados mantidos; etapas concluídas do checkout viram resumos com “Alterar”.
- **Sem enfeite:** nenhum gráfico ou card de métrica fictício; superfícies só onde há área de trabalho.
- Ponto em aberto: no celular, a seção lateral “Publicação” da edição de produto fica no fim da página; o status também aparece no cabeçalho. Avaliar na implementação se o seletor de status deve subir.

## 4. Limitações do ambiente e pendências reais

- **Rede:** o proxy bloqueou (403) `shopify.dev`, `www.carbondesignsystem.com`, `hydrogen.shop`, `baymard.com`, `www.radix-ui.com`, `www.w3.org`. Nenhuma referência foi consultada; nenhuma observação visual externa foi feita. Para consultar, liberar os domínios em *Network access* do ambiente.
- **Georgia** não existe no Linux do ambiente: a opção “Serifada” foi renderizada com a serifada do sistema.
- **Acessibilidade:** verificações automatizadas e inspeção do protótipo; sem leitor de tela real e sem auditoria completa. Não há declaração de conformidade WCAG.
- Rotas reais renderizadas e testadas no prompt 2 (ver RELATORIO-FINAL.md §4–§5). Nenhum cenário do ACEITE sem evidência; parciais e reprovado preexistente no relatório, §1 e §8.
- **Digest das fontes:** `scripts/verify.mjs` calcula hash de todo o repositório (exceto `docs/execucao/`); estes arquivos novos mudam o digest. As evidências das fases continuam válidas para o commit que testaram; nova execução gera nova evidência.
- **Decisão de produto pendente (não resolvida aqui):** o checkout não pede bairro, telefone nem documento. Incluir algum deles muda o contrato do pedido e exige decisão do responsável — fora do redesign.
- **Aprovação visual do responsável:** pendente.

## 5. Próximos passos sugeridos

1. Revisão visual do responsável sobre [`evidencias/depois/`](evidencias/depois/) comparando com [`evidencias/antes/`](evidencias/antes/).
2. Resolver G-13 (429 do pilot-flow e T23, preexistentes; tarefas separadas).
3. Decidir as pendências de produto listadas no RELATORIO-FINAL.md §6 (proporção de foto por loja, links do preview, distinção endereço/SKU no 409, sinal de pagamento por loja, campos do checkout).
4. Teste com leitor de tela real.
