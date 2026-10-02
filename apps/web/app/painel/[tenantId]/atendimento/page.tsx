'use client';
// R04 — Atendimento ao consumidor (Decreto 7.962/2013: resposta em até 5 dias). Mesmos endpoints de antes.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { call, fields, useAction } from '../../../../components/panel/api';
import { usePanel } from '../../../../components/panel/Shell';
import { Alert, Badge, EmptyState, Feedback, Field, Loading, PageHeader, StatusBadge, useTitle } from '../../../../components/ui/kit';
import { SUPPORT_KIND, SUPPORT_STATUS } from '../../../../components/ui/status';
import { formatDate, formatDateTime } from '../../../../components/ui/format';

type Row = { id: string; order_id: string | null; order_number: string | null; kind: string; status: string; created_at: string; due_at: string; overdue: boolean; financial_action_required: boolean };
type Ticket = { id: string; order_id: string | null; kind: string; status: string; outcome: string | null; resolution: string | null; created_at: string; due_at: string; contact_name: string | null; contact_email: string | null; financial_notified_at: string | null; financial_reference: string | null; messages: { id: string; author: string; body: string; created_at: string }[] };
const OUTCOME: Record<string, string> = { INFORMED: 'Informado/atendido', ACCEPTED: 'Aceito (cancelamento/arrependimento)', DECLINED: 'Recusado com justificativa', WITHDRAWN_BY_CONSUMER: 'Desistência do consumidor' };

function Support() {
  const p = usePanel(), params = useSearchParams(), router = useRouter(), base = `/painel/${p.tenantId}/atendimento`;
  const filter = params.get('filtro') || 'open', [hash, setHash] = useState<string | null>(null);
  useEffect(() => { const h = location.hash.slice(1); if (/^[0-9a-f-]{36}$/.test(h)) setHash(h); }, []);
  const selected = params.get('protocolo') || hash;
  useTitle(selected ? 'Protocolo' : 'Atendimento');
  return selected ? <TicketView id={selected} back={`${base}?filtro=${filter}`} /> : <List filter={filter} onFilter={(f) => router.push(`${base}?filtro=${f}`)} />;
}

function List({ filter, onFilter }: { filter: string; onFilter: (f: string) => void }) {
  const p = usePanel(), [list, setList] = useState<Row[] | null>(null), [error, setError] = useState('');
  useEffect(() => { setList(null); setError(''); call<Row[]>(`tenants/${p.tenantId}/operations/support?filter=${filter}`, { csrf: p.csrf }).then(setList).catch((e) => setError(e.message)); }, [filter, p.tenantId]);
  const tabs = [['open', 'Abertos'], ['overdue', 'Atrasados'], ['all', 'Todos']] as const;
  return <>
    <PageHeader eyebrow="Vendas" title="Atendimento" meta="Prazo de resposta: 5 dias. Arrependimento e cancelamento de pedido pago exigem comunicação imediata ao meio de pagamento, registrada no protocolo." />
    <section className="stack-sm" aria-labelledby="t-protocols">
      <h2 id="t-protocols">Protocolos</h2>
      <div className="table-wrap">
        <div className="toolbar"><div className="segmented" role="group" aria-label="Filtrar protocolos">{tabs.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => onFilter(k)}>{l}</button>)}</div></div>
        {error ? <div style={{ padding: 'var(--space-16)' }}><Alert tone="danger" role="alert" title="Não foi possível carregar os protocolos">{error}</Alert></div> : !list ? <div style={{ padding: 'var(--space-16)' }}><Loading label="Carregando protocolos…" /></div> :
          list.length === 0 ? <div style={{ padding: 'var(--space-16)' }}><EmptyState icon="chat" title={filter === 'overdue' ? 'Nenhum protocolo atrasado' : filter === 'open' ? 'Nenhum protocolo aberto' : 'Nenhum protocolo registrado'}>Solicitações de compradores e contatos gerais aparecem aqui com protocolo e prazo.</EmptyState></div> :
          <table className="data stack"><thead><tr><th scope="col">Protocolo</th><th scope="col">Pedido</th><th scope="col">Aberto em</th><th scope="col">Prazo</th><th scope="col">Situação</th></tr></thead>
            <tbody>{list.map((r) => <tr key={r.id}>
              <td className="primary"><Link href={`?protocolo=${r.id}&filtro=${filter}`} style={{ fontWeight: 600 }}>{SUPPORT_KIND[r.kind] ?? r.kind}{r.order_number ? ` · pedido nº ${r.order_number}` : ''}</Link></td>
              <td data-label="Pedido">{r.order_number ? `Nº ${r.order_number}` : <span className="muted">Sem pedido</span>}</td>
              <td data-label="Aberto em">{formatDateTime(r.created_at, p.timezone)}</td>
              <td data-label="Prazo">{formatDate(r.due_at, p.timezone)}</td>
              <td data-label="Situação"><span className="cluster-tight"><StatusBadge map={SUPPORT_STATUS} value={r.status} />{r.overdue && <Badge tone="danger">Atrasado</Badge>}{r.financial_action_required && <Badge tone="danger">Comunicação financeira pendente</Badge>}</span></td>
            </tr>)}</tbody></table>}
      </div>
    </section>
  </>;
}

