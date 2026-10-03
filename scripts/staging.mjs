// Local staging with fictitious external substitutes. Everything it produces is labelled SIMULADO.
//   node scripts/staging.mjs up | check | pilot | edge | down
import { randomBytes } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
 // Keys introduced after the first staging run are appended, never regenerated.
 const current=readFileSync(env,'utf8');for(const [k,v] of Object.entries({PLATFORM_HOST:'lojas.demo.test',EDGE_PROXY_SECRET:randomBytes(32).toString('hex')}))if(!new RegExp(`^${k}=`,'m').test(current))appendFileSync(env,`${k}=${v}\n`);
 mkdirSync(join(root,'.local/staging'),{recursive:true});if(!existsSync(zone))writeFileSync(zone,'{}\n');
}
// The local CA root is public material; it is exported so API probes and checks can validate certificates.
function exportRoot(){const pem=docker([...stagingCompose,'exec','-T','caddy','cat','/data/caddy/pki/authorities/local/root.crt'],{capture:true,timeout:60000});if(!pem.includes('BEGIN CERTIFICATE'))throw new Error('Certificado raiz local indisponível.');writeFileSync(join(root,'.local/staging/caddy-root.crt'),pem);}
// R3 (revisão 0179f4): the effective production configuration (compose.yaml + compose.production.yaml) is rendered — nothing
// is created — and must hand PLATFORM_HOST to web, API and Caddy, the edge secret to API and Caddy, and no published web port.
// The production Caddyfile (same sites.caddy as staging) is validated by Caddy itself.
function productionConfig(){
 const file=join(root,'.local/staging/production-config.env'),host='plataforma.exemplo.test';
 const base=readFileSync(env,'utf8').split('\n').filter(l=>!/^(APP_ENV|NODE_ENV|PUBLIC_ORIGIN|PLATFORM_HOST|LOCAL_MAILBOX)=/.test(l)).join('\n');
 const render=content=>{writeFileSync(file,content,{mode:0o600});return docker(['compose','--project-name','ecommerce-production-config','--env-file',file,'-f','compose.yaml','-f','compose.production.yaml','--profile','production','config','--format','json'],{capture:true,timeout:60000});};
 const cfg=JSON.parse(render(`${base}\nAPP_ENV=production\nNODE_ENV=production\nLOCAL_MAILBOX=false\nPUBLIC_ORIGIN=https://${host}\nPLATFORM_HOST=${host}\n`)),svc=cfg.services,result={};
 for(const name of ['web','api','caddy'])if(svc[name]?.environment?.PLATFORM_HOST!==host)throw new Error(`Produção: PLATFORM_HOST ausente em ${name}.`);
 const secret=svc.api.environment.EDGE_PROXY_SECRET;if(!secret||secret.length<32||svc.caddy.environment.EDGE_PROXY_SECRET!==secret)throw new Error('Produção: segredo da borda ausente/diferente entre API e Caddy.');
 if((svc.web.ports||[]).length)throw new Error('Produção: web não pode publicar porta (somente via borda).');
 if(!svc.caddy.volumes.some(v=>String(v.target)==='/etc/caddy/sites.caddy'))throw new Error('Produção: sites.caddy não montado no Caddy.');
 result.platformHost='web, api e caddy';result.edgeSecret='api = caddy (valor omitido)';result.webPorts=0;
 let refused=false;try{render(`${base}\nAPP_ENV=production\nPUBLIC_ORIGIN=https://${host}\n`);}catch{refused=true;}if(!refused)throw new Error('Produção sem PLATFORM_HOST deveria ser recusada.');result.withoutPlatformHost='recusada';
 docker(['run','--rm','-e',`PLATFORM_HOST=${host}`,'-e',`EDGE_PROXY_SECRET=${secret}`,'-v',`${join(root,'infra')}:/etc/caddy:ro`,'caddy:2.10.2-alpine','caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],{capture:true,timeout:120000});result.caddyValidate='ok';
 writeFileSync(file,'');return result;}
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
  else if(action==='edge'){prepare();exportRoot();const production=productionConfig();console.log('✔ R3: configuração efetiva de produção',JSON.stringify(production));
   command(process.execPath,['--test','tests/edge-check.mjs'],{timeout:300000,env:{...process.env,CLIENT:'A',APP_ENV:'staging',EDGE_HOST:'127.0.0.1',EDGE_PORT:'8443',CA_FILE:join(root,'.local/staging/caddy-root.crt'),ARTIFACTS:join(root,'artifacts')}});
   docker([...stagingCompose,'run','--rm','--no-deps','-e','CLIENT=B','tests','node','--test','tests/edge-check.mjs'],{timeout:600000});
   const report={mode:'LOCAL',note:'Caminho borda → web → API no staging local; certificados da autoridade local, não públicos.',production,clients:['a','b'].map(r=>JSON.parse(readFileSync(join(root,`artifacts/edge-${r}.json`),'utf8'))),completedAt:new Date().toISOString()};
   report.passed=report.clients.every(c=>c.passed);mkdirSync(join(root,'docs/execucao/evidencias/revisao-0179f4'),{recursive:true});writeFileSync(join(root,'docs/execucao/evidencias/revisao-0179f4/borda.json'),JSON.stringify(report,null,2)+'\n');console.log('Evidência: docs/execucao/evidencias/revisao-0179f4/borda.json');}
  else if(action==='down')docker([...stagingCompose,'stop'],{timeout:180000});
  else{console.error('Uso: node scripts/staging.mjs up|check|pilot|edge|down');process.exitCode=2;}
 }catch(error){console.error(error.message);process.exitCode=error.exitCode||1;}
}
