import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { seed, client } from '../scripts/seed.mjs';
// Revisão 0179f4 — R2/R3/R4 through the real path edge (Caddy, sites.caddy shared with production) → web → API.
// Two clients with distinct source addresses: CLIENT=A runs on the host through the published edge port, CLIENT=B in a
// container on the Docker network (two short-lived containers may reuse the same IP, which would make them one client).
assert.equal(process.env.APP_ENV,'staging');
const role=process.env.CLIENT,artifacts=process.env.ARTIFACTS||'/app/artifacts',ca=readFileSync(process.env.CA_FILE||'/staging/caddy-root.crt'),out=`${artifacts}/edge-${role?.toLowerCase()}.json`,report={role,passed:false,steps:[]};
const step=(name,detail={})=>{report.steps.push({name,detail});console.log('✔',name);};
// Connects to the edge container and presents `host` as SNI/Host, exactly like a browser resolving that name to the edge.
function edge(host,path,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const r=https.request({host:process.env.EDGE_HOST||'caddy',port:Number(process.env.EDGE_PORT||443),servername:host,path,method,ca,headers:{host,...headers,...(body?{'content-length':Buffer.byteLength(body)}:{})},timeout:30000},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8')}));});r.on('error',reject);r.on('timeout',()=>r.destroy(new Error('timeout')));if(body)r.write(body);r.end();});}
function direct(host,path){return new Promise((resolve,reject)=>{const r=http.request({host:'web',port:3000,path,headers:{host}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve({status:res.statusCode,body:b}));});r.on('error',reject);r.end();});}
// Valid PNG with incompressible pixels (~49 KB), above the 16 KB general limit.
function png(width=128,height=128){const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const raw=Buffer.concat(Array.from({length:height},()=>Buffer.concat([Buffer.from([0]),randomBytes(width*3)])));
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
test(`Borda → web → API (cliente ${role})`,async()=>{
 try{
  if(role==='A'){
   // R2: this client exceeds the general limit (120/min); forged identity headers must not reset it.
   let first429=null;for(let i=1;i<=130;i++){const r=await edge('lojas.demo.test','/api/health/live');if(r.status===429){first429=i;break;}assert.equal(r.status,200);}
   assert.ok(first429&&first429>100,`429 esperado após o limite; obtido na requisição ${first429}`);
   for(const headers of [{'x-forwarded-for':'203.0.113.10'},{'x-client-ip':'203.0.113.11','x-edge-auth':'forjado'},{'x-client-ip':'203.0.113.12','x-edge-auth':'0'.repeat(64),'x-forwarded-for':'203.0.113.12'}])
    assert.equal((await edge('lojas.demo.test','/api/health/live',{headers})).status,429,JSON.stringify(headers));
   step('R2: cliente A limitado; cabeçalhos forjados (X-Forwarded-For, X-Client-IP, X-Edge-Auth) não contornam',{first429});
   report.limitedAt=new Date().toISOString();
  }else if(role==='B'){
   const limitedAt=Date.parse(JSON.parse(readFileSync(`${artifacts}/edge-a.json`,'utf8')).limitedAt);assert.ok(Date.now()-limitedAt<50000,'B precisa rodar dentro da janela de 1 minuto de A');
   // R2: a different client, same edge/web/API, is not affected — including server-rendered pages (SSR forwards the identity).
   assert.equal((await edge('lojas.demo.test','/api/health/live')).status,200);
   const portal=await edge('lojas.demo.test','/');assert.equal(portal.status,200);step('R2: cliente B não é afetado pelo limite de A',{});
   const api=client('https://lojas.demo.test','https://localhost:8443');
   const [a]=await seed(api,`edge${randomBytes(3).toString('hex')}`);
   const page=await edge('lojas.demo.test',`/lojas/${a.slug}`);assert.equal(page.status,200);assert.match(page.body,new RegExp(`data-store="${a.slug}"`));
   // R3: platform host serves the portal (above); managed subdomain resolves to the right store; unknown host refused.
   // Managed subdomains exist only as <slug>.localhost (publication outside development/test is blocked until D03), and the
   // edge never issues certificates for reserved names; the web routing is exercised directly with its effective PLATFORM_HOST.
   const managed=await direct(`${a.slug}.localhost`,'/');assert.equal(managed.status,200);
   await assert.rejects(edge(`${a.slug}.localhost`,'/'));assert.match(managed.body,new RegExp(`data-store="${a.slug}"`));
   assert.equal((await direct('desconhecido.demo.test','/')).status,404);
   await assert.rejects(edge('desconhecido.demo.test','/'));
   step('R3: domínio principal → portal; subdomínio gerenciado → loja certa; hostname desconhecido recusado (web 404, sem certificado)',{store:a.slug});
   // R4: media route accepts a valid PNG above 16 KB; above the maximum is refused at the edge; other routes keep 16 KB.
   const image=png();assert.ok(image.length>16384);
   const auth={cookie:a.actor.cookie,'x-csrf-token':a.actor.csrf,origin:'https://localhost:8443'};
   const up=await edge('lojas.demo.test',`/api/tenants/${a.id}/catalogue/media`,{method:'POST',headers:{...auth,'content-type':'application/octet-stream'},body:image});assert.equal(up.status,201,up.body);
   const huge=Buffer.alloc(10*1024*1024+1024,1);const big=await edge('lojas.demo.test',`/api/tenants/${a.id}/catalogue/media`,{method:'POST',headers:{...auth,'content-type':'application/octet-stream'},body:huge});assert.equal(big.status,413);
   const json=JSON.stringify({displayName:'x'.repeat(20000),timezone:'UTC'});const j=await edge('lojas.demo.test',`/api/tenants/${a.id}/settings`,{method:'PATCH',headers:{...auth,'content-type':'application/json'},body:json});assert.equal(j.status,413);
   const small=await edge('lojas.demo.test',`/api/tenants/${a.id}/settings`,{method:'PATCH',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({displayName:'Loja da borda',timezone:'UTC'})});assert.equal(small.status,200,small.body);
   const otherBig=await edge('lojas.demo.test',`/api/tenants/${a.id}/catalogue/media/maintenance`,{method:'POST',headers:{...auth,'content-type':'application/octet-stream'},body:image});assert.equal(otherBig.status,413);
   step('R4: PNG válido acima de 16 KB aceito (201); acima de 10 MiB recusado (413); JSON de 20 KB e corpo grande fora da rota de mídia recusados (413)',{png:image.length});
  }else throw new Error('CLIENT=A|B');
  report.passed=true;
 }finally{report.completedAt=new Date().toISOString();writeFileSync(out,JSON.stringify(report,null,2));}
});
