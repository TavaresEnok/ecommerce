// Formatação de valores para a interface. Dinheiro chega da API como string de centavos (MON-01) e nunca passa por
// ponto flutuante: o total cobrado é sempre do servidor.
export const money = (value: string) => {
  const cents = BigInt(value), sign = cents < 0n ? '-' : '', abs = cents < 0n ? -cents : cents;
  return `${sign}R$ ${(abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(abs % 100n).toString().padStart(2, '0')}`;
};
// "64,90", "1.234,56", "R$ 12" → string de centavos ("6490"). null quando o formato não é um valor em reais válido.
export function toCents(raw: string): string | null {
  const v = raw.replace(/R\$/g, '').replace(/\s/g, '');
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  return (m[1]!.replace(/\./g, '') + (m[2] || '').padEnd(2, '0')).replace(/^0+(?=\d)/, '');
}
// Centavos → texto editável ("6490" → "64,90").
export const centsToInput = (cents: string) => { const v = BigInt(cents || '0'); return `${v / 100n},${(v % 100n).toString().padStart(2, '0')}`; };
function zone(timeZone?: string) { try { if (timeZone) { new Intl.DateTimeFormat('pt-BR', { timeZone }); return timeZone; } } catch { /* fuso inválido */ } return 'America/Sao_Paulo'; }
export const formatDateTime = (iso: string, timeZone?: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: zone(timeZone), day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const formatDate = (iso: string, timeZone?: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: zone(timeZone), day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
export const formatTime = (iso: string, timeZone?: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: zone(timeZone), hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const zoneNote = (timeZone?: string) => zone(timeZone) === 'America/Sao_Paulo' ? 'horário de Brasília' : `fuso ${zone(timeZone)}`;
export const bytes = (value: string | number) => { const n = Number(value); return n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; };
// Gera um endereço (slug) a partir do nome, no mesmo formato aceito pela API.
export const slugify = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
