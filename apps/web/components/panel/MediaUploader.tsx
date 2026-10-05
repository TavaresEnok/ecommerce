'use client';
// Envio de imagens (UI01). O <input type="file"> nativo continua sendo o controle (teclado, leitor de tela, seletor do
// sistema); a área ao redor só recebe arquivos arrastados e mostra a fila. Limites validados aqui são os mesmos da API
// (JPEG/PNG/WebP estático, 10 MB, 40 megapixels; no máximo 2 envios simultâneos por loja) — o servidor continua decidindo.
// O progresso mostrado é o do envio medido pelo navegador (XMLHttpRequest.upload); o processamento no servidor não tem
// porcentagem, então aparece como estado, consultado de novo até ficar pronto ou falhar.
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { usePanel } from './Shell';
import { Icon } from '../ui/icons';
import { bytes } from '../ui/format';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'], MAX_BYTES = 10 * 1024 * 1024, MAX_PIXELS = 40_000_000, PARALLEL = 2;
type Item = { key: string; file: File; preview: string; state: 'checking' | 'queued' | 'sending' | 'processing' | 'ready' | 'failed'; progress: number; message: string; assetId?: string; unlinked?: boolean };

async function check(file: File): Promise<string> {
  if (!TYPES.includes(file.type)) return 'Formato não aceito. Envie JPEG, PNG ou WebP.';
  if (file.size > MAX_BYTES) return `Arquivo com ${bytes(String(file.size))}; o limite é 10 MB.`;
  try {
    const bitmap = await createImageBitmap(file), pixels = bitmap.width * bitmap.height; bitmap.close();
    if (pixels > MAX_PIXELS) return `Imagem com ${(pixels / 1e6).toFixed(1).replace('.', ',')} megapixels; o limite é 40.`;
  } catch { return 'Não foi possível ler a imagem. Ela pode estar corrompida.'; }
  return '';
}

