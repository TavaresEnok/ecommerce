'use client';
import { useEffect, useState } from 'react';
async function call(path:string,csrf:string,method='GET',body?:unknown){const r=await fetch(`/api/${path}`,{method,cache:'no-store',headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf},body:method==='POST'?JSON.stringify(body||{}):undefined});const d=await r.json();if(!r.ok)throw new Error(typeof d.error==='string'?d.error:d.error?.message||'Não foi possível concluir.');return d;}
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const usd=(micros:string)=>`US$ ${(Number(micros)/1e6).toFixed(4)}`;
type Settings={platform_enabled:boolean;enabled:boolean;model:string;tenant_monthly_limit_micros:string;usage:{reserved_micros:string;spent_micros:string}};
type Generation={id:string;status:string;draft:string|null;error_code:string|null;cost_micros:string|null;reserved_micros:string;model:string};
// Rascunho de descrição com IA: nunca publica nem sobrescreve edição mais recente; o lojista revisa e decide salvar.
export function AiDraftSection({tenantId,csrf,owner}:{tenantId:string;csrf:string;owner:boolean}){
 const [settings,setSettings]=useState<Settings|null>(null),[products,setProducts]=useState<{id:string;name:string;description:string}[]>([]),[product,setProduct]=useState(''),[gen,setGen]=useState<Generation|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setSettings(await call(`tenants/${tenantId}/ai/settings`,csrf));const c=await call(`tenants/${tenantId}/catalogue`,csrf);setProducts(c.products);setProduct(p=>p||c.products[0]?.id||'');}
 async function act(action:()=>Promise<unknown>,done:string){setBusy(true);setError('');setNotice('');try{await action();await load();setNotice(done);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{if(csrf)void load().catch(e=>setError(e.message));},[csrf,tenantId]);
 const current=products.find(p=>p.id===product);
 if(!settings)return null;
 return <section aria-label="Descrição com IA"><h2>Descrição com IA</h2>
  {!settings.platform_enabled?<p>Recurso desligado pela plataforma. O cadastro manual de descrições continua disponível.</p>:<>
   <p>Modelo {settings.model}. Gasto no mês: {usd(settings.usage.spent_micros)} (reservado {usd(settings.usage.reserved_micros)}) de {usd(settings.tenant_monthly_limit_micros)}. Somente nome, categoria, atributos e descrição atual são enviados.</p>
   {owner&&<button disabled={busy} onClick={()=>void act(()=>call(`tenants/${tenantId}/ai/settings`,csrf,'POST',{enabled:!settings.enabled}),settings.enabled?'IA desligada nesta loja.':'IA ligada nesta loja.')}>{settings.enabled?'Desligar nesta loja':'Ligar nesta loja'}</button>}
   {settings.enabled&&<><label>Produto<select value={product} onChange={e=>{setProduct(e.target.value);setGen(null);}}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <button disabled={busy||!product} onClick={()=>void act(async()=>{const g=await call(`tenants/${tenantId}/catalogue/products/${product}/ai-description`,csrf,'POST',{key:uid()});setGen(g);setText(g.draft??'');},'Rascunho gerado; revise antes de salvar.')}>{busy?'Gerando…':'Gerar rascunho'}</button>
    {gen&&<div><p>Situação: {gen.status}{gen.error_code?` (${gen.error_code})`:''}{gen.cost_micros?` · custo ${usd(gen.cost_micros)}`:` · reserva ${usd(gen.reserved_micros)}`}</p>
     {gen.status==='UNKNOWN'&&<p className="local">Resultado incerto: a reserva fica retida até a verificação. Nada foi alterado no produto.</p>}
     {gen.status==='SUCCEEDED'&&<div className="grid"><div><h3>Descrição atual</h3><p className="prose">{current?.description||'(vazia)'}</p></div><div><h3>Rascunho (editável)</h3><label>Texto<textarea value={text} onChange={e=>setText(e.target.value)} maxLength={8000}/></label></div></div>}
     {gen.status==='SUCCEEDED'&&<div className="row"><button disabled={busy} onClick={()=>void act(async()=>{await call(`tenants/${tenantId}/catalogue/ai-generations/${gen.id}/save`,csrf,'POST',{text});setGen({...gen,status:'SAVED'});},'Descrição salva no produto (não publica nada).')}>Salvar no produto</button><button disabled={busy} onClick={()=>void act(async()=>{await call(`tenants/${tenantId}/catalogue/ai-generations/${gen.id}/discard`,csrf,'POST');setGen({...gen,status:'DISCARDED'});},'Rascunho descartado.')}>Descartar</button></div>}</div>}</>}</>}
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}</section>;
}
