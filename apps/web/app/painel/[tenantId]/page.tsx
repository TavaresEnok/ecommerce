'use client';
// R02 — /painel/[tenantId]: catálogo (produtos, estoque, mídia, categorias/locais) e vitrine/frete na mesma rota.
// Parâmetros de busca (?aba=, ?produto=, ?novo=1, filtros) escolhem a visão. Vitrine e frete agora têm destinos próprios.
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { call } from '../../../components/panel/api';
import { usePanel } from '../../../components/panel/Shell';
import { type Catalogue, MediaTab, NewProduct, OrganizationTab, ProductEditor, ProductList, StockTab } from '../../../components/panel/catalog';
import { Alert, Loading, useTitle } from '../../../components/ui/kit';

function CatalogPage() {
  const p = usePanel(), params = useSearchParams(), aba = params.get('aba') || 'produtos', produto = params.get('produto'), novo = params.get('novo') === '1';
  const router = useRouter(), [catalogue, setCatalogue] = useState<Catalogue | null>(null), [error, setError] = useState('');
  // Endereços antigos (?aba=vitrine / ?aba=frete) continuam funcionando: levam aos novos destinos.
  useEffect(() => { if (aba === 'vitrine') router.replace(`/painel/${p.tenantId}/aparencia`); if (aba === 'frete') router.replace(`/painel/${p.tenantId}/configuracoes/entregas`); }, [aba]); // eslint-disable-line react-hooks/exhaustive-deps
  const titles: Record<string, string> = { produtos: 'Produtos', estoque: 'Estoque', midia: 'Imagens', organizacao: 'Categorias e locais', vitrine: 'Aparência', frete: 'Entregas' };
  useTitle(titles[aba] ?? 'Catálogo');
  const reload = useCallback(async () => {
    setCatalogue(await call<Catalogue>(`tenants/${p.tenantId}/catalogue`, { csrf: p.csrf }));
  }, [p.tenantId, p.csrf]);
  useEffect(() => { setError(''); reload().catch((e) => setError(e.message)); }, [reload]);
  if (error && !catalogue) return <Alert tone="danger" role="alert" title="Não foi possível carregar o catálogo">{error} <button className="btn btn-secondary btn-sm" onClick={() => { setError(''); void reload().catch((e) => setError(e.message)); }}>Tentar novamente</button></Alert>;
  if (aba === 'vitrine' || aba === 'frete') return <Loading label="Abrindo o novo endereço desta área…" />;
  if (!catalogue) return <Loading label="Carregando dados autorizados do catálogo…" />;
  if (produto) {
    const product = catalogue.products.find((x) => x.id === produto);
    return product ? <ProductEditor catalogue={catalogue} product={product} reload={reload} /> : <Alert tone="danger" role="alert" title="Produto não encontrado">Ele pode ter sido removido ou pertencer a outra loja. <Link href={`/painel/${p.tenantId}`}>Voltar aos produtos</Link></Alert>;
  }
  if (aba === 'estoque') return <StockTab catalogue={catalogue} reload={reload} />;
  if (aba === 'midia') return <MediaTab catalogue={catalogue} reload={reload} />;
  if (aba === 'organizacao') return <OrganizationTab catalogue={catalogue} reload={reload} />;
  if (novo) return <NewProduct catalogue={catalogue} />;
  return <ProductList catalogue={catalogue} />;
}
export default function Page() { return <Suspense fallback={<Loading />}><CatalogPage /></Suspense>; }
