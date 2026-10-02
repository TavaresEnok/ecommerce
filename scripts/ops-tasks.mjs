// Runs inside the worker image (app_user + S3 credentials). Operator entry point: node scripts/ops.mjs.
import { createDatabase, newId, sql, withTenant } from '@ecommerce/database';
import { alerts, applyErasure, operationRoutes, pilotReport, postRestore, recordSupportTime, tenantStatus } from '@ecommerce/purchase';
import { getObject, listKeys } from '@ecommerce/media';
const args=process.argv.slice(2),flag=name=>args.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('='),positional=args.filter(a=>!a.startsWith('--'));
const [command,...rest]=positional,uuid=/^[0-9a-f-]{36}$/i;
function database(){const url=new URL(process.env.DATABASE_URL||'');const name=flag('database');if(name){if(!/^ecommerce(_restore)?$/.test(name))throw new Error('Banco não permitido.');url.pathname=`/${name}`;}return createDatabase(url.toString(),2);}
export async function reapplyErasures(db){const keys=await listKeys('privacy-ledger/');let applied=0;for(const key of keys){const entry=JSON.parse((await getObject(key)).toString('utf8'));if(!uuid.test(entry.tenant_id)||!uuid.test(entry.order_id))continue;
 const found=await withTenant(db,entry.tenant_id,null,async tx=>{const r=await tx.execute(sql`select id from shop.orders where id=${entry.order_id}`);if(!r.rowCount)return false;await applyErasure(tx,entry.order_id);return true;});if(found)applied++;}return {ledger:keys.length,applied};}
export async function lifecycle(db,tenant,action,reason){if(!uuid.test(tenant)||!reason)throw new Error('Informe tenant e motivo.');return withTenant(db,tenant,null,async tx=>{
 const update={SUSPENDED:sql`update shop.tenants set lifecycle_status='SUSPENDED' where id=${tenant}`,REACTIVATED:sql`update shop.tenants set lifecycle_status='ACTIVE' where id=${tenant} and lifecycle_status='SUSPENDED'`,SALES_RESUMED:sql`update shop.tenants set sales_paused_at=null,sales_pause_reason=null where id=${tenant}`}[action];
 const result=await tx.execute(update);if(!result.rowCount)throw new Error('Loja não encontrada ou em estado incompatível.');await tx.execute(sql`insert into shop.tenant_lifecycle_events(id,tenant_id,action,reason,actor) values(${newId()},${tenant},${action},${reason},'OPERATOR')`);return {tenant,action};});}
if(import.meta.filename===process.argv[1]){
 const db=database();
 try{let out;
  if(command==='status'){out=[];for(const {tenant_id} of await operationRoutes(db)){const s=await tenantStatus(db,tenant_id);out.push({...s,alerts:alerts(s)});}}
  else if(command==='suspend')out=await lifecycle(db,rest[0],'SUSPENDED',rest.slice(1).join(' '));
  else if(command==='reactivate')out=await lifecycle(db,rest[0],'REACTIVATED',rest.slice(1).join(' '));
  else if(command==='resume-sales')out=await lifecycle(db,rest[0],'SALES_RESUMED',rest.slice(1).join(' '));
  else if(command==='post-restore'){out=[];const reason=rest.join(' ')||'Restauração: conciliação pendente';for(const {tenant_id} of await operationRoutes(db))out.push({tenant_id,...await postRestore(db,tenant_id,reason)});}
  else if(command==='reapply-erasures')out=await reapplyErasures(db);
  else if(command==='pilot-report'){const to=flag('to')?new Date(flag('to')):new Date(),from=flag('from')?new Date(flag('from')):new Date(to.getTime()-7*86400000);if(isNaN(+from)||isNaN(+to)||from>=to)throw new Error('Período inválido.');const only=flag('tenant');out=[];for(const {tenant_id} of await operationRoutes(db))if(!only||only===tenant_id)out.push(await pilotReport(db,tenant_id,from,to));}
  else if(command==='support-time'){const [tenant,minutes,category,...note]=rest;if(!uuid.test(tenant||''))throw new Error('Informe tenant.');out=await recordSupportTime(db,tenant,Number(minutes),String(category).toUpperCase(),note.join(' '),'OPERATOR');}
  else {console.error('Uso: status | suspend <tenant> <motivo> | reactivate <tenant> <motivo> | resume-sales <tenant> <motivo> | post-restore [motivo] | reapply-erasures | pilot-report [--from=AAAA-MM-DD] [--to=AAAA-MM-DD] [--tenant=id] | support-time <tenant> <minutos> <categoria> <nota sem dados pessoais>  [--database=ecommerce_restore]');process.exitCode=2;}
  if(out)console.log(JSON.stringify(out,null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}finally{await db.pool.end();}
}
