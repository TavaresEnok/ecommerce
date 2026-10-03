import { NextRequest,NextResponse } from 'next/server';
import { edgeHeaders } from './components/edge';
const API=process.env.API_INTERNAL_URL || 'http://localhost:3001';
const PLATFORM=['localhost','127.0.0.1','web',...(process.env.PLATFORM_HOST?[process.env.PLATFORM_HOST.toLowerCase()]:[])];
const notFound=(message:string)=>new NextResponse(message,{status:404,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
export async function proxy(request:NextRequest){const host=request.headers.get('host')?.toLowerCase().split(':')[0]||'',path=request.nextUrl.pathname;
  // Internal endpoints (e.g. Caddy TLS permission) are only reachable inside the network.
  if(path.startsWith('/api/internal'))return notFound('Não encontrado');
  const managed=host.endsWith('.localhost')||PLATFORM.slice(3).some(p=>host.endsWith(`.${p}`));
  if(PLATFORM.includes(host))return NextResponse.next();
  // Managed subdomain or a store's own domain: resolution is done by the API (only ACTIVE custom domains resolve).
  const response=await fetch(`${API}/public/resolve?host=${encodeURIComponent(host)}`,{cache:'no-store',headers:edgeHeaders(request.headers)});
  if(!response.ok)return notFound(managed?'Loja não encontrada':'Host não autorizado');
  const route=await response.json() as {slug:string;canonical:string};
  if(path.startsWith('/api/public/stores/')&&path.split('/')[4]!==route.slug)return notFound('Loja incompatível com hostname');
  if(path.startsWith('/api/'))return NextResponse.next();
  // After an explicit canonical choice, public GET/HEAD on the old address move with 301; POST/checkout/webhooks are never redirected.
  const canonical=new URL(route.canonical),customCanonical=!canonical.hostname.endsWith('.localhost')&&!PLATFORM.slice(3).some(p=>canonical.hostname.endsWith(`.${p}`));
  if(['GET','HEAD'].includes(request.method)&&customCanonical&&canonical.hostname!==host){const target=new URL(path.startsWith(`/lojas/${route.slug}`)?path.slice(`/lojas/${route.slug}`.length)||'/':path,canonical);target.search=request.nextUrl.search;return NextResponse.redirect(target,301);}
  if(path.startsWith('/lojas/'))return path.split('/')[2]===route.slug?NextResponse.next():notFound('Loja incompatível com hostname');
  const url=request.nextUrl.clone();url.pathname=`/lojas/${route.slug}${url.pathname}`;return NextResponse.rewrite(url);
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
