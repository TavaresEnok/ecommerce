'use client';
// R05 — Operação e conta da loja. Mostra somente números vindos de /operations/status; nada de métricas decorativas.
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { call, fields, useAction } from '../../../../components/panel/api';
import { usePanel } from '../../../../components/panel/Shell';
import { CommercialSections } from '../../../../components/commercial';
import { AiDraftSection } from '../../../../components/ai-draft';
import { Alert, Badge, Feedback, Field, Loading, PageHeader, useTitle } from '../../../../components/ui/kit';

type Status = { outbox_oldest_seconds: number; inbox_oldest_seconds: number; notifications_pending: number; notifications_failed: number; financial_incidents: number; payment_uncertain: number; support_overdue: number; financial_communication_pending: number; suspended: boolean; sales_paused: boolean; alerts: { code: string; severity: string; value: number }[] };
const HELP: Record<string, { title: string; text: string; link?: (base: string) => [string, string] }> = {
  FINANCIAL_INCIDENT_OPEN: { title: 'Pendência financeira aberta', text: 'Há devolução, excedente ou divergência a resolver pelo procedimento do piloto.', link: (b) => [`${b}/pedidos?pending=true`, 'Ver pedidos com pendências'] },
  PAYMENT_UNCERTAIN: { title: 'Pagamento sem resultado conclusivo', text: 'Atualize a situação do pagamento no pedido; não cobre de novo.', link: (b) => [`${b}/pedidos?pending=true`, 'Ver pedidos com pendências'] },
  FINANCIAL_COMMUNICATION_PENDING: { title: 'Comunicação ao meio de pagamento pendente', text: 'Arrependimento ou cancelamento de pedido pago sem comunicação registrada.', link: (b) => [`${b}/atendimento?filtro=open`, 'Abrir protocolos'] },
  SUPPORT_OVERDUE: { title: 'Protocolos com prazo vencido', text: 'O prazo de resposta de 5 dias passou.', link: (b) => [`${b}/atendimento?filtro=overdue`, 'Ver protocolos atrasados'] },
  NOTIFICATION_BACKLOG: { title: 'E-mails pendentes há mais de 15 minutos', text: 'Verifique o provedor de e-mail.' },
  NOTIFICATION_FAILED: { title: 'E-mails falharam após as tentativas', text: 'Reenvie pelo pedido correspondente.', link: (b) => [`${b}/pedidos`, 'Abrir pedidos'] },
  OUTBOX_BACKLOG: { title: 'Eventos internos atrasados', text: 'Verifique o processamento em segundo plano (worker/Redis).' },
  OUTBOX_FAILED: { title: 'Eventos internos esgotaram as tentativas', text: 'Reprocesse pelo pedido afetado.', link: (b) => [`${b}/pedidos?pending=true`, 'Abrir pedidos'] },
  INBOX_BACKLOG: { title: 'Notificações do meio de pagamento não processadas', text: 'Verifique o processamento em segundo plano.' },
};

