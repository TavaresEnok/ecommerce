'use client';
// Vitrine (R07–R14) com tema v2: um único renderizador para a loja publicada, a prévia privada e a prévia ao vivo do editor.
// Os presets mudam composição, hierarquia e uso de imagem (data-preset + seções); compra, acessibilidade e dados são os mesmos.
// Nada da identidade da Plataforma aparece aqui; textos do lojista são sempre texto simples (nunca HTML).
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { CartFlow, ContactPage, OrderView } from './checkout';
import { themeStyle } from './brand';
import { money } from './ui/format';
import { Icon } from './ui/icons';
import { EmptyState, Field } from './ui/kit';
import { hrefOf, type Section, type Theme, type ThemeLink } from './theme-model';
export { money };
export type Variant = { id: string; sku: string; attributes: Record<string, string>; is_default: boolean; active: boolean; price_cents: string; available: number };
export type Product = { id: string; name: string; slug: string; description: string; status: string; category_id?: string | null; created_at?: string; variants: Variant[]; media: { id: string }[] };
export type { Theme };
export type Category = { id?: string; slug: string; name: string };
export type StoreData = { route: { slug: string; canonical: string }; theme: Theme; products: Product[]; categories: Category[]; noindex: boolean };

const variantName = (v: Variant) => Object.values(v.attributes).join(' / ') || 'Padrão';
const min = (values: string[]) => values.reduce((a, b) => (BigInt(b) < BigInt(a) ? b : a));
function priceLabel(p: Product) {
  const active = p.variants.filter((v) => v.active);
  if (!active.length) return null;
  const prices = active.map((v) => v.price_cents), low = min(prices);
  return prices.some((c) => c !== low) ? `a partir de ${money(low)}` : money(low);
}
const soldOut = (p: Product) => p.variants.filter((v) => v.active).every((v) => v.available < 1);

