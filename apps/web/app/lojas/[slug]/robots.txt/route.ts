import { loadStore } from '../../../../components/store-data';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){const {slug}=await params,data=await loadStore(slug);return new Response(`User-agent: *\n${data.noindex?'Disallow: /':'Disallow: /painel\nDisallow: /preview\nDisallow: /api\nDisallow: /carrinho'}\nSitemap: ${data.route.canonical}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});}