export default function Operation() {
  const p = usePanel(), base = `/painel/${p.tenantId}`, { busy, error, notice, run } = useAction(), [status, setStatus] = useState<Status | null>(null), [loadError, setLoadError] = useState('');
  useTitle('Operação');
  const api = (path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) => call(`tenants/${p.tenantId}/operations/${path}`, { method, body, csrf: p.csrf, headers });
  const load = useCallback(async () => setStatus(await api('status')), [p.tenantId]);
  useEffect(() => { load().catch((e) => setLoadError(e.message)); }, [load]);
  async function exportStore() { const e = await api('exports', 'POST', { kind: 'STORE' }); const data = await api(`exports/${e.id}`, 'GET', undefined, { 'X-Export-Token': e.token }); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `exportacao-loja-${e.id}.json`; a.click(); URL.revokeObjectURL(url); }
  const sections = [['alertas', 'Alertas'], ['vendas', 'Vendas'], ...(p.owner ? [['seguranca', 'Segurança'], ['plano', 'Plano'], ['dominio', 'Domínio'], ['transportadora', 'Transportadora'], ['dados', 'Exportação']] : []), ['ia', 'Descrição com IA']];
  return <>
    <PageHeader eyebrow="Conta" title="Operação" meta="Alertas, vendas, segurança e configurações da loja." />
    <nav aria-label="Seções da operação"><ul className="subnav">{sections.map(([id, l]) => <li key={id}><a href={`#${id}`}>{l}</a></li>)}</ul></nav>
    <Feedback error={error} notice={notice} />
    {loadError && <Alert tone="danger" role="alert" title="Não foi possível carregar a operação">{loadError}</Alert>}
    {!status ? !loadError && <Loading label="Carregando situação da loja…" /> : <>
      <section className="surface section stack-sm" id="alertas" aria-labelledby="t-alerts">
        <h2 id="t-alerts">Alertas</h2>
        {status.alerts.length === 0 ? <Alert tone="success" title="Nenhum alerta ativo">Pagamentos, protocolos, e-mails e processamentos estão em dia.</Alert> :
          <ul className="stack-sm" style={{ listStyle: 'none' }}>{status.alerts.map((a) => { const h = HELP[a.code] ?? { title: 'Alerta operacional', text: '' }, link = h.link?.(base); return <li key={a.code}>
            <Alert tone={a.severity === 'critical' ? 'danger' : 'warning'} title={`${h.title} (${a.value})`}><p>{h.text}</p>{link && <p><Link href={link[0]}>{link[1]}</Link></p>}<p className="caption">Código: <code>{a.code}</code></p></Alert></li>; })}</ul>}
        <dl className="summary small"><dt>Pendências financeiras</dt><dd className="num">{status.financial_incidents}</dd><dt>Pagamentos incertos</dt><dd className="num">{status.payment_uncertain}</dd><dt>Protocolos atrasados</dt><dd className="num">{status.support_overdue}</dd><dt>E-mails pendentes</dt><dd className="num">{status.notifications_pending} (falharam: {status.notifications_failed})</dd></dl>
      </section>
      <section className="surface section stack-sm" id="vendas" aria-labelledby="t-sales">
        <div className="section-head" style={{ marginBottom: 0 }}><h2 id="t-sales">Vendas</h2>{status.suspended ? <Badge tone="danger">Suspensa pela plataforma</Badge> : status.sales_paused ? <Badge tone="warning">Novas vendas pausadas</Badge> : <Badge tone="success">Recebendo pedidos</Badge>}</div>
        <p className="small muted">Pausar bloqueia novas compras; pedidos, pagamentos, devoluções e atendimento existentes continuam.</p>
        {status.suspended ? <Alert tone="danger" title="Loja suspensa pela plataforma">Novas vendas estão bloqueadas pela administração. Pedidos e obrigações anteriores continuam acessíveis.</Alert> :
          !p.owner ? <p className="small">Somente o Dono pausa ou retoma as vendas.</p> :
          status.sales_paused ? <div><button className="btn btn-primary" disabled={busy} onClick={() => void run(async () => { await api('sales/resume', 'POST', { reason: 'Retomada pelo Dono' }); await load(); await p.refresh(); }, 'Vendas retomadas.')}>Retomar vendas</button></div> :
          <form className="cluster" style={{ alignItems: 'end' }} aria-label="Pausar vendas" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void run(async () => { await api('sales/pause', 'POST', b); f.reset(); await load(); await p.refresh(); }, 'Novas vendas pausadas.'); }}>
            <Field label="Motivo da pausa">{(a) => <input className="input" name="reason" required maxLength={500} {...a} />}</Field><button className="btn btn-secondary" disabled={busy}>Pausar novas vendas</button></form>}
      </section>
      {p.owner && <CommercialSections tenantId={p.tenantId} csrf={p.csrf} />}
      {p.owner && <section className="surface section stack-sm" id="dados" aria-labelledby="t-export"><h2 id="t-export">Exportação de dados da loja</h2><p className="small muted">Gera um arquivo JSON com pedidos, pagamentos e protocolos desta loja. O link interno expira em 15 minutos e exige a sessão do Dono.</p><div><button className="btn btn-secondary" disabled={busy} onClick={() => void run(exportStore, 'Exportação gerada.')}>Exportar dados da loja</button></div></section>}
    </>}
    <AiDraftSection tenantId={p.tenantId} csrf={p.csrf} owner={p.owner} />
  </>;
}
