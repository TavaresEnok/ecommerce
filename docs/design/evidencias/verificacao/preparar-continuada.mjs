#!/usr/bin/env node
// Prepara, FORA do repositório, uma cópia de um commit para rodar a verificação da fase em modo "continuada":
// mesma sequência de etapas de scripts/verify.mjs, mas uma etapa reprovada é registrada e as seguintes continuam
// (o resultado final continua reprovado). Usado para comparar base × branch quando o verify oficial não passa do
// build neste ambiente (inspeção TLS no npm; CDN do Playwright e apt bloqueados).
//
// Uso: node docs/design/evidencias/verificacao/preparar-continuada.mjs <commit> <pasta-nova> [--ca=<arquivo .crt>]
// Depois: cd <pasta-nova> && npm ci && node scripts/setup.mjs --test && node scripts/verify-continuada.mjs --phase=7 --externos-simulados
// Limpeza: git worktree remove --force <pasta-nova>; rm -r <pasta-nova>-continuada; docker compose -p ecommerce-phase7-test down -v
//
// Diferenças em relação ao verify oficial (todas registradas no relatório):
// 1. imagens com a CA do proxy (NODE_EXTRA_CA_CERTS) — sem efeito fora de redes com inspeção TLS;
// 2. estágio "browsers" a partir de mcr.microsoft.com/playwright:v1.63.0-noble (mesma versão do Playwright do lockfile)
//    em vez de `npx playwright install --with-deps` (CDN e apt bloqueados); o estágio de testes roda como UID 1000;
// 3. etapa reprovada não interrompe a execução; evidência gravada em verification.continuada[.simulado].json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [commit, alvo] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ca = process.argv.find((a) => a.startsWith('--ca='))?.slice(5) ?? process.env.DESIGN_BUILD_CA ?? '/root/.ccr/ca-bundle.crt';
if (!commit || !alvo) { console.error('uso: preparar-continuada.mjs <commit> <pasta-nova> [--ca=arquivo]'); process.exit(2); }
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const dir = resolve(alvo);
if (dir.startsWith(raiz + '/')) { console.error('a pasta deve ficar fora do repositório'); process.exit(2); }
if (existsSync(dir)) { console.error(`${dir} já existe`); process.exit(2); }

execFileSync('git', ['-C', raiz, 'worktree', 'add', '--detach', dir, commit], { stdio: 'inherit' });
const extra = `${dir}-continuada`; // fora da cópia, para não entrar no digest das fontes
mkdirSync(join(extra, 'ca'), { recursive: true });
if (existsSync(ca)) copyFileSync(ca, join(extra, 'ca', 'ca.crt')); else writeFileSync(join(extra, 'ca', 'ca.crt'), '');

// Dockerfile derivado (o versionado não muda).
let df = readFileSync(join(dir, 'Dockerfile'), 'utf8');
const linhas = df.split('\n');
linhas.splice(1, 0, 'COPY --from=ca ca.crt /usr/local/share/ca-certificates/override-ca.crt', 'ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/override-ca.crt');
df = linhas.join('\n');
const browsers = /FROM dependencies AS browsers\n[^\n]*\nRUN npx playwright install[^\n]*\n/;
if (!browsers.test(df)) throw new Error('estágio browsers não reconhecido no Dockerfile');
df = df.replace(browsers, 'FROM mcr.microsoft.com/playwright:v1.63.0-noble AS browsers\nENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=http://api:3001\nWORKDIR /app\nRUN chmod -R a+rX /ms-playwright\n');
df = df.replace(/(FROM browsers AS tests\nCOPY --from=app \/app \/app\n)USER node/, '$1USER 1000');
writeFileSync(join(extra, 'Dockerfile'), df);

const build = (target) => `{build: {context: ${dir}, dockerfile: ${join(extra, 'Dockerfile')}, target: ${target}, additional_contexts: {ca: ${join(extra, 'ca')}}}}`;
writeFileSync(join(extra, 'compose.override.yaml'), 'services:\n' + ['storage-init', 'migrate', 'api', 'worker', 'web'].map((s) => `  ${s}: ${build('app')}\n`).join('') + `  tests: ${build('tests')}\n`);

// scripts/compose.mjs: acrescenta a sobreposição só nos projetos de teste.
const composeFile = join(dir, 'scripts', 'compose.mjs');
let compose = readFileSync(composeFile, 'utf8');
const alvoCompose = "...(phase>=2?['-f',`compose.phase${phase}.test.yaml`]:[])]";
if (compose.split(alvoCompose).length !== 2) throw new Error('scripts/compose.mjs não reconhecido');
compose = compose.replace(alvoCompose, `...(phase>=2?['-f',\`compose.phase\${phase}.test.yaml\`]:[]),'-f',${JSON.stringify(join(extra, 'compose.override.yaml'))}]`);
writeFileSync(composeFile, compose);

// scripts/verify-continuada.mjs: cópia de verify.mjs que registra a etapa reprovada e continua.
let v = readFileSync(join(dir, 'scripts', 'verify.mjs'), 'utf8');
const troca = (de, para, nome) => { if (v.split(de).length !== 2) throw new Error(`verify.mjs não reconhecido (${nome})`); v = v.replace(de, para); };
troca("catch(error){summary.steps.push({name,result:'failed',durationMs:Date.now()-start});throw error;}}",
  "catch(error){summary.steps.push({name,result:'failed',durationMs:Date.now()-start,error:String(error.message).slice(0,200)});if(['Preparação isolada','Build em Node LTS','Migrations, S3 privado e saúde'].includes(name))throw error;(summary.continuedAfter??=[]).push(name);}} // CÓPIA LOCAL: etapa reprovada é registrada e a execução continua; resultado final segue reprovado", 'etapa');
troca('if(!data.passed)throw new Error(`Evidência reprovada: ${file}`);',
  'if(!data.passed){if(summary.continuedAfter){summary.continuedAfter.push(`${file} reprovado`);}else throw new Error(`Evidência reprovada: ${file}`);}', 'relatórios');
const i = v.lastIndexOf('summary.exitCode=0;');
if (i < 0) throw new Error('verify.mjs não reconhecido (saída)');
v = v.slice(0, i) + "if(summary.continuedAfter)throw new Error('Etapas reprovadas (execução continuada): '+summary.continuedAfter.join('; '));" + v.slice(i);
troca("verification${simulated?'.simulado':''}.json", "verification.continuada${simulated?'.simulado':''}.json", 'evidência');
writeFileSync(join(dir, 'scripts', 'verify-continuada.mjs'), v);
console.log(`Pronto em ${dir}. Próximo: cd ${dir} && npm ci && node scripts/setup.mjs --test && node scripts/verify-continuada.mjs --phase=7 --externos-simulados`);
