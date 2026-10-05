'use client';
// Editor de aparência (TH01–TH04, UI02). Edita o tema v2 em memória, mostra a prévia ao vivo com o mesmo renderizador da loja
// (iframe /preview/[id]?editor=1 recebendo o tema por postMessage da mesma origem) e salva pelo fluxo existente:
// rascunho (com base_revision_id: nada sobrescreve em silêncio outra sessão) → publicar → histórico (restaurar/reverter).
// Nenhum CSS, HTML ou caminho interno é digitado pelo lojista: destinos e imagens são escolhidos de listas.
import Link from 'next/link';
import { type CSSProperties, type MouseEvent, type SyntheticEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { call, ApiError, useAction } from './api';
import { usePanel } from './Shell';
import { MediaUploader } from './MediaUploader';
import { Alert, Badge, ConfirmDialog, Feedback, Field, Loading, PageHeader, useLeaveGuard, useTitle } from '../ui/kit';
import { Icon } from '../ui/icons';
import { brandReport } from '../brand';
import { formatDateTime, slugify } from '../ui/format';
import { applyPreset, describeTarget, FONT_LABEL, newSection, PRESETS, referencedAssets, SECTION_LABEL, type Font, type Preset, type Section, type SectionType, type Target, type Theme, type ThemeLink } from '../theme-model';

type Product = { id: string; name: string; slug: string; status: string; category_id: string | null };
type Category = { id: string; name: string; slug: string };
type Media = { id: string; status: string };
type History = { id: string; created_at: string; title: string; preset: Preset; current: boolean };
type Settings = { revisions?: { id: string; content: Record<string, unknown> }[]; state?: { draft_revision_id: string | null; published_revision_id: string | null }; draft_theme: Theme | null; history: History[]; categories: Category[]; profile?: { profile: Record<string, unknown> } };
type Lists = { products: Product[]; categories: Category[]; pages: { slug: string; title: string }[]; media: Media[] };

function defaultTheme(title: string): Theme {
  const p = PRESETS.essencial;
  return { schema_version: 2, preset: 'essencial', title, description: '', brand: { color: p.color, font: p.brand.font, button: p.brand.button, logo: null }, layout: { ...p.layout }, sections: p.sections({ title, description: '' }), menu: [{ label: 'Início', to: { kind: 'home' } }, { label: 'Produtos', to: { kind: 'catalog' } }], footer: { links: [], note: '' }, pages: [], assets: [] };
}
const clean = (t: Theme): Theme => { const { supplier: _s, ...rest } = t as Theme & { supplier?: unknown }; return { ...rest, assets: referencedAssets(t) } as Theme; };
const same = (a: Theme, b: Theme) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));
const move = <T,>(list: T[], from: number, to: number) => { const next = [...list]; const [x] = next.splice(from, 1); next.splice(to, 0, x!); return next; };

