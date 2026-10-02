'use client';
// R03 — Pedidos. Mesmos endpoints de antes. Filtros do servidor ficam na URL (voltar do detalhe preserva o contexto).
// Piloto: a devolução é feita pelo Dono no Mercado Pago; nenhuma ação daqui inicia reembolso pela API.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { call, fields, useAction } from '../../../../components/panel/api';
import { usePanel } from '../../../../components/panel/Shell';
import { Alert, Badge, ConfirmDialog, CopyButton, EmptyState, Feedback, Field, Loading, PageHeader, StatusBadge, useTitle } from '../../../../components/ui/kit';
import { Icon } from '../../../../components/ui/icons';
import { ACCOUNT_STATUS, ATTEMPT_STATUS, DISPUTE_STATUS, FULFILLMENT_STATUS, HISTORY_EVENT, incident, NOTIFICATION, NOTIFICATION_TEMPLATE, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, SUPPORT_KIND, SUPPORT_STATUS, TRANSACTION_CLASS, humanize, label } from '../../../../components/ui/status';
import { formatDateTime, money, zoneNote } from '../../../../components/ui/format';

type Row = { id: string; number: string; order_status: string; payment_status: string; fulfillment_status: string; dispute_status: string; total_cents: string; created_at: string; delivery_kind: string; open_incidents: number; refund_due_cents: string; open_requests: number };
type Address = { cep?: string; street?: string; number?: string; city?: string; state?: string; complement?: string };
type Detail = Row & { buyer: { name: string; email: string } | null; subtotal_cents?: string; shipping_cents?: string; address?: Address; fiscal_reference: string | null; shipping: { name: string; kind: string; days?: number }; items: { variant_id: string; quantity: number; price_cents: string; snapshot: { name: string; sku: string; attributes?: Record<string, string> } }[]; attempts: { id: string; method: string; status: string; provider: string; environment: string; external_id?: string | null; created_at?: string }[]; transactions: { id: string; external_id: string; received_cents: string; classification: string; refunded_cents: string; approved_at?: string | null }[]; incidents: { id: string; code: string; status: string; due_cents: string; note: string | null; created_at?: string }[]; protocols: { id: string; kind: string; status: string; created_at: string }[]; history: { event: string; reason: string; created_at: string }[]; refund_requests?: { id: string; amount_cents: string; status: string; created_at: string }[]; outbox_failures: number; shipment: { kind: string; carrier: string | null; tracking_code: string | null; ready_at: string | null; delivered_at: string | null } | null };
type Note = { id: string; template: string; status: string; attempts: number; last_error: string | null };
type Account = { id: string; provider: string; environment: string; status: string };
const FILTERS = ['payment_status', 'fulfillment_status', 'order_status', 'number', 'pending'] as const;
const opt = (map: Record<string, readonly [string, unknown]>) => Object.entries(map).map(([k, [l]]) => <option key={k} value={k}>{l}</option>);

function Orders() {
  const p = usePanel(), router = useRouter(), params = useSearchParams(), base = `/painel/${p.tenantId}/pedidos`, selected = params.get('pedido');
  const query = useMemo(() => { const q = new URLSearchParams(); for (const k of FILTERS) { const v = params.get(k); if (v) q.set(k, v); } return q.toString(); }, [params]);
  useTitle(selected ? 'Pedido' : 'Pedidos');
  return selected ? <OrderDetail id={selected} back={`${base}${query ? `?${query}` : ''}`} /> : <OrderList query={query} onFilter={(q) => router.push(`${base}${q ? `?${q}` : ''}`)} />;
}

