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
