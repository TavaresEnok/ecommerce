'use client';
// Configurações da loja por tarefa (UX03): cada destino carrega só os próprios dados e salva pela mesma API de antes.
// Itens do Dono continuam protegidos no servidor; aqui o Funcionário vê explicação em vez de formulário.
import Link from 'next/link';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { call, fields, useAction } from './api';
import { usePanel } from './Shell';
import { Alert, Badge, ConfirmDialog, CopyButton, EmptyState, Feedback, Field, Loading, MoneyInput, PageHeader, StatusBadge, useLeaveGuard, useTitle } from '../ui/kit';
import { DOMAIN, INVOICE, SUBSCRIPTION } from '../ui/status';
import { bytes, formatDate, money, toCents } from '../ui/format';
import { AiDraftSection } from '../ai-draft';

type Plan = { id: string; code: string; version: number; name: string; price_cents: string | null; billing_interval: string; entitlements: Record<string, number | string> };
type Billing = { subscription: { status: string; current_period_end: string | null; cancel_at_period_end: boolean; grace_until: string | null }; plan: Plan; pending_plan: Plan | null; invoices: { id: string; period_start: string; amount_cents: string; status: string; due_at: string }[]; usage: Record<string, number | string>; available_plans: Plan[] };
type Domain = { id: string; hostname: string; status: string; canonical: boolean; failure_reason: string | null; challenge: { name: string; type: string; value: string } };
type Shipping = { id: string; name: string; kind: string; price_cents: string; cep_start?: string | null; cep_end?: string | null; days?: number; priority?: number };

function OwnerOnly({ what }: { what: string }) {
  return <Alert tone="info" title="Somente o Dono altera esta área">{what} são definidos pelo Dono da loja. Peça a ele se algo precisar mudar.</Alert>;
}
const cep = (v?: string | null) => v ? `${v.slice(0, 5)}-${v.slice(5)}` : '?';

