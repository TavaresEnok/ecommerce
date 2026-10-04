// Revisão visual das lojas de demonstração (presets) e do painel, no contêiner de testes (Chromium do projeto).
//   docker compose --profile verify run --rm --no-deps -v ./scripts/design-review.mjs:/app/scripts/design-review.mjs:ro \
//     -v ./.local/demo-presets.json:/app/demo-presets.json:ro -e REVIEW_LABEL=b1 -e REVIEW_ONLY=loja tests node scripts/design-review.mjs
// Saída: artifacts/revisao/<rótulo>/*.png (tela e página inteira) e indice.json com medidas (rolagem horizontal, 1º item).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { client } from './seed.mjs';
const base = process.env.BASE_URL || 'http://web:3000', origin = process.env.APP_ORIGIN || 'http://localhost:3000', label = process.env.REVIEW_LABEL || 'atual';
const only = (process.env.REVIEW_ONLY || '').split(',').filter(Boolean), sizes = (process.env.REVIEW_SIZES || '390x844,1440x900').split(',').map((s) => s.split('x').map(Number));
const out = `/app/artifacts/revisao/${label}`; mkdirSync(out, { recursive: true });
const demo = JSON.parse(readFileSync('/app/demo-presets.json', 'utf8')), by = (k) => demo.find((d) => d.key === k), path = (u) => new URL(u).pathname;
const api = client(base, origin), cookies = {};
async function session(key) { if (cookies[key]) return cookies[key]; const d = by(key); const r = await api('auth/login', { method: 'POST', body: { email: d.email, password: d.password } }); if (r.status !== 201) throw new Error(`login ${key}: ${r.status}`); return (cookies[key] = r.headers.get('set-cookie').split(';')[0]); }
const products = async (key) => (await (await fetch(`${base}/api/public/stores/${path(by(key).store).split('/')[2]}`)).json()).products;
// [nome, caminho, sessão (chave da loja ou null), ação opcional]
const pages = [];
for (const k of ['atelie', 'essencial', 'editorial']) {
  const store = path(by(k).store), list = await products(k).catch(() => []), withPhoto = list.find((p) => p.media.length > 1) ?? list.find((p) => p.media.length) ?? list[0], noPhoto = list.find((p) => !p.media.length), out = list.find((p) => p.variants.filter((v) => v.active).every((v) => v.available < 1));
  pages.push([`loja-${k}-inicio`, store, null], [`loja-${k}-catalogo`, `${store}/produtos`, null]);
  if (withPhoto) pages.push([`loja-${k}-produto`, `${store}/produtos/${withPhoto.slug}`, null]);
  if (noPhoto) pages.push([`loja-${k}-sem-foto`, `${store}/produtos/${noPhoto.slug}`, null]);
  if (out) pages.push([`loja-${k}-esgotado`, `${store}/produtos/${out.slug}`, null]);
}
for (const k of ['vazia', 'um', 'contraste']) pages.push([`loja-caso-${k}`, path(by(k).store), null]);
const panel = path(by('atelie').panel);
pages.push(['painel-hoje', `${panel}/operacao`, 'atelie'], ['painel-produtos', panel, 'atelie'], ['painel-produtos-filtro', `${panel}?status=DRAFT`, 'atelie'], ['painel-busca-vazia', `${panel}?q=zzzz`, 'atelie'],
  ['painel-novo-produto', `${panel}?novo=1`, 'atelie'], ['painel-pedidos', `${panel}/pedidos`, 'atelie'], ['painel-atendimento', `${panel}/atendimento`, 'atelie'],
  ['painel-aparencia', `${panel}/aparencia`, 'atelie'], ['painel-loja', `${panel}/configuracoes/loja`, 'atelie'], ['painel-entregas', `${panel}/configuracoes/entregas`, 'atelie'], ['painel-dominio', `${panel}/configuracoes/dominio`, 'atelie'], ['painel-seguranca', `${panel}/configuracoes/seguranca`, 'atelie'], ['painel-plano', `${panel}/configuracoes/plano`, 'atelie'], ['painel-dados', `${panel}/configuracoes/dados`, 'atelie'],
  ['painel-imagens', `${panel}?aba=midia`, 'atelie'], ['painel-estoque', `${panel}?aba=estoque`, 'atelie']);
const atelieList = await products('atelie').catch(() => []);
const editProduct = atelieList.find((p) => p.variants.filter((v) => v.active).length > 1) ?? atelieList[0];
if (editProduct) pages.push(['painel-produto-editar', `${panel}?produto=${editProduct.id}`, 'atelie']);
const browser = await chromium.launch(), index = [];
for (const [name, url, key] of pages) for (const [width, height] of sizes) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (key) { const c = await session(key); await ctx.addCookies([{ name: c.split('=')[0], value: c.split('=').slice(1).join('='), domain: new URL(base).hostname, path: '/' }]); }
  const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  const file = `${name}-${width}x${height}`, entry = { name, url, width, height, result: 'ok' };
  try {
    await page.goto(base + url, { waitUntil: 'load', timeout: 30000 }); await page.waitForTimeout(name.includes('aparencia') ? 3500 : 1200);
    entry.overflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    entry.firstItem = await page.evaluate(() => { const el = document.querySelector('[data-first-item], .cards .card'); if (!el || !(el instanceof HTMLElement) || !el.offsetParent) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), visible: r.bottom <= innerHeight }; });
    await page.screenshot({ path: `${out}/${file}-tela.png` }); await page.screenshot({ path: `${out}/${file}.png`, fullPage: true });
  } catch (e) { entry.result = `falha: ${String(e.message).split('\n')[0]}`; }
  entry.errors = errors; index.push(entry); console.log(entry.result === 'ok' ? '✔' : '✖', file, entry.result === 'ok' ? '' : entry.result, errors.length ? `erros: ${errors.join(' | ').slice(0, 160)}` : '');
  await ctx.close();
}
await browser.close(); writeFileSync(`${out}/indice.json`, JSON.stringify(index, null, 2));
