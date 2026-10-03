import { existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync } from 'node:fs';
import { join,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root,command,composeArgs,docker } from './compose.mjs';
import { evaluateExternal } from './external-evidence.mjs';
const argv=process.argv.slice(2),simulated=argv.includes('--externos-simulados'),args=argv.filter(a=>a!=='--externos-simulados'),match=args.length===1&&/^--phase=([1234567])$/.exec(args[0]);
if(!match){console.error('Uso: node scripts/verify.mjs --phase=1|2|3|4|5|6|7 [--externos-simulados]. Demais fases não implementadas.');process.exit(2);}
const phase=Number(match[1]);process.env.VERIFY_PHASE=String(phase);
// --externos-simulados accepts *.simulado.json stand-ins for external evidence; its result goes to a separate file and never
// overwrites (or counts as) the real verification.
const evidence=join(root,`docs/execucao/evidencias/fase-${phase}/verification${simulated?'.simulado':''}.json`);
mkdirSync(join(root,'artifacts'),{recursive:true});mkdirSync(join(root,`docs/execucao/evidencias/fase-${phase}`),{recursive:true});
// Tested code version: real evidence must reference an ancestor of this HEAD.
const git=(...a)=>spawnSync('git',a,{cwd:root,encoding:'utf8'});const head=git('rev-parse','HEAD').stdout?.trim()||null;
const isAncestor=commit=>Boolean(head)&&git('merge-base','--is-ancestor',commit,'HEAD').status===0;
const summary={phase,specification:'1.1',startedAt:new Date().toISOString(),environment:`ecommerce-phase${phase}-test`,steps:[],exitCode:2,externalHomologation:false,externalMode:simulated?'SIMULADO':'REAL',commit:head,worktreeClean:head?git('status','--porcelain').stdout.trim()==='':null,simulatedExternals:[],realPending:[],limiterWaits:[]};
function digestSources(){const hash=createHash('sha256'),excluded=new Set(['node_modules','dist','.next','.git','.local','artifacts','test-results','playwright-report','.playwright-mcp']);function walk(path){for(const item of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(excluded.has(item.name)||item.name.startsWith('.env')||item.name.endsWith('.tsbuildinfo'))continue;const full=join(path,item.name),rel=relative(root,full).replaceAll('\\','/');if(rel.startsWith('docs/execucao/'))continue;if(item.isDirectory())walk(full);else hash.update(rel).update(readFileSync(full));}}walk(root);return hash.digest('hex');}
function step(name,action){console.log(`\n=== ${name} ===`);const start=Date.now();try{action();summary.steps.push({name,result:'passed',durationMs:Date.now()-start});}catch(error){summary.steps.push({name,result:'failed',durationMs:Date.now()-start});throw error;}}
const missing=message=>Object.assign(new Error(message),{exitCode:2});
// Each phase keeps the essential checks of the previous ones; files listed per phase.
const requiredFiles={1:['package-lock.json','docs/decisoes/fundacao.md','docs/execucao/fase-1.md','docs/backup-e-restore.md','.local/test.env'],2:['docs/execucao/fase-2.md','docs/decisoes/loja-navegavel.md','tests/storefront.test.mjs'],3:['docs/execucao/fase-3.md','docs/decisoes/compra-e-pagamentos.md','docs/api/compra.openapi.yaml','tests/purchase.test.mjs','tests/purchase-worker.test.mjs'],4:['docs/execucao/fase-4.md','docs/decisoes/piloto-operavel.md','docs/api/operacao.openapi.yaml','docs/operacao/atendimento.md','docs/operacao/incidente-financeiro.md','docs/operacao/suspensao.md','docs/operacao/deploy-rollback.md','docs/operacao/restauracao.md','docs/operacao/alertas.md','tests/operations.test.mjs','tests/pilot-flow.test.mjs','scripts/pitr-drill.mjs'],5:['docs/execucao/fase-5.md','docs/operacao/onboarding-lojista.md','docs/operacao/observacao-piloto.md','tests/pilot-observation.test.mjs','scripts/capacity.mjs','tests/capacity.mjs'],6:['docs/execucao/fase-6.md','docs/decisoes/comercial.md','docs/api/comercial.openapi.yaml','docs/operacao/configuracao-comercial.md','tests/commercial.test.mjs','tests/commercial-ui.test.mjs'],7:['docs/execucao/fase-7.md','docs/decisoes/ia.md','docs/api/ia.openapi.yaml','tests/ai.test.mjs']};
const reports={1:['foundation.json','restore.json'],2:['storefront.json','storefront-restore.json'],3:['purchase.json','purchase-worker.json','purchase-restore.json'],4:['operations.json','pilot-flow.json','post-backup.json','recovery.json','pitr.json'],5:['pilot-observation.json'],6:['commercial.json','commercial-ui.json'],7:['ai.json']};
const screenshots={2:['phase2-store','phase2-admin'],3:['phase3-order','phase3-admin'],4:['phase4-contact','phase4-support','phase4-orders','phase4-operation'],6:['phase6-owner','phase6-platform']};
const upTo=table=>Object.entries(table).filter(([p])=>Number(p)<=phase).flatMap(([,v])=>v);
try{
 for(const file of upTo(requiredFiles))if(!existsSync(join(root,file)))throw missing(`Pré-requisito ausente: ${file}. Consulte README/setup.`);
 const env=readFileSync(join(root,'.local/test.env'),'utf8');if(!/^APP_ENV=test$/m.test(env)||!/^NODE_ENV=test$/m.test(env))throw missing('Configuração não identificada como teste.');
 if(phase>=3&&!/^PAYMENT_SIMULATION=true$/m.test(env))throw missing('Fases 3+ exigem PAYMENT_SIMULATION=true no ambiente de teste.');
 if(!/specification|especificação/i.test(readFileSync(join(root,`docs/execucao/fase-${phase}.md`),'utf8')))throw missing('Relatório de fase inválido.');
 step('Contrato de evidências externas (estrutura, modo, ambiente, data, referência e commit)',()=>command(process.execPath,['--test','tests/external-evidence.test.mjs'],{timeout:60000}));
 try{docker(['info','--format','{{.ServerVersion}}'],{capture:true,timeout:15000});}catch{throw missing('Docker Desktop/engine indisponível.');}
// Isolamento entre lotes de suítes. O limite por IP da API (janela fixa de 1 min, em memória) vê todo o tráfego dos testes
// pelo IP do contêiner web (o Next faz o proxy de /api), então um lote herdava a cota consumida pelo anterior (ex.: suítes
// de API gastam ~785 requisições em 20 s e as de interface, logo em seguida, recebiam 429). Antes de cada lote, uma
// requisição pelo mesmo caminho lê x-ratelimit-remaining/reset; se a janela aberta por outro lote ainda vale, espera ela
// vencer. O limite não muda: cada lote continua sujeito a ele por inteiro (a própria consulta conta 1).
function isolateLimiter(files){
 let probe;try{probe=JSON.parse(docker([...compose,'exec','-T','web','node','-e',"fetch('http://localhost:3000/api/health/live').then(r=>console.log(JSON.stringify({limit:+r.headers.get('x-ratelimit-limit'),remaining:+r.headers.get('x-ratelimit-remaining'),reset:+r.headers.get('x-ratelimit-reset')})))"],{timeout:30000,capture:true}).trim());}catch{summary.limiterWaits.push({files,skipped:'web indisponível para a consulta'});return;}
 if(!probe.limit||probe.remaining>=probe.limit-1){summary.limiterWaits.push({files,waitedSeconds:0});return;}
 const seconds=probe.reset+1;console.log(`Isolamento do limitador: janela anterior com ${probe.limit-probe.remaining-1} requisições; aguardando ${seconds}s antes de ${files.join(', ')}`);
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,seconds*1000);summary.limiterWaits.push({files,waitedSeconds:seconds,previousWindowRequests:probe.limit-probe.remaining-1});
}

 const compose=composeArgs(true),run=(files,timeout=300000)=>{isolateLimiter(files);return docker([...compose,'run','--rm','--no-deps','tests','node','--test','--test-concurrency=1',...files],{timeout});};summary.sourceDigest=digestSources();
 for(const file of [...upTo(reports),'phase2-fixture.json','purchase-fixture.json','recovery-fixture.json',...upTo(screenshots).flatMap(s=>[`${s}-390.png`,`${s}-1440.png`])])rmSync(join(root,'artifacts',file),{force:true});
 // Volumes are recreated only for a test project owned by this checkout: containers of the same project name started from
 // another directory (another run/copy) make the verifier stop with code 2 instead of deleting their data.
 const project=compose[compose.indexOf('--project-name')+1];if(!/^ecommerce-(phase\d|capacity)-test$/.test(project))throw missing(`Projeto de teste inesperado: ${project}.`);
 const owners=docker(['ps','-a','--filter',`label=com.docker.compose.project=${project}`,'--format','{{.Label "com.docker.compose.project.working_dir"}}'],{capture:true,timeout:30000}).split('\n').map(s=>s.trim()).filter(Boolean);
 const foreign=[...new Set(owners)].filter(dir=>dir.toLowerCase()!==root.toLowerCase());if(foreign.length)throw missing(`O projeto ${project} pertence a outra execução (${foreign.join(', ')}); nada foi removido. Use outra cópia/nome ou remova manualmente.`);
 summary.isolatedProject=project;
 step('Preparação isolada',()=>docker([...compose,'down','--volumes','--remove-orphans']));
 step('Build em Node LTS',()=>docker([...compose,'build','tests','api','postgres'],{timeout:600000}));
 step('Migrations, S3 privado e saúde',()=>docker([...compose,'up','-d','--wait','--wait-timeout','150','web','worker'],{timeout:240000}));
 step('Tipos',()=>docker([...compose,'run','--rm','--no-deps','tests','npm','run','typecheck'],{timeout:120000}));
 if(phase>=3){
  step(`Fase 3${phase>=4?'+4':''}: núcleo transacional${phase>=4?' e operação do piloto':''} com worker parado`,()=>{docker([...compose,'stop','worker'],{timeout:60000});run(['tests/purchase.test.mjs',...(phase>=4?['tests/operations.test.mjs']:[]),...(phase>=5?['tests/pilot-observation.test.mjs']:[]),...(phase>=6?['tests/commercial.test.mjs']:[]),...(phase>=7?['tests/ai.test.mjs']:[])]);});
  step(`Worker real: T21, interface${phase>=4?' e T27 em duas lojas':''}`,()=>{docker([...compose,'up','-d','--wait','--wait-timeout','90','worker'],{timeout:120000});run(['tests/purchase-worker.test.mjs',...(phase>=4?['tests/pilot-flow.test.mjs']:[]),...(phase>=6?['tests/commercial-ui.test.mjs']:[])]);});
 }
 if(phase>=2)step('Fase 2: catálogo/T22/T23/T37/carrinho/frete e Playwright desktop/móvel',()=>run(['tests/storefront.test.mjs'],240000));
 step('Regressões T01/T02, acesso, worker e UI da fundação',()=>run(['tests/foundation.test.mjs'],240000));
 step('Logs sanitizados',()=>{const logs=docker([...compose,'logs','--no-color','api','worker'],{capture:true,timeout:15000});if(logs.includes('SECRET-LOG-SENTINEL-DO-NOT-LOG')||logs.includes('postgresql://')||logs.includes('password_hash')||(phase>=4&&/acesso=[A-Za-z0-9_-]{20}/.test(logs)))throw new Error('Dado sensível em logs.');if(!logs.includes('request_completed')||!logs.includes('job_completed'))throw new Error('Logs estruturados ausentes.');if(phase>=4&&!logs.includes('"event":"alert"'))throw new Error('Alertas operacionais não emitidos.');});
 if(phase>=2)step('Persistência S3 após reinício local',()=>{docker([...compose,'restart','storage'],{timeout:30000});docker([...compose,'up','-d','--wait','--wait-timeout','60','storage'],{timeout:90000});docker([...compose,'run','--rm','--no-deps','tests','node','scripts/check-storage.mjs'],{timeout:90000});});
 if(phase>=4)step('CLI do operador: status e alertas por loja',()=>{const out=command(process.execPath,['scripts/ops.mjs','status','--test'],{capture:true,timeout:180000});const data=JSON.parse(out.slice(out.indexOf('[')));if(!Array.isArray(data)||!data.some(s=>s.alerts.length))throw new Error('Status operacional sem lojas/alertas.');summary.opsStatus={tenants:data.length,alertCodes:[...new Set(data.flatMap(s=>s.alerts.map(a=>a.code)))].sort()};});
 step('Backup PostgreSQL 17',()=>command(process.execPath,['scripts/backup.mjs','--backup','--test']));
 if(phase>=4)step('Fatos após o backup: pagamentos/devolução e eliminação com ledger externo',()=>run(['tests/post-backup.test.mjs'],120000));
 step('Restore separado',()=>command(process.execPath,['scripts/backup.mjs','--restore-test','--test']));
 step('Conferências após restore',()=>run(['tests/restore.test.mjs',...(phase>=2?['tests/storefront-restore.test.mjs']:[]),...(phase>=3?['tests/purchase-restore.test.mjs']:[]),...(phase>=4?['tests/recovery.test.mjs']:[])],120000));
 if(phase>=4)step('PITR: base física + WAL, recuperação a um ponto no tempo em container limpo (RPO/RTO)',()=>command(process.execPath,['scripts/pitr-drill.mjs','--test'],{timeout:600000}));
 for(const file of upTo(reports)){if(!existsSync(join(root,'artifacts',file)))throw missing(`Evidência obrigatória ausente: ${file}`);const data=JSON.parse(readFileSync(join(root,'artifacts',file),'utf8'));if(!data.passed)throw new Error(`Evidência reprovada: ${file}`);summary[file.replace('.json','')]=data;}
 for(const shot of screenshots[phase]||[])for(const width of [390,1440])if(!existsSync(join(root,`artifacts/${shot}-${width}.png`)))throw missing(`Screenshot obrigatório ausente: ${shot}-${width}.png`);
 // Fase 5+: T33 completo é pré-requisito técnico local.
 if(phase>=5){const cap=join(root,`docs/execucao/evidencias/fase-${phase>=6?6:5}/capacidade.json`);
  if(!existsSync(cap))throw missing('T33 ausente: execute node scripts/capacity.mjs e registre docs/execucao/evidencias/fase-5/capacidade.json.');
  const c=JSON.parse(readFileSync(cap,'utf8'));summary.capacity={passed:c.passed,quick:c.quick,targets:c.targets};if(c.quick)throw missing('T33 registrado apenas na execução reduzida; execute o ensaio completo.');if(!c.passed)throw new Error('T33 reprovado: metas ou invariantes violados.');}
 // Evidências externas obrigatórias (Fases 3+): validadas por conteúdo e vínculo ao commit; ausência/inválida → 2, REPROVADO → 1.
 const ext=evaluateExternal({phase,simulated,root,isAncestor});summary.externalAccepted=ext.accepted;summary.simulatedExternals=ext.simulated.map(s=>s.file);summary.realPending=ext.realPending;summary.externalInvalid=ext.invalid;
 summary.externalHomologation=ext.realPending.length===0&&ext.accepted.length>0;
 if(ext.failed.length)throw new Error(`Homologação externa reprovada: ${ext.failed.join(' | ')}`);
 if(ext.invalid.length||ext.pending.length)throw missing([...ext.invalid.map(i=>`EVIDÊNCIA_INVÁLIDA ${i}`),...ext.pending].join(' '));
 if(phase===2&&summary.storefront.visual.length!==2)throw missing('Evidência visual incompleta.');
 if(digestSources()!==summary.sourceDigest)throw missing('Fonte alterada durante verificação; repita com árvore estável.');summary.exitCode=0;
}catch(error){summary.exitCode=error.exitCode||1;summary.error=error.message;console.error(error.message);}
finally{summary.finishedAt=new Date().toISOString();writeFileSync(evidence,JSON.stringify(summary,null,2)+'\n');console.log(`\nFase ${phase}: código ${summary.exitCode}${simulated?' (externos SIMULADOS — não equivale a homologação real)':''}. Evidência: ${relative(root,evidence).replaceAll('\\','/')}`);if(simulated&&summary.realPending.length)console.log(`Pendências reais mantidas: ${summary.realPending.length}`);process.exitCode=summary.exitCode;}