// ---------- Dados da loja (fornecedor, contato e políticas exibidos na loja e no comprovante) ----------
export function StoreDataSettings() {
  const p = usePanel(), { busy, error, notice, run } = useAction(), [profile, setProfile] = useState<Record<string, unknown> | null>(null), [settings, setSettings] = useState<{ displayName: string; timezone: string } | null>(null), [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty && !busy);
  useTitle('Dados da loja');
  const load = useCallback(async () => { const [s, t] = await Promise.all([call(`tenants/${p.tenantId}/storefront`, { csrf: p.csrf }), call(`tenants/${p.tenantId}/settings`, { csrf: p.csrf })]); setProfile((s.profile?.profile ?? {}) as Record<string, unknown>); setSettings(t); }, [p.tenantId, p.csrf]);
  useEffect(() => { void load().catch(() => setProfile({})); }, [load]);
  if (!profile || !settings) return <Loading label="Carregando dados da loja…" />;
  const v = (k: string) => String(profile[k] ?? '');
  return <>
    {guard}
    <PageHeader title="Dados da loja" meta="Quem vende, como falar com a loja e as políticas. Aparecem no rodapé da loja e em cada comprovante." />
    <Feedback error={error} notice={notice} />
    {!p.owner ? <OwnerOnly what="Os dados da loja" /> : <>
      <section className="surface section stack-sm" aria-labelledby="t-name">
        <h2 id="t-name">Nome e fuso</h2>
        <form className="form form-col" aria-label="Configuração" onSubmit={(e) => { e.preventDefault(); const b = fields(e.currentTarget); void run(async () => { setSettings(await call(`tenants/${p.tenantId}/settings`, { method: 'PATCH', body: b, csrf: p.csrf })); await p.refresh(); }, 'Nome e fuso salvos.'); }}>
          <div className="form-grid">
            <Field label="Nome de exibição">{(a) => <input className="input" name="displayName" defaultValue={settings.displayName} maxLength={100} required {...a} />}</Field>
            <Field label="Fuso horário" hint="Usado em datas de pedidos e prazos.">{(a) => <select className="select" name="timezone" defaultValue={settings.timezone} {...a}>{['America/Sao_Paulo', 'America/Manaus', 'America/Recife', 'America/Fortaleza', 'America/Belem', 'America/Rio_Branco', 'America/Cuiaba', 'UTC'].map((z) => <option key={z}>{z}</option>)}</select>}</Field>
          </div>
          <div><button className="btn btn-secondary" disabled={busy}>Salvar nome e fuso</button></div>
        </form>
      </section>
      <section className="surface section stack-sm" aria-labelledby="t-supplier">
        <div className="section-head"><h2 id="t-supplier">Identificação e políticas</h2>{dirty && <p className="dirty" role="status">Alterações não salvas</p>}</div>
        <p className="small muted">Exigido para vender ao consumidor (identificação do fornecedor e atendimento). A loja só é publicada com estes dados completos.</p>
        <form className="form form-col" aria-label="Perfil do fornecedor" onChange={() => setDirty(true)} onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const b = fields(e.currentTarget); void run(async () => { await call(`tenants/${p.tenantId}/storefront/profile`, { method: 'POST', body: { ...b, synthetic: b.synthetic === 'on' }, csrf: p.csrf }); setDirty(false); await load(); }, 'Dados da loja salvos.'); }}>
          <label className="check"><input name="synthetic" type="checkbox" defaultChecked={profile.synthetic !== false} /><span>Loja de teste <span className="muted small">(mostra aviso de loja fictícia e exige “TESTE” no nome)</span></span></label>
          <Field label="Nome do fornecedor" hint="Razão social ou nome de quem vende.">{(a) => <input className="input" name="name" defaultValue={v('name')} required {...a} />}</Field>
          <Field label="CPF ou CNPJ" optional hint="Obrigatório em lojas reais; deixe vazio em lojas de teste.">{(a) => <input className="input" name="document" defaultValue={v('document')} inputMode="numeric" {...a} />}</Field>
          <Field label="Endereço físico">{(a) => <input className="input" name="address" defaultValue={v('address')} required {...a} />}</Field>
          <div className="form-grid"><Field label="E-mail de atendimento">{(a) => <input className="input" name="email" type="email" defaultValue={v('email')} required {...a} />}</Field><Field label="Telefone">{(a) => <input className="input" name="phone" defaultValue={v('phone')} required autoComplete="tel" {...a} />}</Field></div>
          <Field label="Entrega e restrições" hint="Onde entrega, prazos gerais e o que não envia.">{(a) => <input className="input" name="delivery" defaultValue={v('delivery')} required {...a} />}</Field>
          <Field label="Cuidados e riscos dos produtos" optional>{(a) => <input className="input" name="risks" defaultValue={v('risks')} {...a} />}</Field>
          <Field label="Políticas de troca, arrependimento e privacidade">{(a) => <textarea className="textarea" name="policies" defaultValue={v('policies')} required rows={6} {...a} />}</Field>
          <div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados da loja'}</button></div>
        </form>
      </section>
    </>}
  </>;
}

