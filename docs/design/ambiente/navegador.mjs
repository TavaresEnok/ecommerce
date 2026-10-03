// Chromium para as capturas e verificações da revisão visual, sem instalar nada no host:
// 1) Playwright do repositório (node_modules) com o navegador dele; 2) se esse navegador não estiver baixado, o mesmo
// Playwright com o executável indicado em PLAYWRIGHT_CHROMIUM ou o Chromium pré-instalado em /opt/pw-browsers/chromium;
// 3) Playwright global de /opt/node22 (ambiente de nuvem). Alternativa equivalente: rodar o script dentro do contêiner
// oficial mcr.microsoft.com/playwright:v1.63.0-noble (ver README desta pasta).
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../../..'), require = createRequire(import.meta.url);
export async function launch() {
  const fallback = [process.env.PLAYWRIGHT_CHROMIUM, '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
  const errors = [];
  for (const mod of [join(repo, 'node_modules/playwright'), '/opt/node22/lib/node_modules/playwright']) {
    let pw; try { pw = require(mod); } catch { continue; }
    try { return await pw.chromium.launch(); } catch (e) { errors.push(`${mod}: ${String(e.message).split('\n')[0]}`); }
    if (fallback) try { return await pw.chromium.launch({ executablePath: fallback }); } catch (e) { errors.push(`${mod} + ${fallback}: ${String(e.message).split('\n')[0]}`); }
  }
  console.error(`Chromium indisponível:\n${errors.join('\n') || 'Playwright não encontrado (npm ci).'}`); process.exit(2);
}
// Base da aplicação: --base=… ou a gravada por gerar-dados.mjs em .local/demo-ui.json.
export const baseOf = (demo) => (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7) || demo.base || 'http://localhost:3400';
