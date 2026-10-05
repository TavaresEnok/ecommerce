#!/usr/bin/env node
// Lojas de demonstração dos três presets + casos difíceis, criadas pela API como um lojista faria (ambiente local).
// Uso: node scripts/fixtures/seed-presets.mjs [--base=http://localhost:3000]
// Grava contas e endereços em .local/demo-presets.json (fora do Git). Dados e contatos são fictícios (lojas TESTE);
// fotos CC0 com origem em scripts/fixtures/fotos.json. Nunca usar com dados ou lojas reais.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { client } from '../seed.mjs';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../..');
const base = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7) || 'http://localhost:3000';
const origin = (process.argv.find((a) => a.startsWith('--origin=')) || '').slice(9) || base;
const sharp = createRequire(join(root, 'packages/media/package.json'))('sharp');
const rawApi = client(base, origin), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Respeita o limite por cliente do ambiente local em vez de desligá-lo.
async function api(path, opts) { for (let i = 0; ; i++) { const r = await rawApi(path, opts); if (r.status !== 429 || i > 40) return r; await sleep(3000); } }
const ok = (r, s = 201) => { if (r.status !== s) throw new Error(`${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const suffix = randomBytes(3).toString('hex');
const photo = (name) => readFileSync(join(here, 'fotos', name));
const t = (s) => `${s} TESTE`;

const STORES = [
  { key: 'atelie', themeImages: ['atelie-copos.jpg', 'atelie-lotes-queimados.jpg'], name: t('Barro & Trama'), slug: `barro-e-trama-${suffix}`, preset: 'atelie', color: '#2F5D50',
    description: 'Cerâmica, cestaria e peças de mesa feitas em pequenos lotes.', categories: ['Cerâmica', 'Cestaria', 'Mesa e cozinha', 'Decoração'],
    products: [
      { name: 'Copos de cerâmica torneada', cat: 'Mesa e cozinha', price: '4800', photos: ['atelie-copos.jpg'], desc: 'Copos torneados à mão em argila vermelha, com acabamento fosco por fora e esmalte transparente por dentro. Capacidade aproximada de 250 ml. Cada peça tem pequenas variações de cor e altura.', variants: [['Unidade', '4800', 12], ['Jogo com 4', '17900', 5]], opt: 'Quantidade' },
      { name: 'Bule de porcelana verde', cat: 'Mesa e cozinha', price: '18900', photos: ['atelie-bule-verde.jpg'], desc: 'Bule de porcelana esmaltada em verde-claro, para até 900 ml. Tampa com encaixe firme e bico que não pinga.', stock: 3 },
      { name: 'Trio de tigelas de madeira', cat: 'Mesa e cozinha', price: '12900', photos: ['atelie-tigelas.jpg'], desc: 'Três tigelas unidas, entalhadas em uma só peça de madeira de reflorestamento. Ideal para petiscos e castanhas. Limpar com pano úmido.', stock: 6 },
      { name: 'Cesto trançado em palha tingida', cat: 'Cestaria', price: '9600', photos: ['atelie-cesto.jpg'], desc: 'Cesto com tampa cônica, trançado à mão em palha natural e fios tingidos de azul e vermelho.', variants: [['P (18 cm)', '9600', 4], ['M (24 cm)', '12800', 2]], opt: 'Tamanho' },
      { name: 'Vaso de barro pintado à mão', cat: 'Decoração', price: '14000', photos: ['atelie-vaso-barro.jpg'], desc: 'Vaso de barro com faixas pintadas em tons de terra. Uso decorativo; não indicado para água.', stock: 2 },
      { name: 'Vaso branco com flores secas', cat: 'Decoração', price: '7900', photos: ['atelie-vaso-branco.jpg'], desc: 'Vaso de cerâmica branca com faixa terracota, acompanhado de arranjo de flores secas.', stock: 8 },
      { name: 'Par de porta-velas de vidro', cat: 'Decoração', price: '5800', photos: ['atelie-porta-velas.jpg'], desc: 'Dois porta-velas de vidro canelado esfumado, para velas de réchaud.', stock: 10 },
      { name: 'Cachepô estampado', cat: 'Decoração', price: '7200', photos: ['atelie-cachepo.jpg'], desc: 'Cachepô de cimento com relevo em espiral e prato coletor. Para vasos de até 14 cm.', stock: 7 },
      { name: 'Colher medidora de cobre', cat: 'Mesa e cozinha', price: '3900', photos: ['atelie-colher.jpg'], desc: 'Colher de cobre com cabo gravado, medida de 15 ml. Lavar à mão.', stock: 15 },
      { name: 'Bule de porcelana floral', cat: 'Mesa e cozinha', price: '16500', photos: ['atelie-bule-floral.jpg'], desc: 'Bule de porcelana branca com pintura floral. Edição esgotada; a loja avisa no atendimento quando houver reposição.', stock: 0 },
      { name: 'Jarro de barro queimado', cat: 'Cerâmica', price: '21000', photos: ['atelie-jarro.jpg'], desc: 'Jarro baixo de barro com pintura queimada, peça única.', stock: 1 },
      { name: 'Pano de prato de linho', cat: 'Mesa e cozinha', price: '4500', photos: [], desc: 'Pano de prato 100% linho, 50 × 70 cm. Foto em produção.', stock: 20 },
    ],
    theme: (img, ids) => ({ preset: 'atelie', sections: [
      { id: 'abertura', type: 'hero', hidden: false, heading: 'Peças de uso diário, feitas devagar', text: 'Cerâmica torneada, cestaria e madeira de pequenos produtores. Cada lote é pequeno e cada peça é um pouco diferente.', image: img['atelie-copos.jpg'], focal: { x: 50, y: 55 }, layout: 'split', cta: { label: 'Conhecer as peças', to: { kind: 'catalog' } } },
      { id: 'selecao', type: 'products', hidden: false, heading: 'Peças da semana', source: 'manual', category: null, products: [ids['Bule de porcelana verde'], ids['Copos de cerâmica torneada'], ids['Cesto trançado em palha tingida'], ids['Trio de tigelas de madeira']], limit: 4 },
      { id: 'processo', type: 'image_text', hidden: false, heading: 'Como fazemos', text: 'Trabalhamos com ateliês parceiros do interior. As peças são queimadas em lotes de até vinte unidades e passam por conferência antes do envio.', image: img['atelie-lotes-queimados.jpg'], focal: { x: 50, y: 50 }, side: 'end' },
      { id: 'mais', type: 'products', hidden: false, heading: 'Decoração', source: 'category', category: 'decoracao', products: [], limit: 8 },
    ], pages: [{ slug: 'sobre', title: 'Sobre o ateliê', body: 'Somos uma loja de demonstração. Os textos e contatos são fictícios.' }, { slug: 'trocas', title: 'Trocas e cuidados', body: 'Peças artesanais podem ter pequenas variações. Trocas em até 7 dias do recebimento.' }],
      menu: [{ label: 'Cerâmica', to: { kind: 'category', ref: 'ceramica' } }, { label: 'Mesa e cozinha', to: { kind: 'category', ref: 'mesa-e-cozinha' } }, { label: 'Sobre', to: { kind: 'page', ref: 'sobre' } }] }) },
  { key: 'essencial', name: t('Essencial Casa Digital'), slug: `essencial-casa-${suffix}`, preset: 'essencial', color: '#1D4ED8',
    description: 'Teclados, áudio e utilidades para mesa de trabalho e casa.', categories: ['Áudio', 'Teclados e mouses', 'Casa e escritório', 'Garrafas e mochilas'],
    products: [
      { name: 'Teclado mecânico compacto 75%', cat: 'Teclados e mouses', price: '38900', photos: ['essencial-teclado-mecanico.jpg'], desc: 'Teclado mecânico com 84 teclas, cabo USB-C removível e iluminação nas laterais. Layout ANSI.', variants: [['Switch marrom (tátil)', '38900', 6], ['Switch vermelho (linear)', '38900', 4]], opt: 'Switch' },
      { name: 'Teclado sem fio branco', cat: 'Teclados e mouses', price: '21900', photos: ['essencial-teclado-branco.jpg'], desc: 'Teclado fino sem fio, padrão ABNT2, com pilhas inclusas.', stock: 14 },
      { name: 'Teclado retroiluminado', cat: 'Teclados e mouses', price: '25900', photos: ['essencial-teclado-azul.jpg'], desc: 'Teclado de membrana com luz de fundo azul em três intensidades.', stock: 9 },
      { name: 'Mouse ergonômico sem fio', cat: 'Teclados e mouses', price: '17900', photos: ['essencial-mouse.jpg'], desc: 'Mouse com apoio para o polegar, roda de rolagem rápida e bateria recarregável.', stock: 11 },
      { name: 'Fone de ouvido com fio', cat: 'Áudio', price: '14900', photos: ['essencial-fone-mesa.jpg'], desc: 'Fone supra-auricular com cabo de 1,5 m e controle de volume no fio.', stock: 18 },
      { name: 'Fone fechado preto', cat: 'Áudio', price: '28900', photos: ['essencial-fone-preto.jpg'], desc: 'Fone fechado com almofadas macias e isolamento passivo de ruído.', stock: 5 },
      { name: 'Fone retrô vermelho', cat: 'Áudio', price: '19900', photos: ['essencial-fone-vermelho.jpg'], desc: 'Fone leve com acabamento em vermelho e cabo reforçado.', stock: 0 },
      { name: 'Caixa de som portátil à prova de respingos', cat: 'Áudio', price: '23900', photos: ['essencial-caixa-azul.jpg', 'essencial-caixa-azul-2.jpg'], desc: 'Caixa de som Bluetooth com bateria para até 12 horas e alça de tecido. Resistente a respingos.', variants: [['Azul', '23900', 7], ['Preta', '23900', 0]], opt: 'Cor' },
      { name: 'Par de caixas de som de estante', cat: 'Áudio', price: '49900', photos: ['essencial-caixa-estante.jpg'], desc: 'Par de caixas ativas para mesa, com entrada óptica e controle de graves.', stock: 3 },
      { name: 'Garrafa térmica inox 500 ml', cat: 'Garrafas e mochilas', price: '11900', photos: ['essencial-garrafa-termica.jpg'], desc: 'Mantém bebidas quentes por 12 horas e frias por 24 horas.', stock: 25 },
      { name: 'Garrafa de alumínio 750 ml', cat: 'Garrafas e mochilas', price: '8900', photos: ['essencial-garrafa.jpg'], desc: 'Garrafa leve com tampa de rosca e acabamento listrado.', stock: 30 },
      { name: 'Mochila para notebook 15″', cat: 'Garrafas e mochilas', price: '27900', photos: ['essencial-mochila.jpg'], desc: 'Mochila com compartimento acolchoado para notebook de até 15 polegadas e bolso lateral para garrafa.', stock: 8 },
      { name: 'Relógio de parede clássico', cat: 'Casa e escritório', price: '12900', photos: ['essencial-relogio-classico.jpg'], desc: 'Relógio de parede com algarismos romanos e mecanismo silencioso. 30 cm de diâmetro.', stock: 6 },
      { name: 'Relógio de parede minimalista', cat: 'Casa e escritório', price: '14900', photos: ['essencial-relogio-minimal.jpg'], desc: 'Relógio cinza-escuro com ponteiros cobre e mecanismo silencioso.', stock: 4 },
      { name: 'Luminária industrial com grade', cat: 'Casa e escritório', price: '16900', photos: ['essencial-luminaria.jpg'], desc: 'Luminária de parede com proteção em grade metálica. Lâmpada não inclusa (E27).', stock: 9 },
      { name: 'Caderno espiral A5 pontilhado', cat: 'Casa e escritório', price: '3490', photos: ['essencial-caderno.jpg'], desc: 'Caderno A5 com 120 folhas pontilhadas e capa dura.', stock: 40 },
      { name: 'Suporte de notebook dobrável', cat: 'Casa e escritório', price: '9900', photos: [], desc: 'Suporte de alumínio com seis alturas. Foto em produção.', stock: 12 },
    ],
    theme: () => ({ preset: 'essencial', sections: [
      { id: 'categorias', type: 'categories', hidden: false, heading: 'Categorias', categories: [] },
      { id: 'produtos', type: 'products', hidden: false, heading: 'Todos os produtos', source: 'all', category: null, products: [], limit: 24 },
    ], pages: [{ slug: 'garantia', title: 'Garantia', body: 'Loja de demonstração: garantia fictícia de 90 dias.' }],
      menu: [{ label: 'Áudio', to: { kind: 'category', ref: 'audio' } }, { label: 'Teclados e mouses', to: { kind: 'category', ref: 'teclados-e-mouses' } }, { label: 'Casa e escritório', to: { kind: 'category', ref: 'casa-e-escritorio' } }, { label: 'Garrafas e mochilas', to: { kind: 'category', ref: 'garrafas-e-mochilas' } }] }) },
  { key: 'editorial', themeImages: ['editorial-pasta-couro.jpg', 'editorial-botas-2.jpg'], name: t('Atelier Norte'), slug: `atelier-norte-${suffix}`, preset: 'editorial', color: '#1F2A44',
    description: 'Bolsas, óculos e acessórios em couro e metal, com produção em pequena escala.', categories: ['Bolsas', 'Óculos', 'Acessórios', 'Calçados'],
    products: [
      { name: 'Bolsa estruturada rosa', cat: 'Bolsas', price: '42900', photos: ['editorial-bolsa-rosa.jpg'], desc: 'Bolsa de mão estruturada com textura de croco e fecho magnético. 24 × 15 cm.', stock: 4 },
      { name: 'Bolsa de couro preta', cat: 'Bolsas', price: '38900', photos: ['editorial-bolsa-preta.jpg'], desc: 'Bolsa de couro macio com alça regulável e bolso interno com zíper.', stock: 3 },
      { name: 'Colar coração dourado', cat: 'Acessórios', price: '15900', photos: ['editorial-colar-coracao.jpg'], desc: 'Colar com pingente de coração em metal dourado e corrente de 45 cm.', stock: 12 },
      { name: 'Óculos de sol aviador', cat: 'Óculos', price: '28900', photos: ['editorial-oculos-aviador.jpg'], desc: 'Armação metálica dourada com lentes escuras e proteção UV400.', stock: 7 },
      { name: 'Óculos de sol colorido', cat: 'Óculos', price: '19900', photos: ['editorial-oculos-laranja.jpg'], desc: 'Armação em acetato com hastes coloridas e lentes escuras UV400.', stock: 9 },
      { name: 'Carteira de couro dobrável', cat: 'Acessórios', price: '14900', photos: ['editorial-carteira.jpg'], desc: 'Carteira em couro legítimo com seis divisórias para cartões.', stock: 15 },
      { name: 'Relógio de pulso preto', cat: 'Acessórios', price: '64900', photos: ['editorial-relogio.jpg'], desc: 'Relógio analógico com pulseira de silicone e caixa de 42 mm.', stock: 2 },
      { name: 'Camisa de algodão cru', cat: 'Acessórios', price: '21900', photos: ['editorial-camisa.jpg'], desc: 'Camisa de algodão leve com gola padre.', variants: [['P', '21900', 3], ['M', '21900', 5], ['G', '21900', 0]], opt: 'Tamanho' },
      { name: 'Pulseiras de conchas e contas', cat: 'Acessórios', price: '8900', photos: ['editorial-pulseiras.jpg'], desc: 'Pulseiras elásticas com conchas naturais e contas de vidro. Vendidas por unidade.', stock: 20 },
      { name: 'Sapato de couro marrom', cat: 'Calçados', price: '55900', photos: ['editorial-botas.jpg'], desc: 'Sapato derby em couro com solado de borracha.', variants: [['38', '55900', 2], ['39', '55900', 3], ['40', '55900', 1], ['41', '55900', 0]], opt: 'Número' },
      { name: 'Lenço de seda estampado com acabamento em bainha feita à mão e embalagem para presente', cat: 'Acessórios', price: '17900', photos: [], desc: 'Lenço quadrado de seda, 90 × 90 cm. Foto em produção.', stock: 6 },
    ],
    theme: (img, ids) => ({ preset: 'editorial', sections: [
      { id: 'abertura', type: 'hero', hidden: false, heading: 'Coleção de inverno', text: 'Couro, metal e acabamento à mão. Peças pensadas para durar mais de uma estação.', image: img['editorial-pasta-couro.jpg'], focal: { x: 8, y: 65 }, layout: 'overlay', cta: { label: 'Ver a coleção', to: { kind: 'catalog' } } },
      { id: 'novidades', type: 'products', hidden: false, heading: 'Novidades', source: 'manual', category: null, products: [ids['Bolsa estruturada rosa'], ids['Óculos de sol aviador'], ids['Colar coração dourado'], ids['Sapato de couro marrom']], limit: 4 },
      { id: 'historia', type: 'image_text', hidden: false, heading: 'Feito para durar', text: 'Trabalhamos com curtumes certificados e oficinas de até cinco pessoas. Cada par de sapatos passa por doze etapas de acabamento.', image: img['editorial-botas-2.jpg'], focal: { x: 50, y: 60 }, side: 'start' },
      { id: 'categorias', type: 'categories', hidden: false, heading: 'Explore', categories: [] },
      { id: 'acessorios', type: 'products', hidden: false, heading: 'Acessórios', source: 'category', category: 'acessorios', products: [], limit: 8 },
    ], pages: [{ slug: 'sobre', title: 'Sobre', body: 'Loja de demonstração. Textos e contatos fictícios.' }],
      menu: [{ label: 'Bolsas', to: { kind: 'category', ref: 'bolsas' } }, { label: 'Óculos', to: { kind: 'category', ref: 'oculos' } }, { label: 'Acessórios', to: { kind: 'category', ref: 'acessorios' } }, { label: 'Sobre', to: { kind: 'page', ref: 'sobre' } }] }) },
  // Casos difíceis: vazia, um produto, dois produtos com cor de baixo contraste e imagens irregulares.
  { key: 'vazia', name: t('Loja Vazia'), slug: `loja-vazia-${suffix}`, preset: 'essencial', color: '#7C3AED', description: 'Loja sem produtos ativos.', categories: [], products: [], theme: () => ({ preset: 'essencial', sections: [{ id: 'produtos', type: 'products', hidden: false, heading: 'Produtos', source: 'all', category: null, products: [], limit: 24 }], pages: [], menu: [] }) },
  { key: 'um', themeImages: ['atelie-bule-verde.jpg'], name: t('Loja de Um Produto'), slug: `um-produto-${suffix}`, preset: 'atelie', color: '#9A3B26', description: 'Loja com um único produto.', categories: ['Peças'], products: [{ name: 'Bule de porcelana verde', cat: 'Peças', price: '18900', photos: ['atelie-bule-verde.jpg'], desc: 'Bule de porcelana esmaltada.', stock: 4 }],
    theme: (img) => ({ preset: 'atelie', sections: [{ id: 'abertura', type: 'hero', hidden: false, heading: 'Uma peça, bem-feita', text: 'Loja com um único produto.', image: img['atelie-bule-verde.jpg'], focal: { x: 50, y: 50 }, layout: 'split', cta: null }, { id: 'produtos', type: 'products', hidden: false, heading: 'Produto', source: 'all', category: null, products: [], limit: 4 }], pages: [], menu: [] }) },
  { key: 'contraste', name: t('Loja Amarela'), slug: `loja-amarela-${suffix}`, preset: 'editorial', color: '#F2C94C', description: 'Cor de marca clara (baixo contraste) e imagens irregulares.', categories: ['Diversos'],
    products: [
      { name: 'Óculos (PNG com transparência)', cat: 'Diversos', price: '9900', photos: ['casos-oculos-png.png'], desc: 'Imagem PNG com fundo transparente, para testar o enquadramento.', stock: 5 },
      { name: 'Caderno (imagem pequena, 240 px)', cat: 'Diversos', price: '2990', photos: ['small:essencial-caderno.jpg'], desc: 'Imagem enviada em baixa resolução, para testar como a loja lida com fotos pequenas.', stock: 5 },
    ],
    theme: () => ({ preset: 'editorial', sections: [{ id: 'abertura', type: 'hero', hidden: false, heading: 'Cor clara, leitura garantida', text: 'Botões e links usam uma versão ajustada da cor amarela para manter o contraste.', image: null, focal: { x: 50, y: 50 }, layout: 'stacked', cta: { label: 'Ver produtos', to: { kind: 'catalog' } } }, { id: 'produtos', type: 'products', hidden: false, heading: 'Produtos', source: 'all', category: null, products: [], limit: 8 }], pages: [], menu: [] }) },
];

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function waitReady(actor, tenantId, assetIds) {
  for (let i = 0; i < 90; i++) {
    const media = ok(await api(`tenants/${tenantId}/catalogue`, { actor }), 200).media, done = assetIds.every((id) => media.find((m) => m.id === id)?.status === 'READY');
    if (done) return; if (assetIds.some((id) => media.find((m) => m.id === id)?.status === 'FAILED')) throw new Error('Processamento de imagem falhou.');
    await sleep(1500);
  }
  throw new Error('Processamento de imagem demorou demais.');
}
async function upload(actor, tenantId, file) {
  let body = file.startsWith('small:') ? await sharp(photo(file.slice(6))).resize(240, 240, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer() : photo(file);
  for (let i = 0; i < 30; i++) {
    const r = await api(`tenants/${tenantId}/catalogue/media`, { method: 'POST', actor, raw: body });
    if (r.status === 201) { await waitReady(actor, tenantId, [r.body.id]); return r.body.id; }
    if (r.status === 409 && /andamento|ocupado/i.test(JSON.stringify(r.body))) { await sleep(2000); continue; }
    throw new Error(`upload ${file}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  throw new Error(`upload ${file}: fila ocupada`);
}

const created = [];
for (const s of STORES) {
  const email = `demo-${s.key}-${suffix}@example.test`, password = randomBytes(18).toString('base64url');
  const reg = ok(await api('auth/register', { method: 'POST', body: { email, password } }));
  ok(await api('auth/verify-email', { method: 'POST', body: { token: reg.localToken } }));
  const login = await api('auth/login', { method: 'POST', body: { email, password } }); ok(login);
  const actor = { csrf: login.body.csrf, cookie: login.headers.get('set-cookie').split(';')[0] };
  const store = ok(await api('tenants', { method: 'POST', actor, body: { name: s.name, slug: s.slug } })), P = `tenants/${store.id}`;
  const cats = {}; for (const c of s.categories) cats[c] = ok(await api(`${P}/catalogue/categories`, { method: 'POST', actor, body: { name: c, slug: slugify(c) } })).id;
  const location = ok(await api(`${P}/catalogue/locations`, { method: 'POST', actor, body: { name: 'Depósito TESTE' } })).id;
  const ids = {}, img = {};
  for (const [n, prod] of s.products.entries()) {
    const first = prod.variants?.[0], sku = `${s.key.slice(0, 3).toUpperCase()}-${String(n + 1).padStart(3, '0')}`;
    const pr = ok(await api(`${P}/catalogue/products`, { method: 'POST', actor, body: { name: prod.name, slug: slugify(prod.name).slice(0, 80).replace(/-+$/, ''), description: prod.desc, sku, price_cents: first ? first[1] : prod.price, category_id: cats[prod.cat] } }));
    ids[prod.name] = pr.id;
    const variantIds = [];
    if (prod.variants) for (const [i, [label, price]] of prod.variants.entries()) variantIds.push(ok(await api(`${P}/catalogue/products/${pr.id}/variants`, { method: 'POST', actor, body: { sku: `${sku}-${i + 1}`, price_cents: price, attributes: { [prod.opt]: label }, weight_g: 400, width_mm: 200, height_mm: 120, length_mm: 250 } })).id);
    const stocks = prod.variants ? prod.variants.map((v, i) => [variantIds[i], v[2]]) : [[pr.variant_id, prod.stock ?? 5]];
    for (const [variant_id, qty] of stocks) if (qty > 0) ok(await api(`${P}/catalogue/adjustments`, { method: 'POST', actor, body: { variant_id, location_id: location, delta: qty, reason: 'Saldo inicial da loja de demonstração' } }));
    for (const f of prod.photos) { const id = await upload(actor, store.id, f); ok(await api(`${P}/catalogue/products/${pr.id}/media`, { method: 'POST', actor, body: { asset_id: id } })); }
    ok(await api(`${P}/catalogue/products/${pr.id}`, { method: 'PATCH', actor, body: { status: 'ACTIVE' } }), 200);
    process.stdout.write('.');
  }
  // Imagens usadas só no tema (destaques), enviadas sem vínculo a produto.
  for (const f of s.themeImages ?? []) img[f] = await upload(actor, store.id, f);
  ok(await api(`${P}/storefront/profile`, { method: 'POST', actor, body: { synthetic: true, name: `${s.name} (fornecedor fictício)`, document: '', address: 'Rua de Demonstração, 100, São Paulo, SP (endereço fictício)', email: `contato-${s.key}@example.test`, phone: '(11) 0000-0000 (fictício)', policies: 'Loja de demonstração. Trocas e arrependimento em até 7 dias do recebimento, conforme o Código de Defesa do Consumidor. Nenhuma venda real é feita.', delivery: 'Entrega fictícia para CEPs de 01000-000 a 09999-999 e retirada no endereço acima.', risks: 'Veja materiais e cuidados na descrição de cada produto.' } }));
  ok(await api(`${P}/storefront/shipping`, { method: 'POST', actor, body: { name: 'Retirada na loja', kind: 'PICKUP', price_cents: '0', days: 0, priority: 0 } }));
  ok(await api(`${P}/storefront/shipping`, { method: 'POST', actor, body: { name: 'Entrega Grande SP', kind: 'TABLE', cep_start: '01000000', cep_end: '09999999', price_cents: '1500', days: 3, priority: 10 } }));
  ok(await api(`${P}/purchase/accounts/simulated`, { method: 'POST', actor }));
  const th = s.theme(img, ids), preset = { atelie: { font: 'fraunces', button: 'pill', layout: { width: 'regular', density: 'comfortable', ratio: 'square', fit: 'cover' } }, essencial: { font: 'archivo', button: 'rounded', layout: { width: 'wide', density: 'compact', ratio: 'square', fit: 'contain' } }, editorial: { font: 'bodoni', button: 'square', layout: { width: 'wide', density: 'comfortable', ratio: 'portrait', fit: 'cover' } } }[s.preset];
  const theme = { schema_version: 2, preset: s.preset, title: s.name.replace(' TESTE', ''), description: s.description, brand: { color: s.color, font: preset.font, button: preset.button, logo: null }, layout: preset.layout, sections: th.sections, menu: th.menu, footer: { links: th.pages.map((p) => ({ label: p.title, to: { kind: 'page', ref: p.slug } })), note: 'Atendimento de segunda a sexta, das 9h às 18h (exemplo).' }, pages: th.pages, assets: [] };
  const draft = ok(await api(`${P}/storefront/draft`, { method: 'POST', actor, body: theme }));
  const published = ok(await api(`${P}/storefront/publish`, { method: 'POST', actor, body: { revision_id: draft.id } }));
  created.push({ key: s.key, preset: s.preset, name: s.name, email, password, tenantId: store.id, store: `${base}/lojas/${s.slug}`, panel: `${base}/painel/${store.id}`, editor: `${base}/painel/${store.id}/aparencia`, canonical: published.canonical });
  console.log(`\n✔ ${s.name} (${s.preset}) ${base}/lojas/${s.slug}`);
}
mkdirSync(join(root, '.local'), { recursive: true });
writeFileSync(join(root, '.local/demo-presets.json'), JSON.stringify(created, null, 2), { mode: 0o600 });
console.log('Contas e endereços em .local/demo-presets.json (não versionar).');