export function AppearanceEditor() {
  const p = usePanel(), { busy, error, notice, run, setError, setNotice } = useAction();
  const [settings, setSettings] = useState<Settings | null>(null), [lists, setLists] = useState<Lists | null>(null), [loadError, setLoadError] = useState('');
  const [theme, setTheme] = useState<Theme | null>(null), [saved, setSaved] = useState<Theme | null>(null), [conflict, setConflict] = useState(false);
  const [tentative, setTentative] = useState<{ preset: Preset; replace: boolean } | null>(null), [mode, setMode] = useState<'editar' | 'previa'>('editar'), [device, setDevice] = useState<'phone' | 'desktop'>('desktop');
  // Prévia "Computador": a loja é desenhada com 1280 px de largura e reduzida para caber no quadro (layout real de desktop).
  const [scale, setScale] = useState(1), observer = useRef<ResizeObserver | null>(null);
  const stageRef = useCallback((el: HTMLDivElement | null) => { observer.current?.disconnect(); if (!el) return; observer.current = new ResizeObserver(([e]) => setScale(Math.min(1, (e?.contentRect.width || 1280) / 1280))); observer.current.observe(el); }, []);
  // Grupo de propriedades aberto (um por vez); no desktop o trilho escolhe, no celular os próprios blocos.
  const [group, setGroup] = useState<Group | null>('pagina'), [choosing, setChoosing] = useState(false), [editingSection, setEditingSection] = useState<string | null>(null);
  // Ação em andamento (rótulo do botão certo) e prévia ampliada (esconde trilho e propriedades no desktop).
  const [pending, setPending] = useState<'save' | 'publish' | null>(null), [wide, setWide] = useState(false);
  const [announce, setAnnounce] = useState(''), [confirm, setConfirm] = useState<null | { kind: 'restore' | 'rollback' | 'reload' | 'remove'; id?: string; label?: string }>(null);
  useTitle('Aparência');
  const load = useCallback(async () => {
    const [s, c] = await Promise.all([call<Settings>(`tenants/${p.tenantId}/storefront`, { csrf: p.csrf }), call<{ products: Product[]; categories: Category[]; media: Media[] }>(`tenants/${p.tenantId}/catalogue`, { csrf: p.csrf })]);
    const t = s.draft_theme ?? defaultTheme(p.store.name);
    setSettings(s); setTheme(t); setSaved(s.draft_theme); setConflict(false);
    setLists({ products: c.products, categories: c.categories, pages: t.pages, media: c.media });
  }, [p.tenantId, p.csrf, p.store.name]);
  useEffect(() => { void load().catch((e) => setLoadError(e.message)); }, [load]);
  const dirty = !!theme && (!saved || !same(theme, saved));
  const guard = useLeaveGuard(dirty && !busy);
  const shown = useMemo(() => (theme && tentative ? applyPreset(theme, tentative.preset, tentative.replace) : theme), [theme, tentative]);

  // Prévia ao vivo: envia o tema em edição ao iframe sempre que muda (e quando o iframe avisa que carregou).
  const frame = useRef<HTMLIFrameElement>(null);
  const push = useCallback(() => { if (shown) frame.current?.contentWindow?.postMessage({ type: 'theme-preview', theme: clean(shown) }, location.origin); }, [shown]);
  useEffect(() => { const t = setTimeout(push, 120); return () => clearTimeout(t); }, [push]);
  useEffect(() => { const ready = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === 'preview-ready') push(); }; window.addEventListener('message', ready); return () => window.removeEventListener('message', ready); }, [push]);
  useEffect(() => { const t = setTimeout(() => frame.current?.contentWindow?.postMessage({ type: 'highlight-section', id: group === 'pagina' ? editingSection : null }, location.origin), 200); return () => clearTimeout(t); }, [editingSection, group]);

  if (loadError) return <Alert tone="danger" role="alert" title="Não foi possível abrir o editor">{loadError} <button className="btn btn-secondary btn-sm" onClick={() => { setLoadError(''); void load().catch((e) => setLoadError(e.message)); }}>Tentar novamente</button></Alert>;
  if (!p.owner) return <><PageHeader title="Aparência" /><Alert tone="info" title="Somente o Dono altera a aparência">Você pode ver a loja publicada em <a href={`/lojas/${p.store.slug}`}>/lojas/{p.store.slug}</a>.</Alert></>;
  if (!settings || !theme || !lists) return <Loading label="Carregando a aparência da loja…" />;
  const L: Lists = { ...lists, pages: theme.pages };
  const set = (change: Partial<Theme>) => setTheme({ ...theme, ...change });
  const draftId = settings.state?.draft_revision_id ?? null, publishedId = settings.state?.published_revision_id ?? null;
  // Rascunho igual ao que está no ar? Compara o conteúdo das duas revisões (a publicada leva também o fornecedor congelado).
  const content = (id: string | null) => settings.revisions?.find((r) => r.id === id)?.content;
  const draftContent = content(draftId), liveContent = content(publishedId);
  const sameAsLive = !!draftContent && !!liveContent && (() => { const { supplier: _s, ...rest } = liveContent; return JSON.stringify(rest) === JSON.stringify(draftContent); })();
  const status = dirty ? <Badge tone="warning">Alterações não salvas</Badge> : !draftId ? <Badge>Ainda sem rascunho</Badge> : !publishedId ? <Badge tone="warning">Rascunho salvo, loja ainda não publicada</Badge>
    : sameAsLive ? <Badge tone="success">No ar, sem alterações pendentes</Badge> : draftContent && liveContent ? <Badge tone="warning">Rascunho salvo, ainda não publicado</Badge> : <Badge tone="success">Rascunho salvo</Badge>;
  const track = async (kind: 'save' | 'publish', action: () => Promise<unknown>) => { setPending(kind); try { return await action(); } finally { setPending(null); } };
  async function saveDraft() {
    setConflict(false);
    const ok = await run(async () => {
      try { await call(`tenants/${p.tenantId}/storefront/draft`, { method: 'POST', csrf: p.csrf, body: { ...clean(theme!), base_revision_id: draftId } }); }
      catch (e) { if (e instanceof ApiError && e.status === 409) { setConflict(true); throw new Error('Outra sessão salvou a aparência depois que você abriu o editor. Suas alterações continuam aqui, mas não foram gravadas.'); } throw e; }
      const s = await call<Settings>(`tenants/${p.tenantId}/storefront`, { csrf: p.csrf }); setSettings(s); setSaved(s.draft_theme); if (s.draft_theme) setTheme(s.draft_theme);
    }, 'Rascunho salvo. A loja publicada só muda quando você publicar.');
    return ok;
  }
  async function publish() {
    await run(async () => {
      // Publica exatamente o rascunho desta tela: se outra sessão gravou outro depois, a API recusa (409) e nada muda na loja.
      const revision = dirty ? await saveDraftInline() : draftId;
      if (!revision) throw new Error('Salve o rascunho antes de publicar.');
      try { await call(`tenants/${p.tenantId}/storefront/publish`, { method: 'POST', csrf: p.csrf, body: { revision_id: revision } }); }
      catch (e) {
        if (e instanceof ApiError && /fornecedor/i.test(e.message)) throw new Error('Para publicar, preencha os Dados da loja (identificação, contato e políticas).');
        if (e instanceof ApiError && e.status === 409 && /Rascunho mudou/i.test(e.message)) { setConflict(true); throw new Error('Outra sessão salvou outro rascunho depois que você abriu o editor. Nada foi publicado.'); }
        throw e;
      }
      await load(); await p.refresh();
    }, 'Aparência publicada na loja.');
  }
  // Salva dentro de outra ação (publicar) sem mensagens duplicadas; devolve a revisão gravada.
  async function saveDraftInline(): Promise<string> {
    try { return (await call<{ id: string }>(`tenants/${p.tenantId}/storefront/draft`, { method: 'POST', csrf: p.csrf, body: { ...clean(theme!), base_revision_id: draftId } })).id; }
    catch (e) { if (e instanceof ApiError && e.status === 409) { setConflict(true); throw new Error('Outra sessão salvou a aparência depois que você abriu o editor. Nada foi publicado.'); } throw e; }
  }
  const sections = theme.sections;
  // No desktop (≥75em) o trilho escolhe o grupo e o bloco aberto não fecha pelo título (nem por teclado): a coluna nunca fica vazia.
  const fold = (id: Group) => ({ 'data-group': id, id: `grupo-${id}`, open: group === id, onClick: (e: MouseEvent<HTMLDetailsElement>) => { if ((e.target as HTMLElement).closest('summary')?.parentElement === e.currentTarget && e.currentTarget.open && matchMedia('(min-width: 75em)').matches) e.preventDefault(); }, onToggle: (e: SyntheticEvent<HTMLDetailsElement>) => { const isOpen = e.currentTarget.open; if (isOpen && group !== id) setGroup(id); else if (!isOpen && group === id) setGroup(null); } });
  const preset = tentative?.preset ?? theme.preset;
  const groups: [Group, string, string][] = [['identidade', 'Identidade', theme.title], ['layout', 'Layout e fotos', 'Largura, densidade, fotos'], ['pagina', 'Página inicial', `${sections.filter((x) => !x.hidden).length} de ${sections.length} seções visíveis`], ['menu', 'Menu', `${theme.menu.length} ${theme.menu.length === 1 ? 'link' : 'links'}`], ['rodape', 'Rodapé', theme.footer.links.length ? `${theme.footer.links.length} links` : 'Páginas institucionais'], ['paginas', 'Páginas da loja', `${theme.pages.length} ${theme.pages.length === 1 ? 'página' : 'páginas'}`], ['historico', 'Histórico', settings.history.length === 1 ? '1 publicação' : `${settings.history.length} publicações`]];
  const applyTentative = () => { if (!tentative) return; setTheme(applyPreset(theme, tentative.preset, tentative.replace)); setTentative(null); setChoosing(false); setAnnounce(`Modelo ${PRESETS[tentative.preset].name} aplicado ao rascunho.`); };
  // Trilho: escolhe o grupo e leva o foco ao título do bloco (no desktop o bloco abre na coluna ao lado).
  const pick = (id: Group) => { setGroup(id); requestAnimationFrame(() => (document.querySelector(`#grupo-${id} > summary`) as HTMLElement | null)?.focus()); };
  const setSections = (next: Section[], message?: string) => { set({ sections: next }); if (message) setAnnounce(message); };
  return <div className="appearance">
    {guard}
    <PageHeader title="Aparência" meta={<span className="cluster-tight">{status}{publishedId && <a href={`/lojas/${p.store.slug}`}>Ver loja publicada</a>}</span>}
      actions={<><button type="button" className="btn btn-secondary" disabled={busy || !dirty} onClick={() => void track('save', saveDraft)}>{pending === 'save' ? 'Salvando…' : 'Salvar rascunho'}</button><button type="button" className="btn btn-primary" disabled={busy || (!dirty && (!draftId || sameAsLive))} onClick={() => void track('publish', publish)}>{pending === 'publish' ? 'Publicando…' : 'Publicar'}</button></>} />
    {/* No conflito, o aviso próprio abaixo já explica o que houve; o erro genérico repetiria a mensagem. */}
    <Feedback error={conflict ? undefined : error} notice={notice} />
    {conflict && <Alert tone="warning" role="alert" title="O rascunho mudou em outra sessão"><p>Para não sobrescrever o trabalho de outra pessoa, nada foi gravado. Recarregue para ver a versão mais recente (suas alterações desta tela serão descartadas).</p><div className="cluster-tight"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm({ kind: 'reload' })}>Recarregar a versão mais recente</button></div></Alert>}
    <div className="mode-switch" role="group" aria-label="Modo do editor">
      <button type="button" aria-pressed={mode === 'editar'} onClick={() => setMode('editar')}>Editar</button>
      <button type="button" aria-pressed={mode === 'previa'} onClick={() => setMode('previa')}>Prévia</button>
    </div>
    <div className={`appearance-body mode-${mode}${wide ? ' is-wide' : ''}`}>
      <div className="appearance-rail">
        {/* Modelo atual em destaque; a troca abre sob demanda, com miniaturas comparáveis e prévia antes de aplicar. */}
        <section className="model-current" aria-labelledby="t-model">
          <PresetThumb preset={theme.preset} color={theme.brand.color} />
          <div className="model-text"><h2 id="t-model" className="model-name"><span className="sr-only">Modelo atual: </span>{PRESETS[theme.preset].name}</h2><p className="small muted">{PRESETS[theme.preset].tagline}</p></div>
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={choosing || !!tentative} aria-controls="model-chooser" onClick={() => { if (choosing || tentative) { setChoosing(false); setTentative(null); } else setChoosing(true); }}>{choosing || tentative ? 'Fechar modelos' : 'Trocar modelo'}</button>
        </section>
        {(choosing || tentative) && <div className="model-chooser" id="model-chooser">
          <fieldset><legend>Modelos</legend><div className="preset-list">{(Object.keys(PRESETS) as Preset[]).map((k) => <label key={k} className={`preset-option${preset === k ? ' is-selected' : ''}`}>
            <input type="radio" name="preset" value={k} checked={preset === k} onChange={() => setTentative(k === theme.preset ? null : { preset: k, replace: false })} />
            <PresetThumb preset={k} color={theme.brand.color} />
            <span className="preset-name">{PRESETS[k].name}{k === theme.preset && <span className="muted small"> (atual)</span>}</span><span className="preset-summary">{PRESETS[k].tagline}</span>
          </label>)}</div></fieldset>
          {tentative && <div className="preset-confirm" role="region" aria-label="Confirmar troca de modelo">
            <p><strong>A prévia mostra o modelo {PRESETS[tentative.preset].name}.</strong> {PRESETS[tentative.preset].summary} Continuam: nome, cor, logo, textos, imagens, menu, rodapé e páginas.</p>
            <label className="check"><input type="checkbox" checked={tentative.replace} onChange={(e) => setTentative({ ...tentative, replace: e.target.checked })} /><span>Usar também as seções sugeridas do modelo <span className="muted small">(substitui a ordem e os tipos das seções; imagens e textos de destaque são aproveitados)</span></span></label>
            <div className="cluster-tight"><button type="button" className="btn btn-primary btn-sm" onClick={applyTentative}>Aplicar ao rascunho</button><button type="button" className="btn btn-secondary btn-sm mobile-only" onClick={() => setMode('previa')}>Ver na prévia</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setTentative(null)}>Cancelar</button></div>
          </div>}
        </div>}
        <nav className="group-nav" aria-label="Partes da loja"><ul>{groups.map(([id, label, hint]) => <li key={id}><button type="button" aria-expanded={group === id} aria-controls={`grupo-${id}`} onClick={() => pick(id)}><span className="group-label">{label}</span><span className="group-hint">{hint}</span></button></li>)}</ul></nav>
      </div>
      <div className="appearance-controls" aria-label="Propriedades">
        <IdentityPanel theme={theme} set={set} lists={L} fold={fold('identidade')} />
        <LayoutPanel theme={theme} set={set} fold={fold('layout')} />
        <details className="surface fold fold-section" {...fold('pagina')}>
          <summary><span className="fold-title">Página inicial</span><span className="fold-summary">{sections.filter((x) => !x.hidden).length} de {sections.length} seções visíveis</span></summary>
          <div className="fold-body stack-sm">
            <ol className="section-list" aria-label="Seções da página inicial, na ordem em que aparecem">{sections.map((x, i) => <SectionRow key={x.id} s={x} index={i} total={sections.length} lists={L} open={editingSection === x.id} onOpen={(o) => setEditingSection(o ? x.id : null)}
              onChange={(y) => setSections(sections.map((z) => (z.id === x.id ? y : z)))}
              onMove={(to) => setSections(move(sections, i, to), `${SECTION_LABEL[x.type]} movida para a posição ${to + 1} de ${sections.length}.`)}
              onToggle={() => setSections(sections.map((y) => (y.id === x.id ? { ...y, hidden: !y.hidden } as Section : y)), `${SECTION_LABEL[x.type]} ${x.hidden ? 'visível' : 'oculta'}.`)}
              onDuplicate={() => { if (sections.length >= 12) return setError('No máximo 12 seções.'); const copy = { ...newSection(x.type, sections), ...x, id: newSection(x.type, sections).id } as Section; setSections([...sections.slice(0, i + 1), copy, ...sections.slice(i + 1)], `${SECTION_LABEL[x.type]} duplicada.`); }}
              onRemove={() => setConfirm({ kind: 'remove', id: x.id, label: x.heading || SECTION_LABEL[x.type] })} />)}</ol>
            <AddSection onAdd={(type) => { if (sections.length >= 12) { setError('No máximo 12 seções.'); return; } const next = newSection(type, sections); setSections([...sections, next], `${SECTION_LABEL[type]} adicionada ao fim da página.`); setEditingSection(next.id); setNotice(''); }} />
          </div>
        </details>
        <details className="surface fold fold-section" {...fold('menu')}>
          <summary><span className="fold-title">Menu</span><span className="fold-summary">{theme.menu.length ? theme.menu.map((m) => m.label).join(', ') : 'Sem itens; o cabeçalho mostra só Atendimento'}</span></summary>
          <div className="fold-body"><LinkListEditor what="menu" max={10} links={theme.menu} lists={L} onChange={(menu) => set({ menu })} announce={setAnnounce} /></div>
        </details>
        <details className="surface fold fold-section" {...fold('rodape')}>
          <summary><span className="fold-title">Rodapé</span><span className="fold-summary">{theme.footer.links.length ? `${theme.footer.links.length} links` : 'Usa as páginas institucionais'}; dados do fornecedor sempre aparecem</span></summary>
          <div className="fold-body stack-sm"><LinkListEditor what="rodapé" max={8} links={theme.footer.links} lists={L} onChange={(links) => set({ footer: { ...theme.footer, links } })} announce={setAnnounce} />
            <Field label="Nota do rodapé" optional hint="Texto curto, por exemplo horário de atendimento.">{(a) => <textarea className="textarea" rows={2} maxLength={300} value={theme.footer.note} onChange={(e) => set({ footer: { ...theme.footer, note: e.target.value } })} {...a} />}</Field>
            <p className="small muted">Identificação do fornecedor, contato e políticas vêm de <Link href={`/painel/${p.tenantId}/configuracoes/loja`}>Dados da loja</Link> e não podem ser removidos.</p></div>
        </details>
        <PagesPanel theme={theme} set={set} fold={fold('paginas')} />
        <details className="surface fold fold-section" {...fold('historico')}>
          <summary><span className="fold-title">Histórico</span><span className="fold-summary">{settings.history.length === 1 ? '1 publicação recente' : settings.history.length ? `${settings.history.length} publicações recentes` : 'Nenhuma publicação ainda'}</span></summary>
          <div className="fold-body stack-sm">
            {publishedId && <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirm({ kind: 'restore' })}><Icon name="undo" size={16} />Trazer a versão publicada para o rascunho</button></div>}
            {settings.history.length === 0 ? <p className="small muted">Depois da primeira publicação, as versões aparecem aqui.</p> :
              <ol className="history-list">{settings.history.map((h) => <li key={h.id}><span><strong>{formatDateTime(h.created_at, p.timezone)}</strong><span className="small muted"> {PRESETS[h.preset]?.name ?? h.preset}, {h.title}</span></span>{h.current ? <Badge tone="success">No ar</Badge> : <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setConfirm({ kind: 'rollback', id: h.id, label: formatDateTime(h.created_at, p.timezone) })}>Republicar esta versão…</button>}</li>)}</ol>}
          </div>
        </details>
      </div>
      <div className="appearance-preview">
        {/* No celular, quem testa um modelo na Prévia decide ali mesmo, sem voltar ao modo Editar. */}
        {tentative && <div className="tentative-strip mobile-only" role="region" aria-label="Modelo em teste"><p className="small"><strong>Prévia do modelo {PRESETS[tentative.preset].name}</strong>, ainda não aplicado.</p><div className="cluster-tight"><button type="button" className="btn btn-primary btn-sm" onClick={applyTentative}>Aplicar {PRESETS[tentative.preset].name}</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setTentative(null)}>Cancelar</button></div></div>}
        <div className="preview-bar"><div className="segmented" role="group" aria-label="Largura da prévia"><button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}><Icon name="phone" size={16} />Celular</button><button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Icon name="desktop" size={16} />Computador</button></div>
          {/* Largura lógica e escala sempre informadas: a prévia de computador é desenhada em 1280 px e reduzida, nunca refeita na largura do quadro. */}
          <span className="preview-scale small num">{device === 'phone' ? 'Largura de 390 px' : `Largura de 1280 px, em ${Math.round(scale * 100)}%`}</span>
          <button type="button" className="btn btn-quiet btn-sm preview-widen" aria-pressed={wide} onClick={() => setWide(!wide)}><Icon name={wide ? 'back' : 'desktop'} size={16} />{wide ? 'Voltar às propriedades' : 'Ampliar prévia'}</button>
          <span className="small muted preview-state">{tentative ? `Prévia do modelo ${PRESETS[tentative.preset].name} (não aplicado)` : dirty ? 'Mostrando alterações não salvas' : 'Mostrando o rascunho salvo'}</span></div>
        <div ref={stageRef} className={`preview-stage device-${device}`} style={{ '--_scale': String(scale) } as CSSProperties}><iframe ref={frame} title="Prévia da loja com as alterações" src={`/preview/${p.tenantId}?editor=1`} onLoad={push} /></div>
      </div>
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    <ConfirmDialog open={confirm?.kind === 'remove'} title={`Remover a seção “${confirm?.label ?? ''}”?`} description={<p>A seção sai do rascunho. Nada muda na loja publicada até você publicar.</p>} confirmLabel="Remover seção" onClose={() => setConfirm(null)} onConfirm={() => { const s = sections.find((x) => x.id === confirm?.id); setSections(sections.filter((x) => x.id !== confirm?.id), s ? `${SECTION_LABEL[s.type]} removida.` : undefined); setConfirm(null); }} />
    <ConfirmDialog open={confirm?.kind === 'restore'} tone="primary" title="Trazer a versão publicada para o rascunho?" description={<p>O rascunho passa a ser igual ao que está no ar. {dirty ? 'As alterações não salvas desta tela serão descartadas.' : ''} A loja publicada não muda.</p>} confirmLabel="Restaurar no rascunho" busy={busy} onClose={() => setConfirm(null)}
      onConfirm={() => { setConfirm(null); void run(async () => { try { await call(`tenants/${p.tenantId}/storefront/draft/restore`, { method: 'POST', csrf: p.csrf, body: { base_revision_id: draftId } }); } catch (e) { if (e instanceof ApiError && e.status === 409) setConflict(true); throw e; } await load(); }, 'Versão publicada restaurada no rascunho.'); }} />
    <ConfirmDialog open={confirm?.kind === 'rollback'} tone="primary" title={`Republicar a versão de ${confirm?.label ?? ''}?`} description={<p>A loja volta a mostrar essa aparência agora, com os Dados da loja atuais. O rascunho não muda. A versão de agora continua no histórico.</p>} confirmLabel="Republicar esta versão" busy={busy} onClose={() => setConfirm(null)}
      onConfirm={() => { const target = confirm?.id; setConfirm(null); void run(async () => { await call(`tenants/${p.tenantId}/storefront/rollback`, { method: 'POST', csrf: p.csrf, body: { revision_id: target, expected_published_id: publishedId } }); await load(); }, 'Versão anterior publicada novamente.'); }} />
    <ConfirmDialog open={confirm?.kind === 'reload'} title="Descartar as alterações desta tela?" description={<p>O editor vai carregar o rascunho salvo pela outra sessão. As alterações feitas aqui desde a última gravação serão perdidas.</p>} confirmLabel="Descartar e recarregar" onClose={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void load(); }} />
  </div>;
}

