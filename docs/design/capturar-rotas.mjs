#!/usr/bin/env node
// Captura as rotas REAIS do aplicativo (não o protótipo) com dados sintéticos e grava evidências.
// Uso: node docs/design/capturar-rotas.mjs <rótulo> [--base=http://localhost:3000] [--widths=390,768,1440] [--only=R03,R10]
// Requer: aplicação local rodando, .local/demo-ui.json gerado por docs/design/ferramentas/dados-demo.mjs (+ admin-demo.mjs),
// Playwright com Chromium disponível (não instala nada). Saída: docs/design/evidencias/<rótulo>/*.jpg e resultado.json.
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const require = createRequire(import.meta.url);
let playwright;
for (const c of ['/opt/node22/lib/node_modules/playwright', 'playwright', join(repo, 'node_modules/playwright')]) { try { playwright = require(c); break; } catch { /* próximo */ } }
if (!playwright) { console.error('Playwright não encontrado; nada capturado.'); process.exit(2); }
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const label = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'depois';
const base = arg('base', 'http://localhost:3000');
const widths = arg('widths', '390,768,1440').split(',').map(Number);
const only = arg('only', '').split(',').filter(Boolean);
const demo = JSON.parse(readFileSync(join(repo, '.local/demo-ui.json'), 'utf8'));
const out = join(here, 'evidencias', label);
mkdirSync(out, { recursive: true });

// --- Autenticação das personas pela API (mesmos endpoints da interface) ---
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const fromB32 = (v) => { let bits = ''; for (const c of v) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); };
const totp = (s, step) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step)); const h = createHmac('sha1', fromB32(s)).update(c).digest(), o = h[h.length - 1] & 15; return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0'); };
let lastStep = 0;
async function login({ email, password, secret }) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  const body = await r.json(); const [name, value] = r.headers.get('set-cookie').split(';')[0].split('=');
  if (secret) {
    let step = Math.floor(Date.now() / 30000); if (step <= lastStep) { await new Promise((x) => setTimeout(x, (lastStep + 1) * 30000 - Date.now() + 500)); step = lastStep + 1; }
    lastStep = step;
    const v = await fetch(`${base}/api/auth/mfa/verify`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', cookie: `${name}=${value}`, 'x-csrf-token': body.csrf }, body: JSON.stringify({ code: totp(secret, step) }) });
    if (!v.ok) throw new Error(`mfa ${v.status}`);
  }
  return [{ name, value, url: base }];
}
const cookieOf = (raw) => { const [name, value] = raw.split('='); return [{ name, value, url: base }]; };
const personas = {
  anon: async () => [],
  owner: () => login(demo.storeA),
  ownerB: () => login(demo.storeB),
  employee: () => login(demo.employee),
  admin: () => login(demo.admin),
  buyerPending: async () => cookieOf(demo.orders.pending.cookie),
  buyerPaid: async () => cookieOf(demo.orders.paid.cookie),
  buyerRejected: async () => cookieOf(demo.orders.rejected.cookie),
  buyerExcess: async () => cookieOf(demo.orders.excess.cookie),
};
const A = demo.storeA, Bs = demo.storeB, O = demo.orders;
const clickText = (name) => async (page) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(1200); };
// --- Cenários (código da rota no inventário de TELAS-E-FLUXOS.md) ---
const scenarios = [
  { id: 'R01-acesso', route: 'R01', persona: 'anon', path: '/' },
  { id: 'R01-lojas', route: 'R01', persona: 'owner', path: '/' },
  { id: 'R02-produtos', route: 'R02', persona: 'owner', path: `/painel/${A.id}` },
  { id: 'R02-produto-editar', route: 'R02', persona: 'owner', path: `/painel/${A.id}?produto=${A.products.long}` },
  { id: 'R02-funcionario', route: 'R02', persona: 'employee', path: `/painel/${A.id}` },
  { id: 'R02-novo-erro', route: 'R02', persona: 'owner', path: `/painel/${A.id}?novo=1`, act: async (page) => { const f = page.getByRole('form', { name: 'Cadastrar produto' }); await f.getByLabel('Nome', { exact: true }).fill('Produto com SKU repetido TESTE'); await f.getByLabel('SKU').fill('aurora-CAFE-001'); await f.getByLabel('Preço').fill('19,9'); await f.getByRole('button', { name: 'Cadastrar produto' }).click(); await page.getByRole('alert').first().waitFor(); } },
  { id: 'R02-estoque', route: 'R02', persona: 'owner', path: `/painel/${A.id}?aba=estoque` },
  { id: 'R02-midia', route: 'R02', persona: 'owner', path: `/painel/${A.id}?aba=midia` },
  { id: 'R02-organizacao', route: 'R02', persona: 'owner', path: `/painel/${A.id}?aba=organizacao` },
  { id: 'R02-vitrine', route: 'R02', persona: 'owner', path: `/painel/${A.id}?aba=vitrine` },
  { id: 'R02-vitrine-b-contraste', route: 'R02', persona: 'ownerB', path: `/painel/${Bs.id}?aba=vitrine` },
  { id: 'R02-frete', route: 'R02', persona: 'owner', path: `/painel/${A.id}?aba=frete` },
  { id: 'R03-pedidos', route: 'R03', persona: 'owner', path: `/painel/${A.id}/pedidos` },
  { id: 'R03-pedido-excedente', route: 'R03', persona: 'owner', path: `/painel/${A.id}/pedidos?pedido=${O.excess.id}`, legacy: clickText(`Nº ${O.excess.number}`) },
  { id: 'R03-pedido-pendente', route: 'R03', persona: 'owner', path: `/painel/${A.id}/pedidos?pedido=${O.pending.id}`, legacy: clickText(`Nº ${O.pending.number}`) },
  { id: 'R03-pedidos-filtro', route: 'R03', persona: 'owner', path: `/painel/${A.id}/pedidos?pending=true` },
  { id: 'R03-pedido-funcionario', route: 'R03', persona: 'employee', path: `/painel/${A.id}/pedidos?pedido=${O.excess.id}` },
  { id: 'R04-atendimento', route: 'R04', persona: 'owner', path: `/painel/${A.id}/atendimento` },
  { id: 'R04-protocolo', route: 'R04', persona: 'owner', path: `/painel/${A.id}/atendimento?protocolo=${demo.support?.withdrawal}` },
  { id: 'R05-operacao', route: 'R05', persona: 'owner', path: `/painel/${A.id}/operacao` },
  { id: 'R06-plataforma', route: 'R06', persona: 'admin', path: '/plataforma' },
  { id: 'R07-preview', route: 'R07', persona: 'owner', path: `/preview/${A.id}` },
  { id: 'R08-vitrine-a', route: 'R08', persona: 'anon', path: `/lojas/${A.slug}` },
  { id: 'R08-vitrine-b', route: 'R08', persona: 'anon', path: `/lojas/${Bs.slug}` },
  { id: 'R08-busca-vazia', route: 'R08', persona: 'anon', path: `/lojas/${A.slug}?q=inexistente` },
  { id: 'R09-categoria', route: 'R09', persona: 'anon', path: `/lojas/${A.slug}/categorias/colecao` },
  { id: 'R10-produto', route: 'R10', persona: 'anon', path: `/lojas/${A.slug}/produtos/camiseta` },
  { id: 'R10-produto-longo', route: 'R10', persona: 'anon', path: `/lojas/${A.slug}/produtos/jogo-xicaras-longo` },
  { id: 'R10-produto-b', route: 'R10', persona: 'anon', path: `/lojas/${Bs.slug}/produtos/camiseta` },
  { id: 'R11-pagina', route: 'R11', persona: 'anon', path: `/lojas/${A.slug}/paginas/sobre` },
  { id: 'R12-carrinho-vazio', route: 'R12', persona: 'anon', path: `/lojas/${A.slug}/carrinho` },
  { id: 'R12-carrinho', route: 'R12', persona: 'buyerPaid', path: `/lojas/${A.slug}/carrinho` },
  { id: 'R13-pendente', route: 'R13', persona: 'buyerPending', path: `/lojas/${A.slug}/pedidos/${O.pending.id}` },
  { id: 'R13-recusado', route: 'R13', persona: 'buyerRejected', path: `/lojas/${A.slug}/pedidos/${O.rejected.id}` },
  { id: 'R13-nao-autorizado', route: 'R13', persona: 'anon', path: `/lojas/${A.slug}/pedidos/${O.paid.id}` },
  { id: 'R14-atendimento', route: 'R14', persona: 'anon', path: `/lojas/${A.slug}/atendimento` },
].filter((s) => !only.length || only.includes(s.route) || only.includes(s.id));

