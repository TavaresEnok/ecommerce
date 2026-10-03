#!/usr/bin/env node
// Ambiente isolado da revisão visual: node docs/design/ambiente/ambiente.mjs subir|dados|status|descer|limpar [...]
//   subir   constrói e sobe o projeto Compose “ecommerce-design-demo” (web em http://localhost:3400)
//   dados   gera .local/demo-ui.json (repassa --fotos=<pasta> e --so-pendente para gerar-dados.mjs)
//   status  mostra os serviços do projeto
//   descer  para os serviços, preservando os volumes do projeto
//   limpar  remove serviços e volumes SOMENTE deste projeto e apaga .local/demo-ui.json
// Nunca toca nos projetos de desenvolvimento (ecommerce-foundation) nem nos de verificação (ecommerce-phaseN-test).
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const PROJECT = 'ecommerce-design-demo';
const repo = resolve(import.meta.dirname, '../../..');
const caOverlay = '.local/design-demo/compose.ca.yaml';
export const composeArgs = () => ['compose', '--project-name', PROJECT, '--env-file', '.local/test.env', '-f', 'compose.yaml', '-f', 'compose.test.yaml', '-f', 'docs/design/ambiente/compose.design.yaml', ...(existsSync(join(repo, caOverlay)) ? ['-f', caOverlay] : [])];
// Redes com inspeção TLS (proxy corporativo/sandbox): contêineres de build não confiam na CA do proxy e o `npm ci` da
// imagem falha (SELF_SIGNED_CERT_IN_CHAIN). Sem alterar o Dockerfile versionado, gera-se fora do git
// (.local/design-demo/) um Dockerfile derivado com uma camada que instala a CA indicada em DESIGN_BUILD_CA (ou o pacote de CAs
// da sessão em /root/.ccr/ca-bundle.crt, se existir) e uma sobreposição Compose que o usa. Sem CA, usa o Dockerfile original.
function prepareCa() {
  const ca = process.env.DESIGN_BUILD_CA || (existsSync('/root/.ccr/ca-bundle.crt') ? '/root/.ccr/ca-bundle.crt' : '');
  rmSync(join(repo, '.local/design-demo/compose.ca.yaml'), { force: true });
  if (!ca) return;
  const dir = join(repo, '.local/design-demo'); mkdirSync(join(dir, 'ca'), { recursive: true }); copyFileSync(ca, join(dir, 'ca/ca.crt'));
  const original = readFileSync(join(repo, 'Dockerfile'), 'utf8'), first = original.match(/^FROM node:[^\n]*$/m);
  if (!first) throw new Error('Dockerfile sem estágio FROM node: não foi possível derivar a camada de CA.');
  writeFileSync(join(dir, 'Dockerfile'), original.replace(first[0], `${first[0]}\n# Derivado por docs/design/ambiente/ambiente.mjs: confia na CA do proxy só neste build local.\nCOPY --from=ca ca.crt /usr/local/share/ca-certificates/design-build-ca.crt\nENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/design-build-ca.crt`));
  const build = '{context: ., dockerfile: .local/design-demo/Dockerfile, target: app, additional_contexts: {ca: .local/design-demo/ca}}';
  writeFileSync(join(repo, caOverlay), `# Gerado por docs/design/ambiente/ambiente.mjs (não versionar).\nservices:\n${['storage-init', 'migrate', 'api', 'worker', 'web'].map((s) => `  ${s}: {build: ${build}}`).join('\n')}\n`);
  console.log(`Build com CA adicional de ${ca} (Dockerfile derivado em .local/design-demo/).`);
}
const run = (program, args, timeout = 1800000) => { const r = spawnSync(program, args, { cwd: repo, stdio: 'inherit', timeout }); if (r.status !== 0) process.exit(r.status ?? 1); };

if (resolve(process.argv[1] || '') === resolve(import.meta.filename)) {
  const [action, ...rest] = process.argv.slice(2);
  if (!existsSync(join(repo, '.local/test.env'))) { console.error('Falta .local/test.env: execute antes `node scripts/setup.mjs --test` (gera segredos locais sem exibi-los).'); process.exit(2); }
  // Constrói só a imagem da aplicação (todos os serviços compartilham a tag) e sobe sem --build: imagens já existentes
  // (Postgres, Redis, SeaweedFS) não são reconstruídas nem consultadas de novo no registro.
  if (action === 'subir') { prepareCa(); run('docker', [...composeArgs(), 'build', 'web']); run('docker', [...composeArgs(), 'up', '-d', '--wait', '--wait-timeout', '300', 'web', 'worker']); }
  else if (action === 'dados') run(process.execPath, [join(repo, 'docs/design/ambiente/gerar-dados.mjs'), ...rest]);
  else if (action === 'status') run('docker', [...composeArgs(), 'ps']);
  else if (action === 'descer') run('docker', [...composeArgs(), 'down']);
  else if (action === 'limpar') { run('docker', [...composeArgs(), 'down', '--volumes', '--remove-orphans']); rmSync(join(repo, '.local/demo-ui.json'), { force: true }); rmSync(join(repo, '.local/design-demo'), { recursive: true, force: true }); console.log(`Projeto ${PROJECT} e .local/demo-ui.json removidos.`); }
  else { console.error('Uso: node docs/design/ambiente/ambiente.mjs subir|dados|status|descer|limpar'); process.exit(2); }
}
