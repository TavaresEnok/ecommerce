// node --test docs/design/tokens-css.test.mjs — fim de linha LF/CRLF no --check sem mascarar diferença real de token.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sync, block, consumers } from './tokens-css.mjs';

const lf = readFileSync(new URL(`../../${consumers[0]}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const crlf = lf.replace(/\n/g, '\r\n');
test('arquivo atual em LF está em dia', () => assert.equal(sync(lf).status, 'em-dia'));
test('o mesmo arquivo em CRLF também está em dia', () => assert.equal(sync(crlf).status, 'em-dia'));
for (const [name, css] of [['LF', lf], ['CRLF', crlf]]) {
  test(`${name}: valor de token alterado é detectado e a regravação preserva o fim de linha`, () => {
    const changed = css.replace('--color-action: ', '--color-action: #000000; --x: ');
    const r = sync(changed);
    assert.equal(r.status, 'desatualizado');
    assert.equal(sync(r.next).status, 'em-dia');
    assert.equal(r.next.includes('\r\n'), name === 'CRLF');
    if (name === 'CRLF') assert.equal(/[^\r]\n/.test(r.next), false, 'nenhum LF solto depois de regravar em CRLF');
    assert.equal(r.next, css, 'regravar devolve exatamente o conteúdo original');
  });
  test(`${name}: espaço a mais dentro do bloco não é tolerado`, () => assert.equal(sync(css.replace(':root {', ':root  {')).status, 'desatualizado'));
}
test('bloco gerado não contém CR', () => assert.equal(block.includes('\r'), false));
test('arquivo sem marcadores é apontado', () => assert.equal(sync('body{}').status, 'sem-marcadores'));
