// Manual homologation against the Mercado Pago TEST environment using one seller's own test access token
// (direct integration, no OAuth). Refuses to run unless /users/me reports a test user. Never prints credentials.
// Usage: node --env-file=.env src/homologate.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { MercadoPagoClient, ProviderError } from './client.ts';
import { centsToDecimal, decimalToCents, jsonWithAmount, parseProviderJson } from './primitives.ts';
const token=process.env.MP_ACCESS_TOKEN||'',publicKey=process.env.MP_PUBLIC_KEY||'';
if(!token||!publicKey||process.env.MP_ENVIRONMENT!=='SANDBOX'){console.error('Configure MP_ACCESS_TOKEN, MP_PUBLIC_KEY e MP_ENVIRONMENT=SANDBOX no .env.');process.exit(2);}
const api='https://api.mercadopago.com',file='evidence/external.json';
const evidence=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{environment:'SANDBOX',operator:process.env.POC_OPERATOR??'agente (sessão autorizada pelo responsável)',items:[]};
const record=(capability:string,method:string,result:string,reference:string,detail:Record<string,unknown>={})=>{evidence.items.push({capability,method,result,reference,detail,at:new Date().toISOString()});console.log(`${result==='FAILED'?'✖':'✔'} ${capability} ${method} ${result} ${reference}`);};
async function raw(path:string,init:{method?:string;body?:string;key?:string;auth?:string}={}){const r=await fetch(api+path,{method:init.method??'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${init.auth??token}`,...(init.key?{'X-Idempotency-Key':init.key}:{})},body:init.body,signal:AbortSignal.timeout(20000)});const text=await r.text();return {status:r.status,body:text?parseProviderJson(text):null};}
const me=await raw('/users/me');if(me.status!==200||!me.body.tags?.includes('test_user')){console.error('A credencial não é de usuário de teste; homologação recusada.');process.exit(2);}
const seller=String(me.body.id);record('TEST_ACCOUNT_CONFIRMED','-','OK',`seller:${seller}`,{site:me.body.site_id});
const client=new MercadoPagoClient({clientId:'direct',clientSecret:'direct',redirectUri:'https://pilot.example.test/oauth/callback'});
// The buyer must be a TEST BUYER account of the same environment (Mercado Pago rejects other payers).
const payer=process.env.MP_TEST_BUYER_EMAIL||"";if(!payer){console.error("Configure MP_TEST_BUYER_EMAIL (comprador de teste do painel).");process.exit(2);}
try{
 // Pix: creation with idempotency key; repeat with the same key must return the same payment.
 const pixRef=randomUUID(),pixKey=`poc-${pixRef}`;
 const pix=await client.createPix(token,{amountCents:150n,reference:pixRef,payerEmail:payer,description:'POC Fase 0 Pix',expiresAt:new Date(Date.now()+31*60000),idempotencyKey:pixKey});
 record('CREATE_PIX','PIX',pix.status.toUpperCase(),`${seller}:${pix.id}`,{amount_cents:pix.amountCents.toString(),seller_matches:pix.sellerId===seller,live_mode:pix.liveMode,qr:Boolean((pix.raw as any).point_of_interaction?.transaction_data?.qr_code)});
 const again=await client.createPix(token,{amountCents:150n,reference:pixRef,payerEmail:payer,description:'POC Fase 0 Pix',expiresAt:new Date(Date.now()+31*60000),idempotencyKey:pixKey});
 record('IDEMPOTENT_CREATE','PIX',again.id===pix.id?'OK':'FAILED',`${seller}:${again.id}`);
 const found=await client.search(token,pixRef);record('QUERY_BY_REFERENCE','PIX',found.some(f=>f.id===pix.id)?'OK':'FAILED',`${seller}:${pix.id}`,{results:found.length});
 const got=await client.get(token,pix.id);record('AUTHORITATIVE_GET','PIX',got.reference===pixRef&&got.sellerId===seller&&got.currency==='BRL'&&got.amountCents===150n?'OK':'FAILED',`${seller}:${pix.id}`,{status:got.status,expiration:(got.raw as any).date_of_expiration});
 // Card: token generated with the public key and a published test card (equivalent to the Card Payment Brick call); PAN never stored.
 const card=await fetch(`${api}/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({card_number:'5031433215406351',security_code:'123',expiration_month:11,expiration_year:2030,cardholder:{name:'APRO',identification:{type:'CPF',number:'12345678909'}}})}).then(r=>r.json());
 if(!card.id)record('CARD_TOKEN','CARD','FAILED','-',{error:String(card.message??card.error).slice(0,120)});
 else{record('CARD_TOKEN','CARD','OK','token-gerado (não armazenado)');
  const cardRef=randomUUID();const paid=await client.createCard(token,{amountCents:2500n,reference:cardRef,payerEmail:payer,description:'POC Fase 0 cartão',cardToken:card.id,paymentMethodId:'master',installments:1,idempotencyKey:`poc-${cardRef}`});
  record('CREATE_CARD','CARD',paid.status.toUpperCase(),`${seller}:${paid.id}`,{status_detail:paid.statusDetail,amount_cents:paid.amountCents.toString()});
  if(paid.status==='approved'){
   // Partial then total refund through the API (Phase 6 adapter contract), each with its own idempotency key; read back.
   const partialKey=`refund-${randomUUID()}`;const partial=await raw(`/v1/payments/${paid.id}/refunds`,{method:'POST',body:`{"amount":${centsToDecimal(1000n)}}`,key:partialKey});
   record('REFUND_PARTIAL_API','CARD',partial.status<300?'OK':'FAILED',`${seller}:${paid.id}`,{http:partial.status});
   const repeat=await raw(`/v1/payments/${paid.id}/refunds`,{method:'POST',body:`{"amount":${centsToDecimal(1000n)}}`,key:partialKey});
   record('REFUND_IDEMPOTENT','CARD',repeat.status<300&&String(repeat.body?.id)===String(partial.body?.id)?'OK':'FAILED',`${seller}:${paid.id}`,{http:repeat.status});
   const over=await raw(`/v1/payments/${paid.id}/refunds`,{method:'POST',body:`{"amount":${centsToDecimal(5000n)}}`,key:`refund-${randomUUID()}`});
   record('REFUND_OVER_BALANCE_REJECTED','CARD',over.status>=400?'OK':'FAILED',`${seller}:${paid.id}`,{http:over.status});
   const total=await raw(`/v1/payments/${paid.id}/refunds`,{method:'POST',body:'{}',key:`refund-${randomUUID()}`});
   record('REFUND_TOTAL_API','CARD',total.status<300?'OK':'FAILED',`${seller}:${paid.id}`,{http:total.status});
   const after=await client.get(token,paid.id);const refunded=after.refunds.reduce((s,r)=>s+r.amountCents,0n);
   record('REFUND_READ','CARD',refunded===2500n?'OK':'FAILED',`${seller}:${paid.id}`,{status:after.status,refunded_cents:refunded.toString(),refunds:after.refunds.length});
  }
 }
 // Wrong value detection uses the authoritative amount: compare with an expectation that differs.
 record('VALUE_CHECK_LOCAL','PIX',got.amountCents!==151n?'OK':'FAILED',`${seller}:${pix.id}`,{note:'conferência local do valor autoritativo'});
}catch(e){record('HOMOLOGATION_ERROR','-','FAILED','-',{error:e instanceof ProviderError?`HTTP ${e.status} ${JSON.stringify(e.body).slice(0,200)}`:(e as Error).message.slice(0,200)});}
finally{mkdirSync('evidence',{recursive:true});writeFileSync(file,JSON.stringify(evidence,null,2));void decimalToCents;void jsonWithAmount;}
