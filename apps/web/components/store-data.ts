import { notFound } from 'next/navigation';
import type { Product,StoreData } from './storefront';
export async function loadStore(slug:string,q='',category=''):Promise<StoreData>{
  const response=await fetch(`${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/public/stores/${encodeURIComponent(slug)}?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`,{cache:'no-store'});
  if(response.status===404)notFound();if(!response.ok)throw new Error('Vitrine indisponível.');return response.json();
}
export async function loadProduct(slug:string,product:string):Promise<Product|null>{const response=await fetch(`${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/public/stores/${encodeURIComponent(slug)}/products/${encodeURIComponent(product)}`,{cache:'no-store'});if(response.status===404)return null;if(!response.ok)throw new Error('Produto indisponível.');return response.json();}
export async function loadSitemap(slug:string):Promise<Omit<StoreData,'products'> & {products:{slug:string}[]}>{const response=await fetch(`${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/public/stores/${encodeURIComponent(slug)}/sitemap`,{cache:'no-store'});if(response.status===404)notFound();if(!response.ok)throw new Error('Sitemap indisponível.');return response.json();}
export const decimal=(cents:string)=>`${BigInt(cents)/100n}.${(BigInt(cents)%100n).toString().padStart(2,'0')}`;
export async function loadStoreOptional(slug:string):Promise<StoreData|null>{const response=await fetch(`${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/public/stores/${encodeURIComponent(slug)}`,{cache:'no-store'});if(response.status===404)return null;if(!response.ok)throw new Error('Vitrine indisponível.');return response.json();}
