'use client';
// R05 — Hoje: o que pede atenção agora (alertas e pendências reais de /operations/status) e o estado das vendas.
// Configurações ocasionais ficam em /configuracoes/*; âncoras antigas (#plano, #dominio…) redirecionam para lá.
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../../components/ui/icons';
import { call, fields, useAction } from '../../../../components/panel/api';
import { usePanel } from '../../../../components/panel/Shell';
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

const OLD_ANCHORS: Record<string, string> = { '#seguranca': 'configuracoes/seguranca', '#plano': 'configuracoes/plano', '#dominio': 'configuracoes/dominio', '#transportadora': 'configuracoes/entregas', '#dados': 'configuracoes/dados', '#ia': 'configuracoes/dados' };
export default function Operation() {
  const p = usePanel(), router = useRouter(), base = `/painel/${p.tenantId}`, { busy, error, notice, run } = useAction(), [status, setStatus] = useState<Status | null>(null), [loadError, setLoadError] = useState('');
  useTitle('Hoje');
  useEffect(() => { const to = OLD_ANCHORS[location.hash]; if (to) router.replace(`${base}/${to}`); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const api = (path: string, method = 'GET', body?: unknown) => call(`tenants/${p.tenantId}/operations/${path}`, { method, body, csrf: p.csrf });
  const load = useCallback(async () => setStatus(await api('status')), [p.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load().catch((e) => setLoadError(e.message)); }, [load]);
  const counters = status ? [
    { n: status.financial_incidents, label: status.financial_incidents === 1 ? 'pendência financeira' : 'pendências financeiras', href: `${base}/pedidos?pending=true`, tone: 'danger' },
    { n: status.payment_uncertain, label: status.payment_uncertain === 1 ? 'pagamento sem confirmação' : 'pagamentos sem confirmação', href: `${base}/pedidos?pending=true`, tone: 'warning' },
    { n: status.support_overdue, label: status.support_overdue === 1 ? 'protocolo com prazo vencido' : 'protocolos com prazo vencido', href: `${base}/atendimento?filtro=overdue`, tone: 'danger' },
    { n: status.notifications_failed, label: status.notifications_failed === 1 ? 'e-mail não entregue' : 'e-mails não entregues', href: `${base}/pedidos`, tone: 'warning' },
  ] : [];
  const open = counters.filter((c) => c.n > 0);
  return <>
    <PageHeader title="Hoje" meta="O que pede atenção agora. Pedidos e protocolos ficam nas próprias áreas." />
    <Feedback error={error} notice={notice} />
    {loadError && <Alert tone="danger" role="alert" title="Não foi possível carregar a situação da loja">{loadError}</Alert>}
    {!status ? !loadError && <Loading label="Carregando situação da loja…" /> : <>
      <section className="surface section stack-sm" id="alertas" aria-labelledby="t-alerts">
        <h2 id="t-alerts">Alertas</h2>
        {status.alerts.length === 0 && open.length === 0 ? <p className="ok-line"><span className="badge badge-success">Sem alertas</span><span className="small muted">Pagamentos, protocolos e e-mails sem pendências.</span></p> : <>
          {open.length > 0 && <ul className="attention-list">{open.map((c) => <li key={c.label}><Link href={c.href}><span className={`attention-n tone-${c.tone}`}>{c.n}</span><span>{c.label}</span><Icon name="chevron" size={16} /></Link></li>)}</ul>}
          {status.alerts.length > 0 && <ul className="stack-sm" style={{ listStyle: 'none' }}>{status.alerts.map((a) => { const h = HELP[a.code] ?? { title: 'Alerta operacional', text: 'Verifique o processamento da loja.' }, link = h.link?.(base); return <li key={a.code}>
            <Alert tone={a.severity === 'critical' ? 'danger' : 'warning'} title={`${h.title} (${a.value})`}><p>{h.text}</p>{link && <p><Link href={link[0]}>{link[1]}</Link></p>}</Alert></li>; })}</ul>}
        </>}
        <p className="small"><Link href={`${base}/pedidos?payment_status=PAID&fulfillment_status=UNFULFILLED`}>Ver pedidos pagos a enviar</Link><span className="muted"> · os alertas não incluem a fila de envio</span></p>
      </section>
      <section className="surface section stack-sm" id="vendas" aria-labelledby="t-sales">
        <div className="section-head"><h2 id="t-sales">Vendas</h2>{status.suspended ? <Badge tone="danger">Suspensa pela plataforma</Badge> : status.sales_paused ? <Badge tone="warning">Novas vendas pausadas</Badge> : <Badge tone="success">Recebendo pedidos</Badge>}</div>
        {status.suspended ? <Alert tone="danger" title="Loja suspensa pela plataforma">Novas vendas estão bloqueadas pela administração. Pedidos e obrigações anteriores continuam acessíveis.</Alert> :
          !p.owner ? <p className="small muted">Somente o Dono pausa ou retoma as vendas.</p> :
          status.sales_paused ? <><p className="small muted">A loja continua no ar, mas não aceita compras novas.</p><div><button className="btn btn-primary" disabled={busy} onClick={() => void run(async () => { await api('sales/resume', 'POST', { reason: 'Retomada pelo Dono' }); await load(); await p.refresh(); }, 'Vendas retomadas.')}>Retomar vendas</button></div></> :
          <details className="fold"><summary><span className="fold-title">Pausar novas vendas</span><span className="fold-summary">Para inventário, férias ou falta de estoque. Pedidos já feitos continuam.</span></summary>
            <form className="cluster fold-body" style={{ alignItems: 'end' }} aria-label="Pausar vendas" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = e.currentTarget, b = fields(f); void run(async () => { await api('sales/pause', 'POST', b); f.reset(); await load(); await p.refresh(); }, 'Novas vendas pausadas.'); }}>
              <Field label="Motivo da pausa" hint="Fica registrado; o comprador não vê.">{(a) => <input className="input" name="reason" required maxLength={500} {...a} />}</Field><button className="btn btn-secondary" disabled={busy}>Pausar novas vendas</button></form></details>}
      </section>
      <section className="surface section stack-sm" aria-labelledby="t-shortcuts"><h2 id="t-shortcuts">Atalhos</h2>
        <ul className="shortcut-list">
          <li><Link href={`${base}?novo=1`}><Icon name="plus" size={16} />Cadastrar produto</Link></li>
          <li><Link href={`${base}/pedidos`}><Icon name="receipt" size={16} />Ver pedidos</Link></li>
          {p.owner && <li><Link href={`${base}/aparencia`}><Icon name="brush" size={16} />Editar aparência da loja</Link></li>}
          <li><a href={`/lojas/${p.store.slug}`}><Icon name="eye" size={16} />Ver loja publicada</a></li>
        </ul>
      </section>
    </>}
  </>;
}
