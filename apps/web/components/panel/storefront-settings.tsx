'use client';
// R02 — Vitrine e frete: fornecedor, tema (rascunho → preview → publicação) e regras de frete local. Somente o Dono edita;
// a API também recusa outros papéis. Os editores de listas geram o mesmo JSON aceito antes pelo endpoint de rascunho.
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { call, fields, useAction } from './api';
import { usePanel } from './Shell';
import type { Catalogue } from './catalog';
import { Alert, Badge, EmptyState, Feedback, Field, MoneyInput, PageHeader, useDirty } from '../ui/kit';
import { brandTokens, contrast, normalizeColor, storeStyle } from '../brand';
import { formatDateTime, money, toCents } from '../ui/format';

export type StorefrontSettings = { profile?: { profile: Record<string, unknown> }; state?: { draft_revision_id: string | null; published_revision_id: string | null }; revisions: { id: string; content: Record<string, unknown>; created_at?: string }[]; shipping: { id: string; name: string; kind: string; price_cents: string; cep_start?: string | null; cep_end?: string | null; days?: number; priority?: number }[] };
type Page = { slug: string; title: string; body: string }; type MenuItem = { label: string; path: string };

export function StoreTabs({ current }: { current: 'vitrine' | 'frete' }) {
  const p = usePanel(), base = `/painel/${p.tenantId}`;
  return <nav aria-label="Seções da vitrine"><ul className="subnav"><li><Link href={`${base}?aba=vitrine`} aria-current={current === 'vitrine' ? 'page' : undefined}>Fornecedor e tema</Link></li><li><Link href={`${base}?aba=frete`} aria-current={current === 'frete' ? 'page' : undefined}>Frete e retirada</Link></li></ul></nav>;
}
const ownerOnly = <Alert tone="info" title="Somente o Dono edita esta área">Funcionários veem as informações publicadas, mas fornecedor, tema e frete são alterados pelo Dono da loja.</Alert>;

