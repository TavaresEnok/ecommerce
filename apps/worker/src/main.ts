import { Worker, Queue } from 'bullmq';
import { assertApplicationRole, createDatabase, newId, rows, sql, withTenant } from '@ecommerce/database';
import { writeFileSync } from 'node:fs';
import { processMedia, reconcileMedia } from '@ecommerce/media';
import { expireAiReservations, billingCycle, SimulatedBillingProvider, resumeRefunds, alerts, consume, deliverNotifications, mailerFromEnv, operationRoutes, processAttempt, processInbox, routes, simulationEnabled, tenantStatus } from '@ecommerce/purchase';
const required = (name: string) => { const value=process.env[name]; if(!value) throw new Error(`Missing ${name}`); return value; };
const database = createDatabase(required('DATABASE_URL'),6);
await assertApplicationRole(database,'app_user');
const redis = new URL(required('REDIS_URL'));
const worker = new Worker('foundation',async job => {
  if (job.name !== 'configuration-check') throw new Error('Unsupported job');
  const {tenantId,userId,resourceId} = job.data;
  return withTenant(database,tenantId,userId,async tx => {
    const [member] = await rows(tx,sql`select id from shop.tenant_memberships where tenant_id=${tenantId} and user_id=${userId} and status='ACTIVE' for share`);
    if(!member) throw new Error('Unauthorized job actor');
    const [setting] = await rows<{id:string;tenant_id:string}>(tx,sql`select id,tenant_id from shop.store_settings where id=${resourceId} and tenant_id=${tenantId}`);
    if(!setting) throw new Error('Resource does not belong to job tenant');
    return { tenantId:setting.tenant_id, resourceId:setting.id, checked:true };
  });
},{connection:{host:redis.hostname,port:Number(redis.port||6379),password:redis.password||undefined,maxRetriesPerRequest:null},concurrency:2});
worker.on('completed',job=>console.log(JSON.stringify({event:'job_completed',operation_id:job.id,tenant_id:job.data.tenantId})));
worker.on('failed',job=>console.error(JSON.stringify({event:'job_failed',operation_id:job?.id,tenant_id:job?.data.tenantId})));
worker.on('error',()=>console.error(JSON.stringify({event:'worker_connection_error'})));
const mediaQueue=new Queue('media',{connection:{host:redis.hostname,port:Number(redis.port||6379),maxRetriesPerRequest:1}});
const mediaWorker=new Worker('media',async job=>{
  const {tenantId,assetId}=job.data;
  if(job.name==='process')return processMedia(database,tenantId,assetId);
  if(job.name==='reconcile'){
    const result=await reconcileMedia(database,tenantId);
    const pending=await withTenant(database,tenantId,null,tx=>rows<{id:string}>(tx,sql`select id from shop.media_assets where status='PENDING' and created_at>now()-interval '24 hours' limit 100`));
    for(const asset of pending)await mediaQueue.add('process',{tenantId,assetId:asset.id},{jobId:`tenant-${tenantId}-${asset.id}-${newId()}`,attempts:3,backoff:{type:'exponential',delay:1000},removeOnComplete:100,removeOnFail:100});
    return result;
  }
  throw new Error('Unsupported media job');
},{connection:{host:redis.hostname,port:Number(redis.port||6379),maxRetriesPerRequest:null},concurrency:1});
mediaWorker.on('error',()=>console.error(JSON.stringify({event:'media_connection_error'})));
mediaWorker.on('failed',job=>console.error(JSON.stringify({event:'media_job_failed',tenant_id:job?.data.tenantId})));
const paymentConnection={host:redis.hostname,port:Number(redis.port||6379),password:redis.password||undefined,maxRetriesPerRequest:null};
const paymentQueue=new Queue('purchase',{connection:{...paymentConnection,maxRetriesPerRequest:1}});
const paymentWorker=new Worker('purchase',async job=>{
 const {tenantId,eventId}=job.data;
 if(job.name!=='outbox')throw new Error('Unsupported purchase job');
 await consume(database,tenantId,eventId);
},{connection:paymentConnection,concurrency:2});
paymentWorker.on('error',()=>console.error(JSON.stringify({event:'payment_connection_error'})));
paymentWorker.on('failed',async job=>{console.error(JSON.stringify({event:'payment_job_failed',tenant_id:job?.data.tenantId}));
 // Exhausted retries stay visible in PostgreSQL with progressive delay; failures>=5 requires administrative reprocessing.
 if(job&&job.attemptsMade>=(job.opts.attempts||1))try{await withTenant(database,job.data.tenantId,null,tx=>tx.execute(sql`update shop.purchase_outbox set failures=failures+1,next_run_at=now()+make_interval(secs=>30*power(2,failures)::int) where id=${job.data.eventId} and executed_at is null`));}catch{console.error(JSON.stringify({event:'outbox_failure_unrecorded'}));}});
