'use client';
// R02 — Catálogo do painel: produtos, edição, variações, imagens, estoque, mídia, categorias e locais.
// Usa exatamente os endpoints existentes de /tenants/:id/catalogue (DESIGN.md §6 e §9; TELAS-E-FLUXOS R02).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { call, ApiError, fields, useAction } from './api';
import { usePanel } from './Shell';
import { Alert, Badge, EmptyState, Feedback, Field, MoneyInput, PageHeader, StatusBadge, useDirty, useTitle } from '../ui/kit';
import { Icon } from '../ui/icons';
import { MEDIA_STATUS, PRODUCT_STATUS } from '../ui/status';
import { bytes, formatDateTime, money, slugify, toCents } from '../ui/format';

export type Variant = { id: string; sku: string; attributes: Record<string, string>; is_default: boolean; active: boolean; price_cents: string; available: number; weight_g?: number; width_mm?: number; height_mm?: number; length_mm?: number };
export type Product = { id: string; name: string; slug: string; description: string; status: string; category_id: string | null; updated_at?: string; variants: Variant[]; media: { id: string }[] };
export type Catalogue = { products: Product[]; categories: { id: string; name: string; slug: string }[]; locations: { id: string; name: string }[]; inventory: { id: string; variant_id: string; location_id: string; on_hand: number; reserved: number }[]; movements: { id: string; inventory_item_id: string; reason: string; delta: number; balance: number; created_at: string }[]; media: { id: string; status: string; stored_bytes: string }[] };

const options = (v: Variant) => Object.entries(v.attributes).map(([k, x]) => `${k}: ${x}`).join(' · ') || 'Padrão (sem opções)';
const priceRange = (p: Product) => { const prices = p.variants.filter((v) => v.active).map((v) => BigInt(v.price_cents)); if (!prices.length) return null; const min = prices.reduce((a, b) => (b < a ? b : a)), max = prices.reduce((a, b) => (b > a ? b : a)); return min === max ? money(min.toString()) : `${money(min.toString())} a ${money(max.toString())}`; };
const PriceRange = ({ p }: { p: Product }) => { const r = priceRange(p); if (!r) return <span>—</span>; const [a, b] = r.split(' a '); return b ? <span><span className="money">{a}</span> a <span className="money">{b}</span></span> : <span className="money">{a}</span>; };
const thumbUrl = (tenant: string, asset: string, size = 'small') => `/api/tenants/${tenant}/storefront/media/${asset}/${size}`;
export function Thumb({ tenant, product }: { tenant: string; product: Product }) {
  const m = product.media[0];
  return m ? <span className="thumb"><img src={thumbUrl(tenant, m.id)} alt="" width={40} height={50} loading="lazy" /></span> : <span className="thumb no-photo" title="Sem foto"><Icon name="imageOff" size={16} /><span className="sr-only">Sem foto</span></span>;
}

