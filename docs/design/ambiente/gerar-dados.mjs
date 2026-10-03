#!/usr/bin/env node
// Gera os dados sintéticos usados por capturar-rotas.mjs, verificar-teclado.mjs e verificar-aceite.mjs e grava
// .local/demo-ui.json (fora do git, modo 0600: contém senhas e segredo MFA de contas sintéticas example.test).
// Uso: node docs/design/ambiente/gerar-dados.mjs [--base=http://localhost:3400] [--fotos=<pasta com .png/.jpg>] [--so-pendente]
//   --so-pendente  recria só o pedido aguardando pagamento (a reserva vence em 40 minutos).
// Só fala com a API pelos mesmos endpoints da interface; o papel de administrador é concedido pelo script do operador
// (scripts/platform-admin.mjs) dentro do projeto Compose isolado. Pagamentos SIMULADOS; nenhuma integração real.
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { composeArgs as designCompose, PROJECT } from './ambiente.mjs';

const repo = resolve(import.meta.dirname, '../../..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const base = arg('base', 'http://localhost:3400'), file = join(repo, '.local/demo-ui.json');
const { seed, client } = await import(join(repo, 'scripts/seed.mjs'));
const sharp = createRequire(join(repo, 'packages/media/package.json'))('sharp');
const api = client(base);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const expect = (r, status = 201) => { if (r.status !== status) throw new Error(`${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const address = { cep: '01001000', street: 'Rua das Acácias', number: '120', city: 'São Paulo', state: 'SP', complement: 'ap. 42' };
const save = (data) => { mkdirSync(join(repo, '.local'), { recursive: true }); writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 }); };
const login = async (email, password) => { const r = await api('auth/login', { method: 'POST', body: { email, password } }); expect(r); return { csrf: r.body.csrf, cookie: r.headers.get('set-cookie').split(';')[0] }; };

const health = await fetch(`${base}/api/health/ready`).catch(() => null);
if (!health?.ok) { console.error(`API indisponível em ${base}. Suba o ambiente: node docs/design/ambiente/ambiente.mjs subir`); process.exit(2); }

// Pedidos pela vitrine pública (mesmo fluxo do comprador) e simulação do provedor pelo Dono.
function shop(slug) {
  const cart = async (lines) => { let cookie; for (const [variant_id, quantity] of lines) { const r = await api(`public/stores/${slug}/cart/items`, { method: 'POST', cookie, body: { variant_id, quantity } }); expect(r); cookie ??= r.headers.get('set-cookie').split(';')[0]; } const quote = expect(await api(`public/stores/${slug}/cart/quotes`, { method: 'POST', cookie, body: { kind: 'TABLE', address } })); return { cookie, quote }; };
  const order = async (lines, buyer) => { const c = await cart(lines); const o = expect(await api(`public/stores/${slug}/cart/checkout`, { method: 'POST', cookie: c.cookie, body: { key: randomUUID(), quote_id: c.quote.id, address, buyer, method: 'PIX', total_cents: c.quote.total_cents } })); return { ...c, order: o }; };
  return { cart, order };
}
async function simulate(P, actor, attempt, status) { for (let i = 0; i < 40; i++) { const r = await api(`${P}/purchase/attempts/${attempt}/simulate`, { method: 'POST', actor, body: { status } }); if (r.status === 200 || r.status === 201) return; if (r.status !== 409) throw new Error(`${r.status} ${JSON.stringify(r.body)}`); await sleep(1000); } throw new Error('simulação sem resposta'); }
async function waitOrder(P, actor, id, pred) { for (let i = 0; i < 60; i++) { const o = expect(await api(`${P}/purchase/orders/${id}`, { actor }), 200); if (pred(o)) return o; await sleep(1000); } throw new Error('estado do pedido não alcançado'); }

if (process.argv.includes('--so-pendente')) {
  const demo = JSON.parse(readFileSync(file, 'utf8')), mug = expect(await api(`public/stores/${demo.storeA.slug}/products/caneca-cafe`), 200).variants[0], v = mug.id;
  // As verificações reservam unidades da caneca por 40 minutos; repõe saldo sintético se faltar.
  if (mug.available < 2) { const owner = await login(demo.storeA.email, demo.storeA.password); expect(await api(`tenants/${demo.storeA.id}/catalogue/adjustments`, { method: 'POST', actor: owner, body: { variant_id: v, location_id: demo.storeA.location, delta: 30, reason: 'Reposição sintética para verificações TESTE' } })); }
  const p = await shop(demo.storeA.slug).order([[v, 1]], { name: 'Helena Prado TESTE', email: 'helena@example.test' });
  demo.orders.pending = demo.orders.pending2 = { id: p.order.id, number: p.order.number, cookie: p.cookie }; demo.generatedAt = new Date().toISOString(); save(demo);
  console.log(JSON.stringify({ pendente: p.order.number })); process.exit(0);
}

// 1. Duas lojas do seed oficial (aurora #245742, brisa) + contas de pagamento SIMULADAS.
const suffix = randomBytes(3).toString('hex'), [a, b] = await seed(api, suffix), P = `tenants/${a.id}`;
for (const s of [a, b]) expect(await api(`tenants/${s.id}/purchase/accounts/simulated`, { method: 'POST', actor: s.actor }));
// 2. Loja B com cor clara (#F2C94C, contraste baixo) e títulos serifados; a cor armazenada não muda.
const draftB = expect(await api(`tenants/${b.id}/storefront/draft`, { method: 'POST', actor: b.actor, body: { schema_version: 1, title: 'BRISA TESTE', description: 'Vitrine independente brisa de demonstração', hero: 'Peças leves para o dia a dia', color: '#F2C94C', font: 'serif', pages: [{ slug: 'sobre', title: 'Sobre a loja TESTE', body: 'Loja brisa sintética, sem vendas reais.' }], menu: [{ label: 'Catálogo', path: '/' }, { label: 'Sobre', path: '/paginas/sobre' }], assets: [] } }));
expect(await api(`tenants/${b.id}/storefront/publish`, { method: 'POST', actor: b.actor, body: { revision_id: draftB.id } }));
// 3. Produtos extras na loja A: nome longo sem foto, rascunho, sem saldo, e variação esgotada ao lado de disponível.
const long = expect(await api(`${P}/catalogue/products`, { method: 'POST', actor: a.actor, body: { name: 'Jogo de quatro xícaras de café com pires em cerâmica esmaltada — edição artesanal numerada TESTE', slug: 'jogo-xicaras-longo', description: 'Produto sintético com nome longo para testar quebra de linha.\nSegunda linha da descrição.', sku: 'aurora-XIC-LONGO-0001', price_cents: '1234590', category_id: a.category.id } }));
expect(await api(`${P}/catalogue/adjustments`, { method: 'POST', actor: a.actor, body: { variant_id: long.variant_id, location_id: a.location.id, delta: 3, reason: 'Saldo inicial sintético TESTE' } }));
const draft = expect(await api(`${P}/catalogue/products`, { method: 'POST', actor: a.actor, body: { name: 'Travessa oval TESTE', slug: 'travessa-oval', description: 'Rascunho sem foto.', sku: 'aurora-TRV-001', price_cents: '14900' } }));
const empty = expect(await api(`${P}/catalogue/products`, { method: 'POST', actor: a.actor, body: { name: 'Tigela funda TESTE', slug: 'tigela-funda', description: 'Sem saldo.', sku: 'aurora-TIG-001', price_cents: '5400', category_id: a.category.id } }));
const apron = expect(await api(`${P}/catalogue/products`, { method: 'POST', actor: a.actor, body: { name: 'Avental de linho TESTE', slug: 'avental', description: 'Tamanho P esgotado; M disponível.', sku: 'aurora-AVT-DEFAULT', price_cents: '8900', category_id: a.category.id } }));
const apronVariants = [];
for (const [tamanho, stock] of [['P', 0], ['M', 4]]) { const v = expect(await api(`${P}/catalogue/products/${apron.id}/variants`, { method: 'POST', actor: a.actor, body: { sku: `aurora-AVT-${tamanho}`, price_cents: '8900', attributes: { tamanho }, weight_g: 300, width_mm: 300, height_mm: 20, length_mm: 400 } })); apronVariants.push(v); if (stock) expect(await api(`${P}/catalogue/adjustments`, { method: 'POST', actor: a.actor, body: { variant_id: v.id, location_id: a.location.id, delta: stock, reason: 'Saldo inicial sintético TESTE' } })); }
// Saldo extra na caneca e nas cores da camiseta: as verificações criam muitos pedidos (cada um reserva por 40 minutos).
for (const v of [a.simple.variant_id, ...a.variants.map((x) => x.id)]) expect(await api(`${P}/catalogue/adjustments`, { method: 'POST', actor: a.actor, body: { variant_id: v, location_id: a.location.id, delta: 40, reason: 'Saldo extra sintético para verificações TESTE' } }));
for (const p of [long, empty, apron]) expect(await api(`${P}/catalogue/products/${p.id}`, { method: 'PATCH', actor: a.actor, body: { status: 'ACTIVE' } }), 200);
// 4. Imagens: gráficos gerados (rotulados “IMAGEM DE TESTE”) na camiseta; na caneca, fotos de --fotos quando existirem
// (as capturas desta entrega usaram coffee.png e chelsea.png do scikit-image), senão mais gráficos rotulados.
const svg = (w, h, c1, c2, label) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="#ffffff" opacity=".35"/><text x="50%" y="92%" font-size="${Math.round(h / 18)}" text-anchor="middle" fill="#ffffff" font-family="sans-serif">${label}</text></svg>`);
async function upload(jpg) {
  for (let t = 0; t < 30; t++) { const r = await fetch(`${base}/api/${P}/catalogue/media`, { method: 'POST', headers: { origin: base, cookie: a.actor.cookie, 'x-csrf-token': a.actor.csrf, 'content-type': 'application/octet-stream' }, body: jpg }); const j = await r.json(); if (r.status === 201) { for (let i = 0; i < 60; i++) { const c = expect(await api(`${P}/catalogue`, { actor: a.actor }), 200); if (c.media.find((m) => m.id === j.id)?.status === 'READY') return j.id; await sleep(1000); } throw new Error('mídia não processada (worker?)'); } if (r.status !== 409) throw new Error(`upload ${r.status} ${JSON.stringify(j)}`); await sleep(2000); }
  throw new Error('upload: fila ocupada');
}
const attach = async (product, id) => expect(await api(`${P}/catalogue/products/${product}/media`, { method: 'POST', actor: a.actor, body: { asset_id: id } }));
for (const [w, h, c1, c2, label] of [[1600, 1000, '#245742', '#9fc5b2', 'IMAGEM DE TESTE 16:10'], [900, 1400, '#7a3b26', '#e6b8a2', 'IMAGEM DE TESTE retrato']]) await attach(a.variable.id, await upload(await sharp(svg(w, h, c1, c2, label)).jpeg({ quality: 82 }).toBuffer()));
const fotos = arg('fotos', '') && existsSync(arg('fotos', '')) ? readdirSync(arg('fotos', '')).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => join(arg('fotos', ''), f)) : [];
const mugImages = fotos.length ? [await sharp(fotos[0]).jpeg({ quality: 88 }).toBuffer(), await sharp(fotos[0]).metadata().then((m) => sharp(fotos[0]).extract({ left: Math.round(m.width / 4), top: 0, width: Math.round(m.width / 2), height: m.height }).jpeg({ quality: 88 }).toBuffer())]
  : [await sharp(svg(1200, 800, '#6b3a1e', '#d9a679', 'IMAGEM DE TESTE paisagem 3:2')).jpeg({ quality: 82 }).toBuffer(), await sharp(svg(600, 800, '#3d2b1f', '#c08a5b', 'IMAGEM DE TESTE retrato 3:4')).jpeg({ quality: 82 }).toBuffer()];
for (const jpg of mugImages) await attach(a.simple.id, await upload(jpg));
// 5. Pedidos: pago, recusado, pago com excedente (devolução pendente) e, por último, aguardando pagamento.
const sa = shop(a.slug);
const paid = await sa.order([[a.variants[0].id, 2], [a.simple.variant_id, 1]], { name: 'Rafael Moreira TESTE', email: 'rafael@example.test' });
await simulate(P, a.actor, paid.order.attempts[0].id, 'APPROVED'); await waitOrder(P, a.actor, paid.order.id, (o) => o.payment_status === 'PAID');
const rejected = await sa.order([[a.simple.variant_id, 1]], { name: 'Comprador recusado TESTE', email: 'recusa@example.test' });
await simulate(P, a.actor, rejected.order.attempts[0].id, 'REJECTED'); await waitOrder(P, a.actor, rejected.order.id, (o) => o.attempts[0].status === 'REJECTED');
const excess = await sa.order([[a.variants[0].id, 2], [a.simple.variant_id, 1]], { name: 'Comprador excedente TESTE', email: 'excedente@example.test' });
const first = excess.order.attempts[0].id; await simulate(P, a.actor, first, 'REJECTED'); await waitOrder(P, a.actor, excess.order.id, (o) => o.attempts[0].status === 'REJECTED');
const retry = expect(await api(`public/stores/${a.slug}/orders/${excess.order.id}/attempts`, { method: 'POST', cookie: excess.cookie, body: { method: 'CARD', key: randomUUID() } }));
await simulate(P, a.actor, retry.attempts[1].id, 'APPROVED'); await waitOrder(P, a.actor, excess.order.id, (o) => o.payment_status === 'PAID');
await simulate(P, a.actor, first, 'APPROVED'); await waitOrder(P, a.actor, excess.order.id, (o) => o.incidents.some((i) => i.code === 'EXCESS_PAYMENT' && i.status === 'OPEN'));
// 6. Protocolos: contato geral e arrependimento do pedido pago.
const contact = expect(await api(`public/stores/${a.slug}/support`, { method: 'POST', body: { name: 'Visitante TESTE', email: 'visitante@example.test', message: 'Qual o prazo de troca para peças com defeito?', key: randomUUID() } }));
const withdrawal = expect(await api(`public/stores/${a.slug}/orders/${paid.order.id}/requests`, { method: 'POST', cookie: paid.cookie, body: { kind: 'WITHDRAWAL', message: 'Desejo exercer o arrependimento desta compra.\nO produto ainda não foi enviado.', key: randomUUID() } }));
// 7. Funcionário da loja A (convite aceito).
const empEmail = `func-${randomBytes(3).toString('hex')}@example.test`, empPass = randomBytes(18).toString('base64url');
const reg = expect(await api('auth/register', { method: 'POST', body: { email: empEmail, password: empPass } })); expect(await api('auth/verify-email', { method: 'POST', body: { token: reg.localToken } }));
const invite = expect(await api(`${P}/invitations`, { method: 'POST', actor: a.actor, body: { email: empEmail } }));
expect(await api('invitations/accept', { method: 'POST', actor: await login(empEmail, empPass), body: { tenantId: a.id, token: invite.localToken } }));
// 8. Administrador da plataforma com MFA: papel concedido pelo script do operador no projeto isolado.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', fromB32 = (v) => { let bits = ''; for (const c of v) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); };
const totp = (s, step) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step)); const h = createHmac('sha1', fromB32(s)).update(c).digest(), o = h[h.length - 1] & 15; return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0'); };
const adminEmail = `admin-${randomBytes(3).toString('hex')}@example.test`, adminPass = randomBytes(18).toString('base64url');
const regA = expect(await api('auth/register', { method: 'POST', body: { email: adminEmail, password: adminPass } })); expect(await api('auth/verify-email', { method: 'POST', body: { token: regA.localToken } }));
const grant = spawnSync('docker', [...designCompose(), 'run', '--rm', '--no-deps', 'migrate', 'node', 'scripts/platform-admin.mjs', 'grant', adminEmail, 'Revisão visual local SIMULADA'], { cwd: repo, encoding: 'utf8' });
if (grant.status !== 0) throw new Error(`platform-admin no projeto ${PROJECT}: ${grant.stderr || grant.stdout}`);
const adminActor = await login(adminEmail, adminPass), setup = expect(await api('auth/mfa/setup', { method: 'POST', actor: adminActor }));
expect(await api('auth/mfa/enable', { method: 'POST', actor: adminActor, body: { code: totp(setup.secret, Math.floor(Date.now() / 30000)) } }));
// 9. Terceira loja (seed de novo: a segunda usa #314A8F, fonte do sistema) sem conta de pagamento conectada.
const [, c] = await seed(api, randomBytes(3).toString('hex'));
// 10. Pedido aguardando pagamento por último (reserva de 40 minutos).
const pending = await sa.order([[a.simple.variant_id, 1]], { name: 'Helena Prado TESTE', email: 'helena@example.test' });
const ref = (x) => ({ id: x.order.id, number: x.order.number, cookie: x.cookie });
save({
  base, project: PROJECT, generatedAt: new Date().toISOString(), note: 'Dados sintéticos (example.test); pagamentos SIMULADOS. Não versionar.',
  storeA: { id: a.id, slug: a.slug, email: a.email, password: a.password, cookie: a.actor.cookie, products: { simple: a.simple.id, variable: a.variable.id, long: long.id, draft: draft.id, empty: empty.id, apron: apron.id }, apronVariants: apronVariants.map((v) => v.id), location: a.location.id },
  storeB: { id: b.id, slug: b.slug, email: b.email, password: b.password },
  storeC: { id: c.id, slug: c.slug, email: c.email, password: c.password, color: '#314A8F' },
  employee: { email: empEmail, password: empPass },
  admin: { email: adminEmail, password: adminPass, secret: setup.secret },
  orders: { pending: ref(pending), pending2: ref(pending), paid: ref(paid), rejected: ref(rejected), excess: ref(excess) },
  support: { contact: contact.id, withdrawal: withdrawal.id },
  photos: fotos.length ? fotos.map((f) => f.split('/').at(-1)) : 'geradas',
});
console.log(JSON.stringify({ lojas: [a.slug, b.slug, c.slug], pedidos: { pendente: pending.order.number, pago: paid.order.number, recusado: rejected.order.number, excedente: excess.order.number }, arquivo: '.local/demo-ui.json' }));
