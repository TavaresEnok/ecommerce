import type { Metadata } from 'next';
import { edgeHeaders } from '../../../../components/edge';
import { headers } from 'next/headers';
import { notFound,permanentRedirect } from 'next/navigation';
import Storefront from '../../../../components/storefront';
import { loadProduct,loadStore,loadStoreOptional,decimal } from '../../../../components/store-data';
import { OrderView } from '../../../../components/checkout';
type Props={params:Promise<{slug:string;path?:string[]}>;searchParams:Promise<{q?:string}>};
export const dynamic='force-dynamic';
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug,path=[]}=await params;if(path[0]==='pedidos')return {title:'Pedido',robots:{index:false,follow:false}};const data=await loadStore(slug),product=path[0]==='produtos'&&path[1]?await loadProduct(slug,path[1]):null,page=path[0]==='paginas'?data.theme.pages.find(p=>p.slug===path[1]):null;return {title:product?`${product.name} — ${data.theme.title}`:page?`${page.title} — ${data.theme.title}`:data.theme.title,description:product?product.description.slice(0,300):data.theme.description,alternates:{canonical:`${data.route.canonical}/${path.join('/')}`},robots:{index:!data.noindex&&!['carrinho','pedidos','atendimento'].includes(path[0]||''),follow:!data.noindex}};}
export default async function Page({params,searchParams}:Props){const {slug,path=[]}=await params;
  // Orders stay reachable when the store is suspended: obligations to buyers continue.
  if(path[0]==='pedidos'&&path.length===2&&/^[0-9a-f-]{36}$/.test(path[1]!)&&!await loadStoreOptional(slug))return <div className="surface-store"><div className="notice-bar store-notice"><div className="store-wrap">Loja com vendas suspensas · pedidos existentes continuam atendidos.</div></div><main id="conteudo" className="store-wrap"><OrderView slug={slug} orderId={path[1]!}/></main></div>;
  const {q=''}=await searchParams,data=await loadStore(slug,path.length?'':q,path[0]==='categorias'?path[1]:''),product=path[0]==='produtos'&&path[1]?await loadProduct(slug,path[1]):null;
  if(path.length&&!['produtos','categorias','paginas','carrinho','pedidos','atendimento'].includes(path[0]))notFound();
  if(path.length>2 || (['carrinho','atendimento'].includes(path[0]||'')&&path.length!==1)||(path[0]==='pedidos'&&!/^[0-9a-f-]{36}$/.test(path[1]||'')))notFound();
  if(path[0]==='produtos'&&path.length===2&&!product){const response=await fetch(`${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/public/stores/${encodeURIComponent(slug)}/redirect/${encodeURIComponent(path[1]||'')}`,{cache:'no-store',headers:edgeHeaders(await headers())});if(response.ok){const current=await response.json();if(current.slug!==path[1])permanentRedirect(`/lojas/${slug}/produtos/${current.slug}`);}notFound();}if(path[0]==='paginas'&&!data.theme.pages.some(p=>p.slug===path[1]))notFound();if(path[0]==='categorias'&&!data.categories.some(c=>c.slug===path[1]))notFound();
  const json=product?{'@context':'https://schema.org','@type':'Product',name:product.name,description:product.description,url:`${data.route.canonical}/produtos/${product.slug}`,image:product.media.map(m=>`${data.route.canonical}/api/public/stores/${slug}/media/${m.id}/large`),offers:product.variants.filter(v=>v.active).map(v=>({'@type':'Offer',sku:v.sku,price:decimal(v.price_cents),priceCurrency:'BRL',availability:`https://schema.org/${v.available>0?'InStock':'OutOfStock'}`,url:`${data.route.canonical}/produtos/${product.slug}`,seller:{'@type':'Organization',name:data.theme.supplier?.name}}))}:null;
  if(product)data.products=[product];
  return <>{json&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(json).replace(/</g,'\\u003c')}}/>}<Storefront data={data} path={path} q={path.length?'':q}/></>;
}
