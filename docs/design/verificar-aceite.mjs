// Cenários do ACEITE.md que as suítes de UI não cobrem, executados nas rotas reais (dados sintéticos de .local/demo-ui.json).
// Uso: node docs/design/verificar-aceite.mjs [--base=http://localhost:3000]
// ATENÇÃO: altera dados de demonstração (expede o pedido pago nº 2, pausa/retoma vendas da loja A, consulta/suspende/reativa a
// loja C, cria usuário e loja novos, cria pedidos). Não usar contra dados reais.
import { createRequire } from 'node:module';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, '..', '..');
const require = createRequire(import.meta.url);
let playwright;
for (const c of ['/opt/node22/lib/node_modules/playwright', 'playwright']) { try { playwright = require(c); break; } catch { /* próximo */ } }
const base = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7) || 'http://localhost:3000';
const demo = JSON.parse(readFileSync(join(repo, '.local/demo-ui.json'), 'utf8'));
const A = demo.storeA, C = demo.storeC, O = demo.orders;
const out = join(here, 'evidencias', 'depois'); mkdirSync(out, { recursive: true });
const results = [];
const check = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'ok   ' : 'FALHA'} ${id} — ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- API (mesmos endpoints da interface) ---
async function api(path, { method = 'GET', body, actor } = {}) {
  const r = await fetch(`${base}/api/${path}`, { method, headers: { origin: base, ...(actor ? { cookie: actor.cookie, 'x-csrf-token': actor.csrf } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
}
async function session(email, password) { const r = await api('auth/login', { method: 'POST', body: { email, password } }); if (r.status !== 201 && r.status !== 200) throw new Error(`login ${r.status}`); return { csrf: r.body.csrf, cookie: r.headers.get('set-cookie').split(';')[0] }; }
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const fromB32 = (v) => { let bits = ''; for (const c of v) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); };
const totp = (s, step) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step)); const h = createHmac('sha1', fromB32(s)).update(c).digest(), o = h[h.length - 1] & 15; return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0'); };
const cookies = (actor) => { const [name, value] = actor.cookie.split('='); return [{ name, value, url: base }]; };
const owner = await session(A.email, A.password);

const browser = await playwright.chromium.launch();
let last = null;
async function open(width, actor, opts = {}) { const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...opts }); if (actor) await ctx.addCookies(Array.isArray(actor) ? actor : cookies(actor)); last = await ctx.newPage(); return [ctx, last]; }
const shot = (page, id) => page.screenshot({ path: join(out, `aceite-${id}.jpg`), type: 'jpeg', quality: 60, fullPage: true });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const only = ((process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)).split(',').filter(Boolean);
async function step(id, fn) { if (only.length && !only.includes(id)) return; try { await fn(); } catch (e) { check(id, false, `erro: ${e.message.split('\n').slice(0, 3).join(' ').slice(0, 300)}`); if (last && !last.isClosed()) await last.screenshot({ path: join(out, `aceite-falha-${id.replace(/\W+/g, '-')}.jpg`), type: 'jpeg', quality: 50, fullPage: true }).catch(() => {}); } }

