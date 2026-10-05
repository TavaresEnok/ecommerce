// Modelo de tema v2 do lado web: tipos (espelham apps/api/src/theme.ts, que valida), presets e resolução de destinos.
// O servidor é a autoridade; aqui só se monta o que o editor envia e o que o renderizador desenha.

export type Preset = 'editorial' | 'essencial' | 'atelie';
export type Font = 'plex' | 'bodoni' | 'archivo' | 'fraunces' | 'serif';
export type Target = { kind: 'home' | 'catalog' | 'category' | 'product' | 'page' | 'cart' | 'contact' | 'external'; ref?: string; url?: string };
export type ThemeLink = { label: string; to: Target };
export type Focal = { x: number; y: number };
export type Section =
  | { id: string; type: 'hero'; hidden: boolean; heading: string; text: string; image: string | null; focal: Focal; layout: 'overlay' | 'split' | 'stacked'; cta: ThemeLink | null }
  | { id: string; type: 'products'; hidden: boolean; heading: string; source: 'all' | 'category' | 'manual'; category: string | null; products: string[]; limit: 4 | 8 | 12 | 24 }
  | { id: string; type: 'categories'; hidden: boolean; heading: string; categories: string[] }
  | { id: string; type: 'image_text'; hidden: boolean; heading: string; text: string; image: string | null; focal: Focal; side: 'start' | 'end' }
  | { id: string; type: 'text'; hidden: boolean; heading: string; text: string };
export type SectionType = Section['type'];
export type Supplier = { synthetic: boolean; name: string; document: string; address: string; email: string; phone: string; policies: string; delivery: string; risks: string };
export type Theme = {
  schema_version: 2; preset: Preset; title: string; description: string;
  brand: { color: string; font: Font; button: 'rounded' | 'square' | 'pill'; logo: string | null };
  layout: { width: 'narrow' | 'regular' | 'wide'; density: 'comfortable' | 'compact'; ratio: 'portrait' | 'square' | 'landscape'; fit: 'cover' | 'contain' };
  sections: Section[]; menu: ThemeLink[]; footer: { links: ThemeLink[]; note: string }; pages: { slug: string; title: string; body: string }[]; assets: string[];
  supplier?: Supplier;
};

export const FONT_LABEL: Record<Font, string> = { plex: 'IBM Plex Sans (sem serifa, neutra)', archivo: 'Archivo (sem serifa, firme)', bodoni: 'Bodoni Moda (serifa de alto contraste)', fraunces: 'Fraunces (serifa suave)', serif: 'Serifa do sistema' };
export const SECTION_LABEL: Record<SectionType, string> = { hero: 'Destaque com imagem', products: 'Produtos', categories: 'Categorias', image_text: 'Imagem com texto', text: 'Texto' };

// Três composições diferentes na hierarquia, no uso de imagem e na ordem das seções — não só na cor.
export const PRESETS: Record<Preset, { name: string; tagline: string; summary: string; brand: Pick<Theme['brand'], 'font' | 'button'>; layout: Theme['layout']; color: string; sections: (t: { title: string; description: string }) => Section[] }> = {
  editorial: {
    name: 'Editorial',
    tagline: 'Foto grande na abertura, serifa elegante e produtos em retrato.',
    summary: 'Para moda e acessórios: fotografia grande no topo, títulos em serifa de alto contraste, produtos em retrato com bastante respiro e blocos de imagem com texto para contar a coleção.',
    brand: { font: 'bodoni', button: 'square' }, layout: { width: 'wide', density: 'comfortable', ratio: 'portrait', fit: 'cover' }, color: '#1F2A44',
    sections: (t) => [
      { id: 'abertura', type: 'hero', hidden: false, heading: t.title, text: t.description, image: null, focal: { x: 50, y: 40 }, layout: 'overlay', cta: { label: 'Ver coleção', to: { kind: 'catalog' } } },
      { id: 'novidades', type: 'products', hidden: false, heading: 'Novidades', source: 'all', category: null, products: [], limit: 8 },
      { id: 'historia', type: 'image_text', hidden: false, heading: 'Sobre a coleção', text: 'Conte de onde vêm as peças, os materiais e o cuidado no acabamento.', image: null, focal: { x: 50, y: 50 }, side: 'start' },
      { id: 'categorias', type: 'categories', hidden: false, heading: 'Explore', categories: [] },
    ],
  },
  essencial: {
    name: 'Essencial',
    tagline: 'Busca e categorias primeiro, grade densa para comparar.',
    summary: 'Para utilidades e tecnologia: busca em destaque, categorias logo no início e grade densa para comparar preço e disponibilidade; imagens quadradas e inteiras sobre fundo claro.',
    brand: { font: 'archivo', button: 'rounded' }, layout: { width: 'wide', density: 'compact', ratio: 'square', fit: 'contain' }, color: '#1D4ED8',
    sections: () => [
      { id: 'categorias', type: 'categories', hidden: false, heading: 'Categorias', categories: [] },
      { id: 'produtos', type: 'products', hidden: false, heading: 'Todos os produtos', source: 'all', category: null, products: [], limit: 24 },
    ],
  },
  atelie: {
    name: 'Ateliê',
    tagline: 'Foto e texto lado a lado, peças quadradas com respiro.',
    summary: 'Para casa e artesanato: abertura dividida entre foto e texto, poucos produtos por vez em formato quadrado e espaço para apresentar quem faz e como é feito.',
    brand: { font: 'fraunces', button: 'pill' }, layout: { width: 'regular', density: 'comfortable', ratio: 'square', fit: 'cover' }, color: '#2F5D50',
    sections: (t) => [
      { id: 'abertura', type: 'hero', hidden: false, heading: t.title, text: t.description, image: null, focal: { x: 50, y: 50 }, layout: 'split', cta: { label: 'Conhecer as peças', to: { kind: 'catalog' } } },
      { id: 'selecao', type: 'products', hidden: false, heading: 'Peças da semana', source: 'all', category: null, products: [], limit: 4 },
      { id: 'processo', type: 'image_text', hidden: false, heading: 'Como fazemos', text: 'Mostre o processo, os materiais e quem está por trás de cada peça.', image: null, focal: { x: 50, y: 50 }, side: 'end' },
      { id: 'mais', type: 'products', hidden: false, heading: 'Mais peças', source: 'all', category: null, products: [], limit: 8 },
    ],
  },
};