const browser = await playwright.chromium.launch();
const results = [];
const cookies = {};
for (const s of scenarios) {
  cookies[s.persona] ??= await personas[s.persona]();
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    if (cookies[s.persona].length) await context.addCookies(cookies[s.persona]);
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
    let status = 0;
    try {
      const response = await page.goto(base + s.path, { waitUntil: 'load', timeout: 30000 });
      status = response?.status() || 0;
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(600);
      if (s.legacy && process.argv.includes('--legacy')) await s.legacy(page);
      if (s.act && !process.argv.includes('--legacy')) await s.act(page);
      await page.evaluate(() => document.fonts.ready);
      const report = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const unnamed = [...document.querySelectorAll('input:not([type=hidden]),select,textarea,button')].filter((e) => {
          if (e.closest('[hidden]') || e.offsetParent === null) return false;
          const n = e.getAttribute('aria-label') || e.labels?.[0]?.textContent || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent) || (e.tagName === 'BUTTON' && e.textContent);
          return !n || !n.trim();
        }).length;
        const small = [...document.querySelectorAll('main button, main a.btn, main [role=button], main input[type=radio]+label, main input[type=checkbox]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24); }).length;
        return { overflow, unnamed, small, title: document.title, h1: document.querySelector('h1')?.textContent?.trim() || '' };
      });
      await page.screenshot({ path: join(out, `${s.id}-${width}.jpg`), type: 'jpeg', quality: 60, fullPage: true });
      results.push({ ...s, legacy: undefined, act: undefined, width, status, ...report, errors });
      console.log(`${s.id} ${width}px · HTTP ${status} · overflow ${report.overflow}px · sem nome ${report.unnamed} · alvos<24 ${report.small} · erros ${errors.length} · h1 "${report.h1.slice(0, 50)}"`);
    } catch (e) {
      results.push({ ...s, legacy: undefined, act: undefined, width, status, failure: e.message.slice(0, 300), errors });
      console.log(`${s.id} ${width}px · FALHA ${e.message.slice(0, 120)}`);
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(join(out, 'resultado.json'), JSON.stringify({ label, base, date: new Date().toISOString(), note: 'Dados sintéticos (example.test); pagamentos SIMULADOS.', results }, null, 2));
