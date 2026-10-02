import type { Attempt, Gateway, PaymentFact } from './index.js';
// Candidate Payments v1 contract. No production transport is installed until Phase 0 homologation.
export type Transport=(path:string,init:{method:string;headers:Record<string,string>;body?:string})=>Promise<string>;
export function decimalToCents(value:string){if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error('Unsupported monetary format');const [whole,fraction='']=value.split('.');return (BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'))).toString();}
export function centsToDecimal(value:string){if(!/^\d+$/.test(value))throw new Error('Invalid integer cents');const n=BigInt(value);return `${n/100n}.${(n%100n).toString().padStart(2,'0')}`;}
function parse(raw:string){
 // Quote monetary JSON tokens before JSON.parse so they never become IEEE754 values.
 const safe=raw.replace(/("(?:transaction_amount|amount|transaction_amount_refunded)"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,'$1"$2"');return JSON.parse(safe);
}
export class MercadoPagoCandidate implements Gateway {
 constructor(private transport:Transport,private accessToken:(tenant:string,a:Attempt)=>Promise<string>){}
 private async call(tenant:string,a:Attempt,path:string,method='GET',body?:string,key=a.operation_key){const token=await this.accessToken(tenant,a);return parse(await this.transport(path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(method==='POST'?{'X-Idempotency-Key':key}:{})},body}));}
 private fact(raw:any):PaymentFact{if(!raw.id||!raw.external_reference||!raw.collector_id||typeof raw.live_mode!=='boolean')throw new Error('Incomplete authoritative resource');return {id:String(raw.id),reference:String(raw.external_reference),seller_id:String(raw.collector_id),environment:raw.live_mode?'PRODUCTION':'SANDBOX',status:({approved:'APPROVED',pending:'PENDING',in_process:'PENDING',rejected:'REJECTED',cancelled:'CANCELLED',refunded:'REFUNDED',charged_back:'CHARGED_BACK'} as Record<string,string>)[raw.status]||'UNKNOWN',amount_cents:decimalToCents(String(raw.transaction_amount)),currency:String(raw.currency_id),approved_at:raw.date_approved?new Date(raw.date_approved):null,refunds:(raw.refunds||[]).filter((r:any)=>r.status==='approved').map((r:any)=>({id:String(r.id),amount_cents:decimalToCents(String(r.amount)),confirmed_at:String(r.date_created)})),dispute:raw.status==='charged_back'?{id:`payment-${raw.id}`,status:'LOST',financial_loss:true}:null};}
 async create(tenant:string,a:Attempt){if(a.method!=='PIX')throw new Error('Card creation requires homologated provider tokenization; PAN/CVV prohibited');const body=`{"transaction_amount":${centsToDecimal(a.expected_cents)},"payment_method_id":"pix","external_reference":${JSON.stringify(a.id)},"date_of_expiration":${JSON.stringify(new Date(Date.now()+30*60000).toISOString())}}`;return this.fact(await this.call(tenant,a,'/v1/payments','POST',body));}
 async search(tenant:string,a:Attempt){const raw=await this.call(tenant,a,`/v1/payments/search?external_reference=${encodeURIComponent(a.id)}`);return Promise.all((raw.results||[]).map((r:any)=>this.get(tenant,a,String(r.id))));}
 // POST /v1/payments/{id}/refunds with its own idempotency key; partial when amount is given (candidate, not homologated).
 async refund(tenant:string,a:Attempt,paymentId:string,amountCents:string,key:string){const raw=await this.call(tenant,a,`/v1/payments/${encodeURIComponent(paymentId)}/refunds`,'POST',`{"amount":${centsToDecimal(amountCents)}}`,key);if(!raw?.id)throw new Error('Incomplete refund response');return {id:String(raw.id)};}
 async get(tenant:string,a:Attempt,id:string){return this.fact(await this.call(tenant,a,`/v1/payments/${encodeURIComponent(id)}`));}
}
export class OAuthCandidate {
 constructor(private transport:Transport,private clientId:string,private clientSecret:string,private redirectUri:string){}
 authorizeUrl(state:string){if(!this.redirectUri.startsWith('https://')||state.length<40)throw new Error('Unsafe OAuth redirect/state');const url=new URL('https://auth.mercadopago.com.br/authorization');url.searchParams.set('client_id',this.clientId);url.searchParams.set('response_type','code');url.searchParams.set('platform_id','mp');url.searchParams.set('state',state);url.searchParams.set('redirect_uri',this.redirectUri);return url.toString();}
 private async grant(body:Record<string,string>){const raw=JSON.parse(await this.transport('/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,client_id:this.clientId,client_secret:this.clientSecret})}));if(!raw.access_token||!raw.refresh_token||!raw.user_id||!Number.isSafeInteger(raw.expires_in)||raw.expires_in<=0)throw new Error('Invalid OAuth response');return {accessToken:String(raw.access_token),refreshToken:String(raw.refresh_token),sellerId:String(raw.user_id),expiresAt:new Date(Date.now()+raw.expires_in*1000)};}
 exchange(code:string){return this.grant({grant_type:'authorization_code',code,redirect_uri:this.redirectUri});}
 refresh(refreshToken:string){return this.grant({grant_type:'refresh_token',refresh_token:refreshToken});}
}
