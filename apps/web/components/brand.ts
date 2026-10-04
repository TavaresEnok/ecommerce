// Algoritmo de marca da loja (DESIGN.md §11; mesmo cálculo de docs/design/verificar.mjs).
// Corrige o USO da cor do tema quando falta contraste; a cor escolhida e armazenada pelo lojista não é alterada.
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] as const; };
const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = (h: string) => { const c = rgb(h).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i]! - v) * t)); };
const darken = (c: string, ok: (x: string) => boolean) => { for (let i = 0; i <= 20; i++) { const m = mix(c, '#000000', i * 0.05); if (ok(m)) return m; } return '#000000'; };
export const STORE_BG = '#FFFFFF', STORE_INK = '#1D1F1E';
export const DEFAULT_ACCENT = '#245742';
export function normalizeColor(value: unknown): string { return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : DEFAULT_ACCENT; }
export function brandTokens(input: unknown, bg = STORE_BG, ink = STORE_INK) {
  const accent = normalizeColor(input), white = '#FFFFFF';
  let fill = accent;
  if (Math.max(contrast(fill, white), contrast(fill, ink)) < 4.5) fill = darken(accent, (c) => contrast(c, white) >= 4.5);
  const onFill = contrast(fill, white) >= 4.5 ? white : ink;
  const border = contrast(fill, bg) >= 3 ? fill : ink;
  const text = contrast(accent, bg) >= 4.5 ? accent : darken(accent, (c) => contrast(c, bg) >= 4.5);
  const tint = mix(text, white, 0.9);
  return { accent, fill, onFill, border, text, tint, adjusted: fill !== accent || text !== accent || border !== fill };
}
// Variáveis CSS da vitrine para uma loja: cor do tema + fonte de títulos permitida (system | serif).
export function storeStyle(color: unknown, font: unknown): Record<string, string> {
  const b = brandTokens(color);
  return {
    '--store-color-accent': b.accent, '--store-color-accent-fill': b.fill, '--store-color-on-accent': b.onFill,
    '--store-color-accent-border': b.border, '--store-color-accent-text': b.text, '--store-color-accent-tint': b.tint,
    ...(font === 'serif' ? { '--store-font-family-display': 'var(--store-font-family-display-serif)' } : {}),
  };
}

// Variáveis CSS completas de uma loja a partir do tema v2: neutros do preset, marca (com o algoritmo acima calculado sobre
// o fundo do preset), fonte de títulos licenciada, botões, largura, densidade e imagens. Só valores de uma lista fechada.
type ThemeLike = { preset: 'editorial' | 'essencial' | 'atelie'; brand: { color: string; font: string; button: string }; layout: { width: string; density: string; ratio: string; fit: string } };
const PRESET_BG: Record<string, string> = { editorial: '#FFFFFF', essencial: '#FFFFFF', atelie: '#FBF9F5' };
const PRESET_INK: Record<string, string> = { editorial: '#171717', essencial: '#101828', atelie: '#2B2620' };
export function themeStyle(t: ThemeLike): Record<string, string> {
  const bg = PRESET_BG[t.preset] ?? STORE_BG, ink = PRESET_INK[t.preset] ?? STORE_INK, b = brandTokens(t.brand.color, bg, ink), v = (n: string) => `var(--store-preset-${t.preset}-${n})`;
  const display: Record<string, string> = { plex: 'var(--store-font-family-display)', serif: 'var(--store-font-family-display-serif)', bodoni: 'var(--store-font-family-display-bodoni)', archivo: 'var(--store-font-family-display-archivo)', fraunces: 'var(--store-font-family-display-fraunces)' };
  return {
    '--store-color-bg': v('bg'), '--store-color-surface': v('surface'), '--store-color-text': v('text'), '--store-color-text-muted': v('text-muted'), '--store-color-border': v('border'), '--store-color-control-border': v('control-border'),
    '--store-color-accent': b.accent, '--store-color-accent-fill': b.fill, '--store-color-on-accent': b.onFill, '--store-color-accent-border': b.border, '--store-color-accent-text': b.text, '--store-color-accent-tint': b.tint,
    '--_display': display[t.brand.font] ?? display.plex!,
    '--_btn-radius': t.brand.button === 'square' ? 'var(--store-radius-button-square)' : t.brand.button === 'pill' ? 'var(--store-radius-button-pill)' : 'var(--store-radius-control)',
    '--store-layout-content-max': t.layout.width === 'narrow' ? 'var(--store-layout-content-max-narrow)' : t.layout.width === 'wide' ? 'var(--store-layout-content-max-wide)' : '1200px',
    '--store-layout-media-ratio': t.layout.ratio === 'square' ? 'var(--store-layout-ratio-square)' : t.layout.ratio === 'landscape' ? 'var(--store-layout-ratio-landscape)' : '4 / 5',
    '--_media-fit': t.layout.fit === 'cover' ? 'cover' : 'contain',
    '--_gap': t.layout.density === 'compact' ? 'var(--space-12)' : 'var(--space-24)',
    '--_section-space': t.layout.density === 'compact' ? 'var(--space-32)' : 'var(--space-64)',
  };
}
export function brandReport(t: ThemeLike) { const bg = PRESET_BG[t.preset] ?? STORE_BG, ink = PRESET_INK[t.preset] ?? STORE_INK; return { ...brandTokens(t.brand.color, bg, ink), bg }; }