// ---------- Entregas: regras locais + transportadora ----------
export function DeliverySettings() {
  const p = usePanel(), { busy, error, notice, run } = useAction(), [rules, setRules] = useState<Shipping[] | null>(null), [kind, setKind] = useState('TABLE'), [priceError, setPriceError] = useState('');
  useTitle('Entregas');
  const load = useCallback(async () => setRules((await call(`tenants/${p.tenantId}/storefront`, { csrf: p.csrf })).shipping), [p.tenantId, p.csrf]);
  useEffect(() => { void load().catch(() => setRules([])); }, [load]);
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, b = fields(form), cents = toCents(b.price_cents || '0');
    if (cents === null) { setPriceError('Informe o valor em reais, por exemplo 15,00 (0,00 para grátis).'); return; }
    setPriceError('');
    void run(async () => { await call(`tenants/${p.tenantId}/storefront/shipping`, { method: 'POST', csrf: p.csrf, body: { name: b.name, kind, ...(kind === 'TABLE' ? { cep_start: b.cep_start.replace('-', ''), cep_end: b.cep_end.replace('-', '') } : {}), price_cents: cents, days: Number(b.days), priority: Number(b.priority) } }); form.reset(); await load(); }, 'Forma de entrega criada.');
  }
  return <>
    <PageHeader title="Entregas" meta="Retirada e entrega por faixa de CEP. Um CEP fora das faixas não recebe entrega; nunca vira frete grátis." />
    <Feedback error={error} notice={notice} />
    <section className="surface section stack-sm" aria-labelledby="t-rules">
      <h2 id="t-rules">Formas de entrega</h2>
      {!rules ? <Loading /> : rules.length === 0 ? <EmptyState icon="truck" title="Nenhuma forma de entrega">Sem ao menos uma forma, o comprador não consegue concluir a compra.</EmptyState> :
        <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Forma</th><th scope="col">Onde vale</th><th scope="col" className="num">Valor</th><th scope="col" className="num">Prazo</th><th scope="col" className="num">Prioridade</th></tr></thead>
          <tbody>{rules.map((s) => <tr key={s.id}><td className="primary">{s.name}</td><td data-label="Onde vale">{s.kind === 'PICKUP' ? 'Retirada na loja' : `CEP ${cep(s.cep_start)} a ${cep(s.cep_end)}`}</td><td className="num" data-label="Valor"><span className="money">{BigInt(s.price_cents) === 0n ? 'Grátis' : money(s.price_cents)}</span></td><td className="num" data-label="Prazo">{s.days ?? 0} {s.days === 1 ? 'dia' : 'dias'}</td><td className="num" data-label="Prioridade">{s.priority ?? 0}</td></tr>)}</tbody></table></div>}
    </section>
    {!p.owner ? <OwnerOnly what="Formas de entrega e transportadora" /> : <>
      <section className="surface section stack-sm" aria-labelledby="t-ship"><h2 id="t-ship">Nova forma de entrega</h2>
        <form className="form form-col" aria-label="Criar frete" onSubmit={create}>
          <fieldset><legend>Tipo</legend><div className="cluster"><label className="check"><input type="radio" name="kind-ui" checked={kind === 'TABLE'} onChange={() => setKind('TABLE')} /> Entrega por faixa de CEP</label><label className="check"><input type="radio" name="kind-ui" checked={kind === 'PICKUP'} onChange={() => setKind('PICKUP')} /> Retirada na loja</label></div></fieldset>
          <Field label="Nome mostrado ao comprador" hint="Por exemplo “Entrega Grande SP” ou “Retirar no ateliê”.">{(a) => <input className="input" name="name" required {...a} />}</Field>
          {kind === 'TABLE' && <div className="form-grid"><Field label="CEP inicial">{(a) => <input className="input" name="cep_start" inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" required autoComplete="off" {...a} />}</Field><Field label="CEP final">{(a) => <input className="input" name="cep_end" inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" required autoComplete="off" {...a} />}</Field></div>}
          <div className="form-grid"><Field label="Valor" error={priceError} hint="0,00 para grátis.">{(a) => <MoneyInput name="price_cents" a11y={a} required />}</Field><Field label="Prazo em dias">{(a) => <input className="input" name="days" type="number" min={0} defaultValue={3} required {...a} />}</Field><Field label="Prioridade" hint="Vence a maior quando faixas se sobrepõem.">{(a) => <input className="input" name="priority" type="number" defaultValue={0} required {...a} />}</Field></div>
          <div><button className="btn btn-secondary" disabled={busy}>Criar forma de entrega</button></div>
        </form>
      </section>
      <section className="surface section stack-sm" id="transportadora" aria-label="Transportadora">
        <h2>Cotação por transportadora</h2>
        <p className="small muted">Neste ambiente a cotação é simulada; nenhuma transportadora real é contratada. Os produtos precisam ter peso e medidas nas variações.</p>
        <form className="form form-col" aria-label="Configurar transportadora" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void run(async () => { await call(`tenants/${p.tenantId}/operations/carrier`, { method: 'POST', csrf: p.csrf, body: { origin_cep: b.origin_cep, enabled: b.enabled === 'true', provider: 'SIMULATED' } }); f.reset(); }, 'Transportadora configurada.'); }}>
          <div className="form-grid"><Field label="CEP de origem">{(a) => <input className="input" name="origin_cep" required inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" {...a} />}</Field><Field label="Situação">{(a) => <select className="select" name="enabled" {...a}><option value="true">Ativa</option><option value="false">Desativada</option></select>}</Field></div>
          <div><button className="btn btn-secondary" disabled={busy}>Salvar</button></div>
        </form>
      </section>
    </>}
  </>;
}

