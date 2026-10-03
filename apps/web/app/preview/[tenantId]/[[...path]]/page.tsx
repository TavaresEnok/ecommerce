import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Storefront,{type StoreData} from '../../../../components/storefront';
// Preview privado do rascunho: cada página pede de novo o rascunho à API com a sessão de quem abre (autorização no servidor).
// Só início, páginas do tema e produtos têm versão privada; outros destinos aparecem como indisponíveis na própria vitrine.
export const metadata:Metadata={title:'Preview privado',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
type Props={params:Promise<{tenantId:string;path?:string[]}>};
export default async function Preview({params}:Props){const {tenantId,path=[]}=await params,cookie=(await cookies()).toString(),response=await fetch(`${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/tenants/${encodeURIComponent(tenantId)}/storefront/preview`,{cache:'no-store',headers:{cookie}});
 if(!response.ok)return <div className="surface-panel auth"><header className="auth-head"><a className="wordmark" href="/">Plataforma</a></header><main className="auth-main" id="conteudo"><h1>Preview privado</h1><p>Acesso negado ou rascunho inexistente. Entre como integrante autorizado da loja.</p><p><a className="btn btn-primary" href="/">Entrar no painel</a></p></main><footer className="auth-foot">Plataforma (nome provisório)</footer></div>;
 const data=await response.json() as StoreData;
 // Destinos da loja sem versão de rascunho (categoria, carrinho, atendimento, pedido) mostram “Não disponível no preview”;
 // só endereços que não existem na loja dão 404.
 const ok=path.length===0||(path.length===2&&((path[0]==='paginas'&&data.theme.pages.some(p=>p.slug===path[1]))||(path[0]==='produtos'&&data.products.some(p=>p.slug===path[1]))||['categorias','pedidos'].includes(path[0]!)))||(path.length===1&&['carrinho','atendimento'].includes(path[0]!));
 if(!ok)notFound();
 return <Storefront preview previewTenant={tenantId} path={path} data={{...data,route:{slug:'preview',canonical:''},categories:[]}}/>;
}
