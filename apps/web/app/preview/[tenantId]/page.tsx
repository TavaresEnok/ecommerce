import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import Storefront,{type StoreData} from '../../../components/storefront';
export const metadata:Metadata={title:'Preview privado',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function Preview({params}:{params:Promise<{tenantId:string}>}){const {tenantId}=await params,cookie=(await cookies()).toString(),response=await fetch(`${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/tenants/${encodeURIComponent(tenantId)}/storefront/preview`,{cache:'no-store',headers:{cookie}});
 if(!response.ok)return <div className="surface-panel auth"><header className="auth-head"><a className="wordmark" href="/">Plataforma</a></header><main className="auth-main" id="conteudo"><h1>Preview privado</h1><p>Acesso negado ou rascunho inexistente. Entre como integrante autorizado da loja.</p><p><a className="btn btn-primary" href="/">Entrar no painel</a></p></main><footer className="auth-foot">Plataforma (nome provisório)</footer></div>;
 const data=await response.json();return <Storefront preview previewTenant={tenantId} data={{...data,route:{slug:'preview',canonical:''},categories:[]} as StoreData}/>;
}
