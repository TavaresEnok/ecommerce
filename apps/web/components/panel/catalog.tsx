'use client';
// R02 — Catálogo do painel: produtos, edição, variações, imagens, estoque, mídia, categorias e locais.
// Usa exatamente os endpoints existentes de /tenants/:id/catalogue (DESIGN.md §6 e §9; TELAS-E-FLUXOS R02).
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { call, ApiError, fields, useAction } from './api';
import { usePanel } from './Shell';
import { Alert, Badge, EmptyState, Feedback, Field, MoneyInput, PageHeader, StatusBadge, useLeaveGuard, useTitle } from '../ui/kit';
import { MediaUploader } from './MediaUploader';
import { Icon } from '../ui/icons';
import { MEDIA_STATUS, PRODUCT_STATUS } from '../ui/status';
import { bytes, formatDateTime, money, slugify, toCents } from '../ui/format';

export type Variant = { id: string; sku: string; attributes: Record<string, string>; is_default: boolean; active: boolean; price_cents: string; available: number; weight_g?: number; width_mm?: number; height_mm?: number; length_mm?: number };
export type Product = { id: string; name: string; slug: string; description: string; status: string; category_id: string | null; updated_at?: string; variants: Variant[]; media: { id: string }[] };
export type Catalogue = { products: Product[]; categories: { id: string; name: string; slug: string }[]; locations: { id: string; name: string }[]; inventory: { id: string; variant_id: string; location_id: string; on_hand: number; reserved: number }[]; movements: { id: string; inventory_item_id: string; reason: string; delta: number; balance: number; created_at: string }[]; media: { id: string; status: string; stored_bytes: string }[] };

const options = (v: Variant) => Object.entries(v.attributes).map(([k, x]) => `${k}: ${x}`).join(', ') || 'Padrão (sem opções)';
const priceRange = (p: Product) => { const prices = p.variants.filter((v) => v.active).map((v) => BigInt(v.price_cents)); if (!prices.length) return null; const min = prices.reduce((a, b) => (b < a ? b : a)), max = prices.reduce((a, b) => (b > a ? b : a)); return min === max ? money(min.toString()) : `${money(min.toString())} a ${money(max.toString())}`; };
const PriceRange = ({ p }: { p: Product }) => { const r = priceRange(p); if (!r) return <span className="muted">Sem preço</span>; const [a, b] = r.split(' a '); return b ? <span><span className="money">{a}</span> a <span className="money">{b}</span></span> : <span className="money">{a}</span>; };
const thumbUrl = (tenant: string, asset: string, size = 'small') => `/api/tenants/${tenant}/storefront/media/${asset}/${size}`;
export function Thumb({ tenant, product, size = 48 }: { tenant: string; product: Product; size?: number }) {
  const m = product.media[0];
  return m ? <span className="thumb" style={{ width: size, height: size }}><img src={thumbUrl(tenant, m.id)} alt="" width={size} height={size} loading="lazy" /></span> : <span className="thumb no-photo" style={{ width: size, height: size }}><Icon name="image" size={16} /><span className="sr-only">Sem foto</span></span>;
}
const stockOf = (x: Product) => { const active = x.variants.filter((v) => v.active); return { active, available: active.reduce((s, v) => s + Math.max(0, v.available), 0), soldOut: active.filter((v) => v.available <= 0).length }; };
// Limite real da listagem do painel: a API devolve os 100 primeiros produtos por nome e não pagina (TELAS-E-FLUXOS R02).
export const LIST_LIMIT = 100;
const LIST_KEY = (tenant: string) => `painel-${tenant}-produtos`;

