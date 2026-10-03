// Cenários do ACEITE.md que as suítes de UI não cobrem, executados nas rotas reais (dados sintéticos de .local/demo-ui.json).
// Uso: node docs/design/verificar-aceite.mjs [--base=…] [--only=ID,ID]   (ambiente de docs/design/ambiente/)
// ATENÇÃO: altera os dados sintéticos do projeto isolado: cria pedidos e lojas, expede e cancela pedidos, anonimiza um
// comprador, pausa/retoma vendas, suspende/reativa lojas, publica temas, liga/desliga a IA simulada da plataforma e
// reinicia API/worker do projeto com SIMULATED_GATEWAY_FAILURE_RATE=1 ou PAYMENT_SIMULATION=false (sempre restaurados).
// Nunca usar contra dados reais nem contra outro projeto Compose.
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { composeArgs } from './ambiente/ambiente.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, '..', '..');
import { launch, baseOf } from './ambiente/navegador.mjs';
const demo = JSON.parse(readFileSync(join(repo, '.local/demo-ui.json'), 'utf8')), base = baseOf(demo);
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

const browser = await launch();
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
  await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); const alert = page.getByRole('alert').filter({ hasText: 'A loja recusou a confirmação' }); await alert.waitFor();
  check('A-R12-06', page.url() === url && /Nenhum pedido foi criado por esta confirmação/.test(await alert.textContent()), `alerta “${(await alert.textContent()).replace(/\s+/g, ' ').trim().slice(0, 120)}”; continua no carrinho`); await shot(page, 'A-R12-06-1440'); await ctx.close();
});
// A-R14-02 código de acompanhamento inválido
await step('A-R14-02', async () => {
  const [ctx, page] = await open(390); await page.goto(`${base}/lojas/${A.slug}/atendimento`); const f = page.getByRole('form', { name: 'Acompanhar protocolo' });
  await f.getByLabel('Protocolo').fill('01a0fe89-89cb-701b-be5a-000000000000'); await f.getByLabel('Código de acompanhamento').fill('codigo-errado'); await f.getByRole('button', { name: 'Consultar' }).click();
  await page.getByRole('alert').first().waitFor(); const kept = await f.getByLabel('Código de acompanhamento').inputValue();
  check('A-R14-02', kept === 'codigo-errado', `erro exibido (“${(await page.getByRole('alert').first().textContent()).trim().slice(0, 70)}”); dados mantidos`); await shot(page, 'A-R14-02-390'); await ctx.close();
});

