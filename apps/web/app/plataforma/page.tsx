'use client';
// R06 — Administração da plataforma: papel concedido pelo operador, MFA em toda requisição, motivo obrigatório e
// auditoria. A faixa de contexto global e o bloco "Inspecionando" deixam claro que não se trata do painel de uma loja.
import { type FormEvent, useEffect, useState } from 'react';
import { call, ApiError, fields, useAction } from '../../components/panel/api';
import { Alert, Badge, ConfirmDialog, EmptyState, Feedback, Field, Loading, StatusBadge, useTitle } from '../../components/ui/kit';
import { ALERT_TITLE, INTERVAL, LIFECYCLE, PLAN_STATUS, SUBSCRIPTION, label } from '../../components/ui/status';
import { bytes, formatDateTime, money } from '../../components/ui/format';

type Tenant = { tenant_id: string; slug: string; name: string; lifecycle_status: string; subscription: { status: string; plan: string } };
type Plan = { id: string; code: string; version: number; name: string; price_cents: string | null; billing_interval: string; status: string; entitlements: Record<string, number | string> };
type Audit = { action: string; reason: string; admin: string; created_at: string };
type Inspect = { tenant: Tenant; reason: string; at: string; data: { status?: { suspended?: boolean; sales_paused?: boolean; financial_incidents?: number; payment_uncertain?: number; support_overdue?: number; alerts?: { code: string; value: number }[] }; billing?: { subscription?: { status: string }; plan?: { name: string; code: string; version: number }; usage?: Record<string, number | string> } } };
type Pending = { kind: 'view' | 'suspend' | 'reactivate'; tenant: Tenant } | { kind: 'plan'; plan: Plan; to: 'activate' | 'retire' } | { kind: 'billing' } | null;
const ACTION: Record<string, string> = { TENANT_VIEWED: 'Consulta de loja', TENANT_SUSPENDED: 'Loja suspensa', TENANT_REACTIVATED: 'Loja reativada', PLAN_CREATED: 'Versão de plano criada', PLAN_ACTIVATED: 'Plano ativado', PLAN_RETIRED: 'Plano aposentado', BILLING_RUN: 'Ciclo de cobrança executado', AI_POLICY_UPDATED: 'Política de IA atualizada' };

