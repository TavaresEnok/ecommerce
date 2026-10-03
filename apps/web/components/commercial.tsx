'use client';
// Seções do Dono na Operação (Fase 6): MFA, plano e faturas, domínio próprio e transportadora. Mesmos endpoints de antes;
// ações sensíveis continuam exigindo MFA confirmado nesta sessão no servidor.
import { type FormEvent, useEffect, useState } from 'react';
import { call, fields, useAction } from './panel/api';
import { Alert, ConfirmDialog, CopyButton, Feedback, Field, StatusBadge } from './ui/kit';
import { DOMAIN, INVOICE, SUBSCRIPTION } from './ui/status';
import { bytes, formatDate, money } from './ui/format';

type Plan = { id: string; code: string; version: number; name: string; price_cents: string | null; billing_interval: string; entitlements: Record<string, number | string> };
type Billing = { subscription: { status: string; current_period_end: string | null; cancel_at_period_end: boolean; grace_until: string | null }; plan: Plan; pending_plan: Plan | null; invoices: { id: string; period_start: string; amount_cents: string; status: string; due_at: string }[]; usage: Record<string, number | string>; available_plans: Plan[] };
type Domain = { id: string; hostname: string; status: string; canonical: boolean; failure_reason: string | null; challenge: { name: string; type: string; value: string } };