// ---------- Domínio próprio ----------
export function DomainSettings() {
  const p = usePanel(), { busy, error, notice, run } = useAction(), [domains, setDomains] = useState<Domain[] | null>(null), [remove, setRemove] = useState<Domain | null>(null);
  useTitle('Domínio');
  const api = (path: string, method = 'GET', body?: unknown) => call(path, { method, body, csrf: p.csrf });
  const load = useCallback(async () => setDomains(await call(`tenants/${p.tenantId}/domains`, { csrf: p.csrf })), [p.tenantId, p.csrf]);
  useEffect(() => { void load().catch(() => setDomains([])); }, [load]);
  const act = (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await load(); }, done);
  return <>
    <PageHeader title="Domínio próprio" meta={<>Hoje a loja abre em <a href={`/lojas/${p.store.slug}`}>/lojas/{p.store.slug}</a>. Com um domínio próprio, o comprador digita o seu endereço.</>} />
    <Feedback error={error} notice={notice} />
    {!p.owner ? <OwnerOnly what="Domínios" /> : <>
      <MfaNote />
      <section className="surface section stack-sm" id="dominio" aria-label="Domínio próprio">
        <h2>Conectar um domínio</h2>
        <ol className="steps-list small"><li><span>Informe o endereço, por exemplo www.minhaloja.com.br.</span></li><li><span>No provedor do domínio, crie o registro TXT mostrado e um CNAME apontando para a plataforma.</span></li><li><span>Volte e clique em Verificar. O domínio fica ativo quando a loja abre por ele com HTTPS.</span></li></ol>
        <form className="cluster" style={{ alignItems: 'end' }} aria-label="Cadastrar domínio" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void act(async () => { await api(`tenants/${p.tenantId}/domains`, 'POST', b); f.reset(); }, 'Domínio cadastrado. Agora configure o DNS.'); }}><Field label="Endereço do domínio">{(a) => <input className="input" name="hostname" required maxLength={253} placeholder="www.minhaloja.com.br" autoComplete="off" {...a} />}</Field><button className="btn btn-secondary" disabled={busy}>Cadastrar</button></form>
      </section>
      {domains && domains.length > 0 && <section className="surface section stack-sm" aria-labelledby="t-domains"><h2 id="t-domains">Seus domínios</h2>
        <ul className="stack" style={{ listStyle: 'none' }}>{domains.map((d) => <li key={d.id} className="stack-sm domain-item">
          <div className="cluster-tight"><strong>{d.hostname}</strong><StatusBadge map={DOMAIN} value={d.status} />{d.canonical && <Badge tone="success">Endereço principal</Badge>}</div>
          {d.failure_reason && <p className="error-text">{d.failure_reason}</p>}
          {d.status !== 'ACTIVE' && <dl className="summary small"><dt>Nome do registro TXT</dt><dd><span className="copyable"><code>{d.challenge.name}</code><CopyButton value={d.challenge.name} label="Copiar nome" /></span></dd><dt>Valor do registro</dt><dd><span className="copyable"><code>{d.challenge.value}</code><CopyButton value={d.challenge.value} label="Copiar valor" /></span></dd></dl>}
          <div className="cluster-tight">{d.status !== 'ACTIVE' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => api(`tenants/${p.tenantId}/domains/${d.id}/verify`, 'POST'), 'Verificação feita.')}>Verificar</button>}{d.status === 'ACTIVE' && !d.canonical && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => api(`tenants/${p.tenantId}/domains/${d.id}/canonical`, 'POST'), 'Endereço principal definido.')}>Tornar endereço principal</button>}<button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setRemove(d)}>Remover…</button></div>
        </li>)}</ul></section>}
      <ConfirmDialog open={!!remove} title={`Remover o domínio ${remove?.hostname ?? ''}?`} description={<p>O endereço deixa de abrir a loja. Para usá-lo de novo será preciso verificar outra vez.</p>} confirmLabel="Remover domínio" busy={busy}
        onClose={() => setRemove(null)} onConfirm={() => void act(async () => { await api(`tenants/${p.tenantId}/domains/${remove!.id}/disable`, 'POST'); setRemove(null); }, 'Domínio removido.')} />
    </>}
  </>;
}

