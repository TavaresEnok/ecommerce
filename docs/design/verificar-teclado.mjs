// Verificações de teclado e foco nas rotas reais (complementa capturar-rotas.mjs).
// Uso: node docs/design/verificar-teclado.mjs [--base=http://localhost:3000]
// Requer o ambiente local com os dados de .local/demo-ui.json (fora do git) e Playwright com Chromium.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, '..', '..');
import { launch, baseOf } from './ambiente/navegador.mjs';
const demo = JSON.parse(readFileSync(join(repo, '.local/demo-ui.json'), 'utf8')), base = baseOf(demo);
const A = demo.storeA, results = [];
const check = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'ok  ' : 'FALHA'} ${id} — ${detail}`); };
async function login({ email, password }) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const [name, value] = r.headers.get('set-cookie').split(';')[0].split('='); return [{ name, value, url: base }];
}
const focused = (page) => page.evaluate(() => { const e = document.activeElement; return { tag: e?.tagName, text: (e?.getAttribute('aria-label') || e?.textContent || '').trim().slice(0, 60), outline: e ? getComputedStyle(e).outlineStyle : '' }; });
const browser = await launch();

// 1. Painel: primeiro Tab no link de pular, contorno de foco visível; diálogo com foco inicial, Esc e retorno de foco.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await context.addCookies(await login(A));
  const page = await context.newPage(); await page.goto(`${base}/painel/${A.id}/pedidos?pedido=${demo.orders.excess.id}`); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor();
  await page.keyboard.press('Tab'); let f = await focused(page);
  check('painel-tab-inicial', /conteúdo/i.test(f.text) && f.outline !== 'none', `primeiro Tab: ${f.tag} “${f.text}”, contorno ${f.outline}`);
  const opener = page.getByRole('button', { name: 'Cancelar pedido…' }); await opener.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  const inside = await page.evaluate(() => !!document.activeElement?.closest('dialog'));
  check('dialogo-foco-inicial', inside, `foco dentro do diálogo: ${inside} (${(await focused(page)).text})`);
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); f = await focused(page);
  check('dialogo-esc-retorno', /Cancelar pedido/.test(f.text), `após Esc o foco volta para “${f.text}”`);
  const synthesis = await page.getByText(/Pagamento recebido · devolução pendente/).count();
  check('pedido-sintese', synthesis > 0, 'síntese “Pagamento recebido · devolução pendente … envio bloqueado” presente');
  const refundButton = await page.getByRole('button', { name: /reembols|devolver valor|estornar/i }).count();
  check('pedido-sem-reembolso-api', refundButton === 0, `botões que iniciariam devolução pela API: ${refundButton}`);
  await context.close();
}
// 2. Funcionário: ações do Dono ausentes no pedido.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await context.addCookies(await login(demo.employee));
  const page = await context.newPage(); await page.goto(`${base}/painel/${A.id}/pedidos?pedido=${demo.orders.excess.id}`); await page.getByRole('heading', { name: /^Pedido nº/ }).waitFor();
  const owner = await page.getByRole('button', { name: 'Cancelar pedido…' }).count();
  check('funcionario-sem-acoes-dono', owner === 0, `botão “Cancelar pedido…” visível para funcionário: ${owner}`);
  await context.close();
}
// 3. Vitrine: variação por setas atualiza SKU; adicionar anuncia em role=status; etapa do checkout move o foco para o título.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage(); await page.goto(`${base}/lojas/${A.slug}/produtos/camiseta`);
  await page.getByRole('radio', { name: 'Azul / M' }).focus(); await page.keyboard.press('ArrowRight');
  const checked = await page.getByRole('radio', { name: 'Verde / M' }).isChecked(), sku = await page.getByText(/SKU .*Verde/).count();
  check('variacao-setas', checked && sku > 0, `seta → seleciona Verde / M: ${checked}; SKU atualizado: ${sku > 0}`);
  const box = await page.getByRole('button', { name: 'Adicionar ao carrinho' }).boundingBox();
  check('alvo-toque-adicionar', box.height >= 44 && box.width >= 44, `“Adicionar ao carrinho” ${Math.round(box.width)}×${Math.round(box.height)} px`);
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).press('Enter');
  const status = page.getByRole('status'); await status.getByRole('link', { name: 'Ver carrinho' }).waitFor();
  check('adicionar-status', true, `role=status: “${(await status.textContent()).trim()}”`);
  await status.getByRole('link', { name: 'Ver carrinho' }).click(); await page.getByRole('heading', { name: 'Seu carrinho' }).waitFor();
  const form = page.getByRole('form', { name: 'Calcular frete' });
  for (const [l, v] of [['CEP', '01001000'], ['Número', '1'], ['Rua', 'Rua TESTE'], ['Cidade', 'São Paulo'], ['UF', 'SP']]) await form.getByLabel(l, { exact: true }).fill(v);
  await form.getByRole('button', { name: 'Calcular frete' }).click(); await page.getByRole('form', { name: 'Dados do comprador' }).waitFor();
  let f = await focused(page);
  check('checkout-foco-etapa', f.tag === 'H1', `após calcular frete o foco vai para ${f.tag} “${f.text}”`);
  const visibleDelivery = await page.getByRole('form', { name: 'Calcular frete' }).count();
  check('checkout-so-etapa-atual', visibleDelivery === 0, `formulário de entrega concluído vira resumo (formulários de entrega visíveis: ${visibleDelivery})`);
  const buyer = page.getByRole('form', { name: 'Dados do comprador' });
  await buyer.getByLabel('Nome completo').fill('Teclado TESTE'); await buyer.getByLabel('E-mail para comprovante').fill('teclado@example.test'); await buyer.getByRole('button', { name: 'Revisar pedido' }).click();
  await page.getByText('Revise antes de confirmar').waitFor();
  await page.getByRole('button', { name: 'Alterar entrega' }).click();
  const kept = await page.getByRole('form', { name: 'Calcular frete' }).getByLabel('Rua', { exact: true }).inputValue();
  check('checkout-editar-etapa', kept === 'Rua TESTE', `ao alterar a entrega o endereço digitado continua: “${kept}”`);
  await context.close();
}
await browser.close();
mkdirSync(join(here, 'evidencias', 'depois'), { recursive: true });
writeFileSync(join(here, 'evidencias', 'depois', 'teclado.json'), JSON.stringify({ base, date: new Date().toISOString(), results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