export default function Platform() {
  const [csrf, setCsrf] = useState(''), [email, setEmail] = useState(''), [mfa, setMfa] = useState<{ enabled: boolean; verified: boolean } | null>(null), [state, setState] = useState<'loading' | 'anon' | 'denied' | 'ready'>('loading');
  const [tenants, setTenants] = useState<Tenant[]>([]), [plans, setPlans] = useState<Plan[]>([]), [alerts, setAlerts] = useState<{ slug: string; alerts: { code: string }[] }[]>([]), [audit, setAudit] = useState<Audit[]>([]);
  const [inspect, setInspect] = useState<Inspect | null>(null), [pending, setPending] = useState<Pending>(null);
  const { busy, error, notice, run } = useAction();
  useTitle('Administração da plataforma');
  const api = (path: string, method = 'GET', body?: unknown, token = csrf) => call(path, { method, body, csrf: token });
  async function load(token = csrf) {
    try { setTenants(await api('platform/tenants', 'GET', undefined, token)); } catch (e) { if (e instanceof ApiError && e.status === 403) { setState('denied'); return; } throw e; }
    setPlans(await api('platform/plans', 'GET', undefined, token)); setAlerts(await api('platform/alerts', 'GET', undefined, token)); setAudit(await api('platform/audit', 'GET', undefined, token)); setState('ready');
  }
  useEffect(() => { call('auth/session').then(async (s) => { setCsrf(s.csrf); setEmail(s.user.email); setMfa(s.mfa); if (s.mfa.verified) await load(s.csrf); else setState('ready'); }).catch((e) => setState(e instanceof ApiError && e.status === 401 ? 'anon' : 'denied')); }, []);
  const submit = (task: (b: Record<string, string>) => Promise<unknown>, done: string) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void run(async () => { await task(b); f.reset(); await load(); }, done); };
  function confirm(b: Record<string, string>) {
    const p = pending; if (!p) return;
    void run(async () => {
      if (p.kind === 'view') { const data = await api(`platform/tenants/${p.tenant.tenant_id}?reason=${encodeURIComponent(b.reason!)}`); setInspect({ tenant: p.tenant, reason: b.reason!, at: new Date().toISOString(), data }); }
      else if (p.kind === 'suspend' || p.kind === 'reactivate') await api(`platform/tenants/${p.tenant.tenant_id}/${p.kind}`, 'POST', { reason: b.reason });
      else if (p.kind === 'plan') await api(`platform/plans/${p.plan.id}/${p.to}`, 'POST', { reason: b.reason });
      else await api('platform/billing/run', 'POST', { reason: b.reason });
      setPending(null); await load();
    }, p.kind === 'view' ? 'Consulta registrada na auditoria.' : 'Ação registrada na auditoria.');
  }
  const dialogTitle = !pending ? '' : pending.kind === 'view' ? `Consultar a loja ${pending.tenant.name}?` : pending.kind === 'suspend' ? `Suspender a loja ${pending.tenant.name}?` : pending.kind === 'reactivate' ? `Reativar a loja ${pending.tenant.name}?` : pending.kind === 'plan' ? `${pending.to === 'activate' ? 'Ativar' : 'Aposentar'} ${pending.plan.code} v${pending.plan.version}?` : 'Executar o ciclo de cobrança agora?';
  const dialogText = !pending ? '' : pending.kind === 'view' ? 'A consulta mostra a situação operacional e o plano da loja, e fica registrada com o seu motivo.' : pending.kind === 'suspend' ? 'Novas vendas ficam bloqueadas imediatamente. Pedidos, pagamentos, devoluções e atendimento existentes continuam acessíveis.' : pending.kind === 'reactivate' ? 'A loja volta a aceitar novas vendas.' : pending.kind === 'plan' ? (pending.to === 'activate' ? 'A versão passa a poder ser contratada. Versões são imutáveis após contratação.' : 'A versão deixa de ser oferecida; assinaturas atuais não mudam.') : 'Gera e cobra faturas vencidas no provedor configurado (simulado neste ambiente).';
  return <div className="surface-panel">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <div className="context-global" role="region" aria-label="Contexto global"><strong>Administração da plataforma</strong><span className="muted small">Acesso global {mfa?.verified ? '· MFA confirmado ' : ''}· toda ação exige motivo e é auditada</span><span className="muted small" style={{ marginLeft: 'auto' }}>{email}</span><a href="/">Sair da administração</a></div>
    <main className="content" id="conteudo" style={{ maxWidth: '80rem', margin: '0 auto' }}>
      <div className="page-head"><div><h1>Administração da plataforma</h1><p className="meta">Lojas, alertas, planos versionados e trilha de auditoria.</p></div></div>
      <Feedback error={error} notice={notice} />
      {state === 'loading' ? <Loading label="Verificando acesso de administração…" /> : state === 'anon' ? <Alert tone="warning" role="alert" title="Entre com a conta de administração"><a href="/">Ir para o acesso</a></Alert> : state === 'denied' ? <Alert tone="danger" role="alert" title="Acesso negado">Esta conta não tem o papel de administrador da plataforma. O papel é concedido pelo operador.</Alert> :
      mfa && !mfa.verified ? <section className="surface section stack-sm form-col" aria-labelledby="t-mfa"><h2 id="t-mfa">Confirme o MFA</h2>
        {mfa.enabled ? <form className="cluster" style={{ alignItems: 'end' }} aria-label="Confirmar MFA" onSubmit={(e) => { e.preventDefault(); const b = fields(e.currentTarget); void run(async () => { await api('auth/mfa/verify', 'POST', b); setMfa({ enabled: true, verified: true }); await load(); }, 'MFA confirmado.'); }}><Field label="Código do autenticador">{(a) => <input className="input" name="code" required autoComplete="one-time-code" {...a} />}</Field><button className="btn btn-primary" disabled={busy}>Confirmar</button></form> :
          <p>Ative o MFA na Operação da sua loja (ou peça ao operador) antes de administrar a plataforma.</p>}</section> : <>
        <nav aria-label="Seções da administração"><ul className="subnav"><li><a href="#lojas">Lojas</a></li><li><a href="#alertas">Alertas e cobrança</a></li><li><a href="#planos">Planos</a></li><li><a href="#auditoria">Auditoria</a></li></ul></nav>
        {inspect && <section className="context-inspect" aria-labelledby="t-inspect">
          <div className="cluster" style={{ justifyContent: 'space-between' }}><h2 id="t-inspect" style={{ fontSize: 'var(--font-size-16)' }}>Inspecionando: {inspect.tenant.name} <span className="muted">({inspect.tenant.slug})</span></h2><button className="btn btn-quiet btn-sm" onClick={() => setInspect(null)}>Fechar consulta</button></div>
          <p className="caption">Consulta auditada em {formatDateTime(inspect.at)} · motivo: “{inspect.reason}”</p>
          <dl className="summary small">
            <dt>Ciclo</dt><dd><StatusBadge map={LIFECYCLE} value={inspect.tenant.lifecycle_status} /></dd>
            <dt>Vendas</dt><dd>{inspect.data.status?.suspended ? 'Suspensa' : inspect.data.status?.sales_paused ? 'Pausadas pelo Dono' : 'Recebendo pedidos'}</dd>
            <dt>Pendências financeiras</dt><dd className="num">{inspect.data.status?.financial_incidents ?? '—'}</dd>
            <dt>Pagamentos incertos</dt><dd className="num">{inspect.data.status?.payment_uncertain ?? '—'}</dd>
            <dt>Protocolos atrasados</dt><dd className="num">{inspect.data.status?.support_overdue ?? '—'}</dd>
            <dt>Plano</dt><dd>{inspect.data.billing?.plan ? `${inspect.data.billing.plan.name} (${inspect.data.billing.plan.code} v${inspect.data.billing.plan.version})` : '—'} {inspect.data.billing?.subscription && <StatusBadge map={SUBSCRIPTION} value={inspect.data.billing.subscription.status} />}</dd>
            {inspect.data.billing?.usage && <><dt>Uso</dt><dd>{String(inspect.data.billing.usage.active_products)} produtos ativos · {String(inspect.data.billing.usage.members)} integrantes · {bytes(Number(inspect.data.billing.usage.media_bytes ?? 0))} de mídia</dd></>}
            <dt>Alertas</dt><dd>{inspect.data.status?.alerts?.length ? inspect.data.status.alerts.map((a) => `${ALERT_TITLE[a.code] ?? a.code} (${a.value})`).join(', ') : 'Nenhum'}</dd>
          </dl>
          <details className="disclosure small"><summary>Dados completos da consulta</summary><pre className="prose mono">{JSON.stringify(inspect.data, null, 2)}</pre></details>
        </section>}
        <section className="stack-sm" id="lojas" aria-labelledby="t-tenants"><h2 id="t-tenants">Lojas</h2>
          {tenants.length === 0 ? <EmptyState icon="store" title="Nenhuma loja cadastrada" /> : <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Loja</th><th scope="col">Ciclo</th><th scope="col">Plano</th><th scope="col">Assinatura</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{tenants.map((t) => <tr key={t.tenant_id} className={inspect?.tenant.tenant_id === t.tenant_id ? 'is-selected' : undefined}><td className="primary"><strong>{t.name}</strong><span className="cell-sub">{t.slug}</span></td><td data-label="Ciclo"><StatusBadge map={LIFECYCLE} value={t.lifecycle_status} /></td><td data-label="Plano">{t.subscription.plan}</td><td data-label="Assinatura"><StatusBadge map={SUBSCRIPTION} value={t.subscription.status} /></td>
              <td data-label="Ações"><span className="cluster-tight"><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setPending({ kind: 'view', tenant: t })} aria-label={`Consultar ${t.name} (${t.slug})`}>Consultar…</button>{t.lifecycle_status === 'SUSPENDED' ? <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setPending({ kind: 'reactivate', tenant: t })} aria-label={`Reativar ${t.name} (${t.slug})`}>Reativar…</button> : <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setPending({ kind: 'suspend', tenant: t })} aria-label={`Suspender ${t.name} (${t.slug})`}>Suspender…</button>}</span></td></tr>)}</tbody></table></div>}
        </section>
        <section className="surface section stack-sm" id="alertas" aria-labelledby="t-alerts"><h2 id="t-alerts">Alertas por loja</h2>
          {alerts.length === 0 ? <p className="small muted">Nenhum alerta ativo nas lojas.</p> : <ul className="stack-sm" style={{ listStyle: 'none' }}>{alerts.map((a) => <li key={a.slug} className="cluster-tight"><strong>{a.slug}</strong>{a.alerts.map((x) => <Badge key={x.code} tone="warning">{ALERT_TITLE[x.code] ?? x.code}</Badge>)}</li>)}</ul>}
          <div><button className="btn btn-secondary" disabled={busy} onClick={() => setPending({ kind: 'billing' })}>Executar ciclo de cobrança agora…</button></div>
        </section>
        <section className="stack-sm" id="planos" aria-labelledby="t-plans"><h2 id="t-plans">Planos (versões imutáveis)</h2>
          <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Versão</th><th scope="col">Situação</th><th scope="col" className="num">Preço</th><th scope="col">Limites</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{plans.map((pl) => <tr key={pl.id}><td className="primary"><strong>{pl.code} v{pl.version}</strong><span className="cell-sub">{pl.name} · {INTERVAL[pl.billing_interval] ?? pl.billing_interval}</span></td><td data-label="Situação"><StatusBadge map={PLAN_STATUS} value={pl.status} /></td><td className="num" data-label="Preço">{pl.price_cents ? <span className="money">{money(pl.price_cents)}</span> : <span className="muted">sem preço</span>}</td>
              <td data-label="Limites" className="small">{String(pl.entitlements.active_products ?? '—')} produtos · {String(pl.entitlements.active_variants ?? '—')} variações · {pl.entitlements.media_bytes ? bytes(Number(pl.entitlements.media_bytes)) : '—'} · {String(pl.entitlements.members ?? '—')} pessoas</td>
              <td data-label="Ações">{pl.status !== 'RETIRED' && pl.code !== 'PILOT' ? <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setPending({ kind: 'plan', plan: pl, to: pl.status === 'DRAFT' ? 'activate' : 'retire' })}>{pl.status === 'DRAFT' ? 'Ativar…' : 'Aposentar…'}</button> : <span className="muted small">{label(PLAN_STATUS, pl.status)}</span>}</td></tr>)}</tbody></table></div>
          <details className="disclosure"><summary>Criar nova versão de plano (rascunho)</summary>
            <form className="form form-col" aria-label="Nova versão de plano" onSubmit={submit((b) => api('platform/plans', 'POST', { code: b.code, name: b.name, billing_interval: 'MONTH', price_cents: b.price_cents || null, reason: b.reason, entitlements: { active_products: Number(b.active_products), active_variants: Number(b.active_variants), media_bytes: Number(b.media_mb) * 1048576, members: Number(b.members), media_mode: 'STRICT' } }), 'Versão criada como rascunho.')}>
              <div className="form-grid"><Field label="Código" hint="Maiúsculas, ex.: BASICO">{(a) => <input className="input" name="code" required pattern="[A-Z][A-Z0-9_]{1,30}" {...a} />}</Field><Field label="Nome">{(a) => <input className="input" name="name" required {...a} />}</Field></div>
              <Field label="Preço mensal em centavos" optional hint="Deixe vazio até a decisão comercial (D07).">{(a) => <input className="input" name="price_cents" pattern="[0-9]*" inputMode="numeric" {...a} />}</Field>
              <div className="form-grid"><Field label="Produtos ativos">{(a) => <input className="input" name="active_products" type="number" min={1} required defaultValue={100} {...a} />}</Field><Field label="Variações ativas">{(a) => <input className="input" name="active_variants" type="number" min={1} required defaultValue={500} {...a} />}</Field><Field label="Mídia (MB)">{(a) => <input className="input" name="media_mb" type="number" min={1} required defaultValue={1024} {...a} />}</Field><Field label="Equipe (pessoas)">{(a) => <input className="input" name="members" type="number" min={1} required defaultValue={2} {...a} />}</Field></div>
              <Field label="Motivo">{(a) => <input className="input" name="reason" required minLength={3} {...a} />}</Field>
              <div><button className="btn btn-secondary" disabled={busy}>Criar rascunho</button></div>
            </form></details>
        </section>
        <section className="stack-sm" id="auditoria" aria-labelledby="t-audit"><h2 id="t-audit">Auditoria</h2>
          {audit.length === 0 ? <p className="small muted">Nenhuma ação registrada.</p> : <div className="table-wrap"><table className="data stack"><caption>Últimas 100 ações administrativas.</caption><thead><tr><th scope="col">Data</th><th scope="col">Administrador</th><th scope="col">Ação</th><th scope="col">Motivo</th></tr></thead>
            <tbody>{audit.map((a, i) => <tr key={i}><td className="primary">{formatDateTime(a.created_at)}</td><td data-label="Administrador">{a.admin}</td><td data-label="Ação">{ACTION[a.action] ?? a.action}</td><td data-label="Motivo">{a.reason}</td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </main>
    <ConfirmDialog open={!!pending} title={dialogTitle} description={<p>{dialogText}</p>} confirmLabel={!pending ? '' : pending.kind === 'view' ? 'Consultar' : pending.kind === 'suspend' ? 'Suspender loja' : pending.kind === 'reactivate' ? 'Reativar loja' : pending.kind === 'plan' ? (pending.to === 'activate' ? 'Ativar plano' : 'Aposentar plano') : 'Executar ciclo'} tone={pending?.kind === 'suspend' ? 'danger' : 'primary'} busy={busy}
      onClose={() => setPending(null)} onConfirm={confirm}><Field label="Motivo (registrado na auditoria)">{(a) => <input className="input" name="reason" required minLength={3} maxLength={500} {...a} />}</Field></ConfirmDialog>
  </div>;
}
