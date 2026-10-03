'use client';
// Rascunho de descrição com IA: nunca publica nem sobrescreve edição mais recente; o lojista revisa e decide salvar.
import { useEffect, useState } from 'react';
import { call, useAction } from './panel/api';
import { Alert, Feedback, Field, StatusBadge } from './ui/kit';
import { GENERATION } from './ui/status';

const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const usd = (micros: string) => `US$ ${(Number(micros) / 1e6).toFixed(4).replace('.', ',')}`;
type Settings = { platform_enabled: boolean; enabled: boolean; model: string; tenant_monthly_limit_micros: string; usage: { reserved_micros: string; spent_micros: string } };
type Generation = { id: string; status: string; draft: string | null; error_code: string | null; cost_micros: string | null; reserved_micros: string; model: string };

export function AiDraftSection({ tenantId, csrf, owner }: { tenantId: string; csrf: string; owner: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null), [products, setProducts] = useState<{ id: string; name: string; description: string }[]>([]), [product, setProduct] = useState(''), [gen, setGen] = useState<Generation | null>(null), [text, setText] = useState('');
  const { busy, error, notice, run, setNotice } = useAction();
  const api = (path: string, method = 'GET', body?: unknown) => call(path, { method, body, csrf });
  async function load() { setSettings(await api(`tenants/${tenantId}/ai/settings`)); const c = await api(`tenants/${tenantId}/catalogue`); setProducts(c.products); setProduct((p) => p || c.products[0]?.id || ''); }
  const act = (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await load(); }, done);
  useEffect(() => { if (csrf) void load().catch(() => undefined); }, [csrf, tenantId]);
  const current = products.find((p) => p.id === product);
  if (!settings) return null;
  return <section className="surface section stack-sm" id="ia" aria-label="Descrição com IA">
    <h2>Descrição com IA</h2>
    {!settings.platform_enabled ? <p className="small muted">Recurso desligado pela plataforma. O cadastro manual de descrições continua disponível.</p> : <>
      <p className="small muted">Modelo {settings.model}. Gasto no mês: {usd(settings.usage.spent_micros)} (reservado {usd(settings.usage.reserved_micros)}) de {usd(settings.tenant_monthly_limit_micros)}. Somente nome, categoria, opções e descrição atual são enviados.</p>
      {owner && <div><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => api(`tenants/${tenantId}/ai/settings`, 'POST', { enabled: !settings.enabled }), settings.enabled ? 'IA desligada nesta loja.' : 'IA ligada nesta loja.')}>{settings.enabled ? 'Desligar nesta loja' : 'Ligar nesta loja'}</button></div>}
      {settings.enabled && <>
        <div className="cluster" style={{ alignItems: 'end' }}><Field label="Produto">{(a) => <select className="select" value={product} onChange={(e) => { setProduct(e.target.value); setGen(null); }} {...a}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</Field>
          <button className="btn btn-primary" disabled={busy || !product} onClick={async () => { let status = ''; const ok = await act(async () => { const g = await api(`tenants/${tenantId}/catalogue/products/${product}/ai-description`, 'POST', { key: uid() }); setGen(g); setText(g.draft ?? ''); status = g.status; }, ''); /* só um rascunho concluído é anunciado como gerado; incerto ou falho tem aviso próprio */ if (ok && status === 'SUCCEEDED') setNotice('Rascunho gerado; revise antes de salvar.'); }}>{busy ? 'Gerando…' : 'Gerar rascunho'}</button></div>
        {gen && <div className="stack-sm">
          <p className="cluster-tight small"><StatusBadge map={GENERATION} value={gen.status} />{gen.error_code ? `(${gen.error_code})` : ''}{gen.cost_micros ? ` · custo ${usd(gen.cost_micros)}` : ` · reserva ${usd(gen.reserved_micros)}`}</p>
          {gen.status === 'UNKNOWN' && <Alert tone="warning" title="Resultado incerto">A reserva fica retida até a verificação. Nada foi alterado no produto.</Alert>}
          {gen.status === 'SUCCEEDED' && <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))' }}><div className="stack-sm"><h3>Descrição atual</h3><p className="prose small">{current?.description || '(vazia)'}</p></div><Field label="Rascunho (editável)">{(a) => <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} maxLength={8000} {...a} />}</Field></div>}
          {gen.status === 'SUCCEEDED' && <div className="cluster"><button className="btn btn-primary" disabled={busy} onClick={() => void act(async () => { await api(`tenants/${tenantId}/catalogue/ai-generations/${gen.id}/save`, 'POST', { text }); setGen({ ...gen, status: 'SAVED' }); }, 'Descrição salva no produto (nada foi publicado).')}>Salvar no produto</button><button className="btn btn-secondary" disabled={busy} onClick={() => void act(async () => { await api(`tenants/${tenantId}/catalogue/ai-generations/${gen.id}/discard`, 'POST'); setGen({ ...gen, status: 'DISCARDED' }); }, 'Rascunho descartado.')}>Descartar</button></div>}
        </div>}
      </>}
    </>}
    <Feedback error={error} notice={notice} />
  </section>;
}