function TicketView({ id, back }: { id: string; back: string }) {
  const p = usePanel(), { busy, error, notice, run } = useAction(), [t, setT] = useState<Ticket | null>(null), [loadError, setLoadError] = useState('');
  const api = (path: string, method = 'GET', body?: unknown) => call(`tenants/${p.tenantId}/operations/${path}`, { method, body, csrf: p.csrf });
  const load = useCallback(async () => setT(await api(`support/${id}`)), [id, p.tenantId]);
  useEffect(() => { setLoadError(''); load().catch((e) => setLoadError(e.message)); }, [load]);
  const form = (path: string, done: string) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void run(async () => { await api(path, 'POST', b); f.reset(); await load(); }, done); };
  if (loadError) return <><PageHeader crumbs={[{ label: 'Atendimento', href: back }, { label: 'Protocolo' }]} title="Protocolo" /><Alert tone="danger" role="alert" title="Não foi possível abrir o protocolo">{loadError} <Link href={back}>Voltar aos protocolos</Link></Alert></>;
  if (!t) return <Loading label="Carregando protocolo…" />;
  const financial = !!t.order_id && ['WITHDRAWAL', 'CANCELLATION'].includes(t.kind), resolved = t.status === 'RESOLVED', overdue = !resolved && new Date(t.due_at) < new Date();
  return <>
    <PageHeader crumbs={[{ label: 'Atendimento', href: back }, { label: SUPPORT_KIND[t.kind] ?? t.kind }]} title={`${SUPPORT_KIND[t.kind] ?? t.kind}`}
      meta={<span className="cluster-tight"><StatusBadge map={SUPPORT_STATUS} value={t.status} />{overdue && <Badge tone="danger">Atrasado</Badge>}<span>Aberto em {formatDateTime(t.created_at, p.timezone)} (horário original preservado) · resposta até {formatDate(t.due_at, p.timezone)}</span></span>}
      actions={!resolved ? <button className="btn btn-secondary" disabled={busy} onClick={() => void run(async () => { await api(`support/${t.id}/assign`, 'POST'); await load(); }, 'Protocolo assumido por você.')}>Assumir protocolo</button> : undefined} />
    <Feedback error={error} notice={notice} />
    {financial && !t.financial_notified_at && <Alert tone="danger" role="note" title="Comunicação ao meio de pagamento pendente">{p.owner ? 'Comunique o Mercado Pago agora e registre a referência abaixo antes de responder.' : 'Somente o Dono registra a comunicação. Avise-o.'} Registrar a comunicação não confirma devolução: acompanhe a pendência no pedido.</Alert>}
    <div className="two-col">
      <div className="surface">
        <section className="section" aria-labelledby="t-conv"><div className="section-head"><h2 id="t-conv">Conversa</h2><p>{t.messages.length} {t.messages.length === 1 ? 'mensagem' : 'mensagens'}</p></div>
          <ol className="messages">{t.messages.map((m) => <li key={m.id} className={m.author === 'STAFF' ? 'staff' : ''}><p className="caption">{m.author === 'STAFF' ? 'Equipe da loja' : m.author === 'CONSUMER' ? 'Consumidor' : 'Sistema'} · {formatDateTime(m.created_at, p.timezone)}</p><p className="prose">{m.body}</p></li>)}</ol>
        </section>
        {!resolved ? <>
          <section className="section" aria-labelledby="t-reply"><h2 id="t-reply" className="sr-only">Responder</h2>
            <form className="form" aria-label="Responder consumidor" onSubmit={form(`support/${t.id}/reply`, 'Resposta registrada; o consumidor será notificado.')}>
              <Field label="Resposta ao consumidor" hint="Enviada por e-mail e visível no acompanhamento do pedido.">{(a) => <textarea className="textarea" name="body" required maxLength={4000} {...a} />}</Field>
              <div><button className="btn btn-primary" disabled={busy}>Responder</button></div>
            </form>
          </section>
          <section className="section" aria-labelledby="t-resolve"><details className="disclosure"><summary><span id="t-resolve">Concluir protocolo</span></summary>
            <form className="form" aria-label="Concluir protocolo" onSubmit={form(`support/${t.id}/resolve`, 'Protocolo concluído.')}>
              <Field label="Resultado">{(a) => <select className="select" name="outcome" {...a}>{Object.entries(OUTCOME).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
              <Field label="Registro da resolução" hint="Enviado ao consumidor.">{(a) => <textarea className="textarea" name="resolution" required maxLength={2000} {...a} />}</Field>
              <div><button className="btn btn-secondary" disabled={busy}>Concluir</button></div>
            </form></details></section>
        </> : <section className="section"><p><strong>Resultado:</strong> {OUTCOME[t.outcome ?? ''] ?? t.outcome}</p><p className="prose">{t.resolution}</p></section>}
      </div>
      <aside className="surface section side-list" aria-label="Contato e pedido">
        <div><h2>Contato</h2>{t.contact_email ? <><p>{t.contact_name}</p><p className="small"><a href={`mailto:${t.contact_email}`}>{t.contact_email}</a></p></> : <p className="small muted">Comprador do pedido vinculado.</p>}</div>
        <div><h2>Pedido</h2>{t.order_id ? <Link href={`/painel/${p.tenantId}/pedidos?pedido=${t.order_id}`}>Abrir pedido</Link> : <p className="small muted">Contato geral, sem pedido.</p>}</div>
        {financial && <div className="stack-sm"><h2>Comunicação ao meio de pagamento</h2>
          {t.financial_notified_at ? <p className="small">Registrada em {formatDateTime(t.financial_notified_at, p.timezone)} · referência {t.financial_reference}. Isso não confirma devolução.</p> :
            p.owner ? <form className="form" aria-label="Registrar comunicação financeira" onSubmit={form(`support/${t.id}/financial`, 'Comunicação registrada.')}><Field label="Referência da comunicação" hint="Protocolo e data/hora informados pelo Mercado Pago.">{(a) => <input className="input" name="reference" required maxLength={200} {...a} />}</Field><div><button className="btn btn-primary btn-sm" disabled={busy}>Registrar comunicação</button></div></form> : <p className="small">Pendente — somente o Dono registra.</p>}
        </div>}
        <div><h2>Protocolo</h2><p className="caption"><code>{t.id}</code></p></div>
      </aside>
    </div>
  </>;
}
export default function Page() { return <Suspense fallback={<Loading />}><Support /></Suspense>; }
