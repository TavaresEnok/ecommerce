'use client';
// Segundo fator pendente (R1 da revisão 0179f4): a API recusa todas as rotas administrativas a uma sessão de conta com MFA
// que ainda não confirmou o código; aqui só se pode responder ao desafio ou sair. Nada disto substitui a decisão do servidor.
import { call, fields, useAction } from './api';
import { Alert, Feedback, Field } from '../ui/kit';

export function MfaChallenge({ email, csrf, onVerified, onSignOut }: { email?: string; csrf: string; onVerified: () => void | Promise<void>; onSignOut: () => void | Promise<void> }) {
  const { busy, error, run } = useAction();
  return <section className="surface section stack-sm" aria-labelledby="t-mfa">
    <h1 id="t-mfa">Verificação em duas etapas</h1>
    <p>{email ? <>Você entrou como <strong>{email}</strong>. </> : null}Informe o código do aplicativo autenticador para acessar suas lojas. Se perdeu o aplicativo, use um código de recuperação.</p>
    <Feedback error={error} />
    <form className="form" aria-label="Confirmar MFA" onSubmit={(e) => { e.preventDefault(); const data = fields(e.currentTarget); void run(async () => { await call('auth/mfa/verify', { method: 'POST', body: { code: data.code?.trim() }, csrf }); await onVerified(); }); }}>
      <Field label="Código do autenticador ou de recuperação" hint="Seis dígitos do aplicativo, ou um código de recuperação de uso único.">{(a) => <input className="input" name="code" required autoComplete="one-time-code" inputMode="text" autoFocus {...a} />}</Field>
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar'}</button>
    </form>
    <div className="cluster-tight small"><button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void onSignOut()}>Sair</button></div>
    <Alert title="Por que isto aparece?">Contas com MFA ativo só liberam o painel depois do segundo fator, mesmo com a senha correta.</Alert>
  </section>;
}