// ---------- Listagem ----------
export function ProductList({ catalogue }: { catalogue: Catalogue }) {
  const p = usePanel(), router = useRouter(), params = useSearchParams(), base = `/painel/${p.tenantId}`;
  // Busca e filtros vivem na URL: o botão Voltar do editor (e do navegador) devolve a mesma lista.
  const query = params.get('q') ?? '', status = params.get('status') ?? 'all', category = params.get('categoria') ?? '';
  const [draft, setDraft] = useState(query), [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => setDraft(query), [query]);
  function setParams(next: Record<string, string>) {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v && v !== 'all') u.set(k, v); else u.delete(k); }
    const qs = u.toString(); router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    try { sessionStorage.setItem(LIST_KEY(p.tenantId), qs); } catch { /* sem storage */ }
  }
  useEffect(() => { const t = setTimeout(() => { if (draft !== query) setParams({ q: draft }); }, 250); return () => clearTimeout(t); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const total = catalogue.products.length, atLimit = total >= LIST_LIMIT;
  const counts = useMemo(() => ({ all: total, ACTIVE: catalogue.products.filter((x) => x.status === 'ACTIVE').length, DRAFT: catalogue.products.filter((x) => x.status === 'DRAFT').length, ARCHIVED: catalogue.products.filter((x) => x.status === 'ARCHIVED').length }), [catalogue, total]);
  const shown = catalogue.products.filter((x) => (status === 'all' || x.status === status) && (!category || x.category_id === category) && (!query || norm(`${x.name} ${x.slug} ${x.variants.map((v) => v.sku).join(' ')}`).includes(norm(query.trim()))));
  const categoryName = (id: string | null) => catalogue.categories.find((c) => c.id === id)?.name;
  const statusName: Record<string, string> = { all: 'Todos', ACTIVE: 'Ativos', DRAFT: 'Rascunhos', ARCHIVED: 'Arquivados' };
  const activeFilters = (status !== 'all' ? 1 : 0) + (category ? 1 : 0);
  const editHref = (id: string) => `${base}?produto=${id}`;
  return <>
    <div className="page-head">
      <div><h1>Produtos</h1><p className="meta">{total === 0 ? 'Nenhum produto ainda' : `${total} ${total === 1 ? 'produto' : 'produtos'}, ${counts.ACTIVE} ${counts.ACTIVE === 1 ? 'ativo' : 'ativos'} na loja`}</p></div>
      <Link className="btn btn-primary" href={`${base}?novo=1`}><Icon name="plus" />Novo produto</Link>
    </div>
    {total === 0 ? <EmptyState icon="box" title="Cadastre o primeiro produto" action={<Link className="btn btn-primary" href={`${base}?novo=1`}>Cadastrar produto</Link>}>Comece pelo item que você mais vende. Ele aparece na loja quando estiver ativo e a aparência estiver publicada.</EmptyState> : <>
      <div className="list-toolbar" role="search" aria-label="Buscar e filtrar produtos">
        <div className="search-field">
          <label htmlFor="q-prod">{atLimit ? `Buscar nos primeiros ${LIST_LIMIT} produtos (A–Z)` : `Buscar em ${total} ${total === 1 ? 'produto' : 'produtos'}`}</label>
          <div className="search-input"><Icon name="search" /><input className="input" id="q-prod" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nome, endereço ou SKU" autoComplete="off" enterKeyHint="search" /></div>
        </div>
        <button type="button" className="btn btn-secondary filter-toggle" aria-expanded={filtersOpen} aria-controls="filtros-produtos" onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="filter" />Filtros{activeFilters > 0 && <span className="count-pill" aria-label={`${activeFilters} ativos`}>{activeFilters}</span>}</button>
        <div id="filtros-produtos" className={`filter-panel${filtersOpen ? '' : ' is-collapsed'}`}>
          <fieldset><legend>Situação</legend><div className="segmented">{(['all', 'ACTIVE', 'DRAFT', 'ARCHIVED'] as const).map((k) => <button key={k} type="button" aria-pressed={status === k} onClick={() => setParams({ status: k })}>{statusName[k]} <span className="count">{counts[k]}</span></button>)}</div></fieldset>
          {catalogue.categories.length > 0 && <div className="field narrow"><label htmlFor="c-prod">Categoria</label><select className="select" id="c-prod" value={category} onChange={(e) => setParams({ categoria: e.target.value })}><option value="">Todas</option>{catalogue.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        </div>
      </div>
      {activeFilters > 0 && <div className="applied" aria-label="Filtros aplicados">
        {status !== 'all' && <button type="button" className="chip" onClick={() => setParams({ status: 'all' })}>{statusName[status]}<Icon name="x" size={16} /><span className="sr-only">remover filtro de situação</span></button>}
        {category && <button type="button" className="chip" onClick={() => setParams({ categoria: '' })}>{categoryName(category) ?? 'Categoria'}<Icon name="x" size={16} /><span className="sr-only">remover filtro de categoria</span></button>}
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setParams({ status: 'all', categoria: '' })}>Limpar filtros</button>
      </div>}
      {atLimit && <p className="scope-note"><Icon name="info" size={16} />O painel carrega os primeiros {LIST_LIMIT} produtos em ordem alfabética. Produtos depois deles não aparecem nesta lista nem nesta busca.</p>}
      {shown.length === 0 ? <EmptyState icon="search" title={query ? `Nada encontrado para “${query}”` : 'Nenhum produto com estes filtros'} action={<button className="btn btn-secondary btn-sm" onClick={() => { setDraft(''); setParams({ q: '', status: 'all', categoria: '' }); }}>Limpar busca e filtros</button>}>{query ? 'Confira a grafia ou procure pelo SKU.' : 'Remova um filtro para ver mais produtos.'}</EmptyState> : <>
        <ul className="product-rows" aria-label="Produtos">{shown.map((x, i) => { const s = stockOf(x); return <li key={x.id} {...(i === 0 ? { 'data-first-item': '' } : {})}>
          <Thumb tenant={p.tenantId} product={x} />
          <div className="pr-main"><Link href={editHref(x.id)} className="pr-name">{x.name}</Link><span className="pr-sub">{categoryName(x.category_id) ?? 'Sem categoria'}{s.active.length > 1 ? `, ${s.active.length} variações` : ''}</span></div>
          <div className="pr-side"><PriceRange p={x} /><span className="pr-stock">{s.available <= 0 ? <Badge tone="warning">Sem saldo</Badge> : `${s.available} disponíveis`}</span>{x.status !== 'ACTIVE' && <StatusBadge map={PRODUCT_STATUS} value={x.status} />}</div>
          <Icon name="chevron" />
        </li>; })}</ul>
        <table className="data product-table">
          <caption className="sr-only">Produtos carregados. Disponível = em estoque menos reservado, somando as variações ativas.</caption>
          <thead><tr><th scope="col">Produto</th><th scope="col">Situação</th><th scope="col" className="num">Disponível</th><th scope="col" className="num">Preço</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{shown.map((x, i) => { const s = stockOf(x); return <tr key={x.id} {...(i === 0 ? { 'data-first-item': '' } : {})}>
            <td className="primary"><div className="cell-main"><Thumb tenant={p.tenantId} product={x} size={40} /><span><Link href={editHref(x.id)}>{x.name}</Link><span className="cell-sub">{categoryName(x.category_id) ?? 'Sem categoria'}{s.active.length > 1 ? `, ${s.active.length} variações` : `, SKU ${s.active[0]?.sku ?? '—'}`}</span></span></div></td>
            <td><StatusBadge map={PRODUCT_STATUS} value={x.status} /></td>
            <td className="num">{s.available <= 0 ? <Badge tone="warning">Sem saldo</Badge> : <span>{s.available}{s.soldOut > 0 && <span className="muted"> ({s.soldOut} esgotada{s.soldOut > 1 ? 's' : ''})</span>}</span>}</td>
            <td className="num"><PriceRange p={x} /></td>
            <td><Link className="btn btn-secondary btn-sm" href={editHref(x.id)} aria-label={`Editar ${x.name}`}>Editar</Link></td>
          </tr>; })}</tbody>
        </table>
        <p className="list-foot" role="status">{shown.length === total ? `${total} ${total === 1 ? 'produto' : 'produtos'}` : `${shown.length} de ${total} produtos`}</p>
      </>}
    </>}
  </>;
}

// ---------- Cadastro ----------
export function NewProduct({ catalogue }: { catalogue: Catalogue }) {
  const p = usePanel(), router = useRouter(), base = `/painel/${p.tenantId}`, { busy, error, run } = useAction();
  const [slug, setSlug] = useState(''), [touched, setTouched] = useState(false), [priceError, setPriceError] = useState(''), [conflict, setConflict] = useState<{ slug?: string; sku?: string }>({}), [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty && !busy);
  useTitle('Novo produto');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const b = fields(e.currentTarget), cents = toCents(b.price_cents || '');
    if (!cents) { setPriceError('Informe o preço em reais, por exemplo 49,90.'); return; }
    setPriceError(''); setConflict({});
    void run(async () => {
      try { const r = await call(`tenants/${p.tenantId}/catalogue/products`, { method: 'POST', csrf: p.csrf, body: { ...b, price_cents: cents, ...(b.category_id ? {} : { category_id: undefined }) } }); setDirty(false); router.push(`${base}?produto=${r.id}&criado=1`); }
      catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
        // A API diz qual campo colidiu quando sabe; o painel confere também nos produtos carregados.
        const slugTaken = /endereço/i.test(err.message) || catalogue.products.some((x) => x.slug === b.slug), skuTaken = /sku/i.test(err.message) || catalogue.products.some((x) => x.variants.some((v) => v.sku === b.sku));
        if (slugTaken || skuTaken) { setConflict({ slug: slugTaken ? 'Já existe um produto com este endereço. Escolha outro.' : undefined, sku: skuTaken ? 'Este SKU já é usado por outra variação desta loja.' : undefined }); throw new Error(slugTaken && skuTaken ? 'Endereço e SKU já estão em uso.' : slugTaken ? 'O endereço já está em uso.' : 'O SKU já está em uso.'); }
        throw new Error(err.message);
      }
    });
  }
  return <>
    {guard}
    <PageHeader back={{ href: base, label: 'Produtos' }} title="Novo produto" meta="Começa como rascunho, com uma única variação. Cor, tamanho e outras opções entram depois, na edição." />
    {error && <Alert tone="danger" role="alert" title="O produto não foi cadastrado">{error} O que você digitou continua no formulário.</Alert>}
    <section className="surface section" aria-labelledby="t-new-product">
      <h2 id="t-new-product" className="sr-only">Cadastrar produto simples</h2>
      <form className="form form-col" aria-label="Cadastrar produto" onSubmit={submit} onChange={() => setDirty(true)}>
        <Field label="Nome">{(a) => <input className="input" name="name" required maxLength={200} onChange={(e) => { if (!touched) setSlug(slugify(e.target.value)); }} {...a} />}</Field>
        <div className="form-grid">
          <Field label="Preço" error={priceError}>{(a) => <MoneyInput name="price_cents" a11y={a} required />}</Field>
          <Field label="SKU" hint="Código interno, único na loja." error={conflict.sku}>{(a) => <input className="input" name="sku" required maxLength={80} {...a} />}</Field>
        </div>
        <Field label="Descrição" optional hint="Materiais, medidas e cuidados. Texto simples.">{(a) => <textarea className="textarea" name="description" maxLength={8000} {...a} />}</Field>
        <div className="form-grid">
          <Field label="Categoria" optional>{(a) => <select className="select" name="category_id" {...a}><option value="">Sem categoria</option>{catalogue.categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select>}</Field>
          <Field label="Endereço na loja" error={conflict.slug} hint={`Fica em /produtos/${slug || 'nome-do-produto'}`}>{(a) => <input className="input" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required value={slug} onChange={(e) => { setTouched(true); setSlug(e.target.value); }} {...a} />}</Field>
        </div>
        <div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Cadastrando…' : 'Cadastrar produto'}</button><Link className="btn btn-quiet" href={base}>Cancelar</Link></div>
      </form>
    </section>
  </>;
}

// ---------- Edição progressiva ----------
// Primeiro o essencial (nome, preço, disponibilidade, imagens, situação, descrição); variações, estoque por local,
// organização e endereço ficam em seções com resumo, abertas sob demanda. Um erro dentro de uma seção a mantém aberta.
export function ProductEditor({ catalogue, product, reload }: { catalogue: Catalogue; product: Product; reload: () => Promise<void> }) {
  const p = usePanel(), params = useSearchParams(), base = `/painel/${p.tenantId}`, { busy, error, notice, run, setNotice } = useAction();
  const [dirty, setDirty] = useState(false), [errors, setErrors] = useState<{ slug?: string; price?: string; name?: string }>({}), [open, setOpen] = useState<Record<string, boolean>>({});
  const guard = useLeaveGuard(dirty && !busy);
  useTitle(product.name);
  useEffect(() => { if (params.get('criado') === '1') setNotice('Produto cadastrado como rascunho. Adicione imagens e ative quando estiver pronto.'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const api = (path: string, method = 'GET', body?: unknown) => call(`tenants/${p.tenantId}/catalogue/${path}`, { method, body, csrf: p.csrf });
  const after = async (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await reload(); }, done);
  const active = product.variants.filter((v) => v.active), single = active.length === 1 ? active[0] : null, s = stockOf(product);
  const listQuery = (() => { try { return sessionStorage.getItem(LIST_KEY(p.tenantId)) || ''; } catch { return ''; } })();
  const backHref = listQuery ? `${base}?${listQuery}` : base;
  const totals = catalogue.inventory.filter((i) => active.some((v) => v.id === i.variant_id)).reduce((t, i) => ({ on: t.on + i.on_hand, res: t.res + i.reserved }), { on: 0, res: 0 });
  const locationsUsed = new Set(catalogue.inventory.filter((i) => active.some((v) => v.id === i.variant_id)).map((i) => i.location_id)).size;
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const b = fields(e.currentTarget), next: typeof errors = {};
    const cents = single ? toCents(b.price || '') : null;
    if (single && !cents) next.price = 'Informe o preço em reais, por exemplo 49,90.';
    if (!b.name?.trim()) next.name = 'Informe o nome do produto.';
    if (Object.keys(next).length) { setErrors(next); return; }
    setErrors({});
    void run(async () => {
      try { await api(`products/${product.id}`, 'PATCH', { name: b.name, slug: b.slug, description: b.description, status: b.status, category_id: b.category_id || null }); }
      catch (err) { if (err instanceof ApiError && err.status === 409) { setErrors({ slug: 'Este endereço já é usado (ou foi usado) por outro produto da loja.' }); setOpen((o) => ({ ...o, organizacao: true })); throw new Error('Nada foi salvo: corrija o endereço em “Organização e endereço”.'); } throw err; }
      if (single && cents && cents !== single.price_cents) {
        try { await api(`variants/${single.id}`, 'PATCH', { price_cents: cents }); }
        catch (err) { await reload(); setDirty(false); throw new Error(`As informações foram salvas, mas o preço não: ${err instanceof Error ? err.message : 'erro desconhecido'}. Tente salvar o preço de novo.`); }
      }
      setDirty(false); await reload();
    }, 'Alterações salvas.');
  }
  const publicUrl = `/lojas/${p.store.slug}/produtos/${product.slug}`;
  const section = (key: string) => ({ open: open[key] ?? false, onToggle: (e: SyntheticEvent<HTMLDetailsElement>) => { const isOpen = e.currentTarget.open; setOpen((o) => (o[key] === isOpen ? o : { ...o, [key]: isOpen })); } });
  return <>
    {guard}
    <PageHeader back={{ href: backHref, label: 'Produtos' }} title={product.name}
      meta={<span className="cluster-tight"><StatusBadge map={PRODUCT_STATUS} value={product.status} /><span>{product.status === 'ACTIVE' ? 'Aparece na loja publicada' : 'Não aparece na loja'}</span>{product.updated_at && <span className="muted">Atualizado em {formatDateTime(product.updated_at, p.timezone)}</span>}</span>}
      actions={product.status === 'ACTIVE' ? <a className="btn btn-secondary" href={publicUrl}><Icon name="eye" />Ver na loja</a> : null} />
    <Feedback error={error} notice={notice} />
    <div className="editor-layout">
      <div className="editor-main">
        <form className="surface section form" id="product-info" aria-labelledby="t-info" onSubmit={save} onChange={() => setDirty(true)} key={`${product.id}-${product.updated_at}-${single?.price_cents}`}>
          <div className="section-head"><h2 id="t-info">Informações principais</h2>{dirty && <p className="dirty" role="status">Alterações não salvas</p>}</div>
          <Field label="Nome" error={errors.name}>{(a) => <input className="input" name="name" defaultValue={product.name} required maxLength={200} {...a} />}</Field>
          <div className="form-grid">
            {single ? <Field label="Preço" error={errors.price}>{(a) => <MoneyInput name="price" defaultCents={single.price_cents} a11y={a} required />}</Field> :
              <div className="field"><span className="label">Preço</span><p className="value-line"><PriceRange p={product} /></p><p className="hint">Cada variação tem seu preço. <button type="button" className="btn btn-quiet btn-sm inline" onClick={() => setOpen((o) => ({ ...o, variacoes: true }))}>Editar nas variações</button></p></div>}
            <div className="field"><span className="label">Disponível para venda</span><p className="value-line num">{s.available <= 0 ? <Badge tone="warning">Sem saldo</Badge> : <strong>{s.available} {s.available === 1 ? 'unidade' : 'unidades'}</strong>}</p><p className="hint"><button type="button" className="btn btn-quiet btn-sm inline" onClick={() => setOpen((o) => ({ ...o, estoque: true }))}>Ajustar estoque</button></p></div>
          </div>
          <Field label="Situação" hint={product.status === 'ACTIVE' ? 'Arquivar tira o produto da loja e mantém os pedidos.' : 'Ativo exige uma variação com preço; o produto passa a aparecer na loja publicada.'}>{(a) => <select className="select" name="status" defaultValue={product.status} {...a}><option value="DRAFT">Rascunho (não aparece na loja)</option><option value="ACTIVE">Ativo (aparece na loja)</option><option value="ARCHIVED">Arquivado</option></select>}</Field>
          <Field label="Descrição" optional hint="Texto simples, até 8.000 caracteres.">{(a) => <textarea className="textarea" name="description" defaultValue={product.description} maxLength={8000} rows={5} {...a} />}</Field>
          <details className="fold" {...section('organizacao')} open={open.organizacao || !!errors.slug}>
            <summary><span className="fold-title">Organização e endereço</span><span className="fold-summary">{catalogue.categories.find((c) => c.id === product.category_id)?.name ?? 'Sem categoria'}, /produtos/{product.slug}</span></summary>
            <div className="fold-body form-grid">
              <Field label="Categoria">{(a) => <select className="select" name="category_id" defaultValue={product.category_id ?? ''} {...a}><option value="">Sem categoria</option>{catalogue.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
              <Field label="Endereço na loja" error={errors.slug} hint="Ao mudar, o endereço antigo leva para o novo.">{(a) => <input className="input" name="slug" defaultValue={product.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" required {...a} />}</Field>
            </div>
          </details>
          <div className="form-actions sticky-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>{dirty && <span className="action-note">Salva nome, preço, situação, descrição, categoria e endereço.</span>}</div>
        </form>
        <Images catalogue={catalogue} product={product} busy={busy} after={after} api={api} />
        <details className="surface fold fold-section" {...section('variacoes')}>
          <summary><span className="fold-title">Variações</span><span className="fold-summary">{active.length > 1 ? `${active.length} variações, ${priceRange(product) ?? 'sem preço'}` : 'Uma variação (sem cor ou tamanho)'}</span></summary>
          <div className="fold-body"><Variants product={product} busy={busy} after={after} api={api} /></div>
        </details>
        <details className="surface fold fold-section" {...section('estoque')}>
          <summary><span className="fold-title">Estoque por local</span><span className="fold-summary">{totals.on} em estoque, {totals.res} reservados{locationsUsed ? `, ${locationsUsed} ${locationsUsed === 1 ? 'local' : 'locais'}` : ''}</span></summary>
          <div className="fold-body"><Stock catalogue={catalogue} products={[product]} busy={busy} after={after} api={api} compact /></div>
        </details>
        <p className="small muted">Rascunho de descrição com IA: <Link href={`${base}/configuracoes/dados`}>Dados e IA</Link>. O texto só entra no produto depois da sua revisão.</p>
      </div>
    </div>
  </>;
}

type SectionProps = { busy: boolean; after: (task: () => Promise<unknown>, done: string) => Promise<boolean>; api: (path: string, method?: string, body?: unknown) => Promise<any> };
function Variants({ product, busy, after, api }: SectionProps & { product: Product }) {
  const [editing, setEditing] = useState(''), [pairs, setPairs] = useState([{ k: '', v: '' }]), [errors, setErrors] = useState<{ sku?: string; price?: string; pairs?: string; form?: string }>({});
  const visible = product.variants.filter((v) => v.active || !v.is_default);
  function saveVariant(e: FormEvent<HTMLFormElement>, v: Variant) {
    e.preventDefault(); const b = fields(e.currentTarget), cents = toCents(b.price || '');
    if (!cents) { setErrors({ price: 'Informe o preço em reais, por exemplo 49,90.' }); return; }
    setErrors({});
    void after(async () => { await api(`variants/${v.id}`, 'PATCH', { price_cents: cents, weight_g: Number(b.weight_g || 0), width_mm: Number(b.width_mm || 0), height_mm: Number(b.height_mm || 0), length_mm: Number(b.length_mm || 0) }); setEditing(''); }, `Variação ${v.sku} atualizada.`);
  }
  function addVariant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, b = fields(form), cents = toCents(b.price || ''), filled = pairs.filter((x) => x.k.trim() || x.v.trim()), next: typeof errors = {};
    if (!cents) next.price = 'Informe o preço em reais, por exemplo 49,90.';
    if (!filled.length || filled.some((x) => !x.k.trim() || !x.v.trim())) next.pairs = 'Preencha nome e valor de cada opção (de 1 a 5).';
    if (Object.keys(next).length) { setErrors(next); return; }
    setErrors({});
    void after(async () => {
      try { await api(`products/${product.id}/variants`, 'POST', { sku: b.sku, price_cents: cents, attributes: Object.fromEntries(filled.map((x) => [x.k.trim(), x.v.trim()])), weight_g: Number(b.weight_g || 0), width_mm: Number(b.width_mm || 0), height_mm: Number(b.height_mm || 0), length_mm: Number(b.length_mm || 0) }); }
      catch (err) { if (err instanceof ApiError && err.status === 409) { setErrors({ sku: 'Este SKU (ou esta combinação de opções) já existe nesta loja. Use outro código ou outras opções.' }); throw new Error('Corrija o campo indicado; os demais dados foram mantidos.'); } throw err; }
      form.reset(); setPairs([{ k: '', v: '' }]);
    }, 'Variação adicionada.');
  }
  return <div className="stack-sm">
    <p className="small muted">Carrinho, pedido e estoque usam sempre a variação.</p>
    <div className="table-wrap"><table className="data stack">
      <thead><tr><th scope="col">SKU</th><th scope="col">Opções</th><th scope="col" className="num">Preço</th><th scope="col" className="num">Disponível</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
      <tbody>{visible.map((v) => <tr key={v.id}><td className="primary"><code>{v.sku}</code></td><td data-label="Opções">{options(v)}</td><td className="num" data-label="Preço"><span className="money">{money(v.price_cents)}</span></td><td className="num" data-label="Disponível">{v.available}</td><td data-label="Situação">{v.active ? <Badge tone="success">Ativa</Badge> : <Badge>Inativa</Badge>}</td><td data-label="Ações"><button type="button" className="btn btn-secondary btn-sm" aria-expanded={editing === v.id} aria-label={`${editing === v.id ? 'Fechar edição de' : 'Editar'} variação ${v.sku}`} onClick={() => setEditing(editing === v.id ? '' : v.id)}>{editing === v.id ? 'Fechar' : 'Editar'}</button></td></tr>)}</tbody>
    </table></div>
    {visible.filter((v) => v.id === editing).map((v) => <form key={v.id} className="variant-new form" style={{ marginTop: 'var(--space-16)' }} aria-label={`Editar variação ${v.sku}`} onSubmit={(e) => saveVariant(e, v)}>
      <h3>Editar {v.sku}</h3>
      <div className="form-grid"><Field label="Preço" error={errors.price}>{(a) => <MoneyInput name="price" defaultCents={v.price_cents} a11y={a} required />}</Field><Field label="Peso (g)">{(a) => <input className="input" name="weight_g" type="number" min={0} defaultValue={v.weight_g ?? 0} {...a} />}</Field></div>
      <div className="form-grid"><Field label="Comprimento (mm)">{(a) => <input className="input" name="length_mm" type="number" min={0} defaultValue={v.length_mm ?? 0} {...a} />}</Field><Field label="Largura (mm)">{(a) => <input className="input" name="width_mm" type="number" min={0} defaultValue={v.width_mm ?? 0} {...a} />}</Field><Field label="Altura (mm)">{(a) => <input className="input" name="height_mm" type="number" min={0} defaultValue={v.height_mm ?? 0} {...a} />}</Field></div>
      <div className="cluster"><button className="btn btn-primary" disabled={busy}>Salvar variação</button><button type="button" className="btn btn-quiet" onClick={() => setEditing('')}>Cancelar</button></div>
    </form>)}
    <form className="variant-new form" style={{ marginTop: 'var(--space-16)' }} aria-labelledby="t-new-variant" onSubmit={addVariant} noValidate>
      <h3 id="t-new-variant">Adicionar variação</h3>
      <p className="hint">A primeira variação com opções desativa a variação padrão; o histórico de pedidos é preservado.</p>
      <div className="form-grid">
        <Field label="SKU" error={errors.sku}>{(a) => <input className="input" name="sku" required maxLength={80} {...a} />}</Field>
        <Field label="Preço" error={errors.price}>{(a) => <MoneyInput name="price" a11y={a} required />}</Field>
      </div>
      <fieldset><legend>Opções</legend>
        <div className="stack-sm">{pairs.map((x, i) => <div className="attr-row" key={i}>
          <Field label={`Nome da opção ${i + 1}`} hint={i === 0 ? 'Ex.: Cor' : undefined}>{(a) => <input className="input" value={x.k} maxLength={40} onChange={(e) => setPairs(pairs.map((y, j) => j === i ? { ...y, k: e.target.value } : y))} {...a} />}</Field>
          <Field label={`Valor ${i + 1}`} hint={i === 0 ? 'Ex.: Azul' : undefined}>{(a) => <input className="input" value={x.v} maxLength={80} onChange={(e) => setPairs(pairs.map((y, j) => j === i ? { ...y, v: e.target.value } : y))} {...a} />}</Field>
          {pairs.length > 1 ? <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPairs(pairs.filter((_, j) => j !== i))} aria-label={`Remover opção ${i + 1}`}>Remover</button> : <span />}
        </div>)}</div>
        {errors.pairs && <p className="error-text" role="alert"><Icon name="alert" size={16} />{errors.pairs}</p>}
        {pairs.length < 5 && <button type="button" className="btn btn-quiet btn-sm" style={{ marginTop: 'var(--space-8)' }} onClick={() => setPairs([...pairs, { k: '', v: '' }])}><Icon name="plus" size={16} />Adicionar opção</button>}
      </fieldset>
      <fieldset><legend>Peso e dimensões <span className="optional">(necessários para cotação de transportadora)</span></legend>
        <div className="form-grid"><Field label="Peso (g)">{(a) => <input className="input" name="weight_g" type="number" min={0} {...a} />}</Field><Field label="Comprimento (mm)">{(a) => <input className="input" name="length_mm" type="number" min={0} {...a} />}</Field><Field label="Largura (mm)">{(a) => <input className="input" name="width_mm" type="number" min={0} {...a} />}</Field><Field label="Altura (mm)">{(a) => <input className="input" name="height_mm" type="number" min={0} {...a} />}</Field></div>
      </fieldset>
      <div><button className="btn btn-secondary" disabled={busy}>Adicionar variação</button></div>
    </form>
  </div>;
}

function Images({ catalogue, product, busy, after, api }: SectionProps & { catalogue: Catalogue; product: Product }) {
  const p = usePanel(), linked = new Set(product.media.map((m) => m.id)), full = product.media.length >= 10;
  const ready = catalogue.media.filter((m) => m.status === 'READY' && !linked.has(m.id));
  return <section className="surface section" aria-labelledby="t-images">
    <div className="section-head"><h2 id="t-images">Imagens</h2><p>{product.media.length}/10, a primeira é a capa</p></div>
    {product.media.length === 0 ? <p className="small muted no-media-note"><Icon name="image" size={16} />Sem imagens, a loja mostra um espaço neutro com o nome do produto.</p> :
      <ul className="media-grid">{product.media.map((m, i) => <li key={m.id}><span className="frame"><img src={thumbUrl(p.tenantId, m.id, 'large')} alt={`${product.name}, imagem ${i + 1}`} loading="lazy" /></span><span className="small">{i === 0 ? 'Capa' : `Imagem ${i + 1}`}</span></li>)}</ul>}
    {full ? <p className="small muted">Limite de 10 imagens atingido para este produto.</p> :
      <MediaUploader describe="JPEG, PNG ou WebP, até 10 MB e 40 megapixels. Cada imagem é vinculada a este produto quando o processamento termina."
        onReady={async (assetId) => { await api(`products/${product.id}/media`, 'POST', { asset_id: assetId }); await after(async () => {}, 'Imagem adicionada ao produto.'); return 'Pronta e adicionada a este produto.'; }} />}
    {ready.length > 0 && !full && <details className="fold">
      <summary><span className="fold-title">Usar uma imagem já enviada</span><span className="fold-summary">{ready.length} {ready.length === 1 ? 'disponível' : 'disponíveis'}</span></summary>
      <ul className="media-grid fold-body">{ready.map((m) => <li key={m.id}><span className="frame"><img src={thumbUrl(p.tenantId, m.id)} alt="" loading="lazy" /></span><span className="small muted">{bytes(m.stored_bytes)}</span><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void after(() => api(`products/${product.id}/media`, 'POST', { asset_id: m.id }), 'Imagem adicionada ao produto.')}>Adicionar</button></li>)}</ul>
    </details>}
    <p className="small muted">Reordenar ou remover imagens de um produto ainda não é possível neste painel.</p>
  </section>;
}
export function Stock({ catalogue, products, busy, after, api, compact }: SectionProps & { catalogue: Catalogue; products: Product[]; compact?: boolean }) {
  const p = usePanel(), variants = products.flatMap((x) => x.variants.filter((v) => v.active).map((v) => ({ ...v, label: products.length > 1 ? `${x.name} · ${v.sku}` : `${v.sku} · ${options(v)}` })));
  const items = new Map(catalogue.inventory.map((i) => [i.id, i])), variantIds = new Set(variants.map((v) => v.id));
  const moves = catalogue.movements.filter((m) => variantIds.has(items.get(m.inventory_item_id)?.variant_id ?? '')).slice(0, compact ? 8 : 50);
  const totals = (id: string) => catalogue.inventory.filter((i) => i.variant_id === id).reduce((s, i) => ({ on: s.on + i.on_hand, res: s.res + i.reserved }), { on: 0, res: 0 });
  const nameOf = (itemId: string) => variants.find((v) => v.id === items.get(itemId)?.variant_id)?.label ?? '—';
  const [deltaError, setDeltaError] = useState('');
  function adjust(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, b = fields(form), delta = Number(b.delta);
    if (!Number.isInteger(delta) || delta === 0) { setDeltaError('Informe um número inteiro diferente de zero.'); return; }
    setDeltaError('');
    void after(async () => { try { await api('adjustments', 'POST', { ...b, delta }); } catch (err) { if (err instanceof ApiError && err.status === 409) { setDeltaError('Saldo insuficiente: o estoque não pode ficar abaixo do que já está reservado.'); throw new Error('Ajuste recusado; veja o campo Quantidade.'); } throw err; } form.reset(); }, 'Ajuste registrado com autor e motivo.');
  }
  const Wrapper = compact ? 'section' : 'div';
  return <Wrapper className="stack" aria-label={compact ? 'Estoque deste produto' : undefined}>
    {compact && <p className="small muted">Disponível = em estoque menos reservado.</p>}
    {variants.length === 0 ? <EmptyState icon="box" title="Nenhuma variação ativa">Cadastre um produto para controlar o estoque.</EmptyState> :
      <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Variação</th><th scope="col" className="num">Em estoque</th><th scope="col" className="num">Reservado</th><th scope="col" className="num">Disponível</th></tr></thead>
        <tbody>{variants.map((v) => { const t = totals(v.id); return <tr key={v.id}><td className="primary">{v.label}</td><td className="num" data-label="Em estoque">{t.on}</td><td className="num" data-label="Reservado">{t.res}</td><td className="num" data-label="Disponível"><strong>{t.on - t.res}</strong></td></tr>; })}</tbody></table></div>}
    {catalogue.locations.length === 0 ? <Alert tone="warning" title="Cadastre um local de estoque">Os ajustes de saldo precisam de um local. <Link href={`/painel/${p.tenantId}?aba=organizacao`}>Cadastrar local</Link></Alert> : variants.length > 0 &&
      <form className="form variant-new" style={{ marginTop: 'var(--space-16)' }} aria-label="Ajustar estoque" onSubmit={adjust} noValidate>
        <h3>Ajustar saldo</h3>
        <div className="form-grid">
          {variants.length > 1 || !compact ? <Field label="Variação">{(a) => <select className="select" name="variant_id" required {...a}>{variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>}</Field> : <input type="hidden" name="variant_id" value={variants[0]!.id} />}
          <Field label="Local">{(a) => <select className="select" name="location_id" required {...a}>{catalogue.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}</Field>
          <Field label="Quantidade" hint="Positivo para entrada, negativo para saída." error={deltaError}>{(a) => <input className="input" name="delta" type="number" step={1} required {...a} />}</Field>
        </div>
        <Field label="Motivo" hint="Fica registrado na movimentação.">{(a) => <input className="input" name="reason" required maxLength={500} {...a} />}</Field>
        <div><button className="btn btn-secondary" disabled={busy}>Registrar ajuste</button></div>
      </form>}
    <div className="stack-sm" style={{ marginTop: 'var(--space-16)' }}>
      <h3>Movimentações recentes</h3>
      {moves.length === 0 ? <p className="small muted">Nenhuma movimentação registrada.</p> :
        <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Data</th>{!compact || variants.length > 1 ? <th scope="col">Variação</th> : null}<th scope="col">Motivo</th><th scope="col" className="num">Quantidade</th><th scope="col" className="num">Saldo</th></tr></thead>
          <tbody>{moves.map((m) => <tr key={m.id}><td className="primary">{m.created_at ? formatDateTime(m.created_at, p.timezone) : '—'}</td>{!compact || variants.length > 1 ? <td data-label="Variação">{nameOf(m.inventory_item_id)}</td> : null}<td data-label="Motivo">{m.reason}</td><td className="num" data-label="Quantidade">{m.delta > 0 ? `+${m.delta}` : m.delta}</td><td className="num" data-label="Saldo">{m.balance}</td></tr>)}</tbody></table></div>}
    </div>
  </Wrapper>;
}

export function StockTab({ catalogue, reload }: { catalogue: Catalogue; reload: () => Promise<void> }) {
  const p = usePanel(), { busy, error, notice, run } = useAction();
  const api = (path: string, method = 'GET', body?: unknown) => call(`tenants/${p.tenantId}/catalogue/${path}`, { method, body, csrf: p.csrf });
  return <>
    <PageHeader title="Estoque" meta="Saldo por variação, somando os locais. Todo ajuste pede um motivo e fica registrado." />
    <Feedback error={error} notice={notice} />
    <Stock catalogue={catalogue} products={catalogue.products.filter((x) => x.status !== 'ARCHIVED')} busy={busy} api={api} after={(task, done) => run(async () => { await task(); await reload(); }, done)} />
  </>;
}

export function MediaTab({ catalogue, reload }: { catalogue: Catalogue; reload: () => Promise<void> }) {
  const p = usePanel(), { busy, error, notice, run } = useAction(), after = (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await reload(); }, done);
  const usedBy = (id: string) => catalogue.products.filter((x) => x.media.some((m) => m.id === id)).map((x) => x.name);
  return <>
    <PageHeader title="Imagens" meta="Fotos enviadas pela loja. Só aparecem na loja depois de vinculadas a um produto." actions={<button className="btn btn-secondary" disabled={busy} onClick={() => void after(async () => {}, 'Lista atualizada.')}>Atualizar situação</button>} />
    <Feedback error={error} notice={notice} />
    <section className="surface section stack-sm" aria-labelledby="t-upload"><h2 id="t-upload">Enviar imagens</h2><MediaUploader onReady={async () => { await after(async () => {}, 'Lista atualizada.'); return 'Pronta. Vincule-a na edição do produto.'; }} /></section>
    {catalogue.media.length === 0 ? <EmptyState icon="image" title="Nenhuma imagem enviada">Envie as fotos aqui ou direto na edição de cada produto.</EmptyState> :
      <div className="table-wrap"><table className="data stack"><caption>Mostra as 100 imagens mais recentes.</caption><thead><tr><th scope="col">Imagem</th><th scope="col">Situação</th><th scope="col" className="num">Tamanho</th><th scope="col">Usada em</th></tr></thead>
        <tbody>{catalogue.media.map((m) => <tr key={m.id}><td className="primary"><div className="cell-main">{m.status === 'READY' ? <span className="thumb"><img src={thumbUrl(p.tenantId, m.id)} alt="" loading="lazy" /></span> : <span className="thumb no-photo"><Icon name="image" size={16} /></span>}<span className="cell-sub">Enviada{usedBy(m.id).length ? '' : ', ainda sem produto'}</span></div></td><td data-label="Situação"><StatusBadge map={MEDIA_STATUS} value={m.status} /></td><td className="num" data-label="Tamanho">{bytes(m.stored_bytes)}</td><td data-label="Usada em">{usedBy(m.id).join(', ') || <span className="muted">Não vinculada</span>}</td></tr>)}</tbody></table></div>}
    <details className="disclosure small"><summary>Manutenção de mídia</summary><p className="muted">Recalcula o espaço usado e retoma processamentos interrompidos. Use se uma imagem ficar presa em “Processando”.</p><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void after(() => call(`tenants/${p.tenantId}/catalogue/media/maintenance`, { method: 'POST', csrf: p.csrf }), 'Manutenção solicitada.')}>Reconciliar mídia e retomar pendências</button></details>
  </>;
}

export function OrganizationTab({ catalogue, reload }: { catalogue: Catalogue; reload: () => Promise<void> }) {
  const p = usePanel(), { busy, error, notice, run } = useAction();
  const [catSlug, setCatSlug] = useState(''), [touched, setTouched] = useState(false);
  const post = (path: string, body: unknown) => call(`tenants/${p.tenantId}/catalogue/${path}`, { method: 'POST', body, csrf: p.csrf });
  const submit = (path: string, done: string) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget, b = fields(form); void run(async () => { try { await post(path, b); } catch (err) { if (err instanceof ApiError && err.status === 409) throw new Error('Já existe um item com este endereço/nome nesta loja.'); throw err; } form.reset(); setCatSlug(''); setTouched(false); await reload(); }, done); };
  return <>
    <PageHeader title="Categorias e locais" meta="Categorias organizam a navegação da loja; locais guardam o saldo de estoque." />
    <Feedback error={error} notice={notice} />
    <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' }}>
      <section className="surface section stack-sm" aria-labelledby="t-cats"><h2 id="t-cats">Categorias</h2>
        {catalogue.categories.length === 0 ? <p className="small muted">Nenhuma categoria. Categorias aparecem como navegação na vitrine.</p> : <ul className="stack-sm" style={{ listStyle: 'none' }}>{catalogue.categories.map((c) => <li key={c.id}>{c.name} <span className="cell-sub">/categorias/{c.slug}</span></li>)}</ul>}
        <form className="form" aria-label="Criar categoria" onSubmit={submit('categories', 'Categoria criada.')}>
          <Field label="Nome da categoria">{(a) => <input className="input" name="name" required onChange={(e) => { if (!touched) setCatSlug(slugify(e.target.value)); }} {...a} />}</Field>
          <Field label="Endereço da categoria" hint="Letras minúsculas, números e hífens.">{(a) => <input className="input" name="slug" required value={catSlug} onChange={(e) => { setTouched(true); setCatSlug(e.target.value); }} {...a} />}</Field>
          <div><button className="btn btn-secondary" disabled={busy}>Criar categoria</button></div>
        </form>
      </section>
      <section className="surface section stack-sm" aria-labelledby="t-locs"><h2 id="t-locs">Locais de estoque</h2>
        {catalogue.locations.length === 0 ? <p className="small muted">Nenhum local. Cadastre o depósito para registrar saldos.</p> : <ul className="stack-sm" style={{ listStyle: 'none' }}>{catalogue.locations.map((l) => <li key={l.id}>{l.name}</li>)}</ul>}
        <form className="form" aria-label="Criar local" onSubmit={submit('locations', 'Local criado.')}>
          <Field label="Nome do local">{(a) => <input className="input" name="name" required {...a} />}</Field>
          <div><button className="btn btn-secondary" disabled={busy}>Criar local</button></div>
        </form>
      </section>
    </div>
  </>;
}
