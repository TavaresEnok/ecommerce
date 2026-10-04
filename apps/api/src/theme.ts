import { BadRequestException } from '@nestjs/common';
// Tema da loja, esquema versionado (DESIGN.md §11). v2 = preset + identidade + layout + seções + navegação/rodapé + páginas.
// Tudo é tipado com valores permitidos e limites; nenhum HTML, CSS ou script do lojista é aceito. URLs externas só https.
// v1 (título, cor, fonte, mensagem, páginas, menu, imagens) continua aceito e é convertido de forma determinística.

export const PRESETS = ['editorial', 'essencial', 'atelie'] as const;
export const FONTS = ['plex', 'bodoni', 'archivo', 'fraunces', 'serif'] as const;
export const BUTTONS = ['rounded', 'square', 'pill'] as const;
export const WIDTHS = ['narrow', 'regular', 'wide'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const RATIOS = ['portrait', 'square', 'landscape'] as const;
export const FITS = ['cover', 'contain'] as const;
export const LINK_KINDS = ['home', 'catalog', 'category', 'product', 'page', 'cart', 'contact', 'external'] as const;
export const SECTION_TYPES = ['hero', 'products', 'categories', 'image_text', 'text'] as const;
const LIMITS = { sections: 12, menu: 10, footer: 8, pages: 10, products: 12, categories: 12 };

export type Target = { kind: (typeof LINK_KINDS)[number]; ref?: string; url?: string };
export type Link = { label: string; to: Target };
export type Focal = { x: number; y: number };
export type Section =
  | { id: string; type: 'hero'; hidden: boolean; heading: string; text: string; image: string | null; focal: Focal; layout: 'overlay' | 'split' | 'stacked'; cta: Link | null }
  | { id: string; type: 'products'; hidden: boolean; heading: string; source: 'all' | 'category' | 'manual'; category: string | null; products: string[]; limit: 4 | 8 | 12 | 24 }
  | { id: string; type: 'categories'; hidden: boolean; heading: string; categories: string[] }
  | { id: string; type: 'image_text'; hidden: boolean; heading: string; text: string; image: string | null; focal: Focal; side: 'start' | 'end' }
  | { id: string; type: 'text'; hidden: boolean; heading: string; text: string };
export type Page = { slug: string; title: string; body: string };
export type ThemeV2 = {
  schema_version: 2; preset: (typeof PRESETS)[number]; title: string; description: string;
  brand: { color: string; font: (typeof FONTS)[number]; button: (typeof BUTTONS)[number]; logo: string | null };
  layout: { width: (typeof WIDTHS)[number]; density: (typeof DENSITIES)[number]; ratio: (typeof RATIOS)[number]; fit: (typeof FITS)[number] };
  sections: Section[]; menu: Link[]; footer: { links: Link[]; note: string }; pages: Page[]; assets: string[];
  supplier?: Record<string, unknown>;
};

const bad = (message: string): never => { throw new BadRequestException(message); };
const obj = (v: unknown, what: string): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : bad(`${what} inválido.`));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Texto simples: sem marcação nem caracteres de controle (exceto quebra de linha nos campos longos).
function str(v: unknown, max: number, what: string, opts: { optional?: boolean; multiline?: boolean } = {}): string {
  if (v === undefined || v === null || v === '') { if (opts.optional) return ''; bad(`${what} é obrigatório.`); }
  if (typeof v !== 'string') bad(`${what} inválido.`);
  const s = (v as string).trim();
  if (s.length > max) bad(`${what}: no máximo ${max} caracteres.`);
  if (/[<>]/.test(s)) bad(`${what}: use texto simples, sem marcação HTML.`);
  if (opts.multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s) : /[\u0000-\u001f]/.test(s)) bad(`${what} contém caracteres não permitidos.`);
  return s;
}
const oneOf = <T extends readonly string[]>(v: unknown, list: T, what: string, fallback?: T[number]): T[number] => (v === undefined && fallback !== undefined ? fallback : (list as readonly unknown[]).includes(v) ? v as T[number] : bad(`${what} inválido.`));
const asset = (v: unknown, what: string): string | null => (v === null || v === undefined || v === '' ? null : typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : bad(`${what}: imagem inválida.`));
const bool = (v: unknown) => v === true;
const focal = (v: unknown): Focal => { if (v === undefined || v === null) return { x: 50, y: 50 }; const f = obj(v, 'Ponto focal'); const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100 ? Math.round(x) : bad('Ponto focal: use valores de 0 a 100.')); return { x: n(f.x), y: n(f.y) }; };
function sectionId(v: unknown): string { return typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v) ? v : bad('Identificador de seção inválido.'); }