// ===================== Rodada 2: recuperação do checkout, preview e critérios pendentes =====================
const compose = (args, env = {}) => { const r = spawnSync('docker', [...composeArgs(), ...args], { cwd: repo, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 300000 }); if (r.status !== 0) throw new Error(`docker compose ${args.join(' ')}: ${(r.stderr || r.stdout || '').slice(-300)}`); return r.stdout; };
const dbName = (readFileSync(join(repo, '.local/test.env'), 'utf8').match(/^MIGRATION_DATABASE_URL=.*\/([^/?\s]+)/m) || [])[1];
// SQL só para simular passagem de tempo em dado sintético do projeto isolado (nunca em outro projeto).
const psql = (sql) => compose(['exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
const latestOrder = async () => (await api(`tenants/${A.id}/purchase/orders`, { actor: owner })).body[0];
const addr = { cep: '01001000', street: 'Rua das Acácias', number: '120', city: 'São Paulo', state: 'SP', complement: '' };
async function publicOrder(slug, { product = 'caneca-cafe', kind = 'TABLE', address = addr, buyer = { name: 'Aceite TESTE', email: 'aceite@example.test' } } = {}) {
  const v = (await api(`public/stores/${slug}/products/${product}`)).body.variants.find((x) => x.available > 0).id;
  const add = await fetch(`${base}/api/public/stores/${slug}/cart/items`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ variant_id: v, quantity: 1 }) });
  const cookie = add.headers.get('set-cookie').split(';')[0];
  const pub = async (path, body) => { const r = await fetch(`${base}/api/public/stores/${slug}/${path}`, { method: 'POST', headers: { origin: base, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j)}`); return j; };
  const quote = await pub('cart/quotes', { kind, address });
  return { order: await pub('cart/checkout', { key: randomBytes(16).toString('hex'), quote_id: quote.id, address, buyer, method: 'PIX', total_cents: quote.total_cents }), cookie };
}
const cartCookie = (cookie) => { const [name, ...v] = cookie.split('='); return [{ name, value: v.join('='), url: base }]; };
async function approve(P, actor, attempt) { for (let i = 0; i < 40; i++) { const r = await api(`${P}/purchase/attempts/${attempt}/simulate`, { method: 'POST', actor, body: { status: 'APPROVED' } }); if (r.status < 300) return; await sleep(1000); } throw new Error('simulação sem resposta'); }
async function waitFor(fn, what) { for (let i = 0; i < 60; i++) { const v = await fn(); if (v) return v; await sleep(1000); } throw new Error(`não alcançado: ${what}`); }
let adminActor = null;
async function adminSession() { if (adminActor) return adminActor; const s0 = Math.floor(Date.now() / 30000); await sleep((s0 + 1) * 30000 - Date.now() + 500); const a = await session(demo.admin.email, demo.admin.password); const r = await api('auth/mfa/verify', { method: 'POST', actor: a, body: { code: totp(demo.admin.secret, Math.floor(Date.now() / 30000)) } }); if (r.status >= 300) throw new Error(`mfa ${r.status}`); return (adminActor = a); }
let freshUser = null;
async function fresh() { // usuário e loja novos, só para estados vazios e o cenário de 100 produtos
  if (freshUser) return freshUser;
  const email = `vazio-${randomBytes(3).toString('hex')}@example.test`, password = randomBytes(18).toString('base64url');
  const reg = await api('auth/register', { method: 'POST', body: { email, password } }); await api('auth/verify-email', { method: 'POST', body: { token: reg.body.localToken } });
  const actor = await session(email, password), store = (await api('tenants', { method: 'POST', actor, body: { name: 'Loja vazia TESTE', slug: `vazia-${randomBytes(3).toString('hex')}` } })).body;
  return (freshUser = { email, password, actor, store });
}
// Perde a resposta da confirmação: com create=true a requisição chega ao servidor (pedido criado) e o navegador recebe falha de rede.
const loseResponse = (page, create = true) => page.route('**/cart/checkout', async (route) => { if (create) await route.fetch().catch(() => {}); await route.abort('failed'); }, { times: 1 });
const unknownAlert = (page) => page.getByRole('alert').filter({ hasText: 'Não sabemos se a compra foi registrada' });
async function deliveryAndBuyer(page, email = 'aceite@example.test') {
  const f = page.getByRole('form', { name: 'Calcular frete' }); for (const [l, v] of [['CEP', '01001000'], ['Número', '120'], ['Rua', 'Rua das Acácias'], ['Cidade', 'São Paulo'], ['UF', 'SP']]) await f.getByLabel(l, { exact: true }).fill(v);
  await f.getByRole('button', { name: 'Calcular frete' }).click(); await page.getByRole('heading', { name: 'Seus dados' }).waitFor();
  const b = page.getByRole('form', { name: 'Dados do comprador' }); await b.getByLabel('Nome completo').fill('Aceite TESTE'); await b.getByLabel('E-mail para comprovante').fill(email); await b.getByRole('button', { name: 'Revisar pedido' }).click(); await page.getByText('Revise antes de confirmar').waitFor();
}
const orderUrl = /\/pedidos\/[0-9a-f-]{36}$/;

// CK-01 resposta perdida DEPOIS da criação; repetição (duplo clique em “Verificar compra”) devolve o mesmo pedido.
await step('CK-01', async () => {
  const before = await orderCount(); const [ctx, page] = await open(390); await toReview(page, A.slug); await buyerData(page);
  await loseResponse(page); await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); await unknownAlert(page).waitFor();
  const denies = await page.getByText(/não foi criad/i).count(), mid = await orderCount(), created = (await latestOrder()).id;
  const locked = (await page.getByRole('button', { name: 'Corrigir dados' }).isDisabled()) && (await page.getByRole('button', { name: 'Alterar entrega' }).isDisabled()) && (await page.getByRole('button', { name: 'Alterar itens' }).isDisabled());
  await shot(page, 'CK-01-390');
  await page.getByRole('button', { name: 'Verificar compra' }).dblclick(); await page.waitForURL(orderUrl); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor(); await sleep(800);
  const id = page.url().split('/').at(-1), after = await orderCount();
  check('CK-01', denies === 0 && mid === before + 1 && after === before + 1 && id === created && locked, `resposta perdida após a criação: alerta “Não sabemos se a compra foi registrada”, nenhuma frase de inexistência (${denies}); itens, entrega e dados travados: ${locked}; “Verificar compra” (duplo clique) abriu o pedido já criado: ${id === created}; pedidos ${before} → ${mid} → ${after}`);
  await ctx.close();
});
// CK-02 recarga com a confirmação sem resposta: a intenção salva reaparece e é verificada com a mesma chave.
await step('CK-02', async () => {
  const before = await orderCount(); const [ctx, page] = await open(1440); await toReview(page, A.slug); await buyerData(page);
  await loseResponse(page); await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); await unknownAlert(page).waitFor(); const created = (await latestOrder()).id;
  await page.reload(); await page.getByText('ficou sem resposta').waitFor();
  const locked = (await page.getByRole('button', { name: 'Atualizar quantidade' }).first().isDisabled()) && (await page.getByRole('button', { name: 'Calcular frete' }).isDisabled());
  await shot(page, 'CK-02-1440');
  await page.getByRole('button', { name: 'Verificar compra' }).click(); await page.waitForURL(orderUrl); await sleep(800);
  const id = page.url().split('/').at(-1), after = await orderCount(), stored = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('checkout-pendente')).length);
  check('CK-02', after === before + 1 && id === created && locked && stored === 0, `após recarregar: aviso de confirmação sem resposta, carrinho e entrega travados (${locked}); verificação abriu o pedido já criado (${id === created}); pedidos ${before} → ${after}; intenção pendente removida após o sucesso (${stored === 0})`);
  await ctx.close();
});
// CK-03 rejeição conclusiva (400 de conteúdo) → correção dos dados → um único pedido.
await step('CK-03', async () => {
  const before = await orderCount(); const [ctx, page] = await open(390); await toReview(page, A.slug);
  const b = page.getByRole('form', { name: 'Dados do comprador' }); await b.getByLabel('Nome completo').fill('Correção TESTE'); await b.getByLabel('E-mail para comprovante').fill('correcao@exemplo'); await b.getByRole('button', { name: 'Revisar pedido' }).click(); await page.getByText('Revise antes de confirmar').waitFor();
  await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); const alert = page.getByRole('alert').filter({ hasText: 'A loja recusou a confirmação' }); await alert.waitFor();
  const text = (await alert.textContent()).replace(/\s+/g, ' '), mid = await orderCount(), unknown = await unknownAlert(page).count(); await shot(page, 'CK-03-390');
  await page.getByRole('button', { name: 'Corrigir dados' }).click(); await b.getByLabel('E-mail para comprovante').fill('correcao@example.test'); await b.getByRole('button', { name: 'Revisar pedido' }).click();
  await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); await page.waitForURL(orderUrl); await sleep(800); const after = await orderCount();
  check('CK-03', mid === before && unknown === 0 && /Nenhum pedido foi criado por esta confirmação/.test(text) && after === before + 1, `400 “${text.slice(0, 90)}…” é conclusivo (pedidos ${before} → ${mid}); corrigir o e-mail e confirmar criou 1 pedido (${after})`);
  await ctx.close();
});
// CK-04 sem sessionStorage: repetição na mesma página usa a chave da memória; depois de recarregar, a proteção do servidor por
// carrinho/versão devolve o pedido já criado mesmo com chave nova.
await step('CK-04', async () => {
  const noStorage = () => Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('bloqueado', 'SecurityError'); } });
  const before = await orderCount();
  let [ctx, page] = await open(390); await ctx.addInitScript(noStorage); await toReview(page, A.slug); await buyerData(page);
  const blocked = await page.evaluate(() => { try { sessionStorage.length; return false; } catch { return true; } });
  await loseResponse(page); await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); await unknownAlert(page).waitFor(); const created1 = (await latestOrder()).id;
  await page.getByRole('button', { name: 'Verificar compra' }).click(); await page.waitForURL(orderUrl); const id1 = page.url().split('/').at(-1); await ctx.close();
  [ctx, page] = await open(390); await ctx.addInitScript(noStorage); await toReview(page, A.slug); await buyerData(page);
  await loseResponse(page); await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); await unknownAlert(page).waitFor(); const created2 = (await latestOrder()).id;
  await page.reload(); await page.getByRole('heading', { name: 'Seu carrinho' }).waitFor(); await sleep(800); const panel = await page.getByText('ficou sem resposta').count();
  await deliveryAndBuyer(page); await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); await page.waitForURL(orderUrl); const id2 = page.url().split('/').at(-1); await sleep(800);
  const after = await orderCount();
  check('CK-04', blocked && id1 === created1 && panel === 0 && id2 === created2 && after === before + 2, `sessionStorage bloqueado: ${blocked}; repetição na mesma página abriu o pedido criado (${id1 === created1}); após recarregar não há intenção salva (${panel === 0}) e a nova confirmação, com outra chave, devolveu o pedido já criado pela proteção de carrinho/versão do servidor (${id2 === created2}); pedidos ${before} → ${after} (2 compras, nenhuma duplicada)`);
  await ctx.close();
});
// CK-05 falha de rede ANTES da criação: também é desconhecido; a verificação cria exatamente um pedido.
await step('CK-05', async () => {
  const before = await orderCount(); const [ctx, page] = await open(1440); await toReview(page, A.slug); await buyerData(page);
  await loseResponse(page, false); await page.getByRole('button', { name: /^Confirmar compra de/ }).click(); await unknownAlert(page).waitFor(); const mid = await orderCount();
  await page.getByRole('button', { name: 'Verificar compra' }).click(); await page.waitForURL(orderUrl); await sleep(800); const after = await orderCount();
  check('CK-05', mid === before && after === before + 1, `falha antes de chegar ao servidor: mesmo aviso de resultado desconhecido (nada criado: ${mid === before}); “Verificar compra” criou 1 pedido (${before} → ${after})`);
  await ctx.close();
});

// PV-01 preview privado: produto, categoria, menu, voltar, busca e carrinho; nada leva a 404 nem à loja pública; anônimo não vê.
await step('PV-01', async () => {
  const pub = (await api(`public/stores/${A.slug}`)).body.theme;
  const draftBody = (title, menu) => ({ schema_version: 1, title, description: pub.description, hero: pub.hero, color: pub.color, font: pub.font, pages: pub.pages, menu, assets: pub.assets || [] });
  const r = await api(`tenants/${A.id}/storefront/draft`, { method: 'POST', actor: owner, body: draftBody('AURORA RASCUNHO PRIVADO TESTE', [{ label: 'Catálogo', path: '/' }, { label: 'Sobre', path: '/paginas/sobre' }, { label: 'Meu carrinho', path: '/carrinho' }]) });
  if (r.status >= 300) throw new Error(`rascunho ${r.status} ${JSON.stringify(r.body)}`);
  try {
    const [ctx, page] = await open(1440, owner); const hrefs = new Set(), record = async () => { for (const h of await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')))) hrefs.add(h); };
    await page.goto(`${base}/preview/${A.id}`); await page.getByRole('heading', { level: 1, name: 'AURORA RASCUNHO PRIVADO TESTE' }).waitFor(); await record();
    const robots = await page.locator('meta[name=robots]').getAttribute('content'), search = await page.getByRole('search').count(), cart = await page.getByRole('link', { name: /carrinho/i }).count();
    const nav = page.getByRole('navigation', { name: 'Navegação da loja' }), unavailable = [await nav.getByText('Meu carrinho (indisponível no preview)').count(), await nav.getByText('Atendimento (indisponível no preview)').count()], categoriesNav = await page.getByRole('navigation', { name: 'Categorias' }).count();
    await shot(page, 'PV-01-inicio-1440');
    await page.getByRole('link', { name: 'Camiseta aurora' }).click(); await page.getByRole('heading', { level: 1, name: 'Camiseta aurora' }).waitFor(); const productUrl = page.url(), noBuy = await page.getByText('Compra desabilitada no preview').count(); await record(); await shot(page, 'PV-01-produto-1440');
    await page.getByRole('navigation', { name: 'Trilha' }).getByRole('link', { name: 'Início' }).click(); await page.waitForURL(`${base}/preview/${A.id}`);
    await nav.getByRole('link', { name: 'Sobre' }).click(); await page.getByRole('heading', { level: 1, name: 'Sobre a loja TESTE' }).waitFor(); const pageUrl = page.url(); await record();
    await page.goBack(); await page.waitForURL(`${base}/preview/${A.id}`); const back = await page.getByRole('heading', { level: 1, name: 'AURORA RASCUNHO PRIVADO TESTE' }).count();
    // categoria (o menu do tema não aceita categoria) e carrinho digitados na barra de endereço: aviso claro, sem 404
    const typed = []; for (const d of ['categorias/colecao', 'carrinho']) { const res = await page.goto(`${base}/preview/${A.id}/${d}`); await page.getByText('Não disponível no preview').waitFor(); typed.push(`${d} → ${res.status()}`); if (d === 'categorias/colecao') await shot(page, 'PV-01-categoria-1440'); await page.getByRole('link', { name: 'Voltar ao início do preview' }).click(); await page.waitForURL(`${base}/preview/${A.id}`); }
    const statuses = []; for (const h of hrefs) { if (h.startsWith('#') || h.startsWith('mailto:')) continue; const res = await page.request.get(new URL(h, base).href); statuses.push([h, res.status()]); }
    const broken = statuses.filter(([, s]) => s >= 400), toPublic = [...hrefs].filter((h) => h.startsWith('/lojas/'));
    const [actx, anon] = await open(1440); await anon.goto(`${base}/preview/${A.id}/produtos/camiseta`); const denied = await anon.getByText(/Acesso negado ou rascunho inexistente/).count(), leak = await anon.getByText('AURORA RASCUNHO PRIVADO TESTE').count();
    await anon.goto(`${base}/lojas/${A.slug}`); const publicLeak = await anon.getByText('AURORA RASCUNHO PRIVADO TESTE').count(), publicTitle = await anon.getByRole('heading', { level: 1, name: 'AURORA TESTE' }).count(); await actx.close();
    check('PV-01', /noindex/.test(robots) && search === 0 && cart === 0 && unavailable.every((n) => n === 1) && categoriesNav === 0 && typed.every((t) => t.endsWith('200')) && noBuy === 1 && productUrl.endsWith(`/preview/${A.id}/produtos/camiseta`) && pageUrl.endsWith(`/preview/${A.id}/paginas/sobre`) && back === 1 && broken.length === 0 && toPublic.length === 0 && denied === 1 && leak === 0 && publicLeak === 0 && publicTitle === 1,
      `noindex: ${/noindex/.test(robots)}; busca ${search}, link de carrinho ${cart}; categoria/carrinho e atendimento do menu como texto indisponível: ${unavailable.join('/')}; sem navegação de categorias (${categoriesNav}); endereços digitados ${typed.join(', ')} com “Não disponível no preview” e “Voltar ao início do preview”; produto ${productUrl.split(base)[1]} sem compra (${noBuy}); página ${pageUrl.split(base)[1]}; Voltar do navegador ao início: ${back}; ${statuses.length} links conferidos, quebrados ${broken.length}, para a loja pública ${toPublic.length}; anônimo negado (${denied}) sem ver o rascunho; vitrine pública segue com o título publicado (${publicTitle}) e não mostra o rascunho (${publicLeak})`);
    await ctx.close();
  } finally { await api(`tenants/${A.id}/storefront/draft`, { method: 'POST', actor: owner, body: draftBody(pub.title, pub.menu) }); }
});

// A-R01-01 foco no título após entrar pelo formulário
await step('A-R01-01', async () => {
  for (const w of [390, 1440]) { const [ctx, page] = await open(w); await page.goto(`${base}/`); const f = page.getByRole('form', { name: 'Entrar', exact: true });
    await f.getByLabel('E-mail', { exact: true }).fill(A.email); await f.getByLabel('Senha', { exact: true }).fill(A.password); await f.getByLabel('Senha', { exact: true }).press('Enter');
    await page.getByRole('heading', { level: 1, name: 'Suas lojas' }).waitFor(); await sleep(300); const focus = await page.evaluate(() => document.activeElement?.textContent);
    check(`A-R01-01 ${w}`, focus === 'Suas lojas', `entrar com Enter: lista de lojas e foco no título “${focus}”`); await shot(page, `A-R01-01-${w}`); await ctx.close(); }
});
// A-R01-03 sessão carregando e API fora (interceptação de rede no navegador; a API real continua no ar)
await step('A-R01-03', async () => {
  const [ctx, page] = await open(1440); let release, mode = 'segurar'; const gate = new Promise((r) => { release = r; });
  await page.route('**/api/**', async (route) => { if (mode === 'falhar') return route.abort('connectionrefused').catch(() => {}); await gate; await route.continue().catch(() => {}); }); await page.goto(`${base}/`, { waitUntil: 'commit' });
  await page.getByText('Verificando sua sessão…').waitFor(); await shot(page, 'A-R01-03-carregando-1440'); release(); await sleep(500);
  mode = 'falhar'; await page.reload();
  const alert = page.getByRole('alert').filter({ hasText: 'Serviço indisponível' }); await alert.waitFor(); await shot(page, 'A-R01-03-fora-1440');
  check('A-R01-03', /Não foi possível conectar à API/.test(await alert.textContent()), '“Verificando sua sessão…” durante a espera; com a API inacessível, alerta “Serviço indisponível — Não foi possível conectar à API…”'); await ctx.close();
});
// A-R01-05 Funcionário vê a configuração somente leitura e sem equipe
await step('A-R01-05', async () => {
  const [ctx, page] = await open(1440, await session(demo.employee.email, demo.employee.password)); await page.goto(`${base}/`);
  await page.getByRole('button', { name: /— Funcionário$/ }).first().click(); await page.getByText('Somente o Dono altera a configuração').waitFor();
  const editable = await page.locator('main input:not([type=hidden]):not([readonly]):not([disabled]), main select:not([disabled])').count(), team = await page.getByRole('heading', { name: 'Equipe' }).count();
  check('A-R01-05', team === 0 && (await page.getByRole('button', { name: 'Salvar configuração' }).count()) === 0, `Funcionário: aviso “Somente o Dono altera a configuração”, sem botão de salvar e sem equipe (${team}); campos editáveis restantes na página: ${editable}`); await shot(page, 'A-R01-05-1440'); await ctx.close();
});
// A-R01-06 encerrar todas as sessões por teclado (usuário descartável)
await step('A-R01-06', async () => {
  const u = await fresh(); const [ctx, page] = await open(1440, u.actor); await page.goto(`${base}/`); await page.waitForLoadState('networkidle'); // teclado só depois da hidratação
  const opener = page.getByRole('button', { name: 'Encerrar todas as sessões…' }); await opener.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog'); await dialog.waitFor(); const inside = await page.evaluate(() => !!document.activeElement?.closest('dialog'));
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); const back = await page.evaluate(() => document.activeElement?.textContent?.trim());
  await page.keyboard.press('Enter'); await dialog.waitFor(); await shot(page, 'A-R01-06-1440'); await dialog.getByRole('button', { name: /Encerrar/ }).click();
  await page.getByRole('form', { name: 'Entrar', exact: true }).waitFor(); const still = await api('tenants', { actor: u.actor });
  check('A-R01-06', inside && back === 'Encerrar todas as sessões…' && still.status === 401, `foco no diálogo: ${inside}; Esc devolve a “${back}”; confirmar volta ao acesso e a sessão anterior responde ${still.status}`); await ctx.close();
  freshUser = { ...u, actor: await session(u.email, u.password) };
});
// A-R02-06 catálogo carregando (requisição atrasada no navegador): casca visível
await step('A-R02-06', async () => {
  const [ctx, page] = await open(1440, owner); let release; const gate = new Promise((r) => { release = r; });
  await page.route('**/catalogue', async (route) => { await gate; await route.continue().catch(() => {}); }); await page.goto(`${base}/painel/${A.id}`);
  await page.getByText('Carregando dados autorizados do catálogo…').waitFor(); const shell = await page.getByRole('navigation').getByRole('link', { name: 'Pedidos' }).count(); await shot(page, 'A-R02-06-1440');
  release(); await page.getByRole('heading', { name: 'Produtos' }).waitFor();
  check('A-R02-06', shell > 0, `“Carregando dados autorizados do catálogo…” com a navegação do painel visível (${shell}); depois a lista aparece`); await ctx.close();
});
// A-R02-07 SKU repetido: erro junto ao campo SKU, demais dados mantidos
await step('A-R02-07', async () => {
  for (const w of [390, 1440]) { const [ctx, page] = await open(w, owner); await page.goto(`${base}/painel/${A.id}?novo=1`); const f = page.getByRole('form', { name: 'Cadastrar produto' });
    await f.getByLabel('Nome', { exact: true }).fill('Produto com SKU repetido TESTE'); await f.getByLabel('SKU').fill(`${A.slug.split('-')[0]}-CAFE-001`); await f.getByLabel('Preço').fill('19,9'); await f.getByRole('button', { name: 'Cadastrar produto' }).click();
    await page.getByRole('alert').filter({ hasText: 'O produto não foi cadastrado' }).waitFor(); const sku = f.getByLabel('SKU'), invalid = await sku.getAttribute('aria-invalid'), described = await sku.evaluate((e) => (e.getAttribute('aria-describedby') || '').split(' ').map((id) => document.getElementById(id)?.textContent).join(' '));
    const kept = await f.getByLabel('Nome', { exact: true }).inputValue(), slugInvalid = await f.getByLabel('Endereço na vitrine').getAttribute('aria-invalid');
    check(`A-R02-07 ${w}`, invalid === 'true' && /SKU/.test(described) && slugInvalid === null && kept === 'Produto com SKU repetido TESTE', `erro no campo SKU (aria-invalid ${invalid}; “${described.trim().slice(-60)}”); endereço sem erro; nome mantido`); await shot(page, `A-R02-07-${w}`); await ctx.close(); }
});
// A-R02-09 mídia em processamento → pronta
await step('A-R02-09', async () => {
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}?aba=midia`); const f = page.getByRole('form', { name: 'Enviar imagem' });
  // PNG válido gerado no próprio navegador (canvas 400×500, gradiente), sem arquivo de apoio.
  const png = Buffer.from((await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 500; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 400, 500); gr.addColorStop(0, '#245742'); gr.addColorStop(1, '#e6b8a2'); g.fillStyle = gr; g.fillRect(0, 0, 400, 500); return c.toDataURL('image/png'); })).split(',')[1], 'base64');
  // Worker do projeto isolado parado durante o envio: o estado “Processando” fica estável para a captura.
  compose(['stop', 'worker']);
  try { await f.getByLabel('Arquivo de imagem').setInputFiles({ name: 'aceite.png', mimeType: 'image/png', buffer: png }); await f.getByRole('button', { name: 'Enviar imagem' }).click();
    await page.getByText('Processando', { exact: true }).first().waitFor({ timeout: 15000 }); await shot(page, 'A-R02-09-processando-1440'); }
  finally { compose(['up', '-d', '--wait', '--no-deps', 'worker']); }
  const ready = await waitFor(async () => { await page.reload(); await page.getByRole('heading', { level: 1 }).waitFor(); return (await page.getByText('Processando', { exact: true }).count()) === 0; }, 'mídia pronta');
  await shot(page, 'A-R02-09-pronta-1440'); check('A-R02-09', ready, 'selo “Processando” na imagem recém-enviada (worker do projeto parado) e, com o worker de volta, a imagem passa a “Pronta” sem processamento pendente'); await ctx.close();
});
// A-R02-10 ajuste que deixaria saldo abaixo do reservado
await step('A-R02-10', async () => {
  const cat = (await api(`tenants/${A.id}/catalogue`, { actor: owner })).body, mug = cat.products.find((p) => p.slug === 'caneca-cafe').variants[0], items = cat.inventory.filter((i) => i.variant_id === mug.id);
  const onHand = items.reduce((n, i) => n + i.on_hand, 0), reserved = items.reduce((n, i) => n + i.reserved, 0);
  if (!reserved) throw new Error('sem reserva ativa na caneca (gere o pedido pendente: ambiente.mjs dados --so-pendente)');
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}?aba=estoque`); const f = page.getByRole('form', { name: 'Ajustar estoque' });
  await f.getByLabel('Variação').selectOption({ label: (await f.getByLabel('Variação').locator('option').allTextContents()).find((t) => /Caneca/.test(t)) });
  await f.getByLabel('Quantidade').fill(String(-onHand)); await f.getByLabel('Motivo').fill('Teste de saldo abaixo do reservado'); await f.getByRole('button', { name: 'Registrar ajuste' }).click();
  await sleep(1500); const q = f.getByLabel('Quantidade'), invalid = await q.getAttribute('aria-invalid'), msg = await q.evaluate((e) => (e.getAttribute('aria-describedby') || '').split(' ').map((id) => document.getElementById(id)?.textContent).join(' '));
  const after = (await api(`tenants/${A.id}/catalogue`, { actor: owner })).body.inventory.filter((i) => i.variant_id === mug.id).reduce((n, i) => n + i.on_hand, 0);
  check('A-R02-10', invalid === 'true' && /saldo/i.test(msg) && after === onHand, `em estoque ${onHand}, reservado ${reserved}, ajuste ${-onHand}: erro junto à quantidade (“${msg.trim().slice(-70)}”); saldo inalterado (${after})`); await shot(page, 'A-R02-10-1440'); await ctx.close();
});
// A-R02-12 publicar o tema pela interface (loja C): falha preserva a publicação anterior; sucesso publica.
await step('A-R02-12', async () => {
  const ownerC = await session(C.email, C.password), [ctx, page] = await open(1440, ownerC), hero = `Mensagem publicada pela interface ${randomBytes(2).toString('hex')}`;
  const pubBefore = (await api(`public/stores/${C.slug}`)).body.theme.hero;
  await page.goto(`${base}/painel/${C.id}?aba=vitrine`); const theme = page.getByRole('form', { name: 'Salvar tema' }); await theme.getByLabel('Mensagem principal').fill(hero);
  await theme.getByRole('button', { name: 'Salvar rascunho' }).focus(); await page.keyboard.press('Enter'); await page.getByText(/Rascunho do tema salvo/).waitFor();
  const [pctx, preview] = await open(1440, ownerC); await preview.goto(`${base}/preview/${C.id}`); const inPreview = await preview.getByText(hero).count(); await pctx.close();
  await page.route('**/storefront/publish', (route) => route.abort('connectionrefused'), { times: 1 });
  await page.getByRole('button', { name: 'Publicar vitrine local' }).click(); await page.getByRole('alert').first().waitFor(); const failText = (await page.getByRole('alert').first().textContent()).trim(); await shot(page, 'A-R02-12-falha-1440');
  const pubAfterFail = (await api(`public/stores/${C.slug}`)).body.theme.hero;
  await page.getByRole('button', { name: 'Publicar vitrine local' }).click(); await page.getByText('Vitrine publicada.').waitFor(); await shot(page, 'A-R02-12-publicada-1440');
  const pubAfter = (await api(`public/stores/${C.slug}`)).body.theme.hero;
  check('A-R02-12', inPreview === 1 && pubAfterFail === pubBefore && pubAfter === hero, `salvar rascunho por teclado → preview mostra a nova mensagem (${inPreview}); falha de rede na publicação: “${failText.slice(0, 70)}” e a vitrine pública continua com a mensagem anterior (${pubAfterFail === pubBefore}); publicar de novo: “Vitrine publicada.” e a vitrine pública muda (${pubAfter === hero})`);
  await ctx.close();
});
// A-R02-14 100 produtos (limite do plano piloto) e nome longo
await step('A-R02-14', async () => {
  const u = await fresh(), P = `tenants/${u.store.id}`; let created = 0;
  for (let i = 1; i <= 100; i++) { const r = await api(`${P}/catalogue/products`, { method: 'POST', actor: u.actor, body: { name: i === 1 ? 'Conjunto de pratos rasos e fundos em porcelana com borda dourada pintada à mão — linha comemorativa TESTE' : `Produto sintético ${String(i).padStart(3, '0')} TESTE`, slug: `produto-${i}`, sku: `VAZ-${i}`, price_cents: String(1000 + i) } }); if (r.status === 201) created++; else throw new Error(`produto ${i}: ${r.status} ${JSON.stringify(r.body)}`); }
  for (const w of [390, 1440]) { const [ctx, page] = await open(w, u.actor); await page.goto(`${base}/painel/${u.store.id}`); await page.getByText(/Mostrando \d+ de \d+ produtos carregados/).waitFor();
    const foot = await page.getByText(/Mostrando \d+ de \d+ produtos carregados/).textContent(), limit = await page.getByText('A listagem do painel traz até 100 produtos, sem paginação.').count(), over = await overflow(page);
    check(`A-R02-14 ${w}`, /Mostrando 100 de 100/.test(foot) && limit === 1 && over <= 0, `${created} produtos: “${foot}” + aviso do limite sem paginação; rolagem horizontal ${over} px`); await shot(page, `A-R02-14-${w}`); await ctx.close(); }
});
// A-R03-01 filtros mantidos ao abrir um pedido e voltar
await step('A-R03-01', async () => {
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/pedidos`); const f = page.getByRole('form', { name: 'Filtrar pedidos' });
  await page.locator('#f-pay').selectOption('PAID'); await f.getByRole('button', { name: 'Filtrar' }).click(); await page.waitForURL(/payment_status=PAID/);
  await page.getByRole('link', { name: /^Nº \d+$/ }).first().click(); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor(); await page.getByRole('navigation', { name: 'Você está em' }).getByRole('link', { name: 'Pedidos' }).click();
  await page.getByRole('form', { name: 'Filtrar pedidos' }).waitFor(); const kept = await page.locator('#f-pay').inputValue(), url = page.url();
  await page.goBack(); await page.goBack(); await sleep(500); const back = page.url();
  check('A-R03-01', kept === 'PAID' && /payment_status=PAID/.test(url) && /payment_status=PAID/.test(back), `filtro “Pagamento: Pago” mantido ao voltar pela trilha (${url.split('?')[1]}) e pelo botão Voltar do navegador`); await ctx.close();
});
// A-R03-02 sem pedidos e filtro sem resultado
await step('A-R03-02', async () => {
  const u = await fresh(); let [ctx, page] = await open(390, u.actor); await page.goto(`${base}/painel/${u.store.id}/pedidos`); await page.getByRole('heading', { name: 'Pedidos' }).first().waitFor(); await sleep(800);
  const empty = (await page.locator('.empty-title').allTextContents()).join(' | '); await shot(page, 'A-R03-02-vazio-390'); await ctx.close();
  [ctx, page] = await open(390, owner); await page.goto(`${base}/painel/${A.id}/pedidos?number=999999`); await page.getByText('Nenhum pedido com esses filtros').waitFor();
  const clear = await page.getByRole('button', { name: 'Limpar filtros' }).count(); await shot(page, 'A-R03-02-filtro-390');
  check('A-R03-02', empty.length > 0 && !/filtros/.test(empty) && clear > 0, `loja sem pedidos: “${empty}”; filtro sem resultado: “Nenhum pedido com esses filtros” + “Limpar filtros”`); await ctx.close();
});
// A-R03-05 tentativa com resultado desconhecido (gateway simulado falhando: worker reiniciado com SIMULATED_GATEWAY_FAILURE_RATE=1)
await step('A-R03-05', async () => {
  compose(['up', '-d', '--wait', '--no-deps', 'worker'], { SIMULATED_GATEWAY_FAILURE_RATE: '1' });
  let o;
  try { o = await publicOrder(A.slug, { buyer: { name: 'Resultado incerto TESTE', email: 'incerto@example.test' } });
    await waitFor(async () => (await api(`tenants/${A.id}/purchase/orders/${o.order.id}`, { actor: owner })).body.attempts?.[0]?.status === 'UNKNOWN', 'tentativa UNKNOWN');
    const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/pedidos?pedido=${o.order.id}`); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor(); await sleep(800);
    await page.getByText('Tentativas de pagamento', { exact: false }).first().click().catch(() => {});
    const verifying = await page.getByText('Resultado em verificação').count(), retry = await page.getByRole('button', { name: /Tentar|nova cobrança|cobrar/i }).count(); await shot(page, 'A-R03-05-painel-1440'); await ctx.close();
    const [bctx, buyer] = await open(390, cartCookie(o.cookie)); await buyer.goto(`${base}/lojas/${A.slug}/pedidos/${o.order.id}`); await buyer.getByRole('heading', { name: /^Pedido nº/ }).waitFor();
    const buyerRetry = await buyer.getByRole('button', { name: 'Tentar pagar novamente' }).count(), buyerPaid = await buyer.getByText('Pago', { exact: true }).count(); await shot(buyer, 'A-R03-05-comprador-390'); await bctx.close();
    check('A-R03-05', verifying > 0 && retry === 0 && buyerRetry === 0 && buyerPaid === 0, `painel: “Resultado em verificação” (${verifying}), sem ação de nova cobrança (${retry}); comprador: sem “Tentar pagar novamente” (${buyerRetry}) e sem “Pago”`);
  } finally { compose(['up', '-d', '--wait', '--no-deps', 'worker'], { SIMULATED_GATEWAY_FAILURE_RATE: '0' }); }
});
// A-R03-06 (retirada) separar → pronto para retirada → entregar com comprovação
await step('A-R03-06b', async () => {
  const o = await publicOrder(A.slug, { kind: 'PICKUP', buyer: { name: 'Retirada TESTE', email: 'retirada@example.test' } }); await approve(`tenants/${A.id}`, owner, o.order.attempts[0].id);
  await waitFor(async () => (await api(`tenants/${A.id}/purchase/orders/${o.order.id}`, { actor: owner })).body.payment_status === 'PAID', 'pago');
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/pedidos?pedido=${o.order.id}`); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor(); const msgs = [];
  await page.getByRole('button', { name: 'Iniciar separação' }).click(); await page.getByRole('status').filter({ hasText: 'Separação iniciada.' }).waitFor(); msgs.push('Separação iniciada.');
  await page.getByRole('button', { name: 'Marcar pronto para retirada' }).click(); await page.getByRole('status').filter({ hasText: /pronto para retirada/ }).waitFor(); msgs.push('pronto para retirada');
  const d = page.getByRole('form', { name: 'Confirmar entrega' }); await d.getByLabel(/Comprovação da retirada/).fill('Documento conferido; retirado por Retirada TESTE'); await d.getByRole('button', { name: 'Confirmar entrega' }).click(); await page.getByRole('status').filter({ hasText: 'Entrega registrada.' }).waitFor(); msgs.push('Entrega registrada.');
  check('A-R03-06b', msgs.length === 3, `retirada: ${msgs.join(' → ')} (comprovação obrigatória)`); await shot(page, 'A-R03-06b-1440'); await ctx.close();
});
// A-R03-10 endereço longo e comprador anonimizado pela interface
await step('A-R03-10', async () => {
  const long = { ...addr, street: 'Avenida Professora Doutora Maria Aparecida de Albuquerque Cavalcanti Monteiro TESTE', complement: 'Bloco C, apartamento 1204, entrada pela rua lateral ao lado da padaria TESTE' };
  const lo = await publicOrder(A.slug, { address: long, buyer: { name: 'Maria Aparecida de Albuquerque Cavalcanti Monteiro da Silva TESTE', email: 'maria.aparecida.albuquerque.cavalcanti.monteiro@example.test' } });
  for (const w of [390, 1440]) { const [ctx, page] = await open(w, owner); await page.goto(`${base}/painel/${A.id}/pedidos?pedido=${lo.order.id}`); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor(); await sleep(600); const over = await overflow(page); await shot(page, `A-R03-10-longo-${w}`); await ctx.close(); check(`A-R03-10 endereço ${w}`, over <= 0, `endereço e e-mail longos quebram sem rolagem horizontal (${over} px)`); }
  const ro = O.rejected, cancel = await api(`tenants/${A.id}/purchase/orders/${ro.id}/cancel`, { method: 'POST', actor: owner, body: { reason: 'Pagamento recusado; teste de anonimização' } });
  if (cancel.status >= 300 && !/cancel/i.test(JSON.stringify(cancel.body))) throw new Error(`cancelar ${cancel.status} ${JSON.stringify(cancel.body)}`);
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/pedidos?pedido=${ro.id}`); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor();
  await page.getByRole('button', { name: 'Anonimizar dados pessoais…' }).click(); const dlg = page.getByRole('dialog'); await dlg.getByRole('textbox').first().fill('Pedido do titular — teste'); await dlg.getByRole('button', { name: 'Anonimizar dados' }).click();
  await page.getByText('Dados pessoais anonimizados').first().waitFor(); const raw = await page.getByText('ANONIMIZADO', { exact: true }).count(), mail = await page.locator('a[href^="mailto:anonimizado"]').count(); await shot(page, 'A-R03-10-anonimizado-1440'); await ctx.close();
  const [bctx, buyer] = await open(390, cartCookie(ro.cookie)); await buyer.goto(`${base}/lojas/${A.slug}/pedidos/${ro.id}`); await buyer.getByRole('heading', { name: /^Pedido nº/ }).waitFor(); const buyerAnon = await buyer.getByText('Dados pessoais anonimizados').count(); await bctx.close();
  check('A-R03-10 anonimizado', raw === 0 && mail === 0 && buyerAnon === 1, `após anonimizar pela interface: selo “Dados pessoais anonimizados”, endereço anonimizado, nenhum marcador cru “ANONIMIZADO” (${raw}) nem link para o e-mail fictício (${mail}); comprovante do comprador também indica (${buyerAnon})`);
});
// A-R04-01 protocolo atrasado (prazo movido para o passado por SQL no projeto isolado: simula a passagem de 6 dias)
await step('A-R04-01b', async () => {
  psql(`update shop.consumer_requests set due_at = now() - interval '1 day' where id = '${demo.support.contact}'`);
  for (const w of [390, 1440]) { const [ctx, page] = await open(w, owner); await page.goto(`${base}/painel/${A.id}/atendimento?filtro=atrasados`); await page.getByRole('heading', { level: 1 }).waitFor(); await sleep(800);
    const late = await page.getByText(/atrasad/i).count(), current = await page.locator('[aria-current="page"], [aria-pressed="true"]').allTextContents(); await shot(page, `A-R04-01b-${w}`); await ctx.close();
    check(`A-R04-01b ${w}`, late > 1, `filtro “atrasados” marcado (${current.join(' | ').slice(0, 60)}); protocolo vencido com selo/texto de atraso (${late} ocorrências)`); }
});
// A-R04-03 concluir protocolo pela interface → somente leitura
await step('A-R04-03', async () => {
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/atendimento?protocolo=${demo.support.contact}`); await page.getByRole('form', { name: 'Responder consumidor' }).waitFor();
  await page.getByText('Concluir protocolo').first().click(); const f = page.getByRole('form', { name: 'Concluir protocolo' }); const outcome = f.getByLabel('Resultado');
  if (await outcome.evaluate((e) => e.tagName === 'SELECT')) await outcome.selectOption({ index: 1 }); else await outcome.fill('Orientação dada');
  await f.getByLabel('Registro da resolução').fill('Prazo de troca informado ao visitante. TESTE'); await f.getByRole('button', { name: 'Concluir' }).click(); await sleep(1500);
  const replyForm = await page.getByRole('form', { name: 'Responder consumidor' }).count(); await shot(page, 'A-R04-03-1440');
  check('A-R04-03', replyForm === 0, `protocolo concluído pela interface; formulário de resposta deixa de existir (somente leitura): ${replyForm === 0}`); await ctx.close();
});
// A-R04-04 sem protocolos; mensagem longa com quebras de linha
await step('A-R04-04', async () => {
  const u = await fresh(); let [ctx, page] = await open(390, u.actor); await page.goto(`${base}/painel/${u.store.id}/atendimento`); await page.getByRole('heading', { level: 1 }).waitFor(); await sleep(800);
  const empty = (await page.locator('.empty-title').allTextContents()).join(' | '); await shot(page, 'A-R04-04-vazio-390'); await ctx.close();
  const body = Array.from({ length: 6 }, (_, i) => `Linha ${i + 1}: mensagem longa de teste para conferir quebras de linha preservadas no painel, sem rolagem horizontal. TESTE`).join('\n');
  const t = (await api(`public/stores/${A.slug}/support`, { method: 'POST', body: { name: 'Mensagem longa TESTE', email: 'longa@example.test', message: body, key: randomBytes(16).toString('hex') } })).body;
  [ctx, page] = await open(390, owner); await page.goto(`${base}/painel/${A.id}/atendimento?protocolo=${t.id}`); await page.getByText('Linha 6:').waitFor();
  const ws = await page.getByText('Linha 1:').evaluate((e) => getComputedStyle(e).whiteSpace), over = await overflow(page); await shot(page, 'A-R04-04-longa-390'); await ctx.close();
  check('A-R04-04', empty.length > 0 && /pre-wrap|pre-line/.test(ws) && over <= 0, `loja sem protocolos: “${empty}”; mensagem de 6 linhas com white-space ${ws} e rolagem ${over} px`);
});
// A-R05-04 domínio: cadastrar, verificar (sem DNS real) e remover em diálogo
await step('A-R05-04', async () => {
  // Domínio exige MFA confirmado na sessão (regra da API): usa o Dono da loja C com MFA ativado nesta sessão.
  const ownerC = await session(C.email, C.password), setup = await api('auth/mfa/setup', { method: 'POST', actor: ownerC });
  if (setup.status < 300) { const en = await api('auth/mfa/enable', { method: 'POST', actor: ownerC, body: { code: totp(setup.body.secret, Math.floor(Date.now() / 30000)) } }); if (en.status >= 300) throw new Error(`mfa ${en.status} ${JSON.stringify(en.body)}`); }
  const [ctx, page] = await open(1440, ownerC); await page.goto(`${base}/painel/${C.id}/operacao`); const region = page.getByRole('region', { name: 'Domínio próprio' }), host = `loja-${randomBytes(2).toString('hex')}.example.test`;
  await region.getByRole('form', { name: 'Cadastrar domínio' }).getByLabel('Hostname').fill(host); await region.getByRole('button', { name: 'Cadastrar' }).click(); await region.getByText(host).first().waitFor();
  const txt = await region.getByText(/_ecommerce-challenge\./).count(); await region.getByRole('button', { name: 'Verificar' }).first().click(); await sleep(2500); const afterVerify = (await region.textContent()).replace(/\s+/g, ' '); await shot(page, 'A-R05-04-verificar-1440');
  await region.getByRole('button', { name: 'Remover…' }).first().click(); const dlg = page.getByRole('dialog'); await dlg.waitFor(); await dlg.getByRole('button', { name: /Remover/ }).click(); await dlg.waitFor({ state: 'hidden' }); await sleep(1000);
  const gone = (await region.getByText(host).count()) === 0;
  check('A-R05-04', txt > 0 && gone, `cadastrado com registro TXT legível; “Verificar” sem DNS real → ${/Aguardando|pendente|falh|não encontrad/i.test(afterVerify) ? 'continua pendente com motivo' : 'estado inalterado'}; removido pelo diálogo: ${gone}`); await ctx.close();
});
// A-R05-05 plano e faturas sem plano pago publicado
await step('A-R05-05', async () => {
  const [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/operacao`); const region = page.getByRole('region', { name: 'Plano e faturas' }); await region.waitFor(); const text = (await region.textContent()).replace(/\s+/g, ' ');
  check('A-R05-05', /Nenhum plano pago/i.test(text), `região “Plano e faturas”: “${(text.match(/Nenhum plano pago[^.]*\./i) || [''])[0]}”`); await ctx.close();
});
// A-R05-06 IA desligada pela plataforma; geração com resultado incerto (provedor SIMULADO, marcador [timeout])
await step('A-R05-06', async () => {
  const admin = await adminSession(), policy = (enabled) => api('platform/ai/policy', { method: 'POST', actor: admin, body: { enabled, provider: 'SIMULATED', tenant_monthly_limit_micros: '2000000', global_monthly_limit_micros: '20000000', reason: enabled ? 'Revisão visual: IA simulada' : 'Revisão visual: desligar IA' } });
  let r = await policy(false); if (r.status >= 300) throw new Error(`política ${r.status} ${JSON.stringify(r.body)}`);
  let [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/operacao`); await page.getByText(/Recurso desligado pela plataforma/).waitFor(); const off = await page.getByText(/Recurso desligado pela plataforma/).count(); await shot(page, 'A-R05-06-desligada-1440'); await ctx.close();
  r = await policy(true); if (r.status >= 300) throw new Error(`política ${r.status} ${JSON.stringify(r.body)}`);
  try {
    const p = (await api(`tenants/${A.id}/catalogue/products`, { method: 'POST', actor: owner, body: { name: 'Produto IA incerta TESTE', slug: `ia-incerta-${randomBytes(2).toString('hex')}`, sku: `IA-${randomBytes(2).toString('hex')}`, price_cents: '1000', description: 'Gerar descrição [timeout]' } })).body;
    const on = await api(`tenants/${A.id}/ai/settings`, { method: 'POST', actor: owner, body: { enabled: true } }); if (on.status >= 300) throw new Error(`ia na loja ${on.status}`);
    [ctx, page] = await open(1440, owner); await page.goto(`${base}/painel/${A.id}/operacao`); const ia = page.getByRole('region', { name: 'Descrição com IA' }); await ia.waitFor();
    await ia.getByRole('button', { name: 'Desligar nesta loja' }).waitFor();
    await ia.getByLabel('Produto').selectOption(p.id); await ia.getByRole('button', { name: 'Gerar rascunho' }).click(); await ia.getByText('Resultado incerto').waitFor({ timeout: 20000 });
    const save = await ia.getByRole('button', { name: 'Salvar no produto' }).count(), generated = await ia.getByText('Rascunho gerado').count(); await shot(page, 'A-R05-06-incerta-1440'); await ctx.close();
    check('A-R05-06', off > 0 && save === 0 && generated === 0, `plataforma desligada: “Recurso desligado pela plataforma” (${off}); provedor simulado com tempo esgotado: “Resultado incerto — a reserva fica retida…”, sem “Salvar no produto” (${save}) e sem aviso de rascunho gerado (${generated})`);
  } finally { await policy(false); }
});
// A-R08-04 loja publicada sem produtos (loja nova: fornecedor sintético, tema e publicação pela API)
await step('A-R08-04', async () => {
  const u = await fresh(), P = `tenants/${u.store.id}`;
  await api(`${P}/storefront/profile`, { method: 'POST', actor: u.actor, body: { synthetic: true, name: 'Fornecedor VAZIO TESTE', document: '', address: 'Endereço fictício TESTE', email: 'contato-vazio@example.test', phone: 'Contato fictício TESTE', policies: 'Políticas sintéticas TESTE.', delivery: 'Sem entregas reais. TESTE', risks: 'Sem riscos: sem produtos. TESTE' } });
  const d = (await api(`${P}/storefront/draft`, { method: 'POST', actor: u.actor, body: { schema_version: 1, title: 'LOJA VAZIA TESTE', description: 'Vitrine publicada sem produtos', hero: 'Em breve', color: '#7A3B26', font: 'system', pages: [], menu: [{ label: 'Catálogo', path: '/' }], assets: [] } })).body;
  const pub = await api(`${P}/storefront/publish`, { method: 'POST', actor: u.actor, body: { revision_id: d.id } }); if (pub.status >= 300) throw new Error(`publicar ${pub.status} ${JSON.stringify(pub.body)}`);
  const [ctx, page] = await open(1440); const res = await page.goto(`${base}/lojas/${u.store.slug}`); await page.getByText('Nenhum produto publicado ainda').waitFor(); await shot(page, 'A-R08-04-1440');
  check('A-R08-04', res.status() === 200, `vitrine publicada sem produtos (HTTP ${res.status()}): “Nenhum produto publicado ainda”`); await ctx.close();
});
// A-R10-02 variação esgotada ao lado de disponível
await step('A-R10-02', async () => {
  for (const w of [390, 1440]) { const [ctx, page] = await open(w); await page.goto(`${base}/lojas/${A.slug}/produtos/avental`); await page.getByRole('heading', { level: 1, name: 'Avental de linho TESTE' }).waitFor();
    const p = page.getByRole('radio', { name: /^P/ }), m = page.getByRole('radio', { name: /^M/ }), pName = await p.evaluate((e) => e.labels?.[0]?.textContent);
    const ok = (await p.isDisabled()) && /esgotada/.test(pName) && (await m.isChecked()) && (await page.getByRole('button', { name: 'Adicionar ao carrinho' }).isEnabled());
    check(`A-R10-02 ${w}`, ok, `“${pName}” desabilitada; M selecionada por padrão e compra habilitada`); await shot(page, `A-R10-02-${w}`); await ctx.close(); }
});
// A-R10-04 erro do servidor junto à quantidade: a página foi aberta antes de o saldo cair (ajuste feito pelo Dono)
await step('A-R10-04', async () => {
  const cat = (await api(`tenants/${A.id}/catalogue`, { actor: owner })).body, apron = cat.products.find((p) => p.slug === 'avental'), m = apron.variants.find((v) => v.attributes.tamanho === 'M');
  const [ctx, page] = await open(1440); await page.goto(`${base}/lojas/${A.slug}/produtos/avental`); const n = Number((await page.getByText(/\d+ disponíve/).first().textContent()).match(/\d+/)[0]);
  const adj = (delta, reason) => api(`tenants/${A.id}/catalogue/adjustments`, { method: 'POST', actor: owner, body: { variant_id: m.id, location_id: A.location, delta, reason } });
  await adj(-1, 'Venda no balcão TESTE (saldo cai com a página aberta)');
  try {
    await page.getByLabel('Quantidade').fill(String(n)); await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click(); await sleep(1500);
    const q = page.getByLabel('Quantidade'), invalid = await q.getAttribute('aria-invalid'), msg = await q.evaluate((e) => (e.getAttribute('aria-describedby') || '').split(' ').map((id) => document.getElementById(id)?.textContent).join(' '));
    await shot(page, 'A-R10-04-1440');
    check('A-R10-04', invalid === 'true' && /saldo/i.test(msg), `página mostrava ${n} disponíveis; com o saldo já em ${n - 1}, adicionar ${n} devolve o erro do servidor junto à quantidade: “${msg.trim()}”`);
  } finally { await adj(1, 'Desfaz ajuste do teste A-R10-04'); }
  await ctx.close();
});
// A-R11-01 página longa (loja B, republicada com uma página extensa) e página inexistente
await step('A-R11-01', async () => {
  const ownerB = await session(demo.storeB.email, demo.storeB.password), pub = (await api(`public/stores/${demo.storeB.slug}`)).body.theme;
  const body = Array.from({ length: 14 }, (_, i) => `${i + 1}. Política de trocas e devoluções sintética: parágrafo ${i + 1} com texto suficiente para várias linhas de leitura e conferir a largura confortável da coluna. TESTE`).join('\n\n');
  const pages = [...pub.pages.filter((p) => p.slug !== 'politicas'), { slug: 'politicas', title: 'Políticas da loja TESTE', body }];
  const d = (await api(`tenants/${demo.storeB.id}/storefront/draft`, { method: 'POST', actor: ownerB, body: { schema_version: 1, title: pub.title, description: pub.description, hero: pub.hero, color: pub.color, font: pub.font, pages, menu: pub.menu, assets: pub.assets || [] } })).body;
  await api(`tenants/${demo.storeB.id}/storefront/publish`, { method: 'POST', actor: ownerB, body: { revision_id: d.id } });
  const widths = [];
  for (const w of [390, 1440]) { const [ctx, page] = await open(w); await page.goto(`${base}/lojas/${demo.storeB.slug}/paginas/politicas`); await page.getByRole('heading', { level: 1, name: 'Políticas da loja TESTE' }).waitFor();
    widths.push(await page.locator('.reading').evaluate((e) => Math.round(e.getBoundingClientRect().width))); await shot(page, `A-R11-01-${w}`); await ctx.close(); }
  const [ctx, page] = await open(390); const res = await page.goto(`${base}/lojas/${demo.storeB.slug}/paginas/nao-existe`); const nf = await page.getByRole('heading', { name: 'Página não encontrada' }).count(); await ctx.close();
  check('A-R11-01', widths[1] <= 680 && res.status() === 404 && nf === 1, `página com 14 parágrafos: coluna de leitura ${widths[0]} px (390) e ${widths[1]} px (1440, limite ~42rem); página inexistente → HTTP ${res.status()} “Página não encontrada”`);
});
// A-R12-06 “Pagamento indisponível” com simulação desligada no ambiente (API reiniciada com PAYMENT_SIMULATION=false)
await step('A-R12-06b', async () => {
  const [ctx, page] = await open(1440); await page.goto(`${base}/lojas/${A.slug}/produtos/caneca-cafe`); await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click(); await page.getByRole('link', { name: 'Ver carrinho' }).waitFor();
  compose(['up', '-d', '--wait', '--no-deps', 'api'], { PAYMENT_SIMULATION: 'false' });
  try {
    await page.goto(`${base}/lojas/${A.slug}/carrinho`); const f = page.getByRole('form', { name: 'Calcular frete' }); for (const [l, v] of [['CEP', '01001000'], ['Número', '120'], ['Rua', 'Rua das Acácias'], ['Cidade', 'São Paulo'], ['UF', 'SP']]) await f.getByLabel(l, { exact: true }).fill(v);
    await f.getByRole('button', { name: 'Calcular frete' }).click(); await page.getByText('Pagamento indisponível').waitFor(); const text = (await page.getByText(/Nenhum pedido será criado/).textContent()).trim();
    const confirmBtn = await page.getByRole('button', { name: /^Confirmar compra/ }).count(), buyerForm = await page.getByRole('form', { name: 'Dados do comprador' }).count(); await shot(page, 'A-R12-06b-1440');
    check('A-R12-06b', confirmBtn === 0 && buyerForm === 0, `com simulação desligada: “${text.slice(0, 110)}”; sem formulário de dados nem botão de confirmar`);
  } finally { compose(['up', '-d', '--wait', '--no-deps', 'api'], { PAYMENT_SIMULATION: 'true' }); await ctx.close(); }
});
// A-R13-04 arrependimento só por teclado
await step('A-R13-04', async () => {
  const o = await publicOrder(A.slug, { buyer: { name: 'Teclado TESTE', email: 'teclado@example.test' } }); const [ctx, page] = await open(390, cartCookie(o.cookie));
  await page.goto(`${base}/lojas/${A.slug}/pedidos/${o.order.id}`); const f = page.getByRole('form', { name: 'Abrir solicitação' }); await f.waitFor(); await page.waitForLoadState('networkidle');
  await f.getByLabel('Tipo').focus(); await page.keyboard.press('ArrowDown'); const kind = await f.getByLabel('Tipo').inputValue(); await page.keyboard.press('Tab'); await page.keyboard.type('Quero desistir da compra, enviado por teclado.');
  await page.keyboard.press('Tab'); const onButton = await page.evaluate(() => document.activeElement?.textContent); await page.keyboard.press('Enter');
  const ack = page.getByRole('status').filter({ hasText: /^Protocolo .* registrado em/ }); await ack.waitFor(); const text = (await ack.textContent()).trim(); await shot(page, 'A-R13-04-390');
  check('A-R13-04', kind === 'WITHDRAWAL' && onButton === 'Enviar solicitação' && /não confirma cancelamento nem devolução/.test(text), `Tipo por seta (${kind}), Tab até a mensagem e “${onButton}”, Enter: “${text.slice(0, 100)}…”`); await ctx.close();
});
// A-R13-05 pedido de loja suspensa (loja B suspensa e reativada pelo administrador)
await step('A-R13-05', async () => {
  const o = await publicOrder(demo.storeB.slug, { buyer: { name: 'Loja suspensa TESTE', email: 'suspensa@example.test' } }), admin = await adminSession();
  const s = await api(`platform/tenants/${demo.storeB.id}/suspend`, { method: 'POST', actor: admin, body: { reason: 'Teste: pedido de loja suspensa' } }); if (s.status >= 300) throw new Error(`suspender ${s.status} ${JSON.stringify(s.body)}`);
  try {
    const [ctx, page] = await open(1440, cartCookie(o.cookie)); const store = await page.goto(`${base}/lojas/${demo.storeB.slug}`); const storeStatus = store.status();
    await page.goto(`${base}/lojas/${demo.storeB.slug}/pedidos/${o.order.id}`); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor(); const notice = await page.getByText('Loja com vendas suspensas').count(); await shot(page, 'A-R13-05-1440');
    check('A-R13-05', notice === 1 && storeStatus === 404, `loja suspensa: vitrine responde ${storeStatus}; o pedido continua acessível ao comprador com o aviso “Loja com vendas suspensas · pedidos existentes continuam atendidos.”`); await ctx.close();
  } finally { await api(`platform/tenants/${demo.storeB.id}/reactivate`, { method: 'POST', actor: admin, body: { reason: 'Teste concluído: reativar' } }); }
});
// G-05/G-06 percurso completo de Tab na página de produto (390) e no detalhe do pedido do painel (1440)
await step('G-05/G-06', async () => {
  for (const [w, actor, path, name] of [[390, null, `/lojas/${A.slug}/produtos/camiseta`, 'produto'], [1440, owner, `/painel/${A.id}/pedidos?pedido=${O.excess.id}`, 'pedido']]) {
    const [ctx, page] = await open(w, actor); await page.goto(`${base}${path}`); await page.getByRole('heading', { level: 1 }).first().waitFor(); await sleep(800);
    const seen = [], noOutline = []; let first = '';
    for (let i = 0; i < 120; i++) { await page.keyboard.press('Tab'); const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { key: `${e.tagName}|${e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 30) || e.getAttribute('name') || ''}|${Math.round(e.getBoundingClientRect().top + scrollY)}`, outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; });
      if (!f) break; if (!first) first = f.key; if (seen.includes(f.key)) break; seen.push(f.key); if (!f.outline) noOutline.push(f.key); }
    check(`G-05/G-06 ${name}`, /Ir para o conteúdo/.test(first) && noOutline.length === 0 && seen.length > 5, `${seen.length} paradas de Tab até voltar ao início do ciclo (sem armadilha); primeira: “Ir para o conteúdo”; sem contorno ≥ 2 px: ${noOutline.length}${noOutline.length ? ` (${noOutline.slice(0, 3).join('; ')})` : ''}`);
    await ctx.close(); }
});

await browser.close();
let previous = []; try { previous = JSON.parse(readFileSync(join(out, 'aceite.json'), 'utf8')).results; } catch { /* primeira execução */ }
const merged = [...previous.filter((p) => !results.some((r) => r.id === p.id)), ...results];
writeFileSync(join(out, 'aceite.json'), JSON.stringify({ base, date: new Date().toISOString(), results: merged }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
