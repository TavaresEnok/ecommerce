// Verificações de interação da evolução de UX (critérios UX02, UX04, UX06, UI01, UI02 e AX01 do ACEITE), no projeto de
// desenvolvimento, com as lojas de demonstração de scripts/fixtures/seed-presets.mjs. Usa o Chromium do contêiner de testes:
//   docker compose --profile verify run --rm --no-deps -v ./scripts/ux-checks.mjs:/app/scripts/ux-checks.mjs:ro \
//     -v ./.local/demo-presets.json:/app/demo-presets.json:ro -e CHECKS_LABEL=c1 tests node scripts/ux-checks.mjs
// O projeto de desenvolvimento só aceita a própria origem (APP_ORIGIN, padrão http://localhost:3000): o Chromium resolve esse
// nome para o serviço web. Efeitos colaterais (só dados de teste): uma imagem solta na loja Ateliê; uma loja nova com 101
// produtos sintéticos (UX06); o rascunho do tema da Ateliê é salvo e depois restaurado ao conteúdo original (UI02).
// CHECKS_ONLY=UX02,UI01 limita a alguns critérios. Saída: artifacts/revisao/<rótulo>/checks.json e capturas; código 1 se algum critério falhar.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { client } from './seed.mjs';
const base = process.env.BASE_URL || 'http://web:3000', origin = process.env.APP_ORIGIN || 'http://localhost:3000', label = process.env.CHECKS_LABEL || 'checks';
const out = `/app/artifacts/revisao/${label}`; mkdirSync(out, { recursive: true });
const demo = JSON.parse(readFileSync('/app/demo-presets.json', 'utf8')), by = (k) => demo.find((d) => d.key === k);
const api = client(base, origin), results = [];
const check = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'ok   ' : 'FALHA'} ${id} — ${detail}`); };
async function login(email, password) { const r = await api('auth/login', { method: 'POST', body: { email, password } }); if (r.status !== 201) throw new Error(`login ${r.status}`); return { csrf: r.body.csrf, cookie: r.headers.get('set-cookie').split(';')[0] }; }
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${new URL(origin).hostname} ${new URL(base).hostname}`] });
async function open(actor, width, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (actor) await ctx.addCookies([{ name: actor.cookie.split('=')[0], value: actor.cookie.split('=').slice(1).join('='), domain: new URL(origin).hostname, path: '/' }]);
  const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message)); return { ctx, page, errors };
}
const only = (process.env.CHECKS_ONLY || '').split(',').filter(Boolean);
const step = async (id, fn) => { if (only.length && !only.includes(id)) return; try { await fn(); } catch (e) { check(id, false, `erro: ${String(e.message).split('\n')[0]}`); } };
const atelie = by('atelie'), owner = await login(atelie.email, atelie.password), T = atelie.tenantId, panel = `${origin}/painel/${T}`;
const overflow = (page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));

// UX02 menu do painel no celular: compacto, por teclado, foco preso no diálogo e devolvido ao botão.
await step('UX02', async () => {
  const { ctx, page } = await open(owner, 390); await page.goto(`${panel}/operacao`); await page.getByRole('heading', { level: 1, name: 'Hoje' }).waitFor(); await page.waitForLoadState('networkidle');
  const visibleLinksBefore = await page.locator('a:visible').filter({ hasText: /^(Pedidos|Atendimento|Produtos|Estoque|Imagens|Aparência|Segurança)$/ }).count();
  const button = page.getByRole('button', { name: 'Menu' }); await button.focus(); const expandedBefore = await button.getAttribute('aria-expanded'); await page.keyboard.press('Enter');
  const dialog = page.locator('dialog#painel-menu[open]'); await dialog.waitFor(); const inside = await page.evaluate(() => !!document.activeElement?.closest('dialog'));
  const groups = (await dialog.locator('.nav-group-title, h2, .nav-label').allTextContents()).map((t) => t.trim()).filter(Boolean); await page.screenshot({ path: `${out}/UX02-menu-aberto-390.png` });
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }).catch(() => {}); const closed = (await page.locator('dialog#painel-menu[open]').count()) === 0;
  const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-controls'));
  await button.click(); await page.locator('dialog#painel-menu[open]').getByRole('link', { name: 'Produtos', exact: true }).click(); await page.getByRole('heading', { level: 1, name: 'Produtos' }).waitFor(); const closesOnNavigate = (await page.locator('dialog#painel-menu[open]').count()) === 0;
  check('UX02', visibleLinksBefore === 0 && expandedBefore === 'false' && inside && closed && back === 'painel-menu' && closesOnNavigate, `links de navegação visíveis antes de abrir: ${visibleLinksBefore}; “Menu” com aria-expanded=${expandedBefore}; Enter abre o diálogo com foco dentro (${inside}); grupos: ${groups.join(' · ') || '(sem rótulo)'}; Esc fecha (${closed}) e devolve o foco ao botão (${back === 'painel-menu'}); navegar fecha o menu (${closesOnNavigate})`);
  await ctx.close();
});

