#!/usr/bin/env node
// Renderiza docs/design/preview/index.html em 390, 768 e 1440 px e grava capturas por seção em docs/design/preview/capturas/.
// Requer Playwright + Chromium já instalados (não instala nada). Uso: node docs/design/capturar-preview.mjs
// Também verifica: rolagem horizontal, fonte carregada, números tabulares, campos sem nome acessível e foco visível.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let playwright;
for (const candidate of ['playwright', '/opt/node22/lib/node_modules/playwright', `${process.env.npm_config_prefix || ''}/lib/node_modules/playwright`]) {
  try { playwright = require(candidate); break; } catch { /* tenta o próximo */ }
}
if (!playwright) { console.error('Playwright não encontrado. Instale-o fora do projeto ou use a imagem de testes; nada foi capturado.'); process.exit(2); }

const out = join(here, 'preview/capturas');
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(here, 'preview/index.html')).href;
const sections = ['fundamentos', 'componentes', 'c1', 'c2', 'c3', 'c4', 'c5'];
const problems = [];
const browser = await playwright.chromium.launch();
for (const width of [390, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  // A barra fixa do protótipo encobriria partes das capturas por seção.
  await page.addStyleTag({ content: '.proto-bar { position: static; }' });
  const report = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const wide = [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('[hidden], .sr-only, svg')).map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')}`).slice(0, 5);
    const font = document.fonts.check('16px "IBM Plex Sans"');
    const probe = (t) => { const s = document.createElement('span'); s.className = 'money'; s.textContent = t; document.body.append(s); const w = s.getBoundingClientRect().width; s.remove(); return w; };
    const tabular = Math.abs(probe('R$ 111,11') - probe('R$ 888,88')) < 0.5;
    const unnamed = [...document.querySelectorAll('input, select, textarea, button')].filter((e) => {
      if (e.closest('[hidden]')) return false;
      const name = e.getAttribute('aria-label') || (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent) || e.closest('label')?.textContent || (e.tagName === 'BUTTON' && e.textContent.trim());
      return !name || !name.trim();
    }).map((e) => e.id || e.outerHTML.slice(0, 60));
    return { overflow, wide, font, tabular, unnamed };
  });
  if (report.overflow > 0) problems.push(`${width}px: rolagem horizontal de ${report.overflow}px (${report.wide.join(', ')})`);
  if (!report.font) problems.push(`${width}px: IBM Plex Sans não carregou`);
  if (!report.tabular) problems.push(`${width}px: números não são tabulares`);
  if (report.unnamed.length) problems.push(`${width}px: controles sem nome acessível: ${report.unnamed.join(', ')}`);
  // Foco por teclado: o primeiro Tab precisa mostrar contorno.
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth}`; });
  if (!outline.startsWith('solid')) problems.push(`${width}px: foco sem contorno visível (${outline})`);
  for (const id of sections) {
    const el = page.locator(`#${id}`);
    await el.screenshot({ path: join(out, `${id}-${width}.jpg`), type: 'jpeg', quality: 70 });
  }
  console.log(`${width}px: ${sections.length} capturas · fonte ${report.font ? 'IBM Plex Sans' : 'fallback'} · tabular ${report.tabular} · overflow ${report.overflow}px`);
  await page.close();
}
// Movimento reduzido: diálogo abre sem animação perceptível.
const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await reduced.goto(url);
await reduced.click('#c3 .side-list [data-dialog]');
const anim = await reduced.evaluate(() => getComputedStyle(document.querySelector('#c3-cancel-dialog')).animationDuration);
const focusInDialog = await reduced.evaluate(() => document.activeElement?.id);
await reduced.keyboard.press('Escape');
const returned = await reduced.evaluate(() => document.activeElement?.textContent?.trim());
if (parseFloat(anim) > 0.01) problems.push(`movimento reduzido: diálogo anima ${anim}`);
if (focusInDialog !== 'c3-dlg-reason') problems.push(`diálogo: foco inicial em ${focusInDialog}`);
if (returned !== 'Cancelar pedido…') problems.push(`diálogo: foco não voltou ao botão (${returned})`);
console.log(`diálogo: foco inicial ${focusInDialog} · retorno "${returned}" · animação ${anim} com movimento reduzido`);
await browser.close();
if (problems.length) { problems.forEach((p) => console.error(`PROBLEMA ${p}`)); process.exit(1); }
console.log('Capturas gravadas em docs/design/preview/capturas/. Revise-as visualmente: este script não julga composição.');