// O que muda e o que fica ao trocar de preset (mostrado antes de confirmar).
export function applyPreset(theme: Theme, preset: Preset, replaceSections: boolean): Theme {
  const p = PRESETS[preset];
  return { ...theme, preset, brand: { ...theme.brand, font: p.brand.font, button: p.brand.button }, layout: { ...p.layout }, sections: replaceSections ? carryImages(theme.sections, p.sections({ title: theme.title, description: theme.description })) : theme.sections };
}
// Ao usar as seções sugeridas, aproveita imagens e textos já escolhidos nas seções do mesmo tipo.
function carryImages(old: Section[], next: Section[]): Section[] {
  return next.map((s) => {
    const same = old.find((o) => o.type === s.type);
    if (!same) return s;
    if ((s.type === 'hero' || s.type === 'image_text') && (same.type === 'hero' || same.type === 'image_text')) return { ...s, image: same.image, focal: same.focal, heading: same.heading || s.heading, text: same.text || s.text } as Section;
    return s;
  });
}
export function newSection(type: SectionType, existing: Section[]): Section {
  let n = existing.length + 1, id = `${type.replace('_', '-')}-${n}`;
  while (existing.some((s) => s.id === id)) id = `${type.replace('_', '-')}-${++n}`;
  if (type === 'hero') return { id, type, hidden: false, heading: 'Novo destaque', text: '', image: null, focal: { x: 50, y: 50 }, layout: 'stacked', cta: null };
  if (type === 'products') return { id, type, hidden: false, heading: 'Produtos', source: 'all', category: null, products: [], limit: 8 };
  if (type === 'categories') return { id, type, hidden: false, heading: 'Categorias', categories: [] };
  if (type === 'image_text') return { id, type, hidden: false, heading: 'Imagem com texto', text: '', image: null, focal: { x: 50, y: 50 }, side: 'start' };
  return { id, type: 'text', hidden: false, heading: 'Texto', text: 'Escreva aqui.' };
}
export function referencedAssets(t: Theme): string[] {
  return [...new Set([t.brand.logo, ...t.sections.flatMap((s) => ('image' in s ? [s.image] : []))].filter((x): x is string => !!x))];
}

// Destino → endereço dentro da loja (relativo à base) ou externo. Produto/categoria/página inexistentes → null (não vira link quebrado).
export function hrefOf(to: Target, ctx: { products: { id: string; slug: string }[]; categories: { slug: string }[]; pages: { slug: string }[] }): { path: string; external?: boolean } | null {
  switch (to.kind) {
    case 'home': return { path: '/' };
    case 'catalog': return { path: '/#produtos' };
    case 'cart': return { path: '/carrinho' };
    case 'contact': return { path: '/atendimento' };
    case 'category': return ctx.categories.some((c) => c.slug === to.ref) ? { path: `/categorias/${to.ref}` } : null;
    case 'page': return ctx.pages.some((p) => p.slug === to.ref) ? { path: `/paginas/${to.ref}` } : null;
    case 'product': { const p = ctx.products.find((x) => x.id === to.ref); return p ? { path: `/produtos/${p.slug}` } : null; }
    case 'external': return to.url && /^https:\/\//.test(to.url) ? { path: to.url, external: true } : null;
  }
}
export function describeTarget(to: Target, ctx: { products: { id: string; name: string }[]; categories: { slug: string; name: string }[]; pages: { slug: string; title: string }[] }): string {
  switch (to.kind) {
    case 'home': return 'Início da loja';
    case 'catalog': return 'Lista de produtos';
    case 'cart': return 'Carrinho';
    case 'contact': return 'Atendimento';
    case 'category': return `Categoria: ${ctx.categories.find((c) => c.slug === to.ref)?.name ?? `${to.ref} (removida)`}`;
    case 'page': return `Página: ${ctx.pages.find((p) => p.slug === to.ref)?.title ?? `${to.ref} (removida)`}`;
    case 'product': return `Produto: ${ctx.products.find((p) => p.id === to.ref)?.name ?? 'produto indisponível'}`;
    case 'external': return `Site externo: ${to.url ?? ''}`;
  }
}
