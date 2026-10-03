// External evidence required to conclude each phase (docs/PLANO-E-VERIFICACAO.md: código 0 só com evidências obrigatórias).
// A real document is validated by structure, mode, environment, date, responsible role, procedure, result reference and the
// tested commit (must be an ancestor of the verified HEAD). Presence alone, an empty file or a SIMULADO document never
// satisfies a real requirement. Simulated stand-ins are accepted only in the explicit --externos-simulados mode.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const E='docs/execucao/evidencias';
const has=(o,k)=>typeof o?.[k]==='string'&&o[k].trim().length>0;
const okChecks=(names)=>d=>{const list=Array.isArray(d.checks)?d.checks:[];const missing=names.filter(n=>!list.some(c=>c?.name===n&&c?.result==='OK'));return missing.length?`verificações sem OK: ${missing.join(', ')}`:null;};
// id, phase from which it is required, decision IDs, real file, accepted environments, specific validation, simulated stand-in.
export const REQUIREMENTS=[
 {id:'MERCADO_PAGO',from:3,decision:'D02',file:`${E}/fase-0/homologacao-mercado-pago.json`,environments:['SANDBOX'],
  what:'homologação do Mercado Pago no sandbox (OAuth de vendedor, Pix, cartão tokenizado, consulta, webhook assinado em HTTPS público, reembolso)',
  check:okChecks(['OAUTH','PIX','CARD','QUERY','WEBHOOK_SIGNATURE','REFUND']),simulated:`${E}/fase-0/gateway.simulado.json`},
 {id:'DOMINIO_HTTPS',from:4,decision:'D03',file:`${E}/fase-4/homologacao-dominio.json`,environments:['PRODUCTION','STAGING_PUBLIC'],
  what:'domínio da plataforma, DNS público e certificado HTTPS público (Caddy) com rota até a loja',
  check:okChecks(['PLATFORM_HOST','PUBLIC_CERTIFICATE','STORE_ROUTE','UNKNOWN_HOST_REFUSED']),simulated:`${E}/fase-4/staging.simulado.json`},
 {id:'EMAIL',from:4,decision:'D05',file:`${E}/fase-4/homologacao-email.json`,environments:['PRODUCTION','STAGING_PUBLIC'],
  what:'provedor de e-mail com remetente verificado (SPF/DKIM) e entrega real de mensagem transacional',
  check:okChecks(['SENDER_VERIFIED','SPF_DKIM','DELIVERY']),simulated:`${E}/fase-4/staging.simulado.json`},
 {id:'BACKUP_EXTERNO',from:4,decision:'D04',file:`${E}/fase-4/homologacao-backup-externo.json`,environments:['PRODUCTION','STAGING_PUBLIC'],
  what:'backup externo cifrado em outra região, retenção de 30 dias, chave separada e restauração a partir dele',
  check:okChecks(['ENCRYPTED_UPLOAD','RETENTION_30D','SEPARATE_KEY','RESTORE_FROM_OFFSITE']),simulated:`${E}/fase-4/backup-externo.simulado.json`},
 {id:'OPERACAO',from:4,decision:'D06',file:`${E}/fase-4/homologacao-operacao.json`,environments:['PRODUCTION'],
  what:'VM, monitoramento de host/disco, canal de alerta e pessoa de plantão definidos e testados',
  check:okChecks(['VM','HOST_MONITORING','ALERT_CHANNEL','ON_CALL']),simulated:null},
 {id:'PILOTO',from:5,decision:'D01/D08/D10',file:`${E}/fase-5/observacoes.json`,environments:['PRODUCTION'],
  what:'observações reais do piloto (autorização de ativação, ao menos duas lojas, período observado)',
  check:d=>!has(d.authorization,'reference')?'autorização sem referência':!Array.isArray(d.stores)||d.stores.length<2?'menos de duas lojas':!has(d.period,'from')||!has(d.period,'to')?'período ausente':null,
  simulated:`${E}/fase-5/observacoes.simulado.json`,simulatedCheck:d=>!d.passed||!(d.stores?.length>=2)?'piloto simulado incompleto':null},
 {id:'COMERCIAL',from:6,decision:'D03/D07/D09',file:`${E}/fase-6/decisoes-comerciais.json`,environments:['PRODUCTION'],
  what:'decisões comerciais aprovadas (preço/recorrência/fiscal, borda de domínio, frete) e homologação dos provedores',
  check:d=>['D03','D07','D09'].filter(k=>!d.decisions?.[k]||d.decisions[k].status!=='APROVADA').map(k=>`${k} não APROVADA`).join(', ')||null,
  simulated:`${E}/fase-6/decisoes-comerciais.simulado.json`,simulatedCheck:d=>d.provisional!==true?'decisões simuladas devem ser provisórias':null},
 {id:'IA',from:7,decision:'D11',file:`${E}/fase-7/homologacao-ia.json`,environments:['PRODUCTION','STAGING_PUBLIC'],
  what:'provedor de IA real (chave, orçamento autorizado, chamada paga controlada com custo reconciliado)',
  check:okChecks(['BUDGET_AUTHORIZED','PAID_CALL','COST_RECONCILED']),simulated:`${E}/fase-7/homologacao-ia.simulado.json`}
];
const SENSITIVE=/APP_USR-[0-9a-f-]{10,}|TEST-[0-9a-f]{8}-|sk-ant-[A-Za-z0-9_-]{10,}|BEGIN [A-Z ]*PRIVATE KEY|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{14}\b/;
// Returns null when valid, otherwise {kind:'missing'|'invalid'|'failed', reason}.
export function validateReal(req,raw,{now=new Date(),isAncestor}){
 let d;try{d=JSON.parse(raw);}catch{return {kind:'invalid',reason:'arquivo vazio ou JSON inválido'};}
 if(!d||typeof d!=='object'||Array.isArray(d)||!Object.keys(d).length)return {kind:'invalid',reason:'documento vazio'};
 if(d.mode!=='REAL')return {kind:'invalid',reason:`mode deve ser REAL (encontrado ${JSON.stringify(d.mode??null)}); simulado não comprova homologação`};
 if(d.requirement!==req.id)return {kind:'invalid',reason:`requirement deve ser ${req.id}`};
 if(!req.environments.includes(d.environment))return {kind:'invalid',reason:`environment deve ser ${req.environments.join(' ou ')}`};
 const date=Date.parse(d.date);if(!/^\d{4}-\d{2}-\d{2}/.test(String(d.date))||Number.isNaN(date)||date>now.getTime()+86400000)return {kind:'invalid',reason:'date ausente, inválida ou futura'};
 for(const k of ['responsible','procedure','reference'])if(!has(d,k))return {kind:'invalid',reason:`${k} ausente`};
 if(!/^[0-9a-f]{40}$/.test(String(d.commit)))return {kind:'invalid',reason:'commit testado ausente (SHA-1 completo)'};
 if(!isAncestor(d.commit))return {kind:'invalid',reason:`commit ${d.commit.slice(0,12)} não pertence ao histórico verificado`};
 if(SENSITIVE.test(raw))return {kind:'invalid',reason:'contém possível segredo ou dado pessoal; sanitize'};
 if(d.result==='REPROVADO')return {kind:'failed',reason:'homologação registrada como REPROVADO'};
 if(d.result!=='APROVADO')return {kind:'invalid',reason:'result deve ser APROVADO ou REPROVADO'};
 const specific=req.check(d);if(specific)return {kind:'invalid',reason:specific};
 return null;
}
export function validateSimulated(req,raw){
 let d;try{d=JSON.parse(raw);}catch{return 'arquivo vazio ou JSON inválido';}
 if(d?.mode!=='SIMULADO')return 'sem marcação mode=SIMULADO';
 if(d.passed===false)return 'substituto reprovado';
 return req.simulatedCheck?.(d)??null;
}
// Evaluates every requirement up to the phase. Real evidence always wins; a simulated stand-in only counts in simulated mode.
export function evaluateExternal({phase,simulated,root,isAncestor,now}){
 const out={accepted:[],simulated:[],pending:[],invalid:[],failed:[],realPending:[]};
 for(const req of REQUIREMENTS.filter(r=>r.from<=phase)){
  const file=join(root,req.file),label=`${req.id} (${req.decision}): ${req.what}`;
  if(existsSync(file)){const problem=validateReal(req,readFileSync(file,'utf8'),{now,isAncestor});
   if(!problem){out.accepted.push({id:req.id,file:req.file});continue;}
   (problem.kind==='failed'?out.failed:out.invalid).push(`${req.id}: ${req.file} — ${problem.reason}`);out.realPending.push(label);continue;}
  out.realPending.push(label);
  if(simulated&&req.simulated&&existsSync(join(root,req.simulated))){const problem=validateSimulated(req,readFileSync(join(root,req.simulated),'utf8'));
   if(!problem){out.simulated.push({id:req.id,file:req.simulated});continue;}
   out.invalid.push(`${req.id}: ${req.simulated} — ${problem}`);continue;}
  out.pending.push(`PENDENTE_EXTERNA ${label}${simulated&&!req.simulated?' — sem substituto simulado':''}. Registre ${req.file}.`);
 }
 return out;
}
