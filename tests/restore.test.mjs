import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDatabase, rows, sql, withTenant, assertApplicationRole } from '@ecommerce/database';
assert.equal(process.env.APP_ENV,'test');
const url=new URL(process.env.DATABASE_URL);assert.equal(url.pathname,'/ecommerce');url.pathname='/ecommerce_restore';
test('Backup restaurado preserva configurações, vínculos e isolamento como app_user',async()=>{
  const database=createDatabase(url.toString(),1);
  const start=Date.now();
  const fixture=JSON.parse(readFileSync('/app/artifacts/restore-fixture.json','utf8'));
  try{
    await assertApplicationRole(database,'app_user');
    for(const item of fixture)await withTenant(database,item.tenantId,item.userId,async tx=>{
      const settings=await rows(tx,sql`select id,tenant_id,display_name,timezone,updated_by_membership_id from shop.store_settings`);
      assert.equal(settings.length,1);assert.deepEqual(settings[0],item.setting);
      const memberships=await rows(tx,sql`select id,user_id,role,status from shop.tenant_memberships where tenant_id=${item.tenantId} and user_id=${item.userId}`);assert.equal(memberships.length,1);assert.equal(memberships[0].role,'OWNER');
      const other=fixture.find(f=>f.tenantId!==item.tenantId);assert.equal((await rows(tx,sql`select * from shop.store_settings where tenant_id=${other.tenantId}`)).length,0);
      assert.equal((await tx.execute(sql`update shop.store_settings set display_name='Negada' where tenant_id=${other.tenantId}`)).rowCount,0);
    });
    assert.equal((await database.pool.query('select * from shop.store_settings')).rowCount,0);
    const rls=await database.pool.query("select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shop' and c.relkind='r'");for(const row of rls.rows){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);}
    const authUrl=new URL(process.env.AUTH_DATABASE_URL);authUrl.pathname='/ecommerce_restore';const auth=createDatabase(authUrl.toString(),1);
    try{const users=await auth.pool.query('select id,verified_at from access.users where id=any($1::uuid[])',[fixture.map(f=>f.userId)]);assert.equal(users.rowCount,fixture.length);for(const user of users.rows)assert.ok(user.verified_at);}finally{await auth.pool.end();}
    writeFileSync('/app/artifacts/restore.json',JSON.stringify({passed:true,completedAt:new Date().toISOString(),sourceDatabase:'ecommerce',restoredDatabase:'ecommerce_restore',postgresMajor:17,tenantSamples:fixture.length,appRole:'app_user',checks:['configurações preservadas','vínculos preservados','usuários verificados preservados','RLS leitura/escrita','negação sem contexto','ENABLE/FORCE RLS'],checkDurationMs:Date.now()-start,financialReconciliation:'Não aplicável: domínio de pagamentos ausente na Fase 1.'},null,2));
  }finally{await database.pool.end();}
});