// UX04 edição progressiva: erro de endereço abre o bloco certo, nada é salvo e o que foi digitado continua; sair pergunta antes.
await step('UX04', async () => {
  const cat = (await api(`tenants/${T}/catalogue`, { actor: owner })).body, [p1, p2] = cat.products;
  const { ctx, page } = await open(owner, 390); await page.goto(`${panel}?produto=${p1.id}`); await page.getByRole('heading', { level: 1, name: p1.name }).waitFor(); await page.waitForLoadState('networkidle');
  const foldClosed = !(await page.getByLabel('Endereço na loja').isVisible());
  const name = page.getByLabel('Nome', { exact: true }); await name.fill(`${p1.name} (edição TESTE)`);
  await page.locator('summary', { hasText: 'Organização e endereço' }).click(); await page.getByLabel('Endereço na loja').fill(p2.slug);
  await page.getByRole('button', { name: 'Salvar alterações' }).click(); await page.getByRole('alert').first().waitFor();
  // Espera o estado de erro do campo (não só o alerta geral), para não ler antes da nova renderização.
  await page.waitForFunction(() => document.querySelector('input[name=slug]')?.getAttribute('aria-invalid') === 'true', null, { timeout: 5000 }).catch(() => {});
  const slug = page.getByLabel('Endereço na loja'), invalid = await slug.getAttribute('aria-invalid'), slugMsg = await slug.evaluate((e) => (e.getAttribute('aria-describedby') || '').split(' ').map((id) => document.getElementById(id)?.textContent).join(' ').trim());
  const kept = await name.inputValue(), dirty = await page.getByText('Alterações não salvas').count(), saved = (await api(`tenants/${T}/catalogue`, { actor: owner })).body.products.find((x) => x.id === p1.id).name;
  await page.screenshot({ path: `${out}/UX04-erro-endereco-390.png`, fullPage: true });
  await page.getByRole('link', { name: /Produtos/ }).first().click(); const confirm = page.getByRole('dialog').filter({ hasText: 'Descartar alterações?' }); await confirm.waitFor({ timeout: 5000 }); const guarded = await confirm.count();
  await page.screenshot({ path: `${out}/UX04-sair-com-alteracoes-390.png` });
  check('UX04', foldClosed && invalid === 'true' && kept.endsWith('(edição TESTE)') && dirty > 0 && saved === p1.name && guarded === 1, `“Organização e endereço” começa recolhido (${foldClosed}); endereço repetido → erro no campo (aria-invalid=${invalid}; “${slugMsg.slice(0, 90)}”), nada salvo (nome no servidor continua “${saved}”); nome digitado mantido (“${kept}”) e “Alterações não salvas” visível (${dirty}); voltar para a lista pergunta “Descartar alterações?” (${guarded})`);
  await ctx.close();
});

