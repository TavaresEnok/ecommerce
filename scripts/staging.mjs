// Local staging with fictitious external substitutes. Everything it produces is labelled SIMULADO.
//   node scripts/staging.mjs up | check | pilot | down
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { command, docker, root } from './compose.mjs';
const env=join(root,'.local/staging.env'),zone=join(root,'.local/staging/dns.json');
export const stagingCompose=['compose','--project-name','ecommerce-staging','--env-file',env,'-f','compose.yaml','-f','compose.staging.yaml'];
function prepare(){
 if(!existsSync(join(root,'.env')))throw Object.assign(new Error('Execute npm run setup primeiro.'),{exitCode:2});
 if(!existsSync(env)){
  // Own secrets for staging, never the development ones reused verbatim for the new keys.
  const base=readFileSync(join(root,'.env'),'utf8').split('\n').filter(l=>!/^(APP_ENV|NODE_ENV|PUBLIC_ORIGIN|MAIL_PROVIDER)=/.test(l)).join('\n');
  writeFileSync(env,`${base.trim()}\nAPP_ENV=development\nNODE_ENV=development\nPUBLIC_ORIGIN=https://localhost:8443\nMAIL_PROVIDER=smtp\nOFFSITE_S3_ACCESS_KEY=${randomBytes(16).toString('hex')}\nOFFSITE_S3_SECRET_KEY=${randomBytes(32).toString('hex')}\nOFFSITE_BACKUP_KEY=${randomBytes(32).toString('hex')}\n`,{mode:0o600});
 }
 mkdirSync(join(root,'.local/staging'),{recursive:true});if(!existsSync(zone))writeFileSync(zone,'{}\n');
}
// The local CA root is public material; it is exported so API probes and checks can validate certificates.
function exportRoot(){const pem=docker([...stagingCompose,'exec','-T','caddy','cat','/data/caddy/pki/authorities/local/root.crt'],{capture:true,timeout:60000});if(!pem.includes('BEGIN CERTIFICATE'))throw new Error('Certificado raiz local indisponível.');writeFileSync(join(root,'.local/staging/caddy-root.crt'),pem);}
const action=process.argv[2];
if(import.meta.filename===process.argv[1]){
 try{
  if(action==='up'){prepare();docker([...stagingCompose,'up','--build','-d','--wait','--wait-timeout','240','web','worker','caddy','mailpit','offsite'],{timeout:1200000});
   for(let i=0;i<30;i++){try{exportRoot();break;}catch(e){if(i===29)throw e;await new Promise(r=>setTimeout(r,2000));}}
   console.log('Homologação LOCAL (SIMULADA) no ar:\n  Loja/painel via HTTPS local: https://localhost:8443 (aceite a autoridade local do Caddy no navegador)\n  E-mails capturados (Mailpit): http://localhost:8025\n  HTTP direto: http://localhost:3900');}
  else if(action==='check'){prepare();exportRoot();docker([...stagingCompose,'run','--rm','--no-deps','tests','node','--test','tests/staging-check.mjs'],{timeout:900000});
   copyFileSync(join(root,'artifacts/staging.json'),join(root,'docs/execucao/evidencias/fase-4/staging.simulado.json'));console.log('Evidência: docs/execucao/evidencias/fase-4/staging.simulado.json');}
  else if(action==='pilot'){prepare();docker([...stagingCompose,'run','--rm','--no-deps','tests','node','--test','tests/pilot-simulation.mjs'],{timeout:900000});
   copyFileSync(join(root,'artifacts/pilot-simulation.json'),join(root,'docs/execucao/evidencias/fase-5/observacoes.simulado.json'));console.log('Evidência: docs/execucao/evidencias/fase-5/observacoes.simulado.json');}
  else if(action==='down')docker([...stagingCompose,'stop'],{timeout:180000});
  else{console.error('Uso: node scripts/staging.mjs up|check|pilot|down');process.exitCode=2;}
 }catch(error){console.error(error.message);process.exitCode=error.exitCode||1;}
}
void command;
