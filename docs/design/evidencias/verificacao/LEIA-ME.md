# Evidências da verificação por fase (redesign)

Ambiente local de teste, dados sintéticos e pagamentos/IA/DNS **SIMULADOS** (`--externos-simulados`). Nada aqui equivale a homologação real nem a liberação para produção.

## Verify oficial (`scripts/verify.mjs --phase=7 --externos-simulados`)

| Arquivo | Resultado |
|---|---|
| [`fase-7-oficial.json`](fase-7-oficial.json), [`fase-7-oficial.saida.txt`](fase-7-oficial.saida.txt) | **Reprovado na etapa “Build em Node LTS”**: `npm ci` dentro do Docker falha com `SELF_SIGNED_CERT_IN_CHAIN` (o proxy deste ambiente inspeciona TLS). Nenhuma suíte chegou a rodar. Impedimento do ambiente, não do código: o Dockerfile versionado não recebe a CA e o CDN do Playwright e o `apt` estão bloqueados aqui |

## Verify continuado: base × branch, mesmo procedimento

Para comparar mesmo assim, [`preparar-continuada.mjs`](preparar-continuada.mjs) cria uma cópia do commit fora do repositório com três diferenças, todas fora do código testado: (1) CA do proxy nas imagens; (2) estágio `browsers` a partir de `mcr.microsoft.com/playwright:v1.63.0-noble` (mesma versão do lockfile) em vez de `playwright install --with-deps`, testes como UID 1000; (3) etapa reprovada é registrada e a execução continua (o resultado final segue reprovado).

```bash
node docs/design/evidencias/verificacao/preparar-continuada.mjs <commit> ../vc-<commit>
cd ../vc-<commit> && npm ci && node scripts/setup.mjs --test
node scripts/verify-continuada.mjs --phase=7 --externos-simulados   # evidência em docs/execucao/evidencias/fase-7/verification.continuada.simulado.json
# limpeza: docker compose -p ecommerce-phase7-test down -v; git worktree remove --force ../vc-<commit>; rm -r ../vc-<commit>-continuada
```

Executado em 03/10/2026, mesmo host, base primeiro e branch em seguida, com o cache de build e os volumes `ecommerce-phase7-test_*` limpos entre as duas (uma execução anterior da branch rodou com o disco cheio e foi descartada).

| Etapa | Base `831d9a2` ([json](fase-7-continuada-base-831d9a2.json), [saída](fase-7-continuada-base-831d9a2.saida.txt)) | Branch `d2d4742` ([json](fase-7-continuada-branch-d2d4742.json), [saída](fase-7-continuada-branch-d2d4742.saida.txt)) |
|---|---|---|
| Preparação, build, migrations/S3, tipos | aprovado | aprovado |
| Fase 3+4 (núcleo transacional, piloto com worker parado) | aprovado | aprovado |
| Worker real: T21, interface e T27 | **reprovado** — `pilot-flow` “Interface”: espera do título “Alertas” esgota 30 s (respostas 429) | **reprovado** — mesma falha, mesmo ponto |
| Fase 2: catálogo/T22/**T23**/T37/carrinho/frete + Playwright | **reprovado** — T23: 500 “Internal Server Error” no upload de 10 MB + 1 | aprovado (T23 passou nesta execução) |
| Regressões T01/T02, acesso, worker, UI da fundação | aprovado | aprovado |
| Logs sanitizados, S3 após reinício, CLI do operador, backup, fatos após backup, restore, conferências, PITR | aprovado | aprovado |

**Sobre o commit `deecdc1`** (depois das correções de CSS; [json](fase-7-continuada-branch-deecdc1.json), [saída](fase-7-continuada-branch-deecdc1.saida.txt)): 15 de 16 etapas aprovadas (inclusive Fase 2/T23, backup, restore e PITR); reprova só “Worker real: T21, interface e T27” — o pilot-flow “Interface” para ao esperar o link “Contato geral”, um passo antes do ponto da base (“Alertas”). Causa confirmada depois (seção G-13): limite por IP esgotado; o pilot-flow sozinho passa 3/3 duas vezes com 0 respostas 429. Uma primeira tentativa nessa cópia falhou em várias suítes com `EACCES` em `/app/artifacts` ([saída](fase-7-continuada-branch-deecdc1-tentativa1-eacces.saida.txt)): a pasta montada fora criada como root e os testes rodam como UID 1000 — falha do procedimento, agora corrigida em `preparar-continuada.mjs` (a pasta é criada com permissão de escrita).

As falhas da branch são um subconjunto das da base. Os commits da branch não alteram `next.config.mjs`, `proxy.ts`, a API nem o lockfile.

## T23 isolado

[`t23-sonda.mjs`](t23-sonda.mjs) envia 30 vezes, como o teste, o SVG recusado seguido do arquivo de 10 MB + 1: pelo proxy de rewrite do Next, cerca de 15% viram 500 (base e branch); direto na API, 30/30 respondem 413. Log da web: `Failed to proxy … Error: write EPIPE`. A suíte `storefront` falhou em 1 de 7 execuções isoladas na base e em 1 de 5 na branch ([`t23-base-suite-*.txt`](t23-base-suite-1.txt), [`t23-head-suite-*.txt`](t23-head-suite-1.txt), [`t23-resultado.json`](t23-resultado.json)). **Falha intermitente preexistente**, não corrigida nesta rodada.

