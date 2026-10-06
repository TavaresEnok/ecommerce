'use client';
// Casca do painel da loja (DESIGN.md §5.1): navegação lateral ≥1024 px, menu modal abaixo disso.
// Identidade da plataforma, contexto da loja e situação das vendas. O contexto (loja, papel,
// CSRF, fuso) é carregado da API a cada troca de loja; nada daqui substitui a autorização do servidor.
import { createContext, type ReactNode, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
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

// Navegação do painel (DESIGN.md §5.1). Destinos reais, agrupados por tarefa. ≥1024 px: lateral fixa. Abaixo disso: barra
// compacta com a loja e um botão "Menu" que abre a mesma navegação numa gaveta modal (foco preso, Esc fecha, foco volta ao
// botão). Nada aqui decide permissão: itens só do Dono ficam ocultos para o Funcionário e o servidor continua recusando.
type NavItem = { href: string; label: string; icon: IconName; current: boolean; owner?: boolean };
type NavGroup = { label: string; items: NavItem[] };
export function useNav(): NavGroup[] {
  const p = usePanel(), path = usePathname(), params = useSearchParams(), base = `/painel/${p.tenantId}`, aba = params.get('aba') || '';
  const at = (sub: string) => path === `${base}${sub}` || path.startsWith(`${base}${sub}/`);
  const catalog = (tab: string) => path === base && (tab ? aba === tab : !['estoque', 'midia', 'organizacao', 'vitrine', 'frete'].includes(aba));
  const groups: NavGroup[] = [
    { label: 'Dia a dia', items: [
      { href: `${base}/operacao`, label: 'Hoje', icon: 'gauge', current: at('/operacao') },
      { href: `${base}/pedidos`, label: 'Pedidos', icon: 'receipt', current: at('/pedidos') },
      { href: `${base}/atendimento`, label: 'Atendimento', icon: 'chat', current: at('/atendimento') },
    ] },
    { label: 'Catálogo', items: [
      { href: base, label: 'Produtos', icon: 'box', current: catalog('') },
      { href: `${base}?aba=estoque`, label: 'Estoque', icon: 'layers', current: catalog('estoque') },
      { href: `${base}?aba=midia`, label: 'Imagens', icon: 'image', current: catalog('midia') },
      { href: `${base}?aba=organizacao`, label: 'Categorias e locais', icon: 'tag', current: catalog('organizacao') },
    ] },
    { label: 'Loja', items: [
      { href: `${base}/aparencia`, label: 'Aparência', icon: 'brush', current: at('/aparencia') || (path === base && aba === 'vitrine'), owner: true },
      { href: `${base}/configuracoes/loja`, label: 'Dados da loja', icon: 'store', current: at('/configuracoes/loja'), owner: true },
      { href: `${base}/configuracoes/entregas`, label: 'Entregas', icon: 'truck', current: at('/configuracoes/entregas') || (path === base && aba === 'frete'), owner: true },
      { href: `${base}/configuracoes/dominio`, label: 'Domínio', icon: 'globe', current: at('/configuracoes/dominio'), owner: true },
    ] },
    { label: 'Conta', items: [
      { href: `${base}/configuracoes/seguranca`, label: 'Segurança', icon: 'shield', current: at('/configuracoes/seguranca') },
      { href: `${base}/configuracoes/plano`, label: 'Plano e faturas', icon: 'card', current: at('/configuracoes/plano'), owner: true },
      { href: `${base}/configuracoes/dados`, label: 'Dados e IA', icon: 'download', current: at('/configuracoes/dados') },
    ] },
  ];
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => p.owner || !i.owner) })).filter((g) => g.items.length);
}