function OrderList({ query, onFilter }: { query: string; onFilter: (q: string) => void }) {
  const p = usePanel(), { busy, error, notice, run } = useAction(), [orders, setOrders] = useState<Row[] | null>(null), [accounts, setAccounts] = useState<Account[] | null>(null), [revoke, setRevoke] = useState<Account | null>(null), [loadError, setLoadError] = useState('');
  const current = new URLSearchParams(query), api = (path: string, method = 'GET', body?: unknown) => call(`tenants/${p.tenantId}/${path}`, { method, body, csrf: p.csrf });
  const load = useCallback(async () => { setOrders(await api(`operations/orders${query ? `?${query}` : ''}`)); if (p.owner) setAccounts(await api('purchase/accounts')); }, [query, p.tenantId]);
  useEffect(() => { setOrders(null); setLoadError(''); load().catch((e) => setLoadError(e.message)); }, [load]);
  function filter(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const b = fields(e.currentTarget), q = new URLSearchParams(); for (const k of FILTERS) if (b[k]) q.set(k, b[k] === 'on' ? 'true' : b[k]); onFilter(q.toString()); }
  const connected = accounts?.filter((a) => a.status === 'CONNECTED') ?? [];
  return <>
    <PageHeader eyebrow="Vendas" title="Pedidos" meta="Pedidos da loja com pagamento, entrega e pendências. Pagamentos reais dependem da homologação do Mercado Pago." />
    <Feedback error={error} notice={notice} />
    {p.owner && accounts && <section className="surface section stack-sm" aria-labelledby="t-account">
      <div className="section-head" style={{ marginBottom: 0 }}><h2 id="t-account">Conta de pagamento</h2>{connected.length === 0 && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run(async () => { await api('purchase/accounts/simulated', 'POST'); await load(); await p.refresh(); }, 'Conta simulada conectada.')}>Conectar conta SIMULADA</button>}</div>
      <p className="small muted">Mercado Pago real fica desabilitado até a homologação externa. A conta SIMULADA não movimenta dinheiro.</p>
      {accounts.length > 0 && <ul className="stack-sm" style={{ listStyle: 'none' }}>{accounts.map((a) => <li key={a.id} className="cluster"><span>{a.provider === 'SIMULATED' ? 'Conta simulada' : a.provider} · {a.environment}</span><StatusBadge map={ACCOUNT_STATUS} value={a.status} />{a.status === 'CONNECTED' && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setRevoke(a)}>Revogar…</button>}</li>)}</ul>}
    </section>}
    <section className="stack-sm" aria-labelledby="t-recent">
      <h2 id="t-recent">Pedidos recentes</h2>
      <div className="table-wrap">
        <form className="toolbar" aria-label="Filtrar pedidos" onSubmit={filter} key={query}>
          <div className="field narrow"><label htmlFor="f-pay">Pagamento</label><select className="select" id="f-pay" name="payment_status" defaultValue={current.get('payment_status') ?? ''}><option value="">Todos</option>{opt(PAYMENT_STATUS)}</select></div>
          <div className="field narrow"><label htmlFor="f-ful">Entrega</label><select className="select" id="f-ful" name="fulfillment_status" defaultValue={current.get('fulfillment_status') ?? ''}><option value="">Todas</option>{opt(FULFILLMENT_STATUS)}</select></div>
          <div className="field narrow"><label htmlFor="f-ord">Pedido</label><select className="select" id="f-ord" name="order_status" defaultValue={current.get('order_status') ?? ''}><option value="">Todos</option>{opt(ORDER_STATUS)}</select></div>
          <div className="field narrow"><label htmlFor="f-num">Número</label><input className="input" id="f-num" name="number" inputMode="numeric" pattern="[0-9]*" defaultValue={current.get('number') ?? ''} /></div>
          <label className="check" style={{ alignSelf: 'center' }}><input type="checkbox" name="pending" defaultChecked={current.get('pending') === 'true'} /> Somente com pendências</label>
          <div className="cluster-tight"><button className="btn btn-secondary">Filtrar</button>{query && <button type="button" className="btn btn-quiet" onClick={() => onFilter('')}>Limpar filtros</button>}</div>
        </form>
        {loadError ? <div style={{ padding: 'var(--space-16)' }}><Alert tone="danger" role="alert" title="Não foi possível carregar os pedidos">{loadError}</Alert></div> : !orders ? <div style={{ padding: 'var(--space-16)' }}><Loading label="Carregando pedidos autorizados…" /></div> :
          orders.length === 0 ? <div style={{ padding: 'var(--space-16)' }}>{query ? <EmptyState icon="search" title="Nenhum pedido com esses filtros" action={<button className="btn btn-secondary btn-sm" onClick={() => onFilter('')}>Limpar filtros</button>} /> : <EmptyState icon="receipt" title="Nenhum pedido ainda">Os pedidos aparecem aqui quando um comprador conclui a compra na vitrine publicada.</EmptyState>}</div> :
          <table className="data stack"><caption>Mais recentes primeiro; até 100 pedidos por consulta. Datas no {zoneNote(p.timezone)}.</caption>
            <thead><tr><th scope="col">Pedido</th><th scope="col">Data</th><th scope="col">Pagamento</th><th scope="col">Entrega</th><th scope="col" className="num">Total</th><th scope="col">Pendências</th></tr></thead>
            <tbody>{orders.map((r) => <tr key={r.id}>
              <td className="primary"><Link href={`?pedido=${r.id}${query ? `&${query}` : ''}`} style={{ fontWeight: 600 }}>Nº {r.number}</Link><span className="cell-sub">{label(ORDER_STATUS, r.order_status)} · {r.delivery_kind === 'PICKUP' ? 'retirada' : 'entrega'}</span></td>
              <td data-label="Data">{formatDateTime(r.created_at, p.timezone)}</td>
              <td data-label="Pagamento"><StatusBadge map={PAYMENT_STATUS} value={r.payment_status} /></td>
              <td data-label="Entrega"><StatusBadge map={FULFILLMENT_STATUS} value={r.fulfillment_status} /></td>
              <td className="num" data-label="Total"><span className="money">{money(r.total_cents)}</span></td>
              <td data-label="Pendências"><span className="cluster-tight">{r.refund_due_cents !== '0' ? <Badge tone="danger">Devolver {money(r.refund_due_cents)}</Badge> : r.open_incidents > 0 ? <Badge tone="danger">{r.open_incidents} {r.open_incidents === 1 ? 'pendência' : 'pendências'}</Badge> : null}{r.dispute_status !== 'NONE' && <StatusBadge map={DISPUTE_STATUS} value={r.dispute_status} />}{r.open_requests > 0 && <Badge tone="warning">{r.open_requests} {r.open_requests === 1 ? 'solicitação' : 'solicitações'}</Badge>}{r.open_incidents === 0 && r.open_requests === 0 && r.dispute_status === 'NONE' && <span className="muted">—</span>}</span></td>
            </tr>)}</tbody></table>}
      </div>
    </section>
    <ConfirmDialog open={!!revoke} title="Revogar a conta de pagamento?" description={<p>Novas cobranças ficam bloqueadas imediatamente. Pagamentos já recebidos e devoluções pendentes continuam registrados.</p>} confirmLabel="Revogar conta" busy={busy}
      onClose={() => setRevoke(null)} onConfirm={() => void run(async () => { await api(`purchase/accounts/${revoke!.id}/revoke`, 'POST'); setRevoke(null); await load(); await p.refresh(); }, 'Conta revogada; novas cobranças bloqueadas.')} />
  </>;
}