// Aviso curto para áreas que exigem MFA confirmado (o servidor recusa sem ele).
function MfaNote() {
  const p = usePanel();
  if (p.mfa.verified) return null;
  return <Alert tone="warning" title={p.mfa.enabled ? 'Confirme a verificação em duas etapas' : 'Ative a verificação em duas etapas'}>{p.mfa.enabled ? 'Ações de domínio, plano e devolução pedem o código do autenticador nesta sessão.' : 'Ações de domínio, plano e devolução exigem verificação em duas etapas.'} <Link href={`/painel/${p.tenantId}/configuracoes/seguranca`}>Ir para Segurança</Link></Alert>;
}

// ---------- Segurança (MFA) ----------
export function SecuritySettings() {
  const p = usePanel(), { busy, error, notice, run } = useAction(), [mfa, setMfa] = useState<{ enabled: boolean; verified: boolean } | null>(null), [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null), [codes, setCodes] = useState<string[]>([]);
  useTitle('Segurança');
  const api = (path: string, method = 'GET', body?: unknown) => call(path, { method, body, csrf: p.csrf });
  const load = useCallback(async () => setMfa((await call('auth/session', { csrf: p.csrf })).mfa), [p.csrf]);
  useEffect(() => { void load(); }, [load]);
  const act = (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await load(); await p.refresh(); }, done);
  const submit = (task: (b: Record<string, string>) => Promise<unknown>, done: string) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void act(async () => { await task(b); f.reset(); }, done); };
  return <>
    <PageHeader title="Segurança" meta={<>Conta {p.email}</>} />
    <Feedback error={error} notice={notice} />
    <section className="surface section stack-sm" id="seguranca" aria-label="Verificação em duas etapas">
      <div className="section-head"><h2>Verificação em duas etapas</h2>{mfa && (mfa.enabled ? <Badge tone="success">Ativa</Badge> : <Badge tone="warning">Desativada</Badge>)}</div>
      {!mfa ? <p className="small" role="status">Carregando…</p> : mfa.enabled ? <>
        <p className="small">{mfa.verified ? 'Verificação ativa, código confirmado nesta sessão.' : 'Ativa. Confirme o código para liberar devoluções, plano e domínio nesta sessão.'}</p>
        {!mfa.verified && <form className="cluster" style={{ alignItems: 'end' }} aria-label="Confirmar código de verificação" onSubmit={submit((b) => api('auth/mfa/verify', 'POST', b), 'Verificação confirmada nesta sessão.')}><Field label="Código do autenticador ou de recuperação">{(a) => <input className="input" name="code" required autoComplete="one-time-code" {...a} />}</Field><button className="btn btn-primary" disabled={busy}>Confirmar</button></form>}
      </> : setup ? <form className="form form-col" aria-label="Ativar verificação em duas etapas" onSubmit={submit(async (b) => { const r = await api('auth/mfa/enable', 'POST', b); setCodes(r.recovery_codes); setSetup(null); }, 'Verificação em duas etapas ativada.')}>
        <p className="small">No aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…), adicione uma conta com a chave abaixo e informe o código de 6 dígitos.</p>
        <div className="copyable"><code>{setup.secret}</code><CopyButton value={setup.secret} label="Copiar chave" /></div>
        <details className="disclosure small"><summary>Link para aplicativos que aceitam colar</summary><code>{setup.otpauth}</code></details>
        <Field label="Código">{(a) => <input className="input" name="code" required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" {...a} />}</Field>
        <div><button className="btn btn-primary" disabled={busy}>Ativar</button></div>
      </form> : <><p className="small">Pede um código do celular além da senha. É exigida para devoluções, plano, domínio e administração.</p><div><button className="btn btn-primary" disabled={busy} onClick={() => void act(async () => setSetup(await api('auth/mfa/setup', 'POST')), 'Chave gerada.')}>Ativar verificação em duas etapas</button></div></>}
      {codes.length > 0 && <Alert tone="warning" title="Códigos de recuperação"><p>Cada código vale uma vez. Guarde agora: eles não aparecem de novo.</p><ul className="cluster-tight" style={{ listStyle: 'none', marginTop: 'var(--space-8)' }}>{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul></Alert>}
    </section>
  </>;
}