// ---------- Listagem ----------
export function ProductList({ catalogue, onCreate }: { catalogue: Catalogue; onCreate: boolean }) {
  const p = usePanel(), router = useRouter(), base = `/painel/${p.tenantId}`;
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [category, setCategory] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const counts = useMemo(() => ({ all: catalogue.products.length, ACTIVE: catalogue.products.filter((x) => x.status === 'ACTIVE').length, DRAFT: catalogue.products.filter((x) => x.status === 'DRAFT').length, ARCHIVED: catalogue.products.filter((x) => x.status === 'ARCHIVED').length }), [catalogue]);
  const shown = catalogue.products.filter((x) => (status === 'all' || x.status === status) && (!category || x.category_id === category) && (!query || norm(`${x.name} ${x.slug} ${x.variants.map((v) => v.sku).join(' ')}`).includes(norm(query.trim()))));
  const categoryName = (id: string | null) => catalogue.categories.find((c) => c.id === id)?.name;
  const clear = () => { setQuery(''); setStatus('all'); setCategory(''); };
  return <>
    <PageHeader eyebrow="Catálogo" title="Produtos" meta={`${counts.all} ${counts.all === 1 ? 'produto' : 'produtos'} · ${counts.ACTIVE} ativos na vitrine`}
      actions={<><Link className="btn btn-secondary" href={`${base}?aba=estoque`}>Ajustar estoque</Link><Link className="btn btn-primary" href={`${base}?novo=1`}><Icon name="plus" />Novo produto</Link></>} />
    <CatalogTabs current="produtos" />
    {onCreate && <NewProduct catalogue={catalogue} onCreated={(id) => router.push(`${base}?produto=${id}`)} />}
    {counts.all === 0 ? <EmptyState icon="box" title="Nenhum produto cadastrado" action={<Link className="btn btn-primary" href={`${base}?novo=1`}>Cadastrar primeiro produto</Link>}>Comece pelo produto mais vendido. Ele só aparece na vitrine depois de ativo e publicado.</EmptyState> :
      <div className="table-wrap">
        <div className="toolbar" role="search" aria-label="Filtrar produtos carregados">
          <div className="field"><label htmlFor="q-prod">Buscar por nome, endereço ou SKU</label><input className="input" id="q-prod" type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-describedby="q-prod-h" autoComplete="off" /><p className="hint" id="q-prod-h">Procura apenas entre os {counts.all} produtos carregados nesta página.</p></div>
          <fieldset className="field" style={{ flex: '2 1 20rem' }}><legend>Status</legend><div className="segmented">{([['all', 'Todos'], ['ACTIVE', 'Ativos'], ['DRAFT', 'Rascunhos'], ['ARCHIVED', 'Arquivados']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>{l} <span className="count">{counts[k]}</span></button>)}</div></fieldset>
          {catalogue.categories.length > 0 && <div className="field narrow"><label htmlFor="c-prod">Categoria</label><select className="select" id="c-prod" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Todas</option>{catalogue.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        </div>
        {shown.length === 0 ? <div style={{ padding: 'var(--space-16)' }}><EmptyState icon="search" title="Nenhum produto corresponde aos filtros" action={<button className="btn btn-secondary btn-sm" onClick={clear}>Limpar busca e filtros</button>}>Confira a grafia ou procure pelo SKU.</EmptyState></div> :
          <table className="data stack">
            <caption>Valores em reais. Disponível = em estoque − reservado, somando as variações ativas.</caption>
            <thead><tr><th scope="col">Produto</th><th scope="col">Status</th><th scope="col" className="num">Variações</th><th scope="col" className="num">Disponível</th><th scope="col" className="num">Preço</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{shown.map((x) => { const active = x.variants.filter((v) => v.active), available = active.reduce((s, v) => s + v.available, 0), soldOut = active.filter((v) => v.available <= 0).length; return <tr key={x.id}>
              <td className="primary"><div className="cell-main"><Thumb tenant={p.tenantId} product={x} /><span><Link href={`${base}?produto=${x.id}`}>{x.name}</Link><span className="cell-sub">{x.slug}{categoryName(x.category_id) ? ` · ${categoryName(x.category_id)}` : ''}{x.media.length === 0 ? ' · sem foto' : ''}</span></span></div></td>
              <td data-label="Status"><StatusBadge map={PRODUCT_STATUS} value={x.status} /></td>
              <td className="num" data-label="Variações">{active.length}</td>
              <td className="num" data-label="Disponível">{available <= 0 ? <Badge tone="warning">Sem saldo</Badge> : <span>{available}{soldOut > 0 && <span className="muted"> · {soldOut} esgotada{soldOut > 1 ? 's' : ''}</span>}</span>}</td>
              <td className="num" data-label="Preço"><PriceRange p={x} /></td>
              <td data-label="Ações"><Link className="btn btn-secondary btn-sm" href={`${base}?produto=${x.id}`} aria-label={`Editar ${x.name}`}>Editar</Link></td>
            </tr>; })}</tbody>
          </table>}
        <div className="table-foot"><span role="status">Mostrando {shown.length} de {counts.all} produtos carregados</span><span>A listagem do painel traz até 100 produtos, sem paginação.</span></div>
      </div>}
  </>;
}

function NewProduct({ catalogue, onCreated }: { catalogue: Catalogue; onCreated: (id: string) => void }) {
  const p = usePanel(), { busy, error, run } = useAction();
  const [slug, setSlug] = useState(''), [touched, setTouched] = useState(false), [priceError, setPriceError] = useState('');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const b = fields(e.currentTarget), cents = toCents(b.price_cents || '');
    if (!cents) { setPriceError('Informe o preço em reais, por exemplo 49,90.'); return; }
    setPriceError('');
    void run(async () => {
      try { const r = await call(`tenants/${p.tenantId}/catalogue/products`, { method: 'POST', csrf: p.csrf, body: { ...b, price_cents: cents, ...(b.category_id ? {} : { category_id: undefined }) } }); onCreated(r.id); }
      catch (err) { if (err instanceof ApiError && err.status === 409) throw new Error('Já existe um produto com este endereço ou SKU nesta loja. Altere um deles e tente novamente.'); throw err; }
    });
  }
  return <section className="surface" aria-labelledby="t-new-product">
    <div className="section stack-sm">
      <div className="section-head" style={{ marginBottom: 0 }}><h2 id="t-new-product">Cadastrar produto simples</h2><Link className="btn btn-quiet btn-sm" href={`/painel/${p.tenantId}`}>Cancelar</Link></div>
      <p className="small muted">Cria o produto em rascunho com uma variação padrão. Opções como cor e tamanho podem ser adicionadas depois, na edição.</p>
      {error && <Alert tone="danger" role="alert" title="O produto não foi cadastrado">{error} Os dados digitados foram mantidos.</Alert>}
      <form className="form form-col" aria-label="Cadastrar produto" onSubmit={submit}>
        <Field label="Nome">{(a) => <input className="input" name="name" required maxLength={200} onChange={(e) => { if (!touched) setSlug(slugify(e.target.value)); }} {...a} />}</Field>
        <Field label="Endereço na vitrine" hint={`/produtos/${slug || 'endereco-do-produto'} · letras minúsculas, números e hífens.`}>{(a) => <input className="input" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required value={slug} onChange={(e) => { setTouched(true); setSlug(e.target.value); }} {...a} />}</Field>
        <Field label="Descrição e cuidados" optional hint="Texto simples, até 8.000 caracteres.">{(a) => <textarea className="textarea" name="description" maxLength={8000} {...a} />}</Field>
        <div className="form-grid">
          <Field label="SKU" hint="Código único nesta loja.">{(a) => <input className="input" name="sku" required maxLength={80} {...a} />}</Field>
          <Field label="Preço" error={priceError}>{(a) => <MoneyInput name="price_cents" a11y={a} required />}</Field>
        </div>
        <Field label="Categoria" optional>{(a) => <select className="select" name="category_id" {...a}><option value="">Sem categoria</option>{catalogue.categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select>}</Field>
        <div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Cadastrando…' : 'Cadastrar produto'}</button></div>
      </form>
    </div>
  </section>;
}

// ---------- Edição ----------
export function ProductEditor({ catalogue, product, reload }: { catalogue: Catalogue; product: Product; reload: () => Promise<void> }) {
  const p = usePanel(), base = `/painel/${p.tenantId}`, { busy, error, notice, run } = useAction(), { dirty, markDirty, clean } = useDirty();
  useTitle(product.name);
  const [infoError, setInfoError] = useState<{ slug?: string }>({});
  const api = (path: string, method = 'GET', body?: unknown) => call(`tenants/${p.tenantId}/catalogue/${path}`, { method, body, csrf: p.csrf });
  const after = async (task: () => Promise<unknown>, done: string) => { const ok = await run(async () => { await task(); await reload(); }, done); return ok; };
  function saveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const b = fields(e.currentTarget); setInfoError({});
    void run(async () => {
      try { await api(`products/${product.id}`, 'PATCH', { name: b.name, slug: b.slug, description: b.description, status: b.status, category_id: b.category_id || null }); }
      catch (err) { if (err instanceof ApiError && err.status === 409) { setInfoError({ slug: 'Este endereço já é usado por outro produto (atual ou anterior) desta loja.' }); throw new Error('Corrija o endereço indicado.'); } throw err; }
      clean(); await reload();
    }, 'Informações salvas.');
  }
  const publicUrl = `/lojas/${p.store.slug}/produtos/${product.slug}`;
  return <>
    <PageHeader crumbs={[{ label: 'Catálogo', href: base }, { label: 'Produtos', href: base }, { label: product.name }]} title={product.name}
      meta={<span className="cluster-tight"><StatusBadge map={PRODUCT_STATUS} value={product.status} />{product.status === 'ACTIVE' ? 'visível na vitrine publicada' : 'não aparece na vitrine'}{product.updated_at && <span>· atualizado em {formatDateTime(product.updated_at, p.timezone)}</span>}</span>}
      actions={<>{product.status === 'ACTIVE' ? <a className="btn btn-secondary" href={publicUrl}><Icon name="eye" />Ver na vitrine</a> : null}<button className="btn btn-primary" type="submit" form="product-info" disabled={busy}>{busy ? 'Salvando…' : 'Salvar informações'}</button></>} />
    <Feedback error={error} notice={notice} />
    <div className="two-col form-layout">
      <div className="surface">
        <form className="section form" id="product-info" aria-labelledby="t-info" onSubmit={saveInfo} onChange={markDirty} key={`${product.id}-${product.updated_at}`}>
          <div className="section-head"><h2 id="t-info">Informações</h2>{dirty ? <p className="dirty">Alterações não salvas</p> : <p>Salvas com “Salvar informações”.</p>}</div>
          <Field label="Nome">{(a) => <input className="input" name="name" defaultValue={product.name} required maxLength={200} {...a} />}</Field>
          <Field label="Endereço na vitrine" error={infoError.slug} hint={`/produtos/${product.slug} · ao mudar, o endereço antigo redireciona para o novo.`}>{(a) => <input className="input" name="slug" defaultValue={product.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" required {...a} />}</Field>
          <Field label="Descrição e cuidados" hint="Texto simples (HTML não é aceito), até 8.000 caracteres.">{(a) => <textarea className="textarea" name="description" defaultValue={product.description} maxLength={8000} rows={6} {...a} />}</Field>
        </form>
        <Variants product={product} busy={busy} after={after} api={api} />
        <Images catalogue={catalogue} product={product} busy={busy} after={after} api={api} />
        <Stock catalogue={catalogue} products={[product]} busy={busy} after={after} api={api} compact />
      </div>
      <aside className="surface section side-list" aria-label="Publicação e organização">
        <div className="stack-sm"><h2>Publicação</h2>
          <Field label="Status" hint="Ativo exige ao menos uma variação vendável com preço. Arquivar bloqueia novas compras e preserva pedidos.">{(a) => <select className="select" name="status" form="product-info" defaultValue={product.status} key={product.status} onChange={markDirty} {...a}><option value="DRAFT">Rascunho</option><option value="ACTIVE">Ativo</option><option value="ARCHIVED">Arquivado</option></select>}</Field></div>
        <div className="stack-sm"><h2>Organização</h2>
          <Field label="Categoria">{(a) => <select className="select" name="category_id" form="product-info" defaultValue={product.category_id ?? ''} key={product.category_id ?? 'none'} onChange={markDirty} {...a}><option value="">Sem categoria</option>{catalogue.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field></div>
        <div className="stack-sm"><h2>Descrição com IA</h2><p className="small muted">Rascunhos de descrição ficam em <Link href={`${base}/operacao#ia`}>Operação</Link> e só são salvos após sua revisão.</p></div>
      </aside>
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
  return <section className="section" aria-labelledby="t-variants">
    <div className="section-head"><h2 id="t-variants">Variações</h2><p>Carrinho, pedido e estoque usam sempre a variação.</p></div>
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
  </section>;
}

function Images({ catalogue, product, busy, after, api }: SectionProps & { catalogue: Catalogue; product: Product }) {
  const p = usePanel(), linked = new Set(product.media.map((m) => m.id));
  const ready = catalogue.media.filter((m) => m.status === 'READY' && !linked.has(m.id)), processing = catalogue.media.filter((m) => ['UPLOADING', 'PENDING'].includes(m.status));
  return <section className="section" aria-labelledby="t-images">
    <div className="section-head"><h2 id="t-images">Imagens</h2><p>Até 10 por produto. A primeira é a principal.</p></div>
    {product.media.length === 0 ? <EmptyState icon="imageOff" title="Este produto ainda não tem imagens">Na vitrine aparece o aviso “Sem foto”. Envie uma imagem e vincule-a quando o processamento terminar.</EmptyState> :
      <ul className="media-grid">{product.media.map((m, i) => <li key={m.id}><span className="frame"><img src={thumbUrl(p.tenantId, m.id, 'large')} alt={`${product.name} — imagem ${i + 1}`} loading="lazy" /></span>{i === 0 ? 'Principal' : `Imagem ${i + 1}`}</li>)}</ul>}
    <div className="stack-sm" style={{ marginTop: 'var(--space-16)' }}>
      <UploadForm busy={busy} after={after} />
      {processing.length > 0 && <p className="small" role="status">{processing.length} {processing.length === 1 ? 'imagem em processamento' : 'imagens em processamento'}. <button type="button" className="btn btn-quiet btn-sm" onClick={() => void after(async () => {}, 'Lista atualizada.')}>Atualizar</button></p>}
      {ready.length > 0 && <div className="stack-sm"><h3>Imagens prontas para vincular</h3><ul className="media-grid">{ready.map((m) => <li key={m.id}><span className="frame"><img src={thumbUrl(p.tenantId, m.id)} alt="" loading="lazy" /></span><span>{bytes(m.stored_bytes)}</span><button type="button" className="btn btn-secondary btn-sm" disabled={busy || product.media.length >= 10} onClick={() => void after(() => api(`products/${product.id}/media`, 'POST', { asset_id: m.id }), 'Imagem vinculada ao produto.')}>Vincular</button></li>)}</ul></div>}
    </div>
  </section>;
}
function UploadForm({ busy, after }: { busy: boolean; after: SectionProps['after'] }) {
  const p = usePanel();
  return <form className="cluster" style={{ alignItems: 'end' }} aria-label="Enviar imagem" onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget, file = new FormData(form).get('image') as File; void after(async () => { await call(`tenants/${p.tenantId}/catalogue/media`, { method: 'POST', csrf: p.csrf, raw: file }); form.reset(); }, 'Imagem enviada. O processamento leva alguns segundos; atualize para vincular.'); }}>
    <Field label="Arquivo de imagem" hint="JPEG, PNG ou WebP estático, até 10 MB e 40 megapixels.">{(a) => <input className="input" name="image" type="file" accept="image/jpeg,image/png,image/webp" required {...a} />}</Field>
    <button className="btn btn-secondary" disabled={busy}><Icon name="upload" />Enviar imagem</button>
  </form>;
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
  return <Wrapper className={compact ? 'section' : 'stack'} aria-labelledby={compact ? 't-stock' : undefined}>
    {compact && <div className="section-head"><h2 id="t-stock">Estoque</h2><p>Disponível = em estoque − reservado.</p></div>}
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

export function CatalogTabs({ current }: { current: string }) {
  const p = usePanel(), base = `/painel/${p.tenantId}`;
  const tabs = [['produtos', 'Produtos', base], ['estoque', 'Estoque', `${base}?aba=estoque`], ['midia', 'Mídia', `${base}?aba=midia`], ['organizacao', 'Categorias e locais', `${base}?aba=organizacao`]] as const;
  return <nav aria-label="Seções do catálogo"><ul className="subnav">{tabs.map(([k, l, h]) => <li key={k}><Link href={h} aria-current={current === k ? 'page' : undefined}>{l}</Link></li>)}</ul></nav>;
}

export function StockTab({ catalogue, reload }: { catalogue: Catalogue; reload: () => Promise<void> }) {
  const p = usePanel(), { busy, error, notice, run } = useAction();
  const api = (path: string, method = 'GET', body?: unknown) => call(`tenants/${p.tenantId}/catalogue/${path}`, { method, body, csrf: p.csrf });
  return <>
    <PageHeader eyebrow="Catálogo" title="Estoque" meta="Saldo por variação em todos os locais. Cada ajuste exige motivo e fica registrado." />
    <CatalogTabs current="estoque" />
    <Feedback error={error} notice={notice} />
    <Stock catalogue={catalogue} products={catalogue.products.filter((x) => x.status !== 'ARCHIVED')} busy={busy} api={api} after={(task, done) => run(async () => { await task(); await reload(); }, done)} />
  </>;
}

export function MediaTab({ catalogue, reload }: { catalogue: Catalogue; reload: () => Promise<void> }) {
  const p = usePanel(), { busy, error, notice, run } = useAction(), after = (task: () => Promise<unknown>, done: string) => run(async () => { await task(); await reload(); }, done);
  const usedBy = (id: string) => catalogue.products.filter((x) => x.media.some((m) => m.id === id)).map((x) => x.name);
  return <>
    <PageHeader eyebrow="Catálogo" title="Mídia" meta="Imagens privadas da loja. Somente o WebP processado e vinculado aparece na vitrine." actions={<button className="btn btn-secondary" disabled={busy} onClick={() => void after(async () => {}, 'Lista atualizada.')}>Atualizar processamento</button>} />
    <CatalogTabs current="midia" />
    <Feedback error={error} notice={notice} />
    <section className="surface section stack-sm" aria-labelledby="t-upload"><h2 id="t-upload">Enviar imagem</h2><p className="small muted">No máximo 2 envios em andamento por loja. O processamento gera WebP em segundo plano.</p><UploadForm busy={busy} after={after} /></section>
    {catalogue.media.length === 0 ? <EmptyState icon="imageOff" title="Nenhuma imagem enviada">Envie fotos dos produtos para vinculá-las na edição de cada produto.</EmptyState> :
      <div className="table-wrap"><table className="data stack"><caption>Mostra as 100 imagens mais recentes.</caption><thead><tr><th scope="col">Imagem</th><th scope="col">Situação</th><th scope="col" className="num">Tamanho</th><th scope="col">Usada em</th></tr></thead>
        <tbody>{catalogue.media.map((m) => <tr key={m.id}><td className="primary"><div className="cell-main">{m.status === 'READY' ? <span className="thumb"><img src={thumbUrl(p.tenantId, m.id)} alt="" loading="lazy" /></span> : <span className="thumb no-photo"><Icon name="imageOff" size={16} /></span>}<code className="cell-sub">{m.id}</code></div></td><td data-label="Situação"><StatusBadge map={MEDIA_STATUS} value={m.status} /></td><td className="num" data-label="Tamanho">{bytes(m.stored_bytes)}</td><td data-label="Usada em">{usedBy(m.id).join(', ') || <span className="muted">Não vinculada</span>}</td></tr>)}</tbody></table></div>}
    <details className="disclosure small"><summary>Manutenção de mídia</summary><p className="muted">Recalcula o espaço usado e retoma processamentos interrompidos. Use se uma imagem ficar presa em “Processando”.</p><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void after(() => call(`tenants/${p.tenantId}/catalogue/media/maintenance`, { method: 'POST', csrf: p.csrf }), 'Manutenção solicitada.')}>Reconciliar mídia e retomar pendências</button></details>
  </>;
}

export function OrganizationTab({ catalogue, reload }: { catalogue: Catalogue; reload: () => Promise<void> }) {
  const p = usePanel(), { busy, error, notice, run } = useAction();
  const [catSlug, setCatSlug] = useState(''), [touched, setTouched] = useState(false);
  const post = (path: string, body: unknown) => call(`tenants/${p.tenantId}/catalogue/${path}`, { method: 'POST', body, csrf: p.csrf });
  const submit = (path: string, done: string) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget, b = fields(form); void run(async () => { try { await post(path, b); } catch (err) { if (err instanceof ApiError && err.status === 409) throw new Error('Já existe um item com este endereço/nome nesta loja.'); throw err; } form.reset(); setCatSlug(''); setTouched(false); await reload(); }, done); };
  return <>
    <PageHeader eyebrow="Catálogo" title="Categorias e locais" />
    <CatalogTabs current="organizacao" />
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
