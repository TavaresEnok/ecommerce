import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { type StoreData } from '../../../../components/storefront';
import { PreviewLive } from '../../../../components/preview-live';
// Prévia privada do rascunho: cada página pede o rascunho à API com a sessão de quem abre (autorização no servidor).
// Início, catálogo, categorias, páginas e produtos têm versão privada; carrinho, atendimento e pedidos aparecem como indisponíveis.
// Com ?editor=1 (dentro do editor de aparência), a página aceita o tema ainda não salvo enviado pelo editor da mesma origem.
export const metadata: Metadata = { title: 'Prévia privada', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ tenantId: string; path?: string[] }>; searchParams: Promise<{ editor?: string }> };
export default async function Preview({ params, searchParams }: Props) {
  const { tenantId, path = [] } = await params, { editor } = await searchParams, cookie = (await cookies()).toString();
  const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/tenants/${encodeURIComponent(tenantId)}/storefront/preview`, { cache: 'no-store', headers: { cookie } });
  if (!response.ok) return <div className="surface-panel auth"><header className="auth-head"><a className="wordmark" href="/">Plataforma</a></header><main className="auth-main" id="conteudo"><h1>Prévia privada</h1><p>Acesso negado ou rascunho inexistente. Entre com uma conta da equipe desta loja.</p><p><a className="btn btn-primary" href="/">Entrar no painel</a></p></main></div>;
  const data = await response.json() as Omit<StoreData, 'route'> & { categories: StoreData['categories'] };
  const ok = path.length === 0 || (path.length === 1 && ['produtos', 'carrinho', 'atendimento'].includes(path[0]!)) ||
    (path.length === 2 && ((path[0] === 'paginas' && data.theme.pages.some((p) => p.slug === path[1])) || (path[0] === 'produtos' && data.products.some((p) => p.slug === path[1])) || (path[0] === 'categorias' && data.categories.some((c) => c.slug === path[1])) || path[0] === 'pedidos'));
  if (!ok) notFound();
  const products = path[0] === 'categorias' ? data.products.filter((p) => p.category_id === data.categories.find((c) => c.slug === path[1])?.id) : data.products;
  return <PreviewLive tenantId={tenantId} path={path} live={editor === '1'} data={{ ...data, products, route: { slug: 'preview', canonical: '' } } as StoreData} />;
}
