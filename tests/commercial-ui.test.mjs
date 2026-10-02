import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { seed,client } from '../scripts/seed.mjs';
import { setPlatformAdmin } from '../scripts/platform-admin.mjs';
// Owner commercial sections and platform administration in a real browser (desktop and mobile).
assert.equal(process.env.APP_ENV,'test');const base=process.env.BASE_URL,api=client(base),report={passed:false,visual:[]};
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret,step=Math.floor(Date.now()/30000)){let bits='';for(const c of secret)bits+=B32.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',key).update(counter).digest(),o=h[h.length-1]&0xf;return ((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
test('Fase 6: interface do Dono (MFA, plano, domínio, frete) e da plataforma',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const [a]=await seed(api,`u6${randomBytes(4).toString('hex')}`);
  await setPlatformAdmin(process.env.MIGRATION_DATABASE_URL,'grant',a.email,'Ensaio de interface Fase 6');
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const login=await api('auth/login',{method:'POST',body:{email:a.email,password:a.password}});const cookie=login.headers.get('set-cookie').split(';')[0];
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await context.addCookies([{name:cookie.split('=')[0],value:cookie.split('=')[1],domain:'web',path:'/'}]);
    await page.goto(`${base}/painel/${a.id}/operacao`);const security=page.getByRole('region',{name:'Verificação em duas etapas'});await security.waitFor();
    if(viewport.width===1440){await security.getByRole('button',{name:'Configurar MFA'}).click();const secret=await security.locator('code').first().textContent();
     await security.getByLabel('Código').fill(totp(secret));await security.getByRole('button',{name:'Ativar'}).click();await page.getByText('Códigos de recuperação').waitFor();a.secret=secret;}
    else{const form=page.getByRole('form',{name:'Confirmar MFA'});await form.getByLabel(/Código/).fill(totp(a.secret,Math.floor(Date.now()/30000)+1));await form.getByRole('button',{name:'Confirmar'}).click();await page.getByText('confirmado nesta sessão').first().waitFor();}
    await page.getByRole('region',{name:'Plano e faturas'}).getByText(/Piloto/).first().waitFor();
    const domain=page.getByRole('form',{name:'Cadastrar domínio'});await domain.getByLabel('Hostname').fill(`ui-${viewport.width}-${randomBytes(2).toString('hex')}.example.test`);await domain.getByRole('button',{name:'Cadastrar'}).click();await page.getByText(/_ecommerce-challenge\./).first().waitFor();
    const carrier=page.getByRole('form',{name:'Configurar transportadora'});await carrier.getByLabel('CEP de origem').fill('01310100');await carrier.getByRole('button',{name:'Salvar'}).click();await page.getByText('Transportadora configurada.').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase6-owner-${viewport.width}.png`,fullPage:true});
    await page.goto(`${base}/plataforma`);await page.getByRole('heading',{name:'Lojas'}).waitFor();await page.getByRole('heading',{name:'Planos (versões imutáveis)'}).waitFor();await page.getByText(/PILOT v1/).first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase6-platform-${viewport.width}.png`,fullPage:true});
    assert.equal(errors.length,0,errors.join('\n'));report.visual.push({viewport,pages:['operação/MFA/plano/domínio/frete','plataforma'],result:'passed'});
   }finally{await context.close();}
  }
  report.passed=true;
 }finally{await browser.close();writeFileSync('/app/artifacts/commercial-ui.json',JSON.stringify({...report,completedAt:new Date().toISOString()},null,2));}
});