const FINANCIAL = ['REFUND_ACTION_REQUIRED', 'EXCESS_PAYMENT', 'PAYMENT_VALUE_MISMATCH', 'REFUND_VALUE_MISMATCH', 'PAID_WITHOUT_STOCK', 'REFUND_FAILED'];
const REVIEW = ['PARTIAL_REFUND_REVIEW', 'GATEWAY_IDENTITY_MISMATCH', 'GATEWAY_UNAVAILABLE'];
function synthesis(d: Detail, due: bigint, blocked: boolean) {
  const pay: Record<string, string> = { PAID: 'Pagamento recebido', PENDING: 'Aguardando confirmação do pagamento', UNPAID: 'Sem pagamento confirmado', PARTIALLY_REFUNDED: 'Pagamento parcialmente devolvido', REFUNDED: 'Pagamento devolvido', CHARGED_BACK: 'Pagamento contestado' };
  const parts = [pay[d.payment_status] ?? label(PAYMENT_STATUS, d.payment_status)];
  if (due > 0n) parts.push(`devolução pendente de ${money(due.toString())}`);
  if (d.dispute_status === 'OPEN') parts.push('disputa aberta');
  if (d.order_status === 'CANCELLED') parts.push('pedido cancelado');
  else if (blocked && ['UNFULFILLED', 'PROCESSING'].includes(d.fulfillment_status)) parts.push('envio bloqueado');
  else parts.push(label(FULFILLMENT_STATUS, d.fulfillment_status).toLowerCase());
  return parts.join(' · ');
}

