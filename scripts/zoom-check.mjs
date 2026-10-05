// Zoom REAL do navegador (o de Ctrl +/−, via chrome.tabs.setZoom da extensão local docs/design/ambiente/zoom-ext), não
// emulação de viewport, em famílias representativas do painel e das lojas de exemplo. Janela de 1280 px; zoom 200% e 400%.
//   docker compose --profile verify run --rm --no-deps -v ./scripts/zoom-check.mjs:/app/scripts/zoom-check.mjs:ro \
//     -v ./docs/design/ambiente/zoom-ext:/app/zoom-ext:ro -v ./.local/demo-presets.json:/app/demo-presets.json:ro \
//     -e ZOOM_LABEL=z1 tests node scripts/zoom-check.mjs
// Mede rolagem horizontal da página, se o título principal continua visível e o zoom efetivamente aplicado
// (devicePixelRatio). Saída: artifacts/revisao/<rótulo>/zoom.json e capturas; código 1 se alguma tela rolar na horizontal.
// O canal 'chromium' (Chromium completo, headless novo) é obrigatório: o chromium-headless-shell não carrega extensões.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { client } from './seed.mjs';
const base = process.env.BASE_URL || 'http://web:3000', origin = process.env.APP_ORIGIN || 'http://localhost:3000', label = process.env.ZOOM_LABEL || 'zoom';
const out = `/app/artifacts/revisao/${label}`; mkdirSync(out, { recursive: true });
const demo = JSON.parse(readFileSync('/app/demo-presets.json', 'utf8')), by = (k) => demo.find((d) => d.key === k);
const api = client(base, origin), atelie = by('atelie'), essencial = by('essencial');
const login = await api('auth/login', { method: 'POST', body: { email: atelie.email, password: atelie.password } }), cookie = login.headers.get('set-cookie').split(';')[0];
const cat = (await api(`tenants/${atelie.tenantId}/catalogue`, { actor: { cookie, csrf: login.body.csrf } })).body, prod = cat.products.find((p) => p.status === 'ACTIVE' && p.variants.some((v) => v.active && v.available > 1)) ?? cat.products.find((p) => p.status === 'ACTIVE');
const shop = new URL(atelie.store).pathname, panel = `/painel/${atelie.tenantId}`, slug = shop.split('/')[2];
// Carrinho com um item, criado pela mesma rota pública da vitrine.
const cart = (await api(`public/stores/${slug}/cart/items`, { method: 'POST', body: { variant_id: (prod.variants.find((v) => v.active && v.available > 1) ?? prod.variants[0]).id, quantity: 1 } })).headers.get('set-cookie').split(';')[0];
const openProduct = async (p) => { await p.getByRole('link', { name: new RegExp(prod.name) }).first().click(); await p.waitForLoadState('networkidle'); };
const pages = [['painel-produtos', panel, true], ['painel-produto', panel, true, openProduct], ['painel-aparencia', `${panel}/aparencia`, true], ['painel-pedidos', `${panel}/pedidos`, true],
  ['loja-essencial', new URL(essencial.store).pathname, false], ['loja-produto', `${shop}/produtos/${prod.slug}`, false], ['loja-carrinho', `${shop}/carrinho`, false, null, cart]];
const results = [];
for (const factor of [2, 4]) {
  const dir = mkdtempSync(join(tmpdir(), 'zoom-')), ext = '/app/zoom-ext';
  const context = await chromium.launchPersistentContext(dir, { headless: true, channel: 'chromium', viewport: null, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--window-size=1280,900', `--host-resolver-rules=MAP ${new URL(origin).hostname} ${new URL(base).hostname}`] });
  let [sw] = context.serviceWorkers(); if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const jar = (c) => ({ name: c.split('=')[0], value: c.split('=').slice(1).join('='), domain: new URL(origin).hostname, path: '/' });
  await context.addCookies([jar(cookie), jar(cart)]);
  for (const [name, path, , action] of pages) {
    const page = await context.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + path, { waitUntil: 'networkidle' }); if (action) await action(page); await sw.evaluate((f) => self.zoomAll(f), factor); await page.waitForTimeout(1200);
    const m = await page.evaluate(() => { const h = document.querySelector('main h1, h1'); const r = h?.getBoundingClientRect(); return { dpr: devicePixelRatio, inner: innerWidth, overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), heading: h ? { text: h.textContent?.trim().slice(0, 60), visible: !!r && r.width > 0 && r.right <= innerWidth + 1 } : null }; });
    await page.screenshot({ path: `${out}/${name}-1280-zoom${factor * 100}.png` });
    const r = { name, zoom: `${factor * 100}%`, ...m, errors }; results.push(r);
    console.log(r.overflow === 0 && !errors.length ? 'ok   ' : 'FALHA', name, r.zoom, `dpr ${m.dpr}, largura CSS ${m.inner}, rolagem ${m.overflow}px, título ${m.heading ? `“${m.heading.text}”${m.heading.visible ? '' : ' (fora da tela)'}` : 'ausente'}`);
    await page.close();
  }
  await context.close(); rmSync(dir, { recursive: true, force: true });
}
writeFileSync(`${out}/zoom.json`, JSON.stringify({ date: new Date().toISOString(), window: 1280, results }, null, 2));
process.exit(results.every((r) => r.overflow === 0 && !r.errors.length) ? 0 : 1);