// UX06 busca no limite: loja nova com 101 produtos; o 101º por nome não aparece e a tela diz o escopo real.
await step('UX06', async () => {
  const email = `ux06-${randomBytes(3).toString('hex')}@example.test`, password = randomBytes(18).toString('base64url');
  const reg = await api('auth/register', { method: 'POST', body: { email, password } }); await api('auth/verify-email', { method: 'POST', body: { token: reg.body.localToken } });
  const actor = await login(email, password), store = (await api('tenants', { method: 'POST', actor, body: { name: 'Limite da busca TESTE', slug: `limite-${randomBytes(3).toString('hex')}` } })).body;
  for (let i = 1; i <= 101; i++) { const name = i === 101 ? 'Zíper de latão TESTE' : `Produto ${String(i).padStart(3, '0')} TESTE`; for (let t = 0; t < 20; t++) { const r = await api(`tenants/${store.id}/catalogue/products`, { method: 'POST', actor, body: { name, slug: `p-${i}`, sku: `LIM-${i}`, price_cents: String(1000 + i) } }); if (r.status === 201) break; if (r.status !== 429) throw new Error(`produto ${i}: ${r.status}`); await new Promise((s) => setTimeout(s, 3000)); } }
  const { ctx, page } = await open(actor, 390); await page.goto(`${origin}/painel/${store.id}`); await page.getByText('Buscar nos primeiros 100 produtos (A–Z)').waitFor();
  const note = (await page.locator('.scope-note').textContent() ?? '').trim(); await page.getByRole('searchbox').fill('Zíper'); await page.getByText(/Nada encontrado para “Zíper”/).waitFor();
  await page.screenshot({ path: `${out}/UX06-limite-390.png`, fullPage: true });
  check('UX06', /primeiros 100 produtos em ordem alfabética/.test(note), `loja com 101 produtos: rótulo “Buscar nos primeiros 100 produtos (A–Z)”; aviso “${note.slice(0, 110)}…”; buscar o 101º (“Zíper…”) mostra “Nada encontrado”, coerente com o escopo declarado`);
  await ctx.close();
});

