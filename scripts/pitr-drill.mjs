// Point-in-time recovery drill: physical base backup + archived WAL restored into a clean, throwaway container.
// Only the isolated test project is accepted; production recovery follows docs/operacao/restauracao.md.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeArgs, docker, root } from './compose.mjs';
if(!process.argv.includes('--test')){console.error('Uso: node scripts/pitr-drill.mjs --test (somente projeto de teste isolado).');process.exit(2);}
process.env.VERIFY_PHASE||='4';
const compose=composeArgs(true),project=compose[compose.indexOf('--project-name')+1],archive=`${project}_pg-wal-archive`,drill=`${project}-pitr-drill`;
const psql=(sqlText,db='ecommerce')=>docker([...compose,'exec','-T','postgres','psql','-q','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-tAc',sqlText],{capture:true,timeout:60000}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={passed:false,environment:project,startedAt:new Date().toISOString(),method:'pg_basebackup (tar) + archive_command em volume local + recovery_target_time',steps:[]};
try{
 if(psql('show archive_mode')!=='on')throw Object.assign(new Error('archive_mode desligado no PostgreSQL de teste.'),{exitCode:2});
 psql("create schema if not exists drill; create table if not exists drill.markers(id serial primary key,label text not null,at timestamptz not null default clock_timestamp())");
 docker([...compose,'exec','-T','postgres','sh','-ec','rm -rf /var/lib/postgresql/wal-archive/base && pg_basebackup -U postgres -D /var/lib/postgresql/wal-archive/base -Ft -z -X fetch --checkpoint=fast'],{timeout:180000});
 report.steps.push({step:'base backup físico',at:new Date().toISOString()});
 // RPO probe: commit without forcing a WAL switch and observe how long archive_timeout takes to ship it.
 const probe=psql("insert into drill.markers(label) values('rpo-probe') returning to_char(at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')");
 let archivedAt='';for(let i=0;i<180&&!archivedAt;i++){const last=psql(`select coalesce(to_char(last_archived_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'') from pg_stat_archiver where last_archived_time>'${probe}'::timestamptz`);if(last)archivedAt=last;else await sleep(1000);}
 if(!archivedAt)throw new Error('WAL não arquivado dentro de 180 s.');
 report.rpoObservedSeconds=Math.round((Date.parse(archivedAt)-Date.parse(probe))/100)/10;report.archiveTimeoutSeconds=60;
 const ordersAtTarget=Number(psql('select count(*) from shop.orders'));psql("insert into drill.markers(label) values('before-target')");await sleep(1500);
 const target=psql("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US')||'+00'");await sleep(1500);
 psql("insert into drill.markers(label) values('after-target')");const segment=psql('select pg_walfile_name(pg_switch_wal())');
 for(let i=0;i<60;i++){if(psql(`select coalesce(last_archived_wal,'')>='${segment}' from pg_stat_archiver`)==='t')break;await sleep(1000);}
 report.target=target;report.steps.push({step:'marcadores antes/depois do alvo e WAL arquivado',segment});
 // Clean recovery: new container, read-only archive, no access to the original data volume.
 const started=Date.now();try{docker(['rm','-f',drill],{capture:true});}catch{}
 const script=['set -e','export PGDATA=/var/lib/postgresql/pitr','mkdir -p $PGDATA','tar xzf /archive/base/base.tar.gz -C $PGDATA',
  `printf "restore_command = 'cp /archive/%%f %%p'\\nrecovery_target_time = '${target}'\\nrecovery_target_action = 'promote'\\narchive_mode = off\\n" >> $PGDATA/postgresql.auto.conf`,
  'touch $PGDATA/recovery.signal','chown -R postgres:postgres $PGDATA','chmod 700 $PGDATA','exec gosu postgres postgres -D $PGDATA'].join('\n');
 docker(['run','-d','--name',drill,'--network','none','-v',`${archive}:/archive:ro`,'--entrypoint','bash','ecommerce-postgres:17.9','-c',script],{capture:true,timeout:60000});
 let ready=false;for(let i=0;i<120&&!ready;i++){try{ready=docker(['exec',drill,'psql','-U','postgres','-d','ecommerce','-tAc','select not pg_is_in_recovery()'],{capture:true,timeout:10000}).trim()==='t';}catch{}if(!ready)await sleep(1000);}
 if(!ready)throw new Error('Recuperação não concluída em 120 s.');
 report.rtoDrillSeconds=Math.round((Date.now()-started)/100)/10;
 const q=sqlText=>docker(['exec',drill,'psql','-U','postgres','-d','ecommerce','-tAc',sqlText],{capture:true,timeout:10000}).trim();
 const labels=q('select string_agg(label,\',\' order by id) from drill.markers').split(',');
 if(!labels.includes('before-target')||labels.includes('after-target'))throw new Error(`Ponto de recuperação incorreto: ${labels.join(',')}`);
 const restoredOrders=Number(q('select count(*) from shop.orders'));if(restoredOrders!==ordersAtTarget)throw new Error('Pedidos divergentes após PITR.');
 const forced=q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shop' and c.relkind='r' and not c.relforcerowsecurity");if(forced!=='0')throw new Error('RLS ausente após PITR.');
 report.restored={markers:labels,orders:restoredOrders,forceRls:true};report.passed=true;
 report.limitations=['Arquivo WAL e base ficam em volume LOCAL do mesmo host: não protege contra perda da VM. Cópia externa cifrada, retenção de 30 dias e chaves separadas dependem de D04.','RTO medido apenas para banco sintético pequeno; não inclui provisionamento de host, mídia, segredos nem conciliação.','Ferramenta mantida (pgBackRest/WAL-G) com destino externo continua recomendada para produção.'];
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=error.exitCode||1;}
finally{try{docker(['rm','-f',drill],{capture:true});}catch{}report.finishedAt=new Date().toISOString();writeFileSync(join(root,'artifacts/pitr.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,rpoObservedSeconds:report.rpoObservedSeconds,rtoDrillSeconds:report.rtoDrillSeconds}));}