function target(v: unknown, pages: Set<string>): Target {
  const t = obj(v, 'Destino'), kind = oneOf(t.kind, LINK_KINDS, 'Tipo de destino');
  if (kind === 'external') {
    const url = str(t.url, 300, 'Endereço externo');
    let parsed: URL; try { parsed = new URL(url); } catch { return bad('Endereço externo inválido.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) bad('Endereço externo precisa começar com https:// e não pode conter usuário ou senha.');
    return { kind, url: parsed.toString() };
  }
  if (kind === 'category') { const ref = str(t.ref, 80, 'Categoria do destino'); if (!SLUG.test(ref)) bad('Categoria do destino inválida.'); return { kind, ref }; }
  if (kind === 'product') { const ref = typeof t.ref === 'string' && UUID.test(t.ref) ? t.ref.toLowerCase() : bad('Produto do destino inválido.'); return { kind, ref }; }
  if (kind === 'page') { const ref = str(t.ref, 80, 'Página do destino'); if (!pages.has(ref)) bad(`A página “${ref}” do menu não existe no tema.`); return { kind, ref }; }
  return { kind };
}
const link = (v: unknown, pages: Set<string>): Link => { const l = obj(v, 'Link'); return { label: str(l.label, 60, 'Nome do link'), to: target(l.to, pages) }; };

function section(v: unknown, pages: Set<string>): Section {
  const s = obj(v, 'Seção'), id = sectionId(s.id), type = oneOf(s.type, SECTION_TYPES, 'Tipo de seção'), hidden = bool(s.hidden);
  if (type === 'hero') return { id, type, hidden, heading: str(s.heading, 120, 'Título do destaque', { optional: true }), text: str(s.text, 400, 'Texto do destaque', { optional: true, multiline: true }), image: asset(s.image, 'Destaque'), focal: focal(s.focal), layout: oneOf(s.layout, ['overlay', 'split', 'stacked'] as const, 'Composição do destaque', 'stacked'), cta: s.cta ? link(s.cta, pages) : null };
  if (type === 'products') {
    const source = oneOf(s.source, ['all', 'category', 'manual'] as const, 'Origem dos produtos', 'all');
    const products = Array.isArray(s.products) ? s.products : [];
    if (products.length > LIMITS.products) bad(`Produtos em destaque: no máximo ${LIMITS.products}.`);
    const ids = products.map((p) => (typeof p === 'string' && UUID.test(p) ? p.toLowerCase() : bad('Produto em destaque inválido.')));
    if (new Set(ids).size !== ids.length) bad('Produto repetido no destaque.');
    const category = source === 'category' ? str(s.category, 80, 'Categoria da seção') : null;
    if (category && !SLUG.test(category)) bad('Categoria da seção inválida.');
    if (source === 'manual' && !ids.length) bad('Escolha ao menos um produto para a seção de destaque.');
    const limit = ([4, 8, 12, 24] as const).find((n) => n === s.limit) ?? (s.limit === undefined ? 8 : bad('Quantidade de produtos inválida.'));
    return { id, type, hidden, heading: str(s.heading, 120, 'Título da seção', { optional: true }), source, category, products: source === 'manual' ? ids : [], limit };
  }
  if (type === 'categories') {
    const cats = Array.isArray(s.categories) ? s.categories : [];
    if (cats.length > LIMITS.categories) bad(`Categorias: no máximo ${LIMITS.categories}.`);
    return { id, type, hidden, heading: str(s.heading, 120, 'Título da seção', { optional: true }), categories: cats.map((c) => { const x = str(c, 80, 'Categoria'); return SLUG.test(x) ? x : bad('Categoria inválida.'); }) };
  }
  if (type === 'image_text') return { id, type, hidden, heading: str(s.heading, 120, 'Título da seção', { optional: true }), text: str(s.text, 1200, 'Texto da seção', { optional: true, multiline: true }), image: asset(s.image, 'Imagem da seção'), focal: focal(s.focal), side: oneOf(s.side, ['start', 'end'] as const, 'Lado da imagem', 'start') };
  return { id, type: 'text', hidden, heading: str(s.heading, 120, 'Título da seção', { optional: true }), text: str(s.text, 2000, 'Texto da seção', { multiline: true }) };
}

// Valida um tema v2 vindo do editor. Lança 400 com mensagem em português para o primeiro problema encontrado.
export function validateV2(value: unknown): ThemeV2 {
  const b = obj(value, 'Tema');
  if (b.schema_version !== 2) bad('Versão do tema não suportada.');
  const color = typeof b.brand === 'object' && b.brand ? String((b.brand as Record<string, unknown>).color ?? '') : '';
  if (!/^#[0-9a-f]{6}$/i.test(color)) bad('Cor da marca inválida; use o formato #RRGGBB.');
  const brand = obj(b.brand, 'Identidade'), layout = obj(b.layout, 'Layout');
  const rawPages = Array.isArray(b.pages) ? b.pages : bad('Páginas inválidas.');
  if (rawPages.length > LIMITS.pages) bad(`No máximo ${LIMITS.pages} páginas.`);
  const pages = rawPages.map((p) => { const x = obj(p, 'Página'), slug = str(x.slug, 80, 'Endereço da página'); if (!SLUG.test(slug)) bad(`Endereço da página “${slug}” inválido: use letras minúsculas, números e hífens.`); return { slug, title: str(x.title, 100, 'Título da página'), body: str(x.body, 8000, 'Texto da página', { multiline: true }) }; });
  if (new Set(pages.map((p) => p.slug)).size !== pages.length) bad('Há duas páginas com o mesmo endereço.');
  const pageSet = new Set(pages.map((p) => p.slug));
  const rawSections = Array.isArray(b.sections) ? b.sections : bad('Seções inválidas.');
  if (rawSections.length > LIMITS.sections) bad(`No máximo ${LIMITS.sections} seções.`);
  const sections = rawSections.map((s) => section(s, pageSet));
  if (new Set(sections.map((s) => s.id)).size !== sections.length) bad('Seções com identificador repetido.');
  const rawMenu = Array.isArray(b.menu) ? b.menu : bad('Menu inválido.');
  if (rawMenu.length > LIMITS.menu) bad(`Menu: no máximo ${LIMITS.menu} itens.`);
  const footer = obj(b.footer ?? { links: [], note: '' }, 'Rodapé'), rawFooter = Array.isArray(footer.links) ? footer.links : bad('Links do rodapé inválidos.');
  if (rawFooter.length > LIMITS.footer) bad(`Rodapé: no máximo ${LIMITS.footer} links.`);
  const theme: ThemeV2 = {
    schema_version: 2, preset: oneOf(b.preset, PRESETS, 'Modelo'), title: str(b.title, 100, 'Nome da loja'), description: str(b.description, 300, 'Descrição da loja', { optional: true }),
    brand: { color: color.toUpperCase(), font: oneOf(brand.font, FONTS, 'Fonte dos títulos'), button: oneOf(brand.button, BUTTONS, 'Estilo dos botões'), logo: asset(brand.logo, 'Logo') },
    layout: { width: oneOf(layout.width, WIDTHS, 'Largura'), density: oneOf(layout.density, DENSITIES, 'Densidade'), ratio: oneOf(layout.ratio, RATIOS, 'Proporção das imagens'), fit: oneOf(layout.fit, FITS, 'Enquadramento das imagens') },
    sections, menu: rawMenu.map((m) => link(m, pageSet)), footer: { links: rawFooter.map((m) => link(m, pageSet)), note: str(footer.note, 300, 'Nota do rodapé', { optional: true, multiline: true }) }, pages, assets: [],
  };
  theme.assets = referencedAssets(theme);
  return theme;
}

// Mídias usadas pelo tema: logo e imagens de seções. Vinculadas à revisão por theme_media (FK por loja).
export function referencedAssets(t: ThemeV2): string[] {
  const ids = [t.brand.logo, ...t.sections.flatMap((s) => ('image' in s ? [s.image] : []))].filter((x): x is string => !!x);
  return [...new Set(ids)];
}

// v1 → v2, determinístico: mesma entrada, mesma saída (ids de seção fixos). Mantém título, descrição, cor, fonte, mensagem,
// imagem de destaque, páginas e menu; usa o preset "essencial" (grade de catálogo, como a vitrine v1).
export function fromV1(c: Record<string, unknown>): ThemeV2 {
  const pages = (Array.isArray(c.pages) ? c.pages : []).filter((p): p is Page => !!p && typeof p === 'object' && typeof (p as Page).slug === 'string').map((p) => ({ slug: p.slug, title: String(p.title ?? ''), body: String(p.body ?? '') }));
  const menu: Link[] = (Array.isArray(c.menu) ? c.menu : []).flatMap((m): Link[] => {
    const item = m as { label?: unknown; path?: unknown }, path = String(item.path ?? ''), label = String(item.label ?? '').slice(0, 60) || 'Link';
    if (path === '/') return [{ label, to: { kind: 'home' } }];
    if (path === '/carrinho') return [{ label, to: { kind: 'cart' } }];
    const page = /^\/paginas\/([a-z0-9-]+)$/.exec(path)?.[1];
    return page && pages.some((p) => p.slug === page) ? [{ label, to: { kind: 'page', ref: page } }] : [];
  });
  const assets = (Array.isArray(c.assets) ? c.assets : []).filter((a): a is string => typeof a === 'string' && UUID.test(a));
  const hero = String(c.hero ?? ''), color = /^#[0-9a-f]{6}$/i.test(String(c.color)) ? String(c.color).toUpperCase() : '#245742';
  const sections: Section[] = [];
  if (hero || assets[0] || c.description) sections.push({ id: 'destaque', type: 'hero', hidden: false, heading: hero.slice(0, 120), text: String(c.description ?? '').slice(0, 400), image: assets[0] ?? null, focal: { x: 50, y: 50 }, layout: 'stacked', cta: null });
  sections.push({ id: 'categorias', type: 'categories', hidden: false, heading: '', categories: [] });
  sections.push({ id: 'produtos', type: 'products', hidden: false, heading: 'Produtos', source: 'all', category: null, products: [], limit: 24 });
  const theme: ThemeV2 = {
    schema_version: 2, preset: 'essencial', title: String(c.title ?? 'Loja').slice(0, 100) || 'Loja', description: String(c.description ?? '').slice(0, 300),
    brand: { color, font: c.font === 'serif' ? 'serif' : 'plex', button: 'rounded', logo: null },
    layout: { width: 'regular', density: 'comfortable', ratio: 'portrait', fit: 'contain' },
    sections, menu, footer: { links: pages.map((p) => ({ label: p.title.slice(0, 60) || p.slug, to: { kind: 'page' as const, ref: p.slug } })).slice(0, LIMITS.footer), note: '' }, pages, assets: [],
  };
  theme.assets = referencedAssets(theme);
  return theme;
}

// Leitura tolerante: v2 válido passa; v1 é convertido; conteúdo inválido/antigo cai num tema mínimo seguro (nunca quebra a loja).
export function normalize(content: unknown): ThemeV2 {
  const c = (content && typeof content === 'object' ? content : {}) as Record<string, unknown>;
  const supplier = c.supplier && typeof c.supplier === 'object' ? { supplier: c.supplier as Record<string, unknown> } : {};
  try {
    if (c.schema_version === 2) { const { supplier: _s, ...rest } = c; return { ...validateV2(rest), ...supplier }; }
    return { ...fromV1(c), ...supplier };
  } catch {
    return { ...fromV1({ title: typeof c.title === 'string' ? c.title : 'Loja', color: c.brand && typeof c.brand === 'object' ? (c.brand as Record<string, unknown>).color : c.color }), ...supplier };
  }
}