export function StorefrontTab({ settings, catalogue, reload }: { settings: StorefrontSettings; catalogue: Catalogue; reload: () => Promise<void> }) {
  const p = usePanel(), { busy, error, notice, run } = useAction(), draft = settings.revisions.find((r) => r.id === settings.state?.draft_revision_id) ?? settings.revisions[0];
  const c = (draft?.content ?? {}) as Record<string, any>, profile = (settings.profile?.profile ?? {}) as Record<string, any>;
  const [color, setColor] = useState(normalizeColor(c.color ?? '#245742')), [font, setFont] = useState<string>(c.font === 'serif' ? 'serif' : 'system');
  const [pages, setPages] = useState<Page[]>(Array.isArray(c.pages) ? c.pages : []), [menu, setMenu] = useState<MenuItem[]>(Array.isArray(c.menu) ? c.menu : [{ label: 'Catálogo', path: '/' }]), [assets, setAssets] = useState<string[]>(Array.isArray(c.assets) ? c.assets : []);
  const theme = useDirty(), supplier = useDirty();
  const api = (path: string, body: unknown) => call(`tenants/${p.tenantId}/storefront/${path}`, { method: 'POST', body, csrf: p.csrf });
  const brand = brandTokens(color), pending = settings.state?.draft_revision_id && settings.state.draft_revision_id !== settings.state.published_revision_id;
  const readyMedia = catalogue.media.filter((m) => m.status === 'READY');
  function saveProfile(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const b = fields(e.currentTarget); void run(async () => { await api('profile', { ...b, synthetic: b.synthetic === 'on' }); supplier.clean(); await reload(); }, 'Fornecedor e políticas salvos.'); }
  function saveDraft(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const b = fields(e.currentTarget);
    void run(async () => { await api('draft', { schema_version: 1, title: b.title, description: b.description, hero: b.hero, color, font, pages: pages.filter((x) => x.slug && x.title), menu: menu.filter((x) => x.label && x.path), assets }); theme.clean(); await reload(); }, 'Rascunho do tema salvo. Confira no preview e publique quando estiver pronto.');
  }
  return <>
    <PageHeader eyebrow="Vitrine e frete" title="Fornecedor e tema" meta={settings.state?.published_revision_id ? (pending ? 'Há alterações de tema em rascunho ainda não publicadas.' : 'O rascunho atual é o tema publicado.') : 'A vitrine ainda não foi publicada.'}
      actions={p.owner ? <><a className="btn btn-secondary" href={`/preview/${p.tenantId}`}>Ver preview do rascunho</a><button className="btn btn-primary" disabled={busy || !settings.state?.draft_revision_id || !pending} onClick={() => void run(async () => { await api('publish', { revision_id: settings.state!.draft_revision_id }); await reload(); }, 'Vitrine publicada.')}>Publicar vitrine local</button></> : undefined} />
    <StoreTabs current="vitrine" />
    <Feedback error={error} notice={notice} />
    {!p.owner ? ownerOnly : <>
      <section className="surface" aria-labelledby="t-supplier"><div className="section stack-sm form-col">
        <div className="section-head"><h2 id="t-supplier">Fornecedor e políticas</h2>{supplier.dirty && <p className="dirty">Alterações não salvas</p>}</div>
        <p className="small muted">Aparece no rodapé da vitrine e no comprovante (identificação do fornecedor). Neste ambiente, publicação local exige nome com TESTE; não invente identidade fiscal.</p>
        <form className="form" aria-label="Perfil do fornecedor" onSubmit={saveProfile} onChange={supplier.markDirty}>
          <label className="check"><input name="synthetic" type="checkbox" defaultChecked={profile.synthetic !== false} /> Perfil sintético de teste (exibe aviso de loja fictícia na vitrine)</label>
          <Field label="Nome do fornecedor">{(a) => <input className="input" name="name" defaultValue={String(profile.name ?? '')} required {...a} />}</Field>
          <Field label="CPF/CNPJ" optional hint="Deixe vazio em lojas de teste.">{(a) => <input className="input" name="document" defaultValue={String(profile.document ?? '')} {...a} />}</Field>
          <Field label="Endereço físico">{(a) => <input className="input" name="address" defaultValue={String(profile.address ?? '')} required {...a} />}</Field>
          <div className="form-grid"><Field label="E-mail de contato">{(a) => <input className="input" name="email" type="email" defaultValue={String(profile.email ?? '')} required {...a} />}</Field><Field label="Telefone">{(a) => <input className="input" name="phone" defaultValue={String(profile.phone ?? '')} required {...a} />}</Field></div>
          <Field label="Entrega e restrições">{(a) => <input className="input" name="delivery" defaultValue={String(profile.delivery ?? '')} required {...a} />}</Field>
          <Field label="Cuidados e riscos dos produtos" optional>{(a) => <input className="input" name="risks" defaultValue={String(profile.risks ?? '')} {...a} />}</Field>
          <Field label="Políticas (trocas, arrependimento, privacidade)">{(a) => <textarea className="textarea" name="policies" defaultValue={String(profile.policies ?? '')} required {...a} />}</Field>
          <div><button className="btn btn-secondary" disabled={busy}>Salvar fornecedor</button></div>
        </form>
      </div></section>
      <section className="surface" aria-labelledby="t-theme"><div className="section stack-sm">
        <div className="section-head"><h2 id="t-theme">Tema — rascunho</h2>{theme.dirty ? <p className="dirty">Alterações não salvas</p> : <p>{draft?.created_at ? `Última versão em ${formatDateTime(draft.created_at, p.timezone)}` : 'Nenhum rascunho salvo.'}</p>}</div>
        <form className="form form-col" aria-label="Salvar tema" key={draft?.id ?? 'novo'} onSubmit={saveDraft} onChange={theme.markDirty}>
          <Field label="Título da loja">{(a) => <input className="input" name="title" required defaultValue={String(c.title ?? 'Minha loja TESTE')} {...a} />}</Field>
          <Field label="Descrição" hint="Usada nos resultados de busca e no topo da vitrine.">{(a) => <input className="input" name="description" required defaultValue={String(c.description ?? '')} {...a} />}</Field>
          <Field label="Mensagem principal" optional>{(a) => <input className="input" name="hero" defaultValue={String(c.hero ?? '')} {...a} />}</Field>
          <div className="form-grid">
            <Field label="Cor da marca" hint="Escolha livre. Se faltar contraste, a vitrine usa uma versão ajustada só para textos e botões.">{(a) => <div className="cluster-tight"><input className="input" type="color" value={color} onChange={(e) => { setColor(e.target.value.toUpperCase()); theme.markDirty(); }} {...a} /><code>{color}</code></div>}</Field>
            <Field label="Fonte dos títulos" hint="Textos, preços e formulários usam sempre a fonte principal.">{(a) => <select className="select" value={font} onChange={(e) => { setFont(e.target.value); theme.markDirty(); }} {...a}><option value="system">Sem serifa (padrão)</option><option value="serif">Serifada</option></select>}</Field>
          </div>
          <div className="surface-store" style={{ ...storeStyle(color, font), minHeight: 0, border: '1px solid var(--store-color-border)', borderRadius: 'var(--radius-surface)', padding: 'var(--space-16)' } as React.CSSProperties} aria-label="Prévia da cor e da fonte" role="group">
            <p className="caption">Prévia</p><p className="display" style={{ fontSize: 'var(--font-size-20)', fontWeight: 600 }}>{String(c.title ?? 'Minha loja')}</p>
            <div className="cluster" style={{ marginTop: 'var(--space-8)' }}><span className="btn btn-primary" aria-hidden>Adicionar ao carrinho</span><a href="#t-theme" onClick={(e) => e.preventDefault()}>Link da loja</a></div>
          </div>
          {brand.adjusted ? <Alert tone="warning" role="note" title="Usaremos uma versão ajustada da cor">A cor {color} tem contraste {contrast(color, '#FFFFFF').toFixed(2).replace('.', ',')}:1 com o fundo branco. Para manter a leitura, botões usam {brand.fill === color ? `texto ${brand.onFill === '#FFFFFF' ? 'branco' : 'escuro'}${brand.border !== brand.fill ? ' e contorno escuro' : ''}` : `o tom ${brand.fill}`} e links usam {brand.text}. A cor escolhida continua salva como {color}.</Alert> : <p className="small muted">Contraste suficiente: a cor é usada sem ajustes.</p>}
          <fieldset><legend>Menu da vitrine</legend>
            <div className="stack-sm">{menu.map((m, i) => <div className="attr-row" key={i}>
              <Field label={`Rótulo ${i + 1}`}>{(a) => <input className="input" value={m.label} maxLength={40} onChange={(e) => { setMenu(menu.map((x, j) => j === i ? { ...x, label: e.target.value } : x)); theme.markDirty(); }} {...a} />}</Field>
              <Field label={`Destino ${i + 1}`} hint={i === 0 ? 'Caminho interno: / ou /paginas/sobre' : undefined}>{(a) => <input className="input" value={m.path} maxLength={100} onChange={(e) => { setMenu(menu.map((x, j) => j === i ? { ...x, path: e.target.value } : x)); theme.markDirty(); }} {...a} />}</Field>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setMenu(menu.filter((_, j) => j !== i)); theme.markDirty(); }} aria-label={`Remover item ${i + 1} do menu`}>Remover</button></div>)}</div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMenu([...menu, { label: '', path: '/' }])}>Adicionar item de menu</button>
          </fieldset>
          <fieldset><legend>Páginas institucionais</legend>
            <div className="stack">{pages.map((pg, i) => <div className="variant-new stack-sm" key={i}>
              <div className="form-grid"><Field label="Título da página">{(a) => <input className="input" value={pg.title} onChange={(e) => { setPages(pages.map((x, j) => j === i ? { ...x, title: e.target.value } : x)); theme.markDirty(); }} {...a} />}</Field>
                <Field label="Endereço" hint={`/paginas/${pg.slug || 'endereco'}`}>{(a) => <input className="input" value={pg.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(e) => { setPages(pages.map((x, j) => j === i ? { ...x, slug: e.target.value } : x)); theme.markDirty(); }} {...a} />}</Field></div>
              <Field label="Texto">{(a) => <textarea className="textarea" value={pg.body} onChange={(e) => { setPages(pages.map((x, j) => j === i ? { ...x, body: e.target.value } : x)); theme.markDirty(); }} {...a} />}</Field>
              <div><button type="button" className="btn btn-quiet btn-sm" onClick={() => { setPages(pages.filter((_, j) => j !== i)); theme.markDirty(); }}>Remover página</button></div></div>)}</div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPages([...pages, { slug: '', title: '', body: '' }])}>Adicionar página</button>
          </fieldset>
          <fieldset><legend>Imagem de destaque do tema <span className="optional">(opcional)</span></legend>
            {readyMedia.length === 0 ? <p className="small muted">Nenhuma imagem processada. Envie em Catálogo › Mídia.</p> : <div className="stack-sm">{readyMedia.slice(0, 20).map((m) => <label className="check" key={m.id}><input type="checkbox" checked={assets.includes(m.id)} onChange={(e) => { setAssets(e.target.checked ? [...assets, m.id] : assets.filter((x) => x !== m.id)); theme.markDirty(); }} /><img src={`/api/tenants/${p.tenantId}/storefront/media/${m.id}/small`} alt="" width={40} height={50} style={{ objectFit: 'cover', borderRadius: 4 }} /><code className="small">{m.id.slice(0, 13)}…</code></label>)}</div>}
          </fieldset>
          <div className="form-actions"><button className="btn btn-secondary" disabled={busy}>Salvar rascunho</button><a href={`/preview/${p.tenantId}`}>Ver preview</a></div>
        </form>
      </div></section>
    </>}
  </>;
}

