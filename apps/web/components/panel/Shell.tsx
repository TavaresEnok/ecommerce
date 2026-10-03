'use client';
// Casca do painel da loja (DESIGN.md §5.1): navegação lateral ≥1024 px, faixa superior abaixo disso (todos os itens
// visíveis), topo de 64 px com área atual, aviso de pagamentos simulados e estado de vendas. O contexto (loja, papel,
// CSRF, fuso) é carregado da API a cada troca de loja; nada daqui substitui a autorização do servidor.
import { createContext, type ReactNode, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { call, ApiError } from './api';
import { MfaChallenge } from './MfaChallenge';
import { Icon, type IconName } from '../ui/icons';
import { Badge, Loading, Alert } from '../ui/kit';

export type Store = { id: string; name: string; slug: string; role: 'OWNER' | 'EMPLOYEE'; lifecycle_status?: string };
export type PanelContext = {
  tenantId: string; csrf: string; email: string; store: Store; owner: boolean; timezone: string;
  mfa: { enabled: boolean; verified: boolean }; status: { suspended: boolean; sales_paused: boolean } | null;
  payment: 'SIMULATED' | 'REAL' | 'NONE' | 'UNKNOWN'; refresh: () => Promise<void>;
};
const Ctx = createContext<PanelContext | null>(null);
export function usePanel() { const v = useContext(Ctx); if (!v) throw new Error('usePanel fora do painel'); return v; }

type Load = { state: 'loading' } | { state: 'expired' } | { state: 'denied' } | { state: 'mfa'; csrf: string; email: string } | { state: 'error'; message: string } | { state: 'ready'; value: Omit<PanelContext, 'refresh'> };
export function PanelShell({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const fetchContext = useCallback(async (fresh = false) => {
    try {
      // Sessão e lojas vêm sempre da API (autorização). Configuração, situação de vendas e conta de pagamento só enfeitam
      // a casca: são pedidas em paralelo e reaproveitadas por 60 s entre recargas da mesma aba (sessionStorage), para não
      // multiplicar requisições a cada página; ações que mudam esses dados chamam refresh(), que ignora a cópia.
      const session = await call<{ user: { email: string }; csrf: string; mfa: { enabled: boolean; verified: boolean } }>('auth/session');
      // Sessão por senha de conta com MFA: só o desafio é permitido pela API (R1); evita mostrar “loja não encontrada”.
      if (session.mfa?.enabled && !session.mfa.verified) { setLoad({ state: 'mfa', csrf: session.csrf, email: session.user.email }); return; }
      const stores = await call<Store[]>('tenants', { csrf: session.csrf });
      const store = stores.find((s) => s.id === tenantId);
      if (!store) { setLoad({ state: 'denied' }); return; }
      type Extras = { settings: { timezone: string; displayName: string }; status: { suspended: boolean; sales_paused: boolean } | null; accounts: { provider: string; environment: string; status: string }[] | null };
      const key = `painel-${tenantId}-${session.user.email}-${store.role}`;
      let extras: Extras | null = null;
      if (!fresh) try { const c = JSON.parse(sessionStorage.getItem(key) || 'null') as { at: number; v: Extras } | null; if (c && Date.now() - c.at < 60000) extras = c.v; } catch { /* sem storage */ }
      if (!extras) {
        const [settings, status, accounts] = await Promise.all([
          call<Extras['settings']>(`tenants/${tenantId}/settings`, { csrf: session.csrf }),
          call<NonNullable<Extras['status']>>(`tenants/${tenantId}/operations/status`, { csrf: session.csrf }).catch(() => null),
          store.role === 'OWNER' ? call<NonNullable<Extras['accounts']>>(`tenants/${tenantId}/purchase/accounts`, { csrf: session.csrf }).catch(() => null) : Promise.resolve(null),
        ]);
        extras = { settings, status, accounts };
        try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), v: extras })); } catch { /* sem storage */ }
      }
      const { settings, status, accounts } = extras;
      const connected = accounts?.filter((a) => a.status === 'CONNECTED') ?? null;
      const payment = connected === null ? 'UNKNOWN' : connected.length === 0 ? 'NONE' : connected.some((a) => a.provider === 'SIMULATED' || a.environment === 'SIMULATED') ? 'SIMULATED' : 'REAL';
      setLoad({ state: 'ready', value: { tenantId, csrf: session.csrf, email: session.user.email, store: { ...store, name: settings.displayName || store.name }, owner: store.role === 'OWNER', timezone: settings.timezone, mfa: session.mfa, status, payment } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLoad({ state: 'expired' });
      else if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setLoad({ state: 'denied' });
      else setLoad({ state: 'error', message: e instanceof Error ? e.message : 'Falha ao carregar.' });
    }
  }, [tenantId]);
  useEffect(() => { setLoad({ state: 'loading' }); void fetchContext(); }, [fetchContext]);
  if (load.state !== 'ready') return <div className="surface-panel"><main className="auth-main" id="conteudo">
    {load.state === 'loading' ? <Loading label="Carregando dados autorizados da loja…" /> :
      load.state === 'mfa' ? <MfaChallenge email={load.email} csrf={load.csrf} onVerified={() => fetchContext(true)} onSignOut={async () => { try { await call('auth/logout', { method: 'POST', csrf: load.csrf }); } finally { location.assign('/'); } }} /> :
      load.state === 'expired' ? <Alert tone="warning" role="alert" title="Sessão expirada">Entre novamente para continuar. <a href="/">Ir para o acesso</a></Alert> :
      load.state === 'denied' ? <Alert tone="danger" role="alert" title="Loja não encontrada">Esta loja não existe ou você não tem vínculo ativo com ela. <a href="/">Voltar às suas lojas</a></Alert> :
      <Alert tone="danger" role="alert" title="Não foi possível carregar o painel">{load.message} <button className="btn btn-secondary btn-sm" onClick={() => void fetchContext(true)}>Tentar novamente</button></Alert>}
  </main></div>;
  return <Ctx.Provider value={{ ...load.value, refresh: () => fetchContext(true) }}><Suspense><Frame>{children}</Frame></Suspense></Ctx.Provider>;
}

