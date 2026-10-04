'use client';
// Prévia com o mesmo renderizador da loja. No modo do editor (live), escuta mensagens da janela pai **da mesma origem** com o
// tema em edição e redesenha na hora; qualquer mensagem de outra origem ou fora do formato é ignorada. Nada é salvo aqui.
import { useEffect, useState } from 'react';
import Storefront, { type StoreData } from './storefront';
import type { Theme } from './theme-model';

export function PreviewLive({ data, path, tenantId, live }: { data: StoreData; path: string[]; tenantId: string; live: boolean }) {
  const [theme, setTheme] = useState<Theme>(data.theme);
  useEffect(() => {
    if (!live) return;
    const receive = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const msg = e.data as { type?: string; theme?: Theme };
      if (msg?.type === 'theme-preview' && msg.theme && msg.theme.schema_version === 2) setTheme({ ...msg.theme, supplier: data.theme.supplier });
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
