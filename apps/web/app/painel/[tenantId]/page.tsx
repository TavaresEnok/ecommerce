'use client';
// R02 — /painel/[tenantId]: catálogo (produtos, estoque, mídia, categorias/locais) e vitrine/frete na mesma rota.
// Parâmetros de busca (?aba=, ?produto=, ?novo=1) só escolhem a visão; não há rota nova no servidor (DESIGN.md D-09).
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { call } from '../../../components/panel/api';
import { usePanel } from '../../../components/panel/Shell';
import { type Catalogue, MediaTab, OrganizationTab, ProductEditor, ProductList, StockTab } from '../../../components/panel/catalog';
import { ShippingTab, type StorefrontSettings, StorefrontTab } from '../../../components/panel/storefront-settings';
import { Alert, Loading, useTitle } from '../../../components/ui/kit';

function CatalogPage() {
  const p = usePanel(), params = useSearchParams(), aba = params.get('aba') || 'produtos', produto = params.get('produto'), novo = params.get('novo') === '1';
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null), [settings, setSettings] = useState<StorefrontSettings | null>(null), [error, setError] = useState('');
  const titles: Record<string, string> = { produtos: 'Produtos', estoque: 'Estoque', midia: 'Mídia', organizacao: 'Categorias e locais', vitrine: 'Fornecedor e tema', frete: 'Frete e retirada' };
  useTitle(titles[aba] ?? 'Catálogo');
  const reload = useCallback(async () => {
    const [c, s] = await Promise.all([call<Catalogue>(`tenants/${p.tenantId}/catalogue`, { csrf: p.csrf }), call<StorefrontSettings>(`tenants/${p.tenantId}/storefront`, { csrf: p.csrf })]);
    setCatalogue(c); setSettings(s);
  }, [p.tenantId, p.csrf]);
  useEffect(() => { setError(''); reload().catch((e) => setError(e.message)); }, [reload]);
  if (error && !catalogue) return <Alert tone="danger" role="alert" title="Não foi possível carregar o catálogo">{error} <button className="btn btn-secondary btn-sm" onClick={() => { setError(''); void reload().catch((e) => setError(e.message)); }}>Tentar novamente</button></Alert>;
  if (!catalogue || !settings) return <Loading label="Carregando dados autorizados do catálogo…" />;
  if (produto) {
    const product = catalogue.products.find((x) => x.id === produto);
    return product ? <ProductEditor catalogue={catalogue} product={product} reload={reload} /> : <Alert tone="danger" role="alert" title="Produto não encontrado">Ele pode ter sido removido ou pertencer a outra loja. <Link href={`/painel/${p.tenantId}`}>Voltar aos produtos</Link></Alert>;
  }
  if (aba === 'estoque') return <StockTab catalogue={catalogue} reload={reload} />;
  if (aba === 'midia') return <MediaTab catalogue={catalogue} reload={reload} />;
  if (aba === 'organizacao') return <OrganizationTab catalogue={catalogue} reload={reload} />;
  if (aba === 'vitrine') return <StorefrontTab settings={settings} catalogue={catalogue} reload={reload} />;
  if (aba === 'frete') return <ShippingTab settings={settings} reload={reload} />;
  return <ProductList catalogue={catalogue} onCreate={novo} />;
}
export default function Page() { return <Suspense fallback={<Loading />}><CatalogPage /></Suspense>; }