function Frame({ children }: { children: ReactNode }) {
  const p = usePanel(), path = usePathname(), params = useSearchParams(), base = `/painel/${p.tenantId}`, aba = params.get('aba');
  const items: { group?: string; href: string; label: string; icon: IconName; current: boolean }[] = [
    { group: 'Loja', href: base, label: 'Catálogo', icon: 'box', current: path === base && !['vitrine', 'frete'].includes(aba || '') },
    { href: `${base}?aba=vitrine`, label: 'Vitrine e frete', icon: 'brush', current: path === base && ['vitrine', 'frete'].includes(aba || '') },
    { group: 'Vendas', href: `${base}/pedidos`, label: 'Pedidos', icon: 'receipt', current: path.startsWith(`${base}/pedidos`) },
    { href: `${base}/atendimento`, label: 'Atendimento', icon: 'chat', current: path.startsWith(`${base}/atendimento`) },
    { group: 'Conta', href: `${base}/operacao`, label: 'Operação', icon: 'gauge', current: path.startsWith(`${base}/operacao`) },
  ];
  const area = items.find((i) => i.current)?.label ?? 'Painel';
  const sales = !p.status ? null : p.status.suspended ? <Badge tone="danger">Loja suspensa</Badge> : p.status.sales_paused ? <Badge tone="warning">Vendas pausadas</Badge> : <Badge tone="success">Recebendo pedidos</Badge>;
  async function logout() { try { await call('auth/logout', { method: 'POST', csrf: p.csrf }); } finally { location.assign('/'); } }
  return <div className="surface-panel app">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <aside className="sidebar" aria-label="Navegação do painel"><div className="sidebar-inner">
      <div className="store-switch"><div><div className="name">{p.store.name}</div><div className="role">{p.owner ? 'Dono' : 'Funcionário'} · {p.store.slug}</div></div><a className="small" href="/">Trocar loja</a></div>
      <nav aria-label="Áreas da loja"><ul className="nav">{items.map((i) => <li key={i.href} style={{ display: 'contents' }}>{i.group && <span className="nav-group-label caption" aria-hidden>{i.group}</span>}<Link href={i.href} aria-current={i.current ? 'page' : undefined}><Icon name={i.icon} />{i.label}</Link></li>)}</ul></nav>
      <div className="sidebar-foot"><a href={`/lojas/${p.store.slug}`}>Abrir vitrine</a><a href={`/preview/${p.tenantId}`}>Preview do rascunho</a><button className="btn btn-quiet btn-sm" style={{ paddingLeft: 0 }} onClick={() => void logout()}>Sair</button></div>
    </div></aside>
    <div className="main">
      <header className="topbar">
        <span className="topbar-area">{area}</span>
        <div className="cluster-tight">
          {p.payment === 'SIMULATED' && <span className="env-tag"><Icon name="info" size={16} />Pagamentos simulados</span>}
          {p.payment === 'NONE' && <span className="env-tag"><Icon name="info" size={16} />Sem conta de pagamento</span>}
          {sales}<span className="muted">{p.email}</span>
        </div>
      </header>
      <main className="content" id="conteudo" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
