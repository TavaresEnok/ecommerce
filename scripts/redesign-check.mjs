// Verifica SOMENTE a UI com respostas sintéticas interceptadas pelo Playwright.
// Não substitui testes de API, RLS, compra ou autorização no servidor.
// Uso: WEB_URL=http://localhost:3400 CHROMIUM_EXECUTABLE=/caminho/chrome node scripts/redesign-check.mjs
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.env.WEB_URL || 'http://localhost:3400';
const out = resolve('docs/design/evidencias/redesign-workspace');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const id = '01990000-0000-7000-8000-000000000001';
const products = [
  ['Vaso de cerâmica', 'ACTIVE', '14900', 18, 'atelie-vaso-barro.jpg'],
  ['Bule verde', 'ACTIVE', '18900', 7, 'atelie-bule-verde.jpg'],
  ['Conjunto de copos', 'DRAFT', '9900', 0, 'atelie-copos.jpg'],
  ['Cachepô artesanal', 'ARCHIVED', '7900', 3, 'atelie-cachepo.jpg'],
  ['Jarro de barro', 'ACTIVE', '12900', 11, 'atelie-jarro.jpg'],
].map(([name, status, price, available, photo], n) => ({ id: `produto-${n}`, name, slug: `produto-${n}`, description: '', status, category_id: 'casa', media: [{ id: `foto-${n}` }], photo, variants: [{ id: `variante-${n}`, sku: `CASA-00${n}`, attributes: {}, is_default: true, active: true, price_cents: price, available }] }));
const catalogue = { products, categories: [{ id: 'casa', name: 'Casa e decoração', slug: 'casa' }], locations: [], inventory: [], movements: [], media: [] };
const status = { suspended: false, sales_paused: false, alerts: [], financial_incidents: 2, payment_uncertain: 1, support_overdue: 0, notifications_failed: 0, notifications_pending: 0 };
const results = [];
async function setup(width, role = 'OWNER', signedIn = true) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text()); });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/', '');
    if (route.request().method() !== 'GET') return route.fulfill({ status: 401, json: { error: { message: 'Credenciais inválidas.' } } });
    if (path.includes('/storefront/media/')) {
      const asset = path.split('/media/')[1].split('/')[0];
      const product = products.find(p => p.media[0].id === asset);
      if (product) return route.fulfill({ contentType: 'image/jpeg', body: await readFile(`scripts/fixtures/fotos/${product.photo}`) });
    }
    let json;
    if (path === 'auth/session') {
      if (!signedIn) return route.fulfill({ status: 401, json: {} });
      json = { user: { email: 'lojista@example.test' }, csrf: 'synthetic-csrf', mfa: { enabled: false, verified: false } };
    } else if (path === 'tenants') json = [{ id, name: 'Barro & Trama', slug: 'barro-trama', role }];
    else if (path.endsWith('/settings')) json = { displayName: 'Barro & Trama', timezone: 'America/Fortaleza' };
    else if (path.endsWith('/operations/status')) json = status;
    else if (path.endsWith('/purchase/accounts')) json = [{ provider: 'SIMULATED', environment: 'SIMULATED', status: 'CONNECTED' }];
    else if (path.endsWith('/catalogue')) json = catalogue;
    else throw new Error(`Endpoint sem fixture: ${path}`);
    await route.fulfill({ json });
  });
  return { page, context, errors };
}
async function capture(page, label, width, errors) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
  expect(overflow, `${label} em ${width}px`).toBeLessThanOrEqual(0);
  expect(errors, `${label}: erros do navegador`).toEqual([]);
  await page.screenshot({ path: `${out}/${label}-${width}.jpg`, type: 'jpeg', quality: 85, fullPage: true });
  results.push({ label, width, overflow, errors: [...errors] });
}
try {
  for (const width of [320, 390, 768, 1440]) {
    const { page, context, errors } = await setup(width, 'OWNER', false);
    await page.goto(base);
    await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
    await capture(page, 'acesso', width, errors);
    await page.getByRole('button', { name: 'Criar acesso', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Criar acesso', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Voltar para entrar' }).click();
    await page.getByLabel('E-mail', { exact: true }).fill('lojista@example.test');
    await page.getByLabel('Senha', { exact: true }).fill('senha-invalida-de-teste');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.locator('.alert[role="alert"]')).toContainText('Credenciais inválidas.');
    await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('lojista@example.test');
    await context.close();

    const fixture = await setup(width);
    await fixture.page.goto(`${base}/painel/${id}`);
    await expect(fixture.page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible();
    await expect(fixture.page.getByRole('status')).toContainText('5 produtos');
    await capture(fixture.page, 'catalogo', width, fixture.errors);
    await fixture.page.getByRole('searchbox').fill('Vaso');
    await expect(fixture.page.getByRole('status')).toContainText('1 de 5 produtos');
    await fixture.page.getByRole('searchbox').fill('');
    await expect(fixture.page.getByRole('status')).toContainText('5 produtos');
    if (width < 768) await fixture.page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await fixture.page.getByRole('button', { name: /^Rascunhos/ }).click();
    await expect(fixture.page.getByRole('status')).toContainText('1 de 5 produtos');
    await fixture.page.goto(`${base}/painel/${id}/operacao`);
    await expect(fixture.page.locator('.metric-value')).toHaveText(['2', '1', '0', '0']);
    await capture(fixture.page, 'hoje', width, fixture.errors);
    if (width < 1024) {
      const opener = fixture.page.getByRole('button', { name: 'Menu', exact: true });
      await opener.click();
      const dialog = fixture.page.getByRole('dialog', { name: 'Menu do painel' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('link', { name: 'Hoje', exact: true })).toBeFocused();
      await fixture.page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
    }
    await fixture.context.close();
  }
  const employee = await setup(1440, 'EMPLOYEE');
  await employee.page.goto(`${base}/painel/${id}/operacao`);
  await expect(employee.page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await expect(employee.page.getByText('Somente o Dono pausa ou retoma as vendas.')).toBeVisible();
  await expect(employee.page.locator('.sidebar').getByRole('link', { name: 'Aparência', exact: true })).toHaveCount(0);
  await employee.context.close();
  await writeFile(`${out}/resultado.json`, JSON.stringify({ scope: 'UI com API sintética; sem integração de backend', captures: results, interactions: ['registro/login inválido e preservação de e-mail', 'busca e filtro na URL', 'contadores retornados pela API', 'menu modal, Escape e retorno de foco', 'ocultação de ações do Dono para Funcionário'] }, null, 2));
  console.log(`Aprovado: ${results.length} capturas, busca/filtro, acesso, menu e visibilidade por papel.`);
} finally { await browser.close(); }