export function CommercialSections({ tenantId, csrf }: { tenantId: string; csrf: string }) {
  const [mfa, setMfa] = useState<{ enabled: boolean; verified: boolean } | null>(null), [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null), [codes, setCodes] = useState<string[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null), [domains, setDomains] = useState<Domain[]>([]), [remove, setRemove] = useState<Domain | null>(null), [cancelPlan, setCancelPlan] = useState(false);
  const { busy, error, notice, run } = useAction();
  const api = (path: string, method = 'GET', body?: unknown) => call(path, { method, body, csrf });
  async function load() { const s = await api('auth/session'); setMfa(s.mfa); setBilling(await api(`tenants/${tenantId}/billing`)); setDomains(await api(`tenants/${tenantId}/domains`)); }
  const act = (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await load(); }, done);
  const submit = (task: (b: Record<string, string>) => Promise<unknown>, done: string) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void act(async () => { await task(b); f.reset(); }, done); };
  useEffect(() => { if (csrf) void load().catch(() => undefined); }, [csrf, tenantId]);
  const ent = billing?.plan.entitlements, usage = billing?.usage;
  return <>
    <Feedback error={error} notice={notice} />
    <section className="surface section stack-sm" id="seguranca" aria-label="Verificação em duas etapas">
      <h2>Verificação em duas etapas (MFA)</h2>
      {!mfa ? <p className="small" role="status">Carregando…</p> : mfa.enabled ? <>
        <p className="small">MFA ativo · {mfa.verified ? 'confirmado nesta sessão' : 'confirme para ações financeiras, de plano e de domínio'}.</p>
        {!mfa.verified && <form className="cluster" style={{ alignItems: 'end' }} aria-label="Confirmar MFA" onSubmit={submit((b) => api('auth/mfa/verify', 'POST', b), 'MFA confirmado nesta sessão.')}><Field label="Código do autenticador ou de recuperação">{(a) => <input className="input" name="code" required autoComplete="one-time-code" {...a} />}</Field><button className="btn btn-primary" disabled={busy}>Confirmar</button></form>}
      </> : setup ? <form className="form form-col" aria-label="Ativar MFA" onSubmit={submit(async (b) => { const r = await api('auth/mfa/enable', 'POST', b); setCodes(r.recovery_codes); setSetup(null); }, 'MFA ativado.')}>
        <p className="small">Cadastre esta chave no aplicativo autenticador e informe o código de 6 dígitos gerado.</p>
        <div className="copyable"><code>{setup.secret}</code><CopyButton value={setup.secret} label="Copiar chave" /></div>
        <details className="disclosure small"><summary>Endereço otpauth (para aplicativos que aceitam colar)</summary><code>{setup.otpauth}</code></details>
        <Field label="Código">{(a) => <input className="input" name="code" required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" {...a} />}</Field>
        <div><button className="btn btn-primary" disabled={busy}>Ativar</button></div>
      </form> : <><p className="small">Obrigatório para devoluções pela plataforma, plano, domínio e administração.</p><div><button className="btn btn-primary" disabled={busy} onClick={() => void act(async () => setSetup(await api('auth/mfa/setup', 'POST')), 'Chave gerada.')}>Configurar MFA</button></div></>}
      {codes.length > 0 && <Alert tone="warning" title="Códigos de recuperação"><p>Uso único. Guarde agora: eles não serão exibidos de novo.</p><ul className="cluster-tight" style={{ listStyle: 'none', marginTop: 'var(--space-8)' }}>{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul></Alert>}
    </section>
    {billing && <section className="surface section stack-sm" id="plano" aria-label="Plano e faturas">
      <div className="section-head" style={{ marginBottom: 0 }}><h2>Plano e faturas</h2><StatusBadge map={SUBSCRIPTION} value={billing.subscription.status} /></div>
      <p><strong>{billing.plan.name}</strong> <span className="muted small">({billing.plan.code} v{billing.plan.version}){billing.subscription.current_period_end ? ` · período até ${formatDate(billing.subscription.current_period_end)}` : ''}{billing.subscription.cancel_at_period_end ? ' · cancelamento ao fim do período' : ''}{billing.pending_plan ? ` · muda para ${billing.pending_plan.name} no próximo ciclo` : ''}</span></p>
      {billing.subscription.status === 'PAST_DUE' && <Alert tone="warning" title="Fatura em atraso">Tolerância até {billing.subscription.grace_until ? formatDate(billing.subscription.grace_until) : '—'}; depois, novas vendas são bloqueadas (pedidos existentes continuam).</Alert>}
      {ent && usage && <dl className="summary small"><dt>Produtos ativos</dt><dd className="num">{String(usage.active_products)} de {String(ent.active_products)}</dd><dt>Variações ativas</dt><dd className="num">{String(usage.active_variants)} de {String(ent.active_variants)}</dd><dt>Equipe</dt><dd className="num">{String(usage.members)} de {String(ent.members)}</dd><dt>Mídia</dt><dd className="num">{bytes(Number(usage.media_bytes))} de {bytes(Number(ent.media_bytes))} ({String(ent.media_mode) === 'STRICT' ? 'cota rigorosa' : 'tolerância do piloto'})</dd></dl>}
      {billing.available_plans.length === 0 ? <p className="small muted">Nenhum plano pago publicado pela plataforma. O preço depende de decisão comercial (D07).</p> :
        <form className="cluster" style={{ alignItems: 'end' }} aria-label="Trocar plano" onSubmit={submit((b) => api(`tenants/${tenantId}/billing/plan`, 'POST', b), 'Plano atualizado; vale no próximo ciclo.')}><Field label="Plano">{(a) => <select className="select" name="plan_version_id" {...a}>{billing.available_plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name} — {pl.price_cents ? money(pl.price_cents) : 'sem preço'}/mês</option>)}</select>}</Field><button className="btn btn-secondary" disabled={busy}>Contratar ou trocar (próximo ciclo)</button></form>}
      {billing.subscription.current_period_end && !billing.subscription.cancel_at_period_end && <div><button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setCancelPlan(true)}>Cancelar ao fim do período…</button></div>}
      <h3>Faturas</h3>
      {billing.invoices.length === 0 ? <p className="small muted">Nenhuma fatura.</p> : <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Período</th><th scope="col" className="num">Valor</th><th scope="col">Vencimento</th><th scope="col">Situação</th></tr></thead><tbody>{billing.invoices.map((i) => <tr key={i.id}><td className="primary">{formatDate(i.period_start)}</td><td className="num" data-label="Valor"><span className="money">{money(i.amount_cents)}</span></td><td data-label="Vencimento">{formatDate(i.due_at)}</td><td data-label="Situação"><StatusBadge map={INVOICE} value={i.status} /></td></tr>)}</tbody></table></div>}
    </section>}
    <section className="surface section stack-sm" id="dominio" aria-label="Domínio próprio">
      <h2>Domínio próprio</h2>
      <ol className="steps-list small"><li><span>Cadastre o endereço (hostname).</span></li><li><span>No seu provedor de DNS, crie o registro TXT indicado e um CNAME para o endereço da plataforma.</span></li><li><span>Clique em verificar. O domínio só fica ativo quando o HTTPS entrega esta loja.</span></li></ol>
      <form className="cluster" style={{ alignItems: 'end' }} aria-label="Cadastrar domínio" onSubmit={submit((b) => api(`tenants/${tenantId}/domains`, 'POST', b), 'Domínio cadastrado; configure o DNS.')}><Field label="Hostname">{(a) => <input className="input" name="hostname" required maxLength={253} placeholder="www.minhaloja.com.br" {...a} />}</Field><button className="btn btn-secondary" disabled={busy}>Cadastrar</button></form>
      {domains.length > 0 && <ul className="stack" style={{ listStyle: 'none' }}>{domains.map((d) => <li key={d.id} className="stack-sm" style={{ borderTop: '1px solid var(--_border)', paddingTop: 'var(--space-12)' }}>
        <div className="cluster-tight"><strong>{d.hostname}</strong><StatusBadge map={DOMAIN} value={d.status} />{d.canonical && <span className="badge badge-success">Endereço principal</span>}</div>
        {d.failure_reason && <p className="error-text">{d.failure_reason}</p>}
        {d.status !== 'ACTIVE' && <dl className="summary small"><dt>Registro TXT</dt><dd><span className="copyable"><code>{d.challenge.name}</code><CopyButton value={d.challenge.name} label="Copiar nome" /></span></dd><dt>Valor</dt><dd><span className="copyable"><code>{d.challenge.value}</code><CopyButton value={d.challenge.value} label="Copiar valor" /></span></dd></dl>}
        <div className="cluster-tight">{d.status !== 'ACTIVE' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => api(`tenants/${tenantId}/domains/${d.id}/verify`, 'POST'), 'Verificação executada.')}>Verificar</button>}{d.status === 'ACTIVE' && !d.canonical && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => api(`tenants/${tenantId}/domains/${d.id}/canonical`, 'POST'), 'Endereço principal definido.')}>Tornar endereço principal</button>}<button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setRemove(d)}>Remover…</button></div>
      </li>)}</ul>}
    </section>
    <section className="surface section stack-sm" id="transportadora" aria-label="Transportadora">
      <h2>Transportadora (cotação integrada)</h2>
      <p className="small muted">Provedor real ainda não homologado (D09); neste ambiente só existe o simulador. Os produtos precisam de peso e dimensões.</p>
      <form className="form form-col" aria-label="Configurar transportadora" onSubmit={submit((b) => api(`tenants/${tenantId}/operations/carrier`, 'POST', { origin_cep: b.origin_cep, enabled: b.enabled === 'true', provider: 'SIMULATED' }), 'Transportadora configurada.')}>
        <div className="form-grid"><Field label="CEP de origem">{(a) => <input className="input" name="origin_cep" required inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" {...a} />}</Field><Field label="Situação">{(a) => <select className="select" name="enabled" {...a}><option value="true">Ativa</option><option value="false">Desativada</option></select>}</Field></div>
        <div><button className="btn btn-secondary" disabled={busy}>Salvar</button></div>
      </form>
    </section>
    <ConfirmDialog open={!!remove} title={`Remover o domínio ${remove?.hostname ?? ''}?`} description={<p>O endereço deixa de levar à loja. Para usá-lo de novo será preciso nova verificação.</p>} confirmLabel="Remover domínio" busy={busy}
      onClose={() => setRemove(null)} onConfirm={() => void act(async () => { await api(`tenants/${tenantId}/domains/${remove!.id}/disable`, 'POST'); setRemove(null); }, 'Domínio removido.')} />
    <ConfirmDialog open={cancelPlan} title="Cancelar o plano ao fim do período?" description={<p>A loja continua no plano atual até o fim do período contratado. Pedidos e dados são preservados.</p>} confirmLabel="Agendar cancelamento" busy={busy}
      onClose={() => setCancelPlan(false)} onConfirm={() => void act(async () => { await api(`tenants/${tenantId}/billing/cancel`, 'POST'); setCancelPlan(false); }, 'Cancelamento agendado para o fim do período.')} />
  </>;
}