function SalesState() {
  const p = usePanel();
  if (!p.status) return null;
  return p.status.suspended ? <Badge tone="danger">Loja suspensa</Badge> : p.status.sales_paused ? <Badge tone="warning">Vendas pausadas</Badge> : <Badge tone="success">Recebendo pedidos</Badge>;
}
function PaymentTag({ compact }: { compact?: boolean }) {
  const p = usePanel();
  if (p.payment === 'SIMULATED') return <span className="env-tag" title="Pagamentos simulados: nenhuma cobrança real é feita">{compact ? <><span aria-hidden>Simulado</span><span className="sr-only">Pagamentos simulados</span></> : 'Pagamentos simulados'}</span>;
  if (p.payment === 'NONE') return <span className="env-tag">{compact ? 'Sem pagamento' : 'Sem conta de pagamento'}</span>;
  return null;
}
function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return <nav aria-label="Áreas da loja" className="nav">{groups.map((g, n) => <div className="nav-group" key={g.label}>
    <p className="nav-group-label" id={`nav-grupo-${n}`}>{g.label}</p>
    <ul aria-labelledby={`nav-grupo-${n}`}>{g.items.map((i) => <li key={i.href}><Link href={i.href} aria-current={i.current ? 'page' : undefined} onClick={onNavigate}><Icon name={i.icon} />{i.label}</Link></li>)}</ul>
  </div>)}</nav>;
}
function StoreBlock() {
  const p = usePanel();
  return <div className="store-block">
    <div className="store-block-heading"><span className="store-avatar" aria-hidden="true"><Icon name="store" /></span><span className="caption">Sua loja</span></div>
    <p className="store-block-name">{p.store.name}</p>
    <p className="store-block-meta">{p.owner ? 'Dono' : 'Funcionário'}<span className="sep" aria-hidden>/</span><span className="slug">{p.store.slug}</span></p>
    {/* Situação da loja num só lugar (lateral ou gaveta); a barra do celular mostra só “Simulado”. */}
    <div className="store-status"><SalesState /><PaymentTag /></div>
  </div>;
}
function NavFoot({ onLogout }: { onLogout: () => void }) {
  const p = usePanel();
  return <div className="nav-foot">
    <a href={`/lojas/${p.store.slug}`}><Icon name="eye" size={16} />Ver loja publicada</a>
    <a href="/"><Icon name="swap" size={16} />Trocar de loja</a>
    <div className="nav-account"><span className="account-avatar" aria-hidden="true">{p.email.slice(0, 1).toUpperCase()}</span><span className="account-detail"><span>{p.owner ? 'Dono da loja' : 'Equipe da loja'}</span><span className="account-email">{p.email}</span></span></div>
    <button type="button" className="link-button" onClick={onLogout}><Icon name="logout" size={16} />Sair</button>
  </div>;
}

function Frame({ children }: { children: ReactNode }) {
  const p = usePanel(), groups = useNav(), path = usePathname(), params = useSearchParams();
  const current = groups.flatMap((g) => g.items).find((i) => i.current);
  const drawer = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null), [open, setOpen] = useState(false);
  // A gaveta fecha ao trocar de destino (inclusive pelo botão Voltar do navegador).
  useEffect(() => { if (drawer.current?.open) drawer.current.close(); }, [path, params]);
  function show() { drawer.current?.showModal(); setOpen(true); (drawer.current?.querySelector('[aria-current="page"]') as HTMLElement | null ?? drawer.current?.querySelector('a') as HTMLElement | null)?.focus(); }
  async function logout() { try { await call('auth/logout', { method: 'POST', csrf: p.csrf }); } finally { location.assign('/'); } }
  return <div className="surface-panel app">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <aside className="sidebar" aria-label="Navegação do painel"><div className="sidebar-inner"><a className="sidebar-wordmark" href="/">Plataforma<span className="caption">PAINEL DA LOJA</span></a><StoreBlock /><NavList groups={groups} /><NavFoot onLogout={() => void logout()} /></div></aside>
    <header className="mobile-bar">
      <button ref={opener} type="button" className="menu-button" aria-haspopup="dialog" aria-expanded={open} aria-controls="painel-menu" onClick={show}><Icon name="menu" /><span>Menu</span></button>
      <div className="mobile-bar-store"><span className="name">{p.store.name}</span>{current && <span className="area">{current.label}</span>}</div>
      <PaymentTag compact />
    </header>
    <dialog ref={drawer} id="painel-menu" className="drawer" aria-label="Menu do painel" onClose={() => { setOpen(false); opener.current?.focus(); }} onClick={(e) => { if (e.target === drawer.current) drawer.current?.close(); }}>
      <div className="drawer-inner">
        <div className="drawer-head"><StoreBlock /><button type="button" className="icon-button" onClick={() => drawer.current?.close()} aria-label="Fechar menu"><Icon name="x" /></button></div>
        <NavList groups={groups} onNavigate={() => drawer.current?.close()} />
        <NavFoot onLogout={() => void logout()} />
      </div>
    </dialog>
    <div className="main">
      <main className="content" id="conteudo" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
