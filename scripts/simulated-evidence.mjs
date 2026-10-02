// Writes the SIMULATED stand-ins for external evidence (provisional commercial decisions, simulated gateway and AI
// homologation) from artifacts produced by the real test suites. Never writes the real file names the verifier
// requires for real homologation. Usage: node scripts/simulated-evidence.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './compose.mjs';
const now=new Date().toISOString(),label='SIMULADO — não é homologação externa real';
const read=f=>{const p=join(root,'artifacts',f);if(!existsSync(p))throw new Error(`Execute a verificação que gera artifacts/${f} antes.`);const d=JSON.parse(readFileSync(p,'utf8'));if(!d.passed)throw new Error(`artifacts/${f} reprovado.`);return d;};
const write=(dir,file,data)=>{mkdirSync(join(root,dir),{recursive:true});writeFileSync(join(root,dir,file),JSON.stringify({mode:'SIMULADO',label,generatedAt:now,...data},null,2)+'\n');console.log(`✔ ${dir}/${file}`);};
try{
 const purchase=read('purchase.json'),ai=read('ai.json');
 write('docs/execucao/evidencias/fase-0','gateway.simulado.json',{substitute:'SimulatedGateway (banco) no lugar do Mercado Pago sandbox',
  covered:purchase.tests.filter(t=>t.result==='passed').map(t=>t.name),
  realPending:['Conta de comprador de teste do Mercado Pago (MP_TEST_BUYER_EMAIL) para homologate.ts','Client ID/secret OAuth e segunda conta vendedora (marketplace/split)','Webhook em URL HTTPS pública com assinatura validada']});
 write('docs/execucao/evidencias/fase-6','decisoes-comerciais.simulado.json',{provisional:true,
  decisions:{
   D03:{choice:'Caddy On-Demand TLS na própria VM (sem CDN de terceiros)',status:'PROVISÓRIA',note:'Cloudflare for SaaS permanece alternativa; homologado só em staging local com autoridade interna.'},
   D07:{plans:[{code:'PILOT',price_cents:0,interval:'NONE'},{code:'BASICO',price_cents:4990,interval:'MONTH'},{code:'PRO',price_cents:12990,interval:'MONTH'}],billingProvider:'SimulatedBillingProvider',fiscal:'Sem emissão de NFS-e até orientação contábil',status:'PROVISÓRIA — valores de demonstração, não cadastrados como ACTIVE'},
   D09:{choice:'Tabela própria por CEP + retirada local; agregador (Melhor Envio candidato) não integrado',status:'PROVISÓRIA'}},
  realPending:['Aprovação dos preços pelo responsável do negócio','Contrato com provedor de cobrança recorrente','Orientação fiscal','Conta no agregador de frete']});
 write('docs/execucao/evidencias/fase-7','homologacao-ia.simulado.json',{substitute:'SimulatedAiProvider (sem chamada paga)',model:'claude-opus-5-5 (configurado, não chamado)',
  covered:ai.tests.filter(t=>t.result==='passed').map(t=>t.name),
  realPending:['Chave ANTHROPIC_API_KEY real','Orçamento mensal autorizado','Uma chamada paga controlada com reconciliação de custo registrada']});
}catch(e){console.error(e.message);process.exitCode=1;}