// ---------- Plano e faturas ----------
export function PlanSettings() {
  const p = usePanel(), { busy, error, notice, run } = useAction(), [billing, setBilling] = useState<Billing | null>(null), [cancelPlan, setCancelPlan] = useState(false), [loadError, setLoadError] = useState('');
  useTitle('Plano e faturas');
  const api = (path: string, method = 'GET', body?: unknown) => call(path, { method, body, csrf: p.csrf });
  const load = useCallback(async () => setBilling(await call(`tenants/${p.tenantId}/billing`, { csrf: p.csrf })), [p.tenantId, p.csrf]);
  useEffect(() => { void load().catch((e) => setLoadError(e.message)); }, [load]);
  const act = (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await load(); }, done);
  const ent = billing?.plan.entitlements, usage = billing?.usage;
  const row = (label: string, used: ReactNode, limit: ReactNode) => <><dt>{label}</dt><dd className="num">{used} de {limit}</dd></>;
  return <>
    <PageHeader title="Plano e faturas" />
    <Feedback error={error} notice={notice} />
    {loadError && <Alert tone="danger" role="alert" title="Não foi possível carregar o plano">{loadError}</Alert>}
    {!p.owner ? <OwnerOnly what="Plano e pagamento da assinatura" /> : !billing ? !loadError && <Loading /> : <>
      <MfaNote />
      <section className="surface section stack-sm" id="plano" aria-label="Plano e faturas">
        <div className="section-head"><h2>{billing.plan.name}</h2><StatusBadge map={SUBSCRIPTION} value={billing.subscription.status} /></div>
        <p className="small muted">{[billing.subscription.current_period_end ? `Período atual até ${formatDate(billing.subscription.current_period_end)}` : null, billing.subscription.cancel_at_period_end ? 'cancelamento agendado para o fim do período' : null, billing.pending_plan ? `passa para ${billing.pending_plan.name} no próximo ciclo` : null].filter(Boolean).join('; ') || 'Sem cobrança recorrente nesta fase.'}</p>
        {billing.subscription.status === 'PAST_DUE' && <Alert tone="warning" title="Fatura em atraso">Pague até {billing.subscription.grace_until ? formatDate(billing.subscription.grace_until) : 'o fim da tolerância'}. Depois disso, novas vendas são bloqueadas; pedidos existentes continuam.</Alert>}
        {ent && usage && <><h3>Uso do plano</h3><dl className="summary small">{row('Produtos ativos', String(usage.active_products), String(ent.active_products))}{row('Variações ativas', String(usage.active_variants), String(ent.active_variants))}{row('Pessoas na equipe', String(usage.members), String(ent.members))}{row('Imagens', bytes(Number(usage.media_bytes)), bytes(Number(ent.media_bytes)))}</dl></>}
        {billing.available_plans.length === 0 ? <p className="small muted">Ainda não há planos pagos para contratar.</p> :
          <form className="cluster" style={{ alignItems: 'end' }} aria-label="Trocar plano" onSubmit={(e) => { e.preventDefault(); const b = fields(e.currentTarget); void act(() => api(`tenants/${p.tenantId}/billing/plan`, 'POST', b), 'Plano atualizado; vale no próximo ciclo.'); }}><Field label="Plano">{(a) => <select className="select" name="plan_version_id" {...a}>{billing.available_plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}: {pl.price_cents ? `${money(pl.price_cents)} por mês` : 'sem preço definido'}</option>)}</select>}</Field><button className="btn btn-secondary" disabled={busy}>Contratar ou trocar no próximo ciclo</button></form>}
        {billing.subscription.current_period_end && !billing.subscription.cancel_at_period_end && <div><button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setCancelPlan(true)}>Cancelar ao fim do período…</button></div>}
      </section>
      <section className="surface section stack-sm" aria-labelledby="t-invoices"><h2 id="t-invoices">Faturas</h2>
        {billing.invoices.length === 0 ? <p className="small muted">Nenhuma fatura até agora.</p> : <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Período</th><th scope="col" className="num">Valor</th><th scope="col">Vencimento</th><th scope="col">Situação</th></tr></thead><tbody>{billing.invoices.map((i) => <tr key={i.id}><td className="primary">{formatDate(i.period_start)}</td><td className="num" data-label="Valor"><span className="money">{money(i.amount_cents)}</span></td><td data-label="Vencimento">{formatDate(i.due_at)}</td><td data-label="Situação"><StatusBadge map={INVOICE} value={i.status} /></td></tr>)}</tbody></table></div>}
      </section>
      <ConfirmDialog open={cancelPlan} title="Cancelar o plano ao fim do período?" description={<p>A loja continua no plano atual até o fim do período contratado. Pedidos e dados são preservados.</p>} confirmLabel="Agendar cancelamento" busy={busy}
        onClose={() => setCancelPlan(false)} onConfirm={() => void act(async () => { await api(`tenants/${p.tenantId}/billing/cancel`, 'POST'); setCancelPlan(false); }, 'Cancelamento agendado para o fim do período.')} />
    </>}
  </>;
}

// ---------- Dados e IA ----------
export function DataSettings() {
  const p = usePanel(), { busy, error, notice, run } = useAction();
  useTitle('Dados e IA');
  async function exportStore() {
    const api = (path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) => call(`tenants/${p.tenantId}/operations/${path}`, { method, body, csrf: p.csrf, headers });
    const e = await api('exports', 'POST', { kind: 'STORE' }); const data = await api(`exports/${e.id}`, 'GET', undefined, { 'X-Export-Token': e.token });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `exportacao-loja-${e.id}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <>
    <PageHeader title="Dados e IA" meta="Cópia dos dados da loja e rascunhos de descrição de produtos." />
    <Feedback error={error} notice={notice} />
    {p.owner && <section className="surface section stack-sm" id="dados" aria-labelledby="t-export"><h2 id="t-export">Exportar dados da loja</h2><p className="small muted">Arquivo JSON com pedidos, pagamentos e protocolos desta loja, gerado na hora para o Dono.</p><div><button className="btn btn-secondary" disabled={busy} onClick={() => void run(exportStore, 'Exportação gerada.')}>Exportar dados da loja</button></div></section>}
    <AiDraftSection tenantId={p.tenantId} csrf={p.csrf} owner={p.owner} />
  </>;
}
