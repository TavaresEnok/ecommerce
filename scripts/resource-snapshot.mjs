// Observed resource usage of one Compose project: container CPU/memory, database size and WAL archive.
// Used for pilot cost observation (Fase 5) and the capacity rehearsal (T33). Prints JSON; never prints secrets.
import { composeArgs, docker } from './compose.mjs';
export function snapshot(test=process.argv.includes('--test')){
 const compose=composeArgs(test),project=compose[compose.indexOf('--project-name')+1];
 const stats=docker(['stats','--no-stream','--format','{{json .}}'],{capture:true,timeout:60000}).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(s=>s.Name.startsWith(`${project}-`)).map(s=>({service:s.Name.replace(`${project}-`,'').replace(/-\d+$/,''),cpu:s.CPUPerc,memory:s.MemUsage,memory_percent:s.MemPerc,network:s.NetIO,block:s.BlockIO}));
 const psql=q=>docker([...compose,'exec','-T','postgres','psql','-q','-U','postgres','-d','ecommerce','-tAc',q],{capture:true,timeout:30000}).trim();
 let database=null;try{database={bytes:Number(psql("select pg_database_size('ecommerce')")),connections:Number(psql('select count(*) from pg_stat_activity')),wal_archive_bytes:Number(docker([...compose,'exec','-T','postgres','sh','-c','du -sb /var/lib/postgresql/wal-archive | cut -f1'],{capture:true,timeout:30000}).trim()||0),archiver_failed:Number(psql('select failed_count from pg_stat_archiver'))};}catch{database={error:'PostgreSQL indisponível'};}
 return {project,at:new Date().toISOString(),containers:stats,database};
}
if(import.meta.filename===process.argv[1]){try{console.log(JSON.stringify(snapshot(),null,2));}catch(error){console.error(error.message);process.exit(error.exitCode||1);}}
