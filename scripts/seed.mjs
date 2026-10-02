import { randomBytes } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function client(base,origin=base) {
  return async(path,{method='GET',body,actor,cookie,raw,headers={}}={})=>{
    const response=await fetch(`${base}/api/${path}`,{method,headers:{origin,...(actor?{cookie:actor.cookie,'x-csrf-token':actor.csrf}:cookie?{cookie}:{}),...(raw?{'content-type':'application/octet-stream'}:body?{'content-type':'application/json'}:{}),...headers},body:raw|| (body?JSON.stringify(body):undefined)});
    const result=await response.json();return {status:response.status,body:result,headers:response.headers};
  };
}
export async function seed(api,suffix=randomBytes(5).toString('hex')) {
  const stores=[];
  const expect=(r,status=201)=>{if(r.status!==status)throw new Error(`Seed recusado (${r.status}): ${JSON.stringify(r.body)}`);return r.body;};
  for(const label of ['aurora','brisa']) {
    const email=`demo-${label}-${suffix}@example.test`,password=randomBytes(24).toString('base64url');
    const registered=expect(await api('auth/register',{method:'POST',body:{email,password}}));
    expect(await api('auth/verify-email',{method:'POST',body:{token:registered.localToken}}));
    const login=await api('auth/login',{method:'POST',body:{email,password}});expect(login);
    const actor={id:login.body.user.id,csrf:login.body.csrf,cookie:login.headers.get('set-cookie').split(';')[0]};
    const store=expect(await api('tenants',{method:'POST',actor,body:{name:`${label.toUpperCase()} TESTE`,slug:`${label}-${suffix}`}}));
    const prefix=`tenants/${store.id}`;
    const category=expect(await api(`${prefix}/catalogue/categories`,{method:'POST',actor,body:{name:'Coleção de demonstração',slug:'colecao'}}));
    const location=expect(await api(`${prefix}/catalogue/locations`,{method:'POST',actor,body:{name:'Depósito TESTE'}}));
    const simple=expect(await api(`${prefix}/catalogue/products`,{method:'POST',actor,body:{name:`Caneca café ${label}`,slug:'caneca-cafe',description:'Caneca sintética para demonstração. Frágil; não é uma oferta comercial.',sku:`${label}-CAFE-001`,price_cents:'2990',category_id:category.id}}));
    const variable=expect(await api(`${prefix}/catalogue/products`,{method:'POST',actor,body:{name:`Camiseta ${label}`,slug:'camiseta',description:'Algodão, produto de TESTE.',sku:`${label}-DEFAULT`,price_cents:'4500',category_id:category.id}}));
    const variants=[];
    for(const cor of ['Azul','Verde'])variants.push(expect(await api(`${prefix}/catalogue/products/${variable.id}/variants`,{method:'POST',actor,body:{sku:`${label}-${cor}`,price_cents:cor==='Azul'?'4900':'5100',attributes:{cor,tamanho:'M'},weight_g:200,width_mm:200,height_mm:20,length_mm:250}})));
    for(const v of [simple.variant_id,...variants.map(v=>v.id)])expect(await api(`${prefix}/catalogue/adjustments`,{method:'POST',actor,body:{variant_id:v,location_id:location.id,delta:10,reason:'Saldo inicial sintético TESTE'}}));
    for(const p of [simple,variable])expect(await api(`${prefix}/catalogue/products/${p.id}`,{method:'PATCH',actor,body:{status:'ACTIVE'}}),200);
    expect(await api(`${prefix}/storefront/profile`,{method:'POST',actor,body:{synthetic:true,name:`Fornecedor ${label.toUpperCase()} TESTE`,document:'',address:'Endereço fictício de demonstração — TESTE, sem atendimento presencial',email:`contato-${label}@example.test`,phone:'Contato fictício TESTE',policies:'Políticas sintéticas v1: não há vendas. Fluxos de compra e arrependimento ainda não habilitados; dados reais serão validados antes do piloto.',delivery:'Retirada e tabela de CEP apenas para teste. Sem transporte real.',risks:'Veja cuidados e características na descrição.'}}));
    const draft=expect(await api(`${prefix}/storefront/draft`,{method:'POST',actor,body:{schema_version:1,title:`${label.toUpperCase()} TESTE`,description:`Vitrine independente ${label} de demonstração`,hero:'Pequenos favoritos, grandes descobertas',color:label==='aurora'?'#245742':'#314a8f',font:'system',pages:[{slug:'sobre',title:'Sobre a loja TESTE',body:`Loja ${label} sintética, sem vendas reais.`}],menu:[{label:'Catálogo',path:'/'},{label:'Sobre',path:'/paginas/sobre'}],assets:[]}}));
    const published=expect(await api(`${prefix}/storefront/publish`,{method:'POST',actor,body:{revision_id:draft.id}}));
    const pickup=expect(await api(`${prefix}/storefront/shipping`,{method:'POST',actor,body:{name:'Retirada TESTE',kind:'PICKUP',price_cents:'0',days:0,priority:0}}));
    const shipping=expect(await api(`${prefix}/storefront/shipping`,{method:'POST',actor,body:{name:'Entrega SP TESTE',kind:'TABLE',cep_start:'01000000',cep_end:'09999999',price_cents:'1500',days:3,priority:10}}));
    stores.push({...store,actor,email,password,simple,variable,variants,location,category,draft,published,pickup,shipping});
  }
  return stores;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
  if(process.argv.slice(2).join(' ')!=='--local'){console.error('Uso: node scripts/seed.mjs --local. Apenas localhost:3000; dados sintéticos.');process.exit(2);}
  const base='http://localhost:3000';
  const stores=await seed(client(base));mkdirSync('.local',{recursive:true});
  writeFileSync('.local/demo.json',JSON.stringify(stores.map(s=>({email:s.email,password:s.password,tenantId:s.id,url:`${base}/lojas/${s.slug}`,canonical:s.published.canonical})),null,2),{mode:0o600});
  console.log('Duas lojas TESTE criadas sem apagar dados existentes. Acessos aleatórios em .local/demo.json (não versionar/compartilhar).');
  for(const s of stores)console.log(`${base}/lojas/${s.slug}`);
}
