#!/usr/bin/env node
// Gera o bloco :root a partir de docs/design/tokens.json e o grava entre os marcadores
// /* tokens:inicio */ e /* tokens:fim */ de cada CSS consumidor. Uso: node docs/design/tokens-css.mjs [--check]
// --check não grava: sai com 1 se algum arquivo estiver desatualizado.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
export const consumers = ['apps/web/app/style.css', 'docs/design/preview/styles.css'];
const tokens = JSON.parse(readFileSync(join(here, 'tokens.json'), 'utf8'));
const lines = [];
function walk(node, path) {
  if (node && typeof node === 'object' && 'value' in node && 'type' in node) {
    if (node.css === false) return;
    const [scope, ...rest] = path;
    lines.push(`  ${scope === 'store' ? `--store-${rest.join('-')}` : `--${rest.join('-')}`}: ${node.value};`);
    return;
  }
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walk(v, [...path, k]);
}
walk(tokens.platform, ['platform']);
walk(tokens.store, ['store']);
export const block = `/* tokens:inicio — gerado de docs/design/tokens.json por docs/design/tokens-css.mjs; não editar à mão */\n:root {\n${lines.join('\n')}\n}\n/* tokens:fim */`;
const marked = /\/\* tokens:inicio[\s\S]*?\/\* tokens:fim \*\//;
// Compara o bloco gerado com o do arquivo tolerando só a convenção de fim de linha (LF ou CRLF, conforme o checkout com
// `* text=auto`); qualquer outra diferença (valor, nome, espaço, linha a mais) continua sendo “desatualizado”.
// Ao gravar, o bloco usa o mesmo fim de linha do arquivo.
export function sync(css, generated = block) {
  const found = css.match(marked);
  if (!found) return { status: 'sem-marcadores', next: css };
  if (found[0].replace(/\r\n/g, '\n') === generated) return { status: 'em-dia', next: css };
  const eol = css.includes('\r\n') ? '\r\n' : '\n';
  return { status: 'desatualizado', next: css.replace(marked, () => generated.replace(/\n/g, eol)) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const rel of consumers) {
    const file = join(root, rel), { status, next } = sync(readFileSync(file, 'utf8'));
    if (status === 'sem-marcadores') { console.error(`${rel}: marcadores tokens:inicio/fim ausentes`); stale++; continue; }
    if (status === 'desatualizado') { stale++; if (!check) writeFileSync(file, next); console.log(`${rel}: ${check ? 'desatualizado' : 'atualizado'}`); }
    else console.log(`${rel}: em dia`);
  }
  if (check && stale) process.exit(1);
}
