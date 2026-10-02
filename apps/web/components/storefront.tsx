'use client';
// Vitrine (R07–R14): catálogo, categoria, produto, página institucional e compra, com a cor e a fonte de títulos do tema
// passando pelo algoritmo de marca (components/brand.ts). Nada da identidade da Plataforma aparece aqui.
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { CartFlow, ContactPage, OrderView } from './checkout';
import { storeStyle } from './brand';
import { money } from './ui/format';
import { Icon } from './ui/icons';
import { Alert, EmptyState, Field } from './ui/kit';
export { money };
export type Variant={id:string;sku:string;attributes:Record<string,string>;is_default:boolean;active:boolean;price_cents:string;available:number};
export type Product={id:string;name:string;slug:string;description:string;status:string;variants:Variant[];media:{id:string}[]};
export type Theme={title:string;description:string;hero:string;color:string;font:string;assets?:string[];pages:{slug:string;title:string;body:string}[];menu:{label:string;path:string}[];supplier?:{synthetic:boolean;name:string;document:string;address:string;email:string;phone:string;policies:string;delivery:string;risks:string}};
export type StoreData={route:{slug:string;canonical:string};theme:Theme;products:Product[];categories:{slug:string;name:string}[];noindex:boolean};

const variantName = (v: Variant) => Object.values(v.attributes).join(' / ') || 'Padrão';
const min = (values: string[]) => values.reduce((a, b) => (BigInt(b) < BigInt(a) ? b : a));
function priceLabel(p: Product) {
  const active = p.variants.filter((v) => v.active);
  if (!active.length) return null;
  const prices = active.map((v) => v.price_cents), low = min(prices);
  return prices.some((c) => c !== low) ? `A partir de ${money(low)}` : money(low);
}

