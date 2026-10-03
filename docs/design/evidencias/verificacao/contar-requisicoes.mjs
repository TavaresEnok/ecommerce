import { launch } from '/home/user/ecommerce/docs/design/ambiente/navegador.mjs';
import { readFileSync } from 'node:fs';
const demo = JSON.parse(readFileSync('/home/user/ecommerce/.local/demo-ui.json', 'utf8')), A = demo.storeA;
const r = await fetch(`${demo.base}/api/auth/login`, { method: 'POST', headers: { origin: demo.base, 'content-type': 'application/json' }, body: JSON.stringify({ email: A.email, password: A.password }) });
const [n, v] = r.headers.get('set-cookie').split(';')[0].split('=');
const pages = ['/', `/painel/${A.id}`, `/painel/${A.id}/pedidos`, `/painel/${A.id}/atendimento`, `/painel/${A.id}/operacao`, `/lojas/${A.slug}`, `/lojas/${A.slug}/produtos/camiseta`, `/lojas/${A.slug}/carrinho`];
const b = await launch(), out = {};
for (const [label, base] of [['branch', 'http://localhost:3400'], ['base', 'http://localhost:3401']]) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.addCookies([{ name: n, value: v, url: base }]); const p = await c.newPage();
  let count = 0; const seen = {}; p.on('request', (q) => { const u = new URL(q.url()); if (u.pathname.startsWith('/api/')) { count++; const k = u.pathname.replace(/[0-9a-f-]{36}/g, ':id'); seen[k] = (seen[k] || 0) + 1; } });
  out[label] = {};
  for (const path of pages) { count = 0; await p.goto(base + path); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1500); out[label][path.replace(A.id, 'A').replace(A.slug, 'a')] = count; if (path.startsWith('/painel')) { out[label][path.replace(A.id, 'A') + ' →'] = Object.entries(seen).map(([k, v]) => (v > 1 ? v + '× ' : '') + k).join(', '); } for (const k in seen) delete seen[k]; }
  out[label].total = Object.values(out[label]).filter((x) => typeof x === 'number').reduce((x, y) => x + y, 0); await c.close();
}
// navegação pelo menu do painel na branch (links do Next: a casca não recarrega)
{ const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.addCookies([{ name: n, value: v, url: 'http://localhost:3400' }]); const p = await c.newPage(); let count = 0; p.on('request', (q) => { if (new URL(q.url()).pathname.startsWith('/api/')) count++; });
  await p.goto(`http://localhost:3400/painel/${A.id}`); await p.waitForLoadState('networkidle'); count = 0;
  for (const l of ['Pedidos', 'Atendimento', 'Operação', 'Catálogo']) { await p.getByRole('navigation').getByRole('link', { name: l, exact: true }).first().click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200); }
  out.branchMenu = count; await c.close(); }
console.log(JSON.stringify(out, null, 1)); await b.close();
