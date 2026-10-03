import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
export const root = resolve(import.meta.dirname,'..');
export function composeArgs(test=false) {
  // The capacity rehearsal (T33) runs in its own project so its raised rate limit never affects verification stacks.
  if(test&&process.env.VERIFY_PHASE==='capacity')return ['compose','--project-name','ecommerce-capacity-test','--env-file','.local/test.env','-f','compose.yaml','-f','compose.test.yaml','-f','compose.capacity.test.yaml'];
  const phase=Number(process.env.VERIFY_PHASE||1);
  return ['compose','--project-name',test?`ecommerce-phase${phase}-test`:'ecommerce-foundation','--env-file',test?'.local/test.env':'.env','-f','compose.yaml',...(test?['-f','compose.test.yaml',...(phase>=2?['-f',`compose.phase${phase}.test.yaml`]:[])]:[])];
}
export function command(program,args,{timeout=180000,capture=false,env}={}) {
  const result=spawnSync(program,args,{cwd:root,timeout,env:env||process.env,stdio:capture?'pipe':'inherit',encoding:'utf8',windowsHide:true,maxBuffer:256*1024*1024});
  if(result.error) throw Object.assign(new Error(result.error.code==='ETIMEDOUT'?'Tempo limite excedido.':`Não foi possível executar ${program} (${result.error.code}).`),{exitCode:result.error.code==='ETIMEDOUT'?1:2});
  if(result.status!==0) throw Object.assign(new Error(`Falha em ${program} (código ${result.status}). ${capture?'Consulte a disponibilidade do serviço.':''}`),{exitCode:1});
  return result.stdout||'';
}
export const docker=(args,options)=>command('docker',args,options);
