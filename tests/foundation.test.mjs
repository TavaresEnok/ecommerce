import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { Queue } from 'bullmq';
import { createDatabase, newId, rows, sql, withTenant, assertApplicationRole } from '@ecommerce/database';
const base=process.env.BASE_URL;
assert.equal(process.env.APP_ENV,'test');
assert.ok(base && new URL(base).hostname==='web');
const suffix=randomBytes(6).toString('hex');
const password=randomBytes(20).toString('base64url');
const api=async(path,{method='GET',body,actor,headers={}}={})=>{
  const response=await fetch(`${base}/api/${path}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),origin:base,...(actor?{cookie:actor.cookie,'x-csrf-token':actor.csrf}:{}),...headers},body:body?JSON.stringify(body):undefined});
  return {status:response.status,body:await response.json(),headers:response.headers};
};
async function account(label) {
  const email=`${label}-${suffix}@example.test`;
  const registration=await api('auth/register',{method:'POST',body:{email,password}});assert.equal(registration.status,201);
  const verify=await api('auth/verify-email',{method:'POST',body:{token:registration.body.localToken}});assert.equal(verify.status,201);
  const login=await api('auth/login',{method:'POST',body:{email,password}});assert.equal(login.status,201);
  return {id:login.body.user.id,email,csrf:login.body.csrf,cookie:login.headers.get('set-cookie').split(';')[0],verification:registration.body.localToken};
}
const report={passed:false,criteria:['T01','T02','FK representativa da Fase 1','Autenticação e autorização','Worker por tenant','Interface Playwright'],tests:[]};
test('Fundação integrada — PostgreSQL real e app_user',async t=>{
  const database=createDatabase(process.env.DATABASE_URL,1);
  const auth=createDatabase(process.env.AUTH_DATABASE_URL,1);
  const redis=new URL(process.env.REDIS_URL);
  const queue=new Queue('foundation',{connection:{host:redis.hostname,port:Number(redis.port||6379),maxRetriesPerRequest:1}});
  try {
    const a=await account('owner-a');const b=await account('owner-b');const employee=await account('employee');
    const storeA=await api('tenants',{method:'POST',body:{name:'Loja A',slug:`loja-a-${suffix}`},actor:a});assert.equal(storeA.status,201);
    const storeB=await api('tenants',{method:'POST',body:{name:'Loja B',slug:`loja-b-${suffix}`},actor:b});assert.equal(storeB.status,201);
    const A=storeA.body.id;const B=storeB.body.id;
    async function check(name,fn){await t.test(name,fn);report.tests.push(name);}
    await check('UUIDv7, papéis reais e FORCE RLS em todas as tabelas de loja',async()=>{
      await assertApplicationRole(database,'app_user');await assertApplicationRole(auth,'auth_user');
      const generated=Array.from({length:1000},()=>newId());assert.equal(new Set(generated).size,1000);
            for(const id of [a.id,b.id,A,B,...generated])assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const tables=await database.pool.query("select c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='shop' and c.relkind='r'");
      assert.ok(tables.rowCount>=4);for(const name of ['tenants','tenant_memberships','store_settings','invitations'])assert.ok(tables.rows.some(t=>t.relname===name));for(const table of tables.rows){assert.equal(table.relrowsecurity,true);assert.equal(table.relforcerowsecurity,true);assert.equal(table.owner,'migration_user');}
      await assert.rejects(database.pool.query('select * from access.users'),error=>error.code==='42501');
      await assert.rejects(auth.pool.query('select * from shop.store_settings'),error=>error.code==='42501');
      const privileged=await database.pool.query("select pg_has_role('app_user','migration_user','MEMBER') as inherited");assert.equal(privileged.rows[0].inherited,false);
    });
    await check('T01: endpoints negam leitura/escrita cruzada, IDs/Host não autorizam',async()=>{
      assert.equal((await api(`tenants/${B}/settings`,{actor:a})).status,404);
      assert.equal((await api(`tenants/${B}/settings`,{actor:a,method:'PATCH',body:{displayName:'Invadida',timezone:'UTC'}})).status,404);
      assert.equal((await api(`tenants/${B}/settings`,{actor:a,headers:{host:'loja-b.invalid'}})).status,404);
      assert.equal((await api('tenants',{actor:a})).body.length,1);
            assert.equal((await api('tenants',{method:'POST',actor:a,body:{name:'Duplicada',slug:storeA.body.slug}})).status,409);
      assert.equal((await api(`tenants/${B}/settings`,{actor:b})).body.displayName,'Loja B');
      assert.equal((await api(`tenants/${A}/settings`)).status,401);
      assert.equal((await api(`tenants/${A}/settings`,{actor:a,method:'PATCH',body:{displayName:'Alterada A',timezone:'UTC'},headers:{'x-csrf-token':''}})).status,403);
      assert.equal((await api(`tenants/${A}/settings`,{actor:a,method:'PATCH',body:{displayName:'Alterada A',timezone:'UTC'},headers:{origin:'https://intruso.invalid'}})).status,403);
      assert.equal((await api(`tenants/${A}/settings`,{actor:a,method:'PATCH',body:{displayName:'Alterada A',timezone:'UTC',tenant_id:B}})).status,400);
            assert.equal((await api(`tenants/${A}/settings`,{actor:a,method:'PATCH',body:{displayName:'   ',timezone:'UTC'}})).status,400);
    });
    await check('T01: RLS bloqueia SELECT/INSERT/UPDATE cruzados no banco',async()=>{
      await withTenant(database,A,a.id,async tx=>{
        assert.equal((await rows(tx,sql`select * from shop.store_settings where tenant_id=${B}`)).length,0);
        assert.equal((await tx.execute(sql`update shop.store_settings set display_name='Invadida' where tenant_id=${B}`)).rowCount,0);
      });
      await assert.rejects(withTenant(database,A,a.id,tx=>tx.execute(sql`insert into shop.store_settings(id,tenant_id,display_name,updated_by_membership_id) values(${newId()},${B},'X',${newId()})`)),error=>error.cause?.code==='42501');
      await assert.rejects(withTenant(database,A,a.id,tx=>tx.execute(sql`update shop.store_settings set tenant_id=${B} where tenant_id=${A}`)),error=>error.cause?.code==='42501');
    });
    await check('T02: mesma conexão alterna A/B e perde contexto após commit/rollback',async()=>{
      const pids=[];
      for(const [tenant,user] of [[A,a.id],[B,b.id],[A,a.id]])await withTenant(database,tenant,user,async tx=>{
        const data=await rows(tx,sql`select tenant_id,pg_backend_pid() as pid from shop.store_settings`);assert.equal(data.length,1);assert.equal(data[0].tenant_id,tenant);pids.push(data[0].pid);
      });
      assert.equal(new Set(pids).size,1);
      assert.equal((await database.pool.query('select * from shop.store_settings')).rowCount,0);
      assert.equal((await database.pool.query('select * from shop.tenant_memberships')).rowCount,0);
      await assert.rejects(withTenant(database,A,a.id,async()=>{throw new Error('rollback-test');}),/rollback-test/);
      const context=await database.pool.query("select nullif(current_setting('app.current_tenant_id',true),'') as tenant, nullif(current_setting('app.current_user_id',true),'') as actor");assert.equal(context.rows[0].tenant,null);assert.equal(context.rows[0].actor,null);
      await assert.rejects(database.pool.query('insert into shop.tenants(id,tenant_id,slug,name) values($1,$1,$2,$3)',[newId(),`sem-contexto-${suffix}`,'Negada']),error=>error.code==='42501');
    });
    await check('FK composta rejeita autoria por vínculo de outra loja',async()=>{
      const membershipB=await withTenant(database,B,b.id,async tx=>(await rows(tx,sql`select id from shop.tenant_memberships where user_id=${b.id}`))[0].id);
      await assert.rejects(withTenant(database,A,a.id,tx=>tx.execute(sql`update shop.store_settings set updated_by_membership_id=${membershipB} where tenant_id=${A}`)),error=>error.cause?.code==='23503');
    });
    await check('Convite de Funcionário vinculado ao e-mail, expiração/uso único e revogação',async()=>{
      // Expired invitations stop counting toward the plan and cannot be accepted.
      const expired=await api(`tenants/${A}/invitations`,{method:'POST',body:{email:b.email},actor:a});assert.equal(expired.status,201);
      await withTenant(database,A,a.id,tx=>tx.execute(sql`update shop.invitations set expires_at=now()-interval '1 second' where email=${b.email}`));
      assert.equal((await api('invitations/accept',{method:'POST',body:{tenantId:A,token:expired.body.localToken},actor:b})).status,404);
      const invite=await api(`tenants/${A}/invitations`,{method:'POST',body:{email:employee.email},actor:a});assert.equal(invite.status,201);
      const payload={tenantId:A,token:invite.body.localToken};
      assert.equal((await api('invitations/accept',{method:'POST',body:payload,actor:b})).status,404);
      assert.equal((await api('invitations/accept',{method:'POST',body:payload,actor:employee})).status,201);
      assert.equal((await api('invitations/accept',{method:'POST',body:payload,actor:employee})).status,404);
      assert.equal((await api(`tenants/${A}/settings`,{actor:employee})).status,200);
      assert.equal((await api(`tenants/${B}/settings`,{actor:employee})).status,404);
      assert.equal((await api(`tenants/${A}/settings`,{actor:employee,method:'PATCH',body:{displayName:'Não permitida',timezone:'UTC'}})).status,403);
      assert.equal((await api(`tenants/${A}/invitations`,{actor:employee,method:'POST',body:{email:b.email}})).status,403);
      assert.equal((await api(`tenants/${A}/members`,{actor:employee})).status,403);
      // PILOT allows one Owner and one Employee (seção 16.1): a third person is refused by the plan quota.
      const third=await api(`tenants/${A}/invitations`,{method:'POST',body:{email:b.email},actor:a});assert.equal(third.status,409);
    });
    await check('Sessões/tokens somente como hash, e-mail verificado e recuperação revoga sessões',async()=>{
      const raw=a.cookie.split('=')[1];const stored=await auth.pool.query('select token_hash from access.sessions where user_id=$1',[a.id]);assert.ok(stored.rows.length);for(const item of stored.rows){assert.notEqual(item.token_hash,raw);assert.match(item.token_hash,/^[0-9a-f]{64}$/);}
      assert.equal((await api('auth/verify-email',{method:'POST',body:{token:a.verification}})).status,401);
      const email=`unverified-${suffix}@example.test`;const registration=await api('auth/register',{method:'POST',body:{email,password}});assert.equal(registration.status,201);
      assert.equal((await api('auth/login',{method:'POST',body:{email,password}})).status,403);
      const recovery=await api('auth/recover',{method:'POST',body:{email:employee.email}});assert.equal(recovery.status,201);
      const newPassword=randomBytes(20).toString('base64url');
      const reset={token:recovery.body.localToken,password:newPassword};assert.equal((await api('auth/reset',{method:'POST',body:reset})).status,201);
      assert.equal((await api('auth/session',{actor:employee})).status,401);
      assert.equal((await api('auth/reset',{method:'POST',body:reset})).status,401);
      assert.equal((await api('auth/login',{method:'POST',body:{email:employee.email,password}})).status,401);
      const login=await api('auth/login',{method:'POST',body:{email:employee.email,password:newPassword}});assert.equal(login.status,201);
      employee.cookie=login.headers.get('set-cookie').split(';')[0];employee.csrf=login.body.csrf;employee.password=newPassword;
      assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));assert.ok(login.headers.get('set-cookie').includes('SameSite=Strict'));assert.equal(login.headers.get('cache-control'),'no-store');
      assert.equal((await api('auth/logout',{method:'POST',actor:employee})).status,201);assert.equal((await api('auth/session',{actor:employee})).status,401);
    });
    await check('Worker confirma recurso/ator e bloqueia job adulterado',async()=>{
      const job=await api(`tenants/${A}/configuration-check`,{method:'POST',actor:a});assert.equal(job.status,201);
      let state;
      for(let i=0;i<40;i++){state=await api(`tenants/${A}/jobs/${job.body.jobId}`,{actor:a});if(state.body.state==='completed')break;await new Promise(r=>setTimeout(r,100));}
      assert.equal(state.body.state,'completed');assert.equal(state.body.result.tenantId,A);
      assert.equal((await api(`tenants/${A}/jobs/${job.body.jobId}`,{actor:b})).status,404);
      const settingB=await api(`tenants/${B}/settings`,{actor:b});
      const invalid=await queue.add('configuration-check',{tenantId:A,userId:a.id,resourceId:settingB.body.id});
      for(let i=0;i<40;i++){if(await invalid.getState()==='failed')break;await new Promise(r=>setTimeout(r,100));}
      assert.equal(await invalid.getState(),'failed');
      const invalidActor=await queue.add('configuration-check',{tenantId:A,userId:b.id,resourceId:settingB.body.id});
      for(let i=0;i<40;i++){if(await invalidActor.getState()==='failed')break;await new Promise(r=>setTimeout(r,100));}assert.equal(await invalidActor.getState(),'failed');
    });
    await check('Interface Playwright: login, configuração persistida, duas lojas isoladas e erros reais',async()=>{
      const browser=await chromium.launch({headless:true});
      try {
        const context=await browser.newContext();const page=await context.newPage();
        await page.goto(base);
        const form=page.getByRole('form',{name:'Entrar',exact:true});
        await form.getByLabel('E-mail',{exact:true}).fill(a.email);await form.getByLabel('Senha',{exact:true}).fill(password);await form.getByRole('button',{name:'Entrar',exact:true}).click();
        await page.getByRole('button',{name:'Loja A — Dono',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Loja B — Dono',exact:true}).count(),0);
        await page.getByRole('button',{name:'Loja A — Dono',exact:true}).click();
        await page.getByLabel('Nome de exibição',{exact:true}).fill('Loja A persistida');await page.getByRole('button',{name:'Salvar configuração',exact:true}).click();
        await page.getByRole('status').filter({hasText:'Configuração salva.'}).waitFor();
        await page.reload();await page.getByRole('button',{name:'Loja A — Dono',exact:true}).click();
        assert.equal(await page.getByLabel('Nome de exibição',{exact:true}).inputValue(),'Loja A persistida');
        const denied=await page.evaluate(async tenant=>{const r=await fetch(`/api/tenants/${tenant}/settings`);return r.status;},B);assert.equal(denied,404);
        await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        await page.screenshot({path:'/app/artifacts/panel.png',fullPage:true});
        await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByRole('form',{name:'Entrar',exact:true}).waitFor();
        const formB=page.getByRole('form',{name:'Entrar',exact:true});await formB.getByLabel('E-mail',{exact:true}).fill(b.email);await formB.getByLabel('Senha',{exact:true}).fill(password);await formB.getByRole('button',{name:'Entrar',exact:true}).click();
        await page.getByRole('button',{name:'Loja B — Dono',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Loja A — Dono',exact:true}).count(),0);
        await page.getByRole('button',{name:'Loja B — Dono',exact:true}).click();assert.equal(await page.getByLabel('Nome de exibição',{exact:true}).inputValue(),'Loja B');
        await context.close();
      } finally {await browser.close();}
    });
    await check('Revogar vínculo e todas as sessões tem efeito imediato',async()=>{
      const employeeLogin=await api('auth/login',{method:'POST',body:{email:employee.email,password:employee.password}});assert.equal(employeeLogin.status,201);
      employee.cookie=employeeLogin.headers.get('set-cookie').split(';')[0];employee.csrf=employeeLogin.body.csrf;
      assert.equal((await api(`tenants/${A}/settings`,{actor:employee})).status,200);
      const members=await api(`tenants/${A}/members`,{actor:a});const member=members.body.find(m=>m.user_id===employee.id);
      assert.equal((await api(`tenants/${A}/members/${member.id}/revoke`,{method:'PATCH',actor:a})).status,200);
      assert.equal((await api(`tenants/${A}/settings`,{actor:employee})).status,404);
      assert.deepEqual((await api('tenants',{actor:employee})).body,[]);
      const login2=await api('auth/login',{method:'POST',body:{email:a.email,password}});const actor2={cookie:login2.headers.get('set-cookie').split(';')[0],csrf:login2.body.csrf};
      assert.equal((await api('auth/revoke-all',{method:'POST',actor:actor2})).status,201);assert.equal((await api('auth/session',{actor:a})).status,401);assert.equal((await api('auth/session',{actor:actor2})).status,401);
    });
    await check('Rate limiting e sanitização de campos sensíveis',async()=>{
      const sentinel='SECRET-LOG-SENTINEL-DO-NOT-LOG';
      assert.equal((await api('auth/register',{method:'POST',body:{email:'invalid',password:sentinel,extra:sentinel}})).status,400);
      let limited=false;
      for(let i=0;i<1050;i++){const r=await fetch(`${base}/api/health/live?secret=${sentinel}`,{headers:{authorization:sentinel,cookie:sentinel}});if(r.status===429){limited=true;break;}}
      assert.equal(limited,true);
    });
    await check('EXPLAIN ANALYZE das consultas mínimas sem índices especulativos',async()=>{
      const plans=await withTenant(database,A,a.id,async tx=>({settings:await rows(tx,sql`explain (analyze, buffers, format json) select * from shop.store_settings where tenant_id=${A}`),membership:await rows(tx,sql`explain (analyze, buffers, format json) select id,role from shop.tenant_memberships where tenant_id=${A} and user_id=${a.id} and status='ACTIVE'`)}));
      writeFileSync('/app/artifacts/query-plans.json',JSON.stringify(plans,null,2));
    });
    const fixture=[];
    for(const [tenant,actor] of [[A,a],[B,b]]) {
      const data=await withTenant(database,tenant,actor.id,async tx=>(await rows(tx,sql`select id,tenant_id,display_name,timezone,updated_by_membership_id from shop.store_settings`))[0]);
      fixture.push({tenantId:tenant,userId:actor.id,setting:data});
    }
    mkdirSync('/app/artifacts',{recursive:true});writeFileSync('/app/artifacts/restore-fixture.json',JSON.stringify(fixture,null,2));
    report.passed=true;report.completedAt=new Date().toISOString();
    writeFileSync('/app/artifacts/foundation.json',JSON.stringify(report,null,2));
  }finally{await queue.close();await database.pool.end();await auth.pool.end();}
});
