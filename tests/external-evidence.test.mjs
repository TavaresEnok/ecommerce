import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REQUIREMENTS, evaluateExternal, validateReal } from '../scripts/external-evidence.mjs';
// R6 (revisão 0179f4): evidência externa só conta com conteúdo válido e vínculo ao commit testado. Runs on the host, no Docker.
const COMMIT='a'.repeat(40),isAncestor=c=>c===COMMIT,now=new Date('2026-10-02T12:00:00Z');
const mp=REQUIREMENTS.find(r=>r.id==='MERCADO_PAGO');
const valid={mode:'REAL',requirement:'MERCADO_PAGO',environment:'SANDBOX',date:'2026-10-01',responsible:'Titular da conta Mercado Pago',procedure:'experiments/mercado-pago/src/homologate.ts',reference:'Execução registrada em fase-0.md §Homologação',commit:COMMIT,result:'APROVADO',checks:['OAUTH','PIX','CARD','QUERY','WEBHOOK_SIGNATURE','REFUND'].map(name=>({name,result:'OK'}))};
const reason=(doc)=>validateReal(mp,typeof doc==='string'?doc:JSON.stringify(doc),{now,isAncestor});
test('Documento real completo é aceito',()=>assert.equal(reason(valid),null));
test('Arquivo vazio, JSON inválido ou objeto vazio não comprovam',()=>{for(const raw of ['','   ','{}','[]','null','{"mode":'])assert.equal(reason(raw)?.kind,'invalid',raw);});
test('Simulado no lugar do real não comprova',()=>{assert.match(reason({...valid,mode:'SIMULADO'}).reason,/REAL/);assert.match(reason({...valid,mode:undefined}).reason,/REAL/);});
test('Requisito, ambiente e data precisam corresponder',()=>{
 assert.match(reason({...valid,requirement:'IA'}).reason,/requirement/);
 for(const environment of ['LOCAL','STAGING_LOCAL','PRODUCTION',undefined])assert.match(reason({...valid,environment}).reason,/environment/);
 for(const date of [undefined,'ontem','2027-01-01'])assert.match(reason({...valid,date}).reason,/date/);});
test('Responsável, procedimento e referência são obrigatórios',()=>{for(const k of ['responsible','procedure','reference'])assert.match(reason({...valid,[k]:' '}).reason,new RegExp(k));});
test('Commit testado precisa existir no histórico verificado',()=>{assert.match(reason({...valid,commit:undefined}).reason,/commit/);assert.match(reason({...valid,commit:'b'.repeat(40)}).reason,/histórico/);});
test('Verificações específicas do requisito precisam estar OK',()=>{assert.match(reason({...valid,checks:valid.checks.slice(1)}).reason,/OAUTH/);assert.match(reason({...valid,checks:valid.checks.map(c=>({...c,result:'PENDENTE'}))}).reason,/sem OK/);});
test('Segredo ou dado pessoal é recusado',()=>{assert.match(reason({...valid,reference:'token APP_USR-1234567890-abcdef'}).reason,/segredo/);assert.match(reason({...valid,responsible:'fulano@example.com'}).reason,/dado pessoal/);});
test('REPROVADO é falha demonstrada (código 1), não pendência',()=>assert.equal(reason({...valid,result:'REPROVADO'}).kind,'failed'));
test('Avaliação por fase: padrão exige reais; simulado só no modo explícito e nunca para item sem substituto',()=>{
 const root=mkdtempSync(join(tmpdir(),'evidence-'));const put=(file,data)=>{mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),typeof data==='string'?data:JSON.stringify(data));};
 try{
  assert.equal(evaluateExternal({phase:2,simulated:false,root,isAncestor,now}).pending.length,0,'Fases 1–2 não têm dependência externa');
  const p3=evaluateExternal({phase:3,simulated:false,root,isAncestor,now});assert.deepEqual(p3.pending.length,1);assert.match(p3.pending[0],/MERCADO_PAGO/);
  assert.deepEqual(evaluateExternal({phase:4,simulated:false,root,isAncestor,now}).pending.map(p=>p.split(' ')[1]),['MERCADO_PAGO','DOMINIO_HTTPS','EMAIL','BACKUP_EXTERNO','OPERACAO']);
  // A simulated stand-in never counts in the default mode, even if present.
  put(mp.simulated,{mode:'SIMULADO'});assert.equal(evaluateExternal({phase:3,simulated:false,root,isAncestor,now}).pending.length,1);
  const s3=evaluateExternal({phase:3,simulated:true,root,isAncestor,now});assert.equal(s3.pending.length,0);assert.equal(s3.simulated.length,1);assert.equal(s3.realPending.length,1);
  // Item without stand-in stays pending even in simulated mode.
  const s4=evaluateExternal({phase:4,simulated:true,root,isAncestor,now});assert.ok(s4.pending.some(p=>/OPERACAO.*sem substituto/.test(p)));
  // An empty real file is invalid (not accepted) and the simulated file does not rescue it.
  put(mp.file,'');const e=evaluateExternal({phase:3,simulated:true,root,isAncestor,now});assert.equal(e.accepted.length,0);assert.equal(e.invalid.length,1);
  // A stand-in without SIMULADO marking is rejected.
  rmSync(join(root,mp.file));put(mp.simulated,{mode:'REAL'});assert.equal(evaluateExternal({phase:3,simulated:true,root,isAncestor,now}).invalid.length,1);
  put(mp.file,valid);const ok=evaluateExternal({phase:3,simulated:false,root,isAncestor,now});assert.equal(ok.accepted.length,1);assert.equal(ok.realPending.length,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