function AddToCart({ slug, product }: { slug: string; product: Product }) {
  const variants = product.variants.filter((v) => v.active);
  const first = variants.find((v) => v.available > 0) ?? variants[0];
  const [selected, setSelected] = useState(first?.id ?? ''), [added, setAdded] = useState(''), [error, setError] = useState(''), [qtyError, setQtyError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const variant = variants.find((v) => v.id === selected), soldOut = variants.every((v) => v.available < 1);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const quantity = Number(new FormData(e.currentTarget).get('quantity'));
    setBusy(true); setError(''); setQtyError(''); setAdded('');
    try {
      const response = await fetch(`/api/public/stores/${slug}/cart/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant_id: selected, quantity }), cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { const m = typeof data.error === 'string' ? data.error : data.error?.message || (response.status === 429 ? 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.' : 'Não foi possível adicionar. Tente novamente.'); if (/quantidade|saldo|estoque|dispon/i.test(m)) setQtyError(m); else setError(m); return; }
      setAdded(`${variants.length > 1 ? `${variantName(variant!)} adicionada` : 'Adicionado'} ao carrinho.`);
    } catch { setError('Não foi possível conectar. Verifique sua conexão e tente novamente.'); }
    finally { setBusy(false); }
  }
  if (!variants.length) return <p className="hint">Produto sem variação disponível no momento.</p>;
  return <form className="stack" aria-label={`Adicionar ${product.name}`} onSubmit={(e) => void submit(e)}>
    {variants.length > 1 && <fieldset><legend>Variação</legend><div className="options">{variants.map((v) => <div className="option" key={v.id}>
      <input type="radio" name="variant" id={`v-${v.id}`} value={v.id} checked={selected === v.id} disabled={v.available < 1} onChange={() => { setSelected(v.id); setAdded(''); setQtyError(''); }} />
      <label htmlFor={`v-${v.id}`}><span className="tick"><Icon name="check" size={16} /></span>{variantName(v)}{v.available < 1 && <span className="small"> · esgotada</span>}</label>
    </div>)}</div></fieldset>}
    {variant && <p className="small muted">{variant.available > 0 ? `${variant.available} ${variant.available === 1 ? 'disponível' : 'disponíveis'}` : 'Esgotada'} · SKU {variant.sku}</p>}
    {soldOut ? <p><strong>Produto esgotado.</strong> <span className="muted">Volte mais tarde ou fale com a loja.</span></p> :
    <div className="qty-row">
      <Field label="Quantidade" error={qtyError}>{(a) => <input className="input" name="quantity" type="number" inputMode="numeric" min={1} max={Math.min(99, variant?.available || 1)} defaultValue={1} required {...a} />}</Field>
      <button className="btn btn-primary" disabled={!ready || busy || !variant || variant.available < 1}>{busy ? 'Adicionando…' : 'Adicionar ao carrinho'}</button>
    </div>}
    <p role="status" className={added ? 'alert alert-success' : 'sr-only'} style={added ? { display: 'flex', gap: 'var(--space-8)', alignItems: 'center', flexWrap: 'wrap' } : undefined}>{added && <><Icon name="check" size={16} />{added} <a href={`/lojas/${slug}/carrinho`}>Ver carrinho</a></>}</p>
    {error && <Alert tone="danger" role="alert" title="Não foi possível adicionar">{error}</Alert>}
  </form>;
}

function Gallery({ product, url }: { product: Product; url: (id: string, size: string) => string }) {
  const [index, setIndex] = useState(0), current = product.media[index];
  if (!current) return <div className="media no-photo-media" role="img" aria-label="Produto sem foto"><Icon name="box" size={20} /><span>Sem foto</span></div>;
  return <div className="gallery">
    <figure className="media"><img src={url(current.id, 'large')} alt={product.media.length > 1 ? `${product.name} — imagem ${index + 1} de ${product.media.length}` : product.name} /></figure>
    {product.media.length > 1 && <ul className="thumbs" aria-label="Imagens do produto">{product.media.map((m, i) => <li key={m.id}><button type="button" aria-label={`Mostrar imagem ${i + 1} de ${product.media.length}`} aria-current={i === index ? 'true' : undefined} onClick={() => setIndex(i)}><img src={url(m.id, 'small')} alt="" loading="lazy" /></button></li>)}</ul>}
  </div>;
}

function Tiles({ products, base, url }: { products: Product[]; base: string; url: (id: string, size: string) => string }) {
  return <ul className="tiles">{products.map((p) => { const price = priceLabel(p), soldOut = p.variants.filter((v) => v.active).every((v) => v.available < 1); return <li className="tile" key={p.id}>
    {p.media[0] ? <figure className="media"><img src={url(p.media[0].id, 'small')} alt="" loading="lazy" /></figure> : <div className="media no-photo-media"><Icon name="box" size={20} /><span>Sem foto</span></div>}
    <a href={`${base}/produtos/${p.slug}`}>{p.name}</a>
    {price && <span className="price-sm">{price}</span>}
    {soldOut && <span className="small muted">Esgotado</span>}
  </li>; })}</ul>;
}

export default function Storefront({data,path=[],preview=false,previewTenant,q=''}:{data:StoreData;path?:string[];preview?:boolean;previewTenant?:string;q?:string}) {
  const { theme, route } = data, base = `/lojas/${route.slug}`, supplier = theme.supplier;
  const product = path[0] === 'produtos' ? data.products.find((p) => p.slug === path[1]) : null;
  const page = path[0] === 'paginas' ? theme.pages.find((p) => p.slug === path[1]) : null;
  const category = path[0] === 'categorias' ? data.categories.find((c) => c.slug === path[1]) : null;
  const home = path.length === 0;
  const url = (asset: string, size: string) => previewTenant ? `/api/tenants/${previewTenant}/storefront/media/${asset}/${size}` : `/api/public/stores/${route.slug}/media/${asset}/${size}`;
  const here = `/${path.join('/')}`;
  const menu = theme.menu.filter((m) => !/^\/?painel/.test(m.path));
  const unavailable = <div className="store-page" style={{ paddingTop: 'var(--space-24)' }}><EmptyState icon="eye" title="Não disponível no preview">Carrinho, atendimento e pedidos funcionam só na vitrine publicada.</EmptyState></div>;
  let content: ReactNode;
  if (path[0] === 'carrinho') content = preview ? unavailable : <CartFlow slug={route.slug} />;
  else if (path[0] === 'atendimento') content = preview ? unavailable : <ContactPage slug={route.slug} />;
  else if (path[0] === 'pedidos' && path[1]) content = preview ? unavailable : <OrderView slug={route.slug} orderId={path[1]} />;
  else if (product) content = <>
    <nav aria-label="Trilha"><ol className="store-crumbs"><li><a href={base}>Início</a></li><li aria-current="page">{product.name}</li></ol></nav>
    <div className="pdp">
      <Gallery product={product} url={url} />
      <div className="buy">
        <div className="buy-head"><h1>{product.name}</h1>{priceLabel(product) && <p className="price">{priceLabel(product)}</p>}<p className="small muted">Frete calculado no carrinho, pelo CEP.</p></div>
        {preview ? <p className="hint">Compra desabilitada no preview.</p> : <AddToCart slug={route.slug} product={product} />}
        <div className="info-list">
          {product.description && <section aria-labelledby="t-desc"><h2 id="t-desc">Descrição</h2><p className="prose">{product.description}</p></section>}
          {supplier?.risks && <section aria-labelledby="t-risks"><h2 id="t-risks">Cuidados e riscos</h2><p className="prose">{supplier.risks}</p></section>}
          {supplier?.delivery && <section aria-labelledby="t-delivery-info"><h2 id="t-delivery-info">Entrega e trocas</h2><p className="prose">{supplier.delivery}</p></section>}
        </div>
      </div>
    </div>
  </>;
  else if (page) content = <article className="reading"><h1>{page.title}</h1><p className="prose">{page.body}</p></article>;
  else content = <>
    {home && !q ? <section className="store-intro" aria-labelledby="t-intro">
      {theme.assets?.[0] && <img className="store-hero-image" src={url(theme.assets[0], 'large')} alt="" />}
      <h2 id="t-intro">{theme.hero || 'Conheça nosso catálogo'}</h2>{theme.description && <p className="muted">{theme.description}</p>}
    </section> : category ? <><nav aria-label="Trilha"><ol className="store-crumbs"><li><a href={base}>Início</a></li><li aria-current="page">{category.name}</li></ol></nav><h1 style={{ paddingBottom: 'var(--space-16)' }}>{category.name}</h1></> :
      <h1 style={{ padding: 'var(--space-24) 0 var(--space-16)' }}>Resultados para “{q}”</h1>}
    {data.categories.length > 0 && <nav className="category-nav catalog-bar" aria-label="Categorias"><ul>
      <li><a href={base} aria-current={!category ? 'page' : undefined}>Todos</a></li>
      {data.categories.map((c) => <li key={c.slug}><a href={`${base}/categorias/${c.slug}`} aria-current={category?.slug === c.slug ? 'page' : undefined}>{c.name}</a></li>)}
    </ul></nav>}
    {data.products.length > 0 ? <Tiles products={data.products} base={base} url={url} /> :
      <div style={{ paddingBottom: 'var(--space-48)' }}>{q ? <EmptyState icon="search" title={`Nenhum produto encontrado para “${q}”`} action={<a className="btn btn-secondary" href={base}>Limpar busca</a>}>Confira a grafia ou busque pelo SKU.</EmptyState> :
        <EmptyState icon="box" title={category ? 'Nenhum produto nesta categoria' : 'Nenhum produto publicado ainda'}>{category ? <a href={base}>Ver todos os produtos</a> : 'Volte em breve.'}</EmptyState>}</div>}
  </>;
  return <div className="surface-store" data-store={route.slug} style={storeStyle(theme.color, theme.font) as CSSProperties}>
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    {preview && <div className="notice-bar store-notice"><div className="store-wrap cluster-tight"><Icon name="eye" size={16} /><strong>Preview privado do rascunho — não publicado.</strong><span>Busca e carrinho ficam desativados.</span>{previewTenant && <a href={`/painel/${previewTenant}?aba=vitrine`}>Voltar ao painel</a>}</div></div>}
    {!preview && supplier?.synthetic && <div className="notice-bar store-notice"><div className="store-wrap">Loja sintética de TESTE: produtos, contatos e políticas fictícios; nenhuma venda real é feita.</div></div>}
    <header className="store-header"><div className="store-wrap">
      {home && !q ? <h1 className="store-name"><a href={base}>{theme.title}</a></h1> : <p className="store-name"><a href={base}>{theme.title}</a></p>}
      <nav className="store-nav" aria-label="Navegação da loja"><ul>
        {menu.map((m) => { const p = m.path === '/' ? '' : m.path; return <li key={m.path}><a href={`${base}${p}`} aria-current={(p || '/') === here ? 'page' : undefined}>{m.label}</a></li>; })}
        {!menu.some((m) => m.path === '/atendimento') && <li><a href={`${base}/atendimento`} aria-current={here === '/atendimento' ? 'page' : undefined}>Atendimento</a></li>}
      </ul></nav>
      {!preview && <form className="store-search" action={base} role="search">
        <label className="sr-only" htmlFor="store-q">Buscar produto ou SKU</label>
        <input className="input" id="store-q" type="search" name="q" maxLength={100} defaultValue={q} placeholder="Buscar produto ou SKU" />
        <button className="btn btn-secondary" aria-label="Pesquisar"><Icon name="search" size={20} /></button>
      </form>}
      {!preview && <a className="store-cart btn btn-quiet" href={`${base}/carrinho`} aria-current={here === '/carrinho' ? 'page' : undefined}><Icon name="cart" size={20} />Carrinho</a>}
    </div></header>
    <main id="conteudo" className="store-wrap" tabIndex={-1}>{content}</main>
    {supplier && <footer className="store-footer"><div className="store-wrap cols">
      <section aria-labelledby="t-supplier"><h2 id="t-supplier">Fornecedor e atendimento</h2><p><strong>{supplier.name}</strong></p>{supplier.document && <p>Documento: {supplier.document}</p>}<p>{supplier.address}</p><p><a href={`mailto:${supplier.email}`}>{supplier.email}</a> · {supplier.phone}</p><p><a href={`${base}/atendimento`}>Fale com a loja</a></p></section>
      <section aria-labelledby="t-policies"><h2 id="t-policies">Políticas do fornecedor</h2><p className="prose">{supplier.policies}</p></section>
      <section aria-labelledby="t-shipping"><h2 id="t-shipping">Entrega e restrições</h2><p className="prose">{supplier.delivery}</p>{theme.pages.length > 0 && <ul style={{ listStyle: 'none', marginTop: 'var(--space-12)' }}>{theme.pages.map((p) => <li key={p.slug}><a href={`${base}/paginas/${p.slug}`}>{p.title}</a></li>)}</ul>}{supplier.synthetic && <p className="small">Ambiente TESTE — contatos e políticas fictícios; não realiza vendas.</p>}</section>
    </div></footer>}
  </div>;
}
