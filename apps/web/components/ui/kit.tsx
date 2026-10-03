'use client';
// Componentes de interface compartilhados (DESIGN.md §6). Apresentação apenas: nenhuma chamada de API aqui.
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';
import { label as mapLabel, tone as mapTone, type Tone } from './status';
import { centsToInput } from './format';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function StatusBadge({ map, value }: { map: Record<string, readonly [string, Tone]>; value: string }) {
  return <Badge tone={mapTone(map, value)}>{mapLabel(map, value)}</Badge>;
}
const alertIcon: Record<string, IconName> = { info: 'info', success: 'check', warning: 'clock', danger: 'alert' };
export function Alert({ tone = 'info', title, children, role, icon, id, focusable }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode; role?: 'alert' | 'status' | 'note'; icon?: IconName; id?: string; focusable?: boolean }) {
  return <div className={`alert${tone === 'info' ? '' : ` alert-${tone}`}`} role={role} id={id} tabIndex={focusable ? -1 : undefined}>
    <Icon name={icon ?? alertIcon[tone]!} /><div>{title && <p className="alert-title">{title}</p>}{children}</div>
  </div>;
}
// Mensagens de resultado de uma ação: erro com role=alert, sucesso com role=status. Ficam visíveis até a próxima ação.
export function Feedback({ error, notice }: { error?: string; notice?: string }) {
  return <>{error && <Alert tone="danger" role="alert" title="Não foi possível concluir">{<p>{error}</p>}</Alert>}{notice && <p role="status" className="alert alert-success" style={{ display: 'block' }}>{notice}</p>}</>;
}
export function EmptyState({ icon = 'info', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><Icon name={icon} /><p className="empty-title">{title}</p>{children && <div className="small muted">{children}</div>}{action}</div>;
}
export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div className="loading" aria-busy="true"><p role="status" className="small">{label}</p><div className="skeleton" style={{ width: '70%' }} aria-hidden /><div className="skeleton" style={{ width: '90%' }} aria-hidden /><div className="skeleton" style={{ width: '55%' }} aria-hidden /></div>;
}
export function PageHeader({ eyebrow, title, meta, crumbs, actions }: { eyebrow?: ReactNode; title: ReactNode; meta?: ReactNode; crumbs?: { label: string; href?: string }[]; actions?: ReactNode }) {
  return <div className="stack-sm">
    {crumbs && crumbs.length > 0 && <nav aria-label="Você está em"><ol className="crumbs">{crumbs.map((c, i) => <li key={i} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.href && i < crumbs.length - 1 ? <a href={c.href}>{c.label}</a> : c.label}</li>)}</ol></nav>}
    <div className="page-head"><div>{eyebrow && <p className="caption">{eyebrow}</p>}<h1>{title}</h1>{meta && <div className="meta">{meta}</div>}</div>{actions && <div className="cluster">{actions}</div>}</div>
  </div>;
}
type A11y = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true };
export function Field({ label, hint, error, optional, children, id: given }: { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; id?: string; children: (a11y: A11y) => ReactNode }) {
  const auto = useId(), id = given ?? `f${auto.replace(/:/g, '')}`;
  const describedBy = [hint ? `${id}-h` : '', error ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined;
  return <div className={`field${error ? ' is-invalid' : ''}`}>
    <label htmlFor={id}>{label}{optional && <span className="optional"> (opcional)</span>}</label>
    {children({ id, 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true as const } : {}) })}
    {hint && <p className="hint" id={`${id}-h`}>{hint}</p>}
    {error && <p className="error-text" id={`${id}-e`}><Icon name="alert" size={16} />{error}</p>}
  </div>;
}
// Valor em reais: aceita "64,90" ou "1.234,56"; quem envia converte com toCents (sem ponto flutuante).
export function MoneyInput({ name, defaultCents, a11y, required }: { name: string; defaultCents?: string; a11y: A11y; required?: boolean }) {
  return <div className="input-affix"><span aria-hidden>R$</span><input className="input" name={name} inputMode="decimal" autoComplete="off" required={required} defaultValue={defaultCents ? centsToInput(defaultCents) : ''} {...a11y} /></div>;
}
// Diálogo modal nativo: foco inicial no primeiro campo (ou no botão de voltar), Esc fecha, foco volta à origem.
export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'danger', onConfirm, onClose, children, busy }: { open: boolean; title: string; description: ReactNode; confirmLabel: string; tone?: 'danger' | 'primary'; onConfirm: (data: Record<string, string>) => void; onClose: () => void; children?: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), origin = useRef<HTMLElement | null>(null), ids = useId().replace(/:/g, '');
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { origin.current = document.activeElement as HTMLElement; d.showModal(); (d.querySelector('input,textarea,select') as HTMLElement | null ?? d.querySelector('[data-cancel]') as HTMLElement | null)?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} className="dialog" aria-labelledby={`${ids}-t`} aria-describedby={`${ids}-d`} onClose={() => { onClose(); origin.current?.focus(); }}>
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>); }}>
      <div className="dialog-body"><h2 id={`${ids}-t`}>{title}</h2><div id={`${ids}-d`}>{description}</div>{children}</div>
      <div className="dialog-actions"><button type="button" className="btn btn-secondary" data-cancel onClick={() => ref.current?.close()}>Voltar</button><button className={`btn btn-${tone}`} disabled={busy}>{confirmLabel}</button></div>
    </form>
  </dialog>;
}
export function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn btn-quiet btn-sm" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }); }}><Icon name="copy" size={16} />{done ? 'Copiado' : label}</button>;
}
// Indica alterações não salvas e avisa antes de sair da página quando houver risco de perda.
export function useDirty() {
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  return { dirty, markDirty: () => setDirty(true), clean: () => setDirty(false) };
}
export function useTitle(title: string) { useEffect(() => { document.title = title ? `${title} · Plataforma` : 'Plataforma'; }, [title]); }
