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

// Zoom REAL do navegador (o de Ctrl +/−), não emulação de viewport: contexto persistente com a extensão local de
// ./zoom-ext (chrome.tabs.setZoom). Retorna { context, setZoom(fator), close() }. Headless com extensão exige o
// Chromium completo (o mesmo executável de launch()).
export async function launchZoom(width, height = 900) {
  const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os');
  const ext = join(import.meta.dirname, 'zoom-ext'), dir = mkdtempSync(join(tmpdir(), 'zoom-perfil-'));
  const fallback = [process.env.PLAYWRIGHT_CHROMIUM, '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
  const args = [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--window-size=${width},${height}`];
  const errors = [];
  for (const mod of [join(repo, 'node_modules/playwright'), '/opt/node22/lib/node_modules/playwright']) {
    let pw; try { pw = require(mod); } catch { continue; }
    for (const executablePath of [undefined, fallback]) {
      try {
        const context = await pw.chromium.launchPersistentContext(dir, { headless: true, viewport: null, args, ignoreDefaultArgs: ['--disable-extensions'], ...(executablePath ? { executablePath } : {}) });
        let [sw] = context.serviceWorkers(); if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
        return { context, setZoom: (f) => sw.evaluate((x) => self.zoomAll(x), f), close: async () => { await context.close(); rmSync(dir, { recursive: true, force: true }); } };
      } catch (e) { errors.push(String(e.message).split('\n')[0]); }
    }
  }
  console.error(`Chromium com extensão indisponível:\n${errors.join('\n')}`); process.exit(2);
}
