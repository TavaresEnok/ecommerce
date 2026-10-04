import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromV1, normalize, referencedAssets, validateV2 } from '../apps/api/src/theme.ts';
// Esquema do tema v2 (DESIGN.md §11): validação no servidor, conversão determinística do v1 e leitura tolerante.
// Sem banco nem rede: roda no host ou no contêiner de testes (Node com remoção de tipos).
const A1 = '0190a3c4-0000-7000-8000-000000000001', A2 = '0190a3c4-0000-7000-8000-000000000002', P1 = '0190a3c4-0000-7000-8000-0000000000aa';
const base = () => ({
  schema_version: 2, preset: 'atelie', title: 'Barro TESTE', description: 'Cerâmica de teste',
  brand: { color: '#2f5d50', font: 'fraunces', button: 'pill', logo: A1 },
  layout: { width: 'regular', density: 'comfortable', ratio: 'square', fit: 'cover' },
  sections: [
    { id: 'abertura', type: 'hero', hidden: false, heading: 'Feito à mão', text: 'Linha 1\nLinha 2', image: A2, focal: { x: 30, y: 70 }, layout: 'split', cta: { label: 'Ver tudo', to: { kind: 'catalog' } } },
    { id: 'destaques', type: 'products', hidden: false, heading: 'Escolhidos', source: 'manual', category: null, products: [P1], limit: 4 },
    { id: 'categorias', type: 'categories', hidden: true, heading: '', categories: ['ceramica'] },
    { id: 'historia', type: 'image_text', hidden: false, heading: 'Quem faz', text: 'Texto', image: A2, focal: { x: 50, y: 50 }, side: 'end' },
    { id: 'aviso', type: 'text', hidden: false, heading: '', text: 'Entregas às sextas.' },
  ],
  menu: [{ label: 'Cerâmica', to: { kind: 'category', ref: 'ceramica' } }, { label: 'Sobre', to: { kind: 'page', ref: 'sobre' } }, { label: 'Instagram', to: { kind: 'external', url: 'https://example.test/loja' } }],
  footer: { links: [{ label: 'Trocas', to: { kind: 'page', ref: 'sobre' } }], note: 'Atendimento das 9h às 18h.' },
  pages: [{ slug: 'sobre', title: 'Sobre', body: 'Ateliê de teste.' }], assets: [],
});
const rejects = (mutate, pattern) => { const t = base(); mutate(t); assert.throws(() => validateV2(t), (e) => e.getStatus?.() === 400 && pattern.test(e.message)); };

test('v2 válido: normaliza cor, deriva imagens usadas e preserva ordem, ocultas e destinos', () => {
  const t = validateV2(base());
  assert.equal(t.brand.color, '#2F5D50');
  assert.deepEqual(t.assets, [A1, A2]);
  assert.deepEqual(referencedAssets(t), [A1, A2]);
  assert.deepEqual(t.sections.map((s) => s.id), ['abertura', 'destaques', 'categorias', 'historia', 'aviso']);
  assert.equal(t.sections[2].hidden, true);
  assert.equal(t.sections[0].text, 'Linha 1\nLinha 2');
  assert.equal(t.menu[2].to.url, 'https://example.test/loja');
  // Campos desconhecidos (ex.: CSS ou HTML injetado) são descartados, não repassados.
  const extra = base(); extra.css = 'body{display:none}'; extra.sections[0].html = '<b>x</b>';
  const clean = validateV2(extra); assert.equal('css' in clean, false); assert.equal('html' in clean.sections[0], false);
});

test('v2 inválido é recusado com mensagem em português (400)', () => {
  rejects((t) => { t.preset = 'brutalista'; }, /Modelo inválido/);
  rejects((t) => { t.brand.color = 'red'; }, /Cor da marca/);
  rejects((t) => { t.brand.font = 'comic'; }, /Fonte/);
  rejects((t) => { t.title = '<script>alert(1)</script>'; }, /texto simples/);
  rejects((t) => { t.menu[2].to.url = 'http://example.test'; }, /https:\/\//);
  rejects((t) => { t.menu[2].to.url = 'https://user:pw@example.test'; }, /usuário ou senha/);
  rejects((t) => { t.menu[2].to = { kind: 'external', url: 'javascript:alert(1)' }; }, /https:\/\//);
  rejects((t) => { t.menu.push({ label: 'Perdida', to: { kind: 'page', ref: 'nao-existe' } }); }, /não existe/);
  rejects((t) => { t.sections = Array.from({ length: 13 }, (_, i) => ({ id: `t${i}`, type: 'text', text: 'x' })); }, /No máximo 12 seções/);
  rejects((t) => { t.sections.push({ ...t.sections[4] }); }, /repetido/);
  rejects((t) => { t.sections[1].products = []; }, /ao menos um produto/);
  rejects((t) => { t.sections[1].limit = 7; }, /Quantidade/);
  rejects((t) => { t.sections[0].focal = { x: 120, y: 0 }; }, /0 a 100/);
  rejects((t) => { t.sections[0].image = '../../etc/passwd'; }, /imagem inválida/);
  rejects((t) => { t.sections[0].type = 'iframe'; }, /Tipo de seção/);
  rejects((t) => { t.pages.push({ ...t.pages[0] }); }, /mesmo endereço/);
  rejects((t) => { t.schema_version = 3; }, /Versão do tema/);
});

test('v1 vira v2 de forma determinística, sem perder conteúdo', () => {
  const v1 = { schema_version: 1, title: 'Aurora TESTE', description: 'Vitrine antiga', hero: 'Pequenos favoritos', color: '#245742', font: 'serif',
    pages: [{ slug: 'sobre', title: 'Sobre a loja', body: 'Texto' }], menu: [{ label: 'Início', path: '/' }, { label: 'Sobre', path: '/paginas/sobre' }, { label: 'Carrinho', path: '/carrinho' }, { label: 'Fora', path: 'https://x.test' }], assets: [A1] };
  const a = fromV1(v1), b = fromV1(structuredClone(v1));
  assert.deepEqual(a, b);
  assert.equal(a.schema_version, 2); assert.equal(a.preset, 'essencial'); assert.equal(a.title, 'Aurora TESTE'); assert.equal(a.brand.font, 'serif');
  assert.equal(a.sections[0].type, 'hero'); assert.equal(a.sections[0].heading, 'Pequenos favoritos'); assert.equal(a.sections[0].image, A1);
  assert.deepEqual(a.menu.map((m) => m.to.kind), ['home', 'page', 'cart']);
  assert.deepEqual(a.footer.links.map((l) => l.to.ref), ['sobre']);
  assert.deepEqual(a.assets, [A1]);
  // O resultado é um v2 válido (o servidor aceita salvar o que ele mesmo converteu).
  assert.deepEqual(validateV2(a), a);
});

test('leitura tolerante: conteúdo inválido cai num tema seguro e mantém o fornecedor congelado', () => {
  const supplier = { name: 'Fornecedor TESTE' };
  const broken = normalize({ schema_version: 2, preset: 'xyz', title: 'Quebrado', brand: { color: '#123456' }, supplier });
  assert.equal(broken.schema_version, 2); assert.equal(broken.title, 'Quebrado'); assert.equal(broken.brand.color, '#123456'); assert.deepEqual(broken.supplier, supplier);
  assert.ok(broken.sections.some((s) => s.type === 'products'));
  const empty = normalize(null); assert.equal(empty.title, 'Loja'); assert.equal(empty.brand.color, '#245742');
  const valid = normalize({ ...base(), supplier }); assert.equal(valid.preset, 'atelie'); assert.deepEqual(valid.supplier, supplier);
});
