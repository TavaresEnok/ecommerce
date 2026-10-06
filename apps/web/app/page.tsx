'use client';
// R01 — Acesso e lojas. Mesmas chamadas de API de antes; reorganização de interface (DESIGN.md, TELAS-E-FLUXOS R01).
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { call, ApiError, fields, useAction } from '../components/panel/api';
import { Alert, Badge, ConfirmDialog, CopyButton, EmptyState, Feedback, Field, Loading, StatusBadge, useTitle } from '../components/ui/kit';
import { MfaChallenge } from '../components/panel/MfaChallenge';
import { Icon } from '../components/ui/icons';
import { LIFECYCLE } from '../components/ui/status';
import { slugify } from '../components/ui/format';

type Store = { id: string; name: string; slug: string; role: 'OWNER' | 'EMPLOYEE'; lifecycle_status?: string };
type Settings = { id: string; displayName: string; timezone: string };
type Member = { id: string; role: string; status: string };
type View = 'login' | 'register' | 'verify' | 'recover' | 'reset';
const ZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Recife', 'America/Fortaleza', 'America/Belem', 'America/Rio_Branco', 'America/Cuiaba', 'UTC'];
const roleName = (r: string) => (r === 'OWNER' ? 'Dono' : 'Funcionário');

export default function Home() {
  const [user, setUser] = useState<{ email: string } | null>(null), [csrf, setCsrf] = useState(''), [checked, setChecked] = useState(false), [offline, setOffline] = useState('');
  const [stores, setStores] = useState<Store[]>([]), [selected, setSelected] = useState<Store | null>(null), [settings, setSettings] = useState<Settings | null>(null), [members, setMembers] = useState<Member[]>([]);
  const [view, setView] = useState<View>('login'), [localToken, setLocalToken] = useState(''), [confirmRevoke, setConfirmRevoke] = useState(false), [revokeMember, setRevokeMember] = useState<Member | null>(null);
  const [newSlug, setNewSlug] = useState(''), [slugTouched, setSlugTouched] = useState(false), [mfaPending, setMfaPending] = useState(false);
  const { busy, error, notice, run, setNotice } = useAction();
  useTitle(user ? 'Suas lojas' : 'Entrar');
  // Depois de entrar pelo formulário, o foco vai para o título “Suas lojas” (o formulário some da tela).
  const storesTitle = useRef<HTMLHeadingElement>(null), signedIn = useRef(false);
  useEffect(() => { if (user && signedIn.current) { signedIn.current = false; storesTitle.current?.focus(); } }, [user]);
  const api = (path: string, method = 'GET', body?: unknown, token = csrf) => call(path, { method, body, csrf: token });
  async function refresh(token = csrf) { setStores(await api('tenants', 'GET', undefined, token)); }
  function signedOut() { setMfaPending(false); setUser(null); setSelected(null); setSettings(null); setStores([]); setLocalToken(''); setView('login'); }
  useEffect(() => {
    call<{ user: { email: string }; csrf: string; mfa?: { enabled: boolean; verified: boolean } }>('auth/session').then(async (s) => { setUser(s.user); setCsrf(s.csrf); if (s.mfa?.enabled && !s.mfa.verified) { setMfaPending(true); return; } await refresh(s.csrf); })
      .catch((e) => { if (!(e instanceof ApiError && e.status === 401)) setOffline('Não foi possível conectar à API. Tente novamente em instantes.'); })
      .finally(() => setChecked(true));
  }, []);
  async function select(store: Store) {
    setSelected(null); setSettings(null); setMembers([]);
    const configuration = await api(`tenants/${store.id}/settings`);
    const team = store.role === 'OWNER' ? await api(`tenants/${store.id}/members`) : [];
    setSelected(store); setSettings(configuration); setMembers(team);
  }
  const submit = (task: (data: Record<string, string>, form: HTMLFormElement) => Promise<void>, done?: string) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; void run(() => task(fields(form), form), done); };

  if (!checked) return <div className="surface-panel auth"><main className="auth-main" id="conteudo"><Loading label="Verificando sua sessão…" /></main></div>;

  if (user && mfaPending) return <div className="surface-panel auth">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <header className="auth-head"><a className="wordmark" href="/">Plataforma</a><span className="small muted">Acesso para lojistas e equipes</span></header>
    <main className="auth-main" id="conteudo"><MfaChallenge email={user.email} csrf={csrf} onVerified={async () => { setMfaPending(false); await refresh(); }} onSignOut={async () => { try { await call('auth/logout', { method: 'POST', csrf }); } finally { signedOut(); } }} /></main>
  </div>;

  const codeBox = localToken && <Alert tone="warning" title="Código LOCAL — não é entrega de e-mail"><p>Ambiente local: o código aparece aqui porque nenhuma mensagem real é enviada.</p><div className="copyable"><output data-testid="local-token"><code>{localToken}</code></output><CopyButton value={localToken} label="Copiar código" /><button type="button" className="btn btn-quiet btn-sm" onClick={() => setLocalToken('')}>Ocultar código</button></div></Alert>;

  if (!user) return <div className="surface-panel auth auth-entry">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <header className="auth-head"><a className="wordmark" href="/">Plataforma</a><span className="small muted">Acesso para lojistas e equipes</span></header>
    <div className="auth-layout">
      <aside className="auth-intro" aria-labelledby="intro-title">
        <span className="caption">SEU ESPAÇO DE TRABALHO</span>
        <h2 id="intro-title">Da primeira ideia<br />ao próximo pedido.</h2>
        <p>Cuide dos produtos, acompanhe as vendas e dê à sua loja a sua cara.</p>
        <ul className="auth-features">
          <li><Icon name="box" /><div><strong>Um catálogo organizado</strong><span>Produtos, imagens e estoque juntos.</span></div></li>
          <li><Icon name="receipt" /><div><strong>A rotina à vista</strong><span>Pedidos e atendimentos em suas próprias áreas.</span></div></li>
          <li><Icon name="brush" /><div><strong>Uma loja com identidade</strong><span>Escolha um modelo e personalize a vitrine.</span></div></li>
        </ul>
        <div className="auth-intro-note"><Icon name="shield" size={16} /><span>Acesso separado para você e sua equipe.</span></div>
      </aside>
      <main className="auth-main" id="conteudo">
      {offline && <Alert tone="danger" role="alert" title="Serviço indisponível">{offline}</Alert>}
      <Feedback error={error} notice={notice} />
      {codeBox}
      {view === 'login' && <section className="surface section stack-sm" aria-labelledby="t-login">
        <h1 id="t-login">Entrar</h1>
        <p className="muted small">Acesse sua conta para continuar cuidando da loja.</p>
        <form className="form" aria-label="Entrar" onSubmit={submit(async (d) => { const r = await api('auth/login', 'POST', d); signedIn.current = true; setUser(r.user); setCsrf(r.csrf); setLocalToken(''); if (r.mfaRequired) { setMfaPending(true); return; } await refresh(r.csrf); })}>
          <Field label="E-mail">{(a) => <input className="input" name="email" type="email" required autoComplete="username" {...a} />}</Field>
          <Field label="Senha">{(a) => <input className="input" name="password" type="password" minLength={12} maxLength={128} required autoComplete="current-password" {...a} />}</Field>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <div className="cluster-tight small"><button type="button" className="btn btn-quiet btn-sm" onClick={() => setView('register')}>Criar acesso</button><button type="button" className="btn btn-quiet btn-sm" onClick={() => setView('recover')}>Esqueci minha senha</button><button type="button" className="btn btn-quiet btn-sm" onClick={() => setView('verify')}>Tenho um código de verificação</button></div>
      </section>}
      {view === 'register' && <section className="surface section stack-sm" aria-labelledby="t-reg">
        <h1 id="t-reg">Criar acesso</h1>
        <form className="form" aria-label="Criar acesso" onSubmit={submit(async (d) => { const r = await api('auth/register', 'POST', d); setLocalToken(r.localToken); setNotice(r.message); setView('verify'); })}>
          <Field label="E-mail">{(a) => <input className="input" name="email" type="email" required autoComplete="email" {...a} />}</Field>
          <Field label="Senha" hint="Mínimo de 12 caracteres.">{(a) => <input className="input" name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" {...a} />}</Field>
          <button className="btn btn-primary btn-block" disabled={busy}>Criar acesso</button>
        </form>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setView('login')}><Icon name="back" size={16} />Voltar para entrar</button>
      </section>}
      {view === 'verify' && <section className="surface section stack-sm" aria-labelledby="t-ver">
        <h1 id="t-ver">Verificar e-mail</h1>
        <form className="form" aria-label="Verificar e-mail" onSubmit={submit(async (d) => { const r = await api('auth/verify-email', 'POST', d); setLocalToken(''); setNotice(r.message); setView('login'); })}>
          <Field label="Código de verificação">{(a) => <input className="input" name="token" required defaultValue={localToken} key={`v-${localToken}`} autoComplete="one-time-code" {...a} />}</Field>
          <button className="btn btn-primary btn-block" disabled={busy}>Verificar</button>
        </form>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setView('login')}><Icon name="back" size={16} />Voltar para entrar</button>
      </section>}
      {view === 'recover' && <section className="surface section stack-sm" aria-labelledby="t-rec">
        <h1 id="t-rec">Recuperar acesso</h1>
        <form className="form" aria-label="Recuperar acesso" onSubmit={submit(async (d) => { const r = await api('auth/recover', 'POST', d); setLocalToken(r.localToken); setNotice(r.message); setView('reset'); })}>
          <Field label="E-mail">{(a) => <input className="input" name="email" type="email" required autoComplete="email" {...a} />}</Field>
          <button className="btn btn-primary btn-block" disabled={busy}>Gerar código local</button>
        </form>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setView('login')}><Icon name="back" size={16} />Voltar para entrar</button>
      </section>}
      {view === 'reset' && <section className="surface section stack-sm" aria-labelledby="t-res">
        <h1 id="t-res">Redefinir senha</h1>
        <form className="form" aria-label="Redefinir senha" onSubmit={submit(async (d) => { const r = await api('auth/reset', 'POST', d); setLocalToken(''); setNotice(r.message); setView('login'); })}>
          <Field label="Código de recuperação">{(a) => <input className="input" name="token" required defaultValue={localToken} key={`r-${localToken}`} {...a} />}</Field>
          <Field label="Nova senha" hint="Mínimo de 12 caracteres. Outras sessões serão encerradas.">{(a) => <input className="input" name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" {...a} />}</Field>
          <button className="btn btn-primary btn-block" disabled={busy}>Redefinir senha</button>
        </form>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setView('login')}><Icon name="back" size={16} />Voltar para entrar</button>
      </section>}
      <Alert title="Ambiente local">Códigos de e-mail aparecem nesta tela; nenhuma mensagem real é enviada. Lojas criadas aqui são rascunhos.</Alert>
    </main>
    </div>
    <footer className="auth-foot">Plataforma (nome provisório) · ambiente local, sem homologação externa nem liberação operacional</footer>
  </div>;

  const owner = selected?.role === 'OWNER';
  return <div className="surface-panel auth">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <header className="auth-head"><a className="wordmark" href="/">Plataforma</a>
      <div className="cluster-tight small"><span className="muted">{user.email}</span>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run(async () => { await api('auth/logout', 'POST'); signedOut(); })}>Sair</button>
        <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setConfirmRevoke(true)}>Encerrar todas as sessões…</button></div>
    </header>
    <main className="auth-main wide" id="conteudo">
      <div className="page-head"><div><h1 ref={storesTitle} tabIndex={-1}>Suas lojas</h1><p className="meta">Escolha uma loja para abrir o painel ou ajustar a configuração. Você só vê lojas às quais está vinculado.</p></div></div>
      <Feedback error={error} notice={notice} />
      {codeBox}
      <div className="two-col" style={{ gridTemplateColumns: undefined }}>
        <div className="stack">
          <section className="stack-sm" aria-labelledby="t-stores">
            <h2 id="t-stores" className="sr-only">Lojas vinculadas</h2>
            {stores.length === 0 ? <EmptyState icon="store" title="Nenhuma loja vinculada">Crie uma loja em rascunho ou aceite o convite de um Dono.</EmptyState> :
              <ul className="store-list">{stores.map((s) => <li key={s.id}><button type="button" className="store-option" aria-pressed={selected?.id === s.id} aria-label={`${s.name} — ${roleName(s.role)}`} disabled={busy} onClick={() => void run(() => select(s))}>
                <span><span className="name">{s.name}</span><span className="cell-sub">{s.slug}</span></span><span className="cluster-tight">{s.lifecycle_status && <StatusBadge map={LIFECYCLE} value={s.lifecycle_status} />}<Badge>{roleName(s.role)}</Badge></span></button></li>)}</ul>}
            {stores.length > 0 && !selected && <EmptyState icon="store" title="Selecione uma loja">Escolha uma loja acima para abrir o painel, ver os próximos passos e ajustar nome, fuso e equipe.</EmptyState>}
          </section>
          {selected && settings && <section className="surface" aria-labelledby="t-selected">
            <div className="section stack-sm">
              <div className="section-head" style={{ marginBottom: 0 }}><div><h2 id="t-selected">{settings.displayName || selected.name}</h2><p>{roleName(selected.role)} · {selected.slug}</p></div>
                <div className="cluster"><a className="btn btn-primary" href={`/painel/${selected.id}`}>Abrir painel</a><a className="btn btn-secondary" href={`/lojas/${selected.slug}`}>Abrir vitrine</a></div></div>
            </div>
            {owner && selected.lifecycle_status === 'DRAFT' && <div className="section stack-sm"><h3>Próximos passos da loja</h3><p className="small muted">Etapas disponíveis hoje. A ativação para vendas reais é assistida e depende das homologações pendentes.</p>
              <ol className="steps-list small"><li><span><a href={`/painel/${selected.id}`}>Cadastrar produtos, variações e estoque</a></span></li><li><span><a href={`/painel/${selected.id}?aba=vitrine`}>Preencher fornecedor e políticas, ajustar e publicar o tema</a></span></li><li><span><a href={`/painel/${selected.id}?aba=frete`}>Configurar retirada ou frete por CEP</a></span></li><li><span><a href={`/painel/${selected.id}/pedidos`}>Conectar a conta de pagamento (simulada neste ambiente)</a></span></li><li><span><a href={`/painel/${selected.id}/operacao`}>Ativar a verificação em duas etapas</a></span></li></ol></div>}
            <div className="section stack-sm">
              <h3>Configuração</h3>
              <form className="form" aria-label="Configuração" key={settings.id} onSubmit={submit(async (d) => { const r = await api(`tenants/${selected.id}/settings`, 'PATCH', d); setSettings(r); try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(`painel-${selected.id}-`)) sessionStorage.removeItem(k); } catch { /* sem storage */ } }, 'Configuração salva.')}>
                <Field label="Nome de exibição" hint={owner ? undefined : 'Somente o Dono altera a configuração.'}>{(a) => <input className="input" name="displayName" value={settings.displayName} onChange={(e) => setSettings({ ...settings, displayName: e.target.value })} maxLength={100} required readOnly={!owner} {...a} />}</Field>
                <Field label="Fuso horário" hint="Usado para mostrar datas e horários no painel.">{(a) => <select className="select" name="timezone" value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} disabled={!owner} {...a}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select>}</Field>
                {owner && <div><button className="btn btn-primary" disabled={busy}>Salvar configuração</button></div>}
              </form>
              <details className="disclosure small"><summary>Diagnóstico técnico</summary><p className="muted">Envia uma verificação desta configuração ao processamento em segundo plano.</p><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run(async () => { const job = await api(`tenants/${selected.id}/configuration-check`, 'POST'); setNotice(`Verificação enviada ao processamento em segundo plano (tarefa ${job.jobId}).`); })}>Verificar configuração em segundo plano</button></details>
            </div>
            {owner && <div className="section stack-sm">
              <h3>Equipe</h3>
              {members.length === 0 ? <p className="small muted">Nenhum integrante além de você.</p> : <div className="table-wrap"><table className="data stack"><thead><tr><th scope="col">Papel</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>{members.map((m) => <tr key={m.id}><td className="primary">{roleName(m.role)}</td><td data-label="Situação">{m.status === 'ACTIVE' ? <Badge tone="success">Ativo</Badge> : <Badge>{m.status === 'REVOKED' ? 'Revogado' : m.status}</Badge>}</td><td data-label="Ações">{m.role === 'EMPLOYEE' && m.status === 'ACTIVE' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setRevokeMember(m)}>Revogar vínculo…</button>}</td></tr>)}</tbody></table></div>}
              <form className="form" aria-label="Convidar funcionário" onSubmit={submit(async (d, form) => { const invite = await api(`tenants/${selected.id}/invitations`, 'POST', d); setLocalToken(invite.localToken); setNotice(`${invite.message} Informe ao funcionário o ID da loja: ${invite.tenantId}`); form.reset(); })}>
                <Field label="E-mail do funcionário" hint="O funcionário gerencia catálogo, estoque e pedidos; não altera gateway, equipe, plano ou domínio.">{(a) => <input className="input" name="email" type="email" required {...a} />}</Field>
                <div><button className="btn btn-secondary" disabled={busy}>Criar convite</button></div>
              </form>
            </div>}
          </section>}
        </div>
        <aside className="stack" aria-label="Criar loja ou aceitar convite">
          <section className="surface section stack-sm" aria-labelledby="t-new">
            <h2 id="t-new">Criar loja</h2><p className="small muted">A loja nasce em rascunho, sem vendas.</p>
            <form className="form" aria-label="Criar loja" onSubmit={submit(async (d) => { const store = await api('tenants', 'POST', d); await refresh(); await select({ ...store, role: 'OWNER', lifecycle_status: 'DRAFT' }); setNewSlug(''); setSlugTouched(false); }, 'Loja criada em rascunho.')}>
              <Field label="Nome da loja">{(a) => <input className="input" name="name" maxLength={100} required onChange={(e) => { if (!slugTouched) setNewSlug(slugify(e.target.value).slice(0, 50)); }} {...a} />}</Field>
              <Field label="Identificador da loja" hint="Usado no endereço da vitrine. Letras minúsculas, números e hífens.">{(a) => <input className="input" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={50} required value={newSlug} onChange={(e) => { setSlugTouched(true); setNewSlug(e.target.value); }} {...a} />}</Field>
              <button className="btn btn-secondary" disabled={busy}>Criar loja</button>
            </form>
          </section>
          <section className="surface section stack-sm" aria-labelledby="t-accept">
            <h2 id="t-accept">Aceitar convite</h2>
            <form className="form" aria-label="Aceitar convite" onSubmit={submit(async (d, form) => { const r = await api('invitations/accept', 'POST', d); await refresh(); setNotice(r.message); form.reset(); })}>
              <Field label="ID da loja">{(a) => <input className="input" name="tenantId" required {...a} />}</Field>
              <Field label="Código do convite">{(a) => <input className="input" name="token" required {...a} />}</Field>
              <button className="btn btn-secondary" disabled={busy}>Aceitar convite</button>
            </form>
          </section>
        </aside>
      </div>
    </main>
    <ConfirmDialog open={confirmRevoke} title="Encerrar todas as sessões?" description={<p>Você sairá deste e de todos os outros dispositivos e precisará entrar de novo.</p>} confirmLabel="Encerrar sessões" busy={busy}
      onClose={() => setConfirmRevoke(false)} onConfirm={() => void run(async () => { await api('auth/revoke-all', 'POST'); setConfirmRevoke(false); signedOut(); })} />
    <ConfirmDialog open={!!revokeMember} title="Revogar o vínculo deste funcionário?" description={<p>O acesso dele a {selected?.name} termina imediatamente. Pedidos e registros feitos por ele são preservados.</p>} confirmLabel="Revogar vínculo" busy={busy}
      onClose={() => setRevokeMember(null)} onConfirm={() => void run(async () => { await api(`tenants/${selected!.id}/members/${revokeMember!.id}/revoke`, 'PATCH'); setRevokeMember(null); await select(selected!); }, 'Vínculo revogado.')} />
  </div>;
}