function OrderDetail({ id, back }: { id: string; back: string }) {
  const p = usePanel(), { busy, error, notice, run } = useAction();
  const [d, setD] = useState<Detail | null>(null), [blocks, setBlocks] = useState<string[]>([]), [notes, setNotes] = useState<Note[]>([]), [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<'' | 'cancel' | 'erase' | 'revoke-links'>('');
  const t = (path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) => call(`tenants/${p.tenantId}/${path}`, { method, body, csrf: p.csrf, headers });
  const load = useCallback(async () => { setD(await t(`purchase/orders/${id}`)); setBlocks((await t(`operations/orders/${id}/impediments`)).impediments); setNotes(await t(`operations/orders/${id}/notifications`)); }, [id, p.tenantId]);
  useEffect(() => { setD(null); setLoadError(''); load().catch((e) => setLoadError(e.message)); }, [load]);
  useTitle(d ? `Pedido nº ${d.number}` : 'Pedido');
  const act = (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await load(); }, done);
  const o = (path: string) => `operations/orders/${id}/${path}`, form = (task: (b: Record<string, string>) => Promise<unknown>, done: string) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void act(async () => { await task(b); f.reset(); }, done); };
  if (loadError) return <><PageHeader crumbs={[{ label: 'Pedidos', href: back }, { label: 'Pedido' }]} title="Pedido" /><Alert tone="danger" role="alert" title="Não foi possível abrir o pedido">{loadError} <Link href={back}>Voltar aos pedidos</Link></Alert></>;
  if (!d) return <Loading label="Carregando pedido autorizado…" />;
  const open = d.incidents.filter((i) => i.status === 'OPEN'), financial = open.filter((i) => FINANCIAL.includes(i.code));
  const due = open.filter((i) => i.code === 'REFUND_ACTION_REQUIRED').reduce((s, i) => s + BigInt(i.due_cents), 0n) || financial.reduce((m, i) => (BigInt(i.due_cents) > m ? BigInt(i.due_cents) : m), 0n);
  const blocked = blocks.length > 0 && d.order_status === 'OPEN', attempt = d.attempts.at(-1);
  const received = d.transactions.reduce((s, x) => s + BigInt(x.received_cents), 0n), refunded = d.transactions.reduce((s, x) => s + BigInt(x.refunded_cents), 0n);
  const subtotal = d.subtotal_cents ?? d.items.reduce((s, i) => s + BigInt(i.price_cents) * BigInt(i.quantity), 0n).toString();
  const shipped = d.shipment, pickup = d.shipping.kind === 'PICKUP';
  async function download() { const e = await t('operations/exports', 'POST', { kind: 'CONSUMER', order_id: d!.id }); const data = await t(`operations/exports/${e.id}`, 'GET', undefined, { 'X-Export-Token': e.token }); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `exportacao-comprador-${e.id}.json`; a.click(); URL.revokeObjectURL(url); }
  let next: React.ReactNode = null;
  if (d.order_status === 'OPEN' && d.fulfillment_status === 'UNFULFILLED') next = <div className="blocked stack-sm"><div><button className="btn btn-primary" disabled={busy || blocked} aria-describedby={blocked ? 'why-blocked' : undefined} onClick={() => void act(() => t(o('process'), 'POST'), 'Separação iniciada.')}>Iniciar separação</button></div></div>;
  else if (d.fulfillment_status === 'PROCESSING' && !pickup) next = <form className="form form-col" aria-label="Registrar envio" onSubmit={form((b) => t(o('ship'), 'POST', b), 'Envio registrado; o comprador será avisado.')}><div className="form-grid"><Field label="Transportadora">{(a) => <input className="input" name="carrier" required maxLength={80} {...a} />}</Field><Field label="Código de rastreio" optional>{(a) => <input className="input" name="tracking" maxLength={80} {...a} />}</Field></div><div><button className="btn btn-primary" disabled={busy || blocked}>Registrar envio</button></div></form>;
  else if (d.fulfillment_status === 'PROCESSING' && pickup && !shipped?.ready_at) next = <button className="btn btn-primary" disabled={busy} onClick={() => void act(() => t(o('pickup-ready'), 'POST'), 'Comprador avisado de que o pedido está pronto para retirada.')}>Marcar pronto para retirada</button>;
  if (d.fulfillment_status === 'SHIPPED' || (shipped?.kind === 'PICKUP' && shipped.ready_at && d.fulfillment_status === 'PROCESSING')) next = <form className="form form-col" aria-label="Confirmar entrega" onSubmit={form((b) => t(o('deliver'), 'POST', b), 'Entrega registrada.')}><Field label={shipped?.kind === 'PICKUP' ? 'Comprovação da retirada' : 'Observação da entrega'} optional={shipped?.kind !== 'PICKUP'} hint={shipped?.kind === 'PICKUP' ? 'Ex.: documento conferido e nome de quem retirou.' : undefined}>{(a) => <input className="input" name="proof" required={shipped?.kind === 'PICKUP'} maxLength={300} {...a} />}</Field><div><button className="btn btn-primary" disabled={busy}>Confirmar entrega</button></div></form>;
  return <>
    <PageHeader crumbs={[{ label: 'Pedidos', href: back }, { label: `Nº ${d.number}` }]} title={`Pedido nº ${d.number}`}
      meta={`Criado em ${formatDateTime(d.created_at, p.timezone)} (${zoneNote(p.timezone)}) · ${d.shipping.name} (${pickup ? 'retirada' : 'entrega'})`}
      actions={<button className="btn btn-secondary" disabled={busy} onClick={() => void act(() => t(o('reconcile'), 'POST'), 'Atualização solicitada ao meio de pagamento. A situação muda quando a resposta chegar.')}>Atualizar situação do pagamento</button>} />
    <p className="headline">{synthesis(d, due, blocked)}</p>
    <div className="status-strip" aria-label="Situação do pedido">
      <div><span className="caption">Pedido</span><StatusBadge map={ORDER_STATUS} value={d.order_status} /></div>
      <div><span className="caption">Pagamento</span><StatusBadge map={PAYMENT_STATUS} value={d.payment_status} /></div>
      <div><span className="caption">Entrega</span><StatusBadge map={FULFILLMENT_STATUS} value={d.fulfillment_status} /></div>
      <div><span className="caption">Disputa</span><StatusBadge map={DISPUTE_STATUS} value={d.dispute_status} /></div>
      {open.length > 0 && <div><span className="caption">Pendências</span><Badge tone="danger">{open.length} {open.length === 1 ? 'aberta' : 'abertas'}</Badge></div>}
    </div>
    <Feedback error={error} notice={notice} />
    {financial.length > 0 && <Alert tone="danger" role="note" title={due > 0n ? `Devolva ${money(due.toString())} ao comprador` : incident(financial[0]!.code).title}>
      <p>{incident(financial[0]!.code).title}. {incident(financial[0]!.code).next} Depois, use “Atualizar situação do pagamento”. O envio fica bloqueado até a confirmação.</p>
      <details><summary>Como resolver no piloto</summary><ol>
        <li>No painel do Mercado Pago, localize {d.transactions.length > 1 ? 'o recebimento excedente' : 'o recebimento'} pelo ID externo: {d.transactions.filter((x) => x.classification !== 'PRINCIPAL' || d.order_status === 'CANCELLED').map((x) => <code key={x.id}> {x.external_id}</code>)}.</li>
        <li>Faça a devolução de {money(due.toString())} por lá.</li>
        <li>Anote a referência da devolução nesta página (ajuda a investigar, mas não confirma nada).</li>
        <li>Clique em “Atualizar situação do pagamento”. Só a confirmação do meio de pagamento encerra a pendência.</li>
      </ol></details>
    </Alert>}
    <div className="two-col">
      <div className="surface">
        <section className="section" aria-labelledby="t-items"><div className="section-head"><h2 id="t-items">Itens</h2><p>Valores registrados na compra.</p></div>
          <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Item</th><th scope="col" className="num">Qtd.</th><th scope="col" className="num">Unitário</th><th scope="col" className="num">Total</th></tr></thead>
            <tbody>{d.items.map((i) => <tr key={i.variant_id}><td className="primary">{i.snapshot.name}<span className="cell-sub">{i.snapshot.sku}{i.snapshot.attributes && Object.keys(i.snapshot.attributes).length ? ` · ${Object.values(i.snapshot.attributes).join(' / ')}` : ''}</span></td><td className="num" data-label="Qtd.">{i.quantity}</td><td className="num" data-label="Unitário"><span className="money">{money(i.price_cents)}</span></td><td className="num" data-label="Total"><span className="money">{money((BigInt(i.price_cents) * BigInt(i.quantity)).toString())}</span></td></tr>)}</tbody></table></div>
          <dl className="totals" style={{ marginTop: 'var(--space-16)', maxWidth: '22rem', marginLeft: 'auto' }}><div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>{d.shipping_cents && <div><dt>Frete ({d.shipping.name})</dt><dd>{money(d.shipping_cents)}</dd></div>}<div className="grand"><dt>Total do pedido</dt><dd>{money(d.total_cents)}</dd></div></dl>
        </section>
        <section className="section" aria-labelledby="t-pay"><div className="section-head"><h2 id="t-pay">Pagamentos</h2><p>Todos os recebimentos ficam registrados, inclusive excedentes.</p></div>
          {d.transactions.length === 0 ? <p className="small muted">Nenhum recebimento confirmado pelo meio de pagamento.</p> :
            <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Recebimento</th><th scope="col">Classificação</th><th scope="col" className="num">Recebido</th><th scope="col" className="num">Devolvido</th><th scope="col">ID externo</th></tr></thead>
              <tbody>{d.transactions.map((x) => <tr key={x.id}><td className="primary">{x.approved_at ? formatDateTime(x.approved_at, p.timezone) : 'Confirmado'}</td><td data-label="Classificação"><StatusBadge map={TRANSACTION_CLASS} value={x.classification} /></td><td className="num" data-label="Recebido"><span className="money">{money(x.received_cents)}</span></td><td className="num" data-label="Devolvido"><span className="money">{money(x.refunded_cents)}</span></td><td data-label="ID externo"><span className="copyable"><code>{x.external_id}</code><CopyButton value={x.external_id} label="Copiar ID" /></span></td></tr>)}</tbody></table></div>}
          {d.transactions.length > 0 && <dl className="totals" style={{ marginTop: 'var(--space-16)', maxWidth: '22rem', marginLeft: 'auto' }}><div><dt>Total recebido</dt><dd>{money(received.toString())}</dd></div><div><dt>Devoluções confirmadas</dt><dd>{money(refunded.toString())}</dd></div>{due > 0n && <div className="grand"><dt>A devolver</dt><dd>{money(due.toString())}</dd></div>}</dl>}
          <details className="disclosure small"><summary>Tentativas de pagamento ({d.attempts.length})</summary><ul className="stack-sm" style={{ listStyle: 'none' }}>{d.attempts.map((a, i) => <li key={a.id} className="cluster-tight"><span>Tentativa {i + 1} · {PAYMENT_METHOD[a.method] ?? a.method}{a.created_at ? ` · ${formatDateTime(a.created_at, p.timezone)}` : ''}</span><StatusBadge map={ATTEMPT_STATUS} value={a.status} /><span className="muted">{a.provider === 'SIMULATED' ? 'ambiente simulado' : `${a.provider}/${a.environment}`}</span></li>)}</ul></details>
          {d.refund_requests && d.refund_requests.length > 0 && <details className="disclosure small"><summary>Devoluções solicitadas pela plataforma ({d.refund_requests.length})</summary><ul className="stack-sm" style={{ listStyle: 'none' }}>{d.refund_requests.map((r) => <li key={r.id}>{formatDateTime(r.created_at, p.timezone)} · {money(r.amount_cents)} · {r.status}</li>)}</ul></details>}
        </section>
        {d.incidents.length > 0 && <section className="section" aria-labelledby="t-inc"><div className="section-head"><h2 id="t-inc">Pendências</h2><p>Só a confirmação do meio de pagamento encerra pendências financeiras.</p></div>
          <ul className="stack" style={{ listStyle: 'none' }}>{d.incidents.map((i) => { const info = incident(i.code); return <li key={i.id} className="stack-sm">
            <div className="cluster-tight"><strong>{info.title}</strong>{i.status === 'OPEN' ? <Badge tone="danger">Aberta</Badge> : <Badge>Resolvida</Badge>}{i.due_cents !== '0' && <span className="money small">valor {money(i.due_cents)}</span>}</div>
            {i.status === 'OPEN' && <p className="small">{info.next}</p>}
            {i.note && <p className="small muted">Anotação: {i.note}</p>}
            <p className="caption">Código para suporte: <code>{i.code}</code></p>
            {p.owner && i.status === 'OPEN' && !REVIEW.includes(i.code) && <form className="cluster" style={{ alignItems: 'end' }} aria-label={`Anotar referência — ${info.title}`} onSubmit={form((b) => t(`purchase/orders/${d.id}/incidents/${i.id}/note`, 'POST', b), 'Referência anotada. Ela não confirma a devolução.')}><Field label="Referência externa ou anotação" hint="Ajuda a investigar; não marca o valor como devolvido.">{(a) => <input className="input" name="note" required maxLength={1000} {...a} />}</Field><button className="btn btn-secondary" disabled={busy}>Anotar</button></form>}
            {p.owner && i.status === 'OPEN' && REVIEW.includes(i.code) && <form className="cluster" style={{ alignItems: 'end' }} aria-label={`Concluir revisão — ${info.title}`} onSubmit={form((b) => t(o(`incidents/${i.id}/resolve`), 'POST', b), 'Revisão registrada.')}><Field label="Conclusão da revisão">{(a) => <input className="input" name="note" required maxLength={1000} {...a} />}</Field><button className="btn btn-secondary" disabled={busy}>Concluir revisão</button></form>}
          </li>; })}</ul>
          {p.owner && (open.some((i) => i.code === 'PAID_WITHOUT_STOCK') || d.outbox_failures > 0) && <div className="cluster" style={{ marginTop: 'var(--space-16)' }}>{open.some((i) => i.code === 'PAID_WITHOUT_STOCK') && <button className="btn btn-secondary" disabled={busy} onClick={() => void act(() => t(`purchase/orders/${d.id}/reallocate`, 'POST'), 'Estoque realocado.')}>Realocar estoque</button>}{d.outbox_failures > 0 && <button className="btn btn-secondary" disabled={busy} onClick={() => void act(() => t(`purchase/orders/${d.id}/outbox/retry`, 'POST'), 'Eventos reenfileirados.')}>Reprocessar eventos com falha ({d.outbox_failures})</button>}</div>}
        </section>}
        <section className="section" aria-labelledby="t-ship"><div className="section-head"><h2 id="t-ship">Expedição</h2></div>
          <div className="stack-sm">
            {shipped && <p>{shipped.kind === 'PICKUP' ? (shipped.delivered_at ? `Retirado em ${formatDateTime(shipped.delivered_at, p.timezone)}.` : shipped.ready_at ? 'Pronto para retirada; o comprador foi avisado.' : 'Retirada na loja.') : `Enviado por ${shipped.carrier}${shipped.tracking_code ? ` · rastreio ${shipped.tracking_code}` : ''}${shipped.delivered_at ? ` · entregue em ${formatDateTime(shipped.delivered_at, p.timezone)}` : ''}.`}</p>}
            {blocked && <div id="why-blocked" className="blocked"><p className="small"><strong>Envio bloqueado.</strong> Motivos informados pelo servidor:</p><ul>{blocks.map((b) => <li key={b}>{humanize(b)}</li>)}</ul></div>}
            {next ?? (d.order_status === 'CANCELLED' ? <p className="small muted">Pedido cancelado: nenhum envio pode ser criado.</p> : d.fulfillment_status === 'DELIVERED' ? <p className="small muted">Entrega concluída.</p> : null)}
            {['SHIPPED', 'DELIVERED'].includes(d.fulfillment_status) && <details className="disclosure"><summary>Registrar devolução física</summary><form className="form form-col" aria-label="Registrar devolução física" onSubmit={form((b) => t(o('return'), 'POST', b), 'Devolução física registrada; o estoque não foi reposto automaticamente.')}><Field label="Conferência da devolução">{(a) => <input className="input" name="note" required maxLength={500} {...a} />}</Field><div><button className="btn btn-secondary" disabled={busy}>Registrar devolução física</button></div></form></details>}
          </div>
        </section>
        <section className="section" aria-labelledby="t-hist"><details className="disclosure"><summary><span id="t-hist">Histórico do pedido ({d.history.length} eventos)</span></summary>
          <ol className="timeline">{d.history.map((h, i) => <li key={i}><time dateTime={h.created_at}>{formatDateTime(h.created_at, p.timezone)}</time><span><strong>{HISTORY_EVENT[h.event] ?? h.event}.</strong> {h.reason}</span></li>)}</ol></details></section>
      </div>
      <aside className="surface section side-list" aria-label="Comprador, entrega e registros">
        <div><h2>Comprador</h2>{d.buyer ? <><p>{d.buyer.name}</p><p className="small"><a href={`mailto:${d.buyer.email}`}>{d.buyer.email}</a></p></> : <p className="small muted">Dados pessoais anonimizados.</p>}</div>
        <div><h2>Entrega</h2><p className="small">{d.shipping.name} · {pickup ? 'retirada na loja' : 'entrega'}</p>{d.address?.street && <p className="small">{d.address.street}, {d.address.number}{d.address.complement ? `, ${d.address.complement}` : ''} — {d.address.city}/{d.address.state} · CEP {d.address.cep}</p>}</div>
        <div><h2>Notificações ao comprador</h2>{notes.length === 0 ? <p className="small muted">Nenhuma.</p> : <ul className="stack-sm" style={{ listStyle: 'none' }}>{notes.map((n) => <li key={n.id} className="small"><span className="cluster-tight">{NOTIFICATION_TEMPLATE[n.template] ?? n.template}<StatusBadge map={NOTIFICATION} value={n.status} /></span>{n.last_error && <span className="cell-sub">{n.last_error}</span>}{p.owner && ['FAILED', 'HELD'].includes(n.status) && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void act(() => t(`operations/notifications/${n.id}/retry`, 'POST'), 'Reenvio agendado.')}>Reenviar</button>}</li>)}</ul>}</div>
        <div><h2>Protocolos do consumidor</h2>{d.protocols.length === 0 ? <p className="small muted">Nenhum protocolo para este pedido.</p> : <ul className="stack-sm" style={{ listStyle: 'none' }}>{d.protocols.map((r) => <li key={r.id} className="small"><Link href={`/painel/${p.tenantId}/atendimento?protocolo=${r.id}`}>{SUPPORT_KIND[r.kind] ?? r.kind}</Link> · {label(SUPPORT_STATUS, r.status)} · {formatDateTime(r.created_at, p.timezone)}</li>)}</ul>}</div>
        <div><h2>Documento fiscal externo</h2><form className="form" aria-label="Registrar documento fiscal" onSubmit={form((b) => t(o('fiscal'), 'POST', b), 'Referência fiscal registrada.')} key={d.fiscal_reference ?? 'none'}><Field label="Referência da nota" hint="Ex.: chave da NF-e emitida fora da plataforma.">{(a) => <input className="input" name="reference" required maxLength={120} defaultValue={d.fiscal_reference ?? ''} {...a} />}</Field><div><button className="btn btn-secondary btn-sm" disabled={busy}>Salvar referência</button></div></form></div>
        {p.owner && <div className="stack-sm"><h2>Ações do Dono</h2>
          <div className="cluster-tight">{d.order_status === 'OPEN' && d.fulfillment_status === 'UNFULFILLED' && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setDialog('cancel')}>Cancelar pedido…</button>}<button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(download, 'Exportação gerada (link interno de 15 minutos, já usado).')}>Exportar dados do comprador</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setDialog('revoke-links')}>Revogar links de acompanhamento…</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setDialog('erase')}>Anonimizar dados pessoais…</button></div>
          <details className="disclosure small"><summary>Corrigir endereço (auditado)</summary><form className="form" aria-label="Corrigir endereço" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget, b = fields(f), reason = b.reason; delete b.reason; void act(async () => { await t(`purchase/orders/${d.id}/address`, 'POST', { address: b, reason }); f.reset(); }, 'Correção registrada; o endereço original foi preservado.'); }}>
            <div className="form-grid"><Field label="CEP">{(a) => <input className="input" name="cep" required inputMode="numeric" autoComplete="off" {...a} />}</Field><Field label="Número">{(a) => <input className="input" name="number" required {...a} />}</Field></div>
            <Field label="Rua">{(a) => <input className="input" name="street" required {...a} />}</Field>
            <div className="form-grid"><Field label="Cidade">{(a) => <input className="input" name="city" required {...a} />}</Field><Field label="UF">{(a) => <input className="input" name="state" required maxLength={2} {...a} />}</Field></div>
            <Field label="Complemento" optional>{(a) => <input className="input" name="complement" {...a} />}</Field>
            <Field label="Motivo da correção">{(a) => <input className="input" name="reason" required maxLength={500} {...a} />}</Field>
            <div><button className="btn btn-secondary btn-sm" disabled={busy}>Registrar correção</button></div></form></details>
          {attempt?.provider === 'SIMULATED' && <details className="disclosure small"><summary>Ferramentas do ambiente simulado</summary><p className="muted">Gera eventos do provedor SIMULADO para testar estados. Não existe em produção.</p><form className="form" aria-label="Simular gateway" onSubmit={form((b) => t(`purchase/attempts/${attempt.id}/simulate`, 'POST', b), 'Fato simulado registrado; aguardando conciliação.')}><Field label="Evento do provedor simulado">{(a) => <select className="select" name="status" {...a}><option value="APPROVED">Aprovar</option><option value="REJECTED">Recusar</option><option value="REFUNDED">Devolução</option><option value="DISPUTED">Abrir disputa</option><option value="DISPUTE_WON">Disputa vencida</option><option value="DISPUTE_LOST">Disputa perdida</option></select>}</Field><Field label="Valor da devolução em centavos" optional>{(a) => <input className="input" name="amount_cents" pattern="[0-9]*" defaultValue={d.total_cents} {...a} />}</Field><div><button className="btn btn-secondary btn-sm" disabled={busy}>Enviar evento simulado</button></div></form></details>}
        </div>}
      </aside>
    </div>
    <ConfirmDialog open={dialog === 'cancel'} title={`Cancelar o pedido nº ${d.number}?`} description={<p>O envio fica impedido imediatamente{d.payment_status === 'PAID' ? '. Valores recebidos continuam pendentes de devolução até a confirmação do meio de pagamento; cancelar não devolve dinheiro automaticamente' : ' e o estoque reservado é liberado'}.</p>} confirmLabel="Cancelar pedido" busy={busy}
      onClose={() => setDialog('')} onConfirm={(b) => void act(async () => { await t(`purchase/orders/${d.id}/cancel`, 'POST', { reason: b.reason }); setDialog(''); }, 'Pedido cancelado.')}><Field label="Motivo do cancelamento">{(a) => <input className="input" name="reason" required maxLength={500} {...a} />}</Field></ConfirmDialog>
    <ConfirmDialog open={dialog === 'erase'} title="Anonimizar os dados pessoais deste pedido?" description={<p>Nome, e-mail e endereço do comprador são eliminados. Fatos financeiros e o histórico do pedido são preservados. Não é possível desfazer.</p>} confirmLabel="Anonimizar dados" busy={busy}
      onClose={() => setDialog('')} onConfirm={(b) => void act(async () => { await t(o('erase'), 'POST', { reason: b.reason }); setDialog(''); }, 'Dados pessoais anonimizados.')}><Field label="Motivo (protocolo do titular)">{(a) => <input className="input" name="reason" required maxLength={500} {...a} />}</Field></ConfirmDialog>
    <ConfirmDialog open={dialog === 'revoke-links'} title="Revogar os links de acompanhamento?" description={<p>Os links enviados ao comprador param de funcionar. O pedido não muda.</p>} confirmLabel="Revogar links" busy={busy}
      onClose={() => setDialog('')} onConfirm={() => void act(async () => { await t(o('access/revoke'), 'POST'); setDialog(''); }, 'Links de acompanhamento revogados.')} />
  </>;
}
export default function Page() { return <Suspense fallback={<Loading />}><Orders /></Suspense>; }
