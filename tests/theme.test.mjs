import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { seed, client } from '../scripts/seed.mjs';
// Tema v2 de ponta a ponta (API real, banco com RLS e navegador): v1 lido como v2, rascunho com proteção contra sobrescrita
// entre sessões, publicação exata, histórico, restaurar e reverter, isolamento entre lojas, cor clara com contraste garantido
// e o editor com prévia ao vivo em 390 e 1440 px.
assert.equal(process.env.APP_ENV, 'test'); const base = process.env.BASE_URL;
// TEST_ORIGIN (opcional) roda a suíte contra um projeto que só aceita a própria origem (ex.: desenvolvimento em localhost:3000):
// a API recebe essa origem e o Chromium resolve o nome dela para o serviço web. No ambiente de verificação, é a própria BASE_URL.
const origin = process.env.TEST_ORIGIN || base, api = client(base, origin), mapped = new URL(origin).hostname !== new URL(base).hostname;
const report = { passed: false, criteria: ['PE-schema', 'PE-concorrencia', 'PE-historico', 'PE-isolamento', 'PE-contraste', 'PE-editor'], tests: [], visual: [] };
const expect = (r, status = 201) => { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; };
const v2 = (title, extra = {}) => ({
  schema_version: 2, preset: 'atelie', title, description: 'Tema v2 de teste',
  brand: { color: '#2F5D50', font: 'fraunces', button: 'pill', logo: null }, layout: { width: 'regular', density: 'comfortable', ratio: 'square', fit: 'cover' },
  sections: [{ id: 'abertura', type: 'hero', hidden: false, heading: `Abertura ${title}`, text: 'Peças de teste.', image: null, focal: { x: 50, y: 50 }, layout: 'stacked', cta: { label: 'Ver produtos', to: { kind: 'catalog' } } },
    { id: 'produtos', type: 'products', hidden: false, heading: 'Produtos', source: 'all', category: null, products: [], limit: 8 }],
  menu: [{ label: 'Sobre', to: { kind: 'page', ref: 'sobre' } }], footer: { links: [], note: '' }, pages: [{ slug: 'sobre', title: 'Sobre a loja TESTE', body: 'Loja sintética.' }], assets: [], ...extra,
});
async function login(s) { const r = await api('auth/login', { method: 'POST', body: { email: s.email, password: s.password } }); expect(r); return { id: r.body.user.id, csrf: r.body.csrf, cookie: r.headers.get('set-cookie').split(';')[0] }; }
const luminance = (rgb) => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('Tema v2: esquema, concorrência, histórico, isolamento, contraste e editor', async (t) => {
  const browser = await chromium.launch({ headless: true, args: mapped ? [`--host-resolver-rules=MAP ${new URL(origin).hostname} ${new URL(base).hostname}`] : [] }); let failures = 0;
  const check = async (name, fn) => { let passed = false; await t.test(name, async () => { await fn(); passed = true; }); if (!passed) failures++; report.tests.push({ name, result: passed ? 'passed' : 'failed' }); };
  try {
    const [a, b] = await seed(api), A = a.id, B = b.id, P = `tenants/${A}/storefront`;
    const settings = async (actor = a.actor, tenant = A) => expect(await api(`tenants/${tenant}/storefront`, { actor }), 200);
    const pub = async (slug = a.slug) => expect(await api(`public/stores/${slug}`), 200).theme;

    await check('Loja com tema v1 publicado é lida como v2 (rascunho e loja pública)', async () => {
      const s = await settings();
      assert.equal(s.draft_theme.schema_version, 2); assert.equal(s.draft_theme.preset, 'essencial'); assert.equal(s.draft_theme.title, 'AURORA TESTE');
      assert.ok(s.draft_theme.sections.some((x) => x.type === 'hero' && x.heading === 'Pequenos favoritos, grandes descobertas'));
      const p = await pub(); assert.equal(p.schema_version, 2); assert.equal(p.title, 'AURORA TESTE'); assert.ok(p.supplier, 'fornecedor congelado na publicação');
    });

    let d1;
    await check('Duas sessões: a segunda não sobrescreve em silêncio (409) e a loja pública só muda ao publicar', async () => {
      const s2 = await login(a), open = await settings(), d0 = open.state.draft_revision_id;
      d1 = expect(await api(`${P}/draft`, { method: 'POST', actor: a.actor, body: { ...v2('Sessão 1 TESTE'), base_revision_id: d0 } })).id;
      const late = await api(`${P}/draft`, { method: 'POST', actor: s2, body: { ...v2('Sessão 2 TESTE'), base_revision_id: d0 } });
      assert.equal(late.status, 409, JSON.stringify(late.body)); assert.match(late.body.error?.message ?? JSON.stringify(late.body), /Outra sessão/);
      const now = await settings(); assert.equal(now.state.draft_revision_id, d1); assert.equal(now.draft_theme.title, 'Sessão 1 TESTE');
      assert.equal((await pub()).title, 'AURORA TESTE');
      expect(await api(`${P}/publish`, { method: 'POST', actor: a.actor, body: { revision_id: d0 } }), 409); // rascunho antigo nunca é publicado
      const published = await pub(); assert.equal(published.title, 'AURORA TESTE');
      expect(await api(`${P}/publish`, { method: 'POST', actor: a.actor, body: { revision_id: d1 } }));
      const after = await pub(); assert.equal(after.title, 'Sessão 1 TESTE'); assert.equal(after.preset, 'atelie');
    });

    await check('Histórico: restaurar a publicada no rascunho e reverter a publicação, com proteção contra versão desatualizada', async () => {
      let s = await settings(); assert.ok(s.history.length >= 2); assert.equal(s.history[0].current, true); assert.equal(s.history[0].title, 'Sessão 1 TESTE');
      const d2 = expect(await api(`${P}/draft`, { method: 'POST', actor: a.actor, body: { ...v2('Rascunho descartável TESTE'), base_revision_id: s.state.draft_revision_id } })).id;
      expect(await api(`${P}/draft/restore`, { method: 'POST', actor: a.actor, body: { base_revision_id: s.state.draft_revision_id } }), 409);
      expect(await api(`${P}/draft/restore`, { method: 'POST', actor: a.actor, body: { base_revision_id: d2 } }));
      s = await settings(); assert.equal(s.draft_theme.title, 'Sessão 1 TESTE');
      const first = s.history.find((h) => h.title === 'AURORA TESTE'), current = s.state.published_revision_id; assert.ok(first);
      expect(await api(`${P}/rollback`, { method: 'POST', actor: a.actor, body: { revision_id: current, expected_published_id: current } }), 409);
      expect(await api(`${P}/rollback`, { method: 'POST', actor: a.actor, body: { revision_id: first.id, expected_published_id: current } }));
      assert.equal((await pub()).title, 'AURORA TESTE');
      expect(await api(`${P}/rollback`, { method: 'POST', actor: a.actor, body: { revision_id: first.id, expected_published_id: current } }), 409); // publicação mudou
      s = await settings(); assert.equal(s.history[0].current, true); assert.equal(s.history[0].title, 'AURORA TESTE');
    });

    await check('Validação no servidor recusa conteúdo perigoso ou incompleto (400) sem trocar o rascunho', async () => {
      const before = (await settings()).state.draft_revision_id;
      for (const body of [v2('<b>x</b>'), v2('Link inseguro', { menu: [{ label: 'Fora', to: { kind: 'external', url: 'http://example.test' } }] }), v2('Modelo', { preset: 'outro' }),
        v2('Muitas', { sections: Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, type: 'text', text: 'x' })) }), { ...v2('Sem marca'), brand: undefined }])
        expect(await api(`${P}/draft`, { method: 'POST', actor: a.actor, body }), 400);
      assert.equal((await settings()).state.draft_revision_id, before);
    });

    await check('Isolamento: uma loja não lê, não grava e não referencia imagens da outra', async () => {
      const read = await api(`tenants/${B}/storefront`, { actor: a.actor }); assert.ok([403, 404].includes(read.status), `leitura cruzada ${read.status}`);
      const write = await api(`tenants/${B}/storefront/draft`, { method: 'POST', actor: a.actor, body: v2('Invasão TESTE') }); assert.ok([403, 404].includes(write.status), `escrita cruzada ${write.status}`);
      const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#314a8f' } }).png().toBuffer();
      const foreign = expect(await api(`tenants/${B}/catalogue/media`, { method: 'POST', actor: b.actor, raw: image })).id;
      const before = (await settings()).state.draft_revision_id;
      const cross = await api(`${P}/draft`, { method: 'POST', actor: a.actor, body: v2('Imagem alheia TESTE', { brand: { color: '#2F5D50', font: 'plex', button: 'rounded', logo: foreign } }) });
      assert.equal(cross.status, 400, JSON.stringify(cross.body)); assert.match(cross.body.error?.message ?? '', /não existe nesta loja/); assert.equal((await settings()).state.draft_revision_id, before);
      assert.equal((await pub(b.slug)).title, 'BRISA TESTE');
      const preview = expect(await api(`${P}/preview`, { actor: a.actor }), 200); assert.ok(!JSON.stringify(preview).includes('BRISA'));
    });

    await check('Cor de marca clara (#F2C94C): a loja publica uma versão ajustada com contraste AA nos botões', async () => {
      const s = await settings(b.actor, B);
      const d = expect(await api(`tenants/${B}/storefront/draft`, { method: 'POST', actor: b.actor, body: { ...v2('Amarela TESTE', { preset: 'editorial', brand: { color: '#F2C94C', font: 'bodoni', button: 'square', logo: null } }), base_revision_id: s.state.draft_revision_id } })).id;
      expect(await api(`tenants/${B}/storefront/publish`, { method: 'POST', actor: b.actor, body: { revision_id: d } }));
      for (const width of [390, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = []; page.on('pageerror', (e) => errors.push(e.message));
        try {
          await page.goto(`${origin}/lojas/${b.slug}`); const cta = page.getByRole('link', { name: 'Ver produtos' }).first(); await cta.waitFor();
          const [fg, bg] = await cta.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
          const ratio = contrast(fg, bg); assert.ok(ratio >= 4.5, `contraste do botão ${ratio.toFixed(2)} (${fg} sobre ${bg})`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
          assert.equal(errors.length, 0, errors.join('\n')); await page.screenshot({ path: `/app/artifacts/theme-contrast-${width}.png`, fullPage: true });
          report.visual.push({ viewport: width, page: 'loja com cor clara', contrast: Number(ratio.toFixed(2)), result: 'passed' });
        } finally { await page.close(); }
      }
    });

    await check('Editor: prévia ao vivo no mesmo renderizador e conflito visível entre duas sessões (390 e 1440)', async () => {
      const cookieOf = (actor) => [{ name: actor.cookie.split('=')[0], value: actor.cookie.split('=').slice(1).join('='), domain: new URL(origin).hostname, path: '/' }];
      const open = async (actor, width) => { const ctx = await browser.newContext({ viewport: { width, height: 900 } }); await ctx.addCookies(cookieOf(actor)); const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && /frame|X-Frame/i.test(m.text())) errors.push(m.text()); }); await page.goto(`${origin}/painel/${A}/aparencia`); await page.getByRole('heading', { level: 1, name: 'Aparência' }).waitFor(); return { ctx, page, errors }; };
      const rename = async (page, title) => { const field = page.getByLabel('Nome da loja', { exact: true }); if (!(await field.isVisible())) await page.getByText('Identidade', { exact: true }).filter({ visible: true }).first().click(); await field.fill(title); };
      const one = await open(a.actor, 1440), two = await open(await login(a), 390);
      try {
        await rename(one.page, 'Prévia ao vivo TESTE');
        const frame = one.page.frameLocator('iframe[title="Prévia da loja com as alterações"]');
        // Desktop: controles e prévia lado a lado (a prévia não pode ficar escondida pelo modo do celular).
        const box = await one.page.locator('iframe[title="Prévia da loja com as alterações"]').boundingBox(), ctl = await one.page.getByLabel('Nome da loja', { exact: true }).boundingBox();
        // Espaço de trabalho (trilho | prévia | propriedades): prévia e campo visíveis ao mesmo tempo, lado a lado, sem sobreposição.
        assert.ok(box && ctl && box.width > 400 && box.height > 300 && (box.x >= ctl.x + ctl.width || ctl.x >= box.x + box.width), `prévia visível ao lado dos controles: prévia ${JSON.stringify(box)}, campo ${JSON.stringify(ctl)}`);
        // O h1 da página inicial é só para leitores de tela (visualmente oculto): espera ele existir com o nome novo.
        await frame.locator('h1', { hasText: 'Prévia ao vivo TESTE' }).waitFor({ state: 'attached', timeout: 15000 }).catch(async (e) => { const f = one.page.frames().find((x) => x.url().includes('/preview/')); throw new Error(`prévia sem o nome novo: frame ${f?.url()} h1=${await f?.evaluate(() => [...document.querySelectorAll('h1')].map((h) => h.textContent).join(' | ')).catch(() => '?')} (${e.message.split('\n')[0]})`); });
        await one.page.getByText('Alterações não salvas').first().waitFor();
        await two.page.getByRole('button', { name: 'Prévia', exact: true }).click(); await two.page.frameLocator('iframe[title="Prévia da loja com as alterações"]').getByRole('heading', { level: 1 }).waitFor({ state: 'attached', timeout: 15000 });
        await two.page.getByRole('button', { name: 'Editar', exact: true }).click(); await rename(two.page, 'Sessão celular TESTE');
        await one.page.getByRole('button', { name: 'Salvar rascunho' }).click(); await one.page.getByText('Rascunho salvo. A loja publicada só muda quando você publicar.').waitFor();
        await two.page.getByRole('button', { name: 'Salvar rascunho' }).click(); await two.page.getByRole('alert').filter({ hasText: 'O rascunho mudou em outra sessão' }).waitFor();
        assert.equal((await settings()).draft_theme.title, 'Prévia ao vivo TESTE');
        assert.equal((await pub()).title, 'AURORA TESTE');
        for (const s of [one, two]) { assert.equal(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); assert.equal(s.errors.length, 0, s.errors.join('\n')); }
        await one.page.screenshot({ path: '/app/artifacts/theme-editor-1440.png' }); await two.page.screenshot({ path: '/app/artifacts/theme-editor-390.png', fullPage: true });
        report.visual.push({ viewport: 1440, page: 'editor com prévia ao vivo', result: 'passed' }, { viewport: 390, page: 'editor: conflito entre sessões', result: 'passed' });
      } finally { await one.ctx.close(); await two.ctx.close(); }
    });
    report.passed = failures === 0;
  } finally { await browser.close(); writeFileSync('/app/artifacts/theme.json', JSON.stringify({ ...report, completedAt: new Date().toISOString() }, null, 2)); }
  assert.equal(report.passed, true);
});
