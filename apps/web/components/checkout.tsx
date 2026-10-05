'use client';
// Compra na vitrine: carrinho → entrega → seus dados → revisão (R12), comprovante/acompanhamento (R13) e contato (R14).
// Contratos preservados: o servidor recalcula preço/frete, a cotação vence, uma chave de idempotência por intenção evita
// pedido duplicado em recarga ou duplo clique, e só a API declara "Pago".
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Alert, Badge, CopyButton, EmptyState, Field, StatusBadge } from './ui/kit';
import { Icon } from './ui/icons';
import { DISPUTE_STATUS, FULFILLMENT_STATUS, ORDER_STATUS, PAYMENT_STATUS, SUPPORT_KIND, SUPPORT_STATUS, label } from './ui/status';
import { formatDate, formatDateTime, formatTime, money } from './ui/format';

type Quote = { id: string; method: string; price_cents: string; total_cents: string; expires_at: string; days: number };
type Address = { cep: string; street: string; number: string; city: string; state: string; complement: string };
type CartData = { items: { variant_id: string; quantity: number; price_cents: string; name: string; sku: string; available: number; active: boolean; status: string }[]; subtotal_cents: string; valid: boolean };
const fields = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; };
class StoreError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function call(slug: string, path: string, body?: unknown, extra: Record<string, string> = {}, timeoutMs?: number) {
  let response: Response;
  try { response = await fetch(`/api/public/stores/${slug}/${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined }); }
  catch { throw new StoreError(0, 'Não foi possível conectar. Verifique sua conexão e tente novamente.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new StoreError(response.status, typeof data.error === 'string' ? data.error : data.error?.message || (response.status === 429 ? 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.' : 'Não foi possível concluir. Tente novamente.'));
  return data;
}
// randomUUID exige contexto seguro; getRandomValues funciona também em previews HTTP.
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
// Uma chave por intenção confirmada: recarregar ou clicar duas vezes repete a mesma operação em vez de comprar de novo.
// A chave cobre a cotação e os dados enviados: repetir a mesma intenção reaproveita a chave; corrigir dados gera outra.
const digest = (text: string) => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0; return h.toString(36); };
// Sem sessionStorage (modo privado, bloqueio), a chave vive na memória da página; depois de recarregar, a proteção do
// servidor por carrinho/versão (checkoutExisting) devolve o pedido já criado em vez de criar outro.
const memoryKeys = new Map<string, string>();
function intentKey(quote: string, content: unknown) { const name = `checkout-${quote}-${digest(JSON.stringify(content))}`; let key = memoryKeys.get(name) || ''; try { key = key || sessionStorage.getItem(name) || ''; } catch { /* sem storage */ } if (!key) key = uid(); memoryKeys.set(name, key); try { sessionStorage.setItem(name, key); } catch { /* sem storage */ } return key; }
type CheckoutBody = { quote_id: string; address: Address; buyer: { name: string; email: string }; method: string; total_cents: string };
type Intent = { key: string; body: CheckoutBody; total: string };
// Confirmação enviada e sem resposta conclusiva: guardada para reenviar exatamente a mesma intenção (mesma chave e conteúdo).
const pendingName = (slug: string) => `checkout-pendente-${slug}`;
function readPending(slug: string): Intent | null { try { const v = sessionStorage.getItem(pendingName(slug)); return v ? JSON.parse(v) as Intent : null; } catch { return null; } }
function writePending(slug: string, intent: Intent | null) { try { if (intent) sessionStorage.setItem(pendingName(slug), JSON.stringify(intent)); else sessionStorage.removeItem(pendingName(slug)); } catch { /* sem storage: a intenção fica só na memória da página */ } }
// Conclusiva = a loja processou e recusou depois de verificar pedido existente (400 de conteúdo, 409 de regra):
// nada foi criado por esta confirmação. Qualquer outra falha (rede, tempo esgotado, 5xx, 429, resposta sem pedido) é
// resultado desconhecido: o pedido pode existir. “Chave reutilizada” indica pedido já criado com outro conteúdo.
const conclusive = (e: unknown) => e instanceof StoreError && (e.status === 400 || e.status === 409) && !/chave reutilizada/i.test(e.message);

type Step = 'delivery' | 'buyer' | 'review';
export function CartFlow({ slug, thumbs = {} }: { slug: string; thumbs?: Record<string, string> }) {
  const [cart, setCart] = useState<CartData | null>(null), [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('delivery'), [kind, setKind] = useState('TABLE'), [address, setAddress] = useState<Address | null>(null), [quote, setQuote] = useState<Quote | null>(null);
  const [buyer, setBuyer] = useState({ name: '', email: '', method: 'PIX' }), [methods, setMethods] = useState<{ simulation: boolean; reason: string } | null | undefined>(undefined);
  const [errors, setErrors] = useState<{ cart?: string; delivery?: string; cep?: string; confirm?: string; changed?: boolean }>({}), [info, setInfo] = useState(''), [editItems, setEditItems] = useState(false);
  const [unknown, setUnknown] = useState<{ intent: Intent; detail: string; restored: boolean } | null>(null), [recovered, setRecovered] = useState('');
  const sending = useRef(false);
  useEffect(() => { call(slug, 'cart').then(setCart).catch((e) => setLoadError(e.message)); call(slug, 'payment-methods').then(setMethods).catch(() => setMethods(null)); const saved = readPending(slug); if (saved) setUnknown({ intent: saved, detail: '', restored: true }); }, [slug]);
  const firstStep = useRef(true);
  useEffect(() => { if (firstStep.current) { firstStep.current = false; return; } document.getElementById({ delivery: 't-delivery', buyer: 't-buyer', review: 't-review' }[step])?.focus(); }, [step]);
  async function change(variant_id: string, quantity: number) {
    if (unknown) return; // mudar itens muda a versão do carrinho: só depois de resolver a confirmação pendente
    setBusy(true); setErrors({}); setInfo('');
    try { setCart(await call(slug, 'cart/items', { variant_id, quantity })); setEditItems(false); if (quote) { setQuote(null); setStep('delivery'); setInfo('Os itens mudaram: calcule a entrega de novo para ver o total atualizado.'); } }
    catch (e) { setErrors({ cart: (e as Error).message }); } finally { setBusy(false); }
  }
  async function quoteDelivery(e: FormEvent<HTMLFormElement>) {
    const b = fields(e), next: Address = { cep: String(b.cep).replace('-', ''), street: b.street!, number: b.number!, city: b.city!, state: String(b.state).toUpperCase(), complement: b.complement || '' };
    setBusy(true); setErrors({}); setInfo(''); setQuote(null); setAddress(next);
    try { setQuote(await call(slug, 'cart/quotes', { kind, address: next })); setStep('buyer'); }
    catch (err) { const m = (err as Error).message; if (err instanceof StoreError && [404, 409, 422].includes(err.status) && /cep|entrega|frete|atend/i.test(m)) setErrors({ cep: m }); else setErrors({ delivery: m }); }
    finally { setBusy(false); }
  }
  async function submit(intent: Intent) {
    if (sending.current) return; // duplo clique: uma requisição por vez; a mesma chave cobre recargas
    sending.current = true; setBusy(true); setErrors({}); setRecovered('');
    writePending(slug, intent);
    try {
      const order = await call(slug, 'cart/checkout', { key: intent.key, ...intent.body }, {}, 30000);
      if (!order?.id) throw new StoreError(0, 'A resposta da loja chegou incompleta.');
      writePending(slug, null); location.assign(`/lojas/${slug}/pedidos/${order.id}`); return;
    } catch (e) {
      const m = (e as Error).message;
      if (!conclusive(e)) {
        // Causa em linguagem do comprador; a mensagem crua de rede (“tente novamente”) contradiria “não envie outra”.
        const st = e instanceof StoreError ? e.status : 0;
        setUnknown({ intent, restored: false, detail: st === 0 ? 'a conexão caiu antes da resposta' : st === 429 ? 'muitas tentativas em pouco tempo; aguarde alguns segundos antes de verificar' : st >= 500 ? `a loja teve um erro temporário (HTTP ${st})` : `resposta inesperada da loja (HTTP ${st})` });
      }
      else {
        writePending(slug, null); const was = unknown; setUnknown(null);
        if (/pre[çc]o|frete|cota[çc][ãa]o|dispon|desatualiz|venc|expir/i.test(m)) { setQuote(null); setStep('delivery'); setInfo(''); setErrors({ changed: true }); }
        else if (was?.restored || !quote) setRecovered(m);
        else setErrors({ confirm: m });
      }
    } finally { sending.current = false; setBusy(false); }
  }
  function confirm() {
    if (!quote || !address) return;
    const body: CheckoutBody = { quote_id: quote.id, address, buyer: { name: buyer.name, email: buyer.email }, method: buyer.method, total_cents: quote.total_cents };
    void submit({ key: intentKey(quote.id, body), body, total: quote.total_cents });
  }
  const pendingPanel = unknown && <Alert tone="warning" role="alert" title="Não sabemos se a compra foi registrada">
    <p>{unknown.restored ? 'Uma confirmação de compra enviada nesta aba ficou sem resposta.' : `A resposta da loja não chegou${unknown.detail ? `: ${unknown.detail}` : ''}.`} A compra pode ter sido registrada. Não envie outra: “Verificar compra” reenvia exatamente a mesma confirmação de {money(unknown.intent.total)} — se ela já existir, você verá o pedido; se não existir, ela é registrada uma única vez.</p>
    <p className="small">Até a verificação terminar, itens, entrega e dados ficam travados para não mudar a compra pela metade.</p>
    <div className="cluster"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit(unknown.intent)}>{busy ? 'Verificando…' : 'Verificar compra'}</button></div>
  </Alert>;
  if (loadError) return <Alert tone="danger" role="alert" title="Não foi possível abrir o carrinho">{loadError}</Alert>;
  if (!cart) return <p role="status">Carregando carrinho…</p>;
  const invalid = cart.items.filter((i) => !i.active || i.status !== 'ACTIVE' || i.quantity > i.available);
  const steps: [string, boolean, boolean][] = [['Carrinho', true, false], ['Entrega', !!quote, step === 'delivery'], ['Seus dados', step === 'review', step === 'buyer'], ['Revisão', false, step === 'review']];
  const units = cart.items.reduce((n, i) => n + i.quantity, 0);
  // Mesmo conteúdo no resumo lateral (≥ 64em) e no resumo recolhível do topo (celular): itens, frete e total.
  const lines = <ul className="line-items">{cart.items.map((i) => <li key={i.variant_id}><span className="line-thumb">{thumbs[i.variant_id] ? <img src={thumbs[i.variant_id]} alt="" width={56} height={56} loading="lazy" /> : null}</span><span>{i.name}<br /><span className="muted">{i.quantity} × {money(i.price_cents)}</span></span><span className="money">{money((BigInt(i.price_cents) * BigInt(i.quantity)).toString())}</span></li>)}</ul>;
  const totals = <dl className="totals"><div><dt>Subtotal</dt><dd>{money(cart.subtotal_cents)}</dd></div><div><dt>Frete{quote ? ` · ${quote.method}` : ''}</dt><dd>{quote ? money(quote.price_cents) : 'calcule na entrega'}</dd></div>{quote && <div className="grand"><dt>Total</dt><dd>{money(quote.total_cents)}</dd></div>}</dl>;
  return <>
    <ol className="steps" aria-label="Etapas da compra">{steps.map(([l, done, current], i) => <li key={l} className={done && !current ? 'done' : undefined} aria-current={current ? 'step' : undefined}><span className="n">{done && !current ? <Icon name="check" size={16} /> : i + 1}</span><span className="l">{l}</span>{done && !current && <span className="sr-only"> (concluída)</span>}</li>)}</ol>
    <h1 style={{ padding: 'var(--space-16) 0 0' }}>Seu carrinho</h1>
    {unknown && (unknown.restored || step !== 'review') && <div style={{ paddingTop: 'var(--space-16)' }}>{pendingPanel}</div>}
    {recovered && <div style={{ paddingTop: 'var(--space-16)' }}><Alert tone="danger" role="alert" title="A confirmação anterior foi recusada pela loja">{recovered} Nenhum pedido foi criado por ela. Revise e confirme de novo.</Alert></div>}
    {cart.items.length === 0 ? <div style={{ padding: 'var(--space-24) 0 var(--space-48)' }}><EmptyState icon="cart" title="Seu carrinho está vazio" action={<a className="btn btn-primary" href={`/lojas/${slug}`}>Ver produtos</a>}>Adicionar itens não reserva estoque; a reserva acontece só ao confirmar a compra.</EmptyState></div> :
    <div className={`checkout${step === 'review' ? ' is-review' : ''}`}>
      <details className="mobile-summary">
        <summary><span className="ms-label">Resumo do pedido<span className="small muted"> · {units} {units === 1 ? 'unidade' : 'unidades'}</span></span><span className="ms-total"><span className="small muted">{quote ? 'Total' : 'Subtotal'}</span> <span className="money">{money(quote ? quote.total_cents : cart.subtotal_cents)}</span></span></summary>
        <div className="ms-body">{lines}{totals}</div>
      </details>
      <div className="checkout-main">
        <section className="step-block" aria-labelledby="t-items">
          <header><h2 id="t-items">Itens</h2>{step === 'delivery' || editItems ? <span className="small muted">Preços recalculados pela loja; adicionar itens não reserva estoque.</span> : <button type="button" className="btn btn-secondary btn-sm" aria-expanded={false} disabled={!!unknown} onClick={() => setEditItems(true)}>Alterar itens</button>}</header>
          {step !== 'delivery' && !editItems ? <p className="small">{cart.items.reduce((n, i) => n + i.quantity, 0)} {cart.items.reduce((n, i) => n + i.quantity, 0) === 1 ? 'unidade' : 'unidades'} · {money(cart.subtotal_cents)}. Mudar itens exige calcular a entrega de novo.</p> : <>
          {errors.cart && <Alert tone="danger" role="alert" title="Não foi possível atualizar o carrinho">{errors.cart}</Alert>}
          {invalid.length > 0 && <Alert tone="warning" role="alert" title="Revise o carrinho">Há item indisponível ou com quantidade acima do disponível. Ajuste para continuar.</Alert>}
          <ul className="cart-lines">{cart.items.map((i) => { const bad = !i.active || i.status !== 'ACTIVE' || i.quantity > i.available; return <li key={i.variant_id}><span className="line-thumb">{thumbs[i.variant_id] ? <img src={thumbs[i.variant_id]} alt="" width={56} height={56} loading="lazy" /> : null}</span><div className="cart-line-body">
            <p className="cart-line-head"><strong>{i.name}</strong><span className="money">{money((BigInt(i.price_cents) * BigInt(i.quantity)).toString())}</span></p><p className="small muted">{money(i.price_cents)} por unidade, código {i.sku}</p>
            {bad && <p className="error-text"><Icon name="alert" size={16} />{!i.active || i.status !== 'ACTIVE' ? 'Item indisponível. Remova-o para continuar.' : `Só há ${i.available} disponíveis.`}</p>}
            <div className="cart-line-actions">
              <div className="stepper" role="group" aria-label={`Quantidade de ${i.name}`}>
                <button type="button" aria-label={`Diminuir quantidade de ${i.name}`} disabled={busy || !!unknown || i.quantity <= 1} onClick={() => void change(i.variant_id, i.quantity - 1)}><Icon name="minus" /></button>
                <input inputMode="numeric" aria-label={`Quantidade de ${i.name}`} defaultValue={i.quantity} key={i.quantity} disabled={busy || !!unknown} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={(e) => { const n = Number(e.currentTarget.value.replace(/\D/g, '')); if (Number.isInteger(n) && n >= 0 && n <= 99 && n !== i.quantity) void change(i.variant_id, n); else e.currentTarget.value = String(i.quantity); }} />
                <button type="button" aria-label={`Aumentar quantidade de ${i.name}`} disabled={busy || !!unknown || i.quantity >= Math.min(99, i.available)} onClick={() => void change(i.variant_id, i.quantity + 1)}><Icon name="plus" /></button>
              </div>
              <button type="button" className="btn btn-quiet btn-sm" disabled={busy || !!unknown} onClick={() => void change(i.variant_id, 0)} aria-label={`Remover ${i.name}`}>Remover</button>
            </div></div></li>; })}</ul></>}
        </section>
        {info && <Alert tone="warning" role="status" title="Recalcule a entrega">{info}</Alert>}
        <section className="step-block" aria-labelledby="t-delivery">
          <header><h2 id="t-delivery" tabIndex={-1}>Entrega</h2>{step !== 'delivery' && quote && <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !!unknown} onClick={() => { setStep('delivery'); setQuote(null); }}>Alterar entrega</button>}</header>
          {step !== 'delivery' && quote && address ? <dl className="summary"><dt>Método</dt><dd>{quote.method}: {money(quote.price_cents)} · prazo {quote.days} {quote.days === 1 ? 'dia' : 'dias'}</dd><dt>Endereço</dt><dd>{address.street}, {address.number}{address.complement ? `, ${address.complement}` : ''} — {address.city}/{address.state} · CEP {address.cep}</dd></dl> :
          <form className="form" aria-label="Calcular frete" onSubmit={(e) => void quoteDelivery(e)}>
            {errors.delivery && <Alert tone="danger" role="alert" title="Não foi possível calcular a entrega">{errors.delivery}</Alert>}
            {errors.changed && <Alert tone="warning" role="alert" title="Os valores mudaram antes da confirmação">A loja recalculou preço, disponibilidade ou frete. Nenhum pedido foi criado. Calcule a entrega de novo e revise o novo total antes de confirmar; seus dados foram mantidos.</Alert>}
            <fieldset><legend>Como receber</legend><div className="pay-options">
              {[['TABLE', 'Entrega no endereço', 'Valor e prazo calculados pelo CEP.'], ['PICKUP', 'Retirada na loja', 'Sem frete; a loja avisa quando estiver pronto.'], ['CARRIER', 'Transportadora', 'Cotação na hora com a transportadora da loja.']].map(([k, l, h]) => <label className="pay-option" key={k}><input type="radio" name="kind-ui" checked={kind === k} onChange={() => setKind(k!)} /><span><strong>{l}</strong><br /><span className="small muted">{h}</span></span></label>)}
            </div></fieldset>
            <div className="form-grid">
              <Field label="CEP" error={errors.cep}>{(a) => <input className="input" name="cep" pattern="[0-9]{5}-?[0-9]{3}" inputMode="numeric" required autoComplete="postal-code" defaultValue={address?.cep} {...a} />}</Field>
            </div>
            <Field label="Rua">{(a) => <input className="input" name="street" required autoComplete="address-line1" defaultValue={address?.street} {...a} />}</Field>
            <div className="form-grid">
              <Field label="Número">{(a) => <input className="input" name="number" required autoComplete="off" defaultValue={address?.number} {...a} />}</Field>
              <Field label="Complemento" optional>{(a) => <input className="input" name="complement" autoComplete="address-line2" defaultValue={address?.complement} {...a} />}</Field>
            </div>
            <div className="form-grid">
              <Field label="Cidade">{(a) => <input className="input" name="city" required autoComplete="address-level2" defaultValue={address?.city} {...a} />}</Field>
              <Field label="UF">{(a) => <input className="input" name="state" minLength={2} maxLength={2} required autoComplete="address-level1" autoCapitalize="characters" defaultValue={address?.state} {...a} />}</Field>
            </div>
            {kind === 'PICKUP' && <p className="hint">O endereço fica registrado no pedido mesmo na retirada.</p>}
            <div><button className="btn btn-primary" disabled={busy || !cart.valid || invalid.length > 0 || !!unknown}>{busy ? 'Calculando…' : 'Calcular frete'}</button></div>
          </form>}
        </section>
        {quote && step !== 'delivery' && <section className="step-block" aria-labelledby="t-buyer">
          <header><h2 id="t-buyer" tabIndex={-1}>Seus dados</h2>{step === 'review' && <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !!unknown} onClick={() => setStep('buyer')}>Corrigir dados</button>}</header>
          {methods === undefined ? <p role="status" className="small">Consultando meios de pagamento…</p> : !methods?.simulation ? <Alert tone="warning" title="Pagamento indisponível">{methods?.reason || 'A loja ainda não tem meio de pagamento habilitado.'} Nenhum pedido será criado.</Alert> :
          step === 'buyer' ? <form className="form" aria-label="Dados do comprador" onSubmit={(e) => { const b = fields(e); setBuyer({ name: b.name!, email: b.email!, method: b.method! }); setStep('review'); }}>
            <Field label="Nome completo">{(a) => <input className="input" name="name" required maxLength={100} defaultValue={buyer.name} autoComplete="name" {...a} />}</Field>
            <Field label="E-mail para comprovante" hint="Enviamos o comprovante e o link de acompanhamento para este e-mail.">{(a) => <input className="input" name="email" type="email" required maxLength={200} defaultValue={buyer.email} autoComplete="email" spellCheck={false} {...a} />}</Field>
            <fieldset><legend>Forma de pagamento</legend><div className="pay-options">
              <label className="pay-option"><input type="radio" name="method" value="PIX" defaultChecked={buyer.method === 'PIX'} /><span><strong>Pix</strong> <span className="small muted">(simulado)</span><br /><span className="small muted">O pedido só é confirmado quando a loja recebe a confirmação do pagamento.</span></span></label>
              <label className="pay-option"><input type="radio" name="method" value="CARD" defaultChecked={buyer.method === 'CARD'} /><span><strong>Cartão</strong> <span className="small muted">(simulado)</span><br /><span className="small muted">Em operação real, os dados do cartão são digitados no formulário do meio de pagamento, não nesta loja.</span></span></label>
            </div></fieldset>
            <div><button className="btn btn-primary" disabled={busy}>Revisar pedido</button></div>
          </form> : <dl className="summary"><dt>Nome</dt><dd>{buyer.name}</dd><dt>E-mail para comprovante</dt><dd>{buyer.email}</dd><dt>Pagamento</dt><dd>{buyer.method === 'PIX' ? 'Pix' : 'Cartão'} (simulado)</dd></dl>}
        </section>}
        {quote && step === 'review' && methods?.simulation && <section className="confirm" aria-labelledby="t-review">
          <h2 id="t-review" tabIndex={-1}>Revise antes de confirmar</h2>
          <Alert tone="warning" title="Ambiente SIMULADO">Nenhum valor real é cobrado. Meios de pagamento reais aguardam homologação.</Alert>
          <div className="review-items"><h3 className="small">Itens</h3>{lines}</div>
          <dl className="totals"><div><dt>Subtotal</dt><dd>{money(cart.subtotal_cents)}</dd></div><div><dt>Frete ({quote.method})</dt><dd>{money(quote.price_cents)}</dd></div><div className="grand"><dt>Total a pagar</dt><dd>{money(quote.total_cents)}</dd></div></dl>
          <p className="small">Entrega: {quote.method}, prazo {quote.days} {quote.days === 1 ? 'dia' : 'dias'}{address ? ` · ${address.street}, ${address.number} — ${address.city}/${address.state}` : ''}.</p>
          <p className="small">Ao confirmar, você aceita as políticas do fornecedor exibidas no rodapé. Os itens ficam reservados por até 40 minutos aguardando o pagamento. Se preço, disponibilidade ou frete mudarem, a loja pede nova confirmação.</p>
          {errors.confirm && <Alert tone="danger" role="alert" title="A loja recusou a confirmação">{errors.confirm} Nenhum pedido foi criado por esta confirmação; corrija o que for preciso e confirme de novo.</Alert>}
          {unknown ? !unknown.restored && pendingPanel : <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Confirmando…' : `Confirmar compra de ${money(quote.total_cents)}`}</button>}
        </section>}
      </div>
      <section className="order-summary" aria-labelledby="t-summary">
        <h2 id="t-summary">Resumo</h2>
        {lines}
        {totals}
        <p className="small muted">Valores calculados pela loja.{quote ? ` Cotação de entrega válida até ${formatTime(quote.expires_at)}; depois disso o total é recalculado.` : ''} Não há cupons ou descontos nesta loja.</p>
      </section>
    </div>}
  </>;
}

type Ticket = { id: string; kind: string; status: string; outcome: string | null; resolution: string | null; created_at: string; due_at: string; messages: { id: string; author: string; body: string; created_at: string }[] };
type Shipment = { kind: string; carrier: string | null; tracking_code: string | null; ready_at: string | null; shipped_at: string | null; delivered_at: string | null };
type OrderData = { id: string; number: string; order_status: string; payment_status: string; fulfillment_status: string; dispute_status: string; subtotal_cents: string; shipping_cents: string; total_cents: string; created_at: string; reservation_expires_at: string; simulation: boolean; buyer: { name: string; email: string }; address: Address; supplier: Record<string, string>; shipping: { name: string; kind: string; days: number }; items: { variant_id: string; quantity: number; price_cents: string; snapshot: { name: string; sku: string; attributes: Record<string, string> } }[]; attempts: { id: string; method: string; status: string; environment: string }[]; incidents: { id: string; code: string; status: string }[]; protocols: { id: string; kind: string; status: string; created_at: string; due_at: string }[]; shipment: Shipment | null };
// O link do e-mail traz o segredo no fragmento; ele vai para o sessionStorage e sai da barra de endereço.
function accessHeader(orderId: string): Record<string, string> { let token = ''; try { const hash = new URLSearchParams(location.hash.slice(1)).get('acesso') || ''; if (hash) { sessionStorage.setItem(`acesso-${orderId}`, hash); history.replaceState(null, '', location.pathname); } token = sessionStorage.getItem(`acesso-${orderId}`) || ''; } catch { /* sem storage */ } return token ? { 'X-Order-Token': token } : {}; }
function Thread({ slug, orderId, id, auth }: { slug: string; orderId: string; id: string; auth: Record<string, string> }) {
  const [ticket, setTicket] = useState<Ticket | null>(null), [error, setError] = useState('');
  useEffect(() => { call(slug, `orders/${orderId}/requests/${id}`, undefined, auth).then(setTicket).catch((e) => setError(e.message)); }, [slug, orderId, id]);
  if (!ticket) return error ? <p className="error-text">{error}</p> : <p className="small">Carregando conversa…</p>;
  return <div className="stack-sm"><ol className="messages">{ticket.messages.map((m) => <li key={m.id} className={m.author === 'STAFF' ? 'staff' : ''}><p className="caption">{m.author === 'STAFF' ? 'Loja' : 'Você'} · {formatDateTime(m.created_at)}</p><p className="prose small">{m.body}</p></li>)}</ol>
    {ticket.status !== 'RESOLVED' ? <form className="form" aria-label={`Responder protocolo ${ticket.id}`} onSubmit={(e) => { const b = fields(e), form = e.currentTarget; void call(slug, `orders/${orderId}/requests/${id}/messages`, { body: b.body }, auth).then((t) => { setTicket(t); form.reset(); }).catch((err) => setError(err.message)); }}><Field label="Responder">{(a) => <textarea className="textarea" name="body" required maxLength={4000} {...a} />}</Field><div><button className="btn btn-secondary btn-sm">Enviar resposta</button></div></form> : <p className="small"><strong>Resultado:</strong> {ticket.resolution}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}</div>;
}
export function OrderView({ slug, orderId }: { slug: string; orderId: string }) {
  const [order, setOrder] = useState<OrderData | null>(null), [error, setError] = useState(''), [ack, setAck] = useState(''), [busy, setBusy] = useState(false), [auth, setAuth] = useState<Record<string, string>>({}), [open, setOpen] = useState(''), [requestError, setRequestError] = useState('');
  async function load(headers = auth) { try { setOrder(await call(slug, `orders/${orderId}`, undefined, headers)); setError(''); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { const headers = accessHeader(orderId); setAuth(headers); void load(headers); const timer = setInterval(() => void load(headers), 5000); return () => clearInterval(timer); }, [slug, orderId]);
  if (error && !order) return <section className="store-page stack-sm" style={{ paddingTop: 'var(--space-24)' }}><h1>Pedido</h1><Alert tone="danger" role="alert" title="Não foi possível abrir o pedido">{error}</Alert><p className="small">Abra pelo navegador usado na compra ou pelo link recebido por e-mail.</p></section>;
  if (!order) return <p role="status" style={{ padding: 'var(--space-24) 0' }}>Carregando pedido autorizado…</p>;
  const blocked = order.incidents.some((i) => i.status === 'OPEN'), retry = order.order_status === 'OPEN' && order.payment_status !== 'PAID' && order.attempts.length > 0 && order.attempts.every((a) => ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(a.status)), s = order.shipment;
  const awaiting = order.payment_status === 'PENDING' && order.order_status === 'OPEN' && !retry;
  return <section className="store-page stack" aria-label="Comprovante do pedido" style={{ paddingTop: 'var(--space-24)' }}>
    <div className="stack-sm"><p className="caption">{order.simulation ? 'Comprovante · pagamento simulado' : 'Comprovante'}</p><h1>Pedido nº {order.number}</h1><p className="small muted">Realizado em {formatDateTime(order.created_at)}. Guarde esta página ou o link recebido por e-mail.</p></div>
    {awaiting && <Alert tone="warning" role="status" title="Aguardando confirmação do pagamento"><p>Voltar do aplicativo do banco não confirma o pagamento. Esta página atualiza sozinha quando a loja receber a confirmação.</p>{order.reservation_expires_at && <p className="small">Itens reservados até {formatTime(order.reservation_expires_at)} de {formatDate(order.reservation_expires_at)}.</p>}</Alert>}
    {retry && <Alert tone="warning" title="O pagamento não foi aprovado">Nenhum valor foi confirmado. Você pode tentar pagar novamente; o pedido e os itens continuam os mesmos.<div className="cluster"><button className="btn btn-primary" disabled={busy} onClick={() => { setBusy(true); void call(slug, `orders/${orderId}/attempts`, { method: 'PIX', key: uid() }, auth).then(setOrder).catch((e) => setError(e.message)).finally(() => setBusy(false)); }}>Tentar pagar novamente</button></div></Alert>}
    {blocked && <Alert tone="warning" title="Pendência em análise pela loja">O envio fica bloqueado até a resolução. Se houver valor a devolver, a loja faz a devolução pelo meio de pagamento.</Alert>}
    <dl className="summary"><dt>Pedido</dt><dd><StatusBadge map={ORDER_STATUS} value={order.order_status} /></dd><dt>Pagamento</dt><dd><StatusBadge map={PAYMENT_STATUS} value={order.payment_status} /></dd><dt>Entrega</dt><dd><StatusBadge map={FULFILLMENT_STATUS} value={order.fulfillment_status} /></dd>{order.dispute_status !== 'NONE' && <><dt>Disputa</dt><dd><StatusBadge map={DISPUTE_STATUS} value={order.dispute_status} /></dd></>}</dl>
    {s && <p>{s.kind === 'PICKUP' ? (s.delivered_at ? `Retirado em ${formatDateTime(s.delivered_at)}.` : s.ready_at ? 'Pronto para retirada.' : '') : `Enviado por ${s.carrier}${s.tracking_code ? ` · rastreio ${s.tracking_code}` : ''}${s.delivered_at ? ` · entregue em ${formatDateTime(s.delivered_at)}` : ''}.`}</p>}
    <div className="checkout" style={{ padding: 0 }}>
      <section className="order-summary" aria-labelledby="t-order-items"><h2 id="t-order-items">Itens</h2>
        <ul className="line-items">{order.items.map((i) => <li key={i.variant_id} style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}><span>{i.snapshot.name}<br /><span className="muted">{Object.keys(i.snapshot.attributes || {}).length ? `${Object.values(i.snapshot.attributes).join(' / ')} · ` : ''}{i.quantity} × {money(i.price_cents)}</span></span><span className="money">{money((BigInt(i.price_cents) * BigInt(i.quantity)).toString())}</span></li>)}</ul>
        <dl className="totals"><div><dt>Subtotal</dt><dd>{money(order.subtotal_cents)}</dd></div><div><dt>Frete</dt><dd>{money(order.shipping_cents)}</dd></div><div className="grand"><dt>Total</dt><dd>{money(order.total_cents)}</dd></div></dl>
      </section>
      <div className="checkout-main">
        <dl className="summary"><dt>Entrega</dt><dd>{order.shipping.name}{order.shipping.kind === 'PICKUP' ? ' (retirada)' : ''} · {order.address.street === 'ANONIMIZADO' ? 'endereço anonimizado' : `${order.address.street}, ${order.address.number}${order.address.complement ? `, ${order.address.complement}` : ''} — ${order.address.city}/${order.address.state} · CEP ${order.address.cep}`}</dd><dt>Comprador</dt><dd>{order.buyer.email === 'anonimizado@invalid' ? 'Dados pessoais anonimizados' : `${order.buyer.name} · ${order.buyer.email}`}</dd><dt>Fornecedor</dt><dd>{order.supplier.name} · {order.supplier.email} · {order.supplier.address}</dd></dl>
        <section className="step-block" aria-labelledby="t-req">
          <header><h2 id="t-req">Atendimento, cancelamento ou arrependimento</h2></header>
          <p className="small">Você recebe um protocolo na hora. Receber a solicitação não confirma cancelamento nem devolução de valores; a loja responde em até 5 dias. O arrependimento (art. 49 do CDC) pode ser pedido em até 7 dias do recebimento.</p>
          <form className="form" aria-label="Abrir solicitação" onSubmit={(e) => { const b = fields(e), form = e.currentTarget; setBusy(true); setAck(''); setRequestError(''); void call(slug, `orders/${orderId}/requests`, { kind: b.kind, message: b.message, key: uid() }, auth).then((r) => { setAck(`Protocolo ${r.id} registrado em ${formatDateTime(r.created_at)}. ${r.acknowledgement}`); form.reset(); void load(); }).catch((err) => setRequestError(err.message)).finally(() => setBusy(false)); }}>
            <Field label="Tipo">{(a) => <select className="select" name="kind" {...a}><option value="SUPPORT">Atendimento</option><option value="WITHDRAWAL">Arrependimento (art. 49 CDC)</option><option value="CANCELLATION">Cancelamento</option><option value="DATA_ACCESS">Acesso aos meus dados</option><option value="DATA_ERASURE">Eliminação dos meus dados</option></select>}</Field>
            <Field label="Mensagem">{(a) => <textarea className="textarea" name="message" required maxLength={2000} {...a} />}</Field>
            <div><button className="btn btn-primary" disabled={busy}>Enviar solicitação</button></div>
          </form>
          {ack && <p role="status" className="alert alert-success" style={{ display: 'block' }}>{ack}</p>}{requestError && <Alert tone="danger" role="alert" title="A solicitação não foi enviada">{requestError} Seu texto foi mantido.</Alert>}
          {order.protocols.length > 0 && <div className="stack-sm"><h3>Seus protocolos</h3><ul className="stack-sm" style={{ listStyle: 'none' }}>{order.protocols.map((p) => <li key={p.id} className="stack-sm"><button type="button" className="btn btn-quiet btn-sm" style={{ paddingLeft: 0 }} aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? '' : p.id)}>{SUPPORT_KIND[p.kind] || p.kind} · {label(SUPPORT_STATUS, p.status)} · {formatDateTime(p.created_at)}</button><span className="caption" style={{ display: 'block' }}>Protocolo {p.id} · resposta até {formatDate(p.due_at)}</span>{open === p.id && <Thread slug={slug} orderId={orderId} id={p.id} auth={auth} />}</li>)}</ul></div>}
        </section>
      </div>
    </div>
  </section>;
}
export function ContactPage({ slug }: { slug: string }) {
  const [result, setResult] = useState<{ id: string; token: string; created_at: string; due_at: string } | null>(null), [ticket, setTicket] = useState<Ticket | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const follow = (id: string, token: string) => call(slug, `support/${id}`, undefined, { 'X-Support-Token': token }).then(setTicket);
  return <section className="store-page reading" aria-label="Atendimento">
    <h1>Fale com a loja</h1><p>Use este formulário sem precisar de compra. Você recebe um protocolo e um código de acompanhamento na hora.</p>
    <form className="form" aria-label="Contato geral" onSubmit={(e) => { const b = fields(e); setBusy(true); setError(''); void call(slug, 'support', { name: b.name, email: b.email, message: b.message, key: uid() }).then((r) => { setResult(r); return follow(r.id, r.token); }).catch((err) => setError(err.message)).finally(() => setBusy(false)); }}>
      <Field label="Nome">{(a) => <input className="input" name="name" required maxLength={100} autoComplete="name" {...a} />}</Field>
      <Field label="E-mail">{(a) => <input className="input" name="email" type="email" required maxLength={200} autoComplete="email" {...a} />}</Field>
      <Field label="Mensagem">{(a) => <textarea className="textarea" name="message" required maxLength={2000} {...a} />}</Field>
      <div><button className="btn btn-primary" disabled={busy}>Enviar</button></div>
    </form>
    {result && <Alert tone="success" role="status" title={`Protocolo ${result.id}`}><p>Registrado em {formatDateTime(result.created_at)}. Resposta até {formatDate(result.due_at)}.</p><p>Código de acompanhamento: <code>{result.token}</code>. Guarde-o; ele não é exibido de novo.</p><div><CopyButton value={result.token} label="Copiar código" /></div></Alert>}
    <h2>Acompanhar protocolo</h2>
    <form className="form" aria-label="Acompanhar protocolo" onSubmit={(e) => { const b = fields(e); setError(''); void follow(b.id!, b.token!).catch((err) => setError(err.message)); }}>
      <div className="form-grid"><Field label="Protocolo">{(a) => <input className="input" name="id" required {...a} />}</Field><Field label="Código de acompanhamento">{(a) => <input className="input" name="token" required {...a} />}</Field></div>
      <div><button className="btn btn-secondary">Consultar</button></div>
    </form>
    {ticket && <div className="stack-sm"><p className="cluster-tight"><Badge>{label(SUPPORT_STATUS, ticket.status)}</Badge><span className="small">aberto em {formatDateTime(ticket.created_at)}</span></p><ol className="messages">{ticket.messages.map((m) => <li key={m.id} className={m.author === 'STAFF' ? 'staff' : ''}><p className="caption">{m.author === 'STAFF' ? 'Loja' : 'Você'}</p><p className="prose small">{m.body}</p></li>)}</ol>{ticket.resolution && <p><strong>Resultado:</strong> {ticket.resolution}</p>}</div>}
    {error && <Alert tone="danger" role="alert" title="Não foi possível concluir">{error} Os dados digitados foram mantidos.</Alert>}
  </section>;
}
