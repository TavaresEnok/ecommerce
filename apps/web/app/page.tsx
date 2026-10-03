'use client';
import { FormEvent, useEffect, useState } from 'react';
type Store = {id:string;name:string;slug:string;role:'OWNER'|'EMPLOYEE'};
type Settings = {id:string;displayName:string;timezone:string};
export default function Home() {
  const [user,setUser]=useState<{email:string}|null>(null);
  const [csrf,setCsrf]=useState(''); const [stores,setStores]=useState<Store[]>([]); const [selected,setSelected]=useState<Store|null>(null);
  const [settings,setSettings]=useState<Settings|null>(null); const [notice,setNotice]=useState(''); const [error,setError]=useState('');
  const [localToken,setLocalToken]=useState(''); const [busy,setBusy]=useState(false); const [mfaPending,setMfaPending]=useState(false);
  const [members,setMembers]=useState<{id:string;role:string;status:string}[]>([]);
  async function api(path:string,method='GET',data?:unknown,token=csrf) {
    const response=await fetch(`/api/${path}`,{method,credentials:'same-origin',cache:'no-store',headers:{...(data?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':token},body:data?JSON.stringify(data):undefined});
    const result=await response.json();
    if(!response.ok) { if(response.status===401 && user) {setUser(null);setSelected(null);setSettings(null);} const detail=result.error; throw new Error(typeof detail==='string'?detail:Array.isArray(detail?.message)?detail.message.join('; '):detail?.message || `Erro ${response.status}`); }
    return result;
  }
  async function action(task:()=>Promise<void>) { setBusy(true);setError('');setNotice(''); try {await task();}catch(error){setError(error instanceof Error?error.message:'Falha de comunicação.');}finally{setBusy(false);} }
  const fields=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();return Object.fromEntries(new FormData(event.currentTarget));};
  async function refresh(token=csrf) {setStores(await api('tenants','GET',undefined,token));}
  useEffect(()=>{fetch('/api/auth/session',{cache:'no-store'}).then(async response=>{if(response.ok){const result=await response.json();setUser(result.user);setCsrf(result.csrf);if(result.mfa?.enabled&&!result.mfa.verified){setMfaPending(true);return;}await refresh(result.csrf);}}).catch(()=>setError('Não foi possível conectar à API.'));},[]);
  async function select(store:Store) {
      setSelected(null);setSettings(null);setMembers([]);
      const configuration=await api(`tenants/${store.id}/settings`);
      const team=store.role==='OWNER'?await api(`tenants/${store.id}/members`):[];
      setSelected(store);setSettings(configuration);setMembers(team);
    }
  return <main>
    <header><p className="eyebrow">E-commerce · Fase 1</p><h1>Fundação do produto</h1><p>Acesso, lojas e configuração. Abra o painel da loja para gerenciar catálogo e vitrine; pagamentos ainda não habilitados.</p></header>
    <aside className="local">Ambiente de fundação: códigos de e-mail aparecem somente no modo local. Nenhuma mensagem real é enviada. Lojas criadas aqui são rascunhos, não publicação ou ativação comercial.</aside>
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="success">{notice}</p>}
    {localToken && <section aria-label="Código local"><strong>Código LOCAL — não é entrega de e-mail</strong><output data-testid="local-token">{localToken}</output><button onClick={()=>setLocalToken('')}>Ocultar código</button></section>}
    {!user ? <div className="grid">
      <section><h2>Entrar</h2><form aria-label="Entrar" onSubmit={event=>{const data=fields(event);void action(async()=>{const result=await api('auth/login','POST',data);setUser(result.user);setCsrf(result.csrf);setLocalToken('');if(result.mfaRequired){setMfaPending(true);return;}await refresh(result.csrf);});}}>
        <label>E-mail<input name="email" type="email" required autoComplete="username"/></label><label>Senha<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="current-password"/></label><button disabled={busy}>Entrar</button>
      </form></section>
      <section><h2>Criar acesso local</h2><form aria-label="Criar acesso" onSubmit={event=>{const data=fields(event);void action(async()=>{const result=await api('auth/register','POST',data);setLocalToken(result.localToken);setNotice(result.message);});}}>
        <label>E-mail<input name="email" type="email" required autoComplete="email"/></label><label>Senha (mínimo 12 caracteres)<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label><button disabled={busy}>Cadastrar</button>
      </form><h3>Verificar e-mail</h3><form aria-label="Verificar e-mail" onSubmit={event=>{const data=fields(event);void action(async()=>{const result=await api('auth/verify-email','POST',data);setLocalToken('');setNotice(result.message);});}}><label>Código de verificação<input name="token" required defaultValue={localToken} key={`verify-${localToken}`}/></label><button disabled={busy}>Verificar</button></form></section>
      <section><h2>Recuperar acesso</h2><form aria-label="Recuperar acesso" onSubmit={event=>{const data=fields(event);void action(async()=>{const result=await api('auth/recover','POST',data);setLocalToken(result.localToken);setNotice(result.message);});}}><label>E-mail<input name="email" type="email" required/></label><button disabled={busy}>Gerar código local</button></form>
        <form aria-label="Redefinir senha" onSubmit={event=>{const data=fields(event);void action(async()=>{const result=await api('auth/reset','POST',data);setLocalToken('');setNotice(result.message);});}}><label>Código de recuperação<input name="token" required defaultValue={localToken} key={`recover-${localToken}`}/></label><label>Nova senha<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label><button disabled={busy}>Redefinir senha</button></form>
      </section>
    </div> : mfaPending ? <section><h2>Verificação em duas etapas</h2><p>Autenticado como <strong>{user.email}</strong>. Confirme o código do autenticador para acessar as lojas.</p><form aria-label="Confirmar MFA" onSubmit={event=>{const data=fields(event);void action(async()=>{await api('auth/mfa/verify','POST',data);setMfaPending(false);await refresh();});}}><label>Código do autenticador ou de recuperação<input name="code" required autoComplete="one-time-code"/></label><button disabled={busy}>Confirmar</button></form><button disabled={busy} onClick={()=>void action(async()=>{await api('auth/logout','POST');setUser(null);setMfaPending(false);})}>Sair</button></section> : <>
      <section><div className="row"><p>Autenticado como <strong>{user.email}</strong></p><button disabled={busy} onClick={()=>void action(async()=>{await api('auth/logout','POST');setUser(null);setMfaPending(false);setSelected(null);setSettings(null);setLocalToken('');})}>Sair</button><button disabled={busy} onClick={()=>void action(async()=>{await api('auth/revoke-all','POST');setUser(null);setSelected(null);setSettings(null);setLocalToken('');})}>Revogar todas as sessões</button></div></section>
      <div className="grid"><section><h2>Suas lojas</h2>{stores.length===0?<p>Nenhuma loja vinculada. Crie um rascunho local ou aceite um convite.</p>:<ul>{stores.map(store=><li key={store.id}><button disabled={busy} onClick={()=>void action(()=>select(store))}>{store.name} — {store.role==='OWNER'?'Dono':'Funcionário'}</button><small>{store.slug}</small></li>)}</ul>}
        <h3>Criar loja local</h3><form aria-label="Criar loja" onSubmit={event=>{const data=fields(event);void action(async()=>{const store=await api('tenants','POST',data);await refresh();await select(store);setNotice('Loja criada em rascunho.');});}}><label>Nome da loja<input name="name" maxLength={100} required/></label><label>Identificador da loja<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={50} required/></label><button disabled={busy}>Criar loja</button></form>
      </section>
      <section><h2>Configuração da loja</h2>{selected && settings ? <><p>{selected.name} · {selected.role==='OWNER'?'Dono':'Funcionário (somente leitura)'}</p><p><a href={`/painel/${selected.id}`}>Gerenciar catálogo e vitrine</a> · <a href={`/lojas/${selected.slug}`}>Abrir vitrine publicada</a></p><form aria-label="Configuração" key={settings.id} onSubmit={event=>{const data=fields(event);void action(async()=>{const result=await api(`tenants/${selected.id}/settings`,'PATCH',data);setSettings(result);setNotice('Configuração salva no banco.');});}}><label>Nome de exibição<input name="displayName" value={settings.displayName} onChange={event=>setSettings({...settings,displayName:event.target.value})} maxLength={100} required readOnly={selected.role!=='OWNER'}/></label><label>Fuso horário<select name="timezone" value={settings.timezone} onChange={event=>setSettings({...settings,timezone:event.target.value})} disabled={selected.role!=='OWNER'}>{['America/Sao_Paulo','America/Manaus','America/Recife','America/Fortaleza','America/Belem','America/Rio_Branco','America/Cuiaba','UTC'].map(zone=><option key={zone}>{zone}</option>)}</select></label><button disabled={busy||selected.role!=='OWNER'}>Salvar configuração</button></form>
      <button disabled={busy} onClick={()=>void action(async()=>{const job=await api(`tenants/${selected.id}/configuration-check`,'POST');setNotice(`Verificação enviada ao worker: ${job.jobId}`);})}>Verificar no worker</button>
      {selected.role==='OWNER' && <><h3>Equipe</h3><form aria-label="Convidar funcionário" onSubmit={event=>{const data=fields(event);void action(async()=>{const invite=await api(`tenants/${selected.id}/invitations`,'POST',data);setLocalToken(invite.localToken);setNotice(`${invite.message} ID da loja: ${invite.tenantId}`);});}}><label>E-mail do funcionário<input name="email" type="email" required/></label><button disabled={busy}>Criar convite local</button></form><ul>{members.map(member=><li key={member.id}>{member.role==='OWNER'?'Dono':'Funcionário'} — {member.status}{member.role==='EMPLOYEE'&&member.status==='ACTIVE'&&<button disabled={busy} onClick={()=>void action(async()=>{await api(`tenants/${selected.id}/members/${member.id}/revoke`,'PATCH');await select(selected);setNotice('Vínculo revogado.');})}>Revogar vínculo</button>}</li>)}</ul></>}
      </> : <p>Selecione uma loja para ler a configuração persistida.</p>}</section>
      <section><h2>Aceitar convite</h2><form aria-label="Aceitar convite" onSubmit={event=>{const data=fields(event);void action(async()=>{const result=await api('invitations/accept','POST',data);await refresh();setNotice(result.message);});}}><label>ID da loja<input name="tenantId" required/></label><label>Código do convite<input name="token" required/></label><button disabled={busy}>Aceitar convite</button></form></section></div>
    </>}
    <footer>Verificação técnica local · Sem homologação externa · Sem liberação operacional</footer>
  </main>;
}
