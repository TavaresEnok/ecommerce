import { PurchaseError, simulationEnabled } from './index.js';
// Frete integrado (seção 10). Nenhum agregador homologado (D09); o simulador só existe em development/test.
export type Parcel={weight_g:number;length_mm:number;width_mm:number;height_mm:number};
export type CarrierQuote={service:string;price_cents:string;days:number;expires_at:Date;ref:string};
export interface ShippingProvider {readonly name:string;quote(input:{origin_cep:string;destination_cep:string;parcel:Parcel;declared_cents:string}):Promise<CarrierQuote[]>}
export const PARCEL_LIMITS={max_weight_g:30000,max_side_mm:1000,max_sum_mm:2000};
// Packaging policy: one box per order — longest length and width, stacked heights, summed weight. Items without
// registered dimensions/weight cannot be quoted by a carrier (no guessing, no free shipping).
export function parcelFor(items:{quantity:number;weight_g:number;width_mm:number;height_mm:number;length_mm:number}[]):Parcel|null{
 if(!items.length||items.some(i=>!i.weight_g||!i.width_mm||!i.height_mm||!i.length_mm))return null;
 const p={weight_g:items.reduce((s,i)=>s+i.weight_g*i.quantity,0),length_mm:Math.max(...items.map(i=>Math.max(i.length_mm,i.width_mm))),width_mm:Math.max(...items.map(i=>Math.min(i.length_mm,i.width_mm))),height_mm:items.reduce((s,i)=>s+i.height_mm*i.quantity,0)};
 if(p.weight_g>PARCEL_LIMITS.max_weight_g||Math.max(p.length_mm,p.width_mm,p.height_mm)>PARCEL_LIMITS.max_side_mm||p.length_mm+p.width_mm+p.height_mm>PARCEL_LIMITS.max_sum_mm)return null;return p;}
export type SimulationSettings={fail?:boolean;surcharge_cents?:number;validity_minutes?:number};
export class SimulatedShippingProvider implements ShippingProvider {readonly name='SIMULATED';private s:SimulationSettings;constructor(settings:SimulationSettings={}){this.s=settings;}
 async quote(input:{origin_cep:string;destination_cep:string;parcel:Parcel;declared_cents:string}){if(!simulationEnabled())throw new PurchaseError(503,'Simulador de frete desabilitado.');if(this.s.fail)throw new Error('SIMULATED_CARRIER_UNAVAILABLE');
  const distance=Math.abs(Number(input.origin_cep.slice(0,2))-Number(input.destination_cep.slice(0,2))),base=1200+Math.ceil(input.parcel.weight_g/100)*40+distance*90+(this.s.surcharge_cents??0),expires=new Date(Date.now()+(this.s.validity_minutes??60)*60000);
  return [{service:'Econômico (simulado)',price_cents:String(base),days:3+Math.ceil(distance/10),expires_at:expires,ref:`sim-eco-${input.destination_cep}`},{service:'Expresso (simulado)',price_cents:String(Math.round(base*1.6)),days:1+Math.ceil(distance/20),expires_at:expires,ref:`sim-exp-${input.destination_cep}`}];}}
export function shippingProvider(provider:string,simulation:SimulationSettings):ShippingProvider{if(provider==='SIMULATED')return new SimulatedShippingProvider(simulation);throw new PurchaseError(503,'Provedor de frete não homologado.');}
