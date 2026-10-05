'use client';
// Prévia com o mesmo renderizador da loja. No modo do editor (live), escuta mensagens da janela pai **da mesma origem** com o
// tema em edição e redesenha na hora; qualquer mensagem de outra origem ou fora do formato é ignorada. Nada é salvo aqui.
import { useEffect, useRef, useState } from 'react';
import Storefront, { type StoreData } from './storefront';
import type { Theme } from './theme-model';

export function PreviewLive({ data, path, tenantId, live }: { data: StoreData; path: string[]; tenantId: string; live: boolean }) {
  const [theme, setTheme] = useState<Theme>(data.theme), editing = useRef<string | null>(null);
  // O contorno da seção em edição é reaplicado a cada redesenho, sem rolar a prévia enquanto o lojista digita.
  useEffect(() => { const id = editing.current; if (id) document.querySelector(`[data-section="${id}"]`)?.setAttribute('data-editing', ''); }, [theme]);
  useEffect(() => {
    if (!live) return;
    const receive = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const msg = e.data as { type?: string; theme?: Theme; id?: string | null };
      if (msg?.type === 'theme-preview' && msg.theme && msg.theme.schema_version === 2) setTheme({ ...msg.theme, supplier: data.theme.supplier });
      // Seção aberta no editor: contorno na prévia e rolagem até ela (o mesmo bloco das propriedades).
      if (msg?.type === 'highlight-section') {
        document.querySelectorAll('[data-editing]').forEach((el) => el.removeAttribute('data-editing'));
        const ok = !!msg.id && /^[a-z0-9-]{1,40}$/.test(msg.id), el = ok ? document.querySelector(`[data-section="${msg.id}"]`) : null;
        editing.current = ok ? msg.id! : null;
        if (el) { el.setAttribute('data-editing', ''); el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'preview-ready', path }, location.origin);
    return () => window.removeEventListener('message', receive);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  // Links internos da prévia do editor continuam dentro do modo do editor.
  useEffect(() => {
    if (!live) return;
    const click = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null; if (!a) return; const u = new URL(a.href); if (u.origin === location.origin && u.pathname.startsWith(`/preview/${tenantId}`) && !u.searchParams.has('editor')) { e.preventDefault(); u.searchParams.set('editor', '1'); location.assign(u.toString()); } };
    document.addEventListener('click', click, true); return () => document.removeEventListener('click', click, true);
  }, [live, tenantId]);
  return <Storefront preview live={live} previewTenant={tenantId} path={path} data={{ ...data, theme }} />;
}