export function ShippingTab({ settings, reload }: { settings: StorefrontSettings; reload: () => Promise<void> }) {
  const p = usePanel(), { busy, error, notice, run } = useAction(), [kind, setKind] = useState('TABLE'), [priceError, setPriceError] = useState('');
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, b = fields(form), cents = toCents(b.price_cents || '0');
    if (cents === null) { setPriceError('Informe o valor em reais, por exemplo 15,00 (0,00 para grátis).'); return; }
    setPriceError('');
    void run(async () => { await call(`tenants/${p.tenantId}/storefront/shipping`, { method: 'POST', csrf: p.csrf, body: { name: b.name, kind, ...(kind === 'TABLE' ? { cep_start: b.cep_start.replace('-', ''), cep_end: b.cep_end.replace('-', '') } : {}), price_cents: cents, days: Number(b.days), priority: Number(b.priority) } }); form.reset(); await reload(); }, 'Método de frete criado.');
  }
  return <>
    <PageHeader eyebrow="Vitrine e frete" title="Frete e retirada" meta="Regras locais por faixa de CEP e retirada. CEP sem regra impede a entrega; nunca vira frete grátis." />
    <StoreTabs current="frete" />
    <Feedback error={error} notice={notice} />
    {settings.shipping.length === 0 ? <EmptyState icon="box" title="Nenhum método de entrega">Sem método, o comprador não consegue concluir a compra.</EmptyState> :
      <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Método</th><th scope="col">Tipo</th><th scope="col">Faixa de CEP</th><th scope="col" className="num">Valor</th><th scope="col" className="num">Prazo</th><th scope="col" className="num">Prioridade</th></tr></thead>
        <tbody>{settings.shipping.map((s) => <tr key={s.id}><td className="primary">{s.name}</td><td data-label="Tipo">{s.kind === 'PICKUP' ? <Badge>Retirada</Badge> : <Badge>Tabela de CEP</Badge>}</td><td data-label="Faixa de CEP">{s.kind === 'PICKUP' ? '—' : `${s.cep_start ?? '?'} a ${s.cep_end ?? '?'}`}</td><td className="num" data-label="Valor"><span className="money">{money(s.price_cents)}</span></td><td className="num" data-label="Prazo">{s.days ?? 0} {s.days === 1 ? 'dia' : 'dias'}</td><td className="num" data-label="Prioridade">{s.priority ?? 0}</td></tr>)}</tbody></table></div>}
    {!p.owner ? ownerOnly : <section className="surface section stack-sm form-col" aria-labelledby="t-ship"><h2 id="t-ship">Novo método</h2>
      <form className="form" aria-label="Criar frete" onSubmit={create}>
        <Field label="Nome do método" hint="Aparece para o comprador, por exemplo “Entrega Grande SP”.">{(a) => <input className="input" name="name" required {...a} />}</Field>
        <fieldset><legend>Tipo</legend><div className="cluster"><label className="check"><input type="radio" name="kind-ui" checked={kind === 'TABLE'} onChange={() => setKind('TABLE')} /> Entrega por faixa de CEP</label><label className="check"><input type="radio" name="kind-ui" checked={kind === 'PICKUP'} onChange={() => setKind('PICKUP')} /> Retirada na loja</label></div></fieldset>
        {kind === 'TABLE' && <div className="form-grid"><Field label="CEP inicial">{(a) => <input className="input" name="cep_start" inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" required {...a} />}</Field><Field label="CEP final">{(a) => <input className="input" name="cep_end" inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" required {...a} />}</Field></div>}
        <div className="form-grid"><Field label="Valor" error={priceError}>{(a) => <MoneyInput name="price_cents" a11y={a} required />}</Field><Field label="Prazo (dias)">{(a) => <input className="input" name="days" type="number" min={0} defaultValue={3} required {...a} />}</Field><Field label="Prioridade" hint="Maior vence quando faixas se sobrepõem.">{(a) => <input className="input" name="priority" type="number" defaultValue={0} required {...a} />}</Field></div>
        <div><button className="btn btn-secondary" disabled={busy}>Criar método de frete</button></div>
      </form>
    </section>}
  </>;
}
