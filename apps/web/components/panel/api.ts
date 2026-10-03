'use client';
// Cliente das chamadas do painel. Mantém as mesmas URLs, métodos e cabeçalhos (CSRF) usados antes do redesign.
import { useCallback, useState } from 'react';

export class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export function messageOf(status: number, data: unknown): string {
  const d = data as { error?: unknown; message?: unknown } | null;
  const e = d?.error as { message?: unknown } | string | undefined;
  // 401 com motivo próprio do servidor (ex.: “Credenciais inválidas.” no login) é mostrado como veio; sem motivo, é sessão.
  if (status === 401) return e && typeof e === 'object' && typeof e.message === 'string' && e.message !== 'Unauthorized' ? e.message : 'Sua sessão expirou ou não foi iniciada. Entre novamente para continuar.';
  if (typeof e === 'string') return e;
  if (e && Array.isArray(e.message)) return e.message.join('; ');
  if (e && typeof e.message === 'string') return e.message;
  if (typeof d?.message === 'string') return d.message;
  if (status === 403) return 'Você não tem permissão para esta ação.';
  if (status === 404) return 'Não encontrado ou sem acesso.';
  return `Não foi possível concluir (erro ${status}). Tente novamente.`;
}
type Options = { method?: string; body?: unknown; csrf?: string; headers?: Record<string, string>; raw?: BodyInit; rawType?: string };
export async function call<T = any>(path: string, { method = 'GET', body, csrf = '', headers = {}, raw, rawType }: Options = {}): Promise<T> {
  const write = method !== 'GET' && method !== 'HEAD';
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method, cache: 'no-store', credentials: 'same-origin',
      headers: { ...(raw ? { 'Content-Type': rawType || 'application/octet-stream' } : write ? { 'Content-Type': 'application/json' } : {}), 'X-CSRF-Token': csrf, ...headers },
      body: raw ?? (write ? JSON.stringify(body ?? {}) : undefined),
    });
  } catch { throw new ApiError(0, 'Não foi possível conectar. Verifique a conexão e tente novamente.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, messageOf(response.status, data));
  return data as T;
}
// Executa uma ação com estado de envio, erro e confirmação persistentes até a próxima ação.
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const run = useCallback(async (task: () => Promise<unknown>, done?: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); if (done) setNotice(done); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha inesperada.'); return false; }
    finally { setBusy(false); }
  }, []);
  return { busy, error, notice, run, setError, setNotice };
}
export const fields = (form: HTMLFormElement) => Object.fromEntries(new FormData(form)) as Record<string, string>;