let ticking=false;
const paymentTick=setInterval(async()=>{
 if(ticking||!simulationEnabled())return;ticking=true;
 try{for(const {tenant_id:tenantId} of await routes(database)){
  const events=await withTenant(database,tenantId,null,tx=>rows<{id:string}>(tx,sql`select id from shop.purchase_outbox where executed_at is null and next_run_at<=now() and failures<5 order by occurred_at limit 25`));
  for(const e of events){try{await paymentQueue.add('outbox',{tenantId,eventId:e.id},{jobId:`tenant-${tenantId}-${e.id}`,attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:true,removeOnFail:true});await withTenant(database,tenantId,null,tx=>tx.execute(sql`update shop.purchase_outbox set published_at=now() where id=${e.id}`));}catch{console.error(JSON.stringify({event:'outbox_publish_pending',tenant_id:tenantId}));break;}}
  await processInbox(database,tenantId);
  await resumeRefunds(database,tenantId);
  const attempts=await withTenant(database,tenantId,null,tx=>rows<{id:string}>(tx,sql`select a.id from shop.payment_attempts a join shop.orders o on (o.tenant_id,o.id)=(a.tenant_id,a.order_id) where a.next_check_at<=now() or (o.principal_id is null and o.reservation_expires_at<=now() and exists(select 1 from shop.inventory_reservations r where r.order_id=o.id and r.status='ACTIVE')) order by (a.status='PREPARED') desc,a.next_check_at limit 100`));
  // Provider calls run outside transactions; bounded concurrency keeps one slow gateway response from blocking the queue.
  let next=0;await Promise.all(Array.from({length:Math.min(8,attempts.length)},async()=>{while(next<attempts.length){const a=attempts[next++]!;await processAttempt(database,tenantId,a.id);}}));
 }}catch{console.error(JSON.stringify({event:'payment_reconciliation_pending'}));}finally{ticking=false;}
},2000);
const mailer=mailerFromEnv();let operating=false,lastStatus=0;
if(!mailer)console.error(JSON.stringify({event:'mail_provider_not_configured'}));
// Notifications and operational alerts run for every routed tenant, independent of payment simulation.
const opsTick=setInterval(async()=>{
 if(operating)return;operating=true;
 try{const tenants=await operationRoutes(database),report=Date.now()-lastStatus>=60000;const summary=[];
  for(const {tenant_id:tenantId} of tenants){try{const r=await deliverNotifications(database,tenantId,mailer);if(r.sent||r.failed)console.log(JSON.stringify({event:'notifications_delivered',tenant_id:tenantId,sent:r.sent,failed:r.failed}));
   if(report)await expireAiReservations(database,tenantId);
   if(report){const status=await tenantStatus(database,tenantId);summary.push(status);for(const alert of alerts(status))console.error(JSON.stringify({event:'alert',tenant_id:tenantId,...alert}));}}catch{console.error(JSON.stringify({event:'operations_tick_failed',tenant_id:tenantId}));}}
  // SaaS billing covers every store, published or not.
  if(report)for(const {tenant_id:tenantId} of (await database.pool.query('select tenant_id from shop.platform_tenants()')).rows as {tenant_id:string}[]){try{await billingCycle(database,tenantId,simulationEnabled()?new SimulatedBillingProvider(database):null);}catch{console.error(JSON.stringify({event:'billing_cycle_failed',tenant_id:tenantId}));}}
  if(report){lastStatus=Date.now();writeFileSync('/tmp/ops-status.json',JSON.stringify({generated_at:new Date().toISOString(),mail_provider:mailer?.provider||null,tenants:summary}));}
 }catch{console.error(JSON.stringify({event:'operations_tick_failed'}));}finally{operating=false;}
},5000);
const healthQueue = new Queue('foundation', {connection:{host:redis.hostname,port:Number(redis.port||6379),password:redis.password||undefined,maxRetriesPerRequest:1}});
const heartbeat=setInterval(async()=>{
  try { await database.pool.query('select 1'); await healthQueue.getJobCounts('wait'); writeFileSync('/tmp/worker-heartbeat',String(Date.now())); }
  catch { console.error(JSON.stringify({event:'worker_unhealthy'})); }
},5000);
async function shutdown() { clearInterval(heartbeat); clearInterval(paymentTick); clearInterval(opsTick); while(ticking||operating)await new Promise(r=>setTimeout(r,100)); await paymentWorker.close(); await paymentQueue.close(); await worker.close(); await mediaWorker.close(); await mediaQueue.close(); await healthQueue.close(); await database.pool.end(); process.exit(0); }
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
