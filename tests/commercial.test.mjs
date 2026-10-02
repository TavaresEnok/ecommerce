import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createDatabase, rows, sql, withTenant } from '@ecommerce/database';
import { billingCycle, billingSignature, executeRefund, httpsProbe, processAttempt, processInbox, resumeRefunds, SimulatedBillingProvider, verifyDomain } from '@ecommerce/purchase';
import { processMedia, reconcileMedia } from '@ecommerce/media';
import { seed,client } from '../scripts/seed.mjs';
import { setPlatformAdmin } from '../scripts/platform-admin.mjs';
// Fase 6 with real PostgreSQL; billing, payment, carrier and DNS providers are SIMULATED (no third party).
assert.equal(process.env.APP_ENV,'test');const base=process.env.BASE_URL;
const api=client(base),report={passed:false,simulation:true,externalHomologation:false,criteria:['MFA','Administração da plataforma','T18','T28','T29','T31','T37 (domínio próprio)','T38','Cotas'],tests:[]};
const address={cep:'01001000',street:'Rua TESTE',number:'1',city:'São Paulo TESTE',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret,step){let bits='';for(const c of secret)bits+=B32.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',key).update(counter).digest(),o=h[h.length-1]&0xf;return ((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function login(email,password){const r=await api('auth/login',{method:'POST',body:{email,password}});expect(r);return {id:r.body.user.id,csrf:r.body.csrf,cookie:r.headers.get('set-cookie').split(';')[0],mfaRequired:r.body.mfaRequired,email,password};}
async function user(label){const email=`${label}-${randomBytes(4).toString('hex')}@example.test`,password=randomBytes(18).toString('base64url'),reg=expect(await api('auth/register',{method:'POST',body:{email,password}}));expect(await api('auth/verify-email',{method:'POST',body:{token:reg.localToken}}));return login(email,password);}
// Each actor tracks the last TOTP step used, because the server rejects replays of the same step.
async function enableMfa(actor){const s=expect(await api('auth/mfa/setup',{method:'POST',actor}));actor.secret=s.secret;actor.step=Math.floor(Date.now()/30000);const r=expect(await api('auth/mfa/enable',{method:'POST',actor,body:{code:totp(s.secret,actor.step)}}));actor.recovery=r.recovery_codes;return actor;}
async function verifyMfa(actor){actor.step=Math.max(actor.step+1,Math.floor(Date.now()/30000)-1);if(actor.step>Math.floor(Date.now()/30000)+1)await new Promise(r=>setTimeout(r,30000));expect(await api('auth/mfa/verify',{method:'POST',actor,body:{code:totp(actor.secret,actor.step)}}));return actor;}
test('Fase 6: comercialização preparada sem terceiros',async t=>{
 const db=createDatabase(process.env.DATABASE_URL,3);let failures=0;const check=async(name,fn)=>{let ok=false;await t.test(name,async()=>{await fn();ok=true;});if(!ok)failures++;report.tests.push({name,result:ok?'passed':'failed'});};
 const tx=(tenant,fn)=>withTenant(db,tenant,null,fn);let a,b,admin,pro,pro2;
 async function cartQuote(s,kind,variant=s.variants[0].id,extra={}){const r=await api(`public/stores/${s.slug}/cart/items`,{method:'POST',body:{variant_id:variant,quantity:1}});expect(r);const cookie=r.headers.get('set-cookie').split(';')[0];const q=await api(`public/stores/${s.slug}/cart/quotes`,{method:'POST',cookie,body:{kind,address,...extra}});return {cookie,q};}
 const checkout=(s,c)=>api(`public/stores/${s.slug}/cart/checkout`,{method:'POST',cookie:c.cookie,body:{key:randomUUID(),quote_id:c.q.body.id,address,buyer:{name:'Comprador TESTE',email:'c@example.test'},method:'PIX',total_cents:c.q.body.total_cents}});
 async function paidOrder(s){const c=await cartQuote(s,'TABLE');const o=expect(await checkout(s,c));await processAttempt(db,s.id,o.attempts[0].id);expect(await api(`tenants/${s.id}/purchase/attempts/${o.attempts[0].id}/simulate`,{method:'POST',actor:s.actor,body:{status:'APPROVED'}}));await processInbox(db,s.id);return o;}
 try{
  [a,b]=await seed(api,`p6${randomBytes(4).toString('hex')}`);for(const s of [a,b])expect(await api(`tenants/${s.id}/purchase/accounts/simulated`,{method:'POST',actor:s.actor}));
  await check('MFA (TOTP): ativação, códigos de recuperação, nova sessão exige verificação, replay recusado',async()=>{
   await enableMfa(a.actor);assert.equal(a.actor.recovery.length,10);assert.equal(expect(await api('auth/session',{actor:a.actor}),200).mfa.verified,true);
   const again=await login(a.email,a.password);assert.equal(again.mfaRequired,true);assert.equal(expect(await api('auth/session',{actor:again}),200).mfa.verified,false);
   expect(await api(`tenants/${a.id}/domains`,{method:'POST',actor:again,body:{hostname:'x.example.test'}}),403);
   expect(await api('auth/mfa/verify',{method:'POST',actor:again,body:{code:totp(a.actor.secret,a.actor.step)}}),401);
   expect(await api('auth/mfa/verify',{method:'POST',actor:again,body:{code:a.actor.recovery[0]}}));expect(await api('auth/mfa/verify',{method:'POST',actor:again,body:{code:a.actor.recovery[0]}}),401);
   assert.equal(expect(await api('auth/session',{actor:again}),200).mfa.verified,true);
   const raw=(await db.pool.query('select 1')).rowCount;assert.equal(raw,1);await enableMfa(b.actor);
  });
  await check('Administração da plataforma: papel concedido só pelo operador, MFA obrigatório, motivo e auditoria',async()=>{
   admin=await user('admin');expect(await api('platform/tenants',{actor:admin}),403);
   await setPlatformAdmin(process.env.MIGRATION_DATABASE_URL,'grant',admin.email,'Ensaio Fase 6');expect(await api('platform/tenants',{actor:admin}),403);
   await enableMfa(admin);const list=expect(await api('platform/tenants',{actor:admin}),200);assert.ok(list.some(t=>t.tenant_id===a.id&&t.subscription.plan==='PILOT v1'));
   expect(await api('platform/tenants',{actor:a.actor}),403);expect(await api(`platform/tenants/${b.id}`,{actor:admin}),400);
   const view=expect(await api(`platform/tenants/${b.id}?reason=${encodeURIComponent('Suporte ao chamado TESTE')}`,{actor:admin}),200);assert.equal(view.billing.plan.code,'PILOT');
   expect(await api(`platform/tenants/${b.id}/suspend`,{method:'POST',actor:admin,body:{reason:'Ensaio de suspensão administrativa'}}));
   const c=await api(`public/stores/${b.slug}/cart/items`,{method:'POST',body:{variant_id:b.simple.variant_id,quantity:1}});assert.notEqual(c.status,201);
   expect(await api(`platform/tenants/${b.id}/reactivate`,{method:'POST',actor:admin,body:{reason:'Fim do ensaio'}}));
   const audit=expect(await api('platform/audit',{actor:admin}),200);assert.deepEqual(audit.slice(0,3).map(x=>x.action),['TENANT_REACTIVATED','TENANT_SUSPENDED','TENANT_VIEWED']);
   await assert.rejects(db.pool.query("insert into access.platform_admins(user_id,granted_by) values($1,'x')",[a.actor.id]));
  });
  await check('Planos versionados: pago só ativa com preço; PILOT não se aposenta; versão é imutável',async()=>{
   const ent={active_products:3,active_variants:10,media_bytes:30*1024*1024,members:2,media_mode:'STRICT'};
   const draft=expect(await api('platform/plans',{method:'POST',actor:admin,body:{code:'PROFISSIONAL',name:'Profissional',billing_interval:'MONTH',price_cents:null,entitlements:ent,reason:'Preço ainda não aprovado'}}));
   expect(await api(`platform/plans/${draft.id}/activate`,{method:'POST',actor:admin,body:{reason:'Tentativa sem preço'}}),409);
   pro=expect(await api('platform/plans',{method:'POST',actor:admin,body:{code:'PROFISSIONAL',name:'Profissional',billing_interval:'MONTH',price_cents:'4990',entitlements:ent,reason:'Valor de ENSAIO, não é preço aprovado'}}));assert.equal(pro.version,draft.version+1);
   expect(await api(`platform/plans/${pro.id}/activate`,{method:'POST',actor:admin,body:{reason:'Ensaio T29'}}));
   pro2=expect(await api('platform/plans',{method:'POST',actor:admin,body:{code:'PROFISSIONAL',name:'Profissional ampliado',billing_interval:'MONTH',price_cents:'6990',entitlements:{...ent,active_products:5},reason:'Ensaio troca de plano'}}));expect(await api(`platform/plans/${pro2.id}/activate`,{method:'POST',actor:admin,body:{reason:'Ensaio'}}));
   const plans=expect(await api('platform/plans',{actor:admin}),200);expect(await api(`platform/plans/${plans.find(p=>p.code==='PILOT').id}/retire`,{method:'POST',actor:admin,body:{reason:'Não pode'}}),409);
   await assert.rejects(db.db.transaction(t=>t.execute(sql`update platform.plan_versions set price_cents=1 where id=${pro.id}`)),e=>(e.cause?.code||e.code)==='42501');
  });
  let firstInvoice;
  await check('T29: contratação, cobrança simulada, webhook assinado/deduplicado, renovação sem fatura duplicada',async()=>{
   expect(await api(`tenants/${a.id}/billing/plan`,{method:'POST',actor:a.actor,body:{plan_version_id:pro.id}}));
   let v=expect(await api(`tenants/${a.id}/billing`,{actor:a.actor}),200);assert.equal(v.plan.code,'PROFISSIONAL');assert.equal(v.invoices.length,1);assert.equal(v.invoices[0].amount_cents,'4990');firstInvoice=v.invoices[0];
   const provider=new SimulatedBillingProvider(db);await billingCycle(db,a.id,provider);
   await tx(a.id,t=>t.execute(sql`update shop.simulated_saas_charges set status='PAID' where invoice_id=${firstInvoice.id}`));
   const event={tenant_id:a.id,event_id:'evt-1',invoice_id:firstInvoice.id},sig=billingSignature(a.id,'evt-1',firstInvoice.id);
   expect(await api('billing/simulated/webhook',{method:'POST',headers:{'x-billing-signature':'0'.repeat(64)},body:event}),401);
   assert.equal(expect(await api('billing/simulated/webhook',{method:'POST',headers:{'x-billing-signature':sig},body:event})).duplicate,false);assert.equal(expect(await api('billing/simulated/webhook',{method:'POST',headers:{'x-billing-signature':sig},body:event})).duplicate,true);
   await billingCycle(db,a.id,provider);v=expect(await api(`tenants/${a.id}/billing`,{actor:a.actor}),200);assert.equal(v.invoices[0].status,'PAID');assert.equal(v.subscription.status,'ACTIVE');
   const next=new Date(new Date(v.subscription.current_period_end).getTime()+1000);await billingCycle(db,a.id,null,next);await billingCycle(db,a.id,null,next);
   v=expect(await api(`tenants/${a.id}/billing`,{actor:a.actor}),200);assert.equal(v.invoices.length,2);
   await assert.rejects(tx(a.id,t=>t.execute(sql`update shop.saas_invoices set amount_cents=1`)),e=>(e.cause?.code||e.code)==='42501');
  });
  await check('T29: falha de cobrança → PAST_DUE com 7 dias de tolerância → SUSPENDED bloqueia só vendas novas; pagamento reabre',async()=>{
   const provider=new SimulatedBillingProvider(db);const v=expect(await api(`tenants/${a.id}/billing`,{actor:a.actor}),200),open=v.invoices.find(i=>i.status==='OPEN');
   await billingCycle(db,a.id,provider,new Date(new Date(open.due_at).getTime()+1000));await tx(a.id,t=>t.execute(sql`update shop.simulated_saas_charges set status='FAILED' where invoice_id=${open.id}`));
   let s=await billingCycle(db,a.id,provider,new Date(new Date(open.due_at).getTime()+86400000));assert.equal(s.status,'PAST_DUE');
   const order=await paidOrder(a);
   s=await billingCycle(db,a.id,provider,new Date(new Date(open.due_at).getTime()+8*86400000));assert.equal(s.status,'SUSPENDED');
   const blocked=await checkout(a,await cartQuote(a,'TABLE'));assert.equal(blocked.status,409);assert.match(blocked.body.error,/suspensas/);
   expect(await api(`tenants/${a.id}/operations/orders/${order.id}/process`,{method:'POST',actor:a.actor,body:{}}));
   expect(await api(`tenants/${a.id}/operations/exports`,{method:'POST',actor:a.actor,body:{kind:'STORE'}}));
   await tx(a.id,t=>t.execute(sql`update shop.simulated_saas_charges set status='PAID' where invoice_id=${open.id}`));s=await billingCycle(db,a.id,provider,new Date(new Date(open.due_at).getTime()+8*86400000));assert.equal(s.status,'ACTIVE');
   expect(await checkout(a,await cartQuote(a,'TABLE')));
  });
  await check('T29: troca de plano no próximo ciclo, cancelamento ao fim do período; sem MFA/funcionário recusados',async()=>{
   const plain=await login(a.email,a.password);expect(await api(`tenants/${a.id}/billing/plan`,{method:'POST',actor:plain,body:{plan_version_id:pro2.id}}),403);
   expect(await api(`tenants/${a.id}/billing/plan`,{method:'POST',actor:a.actor,body:{plan_version_id:pro2.id}}));let v=expect(await api(`tenants/${a.id}/billing`,{actor:a.actor}),200);assert.equal(v.plan.id,pro.id);assert.equal(v.pending_plan.id,pro2.id);
   const end=new Date(new Date(v.subscription.current_period_end).getTime()+1000);await billingCycle(db,a.id,null,end);v=expect(await api(`tenants/${a.id}/billing`,{actor:a.actor}),200);assert.equal(v.plan.id,pro2.id);assert.equal(v.invoices[0].amount_cents,'6990');assert.equal(v.invoices[1].amount_cents,'4990');
   await tx(a.id,t=>t.execute(sql`update shop.saas_invoices set status='PAID',paid_at=now() where status='OPEN'`));
   expect(await api(`tenants/${a.id}/billing/cancel`,{method:'POST',actor:a.actor}));await billingCycle(db,a.id,null,new Date(new Date(v.subscription.current_period_end).getTime()+1000));
   v=expect(await api(`tenants/${a.id}/billing`,{actor:a.actor}),200);assert.equal(v.subscription.status,'CANCELLED');assert.equal(v.invoices.filter(i=>i.status==='OPEN').length,0);
   assert.equal((await checkout(a,await cartQuote(a,'TABLE'))).status,409);
   expect(await api(`tenants/${a.id}/billing/plan`,{method:'POST',actor:a.actor,body:{plan_version_id:pro.id}}));await tx(a.id,t=>t.execute(sql`update shop.saas_invoices set status='PAID',paid_at=now() where status='OPEN'`));
   assert.equal(expect(await api(`tenants/${a.id}/billing`,{actor:a.actor}),200).subscription.status,'ACTIVE');
  });
  await check('Cotas do plano: produtos/variações/equipe no servidor, concorrência na última vaga, downgrade preserva dados',async()=>{
   const mk=async n=>expect(await api(`tenants/${a.id}/catalogue/products`,{method:'POST',actor:a.actor,body:{name:`Cota ${n}`,slug:`cota-${n}`,sku:`COTA-${n}-${randomBytes(2).toString('hex')}`,price_cents:'1000'}}));
   const [p1,p2]=[await mk(1),await mk(2)];const results=await Promise.all([p1,p2].map(p=>api(`tenants/${a.id}/catalogue/products/${p.id}`,{method:'PATCH',actor:a.actor,body:{status:'ACTIVE'}})));
   assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.match(results.find(r=>r.status===409).body.error,/Limite do plano/);
   expect(await api(`tenants/${a.id}/invitations`,{method:'POST',actor:a.actor,body:{email:'func1@example.test'}}));expect(await api(`tenants/${a.id}/invitations`,{method:'POST',actor:a.actor,body:{email:'func2@example.test'}}),409);
   const active=(await tx(a.id,t=>rows(t,sql`select count(*)::int as n from shop.products where status='ACTIVE'`)))[0].n;assert.equal(active,3);
  });
  await check('T38: cota rigorosa de mídia com reserva atômica, concorrência, expiração e conciliação dos contadores',async()=>{
   const image=await sharp({create:{width:64,height:64,channels:3,background:'#336699'}}).png().toBuffer(),quota=30*1024*1024,reserve=image.length+8*1024*1024;
   await tx(a.id,t=>t.execute(sql`insert into shop.media_usage(id,tenant_id,stored_bytes,reserved_bytes) values(${randomUUID()},${a.id},${quota-reserve-100},0) on conflict(tenant_id) do update set stored_bytes=excluded.stored_bytes,reserved_bytes=0`));
   const results=await Promise.all([0,1,2].map(()=>api(`tenants/${a.id}/catalogue/media`,{method:'POST',actor:a.actor,raw:image})));
   assert.equal(results.filter(r=>r.status===201).length,1,JSON.stringify(results.map(r=>[r.status,r.body.error])));assert.ok(results.filter(r=>r.status===409).every(r=>/esgotada|andamento|ocupado/.test(JSON.stringify(r.body))),JSON.stringify(results.map(r=>r.body)));
   let [u]=await tx(a.id,t=>rows(t,sql`select stored_bytes::text,reserved_bytes::text from shop.media_usage`));assert.equal(Number(u.reserved_bytes),8*1024*1024);assert.ok(Number(u.stored_bytes)+Number(u.reserved_bytes)<=quota);
   const asset=results.find(r=>r.status===201).body.id;await processMedia(db,a.id,asset);
   [u]=await tx(a.id,t=>rows(t,sql`select reserved_bytes::text from shop.media_usage`));assert.equal(u.reserved_bytes,'0');
   const [r1]=await tx(a.id,t=>rows(t,sql`select status from shop.media_reservations where asset_id=${asset}`));assert.equal(r1.status,'COMMITTED');
   const again=expect(await api(`tenants/${a.id}/catalogue/media`,{method:'POST',actor:a.actor,raw:image}),409);void again;
   await reconcileMedia(db,a.id);[u]=await tx(a.id,t=>rows(t,sql`select stored_bytes::text,reserved_bytes::text from shop.media_usage`));assert.ok(Number(u.stored_bytes)<200000);
   const second=expect(await api(`tenants/${a.id}/catalogue/media`,{method:'POST',actor:a.actor,raw:image}));await tx(a.id,t=>t.execute(sql`update shop.media_reservations set expires_at=now()-interval '1 minute' where asset_id=${second.id}`));
   await tx(a.id,t=>t.execute(sql`update shop.media_assets set status='FAILED' where id=${second.id}`));await reconcileMedia(db,a.id);
   const [rel]=await tx(a.id,t=>rows(t,sql`select status from shop.media_reservations where asset_id=${second.id}`));assert.equal(rel.status,'RELEASED');[u]=await tx(a.id,t=>rows(t,sql`select reserved_bytes::text from shop.media_usage`));assert.equal(u.reserved_bytes,'0');
   const [pilot]=await tx(b.id,t=>rows(t,sql`select p.entitlements->>'media_mode' as mode from shop.subscriptions s join platform.plan_versions p on p.id=s.plan_version_id`));assert.equal(pilot.mode,'TOLERANCE');
  });
  await check('T18: devolução pela plataforma — MFA, idempotência, saldo serializado, recusa, resposta perdida e retomada sem duplicar',async()=>{
   const o=await paidOrder(b),view=expect(await api(`tenants/${b.id}/purchase/orders/${o.id}`,{actor:b.actor}),200),tr=view.transactions[0].id,attempt=view.attempts[0].id,total=BigInt(view.total_cents);
   const plain=await login(b.email,b.password);expect(await api(`tenants/${b.id}/purchase/orders/${o.id}/refunds`,{method:'POST',actor:plain,body:{transaction_id:tr,amount_cents:'100',key:'k0',reason:'x'}}),403);
   const refund=(body)=>api(`tenants/${b.id}/purchase/orders/${o.id}/refunds`,{method:'POST',actor:b.actor,body:{transaction_id:tr,reason:'Devolução parcial ensaio',...body}});
   const first=expect(await refund({amount_cents:'1000',key:'r1'}));assert.equal(first.status,'CONFIRMED');assert.equal(expect(await refund({amount_cents:'1000',key:'r1'})).id,first.id);expect(await refund({amount_cents:'999',key:'r1'}),409);
   expect(await api(`tenants/${b.id}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor:b.actor,body:{status:'REFUNDED',amount_cents:'500'}}));await processInbox(db,b.id);
   const remaining=(total-1500n).toString();const race=await Promise.all([refund({amount_cents:remaining,key:'r2'}),refund({amount_cents:remaining,key:'r3'})]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
   let v=expect(await api(`tenants/${b.id}/purchase/orders/${o.id}`,{actor:b.actor}),200);assert.equal(v.payment_status,'REFUNDED');assert.equal(v.transactions[0].refunded_cents,view.total_cents);expect(await refund({amount_cents:'1',key:'r4'}),409);
   const o2=await paidOrder(b),v2=expect(await api(`tenants/${b.id}/purchase/orders/${o2.id}`,{actor:b.actor}),200),tr2=v2.transactions[0].id,ext2=(await tx(b.id,t=>rows(t,sql`select external_id from shop.payment_transactions where id=${tr2}`)))[0].external_id;
   const r2=(body)=>api(`tenants/${b.id}/purchase/orders/${o2.id}/refunds`,{method:'POST',actor:b.actor,body:{transaction_id:tr2,reason:'Ensaio',...body}});
   await tx(b.id,t=>t.execute(sql`update shop.simulated_payments set refund_mode='INSUFFICIENT_BALANCE' where id=${ext2}`));const failed=expect(await r2({amount_cents:'700',key:'f1'}));assert.equal(failed.status,'FAILED');assert.equal(failed.failure_reason,'INSUFFICIENT_BALANCE');
   v=expect(await api(`tenants/${b.id}/purchase/orders/${o2.id}`,{actor:b.actor}),200);assert.ok(v.incidents.some(i=>i.code==='REFUND_FAILED'&&i.status==='OPEN'));assert.equal(v.payment_status,'PAID');
   await tx(b.id,t=>t.execute(sql`update shop.simulated_payments set refund_mode='TIMEOUT_AFTER_ACCEPT' where id=${ext2}`));const unknown=expect(await r2({amount_cents:'700',key:'u1'}));assert.equal(unknown.status,'UNKNOWN');
   expect(await r2({amount_cents:String(BigInt(v2.total_cents)-699n),key:'u2'}),409);
   await tx(b.id,t=>t.execute(sql`update shop.simulated_payments set refund_mode='OK' where id=${ext2}`));await tx(b.id,t=>t.execute(sql`update shop.refund_requests set updated_at=now()-interval '5 minutes' where operation_key='u1'`));await resumeRefunds(db,b.id);
   const [p]=await tx(b.id,t=>rows(t,sql`select jsonb_array_length(refunds) as n from shop.simulated_payments where id=${ext2}`));assert.equal(p.n,1);
   v=expect(await api(`tenants/${b.id}/purchase/orders/${o2.id}`,{actor:b.actor}),200);assert.equal(v.refund_requests.find(r=>r.status==='CONFIRMED').amount_cents,'700');assert.equal(v.payment_status,'PARTIALLY_REFUNDED');assert.ok(v.incidents.every(i=>i.code!=='REFUND_UNCERTAIN'||i.status==='RESOLVED'));
   const o3=await paidOrder(b);const a3=expect(await api(`tenants/${b.id}/purchase/orders/${o3.id}`,{actor:b.actor}),200);expect(await api(`tenants/${b.id}/purchase/attempts/${a3.attempts[0].id}/simulate`,{method:'POST',actor:b.actor,body:{status:'DISPUTED'}}));await processInbox(db,b.id);
   expect(await api(`tenants/${b.id}/purchase/orders/${o3.id}/refunds`,{method:'POST',actor:b.actor,body:{transaction_id:a3.transactions[0].id,amount_cents:'100',key:'d1',reason:'x'}}),409);
   void executeRefund;
  });
  await check('T28/T37: domínio próprio — prova TXT, rota HTTPS para a loja certa, canônico com 301, remoção e nova prova para outra loja',async()=>{
   const host=`loja-${randomBytes(3).toString('hex')}.example.test`,target='lojas.example.test',dnsFor=(records)=>({txt:async n=>records.txt[n]??[],cname:async n=>records.cname[n]??[],a:async n=>records.a?.[n]??[]});
   const probe=httpsProbe('http://web:3000');
   const da=expect(await api(`tenants/${a.id}/domains`,{method:'POST',actor:a.actor,body:{hostname:host.toUpperCase()}}));assert.equal(da.hostname,host);assert.equal(da.challenge.name,`_ecommerce-challenge.${host}`);
   expect(await api(`tenants/${a.id}/domains`,{method:'POST',actor:a.actor,body:{hostname:'loja.localhost'}}),400);expect(await api(`tenants/${a.id}/domains`,{method:'POST',actor:a.actor,body:{hostname:'10.0.0.1'}}),400);
   let r=await verifyDomain(db,a.id,da.id,{dns:dnsFor({txt:{},cname:{[host]:[target]}}),probe,target});assert.equal(r.status,'FAILED');assert.match(r.failure_reason,/TXT/);
   const db2=expect(await api(`tenants/${b.id}/domains`,{method:'POST',actor:b.actor,body:{hostname:host}}));assert.notEqual(db2.challenge_token,da.challenge_token);
   const both={txt:{[`_ecommerce-challenge.${host}`]:[da.challenge.value,db2.challenge.value]},cname:{[host]:[target+'.']}};
   assert.equal((await fetch(`http://api:3001/internal/tls/ask?domain=${host}`)).status,404);
   r=await verifyDomain(db,a.id,da.id,{dns:dnsFor(both),probe,target});assert.equal(r.status,'ACTIVE');
   const ask=await fetch(`http://api:3001/internal/tls/ask?domain=${host}`);assert.equal(ask.status,200);assert.equal((await fetch(`${base}/api/internal/tls/ask?domain=${host}`)).status,404);
   assert.match(await probe(host),new RegExp(`data-store="${a.slug}"`));
   r=await verifyDomain(db,b.id,db2.id,{dns:dnsFor(both),probe,target});assert.equal(r.status,'FAILED');assert.match(r.failure_reason,/outra loja/);
   expect(await api(`tenants/${a.id}/domains/${da.id}/canonical`,{method:'POST',actor:a.actor}));
   const pub=expect(await api(`public/stores/${a.slug}`),200);assert.equal(pub.route.canonical,`https://${host}`);
   const http=await import('node:http');const get=(h,path,method='GET')=>new Promise((res,rej)=>{const q=http.request({host:'web',port:3000,path,method,headers:{host:h}},x=>{let body='';x.on('data',c=>body+=c);x.on('end',()=>res({status:x.statusCode,location:x.headers.location,body}));});q.on('error',rej);q.end();});
   const redirect=await get(`${a.slug}.localhost`,'/produtos/caneca-cafe?ref=x');assert.equal(redirect.status,301);assert.equal(redirect.location,`https://${host}/produtos/caneca-cafe?ref=x`);
   assert.notEqual((await get(`${a.slug}.localhost`,`/api/public/stores/${a.slug}/cart/items`,'POST')).status,301);
   const page=await get(host,'/produtos/caneca-cafe');assert.equal(page.status,200);assert.match(page.body,new RegExp(`<link rel="canonical" href="https://${host.replace(/\./g,'\\.')}/produtos/caneca-cafe"`));
   const sitemap=await get(host,'/sitemap.xml');assert.match(sitemap.body,new RegExp(`https://${host.replace(/\./g,'\\.')}/produtos/caneca-cafe`));assert.ok(!sitemap.body.includes('preview'));
   expect(await api(`tenants/${a.id}/domains/${da.id}/disable`,{method:'POST',actor:a.actor}));assert.equal(expect(await api(`public/stores/${a.slug}`),200).route.canonical.startsWith('http://'),true);
   assert.equal((await get(host,'/')).status,404);
   r=await verifyDomain(db,b.id,db2.id,{dns:dnsFor({txt:{[`_ecommerce-challenge.${host}`]:[da.challenge.value]},cname:{[host]:[target]}}),probe,target});assert.equal(r.status,'FAILED');
   r=await verifyDomain(db,b.id,db2.id,{dns:dnsFor(both),probe,target});assert.equal(r.status,'ACTIVE');assert.match((await get(host,'/')).body,new RegExp(`data-store="${b.slug}"`));
   const readd=expect(await api(`tenants/${a.id}/domains`,{method:'POST',actor:a.actor,body:{hostname:host}}));assert.notEqual(readd.challenge_token,da.challenge_token);
  });
  await check('T31: frete por provedor — cotação válida, mudança de regra/expiração invalidam, falha não gera frete grátis',async()=>{
   expect(await api(`tenants/${b.id}/operations/carrier`,{method:'POST',actor:b.actor,body:{origin_cep:'01310100',simulation:{validity_minutes:60}}}));
   let c=await cartQuote(b,'CARRIER');assert.equal(c.q.status,201,JSON.stringify(c.q.body));assert.equal(c.q.body.options.length,2);assert.ok(BigInt(c.q.body.price_cents)>0n);
   const o=expect(await checkout(b,c));assert.match(o.shipping.name,/Transportadora — Econômico/);assert.equal(o.shipping_cents,c.q.body.price_cents);
   c=await cartQuote(b,'CARRIER',b.variants[1].id,{service:'Expresso (simulado)'});assert.match(c.q.body.method,/Expresso/);
   expect(await api(`tenants/${b.id}/operations/carrier`,{method:'POST',actor:b.actor,body:{origin_cep:'01310100',simulation:{surcharge_cents:500}}}));expect(await checkout(b,c),409);
   c=await cartQuote(b,'CARRIER');await tx(b.id,t=>t.execute(sql`update shop.shipping_quotes set expires_at=now()-interval '1 second' where id=${c.q.body.id}`));expect(await checkout(b,c),409);
   expect(await api(`tenants/${b.id}/operations/carrier`,{method:'POST',actor:b.actor,body:{origin_cep:'01310100',simulation:{validity_minutes:5}}}));c=await cartQuote(b,'CARRIER');assert.ok(new Date(c.q.body.expires_at).getTime()<=Date.now()+5*60000+2000);
   expect(await api(`tenants/${b.id}/operations/carrier`,{method:'POST',actor:b.actor,body:{origin_cep:'01310100',simulation:{fail:true}}}));c=await cartQuote(b,'CARRIER');assert.equal(c.q.status,503);assert.match(JSON.stringify(c.q.body),/nenhum frete gratuito/);
   const local=await api(`public/stores/${b.slug}/cart/quotes`,{method:'POST',cookie:c.cookie,body:{kind:'TABLE',address}});assert.equal(local.status,201);
   expect(await api(`tenants/${b.id}/operations/carrier`,{method:'POST',actor:b.actor,body:{origin_cep:'01310100'}}));c=await cartQuote(b,'CARRIER',b.simple.variant_id);assert.equal(c.q.status,409);assert.match(JSON.stringify(c.q.body),/peso\/dimensões/);
  });
  report.passed=failures===0;report.completedAt=new Date().toISOString();
 }finally{await db.pool.end();writeFileSync('/app/artifacts/commercial.json',JSON.stringify(report,null,2));}
});