## G-13: limite de requisições e isolamento entre testes (resolvido em `6a0d195`)

**Correção de uma prova anterior.** As “4 respostas 429 novas” de [`limite-429-sequencia.txt`](limite-429-sequencia.txt) não provavam o limite por IP: 2 delas vêm de `ai.test.mjs`, que provoca de propósito o 429 do limite de geração simultânea de IA (`packages/purchase/src/ai.ts`) e o verifica. A causa só ficou provada com a instrumentação abaixo.

**Diagnóstico.**
1. *Chave do limite.* A API limita por IP do socket (`trustProxy: false`), em janela fixa de 1 min com contagem em memória (1000/min em `APP_ENV=test`, 120/min nos demais). Todo o tráfego dos testes — preparação de dados (`client(BASE_URL=http://web:3000)`), laços de espera e navegador — passa pelo proxy do Next e chega com o IP do contêiner web: **uma única cota para todas as suítes**.
2. *Consumo por suíte, cada uma sozinha com o limitador zerado* ([`g13/requisicoes-por-suite.json`](g13/requisicoes-por-suite.json)): etapa de API = 785 requisições em ~20 s (purchase 232, operations 221, commercial 186, ai 96, pilot-observation 50); etapa de interface = 328 (pilot-flow 118, purchase-worker 108, commercial-ui 102). **Nenhuma suíte chega perto do limite.**
3. *A falha.* Na sequência oficial a etapa de interface começa dentro da janela aberta pela de API: 1.003 requisições nos 60 s anteriores ao primeiro 429. Instrumentação do navegador numa cópia do teste (só observação, montada no contêiner): `429 GET …/purchase/accounts` e `429 GET …/operations/support?filter=open` → a lista de protocolos mostra “Limite de requisições excedido” e o link “Contato geral” não existe ([rede do navegador](g13/falha-pilot-flow-rede-navegador.txt), [tela](g13/falha-pilot-flow-ctx2.png)).
4. *Mesmo vazamento em outros pontos.* `foundation.test.mjs` esgota a cota de propósito (teste do limitador), e o lote seguinte (`post-backup`) herdava a cota zerada; o próprio `post-backup.test.mjs` já repete requisições com 429 (5 s × 20) — paliativo para esse vazamento, mantido.

**Correção (sem mudar o limite).** `scripts/verify.mjs`, antes de cada lote de suítes, faz uma requisição pelo mesmo caminho (Next → API) e lê `x-ratelimit-remaining`/`x-ratelimit-reset`; se a janela aberta por outro lote ainda vale, espera ela vencer e registra a espera em `limiterWaits` na evidência. Cada lote continua sujeito ao limite inteiro.

**Repetibilidade.** `commercial.test.mjs` usava o ID de evento fixo `evt-1` no webhook de cobrança; numa segunda execução no mesmo banco ele vinha como duplicado e 3 testes falhavam. Agora o ID é único por execução: 12/12 duas vezes seguidas no mesmo banco.

**Resultado** (execução continuada, mesmo procedimento): duas execuções completas da fase 7 sobre `6a0d195` terminaram com **código 0, 16/16 etapas** ([1: json](fase-7-continuada-branch-6a0d195-1.json), [saída](fase-7-continuada-branch-6a0d195-1.saida.txt); [2: json](fase-7-continuada-branch-6a0d195-2.json), [saída](fase-7-continuada-branch-6a0d195-2.saida.txt)), contra 4 falhas do pilot-flow em 5 sequências antes da correção. Esperas registradas: ~28 s antes da interface (799 requisições herdadas), ~22 s antes do `storefront`, 54 s antes do `foundation`, ~34 s antes do `post-backup` (999 herdadas do teste de esgotamento), 60 s antes do restore; custo total ≈ 3 min. Duas execuções são amostra pequena; o T23 passou nas duas, o que **não** o resolve (seção T23).

**Defeito de produção encontrado (não corrigido aqui; tarefa separada).** O caminho em produção é Caddy → Next → API, também com `trustProxy: false`: todos os clientes chegam com o IP do contêiner web e o limite de 120/min vira uma cota única da plataforma. Corrigir exige definir os saltos de proxy confiáveis por ambiente.

## Histórico: 429 do `pilot-flow` antes da correção

Limite por IP de 1000/min em `APP_ENV=test`, janela fixa. Na ordem oficial das etapas e em pilhas limpas, a etapa de interface termina com 4 respostas 429 novas **na base, em `d2d4742` e em `deecdc1`** ([`limite-429-sequencia.txt`](limite-429-sequencia.txt), roteiro [`limite-429-sequencia.sh`](limite-429-sequencia.sh)). A casca do painel da branch chegou a fazer 42 requisições em 8 páginas (base: 26); o commit `d2d4742` reduziu para 33, com as páginas do painel iguais à base exceto as miniaturas do catálogo ([`requisicoes-por-pagina.json`](requisicoes-por-pagina.json), [`contar-requisicoes.mjs`](contar-requisicoes.mjs)).