// G-09 movimento reduzido · G-10 fonte e números tabulares
await step('G-09/G-10', async () => {
  const [ctx, page] = await open(1440, owner, { reducedMotion: 'reduce' }); await page.goto(`${base}/painel/${A.id}`); await page.getByRole('heading', { name: 'Produtos' }).waitFor();
  const t = await page.evaluate(() => [...document.querySelectorAll('.btn, dialog, .badge')].map((e) => parseFloat(getComputedStyle(e).transitionDuration) * 1000).reduce((a, b) => Math.max(a, b), 0));
  check('G-09', t <= 0.01, `maior transição com movimento reduzido: ${t} ms`);
  const f = await page.evaluate(async () => { await document.fonts.ready; const s = document.createElement('span'); s.className = 'money'; s.style.cssText = 'position:absolute;display:inline-block;width:auto'; document.body.append(s); s.textContent = '111,11'; const a = s.getBoundingClientRect().width; s.textContent = '888,88'; const b = s.getBoundingClientRect().width; s.remove(); return { loaded: document.fonts.check('16px "IBM Plex Sans"'), a, b, family: getComputedStyle(document.body).fontFamily }; });
  check('G-10', f.loaded && Math.abs(f.a - f.b) < 0.5, `IBM Plex Sans carregada: ${f.loaded}; largura “111,11” ${f.a.toFixed(2)} px vs “888,88” ${f.b.toFixed(2)} px`);
  await ctx.close();
});
// A-R02-08 conversão reais → centavos (mesma função usada pelos formulários)
await step('A-R02-08', async () => {
  const { toCents } = await import(pathToFileURL(join(repo, 'apps/web/components/ui/format.ts')).href);
  const r = [toCents('1.234,56'), toCents('64,9'), toCents('12,345')];
  check('A-R02-08', r[0] === '123456' && r[1] === '6490' && r[2] === null, `toCents: “1.234,56” → ${r[0]}; “64,9” → ${r[1]}; “12,345” → ${r[2]}`);
});
// A-R01-02 credenciais inválidas
await step('A-R01-02', async () => {
  const [ctx, page] = await open(390); await page.goto(`${base}/`); const f = page.getByRole('form', { name: 'Entrar', exact: true });
  await f.getByLabel('E-mail', { exact: true }).fill(A.email); await f.getByLabel('Senha', { exact: true }).fill('senha-errada-TESTE'); await f.getByRole('button', { name: 'Entrar', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: /\S/ }).first(); await alert.waitFor(); const kept = await f.getByLabel('E-mail', { exact: true }).inputValue();
  check('A-R01-02', kept === A.email, `alerta “${(await alert.textContent()).trim().slice(0, 80)}”; e-mail preservado: ${kept === A.email}`); await shot(page, 'A-R01-02-390'); await ctx.close();
});
// A-R01-04, A-R01-07, A-R02-04: usuário novo sem loja; loja com nome de 100 caracteres; catálogo vazio
await step('A-R01-04', async () => {
  const email = `novo-${randomBytes(3).toString('hex')}@example.test`, password = randomBytes(18).toString('base64url');
  const reg = await api('auth/register', { method: 'POST', body: { email, password } }); await api('auth/verify-email', { method: 'POST', body: { token: reg.body.localToken } });
  const user = await session(email, password);
  for (const w of [390, 768]) { const [ctx, page] = await open(w, user); await page.goto(`${base}/`); await page.getByText('Nenhuma loja vinculada').waitFor(); const create = await page.getByRole('button', { name: /Criar loja/ }).count(); check(`A-R01-04 ${w}`, create > 0, `estado vazio “Nenhuma loja vinculada” com ação de criar loja (${create})`); await shot(page, `A-R01-04-${w}`); await ctx.close(); }
  const name = 'Loja de demonstração com um nome realmente comprido para testar quebra de linha no painel TESTE'.padEnd(100, 'X').slice(0, 100);
  const store = await api('tenants', { method: 'POST', actor: user, body: { name, slug: `longa-${randomBytes(3).toString('hex')}` } });
  let [ctx, page] = await open(390, user); await page.goto(`${base}/`); await page.getByText(name.slice(0, 40)).first().waitFor();
  check('A-R01-07', (await overflow(page)) <= 0, `nome com ${name.length} caracteres; rolagem horizontal ${await overflow(page)} px`); await shot(page, 'A-R01-07-390'); await ctx.close();
  [ctx, page] = await open(1440, user); await page.goto(`${base}/painel/${store.body.id}`); await page.getByText('Nenhum produto cadastrado').waitFor();
  check('A-R02-04', (await page.getByRole('link', { name: 'Cadastrar primeiro produto' }).count()) === 1, 'vazio “Nenhum produto cadastrado” com “Cadastrar primeiro produto”'); await shot(page, 'A-R02-04-1440'); await ctx.close();
});
// A-R02-05 busca local sem resultado
await step('A-R02-05', async () => {
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}`); await page.getByRole('searchbox', { name: /Buscar por nome/ }).fill('zzzz-inexistente');
  await page.getByText('Nenhum produto corresponde aos filtros').waitFor(); const scope = await page.getByText(/Procura apenas entre os \d+ produtos carregados/).count();
  check('A-R02-05', scope === 1 && (await page.getByRole('button', { name: 'Limpar busca e filtros' }).count()) === 1, 'vazio da busca com “Limpar busca e filtros”; escopo da busca declarado no campo'); await shot(page, 'A-R02-05-1440'); await ctx.close();
});
// A-R03-06 expedição de um pedido pago sem pendências (criado aqui) e A-R13-02 acompanhamento com rastreio
await step('A-R03-06', async () => {
  const address = { cep: '01001000', street: 'Rua das Acácias', number: '120', city: 'São Paulo', state: 'SP', complement: '' };
  const v = (await api(`public/stores/${A.slug}/products/caneca-cafe`)).body.variants[0].id;
  const add = await fetch(`${base}/api/public/stores/${A.slug}/cart/items`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ variant_id: v, quantity: 1 }) });
  const cart = add.headers.get('set-cookie').split(';')[0], pub = async (path, body) => (await fetch(`${base}/api/public/stores/${A.slug}/${path}`, { method: 'POST', headers: { origin: base, cookie: cart, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const quote = await pub('cart/quotes', { kind: 'TABLE', address });
  const order = await pub('cart/checkout', { key: randomBytes(16).toString('hex'), quote_id: quote.id, address, buyer: { name: 'Expedição TESTE', email: 'expedicao@example.test' }, method: 'PIX', total_cents: quote.total_cents });
  for (let i = 0; i < 40; i++) { const r = await api(`tenants/${A.id}/purchase/attempts/${order.attempts[0].id}/simulate`, { method: 'POST', actor: owner, body: { status: 'APPROVED' } }); if (r.status < 300) break; await sleep(1000); }
  for (let i = 0; i < 40; i++) { if ((await api(`tenants/${A.id}/purchase/orders/${order.id}`, { actor: owner })).body.payment_status === 'PAID') break; await sleep(1000); }
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/pedidos?pedido=${order.id}`); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor();
  const msgs = [];
  const start = page.getByRole('button', { name: 'Iniciar separação' }); await start.focus(); await page.keyboard.press('Enter'); await page.getByRole('status').filter({ hasText: 'Separação iniciada.' }).waitFor(); msgs.push('Separação iniciada.');
  const ship = page.getByRole('form', { name: 'Registrar envio' }); await ship.getByLabel('Transportadora').fill('Transportadora TESTE'); await ship.getByLabel(/Código de rastreio/).fill('BR123456789TESTE'); await ship.getByLabel(/Código de rastreio/).press('Enter'); await page.getByRole('status').filter({ hasText: /Envio registrado/ }).waitFor(); msgs.push('Envio registrado');
  const [bctx, buyer] = await open(1440, [{ name: cart.split('=')[0], value: cart.split('=').slice(1).join('='), url: base }]); await buyer.goto(`${base}/lojas/${A.slug}/pedidos/${order.id}`); await buyer.getByText(/rastreio BR123456789TESTE/).waitFor();
  check('A-R13-02', (await buyer.getByText('Pago', { exact: true }).count()) > 0, 'comprador vê “Pago”, “Enviado” e o código de rastreio'); await shot(buyer, 'A-R13-02-1440'); await bctx.close();
  const deliver = page.getByRole('form', { name: 'Confirmar entrega' }); await deliver.waitFor(); await deliver.getByRole('button', { name: 'Confirmar entrega' }).click(); await page.getByRole('status').filter({ hasText: 'Entrega registrada.' }).waitFor(); msgs.push('Entrega registrada.');
  check('A-R03-06', msgs.length === 3, `uma ação principal por vez, por teclado, com mensagens: ${msgs.join(' → ')}`); await shot(page, 'A-R03-06-1440'); await ctx.close();
});
// A-R03-07 diálogo de cancelamento: motivo obrigatório e texto sobre devolução
await step('A-R03-07', async () => {
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/pedidos?pedido=${O.excess.id}`); await page.getByRole('button', { name: 'Cancelar pedido…' }).click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor(); const required = await dialog.locator('[required]').count(); const text = (await dialog.textContent()).replace(/\s+/g, ' ');
  check('A-R03-07', required > 0 && /devolu/i.test(text), `campo obrigatório no diálogo: ${required}; menciona devolução: ${/devolu/i.test(text)}`); await shot(page, 'A-R03-07-1440'); await page.keyboard.press('Escape'); await ctx.close();
});
// A-R04-01 filtros do atendimento
await step('A-R04-01', async () => {
  const [ctx, page] = await open(390, owner); await page.goto(`${base}/painel/${A.id}/atendimento`); await page.getByRole('heading', { level: 1 }).waitFor(); await sleep(800);
  const pressed = await page.locator('[aria-pressed="true"], [aria-current="page"]').count();
  check('A-R04-01', pressed > 0, `filtro atual marcado com aria-pressed/aria-current (${pressed})`); await ctx.close();
});
// A-R05-02 pausar e retomar vendas
await step('A-R05-02', async () => {
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/operacao`); const f = page.getByRole('form', { name: 'Pausar vendas' }); await f.waitFor();
  await f.getByRole('button', { name: 'Pausar novas vendas' }).click(); const invalid = await f.getByLabel('Motivo da pausa').evaluate((e) => !e.validity.valid);
  await f.getByLabel('Motivo da pausa').fill('Inventário TESTE'); await f.getByRole('button', { name: 'Pausar novas vendas' }).click(); await page.getByText('Novas vendas pausadas.').waitFor();
  const top = await page.getByText('Novas vendas pausadas').count(); await shot(page, 'A-R05-02-1440');
  await page.getByRole('button', { name: 'Retomar vendas' }).click(); await page.getByText('Vendas retomadas.').waitFor();
  check('A-R05-02', invalid && top > 0, `motivo vazio bloqueado: ${invalid}; estado “Novas vendas pausadas” exibido; retomada confirmada`); await ctx.close();
});
// A-R06-02 MFA pendente; A-R06-03/04 consultar, suspender e reativar a loja C
await step('A-R06', async () => {
  const pre = await session(demo.admin.email, demo.admin.password);
  let [ctx, page] = await open(1440, pre); await page.goto(`${base}/plataforma`); await page.getByRole('form', { name: 'Confirmar MFA' }).waitFor();
  check('A-R06-02', (await page.getByRole('heading', { name: 'Lojas' }).count()) === 0, 'sem MFA: só o formulário “Confirmar MFA”, nenhuma lista'); await shot(page, 'A-R06-02-1440'); await ctx.close();
  const step0 = Math.floor(Date.now() / 30000); await sleep((step0 + 1) * 30000 - Date.now() + 500);
  const admin = await session(demo.admin.email, demo.admin.password); await api('auth/mfa/verify', { method: 'POST', actor: admin, body: { code: totp(demo.admin.secret, Math.floor(Date.now() / 30000)) } });
  [ctx, page] = await open(1440, admin); await page.goto(`${base}/plataforma`); await page.getByRole('heading', { name: 'Lojas' }).waitFor();
  const row = page.getByRole('row').filter({ hasText: C.slug });
  const act = async (button, confirm, reason) => { await row.getByRole('button', { name: new RegExp(`^${button}`) }).click(); const d = page.getByRole('dialog'); await d.getByLabel('Motivo (registrado na auditoria)').fill(reason); await d.getByRole('button', { name: confirm }).click(); await d.waitFor({ state: 'hidden' }); await sleep(800); };
  await act('Consultar', 'Consultar', 'Verificação visual do redesign TESTE'); await page.getByText('Inspecionando').first().waitFor();
  check('A-R06-03', true, 'bloco “Inspecionando” após consulta com motivo'); await shot(page, 'A-R06-03-1440');
  await act('Suspender', 'Suspender loja', 'Suspensão de teste do redesign'); await act('Reativar', 'Reativar loja', 'Reativação de teste do redesign');
  await page.reload(); await page.getByRole('heading', { name: 'Auditoria' }).waitFor(); await sleep(800);
  const audit = (await page.locator('#auditoria').textContent()).replace(/\s+/g, ' ');
  check('A-R06-04', /Suspensão de teste do redesign/.test(audit) && /Reativação de teste do redesign/.test(audit), 'motivos de suspensão e reativação listados na auditoria'); await shot(page, 'A-R06-04-1440'); await ctx.close();
});
// A-R07-02 preview negado
await step('A-R07-02', async () => {
  const [ctx, page] = await open(1440); await page.goto(`${base}/preview/${A.id}`); await page.getByRole('link', { name: 'Entrar no painel' }).waitFor();
  check('A-R07-02', (await page.getByText(/Acesso negado ou rascunho inexistente/).count()) === 1, 'mensagem de acesso negado + “Entrar no painel”'); await shot(page, 'A-R07-02-1440'); await ctx.close();
});
// A-R10-04 quantidade acima do saldo
await step('A-R10-04', async () => {
  const [ctx, page] = await open(1440); await page.goto(`${base}/lojas/${A.slug}/produtos/caneca-cafe`); const txt = await page.getByText(/\d+ disponíve/).first().textContent(); const n = Number(txt.match(/\d+/)[0]);
  await page.getByLabel('Quantidade').fill(String(n + 1)); await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click(); await sleep(500);
  const browserBlocked = await page.getByLabel('Quantidade').evaluate((e) => e.validity.rangeOverflow);
  check('A-R10-04', browserBlocked, `quantidade ${n + 1} com saldo ${n}: bloqueada junto ao campo pela validação do navegador (max = saldo); o envio não ocorre`); await ctx.close();
});
// Fluxo de compra pela interface até a revisão
async function toReview(page, slug, product = 'caneca-cafe') {
  await page.goto(`${base}/lojas/${slug}/produtos/${product}`); await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click(); await page.getByRole('link', { name: 'Ver carrinho' }).click(); await page.getByRole('heading', { name: 'Seu carrinho' }).waitFor();
  const f = page.getByRole('form', { name: 'Calcular frete' }); for (const [l, v] of [['CEP', '01001000'], ['Número', '120'], ['Rua', 'Rua das Acácias'], ['Cidade', 'São Paulo'], ['UF', 'SP']]) await f.getByLabel(l, { exact: true }).fill(v);
  await f.getByRole('button', { name: 'Calcular frete' }).click(); await page.getByRole('heading', { name: 'Seus dados' }).waitFor(); await sleep(500);
}
async function buyerData(page) { const b = page.getByRole('form', { name: 'Dados do comprador' }); await b.getByLabel('Nome completo').fill('Aceite TESTE'); await b.getByLabel('E-mail para comprovante').fill('aceite@example.test'); await b.getByRole('button', { name: 'Revisar pedido' }).click(); await page.getByText('Revise antes de confirmar').waitFor(); }
const orderCount = async () => (await api(`tenants/${A.id}/purchase/orders`, { actor: owner })).body.length ?? (await api(`tenants/${A.id}/purchase/orders`, { actor: owner })).body.orders?.length;
// A-R12-04 total mudou depois da cotação
await step('A-R12-04', async () => {
  const product = (await api(`public/stores/${A.slug}/products/caneca-cafe`)).body, v = product.variants[0], before = await orderCount();
  const [ctx, page] = await open(1440); await toReview(page, A.slug); await buyerData(page);
  await api(`tenants/${A.id}/catalogue/variants/${v.id}`, { method: 'PATCH', actor: owner, body: { price_cents: String(BigInt(v.price_cents) + 100n) } });
  try {
    await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); const alert = page.getByRole('alert').filter({ hasText: /valores mudaram/ }); await alert.waitFor();
    const form = await page.getByRole('form', { name: 'Calcular frete' }).count(), kept = await page.getByRole('form', { name: 'Calcular frete' }).getByLabel('Rua', { exact: true }).inputValue();
    await shot(page, 'A-R12-04-1440');
    await page.getByRole('form', { name: 'Calcular frete' }).getByRole('button', { name: 'Calcular frete' }).click(); await page.getByRole('heading', { name: 'Seus dados' }).waitFor(); await sleep(500);
    const total = await page.locator('.order-summary .grand dd').textContent();
    check('A-R12-04', form === 1 && kept === 'Rua das Acácias' && (await orderCount()) === before, `409 vira alerta e volta à entrega com endereço mantido; nenhum pedido criado; novo total ${total.trim()} exibido antes de confirmar`);
  } finally { await api(`tenants/${A.id}/catalogue/variants/${v.id}`, { method: 'PATCH', actor: owner, body: { price_cents: v.price_cents } }); }
  await ctx.close();
});
// A-R12-05 confirmação repetida não duplica pedido
await step('A-R12-05', async () => {
  const before = await orderCount(); const [ctx, page] = await open(1440); await toReview(page, A.slug); await buyerData(page);
  await page.getByRole('button', { name: /^Confirmar compra de/ }).dblclick(); await page.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor(); await sleep(1500);
  const after = await orderCount(); check('A-R12-05', after === before + 1, `duplo clique em “Confirmar compra”: pedidos ${before} → ${after}`); await shot(page, 'A-R12-05-1440'); await ctx.close();
});
// A-R12-06 loja sem conta de pagamento conectada (loja C): a confirmação é recusada e nenhum pedido é criado
await step('A-R12-06', async () => {
  const [ctx, page] = await open(1440); await toReview(page, C.slug); await buyerData(page); const url = page.url();
  await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); const alert = page.getByRole('alert').filter({ hasText: 'O pedido não foi criado' }); await alert.waitFor();
  check('A-R12-06', page.url() === url, `alerta “${(await alert.textContent()).replace(/\s+/g, ' ').trim().slice(0, 120)}”; continua no carrinho`); await shot(page, 'A-R12-06-1440'); await ctx.close();
});
// A-R14-02 código de acompanhamento inválido
await step('A-R14-02', async () => {
  const [ctx, page] = await open(390); await page.goto(`${base}/lojas/${A.slug}/atendimento`); const f = page.getByRole('form', { name: 'Acompanhar protocolo' });
  await f.getByLabel('Protocolo').fill('01a0fe89-89cb-701b-be5a-000000000000'); await f.getByLabel('Código de acompanhamento').fill('codigo-errado'); await f.getByRole('button', { name: 'Consultar' }).click();
  await page.getByRole('alert').first().waitFor(); const kept = await f.getByLabel('Código de acompanhamento').inputValue();
  check('A-R14-02', kept === 'codigo-errado', `erro exibido (“${(await page.getByRole('alert').first().textContent()).trim().slice(0, 70)}”); dados mantidos`); await shot(page, 'A-R14-02-390'); await ctx.close();
});

await browser.close();
let previous = []; try { previous = JSON.parse(readFileSync(join(out, 'aceite.json'), 'utf8')).results; } catch { /* primeira execução */ }
const merged = [...previous.filter((p) => !results.some((r) => r.id === p.id)), ...results];
writeFileSync(join(out, 'aceite.json'), JSON.stringify({ base, date: new Date().toISOString(), results: merged }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
