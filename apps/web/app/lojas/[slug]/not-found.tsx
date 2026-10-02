'use client';
// 404 da vitrine: neutro (sem dados do tema, que não estão disponíveis aqui) e sem marca da Plataforma.
import { usePathname } from 'next/navigation';
export default function StoreNotFound() {
  const path = usePathname() || '/', match = /^\/lojas\/[^/]+/.exec(path), base = match ? match[0] : '/';
  return <div className="surface-store"><main id="conteudo" className="store-wrap reading">
    <p className="caption">Erro 404</p><h1>Página não encontrada</h1>
    <p>O endereço pode ter mudado, o produto pode ter saído do catálogo ou a loja pode não estar publicada.</p>
    <p><a className="btn btn-primary" href={base}>Voltar ao início da loja</a></p>
  </main></div>;
}