// compact: quando a galeria já tem imagens, a área de arrastar vira uma linha de ação (sem um grande retângulo permanente).
export function MediaUploader({ onReady, label = 'Adicionar imagens', describe, compact }: { onReady?: (assetId: string) => Promise<string | void>; label?: string; describe?: string; compact?: boolean }) {
  const p = usePanel(), inputId = useId(), hintId = `${inputId}-hint`, [items, setItems] = useState<Item[]>([]), [over, setOver] = useState(false);
  const live = useRef<HTMLParagraphElement>(null), [announce, setAnnounce] = useState('');
  const patch = (key: string, change: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(files: FileList | File[]) {
    const fresh = [...files].map((file) => ({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, preview: URL.createObjectURL(file), state: 'checking' as const, progress: 0, message: '' }));
    setItems((list) => [...list, ...fresh]);
    for (const item of fresh) { const problem = await check(item.file); patch(item.key, problem ? { state: 'failed', message: problem } : { state: 'queued' }); }
  }
  // Fila: no máximo dois envios ao mesmo tempo (o limite da loja na API).
  useEffect(() => {
    const sending = items.filter((i) => i.state === 'sending').length, next = items.filter((i) => i.state === 'queued').slice(0, Math.max(0, PARALLEL - sending));
    next.forEach((i) => send(i));
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  function send(item: Item) {
    patch(item.key, { state: 'sending', progress: 0, message: '' });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/tenants/${p.tenantId}/catalogue/media`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.setRequestHeader('X-CSRF-Token', p.csrf);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) patch(item.key, { progress: Math.round((e.loaded / e.total) * 100) }); };
    xhr.onerror = () => patch(item.key, { state: 'failed', message: 'A conexão caiu durante o envio. Tente de novo.' });
    xhr.onload = () => {
      let data: { id?: string; error?: unknown } = {}; try { data = JSON.parse(xhr.responseText); } catch { /* resposta sem JSON */ }
      if (xhr.status === 201 && data.id) { patch(item.key, { state: 'processing', progress: 100, assetId: data.id }); void follow(item.key, data.id); return; }
      const err = data.error as { message?: string } | string | undefined, text = typeof err === 'string' ? err : err?.message;
      patch(item.key, { state: 'failed', message: xhr.status === 413 ? 'Arquivo acima do limite de 10 MB.' : xhr.status === 401 ? 'Sua sessão expirou. Entre de novo e reenvie.' : text || `O envio não foi aceito (erro ${xhr.status}).` });
    };
    xhr.send(item.file);
  }
  // O processamento (WebP e tamanhos) roda no servidor; consulta a situação até pronto/falha, por no máximo ~2 minutos.
  async function follow(key: string, assetId: string) {
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((r) => setTimeout(r, attempt < 5 ? 1200 : 2500));
      const response = await fetch(`/api/tenants/${p.tenantId}/catalogue`, { cache: 'no-store' }).catch(() => null);
      if (!response?.ok) continue;
      const media = ((await response.json()) as { media: { id: string; status: string }[] }).media.find((m) => m.id === assetId);
      if (media?.status === 'READY') {
        await link(key, assetId); return;
      }
      if (media?.status === 'FAILED') { patch(key, { state: 'failed', message: 'O servidor não conseguiu processar esta imagem. Envie outra versão do arquivo.' }); return; }
    }
    patch(key, { state: 'failed', message: 'O processamento está demorando. Atualize a página em instantes; a imagem aparecerá em Imagens quando terminar.' });
  }
  // Vincula a imagem pronta (onReady); se falhar, o item oferece "Vincular de novo" com a mesma imagem, sem reenviar o arquivo.
  async function link(key: string, assetId: string) {
    let done = 'Pronta.';
    if (onReady) { try { done = (await onReady(assetId)) || 'Pronta e vinculada ao produto.'; } catch (e) { patch(key, { state: 'failed', unlinked: true, message: `Imagem pronta, mas não vinculada: ${e instanceof Error ? e.message : 'erro'}` }); return; } }
    patch(key, { state: 'ready', unlinked: false, message: done }); setAnnounce(`Imagem pronta. ${done}`);
  }
  function drop(e: DragEvent) { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void add(e.dataTransfer.files); }
  const stateText = (i: Item) => ({ checking: 'Conferindo arquivo…', queued: 'Na fila', sending: `Enviando ${i.progress}%`, processing: 'Processando no servidor…', ready: i.message, failed: i.message })[i.state];
  return <div className="uploader">
    <div className={`dropzone${over ? ' is-over' : ''}${compact ? ' is-compact' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <Icon name="upload" />
      <div className="dropzone-text">
        <label htmlFor={inputId} className="dropzone-label"><span className="btn btn-secondary">{label}</span><span className="dropzone-or">ou arraste os arquivos para esta área</span></label>
        <p className="hint" id={hintId}>{describe ?? 'JPEG, PNG ou WebP, até 10 MB e 40 megapixels cada. Duas imagens são enviadas por vez.'}</p>
      </div>
      <input id={inputId} className="file-input" type="file" accept={TYPES.join(',')} multiple aria-describedby={hintId} onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ''; }} />
    </div>
    {items.length > 0 && <ul className="upload-list" aria-label="Envios desta sessão">{items.map((i) => <li key={i.key} className={`upload-item is-${i.state}`}>
      <img src={i.preview} alt="" width={48} height={48} />
      <div className="upload-info">
        <span className="upload-name">{i.file.name} <span className="muted">({bytes(String(i.file.size))})</span></span>
        {i.state === 'sending' ? <span className="upload-progress"><progress max={100} value={i.progress} aria-label={`Envio de ${i.file.name}`} /> <span className="small">{i.progress}%</span></span> :
          <span className={`small ${i.state === 'failed' ? 'error-text' : i.state === 'ready' ? 'success-text' : 'muted'}`}>{i.state === 'failed' && <Icon name="alert" size={16} />}{i.state === 'ready' && <Icon name="tick" size={16} />}{stateText(i)}</span>}
      </div>
      <div className="upload-actions">
        {i.state === 'failed' && !i.assetId && TYPES.includes(i.file.type) && i.file.size <= MAX_BYTES && <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch(i.key, { state: 'queued', message: '', progress: 0 })}>Tentar de novo</button>}
        {i.state === 'failed' && i.unlinked && i.assetId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { patch(i.key, { state: 'processing', message: '' }); void link(i.key, i.assetId!); }}>Vincular de novo</button>}
        {['failed', 'ready', 'queued'].includes(i.state) && <button type="button" className="btn btn-quiet btn-sm" onClick={() => { URL.revokeObjectURL(i.preview); setItems((list) => list.filter((x) => x.key !== i.key)); }} aria-label={`${i.state === 'queued' ? 'Cancelar o envio de' : 'Tirar da lista'} ${i.file.name}`}>{i.state === 'queued' ? 'Cancelar' : 'Tirar da lista'}</button>}
      </div>
    </li>)}</ul>}
    <p className="sr-only" role="status" ref={live}>{announce}</p>
  </div>;
}
