// Grants/revokes the platform administrator role. The application role cannot do this; only the operator with the
// migration credential, from the host:  node scripts/platform-admin.mjs grant|revoke <email> "<motivo>" [--test]
import pg from 'pg';
const args=process.argv.slice(2).filter(a=>a!=='--test'),[action,email,...why]=args,reason=why.join(' ');
export async function setPlatformAdmin(url,action,email,reason){if(!['grant','revoke'].includes(action)||!/^[^\s@]+@[^\s@]+$/.test(email||'')||reason.length<3)throw Object.assign(new Error('Uso: grant|revoke <email> "<motivo>"'),{exitCode:2});
 const client=new pg.Client({connectionString:url});await client.connect();try{const {rows:[user]}=await client.query('select id from access.users where email=$1 and verified_at is not null',[email.toLowerCase()]);if(!user)throw new Error('Usuário verificado não encontrado.');
  if(action==='grant')await client.query("insert into access.platform_admins(user_id,granted_by) values($1,$2) on conflict(user_id) do update set revoked_at=null,granted_by=excluded.granted_by,granted_at=now()",[user.id,`OPERATOR: ${reason}`]);
  else await client.query('update access.platform_admins set revoked_at=now() where user_id=$1',[user.id]);
  return {email:email.toLowerCase(),action};}finally{await client.end();}}
if(import.meta.filename===process.argv[1]){
 if(process.env.MIGRATION_DATABASE_URL){setPlatformAdmin(process.env.MIGRATION_DATABASE_URL,action,email,reason).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exit(e.exitCode||1);});}
 else{const {composeArgs,docker}=await import('./compose.mjs');try{docker([...composeArgs(process.argv.includes('--test')),'run','--rm','--no-deps','migrate','node','scripts/platform-admin.mjs',action,email,...why],{timeout:120000});}catch(e){console.error(e.message);process.exit(e.exitCode||1);}}
}
