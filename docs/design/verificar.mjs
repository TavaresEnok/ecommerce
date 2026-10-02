#!/usr/bin/env node
// Verificador dos materiais de design. Sem dependências: node docs/design/verificar.mjs
// Saída 0 = tudo coerente; 1 = falha encontrada. Não substitui revisão visual nem auditoria de acessibilidade.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);
const read = (p) => readFileSync(p, 'utf8');

// ---------- Contraste (WCAG 2.x, luminância relativa) ----------
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = (h) => { const c = rgb(h).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const darken = (c, ok) => { for (let i = 0; i <= 20; i++) { const m = mix(c, '#000000', i * 0.05); if (ok(m)) return m; } return '#000000'; };
export function brandTokens(accent, bg = '#FFFFFF', ink = '#1D1F1E') {
  const white = '#FFFFFF';
  let fill = accent;
  if (Math.max(ratio(fill, white), ratio(fill, ink)) < 4.5) fill = darken(accent, (c) => ratio(c, white) >= 4.5);
  const onFill = ratio(fill, white) >= 4.5 ? white : ink;
  const border = ratio(fill, bg) >= 3 ? fill : ink;
  const text = ratio(accent, bg) >= 4.5 ? accent : darken(accent, (c) => ratio(c, bg) >= 4.5);
  const tint = mix(text, white, 0.9);
  return { fill, onFill, border, text, tint };
}

// ---------- tokens.json ----------
let tokens;
try { tokens = JSON.parse(read(join(here, 'tokens.json'))); } catch (e) { fail(`tokens.json inválido: ${e.message}`); }
const TYPES = new Set(tokens?.$format?.types || []);
const leaves = new Map(); // caminho -> token
function walk(node, path) {
  if (node && typeof node === 'object' && 'value' in node && 'type' in node) { leaves.set(path.join('.'), node); return; }
  for (const [k, v] of Object.entries(node || {})) if (v && typeof v === 'object') walk(v, [...path, k]);
}
if (tokens) {
  walk(tokens.platform, ['platform']);
  walk(tokens.store, ['store']);
  for (const [p, t] of leaves) {
    if (!TYPES.has(t.type)) fail(`Token ${p}: tipo desconhecido ${t.type}`);
    if (typeof t.value !== 'string' || !t.value) fail(`Token ${p}: valor ausente`);
    if (!t.description) fail(`Token ${p}: sem descrição`);
    if (t.type === 'color' && !/^#[0-9A-F]{6}$/.test(t.value) && !t.value.startsWith('rgba(')) fail(`Token ${p}: cor fora do formato #RRGGBB maiúsculo`);
  }
  const color = (p) => { const t = leaves.get(p); if (!t) { fail(`contrastChecks referencia token inexistente ${p}`); return null; } return t.value; };
  for (const c of tokens.contrastChecks || []) {
    const fg = color(c.fg), bg = color(c.bg); if (!fg || !bg) continue;
    const r = ratio(fg, bg);
    if (r < c.min) fail(`Contraste ${c.fg} sobre ${c.bg} = ${r.toFixed(2)} < ${c.min} (${c.use})`);
  }
  notes.push(`${(tokens.contrastChecks || []).length} combinações de contraste conferidas`);
  // Exemplos e padrões derivados da marca
  const bg = leaves.get('store.color.bg').value, ink = leaves.get('store.color.text').value;
  for (const ex of tokens.brandAlgorithm.examples) {
    const got = brandTokens(ex.accent, bg, ink);
    for (const k of Object.keys(got)) if (got[k] !== ex[k]) fail(`Exemplo de marca ${ex.label}: ${k} registrado ${ex[k]} ≠ calculado ${got[k]}`);
    if (ratio(got.fill, got.onFill) < 4.5) fail(`Marca ${ex.accent}: texto do botão < 4.5`);
    if (ratio(got.text, bg) < 4.5) fail(`Marca ${ex.accent}: accent-text < 4.5`);
    if (ratio(ink, got.tint) < 4.5) fail(`Marca ${ex.accent}: tinta sobre tint < 4.5`);
    if (ratio(got.text, got.tint) < 3) fail(`Marca ${ex.accent}: marcador sobre tint < 3`);
  }
  const def = brandTokens(leaves.get('store.color.accent').value, bg, ink);
  const map = { 'accent-fill': 'fill', 'on-accent': 'onFill', 'accent-border': 'border', 'accent-text': 'text', 'accent-tint': 'tint' };
  for (const [k, v] of Object.entries(map)) if (leaves.get(`store.color.${k}`).value !== def[v]) fail(`store.color.${k} padrão não corresponde ao algoritmo (${def[v]})`);
}
const cssName = (p) => { const [scope, ...rest] = p.split('.'); return scope === 'store' ? `--store-${rest.join('-')}` : `--${rest.join('-')}`; };

// ---------- CSS consumidores (aplicativo e protótipo) ----------
const cssPath = join(here, 'preview/styles.css');
const htmlPath = join(here, 'preview/index.html');
const css = read(cssPath), html = read(htmlPath);
const norm = (v) => v.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().toLowerCase();
for (const rel of ['apps/web/app/style.css', 'docs/design/preview/styles.css']) {
  const text = read(join(root, rel));
  const rootBlock = (text.match(/:root\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  const defined = new Map();
  for (const m of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) defined.set(m[1], m[2].trim());
  const expected = new Set();
  for (const [p, t] of leaves) {
    if (t.css === false) continue;
    const name = cssName(p); expected.add(name);
    if (!defined.has(name)) fail(`${rel} não define ${name} (token ${p})`);
    else if (norm(defined.get(name)) !== norm(t.value)) fail(`${rel} ${name} = ${defined.get(name)} ≠ token ${t.value}`);
  }
  for (const name of defined.keys()) if (!expected.has(name)) fail(`${rel} :root define ${name} sem token correspondente`);
  const declared = new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const extra = rel.endsWith('styles.css') ? new Set([...html.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])) : new Set();
  for (const m of text.matchAll(/var\((--[\w-]+)/g)) if (!declared.has(m[1]) && !extra.has(m[1])) fail(`${rel}: var(${m[1]}) usada sem declaração`);
  const hexOutside = [...text.replace(rootBlock, '').matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  if (hexOutside.length) fail(`${rel} usa cores literais fora de :root: ${[...new Set(hexOutside)].join(', ')}`);
  notes.push(`${rel}: ${expected.size} variáveis correspondem aos tokens`);
}
for (const m of html.matchAll(/var\((--[\w-]+)/g)) if (!new Set([...css.matchAll(/(--[\w-]+)\s*:/g), ...html.matchAll(/(--[\w-]+)\s*:/g)].map((x) => x[1])).has(m[1])) fail(`index.html: var(${m[1]}) usada sem declaração`);

// ---------- index.html ----------
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dup.length) fail(`IDs duplicados no protótipo: ${[...new Set(dup)].join(', ')}`);
for (const m of html.matchAll(/\shref="#([^"]+)"/g)) if (!ids.includes(m[1])) fail(`href="#${m[1]}" sem alvo`);
for (const m of html.matchAll(/\s(for|aria-controls|aria-describedby|aria-labelledby|form|list)="([^"]+)"/g)) {
  for (const r of m[2].split(/\s+/)) if (!ids.includes(r)) fail(`${m[1]}="${r}" referencia id inexistente`);
}
for (const m of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
  const u = m[1];
  if (/^(https?:)?\/\//.test(u)) fail(`Recurso remoto no protótipo: ${u}`);
  else if (!u.startsWith('mailto:') && !existsSync(join(here, 'preview', u.split('#')[0]))) fail(`Arquivo local ausente: ${u}`);
}
for (const m of css.matchAll(/url\("?([^")]+)"?\)/g)) if (!existsSync(join(here, 'preview', m[1]))) fail(`styles.css referencia arquivo ausente ${m[1]}`);
// Dinheiro: texto deve corresponder a data-cents; somas e linhas coerentes
const money = (c) => { const v = BigInt(c); return `R$ ${(v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(v % 100n).toString().padStart(2, '0')}`; };
const tags = [...html.matchAll(/<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>([^<]*)/g)].map((m) => ({ attrs: Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])), text: m[3].replace(/\s+/g, ' ').trim() }));
const parts = {};
let moneyCount = 0;
for (const t of tags) {
  const a = t.attrs;
  if (a['data-cents'] !== undefined) {
    moneyCount++;
    if (!t.text.includes(money(a['data-cents']))) fail(`Valor exibido "${t.text}" ≠ ${money(a['data-cents'])}`);
    if (a['data-qty'] && a['data-unit'] && BigInt(a['data-qty']) * BigInt(a['data-unit']) !== BigInt(a['data-cents'])) fail(`Linha ${a['data-qty']} × ${a['data-unit']} ≠ ${a['data-cents']}`);
    for (const k of (a['data-part'] || '').split(/\s+/).filter(Boolean)) {
      const [key, sign] = k.split(':');
      parts[key] = (parts[key] || 0n) + (sign === '-' ? -1n : 1n) * BigInt(a['data-cents']);
    }
  }
}
for (const t of tags) {
  const k = t.attrs['data-sum'];
  if (k) { if (parts[k] === undefined) fail(`data-sum="${k}" sem parcelas`); else if (parts[k] !== BigInt(t.attrs['data-cents'])) fail(`Soma ${k}: parcelas ${parts[k]} ≠ total ${t.attrs['data-cents']}`); }
}
for (const t of tags) {
  const k = t.attrs['data-ratio'];
  if (!k) continue;
  const [f, b] = k.split('|'); const fg = leaves.get(f)?.value, bg = leaves.get(b)?.value;
  if (!fg || !bg) { fail(`data-ratio com token inexistente: ${k}`); continue; }
  const shown = `${ratio(fg, bg).toFixed(2).replace('.', ',')}:1`;
  if (!t.text.includes(shown)) fail(`Contraste exibido "${t.text}" para ${k} deveria ser ${shown}`);
}
notes.push(`${moneyCount} valores monetários do protótipo conferidos`);

// ---------- Documentos: links relativos e matriz de rotas ----------
const docs = [join(root, 'DESIGN.md'), join(root, 'CLAUDE.md'), ...readdirSync(here).filter((f) => f.endsWith('.md')).map((f) => join(here, f))];
for (const d of docs) {
  if (!existsSync(d)) { fail(`Documento ausente: ${d.replace(root + '/', '')}`); continue; }
  const text = read(d);
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^[a-z]+:/.test(target)) continue;
    if (!existsSync(resolve(dirname(d), target))) fail(`${d.replace(root + '/', '')}: link quebrado ${m[1]}`);
  }
}
const telas = existsSync(join(here, 'TELAS-E-FLUXOS.md')) ? read(join(here, 'TELAS-E-FLUXOS.md')) : '';
const aceite = existsSync(join(here, 'ACEITE.md')) ? read(join(here, 'ACEITE.md')) : '';
const impl = existsSync(join(here, 'IMPLEMENTACAO.md')) ? read(join(here, 'IMPLEMENTACAO.md')) : '';
const inventory = [...telas.matchAll(/^\| (R\d+) \| `([^`]+)` \| ([^|]+) \| `([^`]+)` \|/gm)];
if (!inventory.length) fail('TELAS-E-FLUXOS.md sem inventário de rotas no formato | Rnn | `rota` | estado | `arquivo` |');
for (const [, code, route, , file] of inventory) {
  if (!existsSync(join(root, file))) fail(`${code} ${route}: arquivo ${file} não existe`);
  if (!aceite.includes(`${code} `) && !aceite.includes(`${code}|`) && !aceite.includes(`| ${code}`)) fail(`ACEITE.md não cobre ${code} (${route})`);
  if (!new RegExp(`\\b${code}\\b`).test(impl)) fail(`IMPLEMENTACAO.md não atribui lote a ${code} (${route})`);
}
notes.push(`${inventory.length} rotas do inventário conferidas contra arquivos, ACEITE e IMPLEMENTACAO`);

for (const n of notes) console.log(`ok  ${n}`);
if (failures.length) { for (const f of failures) console.error(`ERRO ${f}`); console.error(`\n${failures.length} problema(s).`); process.exit(1); }
console.log('\nMateriais de design coerentes.');