// UI01 envio de imagens em português: estados reais de sucesso e de falha, com recuperação.
await step('UI01', async () => {
  const { ctx, page } = await open(owner, 1440, 900); await page.goto(`${panel}?aba=midia`); await page.getByRole('heading', { level: 1, name: 'Imagens' }).waitFor();
  const input = page.locator('.uploader input[type=file]'), button = await page.locator('.dropzone-label .btn').textContent();
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#7A5C3E' } }).png().toBuffer();
  await input.setInputFiles({ name: 'foto-teste.png', mimeType: 'image/png', buffer: png });
  const seen = new Set(); for (let i = 0; i < 120; i++) { const t = await page.locator('.upload-item').first().innerText().catch(() => ''); for (const s of ['Conferindo', 'Na fila', 'Enviando', 'Processando no servidor', 'Pronta']) if (t.includes(s)) seen.add(s); if (seen.has('Pronta')) break; await page.waitForTimeout(250); }
  await input.setInputFiles({ name: 'contrato.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
  await page.waitForTimeout(800); const items = await page.locator('.upload-item').allInnerTexts(), failed = items.find((t) => t.includes('contrato.pdf')) ?? '';
  await page.screenshot({ path: `${out}/UI01-envios-1440.png` });
  const remove = page.getByRole('button', { name: 'Tirar contrato.pdf da lista' }); const canRemove = await remove.count(); if (canRemove) await remove.click();
  check('UI01', button?.trim() === 'Adicionar imagens' && seen.has('Pronta') && seen.has('Processando no servidor') && /JPEG|PNG|WebP|formato|tipo/i.test(failed) && canRemove === 1, `botão “${button?.trim()}”; estados vistos no envio válido: ${[...seen].join(' → ')}; arquivo PDF recusado antes do envio com “${failed.replace(/\s+/g, ' ').replace('contrato.pdf', '').trim().slice(0, 90)}” e “Tirar da lista” disponível`);
  await ctx.close();
});

// UI02 menu por destinos legíveis: criar, reordenar, salvar, reabrir; depois devolve o rascunho original.
await step('UI02', async () => {
  const original = (await api(`tenants/${T}/storefront`, { actor: owner })).body.draft_theme;
  const { ctx, page } = await open(owner, 1440, 900);
  try {
    await page.goto(`${panel}/aparencia`); await page.getByRole('heading', { level: 1, name: 'Aparência' }).waitFor(); await page.waitForLoadState('networkidle');
    const menu = page.locator('details', { has: page.locator('summary', { hasText: /^Menu/ }) }).first(); await menu.locator('summary').click();
    await menu.getByRole('button', { name: 'Adicionar link' }).click(); await menu.getByLabel('Texto do link').fill('Cestos TESTE'); await menu.getByLabel('Leva para').selectOption({ label: 'Uma categoria' });
    const cats = await menu.getByLabel('Categoria').locator('option').allTextContents(); await menu.getByLabel('Categoria').selectOption({ label: cats.find((c) => /Cest/.test(c)) ?? cats[0] });
    const rows = () => menu.locator('.link-list > li strong').allTextContents(), before = await rows();
    await menu.getByRole('button', { name: 'Mover Cestos TESTE para cima' }).click(); const after = await rows(), announced = (await page.locator('[aria-live]').allTextContents()).join(' ');
    const described = (await menu.locator('.link-list > li', { hasText: 'Cestos TESTE' }).locator('.small').textContent())?.trim();
    await page.getByRole('button', { name: 'Salvar rascunho' }).click(); await page.getByText('Rascunho salvo. A loja publicada só muda quando você publicar.').waitFor();
    await page.reload(); await page.getByRole('heading', { level: 1, name: 'Aparência' }).waitFor(); await page.waitForLoadState('networkidle');
    const menu2 = page.locator('details', { has: page.locator('summary', { hasText: /^Menu/ }) }).first(); const summary = (await menu2.locator('.fold-summary').textContent())?.trim();
    const savedMenu = (await api(`tenants/${T}/storefront`, { actor: owner })).body.draft_theme.menu, saved = savedMenu.find((m) => m.label === 'Cestos TESTE');
    await page.screenshot({ path: `${out}/UI02-menu-1440.png` });
    check('UI02', after.indexOf('Cestos TESTE') === before.indexOf('Cestos TESTE') - 1 && saved?.to.kind === 'category' && /Cestos TESTE/.test(summary ?? '') && /movido/.test(announced), `link criado com destino “${described}” (sem digitar endereço); ↑ move de ${before.indexOf('Cestos TESTE') + 1}ª para ${after.indexOf('Cestos TESTE') + 1}ª posição com anúncio “${announced.match(/Cestos TESTE movido[^.]*\./)?.[0] ?? ''}”; salvo e reaberto: menu “${summary}”; servidor guarda { kind: ${saved?.to.kind}, ref: ${saved?.to.ref} }`);
  } finally {
    await ctx.close(); const now = (await api(`tenants/${T}/storefront`, { actor: owner })).body;
    await api(`tenants/${T}/storefront/draft`, { method: 'POST', actor: owner, body: { ...original, base_revision_id: now.state.draft_revision_id } });
  }
});

// AX01 reflow e teclado: 320 px (reflow) e 640 px (equivale a 1280 px com zoom de 200%) sem rolagem horizontal; 1º Tab no “Ir para o conteúdo”.
await step('AX01', async () => {
  const store = new URL(atelie.store).pathname, cat = (await api(`tenants/${T}/catalogue`, { actor: owner })).body, prod = cat.products.find((p) => p.status === 'ACTIVE');
  const pages = [['loja-inicio', store, null], ['loja-catalogo', `${store}/produtos`, null], ['loja-produto', `${store}/produtos/${prod.slug}`, null], ['loja-carrinho', `${store}/carrinho`, null],
    ['painel-produtos', `/painel/${T}`, owner], ['painel-produto', `/painel/${T}?produto=${prod.id}`, owner], ['painel-pedidos', `/painel/${T}/pedidos`, owner], ['painel-aparencia', `/painel/${T}/aparencia`, owner], ['painel-entregas', `/painel/${T}/configuracoes/entregas`, owner]];
  const bad = [], skip = [];
  for (const [name, path, actor] of pages) for (const width of [320, 640]) {
    const { ctx, page, errors } = await open(actor, width, 800); await page.goto(origin + path); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
    const o = await overflow(page); if (o > 0) bad.push(`${name}@${width}: ${o}px`); if (errors.length) bad.push(`${name}@${width}: ${errors[0]}`);
    if (width === 320) { await page.keyboard.press('Tab'); const first = await page.evaluate(() => document.activeElement?.textContent?.trim()); if (!/Ir para o conteúdo/.test(first ?? '')) skip.push(`${name}: “${first}”`); await page.screenshot({ path: `${out}/AX01-${name}-320.png`, fullPage: true }); }
    await ctx.close();
  }
  check('AX01', bad.length === 0 && skip.length === 0, `${pages.length} telas × 320/640 px: rolagem horizontal/erros ${bad.length ? bad.join('; ') : 'nenhum'}; 1º Tab em “Ir para o conteúdo” em todas${skip.length ? ` exceto ${skip.join('; ')}` : ''}. Zoom real do navegador e leitor de tela não foram exercitados aqui.`);
});

// CK-RESUMO checkout no celular (D-25): total na linha do resumo do topo; na revisão, itens e entrega junto do botão.
// Para antes de confirmar: nenhum pedido é criado.
await step('CK-RESUMO', async () => {
  const store = new URL(atelie.store).pathname, prod = (await (await fetch(`${base}/api/public/stores/${store.split('/')[2]}`)).json()).products.find((p) => p.variants.length === 1 && p.variants[0].available > 0);
  const { ctx, page, errors } = await open(null, 390); await page.goto(`${origin}${store}/produtos/${prod.slug}`);
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click(); await page.getByRole('link', { name: 'Ver carrinho' }).click(); await page.getByRole('heading', { name: 'Seu carrinho' }).waitFor();
  const summary = page.locator('.mobile-summary > summary'), before = (await summary.innerText()).replace(/\s+/g, ' ');
  const f = page.getByRole('form', { name: 'Calcular frete' }); for (const [l, v] of [['CEP', '01001000'], ['Número', '120'], ['Rua', 'Rua das Acácias'], ['Cidade', 'São Paulo'], ['UF', 'SP']]) await f.getByLabel(l, { exact: true }).fill(v);
  await f.getByRole('button', { name: 'Calcular frete' }).click(); await page.getByRole('heading', { name: 'Seus dados' }).waitFor(); const afterQuote = (await summary.innerText()).replace(/\s+/g, ' ');
  const b = page.getByRole('form', { name: 'Dados do comprador' }); await b.getByLabel('Nome completo').fill('Resumo TESTE'); await b.getByLabel('E-mail para comprovante').fill('resumo@example.test'); await b.getByRole('button', { name: 'Revisar pedido' }).click(); await page.getByText('Revise antes de confirmar').waitFor();
  const review = page.locator('section.confirm'), items = await review.locator('.review-items li').count(), delivery = (await review.getByText(/^Entrega:/).textContent())?.trim(), button = (await review.getByRole('button', { name: /^Confirmar compra de/ }).textContent())?.trim();
  await page.screenshot({ path: `${out}/CK-RESUMO-revisao-390.png`, fullPage: true }); await summary.click(); await page.screenshot({ path: `${out}/CK-RESUMO-aberto-390.png` });
  check('CK-RESUMO', /Subtotal R\$/.test(before) && /Total R\$/.test(afterQuote) && items > 0 && !!delivery && !!button && errors.length === 0, `resumo do topo antes do frete: “${before}”; depois do frete: “${afterQuote}”; revisão com ${items} item(ns), “${delivery}” e botão “${button}” (não clicado; nenhum pedido criado)`);
  await ctx.close();
});

await browser.close();
writeFileSync(`${out}/checks.json`, JSON.stringify({ base: origin, date: new Date().toISOString(), results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