// ---------- Compra ----------
function AddToCart({ slug, product, cartHref, contactHref }: { slug: string; product: Product; cartHref: string; contactHref: string }) {
  const variants = product.variants.filter((v) => v.active);
  const first = variants.find((v) => v.available > 0) ?? variants[0];
  const [selected, setSelected] = useState(first?.id ?? ''), [qty, setQty] = useState(1), [added, setAdded] = useState(''), [error, setError] = useState(''), [qtyError, setQtyError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const variant = variants.find((v) => v.id === selected), allOut = variants.every((v) => v.available < 1), maxQty = Math.max(1, Math.min(99, variant?.available || 1));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) { setQtyError(`Escolha de 1 a ${maxQty}.`); return; }
    setBusy(true); setError(''); setQtyError(''); setAdded('');
    try {
      const response = await fetch(`/api/public/stores/${slug}/cart/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant_id: selected, quantity: qty }), cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { const m = typeof data.error === 'string' ? data.error : data.error?.message || (response.status === 429 ? 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.' : 'Não foi possível adicionar. Tente novamente.'); if (/quantidade|saldo|estoque|dispon/i.test(m)) setQtyError(m); else setError(m); return; }
      setAdded(`${variants.length > 1 ? `${variantName(variant!)} adicionado` : 'Adicionado'} ao carrinho.`);
    } catch { setError('Não foi possível conectar. Verifique sua conexão e tente novamente.'); }
    finally { setBusy(false); }
  }
  if (!variants.length) return <p className="hint">Produto sem opção disponível no momento.</p>;
  return <form className="buy-form" aria-label={`Adicionar ${product.name}`} onSubmit={(e) => void submit(e)}>
    {variants.length > 1 && <fieldset><legend>Opção <span className="legend-value">{variant ? variantName(variant) : ''}</span></legend><div className="options">{variants.map((v) => <div className="option" key={v.id}>
      <input type="radio" name="variant" id={`v-${v.id}`} value={v.id} checked={selected === v.id} disabled={v.available < 1} onChange={() => { setSelected(v.id); setAdded(''); setQtyError(''); setQty(1); }} />
      <label htmlFor={`v-${v.id}`}><span className="tick"><Icon name="tick" size={16} /></span>{variantName(v)}{v.available < 1 && <span className="option-out">esgotada</span>}</label>
    </div>)}</div></fieldset>}
    <p className="availability">{allOut ? <strong>Esgotado</strong> : variant && variant.available > 0 ? <><Icon name="check" size={16} /><span>{variant.available <= 5 ? `Últimas ${variant.available} unidades` : 'Em estoque'}</span></> : <span>Esta opção está esgotada</span>}</p>
    {allOut ? <p className="small muted">Volte mais tarde ou <a href={contactHref}>fale com a loja</a> para saber se haverá reposição.</p> : <>
      <div className={`qty${qtyError ? ' is-invalid' : ''}`}>
        <label htmlFor="qty-input">Quantidade</label>
        <div className="stepper">
          <button type="button" aria-label="Diminuir quantidade" disabled={qty <= 1} onClick={() => setQty(Math.max(1, qty - 1))}><Icon name="minus" /></button>
          <input id="qty-input" name="quantity" inputMode="numeric" value={qty} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setQty(Number.isFinite(n) ? n : 1); }} aria-describedby={qtyError ? 'qty-err' : undefined} aria-invalid={qtyError ? true : undefined} />
          <button type="button" aria-label="Aumentar quantidade" disabled={qty >= maxQty} onClick={() => setQty(Math.min(maxQty, qty + 1))}><Icon name="plus" /></button>
        </div>
        {qtyError && <p className="error-text" id="qty-err"><Icon name="alert" size={16} />{qtyError}</p>}
      </div>
      <button className="btn btn-primary btn-block" disabled={!ready || busy || !variant || variant.available < 1}>{busy ? 'Adicionando…' : 'Adicionar ao carrinho'}</button>
    </>}
    {error && <p className="error-text" role="alert"><Icon name="alert" size={16} />{error}</p>}
    {added && <p role="status" className="added"><Icon name="tick" size={16} />{added} <a href={cartHref}>Ver carrinho</a></p>}
  </form>;
}

// ---------- Mídia ----------
// Sem foto: superfície neutra com o nome da categoria, nunca uma imagem genérica que pareça o produto.
function NoPhoto({ label }: { label?: string }) {
  return <div className="no-photo" role="img" aria-label="Produto sem foto"><Icon name="image" size={20} />{label && <span>{label}</span>}</div>;
}
function Gallery({ product, url, category }: { product: Product; url: (id: string, size: string) => string; category?: string }) {
  const [index, setIndex] = useState(0), count = product.media.length, current = product.media[index];
  if (!current) return <div className="gallery"><div className="gallery-frame is-empty"><NoPhoto label={category ? `${category} · foto ainda não enviada` : 'Foto ainda não enviada'} /></div></div>;
  const go = (i: number) => setIndex((i + count) % count);
  return <div className="gallery" aria-roledescription="galeria" aria-label={`Imagens de ${product.name}`}>
    <figure className="gallery-frame"><img src={url(current.id, 'large')} alt={count > 1 ? `${product.name}, imagem ${index + 1} de ${count}` : product.name} width={1200} height={1500} />
      {count > 1 && <div className="gallery-nav"><button type="button" onClick={() => go(index - 1)} aria-label="Imagem anterior"><Icon name="back" /></button><span className="gallery-count" aria-live="polite">{index + 1} de {count}</span><button type="button" onClick={() => go(index + 1)} aria-label="Próxima imagem"><Icon name="chevron" /></button></div>}
    </figure>
    {count > 1 && <ul className="thumbs" aria-label="Escolher imagem">{product.media.map((m, i) => <li key={m.id}><button type="button" aria-label={`Mostrar imagem ${i + 1} de ${count}`} aria-current={i === index ? 'true' : undefined} onClick={() => setIndex(i)}><img src={url(m.id, 'small')} alt="" loading="lazy" width={96} height={120} /></button></li>)}</ul>}
  </div>;
}
function ProductCard({ p, href, url, category, eager, feature }: { p: Product; href: string | null; url: (id: string, size: string) => string; category?: string; eager?: boolean; feature?: boolean }) {
  const price = priceLabel(p), out = soldOut(p), options = p.variants.filter((v) => v.active).length;
  const media = <span className="card-media">{p.media[0] ? <img src={url(p.media[0].id, feature ? 'large' : 'small')} alt="" loading={eager ? 'eager' : 'lazy'} width={600} height={750} /> : <NoPhoto label={category} />}</span>;
  const meta = <span className="card-meta">{price && <span className="card-price">{price}</span>}{out ? <span className="card-out">Esgotado</span> : options > 1 ? <span className="card-options">{options} opções</span> : null}</span>;
  if (!href) return <li className={`card${out ? ' is-out' : ''}`}><span className="unavailable">{media}<span className="card-name">{p.name}</span>{meta}<span className="unavailable-note"> (indisponível na prévia)</span></span></li>;
  // Um só produto na seção: destaque com foto grande, nome, preço e ação.
  if (feature) return <li className={`card card-feature${out ? ' is-out' : ''}`}>
    <a className="card-media-link" href={href} tabIndex={-1} aria-hidden="true">{media}</a>
    <div className="feature-body"><a className="card-name" href={href}>{p.name}</a>{meta}<a className="btn btn-primary card-cta" href={href}>Ver produto<span className="sr-only">: {p.name}</span></a></div>
  </li>;
  return <li className={`card${out ? ' is-out' : ''}`}><a className="card-link" href={href}>{media}<span className="card-name">{p.name}</span></a>{meta}</li>;
}

// ---------- Seções ----------
type Ctx = { theme: Theme; data: StoreData; url: (id: string, size: string) => string; link: (to: string, label: ReactNode, o?: { className?: string; current?: boolean }) => ReactNode; href: (to: string) => string | null; themeHref: (l: ThemeLink) => { href: string; external?: boolean } | null; categoryName: (id?: string | null) => string | undefined; mediaUrl: (id: string, size: string) => string };
function SectionView({ s, ctx, first }: { s: Section; ctx: Ctx; first: boolean }) {
  const H = first ? 'h2' : 'h2';
  if (s.type === 'hero') {
    const cta = s.cta ? ctx.themeHref(s.cta) : null, img = s.image ? ctx.mediaUrl(s.image, 'large') : null, layout = img ? s.layout : 'stacked';
    return <section className={`sec hero hero-${layout}${img ? '' : ' no-image'}`} aria-label={s.heading || 'Destaque'}>
      {img && <div className="hero-media"><img src={img} alt="" style={{ objectPosition: `${s.focal.x}% ${s.focal.y}%` }} width={1600} height={1000} fetchPriority={first ? 'high' : 'auto'} /></div>}
      <div className="hero-text">{s.heading && <H className="display hero-title">{s.heading}</H>}{s.text && <p className="hero-lead">{s.text}</p>}{s.cta && cta && <a className="btn btn-primary" href={cta.href} {...(cta.external ? { rel: 'noopener noreferrer', target: '_blank' } : {})}>{s.cta.label}{cta.external && <span className="sr-only"> (abre outro site)</span>}</a>}</div>
    </section>;
  }
  if (s.type === 'products') {
    const all = ctx.data.products, catId = s.source === 'category' ? ctx.data.categories.find((c) => c.slug === s.category)?.id : undefined;
    const list = (s.source === 'manual' ? s.products.map((id) => all.find((p) => p.id === id)).filter((p): p is Product => !!p) : s.source === 'category' ? all.filter((p) => p.category_id && p.category_id === catId) : all).slice(0, s.limit);
    const more = s.source === 'category' && s.category ? `/categorias/${s.category}` : '/produtos';
    if (!list.length) return null;
    return <section className="sec products" aria-labelledby={`t-${s.id}`} id={s.id}>
      <div className="sec-head">{s.heading ? <h2 id={`t-${s.id}`} className="display">{s.heading}</h2> : <h2 id={`t-${s.id}`} className="sr-only">Produtos</h2>}{(s.source !== 'manual' && all.length > list.length) && ctx.link(more, 'Ver todos', { className: 'sec-more' })}</div>
      <ul className={`cards${list.length === 1 ? ' is-single' : list.length === 2 ? ' is-pair' : ''}`}>{list.map((p, i) => <ProductCard key={p.id} p={p} href={ctx.href(`/produtos/${p.slug}`)} url={ctx.url} category={ctx.categoryName(p.category_id)} eager={first && i < 4} feature={list.length === 1} />)}</ul>
    </section>;
  }
  if (s.type === 'categories') {
    const cats = s.categories.length ? s.categories.map((slug) => ctx.data.categories.find((c) => c.slug === slug)).filter((c): c is Category => !!c) : ctx.data.categories;
    if (!cats.length) return null;
    const count = (c: Category) => ctx.data.products.filter((p) => c.id && p.category_id === c.id).length;
    return <section className="sec categories" aria-labelledby={`t-${s.id}`}>
      <div className="sec-head">{s.heading ? <h2 id={`t-${s.id}`} className="display">{s.heading}</h2> : <h2 id={`t-${s.id}`} className="sr-only">Categorias</h2>}</div>
      <ul className="category-list">{cats.map((c) => <li key={c.slug}>{ctx.link(`/categorias/${c.slug}`, <><span className="cat-name">{c.name}</span>{count(c) > 0 && <span className="cat-count">{count(c)} {count(c) === 1 ? 'produto' : 'produtos'}</span>}</>)}</li>)}</ul>
    </section>;
  }
  if (s.type === 'image_text') {
    const img = s.image ? ctx.mediaUrl(s.image, 'large') : null;
    return <section className={`sec image-text side-${s.side}${img ? '' : ' no-image'}`} aria-labelledby={`t-${s.id}`}>
      {img && <div className="it-media"><img src={img} alt="" loading="lazy" style={{ objectPosition: `${s.focal.x}% ${s.focal.y}%` }} width={1200} height={900} /></div>}
      <div className="it-text">{s.heading && <h2 id={`t-${s.id}`} className="display">{s.heading}</h2>}{s.text && <p className="prose">{s.text}</p>}</div>
    </section>;
  }
  return <section className="sec text-block" aria-labelledby={`t-${s.id}`}>{s.heading && <h2 id={`t-${s.id}`} className="display">{s.heading}</h2>}<p className="prose">{s.text}</p></section>;
}

// ---------- Página ----------
export default function Storefront({ data, path = [], preview = false, previewTenant, q = '', live = false }: { data: StoreData; path?: string[]; preview?: boolean; previewTenant?: string; q?: string; live?: boolean }) {
  const { theme, route } = data, base = preview ? `/preview/${previewTenant}` : `/lojas/${route.slug}`, supplier = theme.supplier;
  // Na prévia, só início, catálogo, páginas e produtos têm versão privada; os outros destinos viram texto (nunca 404 nem loja pública).
  const href = (to: string) => { const p = to === '/' ? '' : to; return !preview || p === '' || p === '/produtos' || p.startsWith('/#') || /^\/(paginas|produtos|categorias)\/[^/]+$/.test(p) ? `${base}${p}` : null; };
  const link = (to: string, label: ReactNode, o: { className?: string; current?: boolean } = {}) => { const h = href(to); return h ? <a className={o.className} href={h} aria-current={o.current ? 'page' : undefined}>{label}</a> : <span className={`unavailable${o.className ? ` ${o.className}` : ''}`}>{label}<span className="unavailable-note"> (indisponível na prévia)</span></span>; };
  const url = (asset: string, size: string) => previewTenant ? `/api/tenants/${previewTenant}/storefront/media/${asset}/${size}` : `/api/public/stores/${route.slug}/media/${asset}/${size}`;
  const themeHref = (l: ThemeLink) => { const r = hrefOf(l.to, { products: data.products, categories: data.categories, pages: theme.pages }); if (!r) return null; if (r.external) return { href: r.path, external: true }; const h = href(r.path); return h ? { href: h } : null; };
  const categoryName = (id?: string | null) => data.categories.find((c) => c.id && c.id === id)?.name;
  const ctx: Ctx = { theme, data, url, link, href, themeHref, categoryName, mediaUrl: url };
  const product = path[0] === 'produtos' && path[1] ? data.products.find((p) => p.slug === path[1]) : null;
  const page = path[0] === 'paginas' ? theme.pages.find((p) => p.slug === path[1]) : null;
  const category = path[0] === 'categorias' ? data.categories.find((c) => c.slug === path[1]) : null;
  const catalog = path.length === 1 && path[0] === 'produtos';
  const home = path.length === 0, here = `/${path.join('/')}`;
  const menuRef = useRef<HTMLDialogElement>(null), [searchOpen, setSearchOpen] = useState(false);
  const unavailable = <div className="store-page"><EmptyState icon="eye" title="Indisponível na prévia" action={<a className="btn btn-secondary" href={base}>Voltar ao início da prévia</a>}>Busca, carrinho, atendimento e pedidos só funcionam na loja publicada. A prévia mostra o início, o catálogo, as páginas e os produtos do rascunho.</EmptyState></div>;
  const grid = (list: Product[], label: string) => list.length ? <ul className="cards" aria-label={label}>{list.map((p, i) => <ProductCard key={p.id} p={p} href={href(`/produtos/${p.slug}`)} url={url} category={categoryName(p.category_id)} eager={i < 4} />)}</ul> : null;
  const categoryNav = (currentSlug?: string) => data.categories.length > 0 && <nav className="category-strip" aria-label="Categorias"><ul><li>{link('/produtos', 'Todos', { current: catalog && !currentSlug })}</li>{data.categories.map((c) => <li key={c.slug}>{link(`/categorias/${c.slug}`, c.name, { current: currentSlug === c.slug })}</li>)}</ul></nav>;
  let content: ReactNode;
  if (path[0] === 'carrinho') content = preview ? unavailable : <CartFlow slug={route.slug} />;
  else if (path[0] === 'atendimento') content = preview ? unavailable : <ContactPage slug={route.slug} />;
  else if (path[0] === 'pedidos' && path[1]) content = preview ? unavailable : <OrderView slug={route.slug} orderId={path[1]} />;
  else if (product) { const cat = categoryName(product.category_id), catSlug = data.categories.find((c) => c.id && c.id === product.category_id)?.slug; content = <div className="pdp-page">
    <nav aria-label="Trilha"><ol className="store-crumbs"><li>{link('/', 'Início')}</li>{cat && catSlug ? <li>{link(`/categorias/${catSlug}`, cat)}</li> : <li>{link('/produtos', 'Produtos')}</li>}<li aria-current="page">{product.name}</li></ol></nav>
    <div className="pdp">
      <Gallery product={product} url={url} category={cat} />
      <div className="buy">
        <h1 className="display buy-title">{product.name}</h1>
        {priceLabel(product) && <p className="price">{priceLabel(product)}</p>}
        {preview ? <p className="hint">A compra fica desativada na prévia.</p> : <AddToCart slug={route.slug} product={product} cartHref={`${base}/carrinho`} contactHref={`${base}/atendimento`} />}
        <p className="small muted ship-note"><Icon name="truck" size={16} />O frete é calculado no carrinho, pelo CEP.</p>
        <div className="info-list">
          {product.description && <section aria-labelledby="t-desc"><h2 id="t-desc">Descrição</h2><p className="prose">{product.description}</p></section>}
          {supplier?.risks && <details><summary>Cuidados</summary><p className="prose">{supplier.risks}</p></details>}
          {supplier?.delivery && <details><summary>Entrega e trocas</summary><p className="prose">{supplier.delivery}</p></details>}
        </div>
      </div>
    </div>
  </div>; }
  else if (page) content = <article className="reading"><h1 className="display">{page.title}</h1><p className="prose">{page.body}</p></article>;
  else if (category || catalog || (home && q)) {
    const title = category ? category.name : q ? `Resultados para “${q}”` : 'Todos os produtos', list = category ? data.products : data.products;
    content = <div className="store-page">
      {category && <nav aria-label="Trilha"><ol className="store-crumbs"><li>{link('/', 'Início')}</li><li aria-current="page">{category.name}</li></ol></nav>}
      <div className="listing-head"><h1 className="display">{title}</h1><p className="small muted">{list.length} {list.length === 1 ? 'produto' : 'produtos'}</p></div>
      {categoryNav(category?.slug)}
      {grid(list, title) ?? (q ? <EmptyState icon="search" title={`Nada encontrado para “${q}”`} action={<a className="btn btn-secondary" href={base}>Limpar busca</a>}>Confira a grafia ou busque por outro termo, como o nome da peça ou o código (SKU).</EmptyState> : <EmptyState icon="box" title={category ? 'Ainda não há produtos nesta categoria' : 'Ainda não há produtos à venda'}>{category ? link('/produtos', 'Ver todos os produtos') : 'Volte em breve.'}</EmptyState>)}
    </div>;
  }
  else {
    const visible = theme.sections.filter((s) => !s.hidden);
    content = <div className="home">
      <h1 className="sr-only">{theme.title}</h1>
      {visible.map((s, i) => <SectionView key={s.id} s={s} ctx={ctx} first={i === 0} />)}
      {!visible.some((s) => s.type === 'products') && data.products.length > 0 && <section className="sec products" aria-labelledby="t-all" id="produtos"><div className="sec-head"><h2 id="t-all" className="display">Produtos</h2></div>{grid(data.products.slice(0, 12), 'Produtos')}</section>}
      {data.products.length === 0 && <div className="store-page"><EmptyState icon="box" title="Ainda não há produtos à venda">Volte em breve.</EmptyState></div>}
    </div>;
  }
  const menu = theme.menu.map((m) => ({ m, h: themeHref(m) }));
  const navItems = <>{menu.map(({ m, h }, i) => <li key={`${m.label}-${i}`}>{h ? <a href={h.href} aria-current={!h.external && h.href === `${base}${here === '/' ? '' : here}` ? 'page' : undefined} {...(h.external ? { rel: 'noopener noreferrer', target: '_blank' } : {})}>{m.label}{h.external && <span className="sr-only"> (abre outro site)</span>}</a> : <span className="unavailable">{m.label}<span className="unavailable-note"> (indisponível na prévia)</span></span>}</li>)}
    {!theme.menu.some((m) => m.to.kind === 'contact') && <li>{link('/atendimento', 'Atendimento', { current: here === '/atendimento' })}</li>}</>;
  const brandMark = theme.brand.logo ? <img className="store-logo" src={url(theme.brand.logo, 'small')} alt={theme.title} height={40} /> : <span className="store-title display">{theme.title}</span>;
  const search = !preview && <form className="store-search" action={base} role="search">
    <label className="sr-only" htmlFor="store-q">Buscar produtos</label>
    <input className="input" id="store-q" type="search" name="q" maxLength={100} defaultValue={q} placeholder="Buscar produtos" enterKeyHint="search" />
    <button className="btn btn-secondary" aria-label="Buscar"><Icon name="search" size={20} /></button>
  </form>;
  return <div className="surface-store" data-store={route.slug} data-preset={theme.preset} data-density={theme.layout.density} style={themeStyle(theme) as CSSProperties}>
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    {preview && !live && <div className="notice-bar store-notice"><div className="store-wrap cluster-tight"><Icon name="eye" size={16} /><strong>Prévia privada do rascunho, não publicada.</strong><span>Produtos e preços vêm do catálogo atual.</span>{previewTenant && <a href={`/painel/${previewTenant}/aparencia`}>Voltar ao editor</a>}</div></div>}
    {!preview && supplier?.synthetic && <div className="notice-bar store-notice"><div className="store-wrap">Loja de teste: produtos, contatos e políticas fictícios; nenhuma venda real é feita.</div></div>}
    <header className="store-header"><div className="store-wrap head-row">
      <button type="button" className="store-menu-toggle" onClick={() => menuRef.current?.showModal()} aria-haspopup="dialog" aria-controls="menu-loja"><Icon name="menu" /><span className="sr-only">Menu da loja</span></button>
      <div className="store-brand">{home && !q ? link('/', brandMark) : link('/', brandMark)}</div>
      <nav className="store-nav" aria-label="Navegação da loja"><ul>{navItems}</ul></nav>
      <div className="head-actions">
        {!preview && theme.preset !== 'essencial' && <button type="button" className="icon-link search-toggle" aria-expanded={searchOpen} aria-controls="busca-loja" onClick={() => setSearchOpen(!searchOpen)}><Icon name="search" /><span className="sr-only">{searchOpen ? 'Esconder busca' : 'Mostrar busca'}</span></button>}
        {!preview && <a className="icon-link store-cart" href={`${base}/carrinho`} aria-current={here === '/carrinho' ? 'page' : undefined}><Icon name="cart" /><span className="cart-label">Carrinho</span></a>}
      </div>
    </div>
      {search && <div id="busca-loja" className={`store-wrap search-row${theme.preset === 'essencial' || searchOpen || q ? '' : ' is-collapsed'}`}>{search}</div>}
    </header>
    <dialog ref={menuRef} id="menu-loja" className="drawer store-drawer" aria-label="Menu da loja" onClick={(e) => { if (e.target === menuRef.current) menuRef.current?.close(); }}>
      <div className="drawer-inner"><div className="drawer-head"><span className="store-title display">{theme.title}</span><button type="button" className="icon-button" onClick={() => menuRef.current?.close()} aria-label="Fechar menu"><Icon name="x" /></button></div>
        <nav aria-label="Navegação da loja (menu)"><ul className="drawer-links">{navItems}{data.categories.map((c) => <li key={c.slug}>{link(`/categorias/${c.slug}`, c.name)}</li>)}</ul></nav></div>
    </dialog>
    <main id="conteudo" className="store-main" tabIndex={-1}><div className="store-wrap">{content}</div></main>
    <footer className="store-footer"><div className="store-wrap footer-grid">
      <section aria-labelledby="t-foot-store"><p id="t-foot-store" className="foot-title">{theme.title}</p>{theme.description && <p className="small muted">{theme.description}</p>}
        {(theme.footer.links.length > 0 || theme.pages.length > 0) && <ul className="foot-links">{(theme.footer.links.length ? theme.footer.links : theme.pages.map((p) => ({ label: p.title, to: { kind: 'page' as const, ref: p.slug } }))).map((l, i) => { const h = themeHref(l); return <li key={i}>{h ? <a href={h.href} {...(h.external ? { rel: 'noopener noreferrer', target: '_blank' } : {})}>{l.label}</a> : <span className="muted">{l.label}</span>}</li>; })}</ul>}
        {theme.footer.note && <p className="small muted prose">{theme.footer.note}</p>}</section>
      {supplier && <section aria-labelledby="t-supplier"><h2 id="t-supplier" className="foot-title">Fornecedor e atendimento</h2><p className="small"><strong>{supplier.name}</strong>{supplier.document && <><br />CPF/CNPJ {supplier.document}</>}<br />{supplier.address}</p><p className="small"><a href={`mailto:${supplier.email}`}>{supplier.email}</a><br />{supplier.phone}</p><p className="small">{link('/atendimento', 'Fale com a loja')}</p></section>}
      {supplier && <section aria-labelledby="t-policies"><h2 id="t-policies" className="foot-title">Políticas</h2><details className="small"><summary>Trocas, arrependimento e privacidade</summary><p className="prose">{supplier.policies}</p></details><details className="small"><summary>Entrega e restrições</summary><p className="prose">{supplier.delivery}</p></details>{supplier.synthetic && <p className="small muted">Ambiente de teste: contatos e políticas fictícios.</p>}</section>}
    </div></footer>
  </div>;
}
