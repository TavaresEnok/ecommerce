// Offsite backup + restore drill on the local staging (fictitious external storage). Measures backup time and RTO.
//   node scripts/offsite-drill.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { docker, root } from './compose.mjs';
import { stagingCompose as c } from './staging.mjs';
const work=join(root,'.local/staging/offsite'),report={mode:'SIMULADO (armazenamento externo substituto local)',startedAt:new Date().toISOString(),steps:[],passed:false};
const t0=Date.now(),mark=s=>{report.steps.push({step:s,elapsedSeconds:Math.round((Date.now()-t0)/100)/10});console.log('✔',s);};
const psql=(db,q)=>docker([...c,'exec','-T','postgres','psql','-q','-U','postgres','-d',db,'-tAc',q],{capture:true,timeout:60000}).trim();
try{
 rmSync(work,{recursive:true,force:true});mkdirSync(work,{recursive:true});
 docker([...c,'exec','-T','postgres','sh','-ec','export PGPASSWORD="$BACKUP_DB_PASSWORD"; pg_dump -h 127.0.0.1 -U backup_user -d ecommerce --format=custom --file=/tmp/offsite.dump; tar czf /tmp/wal.tgz -C /var/lib/postgresql/wal-archive .'],{timeout:300000});
 docker([...c,'cp','postgres:/tmp/offsite.dump',join(work,'ecommerce.dump')],{timeout:120000});docker([...c,'cp','postgres:/tmp/wal.tgz',join(work,'wal-archive.tgz')],{timeout:120000});mark('dump lógico + arquivo de WAL gerados');
 const counts=q=>Object.fromEntries(['shop.orders','shop.products','shop.payment_transactions','shop.consumer_requests'].map(t=>[t,Number(psql(q,`select count(*) from ${t}`))]));
 const before=counts('ecommerce');
 const push=docker([...c,'run','--rm','--no-deps','tests','node','scripts/offsite-sync.mjs','push'],{capture:true,timeout:600000});report.push=JSON.parse(push.trim().split('\n').at(-1));mark('cópia cifrada enviada ao armazenamento externo (incl. mídia)');
 rmSync(work,{recursive:true,force:true});mkdirSync(work,{recursive:true});const r0=Date.now();
 const pull=docker([...c,'run','--rm','--no-deps','tests','node','scripts/offsite-sync.mjs','pull'],{capture:true,timeout:600000});report.pull=JSON.parse(pull.trim().split('\n').at(-1));mark('backup externo baixado e decifrado (integridade conferida)');
 docker([...c,'cp',join(work,'restored-ecommerce.dump'),'postgres:/tmp/restored.dump'],{timeout:120000});
 docker([...c,'exec','-T','postgres','sh','-ec','export PGPASSWORD="$MIGRATION_DB_PASSWORD"; dropdb -h 127.0.0.1 -U migration_user --if-exists ecommerce_offsite; createdb -h 127.0.0.1 -U migration_user ecommerce_offsite; pg_restore -h 127.0.0.1 -U migration_user -d ecommerce_offsite --exit-on-error /tmp/restored.dump'],{timeout:300000});
 report.rtoDrillSeconds=Math.round((Date.now()-r0)/100)/10;mark('restaurado em banco limpo a partir da cópia externa');
 const after=counts('ecommerce_offsite');for(const [k,v] of Object.entries(before))if(after[k]!==v)throw new Error(`Divergência em ${k}: ${v} → ${after[k]}`);
 if(psql('ecommerce_offsite',"select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shop' and c.relkind='r' and not c.relforcerowsecurity")!=='0')throw new Error('RLS ausente após restauração.');
 report.counts=after;mark('contagens idênticas e RLS preservado');report.passed=true;
 report.limitations=['Armazenamento "externo" é um segundo contêiner local, não um provedor em outra região (D04).','Chave de cifra no .local/staging.env; em produção ficaria em cofre separado com procedimento de recuperação.','Sem retenção/expiração automática de 30 dias nem compressão do WAL — dependem da ferramenta/provedor escolhidos.'];
}catch(e){report.error=e.message;console.error(e.message);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();mkdirSync(join(root,'docs/execucao/evidencias/fase-4'),{recursive:true});writeFileSync(join(root,'docs/execucao/evidencias/fase-4/backup-externo.simulado.json'),JSON.stringify(report,null,2));}
