// T33 orchestrator: isolated project, synthetic dataset, open-loop load with resource sampling, invariants and summary.
//   node scripts/capacity.mjs [--quick]     (quick: 1+3+1 min; default: 1 min frio + 30 min a 20 rps + 5 min a 40 rps)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeArgs, docker, root } from './compose.mjs';
process.env.VERIFY_PHASE='capacity';
import { snapshot } from './resource-snapshot.mjs';
const quick=process.argv.includes('--quick'),compose=composeArgs(true),phases=quick?[{name:'frio',rps:20,seconds:60},{name:'sustentado',rps:20,seconds:180},{name:'pico',rps:40,seconds:60}]:[{name:'frio',rps:20,seconds:60},{name:'sustentado',rps:20,seconds:1800},{name:'pico',rps:40,seconds:300}];
const run=(...args)=>docker([...compose,'run','--rm','--no-deps','-e',`CAPACITY_PHASES=${JSON.stringify(phases)}`,'tests','node','tests/capacity.mjs',...args],{timeout:7200000});
const summary={test:'T33',quick,phases,startedAt:new Date().toISOString(),environment:{project:'ecommerce-capacity-test',host:'Docker Desktop (Windows), ~4 GB para o Docker',limits:'por serviço conforme compose.yaml (api/web/worker/postgres 1 CPU e 768 MB)',gateway:'SIMULADO, 300 ms de latência e 2% de erro na emissão/consulta',rateLimit:'limite por IP elevado só neste projeto (cliente único)'},resources:[],passed:false};
try{
 docker([...compose,'down','--volumes','--remove-orphans'],{timeout:180000});
 docker([...compose,'build','tests','api','postgres'],{timeout:900000});
 docker([...compose,'up','-d','--wait','--wait-timeout','180','web','worker'],{timeout:300000});
 console.log('Semeando 10 lojas × 100 produtos × ~5 variações…');run('seed');
 // Cold start: restart API so the in-memory storefront cache is empty when the first phase begins.
 docker([...compose,'restart','api'],{timeout:120000});docker([...compose,'up','-d','--wait','--wait-timeout','120','api'],{timeout:180000});
 summary.resources.push({moment:'antes da carga',...snapshot(true)});
 const sampler=setInterval(()=>{try{summary.resources.push({moment:'durante',...snapshot(true)});}catch{}},60000);
 await new Promise((resolve,reject)=>{const child=spawn('docker',[...compose,'run','--rm','--no-deps','-e',`CAPACITY_PHASES=${JSON.stringify(phases)}`,'tests','node','tests/capacity.mjs','load'],{cwd:root,stdio:'inherit',windowsHide:true});child.on('exit',code=>code===0?resolve():reject(new Error(`Carga terminou com código ${code}`)));});
 clearInterval(sampler);summary.resources.push({moment:'após a carga',...snapshot(true)});
 await new Promise(r=>setTimeout(r,30000));run('invariants');
 const load=JSON.parse(readFileSync(join(root,'artifacts/capacity-load.json'),'utf8')),inv=JSON.parse(readFileSync(join(root,'artifacts/capacity-invariants.json'),'utf8'));
 const reads=Object.entries(load.latency).filter(([k])=>/:leitura:/.test(k)&&!k.startsWith('frio')),checkout=Object.entries(load.latency).filter(([k])=>k.endsWith(':escrita:checkout'));
 const total=Object.values(load.latency).reduce((n,v)=>n+v.n,0),internal=Object.values(load.latency).reduce((n,v)=>n+v.error5xx+v.network+v.error4xx,0);
 summary.targets={publicReadP95Ms:{target:500,observed:Math.max(...reads.map(([,v])=>v.p95))},checkoutP95Ms:{target:2000,observed:Math.max(...checkout.map(([,v])=>v.p95))},unexpectedFailurePercent:{target:1,observed:Math.round(internal/total*10000)/100},invariants:{violations:inv.violationCount,lastUnitWinners:inv.contention?.won}};
 summary.load={requests:total,dropped:load.dropped,latency:load.latency,phases:load.phases};summary.external={gatewayEmissionMs:inv.gatewayEmissionMs,note:'Tempo de emissão pelo worker inclui a latência simulada; mostrado à parte da métrica interna.'};summary.orders={created:inv.orders,paid:inv.paid,unpaid:inv.unpaid};
 summary.passed=summary.targets.publicReadP95Ms.observed<=500&&summary.targets.checkoutP95Ms.observed<=2000&&summary.targets.unexpectedFailurePercent.observed<1&&inv.passed&&load.dropped===0;
 summary.limitations=['Ambiente não equivalente à VM alvo (8c/16 GB): Docker Desktop com ~4 GB e cliente de carga na mesma máquina.','Gateway e e-mail simulados; nenhuma API externa recebeu carga.','Pagamentos não foram aprovados durante a carga; a baixa sob aprovação é coberta por T14/T16 e pelo fluxo T27.',...(quick?['Execução reduzida (--quick): não substitui os 30 + 5 minutos do ensaio completo.']:[])];
}catch(error){summary.error=error.message;console.error(error.message);process.exitCode=1;}
finally{summary.finishedAt=new Date().toISOString();mkdirSync(join(root,'artifacts'),{recursive:true});writeFileSync(join(root,'artifacts/capacity.json'),JSON.stringify(summary,null,1));console.log(JSON.stringify({passed:summary.passed,targets:summary.targets,error:summary.error}));if(!summary.passed&&!process.exitCode)process.exitCode=1;}
