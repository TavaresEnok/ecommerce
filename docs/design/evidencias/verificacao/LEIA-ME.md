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

As falhas da branch são um subconjunto das da base. Os commits da branch não alteram `next.config.mjs`, `proxy.ts`, a API nem o lockfile.

## T23 isolado

[`t23-sonda.mjs`](t23-sonda.mjs) envia 30 vezes, como o teste, o SVG recusado seguido do arquivo de 10 MB + 1: pelo proxy de rewrite do Next, cerca de 15% viram 500 (base e branch); direto na API, 30/30 respondem 413. Log da web: `Failed to proxy … Error: write EPIPE`. A suíte `storefront` falhou em 1 de 7 execuções isoladas na base e em 1 de 5 na branch ([`t23-base-suite-*.txt`](t23-base-suite-1.txt), [`t23-head-suite-*.txt`](t23-head-suite-1.txt), [`t23-resultado.json`](t23-resultado.json)). **Falha intermitente preexistente**, não corrigida nesta rodada.

## 429 do `pilot-flow`

Limite por IP de 1000/min em `APP_ENV=test`, janela fixa. Na ordem oficial das etapas e em pilhas limpas, a etapa de interface termina com 4 respostas 429 novas **na base e na branch** ([`limite-429-sequencia.txt`](limite-429-sequencia.txt), roteiro [`limite-429-sequencia.sh`](limite-429-sequencia.sh)). A casca do painel da branch chegou a fazer 42 requisições em 8 páginas (base: 26); o commit `d2d4742` reduziu para 33, com as páginas do painel iguais à base exceto as miniaturas do catálogo ([`requisicoes-por-pagina.json`](requisicoes-por-pagina.json), [`contar-requisicoes.mjs`](contar-requisicoes.mjs)).
