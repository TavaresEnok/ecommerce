// UI real (SSR + navegador) com API local SINTÉTICA. Não testa RLS nem integrações reais.
// Requer build prévio. node scripts/vitrine-redesign-check.mjs
// CHROMIUM_EXECUTABLE=/caminho/chrome aceita navegador já instalado.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import ts from 'typescript';
const compiled = ts.transpileModule(await readFile('apps/web/components/theme-model.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { PRESETS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const out = resolve('docs/design/evidencias/redesign-vitrine');
await mkdir(out, { recursive: true });
const photos = {
  atelie: ['atelie-vaso-barro.jpg', 'atelie-bule-verde.jpg', 'atelie-copos.jpg', 'atelie-cachepo.jpg', 'atelie-jarro.jpg'],
  editorial: ['editorial-bolsa-rosa.jpg', 'editorial-carteira.jpg', 'editorial-botas-2.jpg', 'editorial-relogio.jpg', 'editorial-pulseiras.jpg'],
  essencial: ['essencial-fone-mesa.jpg', 'essencial-teclado-branco.jpg', 'essencial-mouse.jpg', 'essencial-luminaria.jpg', 'essencial-relogio-minimal.jpg'],
};
const titles = { atelie: 'Barro & Trama', editorial: 'Atelier Norte', essencial: 'Essencial Casa Digital' };
const names = { atelie: ['Vaso de cerâmica', 'Bule verde', 'Conjunto de copos', 'Cachepô artesanal', 'Jarro de barro'], editorial: ['Bolsa rosa', 'Carteira em couro', 'Botas urbanas', 'Relógio clássico', 'Pulseiras'], essencial: ['Fone de ouvido', 'Teclado compacto', 'Mouse sem fio', 'Luminária de mesa', 'Relógio minimalista'] };
const stores = Object.fromEntries(Object.keys(photos).map(preset => {
  const config = PRESETS[preset];
  const products = names[preset].map((name, n) => ({ id: `${preset}-produto-${n}`, slug: `produto-${n}`, name, description: 'Descrição demonstrativa: materiais, dimensões e acabamento da peça. Fotos de demonstração já presentes no projeto.', status: 'ACTIVE', category_id: n < 3 ? 'colecao' : 'casa', media: [{ id: `${preset}-${n}` }, { id: `${preset}-${(n + 1) % 5}` }], variants: [{ id: `${preset}-variante-${n}`, sku: `DEMO-${n}`, attributes: {}, is_default: true, active: true, price_cents: '14900', available: n === 4 ? 0 : 8 }] }));
  products[0].variants.push({ ...products[0].variants[0], id: `${preset}-variante-extra`, sku: 'DEMO-EXTRA', attributes: { Opção: 'Outra opção' }, available: 0 });
  const theme = { schema_version: 2, preset, title: titles[preset], description: preset === 'atelie' ? 'Peças para os seus rituais. Feitas com tempo, textura e cuidado.' : preset === 'editorial' ? 'Uma seleção para acompanhar os seus dias.' : 'Escolhas práticas para sua casa e sua rotina.', brand: { ...config.brand, color: config.color, logo: null }, layout: config.layout, sections: config.sections({ title: titles[preset], description: 'Conheça nossa seleção de produtos.' }), menu: [{ label: 'Produtos', to: { kind: 'catalog' } }], footer: { links: [], note: '' }, pages: [], assets: [], supplier: { synthetic: true, name: 'Fornecedor demonstrativo', document: '', address: 'Endereço fictício', email: 'contato@example.test', phone: 'Contato fictício', policies: 'Política fictícia, apenas para teste.', delivery: 'Entrega demonstrativa.', risks: 'Cuidados demonstrativos.' } };
  for (const section of theme.sections) {
    if (section.type === 'hero') { section.image = `${preset}-0`; section.heading = preset === 'atelie' ? 'Feito para ficar.' : 'Uma coleção, muitas histórias.'; section.text = theme.description; }
    if (section.type === 'image_text') { section.image = `${preset}-1`; section.heading = 'Detalhes que fazem parte da história'; }
  }
  return [preset, { route: { slug: preset, canonical: `http://localhost/lojas/${preset}` }, theme, products, categories: [{ id: 'colecao', slug: 'colecao', name: 'Coleção' }, { id: 'casa', slug: 'casa', name: 'Mais escolhas' }], noindex: true }];
}));
let cartItems = [], confirmations = [], orderBody = null, checkoutMode = 'success';
const orderId = '01990000-0000-7000-8000-000000000010';
function cart() { return { items: cartItems, subtotal_cents: cartItems.reduce((s, i) => s + BigInt(i.price_cents) * BigInt(i.quantity), 0n).toString(), valid: true }; }
function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
const fixtureErrors = [];
const api = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost'), parts = u.pathname.split('/').filter(Boolean), slug = parts[2], store = stores[slug];
    if (!store || parts[0] !== 'public' || parts[1] !== 'stores') return json(res, { error: 'Não encontrado' }, 404);
    const path = parts.slice(3).join('/');
    if (path.startsWith('media/')) {
      const asset = parts[4], n = Number(asset.split('-').at(-1));
      const body = await readFile(`scripts/fixtures/fotos/${photos[slug][n]}`);
      res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(body);
    }
    let body = {};
    if (req.method === 'POST') { let raw = ''; for await (const chunk of req) raw += chunk; body = JSON.parse(raw || '{}'); }
    if (!path) {
      let products = store.products;
      if (u.searchParams.get('category')) products = products.filter(p => p.category_id === u.searchParams.get('category'));
      if (u.searchParams.get('q')) products = products.filter(p => p.name.toLowerCase().includes(u.searchParams.get('q').toLowerCase()));
      return json(res, { ...store, products });
    }
    if (path.startsWith('products/')) return json(res, store.products.find(p => p.slug === parts[4]));
    if (path === 'payment-methods') return json(res, { simulation: true, reason: '' });
    if (path === 'cart') return json(res, cart());
    if (path === 'cart/items') {
      const product = store.products.find(p => p.variants.some(v => v.id === body.variant_id)), variant = product?.variants.find(v => v.id === body.variant_id);
      if (!product || !variant) return json(res, { error: 'Variação não encontrada' }, 404);
      cartItems = cartItems.filter(i => i.variant_id !== body.variant_id);
      if (body.quantity) cartItems.push({ variant_id: variant.id, quantity: body.quantity, price_cents: variant.price_cents, name: product.name, sku: variant.sku, available: variant.available, active: true, status: 'ACTIVE' });
      return json(res, cart());
    }
    if (path === 'cart/quotes') return json(res, { id: 'cotacao-sintetica', method: 'Entrega demonstrativa', price_cents: '1500', total_cents: (BigInt(cart().subtotal_cents) + 1500n).toString(), expires_at: new Date(Date.now() + 600000).toISOString(), days: 3 });
    if (path === 'cart/checkout') {
      confirmations.push(body);
      if (checkoutMode === 'unknown') return json(res, { error: 'Erro temporário sintético' }, 503);
      orderBody = body; return json(res, { id: orderId });
    }
    if (path === `orders/${orderId}` && orderBody) {
      const now = new Date().toISOString();
      return json(res, { id: orderId, number: '10', order_status: 'OPEN', payment_status: 'PENDING', fulfillment_status: 'UNFULFILLED', dispute_status: 'NONE', subtotal_cents: cart().subtotal_cents, shipping_cents: '1500', total_cents: orderBody.total_cents, created_at: now, reservation_expires_at: new Date(Date.now() + 2400000).toISOString(), simulation: true, buyer: orderBody.buyer, address: orderBody.address, supplier: store.theme.supplier, shipping: { name: 'Entrega demonstrativa', kind: 'TABLE', days: 3 }, items: cartItems.map(i => ({ ...i, snapshot: { name: i.name, sku: i.sku, attributes: {} } })), attempts: [], incidents: [], protocols: [], shipment: null });
    }
    throw Error(`Fixture ausente: ${req.method} ${path}`);
  } catch (e) { fixtureErrors.push(e.message); json(res, { error: 'Fixture falhou' }, 500); }
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const apiUrl = `http://127.0.0.1:${api.address().port}`;
const port = Number(process.env.WEB_TEST_PORT || 3411), base = `http://127.0.0.1:${port}`;
let serverOutput = '';
const web = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/web', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, API_INTERNAL_URL: apiUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
web.stdout.on('data', chunk => serverOutput += chunk); web.stderr.on('data', chunk => serverOutput += chunk);
let browser;
const checks = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { if (web.exitCode !== null) throw Error(serverOutput); try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  if (!ready) throw Error('Next não iniciou: ' + serverOutput);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  // Rewrites são fixados no build; encaminha chamadas do navegador à mesma API sintética do SSR.
  await context.route('**/api/public/stores/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${apiUrl}${url.pathname.replace(/^\/api/, '')}${url.search}` });
    await route.fulfill({ response });
  });
  const page = await context.newPage(), pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  async function check(label, width, capture = false, fullPage = false) {
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
    expect(overflow, `${label}: rolagem horizontal`).toBeLessThanOrEqual(0);
    expect(pageErrors).toEqual([]);
    expect(fixtureErrors).toEqual([]);
    if (capture) await page.screenshot({ path: `${out}/${label}-${width}.jpg`, type: 'jpeg', quality: 78, fullPage });
    checks.push({ label, width, overflow, pageErrors: [...pageErrors] });
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const preset of Object.keys(stores)) {
      await page.goto(`${base}/lojas/${preset}`);
      await expect(page.locator('.surface-store')).toHaveAttribute('data-preset', preset);
      await expect(page.getByRole('heading', { name: titles[preset], exact: true })).toHaveCount(1);
      await expect(page.locator('.card').first()).toBeVisible();
      await check(`loja-${preset}`, width, [390, 1440].includes(width));
      if (preset !== 'essencial') {
        await page.getByRole('button', { name: 'Mostrar busca', exact: true }).click();
        await expect(page.getByRole('searchbox', { name: 'Buscar produtos' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'Mostrar busca', exact: true })).toBeFocused();
      }
      if (width < 1024) {
        const opener = page.getByRole('button', { name: 'Menu da loja', exact: true });
        await opener.click(); await expect(opener).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByRole('dialog', { name: 'Menu da loja' })).toBeVisible();
        await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
        await expect(opener).toHaveAttribute('aria-expanded', 'false');
      }
    }
    await page.goto(`${base}/lojas/atelie/produtos/produto-0`);
    await expect(page.getByRole('heading', { name: 'Vaso de cerâmica', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Próxima imagem', exact: true }).click();
    await expect(page.locator('.gallery-count')).toHaveText('2 de 2');
    await page.getByRole('button', { name: 'Mostrar imagem 1 de 2', exact: true }).click();
    await expect(page.locator('.gallery-count')).toHaveText('1 de 2');
    await expect(page.getByRole('radio', { name: /Outra opção/ })).toBeDisabled();
    await check('produto', width, [390, 1440].includes(width), width === 390);
    cartItems = []; confirmations = []; orderBody = null; checkoutMode = 'success';
    await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(/adicionado ao carrinho\./i);
    await page.getByRole('link', { name: 'Ver carrinho', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Seu carrinho', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continuar comprando', exact: true })).toBeVisible();
    await expect(page.locator('.steps [aria-current="step"]')).toContainText('Entrega');
    for (const label of ['Carrinho', 'Entrega', 'Seus dados', 'Revisão']) await expect(page.locator('.steps .l').filter({ hasText: label })).toBeVisible();
    await check('carrinho', width);
    await page.getByLabel('CEP', { exact: true }).fill('53600000');
    await page.getByLabel('Rua', { exact: true }).fill('Rua de demonstração');
    await page.getByLabel('Número', { exact: true }).fill('10');
    await page.getByLabel('Cidade', { exact: true }).fill('Igarassu');
    await page.getByLabel('UF', { exact: true }).fill('PE');
    await page.getByRole('button', { name: 'Calcular frete', exact: true }).click();
    await expect(page.locator('.steps [aria-current="step"]')).toContainText('Seus dados');
    await expect(page.getByRole('heading', { name: 'Seus dados', exact: true })).toBeFocused();
    await page.getByLabel('Nome completo', { exact: true }).fill('Comprador demonstrativo');
    await page.getByLabel('E-mail para comprovante', { exact: true }).fill('comprador@example.test');
    await page.getByRole('button', { name: 'Revisar pedido', exact: true }).click();
    await expect(page.locator('.steps [aria-current="step"]')).toContainText('Revisão');
    await expect(page.getByRole('heading', { name: 'Revise antes de confirmar', exact: true })).toBeFocused();
    await check('checkout-revisao', width, [390, 1440].includes(width), true);
    checkoutMode = 'unknown';
    await page.getByRole('button', { name: /Confirmar compra de/ }).click();
    await expect(page.getByText('Não sabemos se a compra foi registrada', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Corrigir dados', exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByText('Não sabemos se a compra foi registrada', { exact: true })).toBeVisible();
    checkoutMode = 'success';
    await page.getByRole('button', { name: 'Verificar compra', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pedido nº 10', exact: true })).toBeVisible();
    expect(confirmations).toHaveLength(2);
    expect(confirmations[0]).toEqual(confirmations[1]);
    await expect(page.getByText('Aguardando confirmação do pagamento', { exact: true })).toBeVisible();
    await check('comprovante', width);
  }
  await page.goto(`${base}/lojas/essencial`);
  await expect(page.locator('.store-header .store-title')).toContainText('Essencial Casa Digital');
  await expect(page.locator('.store-header .store-title')).not.toContainText('Barro & Trama');
  cartItems = [];
  await page.goto(`${base}/lojas/essencial/carrinho`);
  await expect(page.getByText('Seu carrinho está vazio', { exact: true })).toBeVisible();
  await expect(page.locator('.steps')).toHaveCount(0);
  await writeFile(`${out}/resultado.json`, JSON.stringify({ scope: 'Frontend SSR + navegador com servidor HTTP sintético; sem RLS/gateways reais', checks, scenarios: ['presets e reflow', 'busca com foco e Escape', 'menu modal com foco e estado', 'galeria e opção esgotada', 'adicionar item e calcular entrega', 'dados e revisão com foco', '503 sem conclusão, recarga e mesma intenção/chave na verificação', 'comprovante aguarda confirmação', 'troca de vitrine e carrinho vazio'] }, null, 2));
  console.log(`Aprovado: ${checks.length} cenários de reflow, 10 capturas e fluxo simulado completo com recuperação da confirmação incerta.`);
} finally {
  if (browser) await browser.close();
  web.kill('SIGTERM');
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