// ---------- Identidade ----------
type Fold = { 'data-group': Group; id: string; open: boolean; onClick: (e: MouseEvent<HTMLDetailsElement>) => void; onToggle: (e: SyntheticEvent<HTMLDetailsElement>) => void };
type Group = 'identidade' | 'layout' | 'pagina' | 'menu' | 'rodape' | 'paginas' | 'historico';
// Miniatura esquemática do modelo (composição, não captura): abertura, ritmo da grade e cor da marca.
function PresetThumb({ preset, color }: { preset: Preset; color: string }) {
  return <span className={`preset-thumb thumb-${preset}`} style={{ '--_c': color } as CSSProperties} aria-hidden="true"><span className="pt-head" /><span className="pt-open" /><span className="pt-grid"><i /><i /><i /><i /></span></span>;
}
function IdentityPanel({ theme, set, lists, fold }: { theme: Theme; set: (c: Partial<Theme>) => void; lists: Lists; fold: Fold }) {
  const report = brandReport(theme), color = theme.brand.color;
  const brand = (c: Partial<Theme['brand']>) => set({ brand: { ...theme.brand, ...c } });
  const [hex, setHex] = useState(color); useEffect(() => setHex(color), [color]);
  return <details className="surface fold fold-section" {...fold}>
    <summary><span className="fold-title">Identidade</span><span className="fold-summary"><span className="swatch" style={{ background: color }} aria-hidden />{theme.title}, {FONT_LABEL[theme.brand.font].split(' (')[0]}</span></summary>
    <div className="fold-body stack-sm">
      <Field label="Nome da loja">{(a) => <input className="input" value={theme.title} maxLength={100} required onChange={(e) => set({ title: e.target.value })} {...a} />}</Field>
      <Field label="Descrição curta" optional hint="Aparece nos resultados de busca e no rodapé.">{(a) => <textarea className="textarea" rows={2} maxLength={300} value={theme.description} onChange={(e) => set({ description: e.target.value })} {...a} />}</Field>
      <ImagePicker label="Logo" value={theme.brand.logo} media={lists.media} onChange={(logo) => brand({ logo })} hint="Sem logo, o cabeçalho mostra o nome da loja na fonte dos títulos." />
      <Field label="Cor da marca" hint="Usada em botões, links e seleção.">{(a) => <div className="color-field"><input type="color" value={color} onChange={(e) => brand({ color: e.target.value.toUpperCase() })} aria-label="Escolher cor" /><input className="input mono-input" value={hex} maxLength={7} pattern="#[0-9A-Fa-f]{6}" spellCheck={false} autoComplete="off" autoCapitalize="characters" onChange={(e) => { const v = e.target.value.toUpperCase(); setHex(v); if (/^#[0-9A-F]{6}$/.test(v)) brand({ color: v }); }} onBlur={() => setHex(color)} {...a} /></div>}</Field>
      {report.adjusted ? <Alert tone="info" title="A loja usa uma versão ajustada desta cor"><p>{color} tem pouco contraste sobre o fundo do modelo. Botões usam <span className="swatch" style={{ background: report.fill }} aria-hidden /> {report.fill} com texto {report.onFill === '#FFFFFF' ? 'branco' : 'escuro'} e links usam {report.text}. A cor escolhida continua salva como {color}.</p></Alert> : <p className="small muted">Contraste suficiente: a cor é usada como está.</p>}
      <Field label="Fonte dos títulos" hint="Textos, preços e formulários usam sempre IBM Plex Sans.">{(a) => <select className="select" value={theme.brand.font} onChange={(e) => brand({ font: e.target.value as Font })} {...a}>{(Object.keys(FONT_LABEL) as Font[]).map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}</select>}</Field>
      <Choice legend="Botões" value={theme.brand.button} options={[['rounded', 'Arredondados'], ['square', 'Retos'], ['pill', 'Pílula']]} onChange={(button) => brand({ button: button as Theme['brand']['button'] })} />
    </div>
  </details>;
}
function LayoutPanel({ theme, set, fold }: { theme: Theme; set: (c: Partial<Theme>) => void; fold: Fold }) {
  const layout = (c: Partial<Theme['layout']>) => set({ layout: { ...theme.layout, ...c } });
  const label = { width: { narrow: 'Estreita', regular: 'Padrão', wide: 'Ampla' }, density: { comfortable: 'Confortável', compact: 'Compacta' }, ratio: { portrait: 'Retrato', square: 'Quadrada', landscape: 'Paisagem' }, fit: { cover: 'Preencher', contain: 'Foto inteira' } };
  return <details className="surface fold fold-section" {...fold}>
    <summary><span className="fold-title">Layout e fotos</span><span className="fold-summary">Largura {label.width[theme.layout.width].toLowerCase()}, {label.density[theme.layout.density].toLowerCase()}, fotos {label.ratio[theme.layout.ratio].toLowerCase()}</span></summary>
    <div className="fold-body stack-sm">
      <Choice legend="Largura do conteúdo" value={theme.layout.width} options={[['narrow', 'Estreita'], ['regular', 'Padrão'], ['wide', 'Ampla']]} onChange={(width) => layout({ width: width as Theme['layout']['width'] })} />
      <Choice legend="Densidade" value={theme.layout.density} options={[['comfortable', 'Confortável'], ['compact', 'Compacta']]} onChange={(density) => layout({ density: density as Theme['layout']['density'] })} hint="Compacta mostra mais produtos por linha, com menos espaço entre eles." />
      <Choice legend="Formato das fotos de produto" value={theme.layout.ratio} options={[['portrait', 'Retrato (4:5)'], ['square', 'Quadrada (1:1)'], ['landscape', 'Paisagem (4:3)']]} onChange={(ratio) => layout({ ratio: ratio as Theme['layout']['ratio'] })} />
      <Choice legend="Enquadramento" value={theme.layout.fit} options={[['cover', 'Preencher o quadro (pode cortar as bordas)'], ['contain', 'Mostrar a foto inteira (pode sobrar fundo)']]} onChange={(fit) => layout({ fit: fit as Theme['layout']['fit'] })} hint="A foto original nunca é alterada; isto só muda como ela aparece nas listas e no produto." />
    </div>
  </details>;
}
function Choice({ legend, value, options, onChange, hint }: { legend: string; value: string; options: [string, string][]; onChange: (v: string) => void; hint?: string }) {
  const name = useId();
  return <fieldset className="choice"><legend>{legend}</legend><div className="choice-options">{options.map(([v, l]) => <label key={v} className="choice-option"><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /><span>{l}</span></label>)}</div>{hint && <p className="hint">{hint}</p>}</fieldset>;
}

// ---------- Imagens ----------
function ImagePicker({ label, value, media, onChange, hint }: { label: string; value: string | null; media: Media[]; onChange: (id: string | null) => void; hint?: string }) {
  const p = usePanel(), [extra, setExtra] = useState<string[]>([]), ready = [...extra.map((id) => ({ id, status: 'READY' })), ...media.filter((m) => m.status === 'READY' && !extra.includes(m.id))];
  const [open, setOpen] = useState(false);
  return <fieldset className="image-picker"><legend>{label}</legend>
    <div className="image-current">{value ? <img src={`/api/tenants/${p.tenantId}/storefront/media/${value}/small`} alt="" width={64} height={64} /> : <span className="no-photo small">Nenhuma</span>}
      <div className="cluster-tight"><button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>{value ? 'Trocar imagem' : 'Escolher imagem'}</button>{value && <button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange(null)}>Remover</button>}</div></div>
    {hint && <p className="hint">{hint}</p>}
    {open && <div className="image-library">
      {ready.length > 0 ? <ul className="library-grid">{ready.slice(0, 30).map((m, i) => <li key={m.id}><button type="button" aria-pressed={value === m.id} onClick={() => { onChange(m.id); setOpen(false); }}><img src={`/api/tenants/${p.tenantId}/storefront/media/${m.id}/small`} alt="" width={96} height={96} loading="lazy" /><span className="sr-only">Usar a imagem {i + 1}</span></button></li>)}</ul> : <p className="small muted">Nenhuma imagem enviada ainda.</p>}
      <MediaUploader label="Enviar nova imagem" describe="JPEG, PNG ou WebP até 10 MB. Ao terminar o processamento, a imagem é escolhida para este campo." onReady={async (id) => { setExtra((x) => [id, ...x]); onChange(id); setOpen(false); return 'Pronta e escolhida.'; }} />
    </div>}
  </fieldset>;
}
function FocalPicker({ value, onChange }: { value: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void }) {
  return <fieldset className="focal"><legend>Ponto de foco da imagem</legend><p className="hint">Parte da foto que fica sempre visível quando o quadro corta a imagem.</p>
    <div className="form-grid"><Field label={`Horizontal (${value.x}%)`}>{(a) => <input type="range" min={0} max={100} step={5} value={value.x} onChange={(e) => onChange({ ...value, x: Number(e.target.value) })} {...a} />}</Field><Field label={`Vertical (${value.y}%)`}>{(a) => <input type="range" min={0} max={100} step={5} value={value.y} onChange={(e) => onChange({ ...value, y: Number(e.target.value) })} {...a} />}</Field></div>
  </fieldset>;
}

// ---------- Seções ----------
function SectionRow({ s, index, total, lists, open, onOpen, onChange, onMove, onToggle, onDuplicate, onRemove }: { s: Section; index: number; total: number; lists: Lists; open: boolean; onOpen: (open: boolean) => void; onChange: (s: Section) => void; onMove: (to: number) => void; onToggle: () => void; onDuplicate: () => void; onRemove: () => void }) {
  const name = SECTION_LABEL[s.type], title = s.heading || name, setOpen = onOpen;
  return <li className={`section-row${s.hidden ? ' is-hidden' : ''}${open ? ' is-open' : ''}`}>
    <div className="section-row-head">
      <span className="section-pos" aria-hidden>{index + 1}</span>
      <span className="section-name"><strong>{title}</strong><span className="small muted">{name}{s.hidden ? ', oculta' : ''}</span></span>
      <div className="section-actions">
        <button type="button" className="icon-button" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Mover ${title} para cima`}><Icon name="up" /></button>
        <button type="button" className="icon-button" disabled={index === total - 1} onClick={() => onMove(index + 1)} aria-label={`Mover ${title} para baixo`}><Icon name="down" /></button>
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Fechar' : 'Editar'}<span className="sr-only"> {title}</span></button>
      </div>
    </div>
    {open && <div className="section-editor stack-sm">
      <SectionFields s={s} lists={lists} onChange={onChange} />
      <div className="cluster-tight section-more"><button type="button" className="btn btn-quiet btn-sm" onClick={onToggle}>{s.hidden ? 'Mostrar na página' : 'Ocultar da página'}</button><button type="button" className="btn btn-quiet btn-sm" onClick={onDuplicate}><Icon name="duplicate" size={16} />Duplicar</button><button type="button" className="btn btn-quiet btn-sm danger-text" onClick={onRemove}><Icon name="trash" size={16} />Remover…</button></div>
    </div>}
  </li>;
}
function SectionFields({ s, lists, onChange }: { s: Section; lists: Lists; onChange: (s: Section) => void }) {
  const up = (c: Partial<Section>) => onChange({ ...s, ...c } as Section);
  const heading = <Field label="Título" optional>{(a) => <input className="input" value={s.heading} maxLength={120} onChange={(e) => up({ heading: e.target.value })} {...a} />}</Field>;
  if (s.type === 'hero') return <>{heading}
    <Field label="Texto" optional>{(a) => <textarea className="textarea" rows={3} maxLength={400} value={s.text} onChange={(e) => up({ text: e.target.value })} {...a} />}</Field>
    <ImagePicker label="Imagem" value={s.image} media={lists.media} onChange={(image) => up({ image })} hint="Sem imagem, o destaque vira só texto." />
    {s.image && <FocalPicker value={s.focal} onChange={(focal) => up({ focal })} />}
    <Choice legend="Composição" value={s.layout} options={[['overlay', 'Texto sobre a foto'], ['split', 'Foto ao lado do texto'], ['stacked', 'Foto acima do texto']]} onChange={(layout) => up({ layout: layout as 'overlay' | 'split' | 'stacked' })} />
    <fieldset><legend>Botão</legend>{s.cta ? <div className="stack-sm"><LinkFields link={s.cta} lists={lists} onChange={(cta) => up({ cta })} /><button type="button" className="btn btn-quiet btn-sm" onClick={() => up({ cta: null })}>Remover botão</button></div> : <button type="button" className="btn btn-secondary btn-sm" onClick={() => up({ cta: { label: 'Ver produtos', to: { kind: 'catalog' } } })}><Icon name="plus" size={16} />Adicionar botão</button>}</fieldset>
  </>;
  if (s.type === 'products') return <>{heading}
    <Choice legend="Quais produtos" value={s.source} options={[['all', 'Todos os produtos ativos'], ['category', 'De uma categoria'], ['manual', 'Escolher produtos']]} onChange={(source) => up({ source: source as 'all' | 'category' | 'manual', category: source === 'category' ? (s.category ?? lists.categories[0]?.slug ?? null) : null })} />
    {s.source === 'category' && (lists.categories.length ? <Field label="Categoria">{(a) => <select className="select" value={s.category ?? ''} onChange={(e) => up({ category: e.target.value })} {...a}>{lists.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>}</Field> : <p className="small muted">Crie categorias em Catálogo › Categorias e locais.</p>)}
    {s.source === 'manual' && <fieldset><legend>Produtos <span className="optional">({s.products.length} de 12)</span></legend><ul className="pick-list">{lists.products.filter((x) => x.status === 'ACTIVE').map((x) => <li key={x.id}><label className="check"><input type="checkbox" checked={s.products.includes(x.id)} disabled={!s.products.includes(x.id) && s.products.length >= 12} onChange={(e) => up({ products: e.target.checked ? [...s.products, x.id] : s.products.filter((y) => y !== x.id) })} /><span>{x.name}</span></label></li>)}</ul>{!lists.products.some((x) => x.status === 'ACTIVE') && <p className="small muted">Ative produtos no catálogo para escolhê-los aqui.</p>}</fieldset>}
    <Field label="Quantidade máxima">{(a) => <select className="select" value={s.limit} onChange={(e) => up({ limit: Number(e.target.value) as 4 | 8 | 12 | 24 })} {...a}>{[4, 8, 12, 24].map((n) => <option key={n} value={n}>{n} produtos</option>)}</select>}</Field>
  </>;
  if (s.type === 'categories') return <>{heading}
    <fieldset><legend>Categorias mostradas</legend><p className="hint">Nenhuma marcada mostra todas.</p>{lists.categories.length ? <ul className="pick-list">{lists.categories.map((c) => <li key={c.slug}><label className="check"><input type="checkbox" checked={s.categories.includes(c.slug)} onChange={(e) => up({ categories: e.target.checked ? [...s.categories, c.slug] : s.categories.filter((y) => y !== c.slug) })} /><span>{c.name}</span></label></li>)}</ul> : <p className="small muted">A loja ainda não tem categorias.</p>}</fieldset>
  </>;
  if (s.type === 'image_text') return <>{heading}
    <Field label="Texto" optional>{(a) => <textarea className="textarea" rows={4} maxLength={1200} value={s.text} onChange={(e) => up({ text: e.target.value })} {...a} />}</Field>
    <ImagePicker label="Imagem" value={s.image} media={lists.media} onChange={(image) => up({ image })} />
    {s.image && <FocalPicker value={s.focal} onChange={(focal) => up({ focal })} />}
    <Choice legend="Lado da imagem" value={s.side} options={[['start', 'Imagem à esquerda'], ['end', 'Imagem à direita']]} onChange={(side) => up({ side: side as 'start' | 'end' })} />
  </>;
  return <>{heading}<Field label="Texto">{(a) => <textarea className="textarea" rows={5} maxLength={2000} value={s.text} required onChange={(e) => up({ text: e.target.value })} {...a} />}</Field></>;
}
function AddSection({ onAdd }: { onAdd: (t: SectionType) => void }) {
  const [type, setType] = useState<SectionType>('products');
  return <div className="add-section"><Field label="Adicionar seção">{(a) => <select className="select" value={type} onChange={(e) => setType(e.target.value as SectionType)} {...a}>{(Object.keys(SECTION_LABEL) as SectionType[]).map((t) => <option key={t} value={t}>{SECTION_LABEL[t]}</option>)}</select>}</Field><button type="button" className="btn btn-secondary" onClick={() => onAdd(type)}><Icon name="plus" size={16} />Adicionar</button></div>;
}

// ---------- Destinos (menu, rodapé, botões) ----------
function LinkFields({ link, lists, onChange }: { link: ThemeLink; lists: Lists; onChange: (l: ThemeLink) => void }) {
  const to = link.to, setTo = (t: Target) => onChange({ ...link, to: t });
  const kindOptions: [Target['kind'], string][] = [['home', 'Início'], ['catalog', 'Todos os produtos'], ['category', 'Uma categoria'], ['product', 'Um produto'], ['page', 'Uma página da loja'], ['cart', 'Carrinho'], ['contact', 'Atendimento'], ['external', 'Site externo (avançado)']];
  return <div className="link-fields">
    <Field label="Texto do link">{(a) => <input className="input" value={link.label} maxLength={60} required onChange={(e) => onChange({ ...link, label: e.target.value })} {...a} />}</Field>
    <Field label="Leva para">{(a) => <select className="select" value={to.kind} onChange={(e) => { const kind = e.target.value as Target['kind']; setTo(kind === 'category' ? { kind, ref: lists.categories[0]?.slug } : kind === 'product' ? { kind, ref: lists.products.find((p) => p.status === 'ACTIVE')?.id } : kind === 'page' ? { kind, ref: lists.pages[0]?.slug } : kind === 'external' ? { kind, url: 'https://' } : { kind }); }} {...a}>{kindOptions.map(([k, l]) => <option key={k} value={k} disabled={(k === 'category' && !lists.categories.length) || (k === 'page' && !lists.pages.length) || (k === 'product' && !lists.products.some((p) => p.status === 'ACTIVE'))}>{l}</option>)}</select>}</Field>
    {to.kind === 'category' && <Field label="Categoria">{(a) => <select className="select" value={to.ref ?? ''} onChange={(e) => setTo({ kind: 'category', ref: e.target.value })} {...a}>{lists.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>}</Field>}
    {to.kind === 'product' && <Field label="Produto">{(a) => <select className="select" value={to.ref ?? ''} onChange={(e) => setTo({ kind: 'product', ref: e.target.value })} {...a}>{lists.products.filter((p) => p.status === 'ACTIVE').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</Field>}
    {to.kind === 'page' && <Field label="Página">{(a) => <select className="select" value={to.ref ?? ''} onChange={(e) => setTo({ kind: 'page', ref: e.target.value })} {...a}>{lists.pages.map((p) => <option key={p.slug} value={p.slug}>{p.title || p.slug}</option>)}</select>}</Field>}
    {to.kind === 'external' && <Field label="Endereço completo" hint="Somente endereços que começam com https://. Abre em outra aba." error={to.url && !/^https:\/\/[^\s]+\.[^\s]+/.test(to.url) ? 'Use um endereço completo começando com https://' : undefined}>{(a) => <input className="input" type="url" inputMode="url" value={to.url ?? ''} maxLength={300} onChange={(e) => setTo({ kind: 'external', url: e.target.value })} {...a} />}</Field>}
  </div>;
}
function LinkListEditor({ what, max, links, lists, onChange, announce }: { what: string; max: number; links: ThemeLink[]; lists: Lists; onChange: (l: ThemeLink[]) => void; announce: (m: string) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  return <div className="stack-sm">
    {links.length === 0 ? <p className="small muted">Nenhum link no {what}.</p> : <ol className="link-list">{links.map((l, i) => <li key={i}>
      <div className="section-row-head"><span className="section-name"><strong>{l.label || 'Sem texto'}</strong><span className="small muted">{describeTarget(l.to, { products: lists.products, categories: lists.categories, pages: lists.pages.map((p) => ({ slug: p.slug, title: p.title })) })}</span></span>
        <div className="section-actions"><button type="button" className="icon-button" disabled={i === 0} onClick={() => { onChange(move(links, i, i - 1)); announce(`${l.label} movido para a posição ${i} de ${links.length}.`); }} aria-label={`Mover ${l.label} para cima`}><Icon name="up" /></button><button type="button" className="icon-button" disabled={i === links.length - 1} onClick={() => { onChange(move(links, i, i + 1)); announce(`${l.label} movido para a posição ${i + 2} de ${links.length}.`); }} aria-label={`Mover ${l.label} para baixo`}><Icon name="down" /></button><button type="button" className="btn btn-secondary btn-sm" aria-expanded={editing === i} onClick={() => setEditing(editing === i ? null : i)}>{editing === i ? 'Fechar' : 'Editar'}<span className="sr-only"> {l.label}</span></button></div></div>
      {editing === i && <div className="section-editor stack-sm"><LinkFields link={l} lists={lists} onChange={(x) => onChange(links.map((y, j) => (j === i ? x : y)))} /><button type="button" className="btn btn-quiet btn-sm danger-text" onClick={() => { onChange(links.filter((_, j) => j !== i)); setEditing(null); announce(`${l.label} removido do ${what}.`); }}><Icon name="trash" size={16} />Remover do {what}</button></div>}
    </li>)}</ol>}
    {links.length < max && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onChange([...links, { label: 'Novo link', to: { kind: 'catalog' } }]); setEditing(links.length); announce(`Link adicionado ao ${what}.`); }}><Icon name="plus" size={16} />Adicionar link</button>}
  </div>;
}

// ---------- Páginas institucionais ----------
function PagesPanel({ theme, set, fold }: { theme: Theme; set: (c: Partial<Theme>) => void; fold: Fold }) {
  const pages = theme.pages, upd = (i: number, c: Partial<Theme['pages'][number]>) => set({ pages: pages.map((p, j) => (j === i ? { ...p, ...c } : p)) });
  const [open, setOpen] = useState<number | null>(null);
  return <details className="surface fold fold-section" {...fold}>
    <summary><span className="fold-title">Páginas da loja</span><span className="fold-summary">{pages.length ? pages.map((p) => p.title || p.slug).join(', ') : 'Nenhuma (ex.: Sobre, Trocas)'}</span></summary>
    <div className="fold-body stack-sm">
      {pages.length > 0 && <ol className="link-list">{pages.map((pg, i) => <li key={i}>
        <div className="section-row-head"><span className="section-name"><strong>{pg.title || 'Sem título'}</strong><span className="small muted">/paginas/{pg.slug || '…'}</span></span><div className="section-actions"><button type="button" className="btn btn-secondary btn-sm" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Fechar' : 'Editar'}<span className="sr-only"> {pg.title}</span></button></div></div>
        {open === i && <div className="section-editor stack-sm">
          <Field label="Título">{(a) => <input className="input" value={pg.title} maxLength={100} onChange={(e) => upd(i, { title: e.target.value, ...(pg.slug ? {} : { slug: slugify(e.target.value) }) })} {...a} />}</Field>
          <Field label="Endereço" hint="Letras minúsculas, números e hífens.">{(a) => <input className="input" value={pg.slug} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(e) => upd(i, { slug: e.target.value })} {...a} />}</Field>
          <Field label="Texto">{(a) => <textarea className="textarea" rows={6} maxLength={8000} value={pg.body} onChange={(e) => upd(i, { body: e.target.value })} {...a} />}</Field>
          <button type="button" className="btn btn-quiet btn-sm danger-text" onClick={() => { set({ pages: pages.filter((_, j) => j !== i), menu: theme.menu.filter((m) => !(m.to.kind === 'page' && m.to.ref === pg.slug)), footer: { ...theme.footer, links: theme.footer.links.filter((m) => !(m.to.kind === 'page' && m.to.ref === pg.slug)) } }); setOpen(null); }}><Icon name="trash" size={16} />Remover página (e seus links)</button>
        </div>}
      </li>)}</ol>}
      {pages.length < 10 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { set({ pages: [...pages, { slug: `pagina-${pages.length + 1}`, title: 'Nova página', body: 'Escreva aqui.' }] }); setOpen(pages.length); }}><Icon name="plus" size={16} />Adicionar página</button>}
    </div>
  </details>;
}
