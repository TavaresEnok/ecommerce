'use client';
import { useState } from 'react';
// Shown instead of the panel while the session has MFA enabled but not yet verified: the API refuses every administrative
// route for such a session, so the only useful action here is answering the challenge (or leaving).
export function MfaGate({csrf}:{csrf:string}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function call(path:string,body?:unknown){const r=await fetch(`/api/${path}`,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body||{})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(typeof d.error==='string'?d.error:d.error?.message||'Código inválido.');}}
 return <section aria-label="Verificação em duas etapas"><h2>Verificação em duas etapas</h2><p>Esta conta usa MFA. Confirme o código do autenticador para acessar o painel.</p>{error&&<p role="alert" className="error">{error}</p>}
  <form aria-label="Confirmar MFA" onSubmit={e=>{e.preventDefault();const code=String(new FormData(e.currentTarget).get('code')||'');setBusy(true);setError('');void call('auth/mfa/verify',{code}).then(()=>location.reload()).catch(x=>{setError((x as Error).message);setBusy(false);});}}><label>Código do autenticador ou de recuperação<input name="code" required autoComplete="one-time-code"/></label><button disabled={busy}>Confirmar</button></form>
  <button disabled={busy} onClick={()=>void call('auth/logout').then(()=>location.assign('/'))}>Sair</button></section>;
}
