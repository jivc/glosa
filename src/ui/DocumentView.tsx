import { ChevronDown, ChevronUp, Copy, Expand, Highlighter, ListTree, MessageSquareText, Minimize2, Minus, MoveHorizontal, Plus, Quote, Search, StickyNote, Tag, Trash2, Type, WandSparkles, X } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { expandRange, wordCount } from '../core/analysis';
import { pageOf, quotationNumber } from '../core/model';
import type { Code, Doc, ID, Quotation } from '../core/types';
import { modKey } from '../platform';
import { useStore } from '../store';
import { CodeChip, InlineEdit, useContextMenu } from './common';
import { CodePicker } from './CodePicker';
import { editQuotationComment } from './comments';

const WIDTH_LABEL = { normal: 'columna de lectura', wide: 'amplio', full: 'toda la ventana' } as const;
const NEXT_WIDTH = { normal: 'wide', wide: 'full', full: 'normal' } as const;

interface Para { start: number; end: number; level: number; pageBefore?: number }
interface Seg { start: number; end: number; qs: Quotation[]; hit?: number; pending?: boolean }

function buildParas(doc: Doc): Para[] {
  const out: Para[] = [];
  const heads = new Map((doc.headings ?? []).map((h) => [h.start, h.level]));
  const pages = doc.pageStarts ?? [];
  let pi = 0;
  let i = 0;
  const t = doc.text;
  while (i <= t.length) {
    let j = t.indexOf('\n', i);
    if (j < 0) j = t.length;
    if (j > i) {
      let pageBefore: number | undefined;
      while (pi < pages.length && pages[pi] <= i) { pageBefore = pi + 1; pi++; }
      out.push({ start: i, end: j, level: heads.get(i) ?? 0, pageBefore: pages.length > 1 ? pageBefore : undefined });
    }
    i = j + 1;
  }
  return out;
}

const alpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

function segBackground(qs: Quotation[], codes: Map<ID, Code>, focusCode: ID | null) {
  if (!qs.length) return undefined;
  const colors = qs.flatMap((q) => q.codeIds.map((c) => codes.get(c)?.color).filter(Boolean)) as string[];
  if (focusCode) {
    const has = qs.some((q) => q.codeIds.includes(focusCode));
    if (!has) return alpha('#808080', 0.08);
    const c = codes.get(focusCode)!.color;
    return alpha(c, 0.32);
  }
  if (!colors.length) return alpha('#7a8494', qs.length > 1 ? 0.28 : 0.18);
  const depth = Math.min(3, qs.length);
  return alpha(colors[0], 0.14 + 0.09 * depth);
}

export function DocumentView({ docId }: { docId: ID }) {
  const project = useStore((s) => s.project!);
  const prefs = useStore((s) => s.prefs);
  const activeQ = useStore((s) => s.activeQuotationId);
  const selected = useStore((s) => s.selected);
  const scrollTarget = useStore((s) => s.scrollTarget);
  const lastCodeIds = useStore((s) => s.lastCodeIds);
  const st = useStore.getState;
  const doc = project.documents.find((d) => d.id === docId)!;
  const codes = useMemo(() => new Map(project.codes.map((c) => [c.id, c])), [project.codes]);
  const quotes = useMemo(() => project.quotations.filter((q) => q.docId === docId).sort((a, b) => a.start - b.start || b.end - a.end), [project.quotations, docId]);
  const paras = useMemo(() => buildParas(doc), [doc]);
  const focusCode = selected?.kind === 'code' && codes.has(selected.id) ? selected.id : null;

  const wrapRef = useRef<HTMLDivElement>(null);
  // Ancho disponible: en ventanas angostas el margen de códigos se reduce para no aplastar el texto.
  const [wrapW, setWrapW] = useState(1200);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const textRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; target: 'sel' | ID; initial?: string } | null>(null);
  const [menu, openMenu] = useContextMenu();
  const [search, setSearch] = useState<{ open: boolean; term: string; cur: number }>({ open: false, term: '', cur: 0 });
  const [font, setFont] = useState<'sans' | 'serif'>('sans');
  const [size, setSize] = useState(prefs.fontSize);
  useEffect(() => setSize(prefs.fontSize), [prefs.fontSize]);
  useEffect(() => {
    useStore.setState({ docSelection: sel ? { docId, ...sel } : null });
    return () => { if (useStore.getState().docSelection?.docId === docId) useStore.setState({ docSelection: null }); };
  }, [sel, docId]);

  const hits = useMemo(() => {
    if (!search.term.trim()) return [] as { start: number; end: number }[];
    const esc = search.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...doc.text.matchAll(new RegExp(esc, 'gi'))].slice(0, 5000).map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
  }, [doc.text, search.term]);

  // ---------------------------------------------------------- selección → posiciones
  const posFrom = useCallback((node: Node, offset: number, isEnd: boolean): number | null => {
    const root = textRef.current!;
    if (!root.contains(node)) return null;
    if (node.nodeType === 3) {
      const span = node.parentElement?.closest('[data-s]') as HTMLElement | null;
      if (!span) return null;
      return Number(span.dataset.s) + offset;
    }
    const el = node as HTMLElement;
    if (el === root) {
      const p = root.querySelectorAll<HTMLElement>('p[data-s]');
      if (!p.length) return 0;
      return offset >= root.childNodes.length ? Number(p[p.length - 1].dataset.e) : Number((root.childNodes[offset] as HTMLElement)?.dataset?.s ?? p[0].dataset.s);
    }
    const holder = el.closest('[data-s]') as HTMLElement | null;
    if (!holder) return null;
    if (offset >= el.childNodes.length) return Number(holder.dataset.e ?? holder.dataset.s);
    const child = el.childNodes[offset] as HTMLElement;
    const s = child?.dataset?.s ?? (child?.parentElement as HTMLElement)?.dataset?.s;
    return s != null ? Number(s) : isEnd ? Number(holder.dataset.e) : Number(holder.dataset.s);
  }, []);

  const readSelection = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    let a = posFrom(r.startContainer, r.startOffset, false);
    let b = posFrom(r.endContainer, r.endOffset, true);
    if (a == null || b == null) return null;
    if (a > b) [a, b] = [b, a];
    // Recortar espacios en los extremos y completar palabras cortadas a la mitad.
    const t = doc.text;
    const w = (c: string | undefined) => !!c && /[\p{L}\p{N}'’-]/u.test(c);
    while (a < b && /\s/.test(t[a])) a++;
    while (b > a && /\s/.test(t[b - 1])) b--;
    while (a > 0 && w(t[a - 1]) && w(t[a])) a--;
    while (b < t.length && w(t[b - 1]) && w(t[b])) b++;
    if (b <= a) return null;
    const rect = r.getBoundingClientRect();
    return { start: a, end: b, rect };
  }, [posFrom, doc.text]);

  const placeToolbar = (rect: DOMRect) => {
    const w = wrapRef.current!.getBoundingClientRect();
    setToolbarPos({ x: Math.max(8, Math.min(w.width - 470, rect.left - w.left + rect.width / 2 - 200)), y: rect.top - w.top + wrapRef.current!.scrollTop - 46 });
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const r = readSelection();
    if (r) {
      setSel({ start: r.start, end: r.end });
      placeToolbar(r.rect);
      window.getSelection()?.removeAllRanges();
      return;
    }
    // Clic simple: activar la cita más interna bajo el cursor (y alternar entre solapadas).
    const span = (e.target as HTMLElement).closest('[data-q]') as HTMLElement | null;
    setSel(null); setToolbarPos(null);
    if (!span) { if (activeQ && quotes.some((q) => q.id === activeQ)) st().setActiveQuotation(null); return; }
    const ids = span.dataset.q!.split(' ');
    const list = ids.map((id) => quotes.find((q) => q.id === id)!).filter(Boolean).sort((a, b) => (a.end - a.start) - (b.end - b.start));
    const cur = list.findIndex((q) => q.id === activeQ);
    st().setActiveQuotation(list[(cur + 1) % list.length].id);
  };

  // ---------------------------------------------------------- acciones de codificación
  const clearSel = () => { setSel(null); setToolbarPos(null); };
  const codeSel = (ids: ID[]) => { if (sel) st().codeRange(docId, sel.start, sel.end, ids); clearSel(); };
  const inVivo = () => {
    if (!sel) return;
    const name = doc.text.slice(sel.start, sel.end).replace(/\s+/g, ' ').replace(/^[«"“'¿¡]+|[»"”'.,;:!?]+$/g, '').trim().slice(0, 60);
    const id = st().createCode(name);
    codeSel([id]);
  };
  const freeQuote = () => { if (sel) st().createQuotation(docId, sel.start, sel.end); clearSel(); };
  const memoForSel = () => {
    if (!sel) return;
    const qid = st().codeRange(docId, sel.start, sel.end, []);
    const mid = st().createMemo('Memo sobre ' + quotationNumber(st().project!, st().project!.quotations.find((q) => q.id === qid)!), [{ kind: 'quotation', id: qid }]);
    clearSel();
    st().openTab('memo', mid);
  };
  const expandSel = (unit: 'sentence' | 'paragraph') => {
    if (!sel) return;
    const r = expandRange(doc.text, sel.start, sel.end, unit);
    setSel(r);
  };
  const openPicker = (target: 'sel' | ID, initial?: string) => {
    const tb = toolbarPos && wrapRef.current ? wrapRef.current.getBoundingClientRect() : null;
    const x = tb ? tb.left + toolbarPos!.x : window.innerWidth / 2 - 160;
    const y = tb ? tb.top + toolbarPos!.y - wrapRef.current!.scrollTop + 44 : 200;
    setPicker({ x, y, target, initial });
  };

  // Atajos de teclado dentro del documento
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (st().activeTab !== `document:${docId}` || st().dialog) return;
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const mod = e.metaKey || e.ctrlKey;
      if (sel && mod && e.key.toLowerCase() === 'j') { e.preventDefault(); openPicker('sel'); }
      else if (sel && mod && e.key.toLowerCase() === 'l' && st().lastCodeIds[0]) { e.preventDefault(); codeSel([st().lastCodeIds[0]]); }
      else if (sel && mod && e.key.toLowerCase() === 'i') { e.preventDefault(); inVivo(); }
      else if (sel && mod && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); memoForSel(); }
      else if (!sel && activeQ && mod && e.key.toLowerCase() === 'j') { e.preventDefault(); openPicker(activeQ); }
      else if (e.key === 'Escape' && sel) clearSel();
      else if (mod && e.key.toLowerCase() === 'g' && search.open) { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && activeQ && !sel && quotes.some((q) => q.id === activeQ)) {
        e.preventDefault();
        const q = quotes.find((x) => x.id === activeQ)!;
        st().deleteQuotations([q.id]);
        st().toast('Cita eliminada', 'info', { label: 'Deshacer', run: () => st().undo() });
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // ---------------------------------------------------------- desplazamiento a una cita
  useEffect(() => {
    if (!scrollTarget || scrollTarget.docId !== docId) return;
    requestAnimationFrame(() => {
      const spans = [...textRef.current!.querySelectorAll<HTMLElement>('[data-s]')].filter((s) => s.tagName === 'SPAN');
      const target = spans.find((s) => Number(s.dataset.s) <= scrollTarget.start && Number(s.dataset.e) > scrollTarget.start) ?? spans.find((s) => Number(s.dataset.s) >= scrollTarget.start);
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        spans.filter((s) => Number(s.dataset.s) < scrollTarget.end && Number(s.dataset.e) > scrollTarget.start).forEach((s) => {
          s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash');
        });
      }
    });
  }, [scrollTarget, docId]);

  const step = (d: number) => {
    if (!hits.length) return;
    const n = (search.cur + d + hits.length) % hits.length;
    setSearch((s) => ({ ...s, cur: n }));
    requestAnimationFrame(() => textRef.current?.querySelector('.hit.cur')?.scrollIntoView({ block: 'center' }));
  };
  useEffect(() => { requestAnimationFrame(() => textRef.current?.querySelector('.hit.cur')?.scrollIntoView({ block: 'center' })); }, [search.term]);

  // ---------------------------------------------------------- arrastrar códigos al texto
  const onDrop = (e: React.DragEvent) => {
    const codeId = e.dataTransfer.getData('application/x-glosa-code');
    if (!codeId) return;
    e.preventDefault();
    if (sel) { codeSel([codeId]); return; }
    const span = (e.target as HTMLElement).closest('[data-q]') as HTMLElement | null;
    if (span) {
      const qid = activeQ && span.dataset.q!.split(' ').includes(activeQ) ? activeQ : span.dataset.q!.split(' ')[0];
      st().toggleCodeOnQuotation(qid, codeId, true);
      st().setActiveQuotation(qid);
    } else st().toast('Primero selecciona un fragmento de texto y luego suelta el código sobre él.', 'info');
  };

  const onContext = (e: React.MouseEvent) => {
    const r = readSelection();
    const span = (e.target as HTMLElement).closest('[data-q]') as HTMLElement | null;
    if (r || sel) {
      if (r) { setSel({ start: r.start, end: r.end }); placeToolbar(r.rect); window.getSelection()?.removeAllRanges(); }
      openMenu(e, [
        { label: 'Codificar…', icon: <Tag size={15} />, kbd: `${modKey}J`, onClick: () => openPicker('sel') },
        { label: 'Codificación in vivo', icon: <WandSparkles size={15} />, kbd: `${modKey}I`, onClick: inVivo },
        { label: 'Crear cita libre', icon: <Quote size={15} />, onClick: freeQuote },
        { label: 'Crear cita con memo', icon: <StickyNote size={15} />, onClick: memoForSel },
        { sep: true },
        { label: 'Ampliar a la oración', icon: <Expand size={15} />, onClick: () => expandSel('sentence') },
        { label: 'Ampliar al párrafo', icon: <Expand size={15} />, onClick: () => expandSel('paragraph') },
        { label: 'Copiar', icon: <Copy size={15} />, onClick: () => { const s = r ?? sel!; navigator.clipboard.writeText(doc.text.slice(s.start, s.end)); } },
      ]);
      return;
    }
    if (span) {
      const qid = span.dataset.q!.split(' ').sort((a, b) => { const qa = quotes.find((q) => q.id === a)!, qb = quotes.find((q) => q.id === b)!; return (qa.end - qa.start) - (qb.end - qb.start); })[0];
      st().setActiveQuotation(qid);
      quoteMenu(e, qid);
    }
  };

  const quoteMenu = (e: React.MouseEvent, qid: ID) => {
    const q = st().project!.quotations.find((x) => x.id === qid)!;
    openMenu(e, [
      { label: 'Agregar código…', icon: <Tag size={15} />, onClick: () => setPicker({ x: e.clientX, y: e.clientY, target: qid }) },
      ...q.codeIds.map((c) => ({ label: `Quitar «${codes.get(c)?.name}»`, icon: <X size={15} />, onClick: () => st().toggleCodeOnQuotation(qid, c, false) })),
      { label: q.comment ? 'Editar comentario de la cita…' : 'Comentar la cita…', icon: <MessageSquareText size={15} />, onClick: () => editQuotationComment(qid) },
      { label: 'Escribir memo sobre la cita', icon: <StickyNote size={15} />, onClick: () => { const mid = st().createMemo('Memo sobre ' + quotationNumber(st().project!, q), [{ kind: 'quotation', id: qid }]); st().openTab('memo', mid); } },
      { label: 'Copiar texto de la cita', icon: <Copy size={15} />, onClick: () => navigator.clipboard.writeText(doc.text.slice(q.start, q.end)) },
      { sep: true },
      { label: 'Eliminar cita', icon: <Trash2 size={15} />, danger: true, onClick: () => { st().deleteQuotations([qid]); st().toast('Cita eliminada', 'info', { label: 'Deshacer', run: () => st().undo() }); } },
    ]);
  };

  const words = useMemo(() => wordCount(doc.text), [doc.text]);
  const marginW = Math.round(Math.min(prefs.marginWidth, Math.max(120, wrapW * 0.3)));
  const lastCode = lastCodeIds[0] ? codes.get(lastCodeIds[0]) : undefined;
  const groups = project.documentGroups.filter((g) => doc.groupIds.includes(g.id));

  return (
    <>
      <div className="toolbar" style={{ gap: 10 }}>
        <div className="grow row" style={{ minWidth: 200 }}>
          <InlineEdit value={doc.name} onSave={(v) => v.trim() && st().updateDoc(docId, { name: v.trim() })} className="input sm" />
        </div>
        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{doc.kind.toUpperCase()} · {words.toLocaleString('es-MX')} palabras · {quotes.length} citas</span>
        {groups.map((g) => <CodeChip key={g.id} name={g.name} color={g.color} />)}
        <div className="sep" />
        <button className={'btn ghost icon sm' + (search.open ? ' active' : '')} title={`Buscar en el documento (${modKey}F)`} onClick={() => setSearch((s) => ({ ...s, open: !s.open }))}><Search size={15} /></button>
        <button className="btn ghost icon sm" title="Reducir texto" onClick={() => setSize((s) => Math.max(12, s - 1))}><Minus size={15} /></button>
        <button className="btn ghost icon sm" title="Aumentar texto" onClick={() => setSize((s) => Math.min(26, s + 1))}><Plus size={15} /></button>
        <button className={'btn ghost icon sm' + (font === 'serif' ? ' active' : '')} title="Alternar tipografía de lectura" onClick={() => setFont((f) => (f === 'sans' ? 'serif' : 'sans'))}><Type size={15} /></button>
        <button className="btn ghost icon sm" title={`Ancho del documento: ${WIDTH_LABEL[prefs.docWidth ?? 'full']} (clic para cambiar)`} onClick={() => st().setPrefs({ docWidth: NEXT_WIDTH[prefs.docWidth ?? 'full'] })}>{(prefs.docWidth ?? 'full') === 'full' ? <Minimize2 size={15} /> : <MoveHorizontal size={15} />}</button>
        <button className="btn ghost sm" title="Ver todas las citas de este documento" onClick={() => { st().openTab('quotations'); useStore.setState({ selected: { kind: 'document', id: docId } }); }}><ListTree size={15} />Citas</button>
      </div>
      {search.open && (
        <div className="toolbar" style={{ background: 'var(--bg)' }}>
          <div className="input-wrap" style={{ width: 320 }}>
            <Search size={14} />
            <input className="input sm" autoFocus placeholder="Buscar en este documento…" value={search.term}
              onChange={(e) => setSearch({ open: true, term: e.target.value, cur: 0 })}
              onKeyDown={(e) => { if (e.key === 'Enter') step(e.shiftKey ? -1 : 1); if (e.key === 'Escape') setSearch({ open: false, term: '', cur: 0 }); }} />
          </div>
          <span className="small muted">{search.term ? (hits.length ? `${search.cur + 1} de ${hits.length}` : 'Sin resultados') : ''}</span>
          <button className="btn ghost icon sm" onClick={() => step(-1)} disabled={!hits.length}><ChevronUp size={15} /></button>
          <button className="btn ghost icon sm" onClick={() => step(1)} disabled={!hits.length}><ChevronDown size={15} /></button>
          {hits.length > 0 && <button className="btn sm" onClick={() => { st().openTab('search'); useStore.setState({ selected: null }); window.dispatchEvent(new CustomEvent('glosa:search', { detail: { term: search.term, docId } })); }}><WandSparkles size={14} />Codificar resultados…</button>}
          <span className="spacer" />
          <button className="btn ghost icon sm" onClick={() => setSearch({ open: false, term: '', cur: 0 })}><X size={15} /></button>
        </div>
      )}
      <div className="doc-wrap" ref={wrapRef} onScroll={() => { if (toolbarPos) setToolbarPos(null); }}>
        <div className={'doc-page w-' + (prefs.docWidth ?? 'full') + (wrapW < 720 ? ' narrow' : '')} style={{ ['--margin-w' as any]: marginW + 'px' }}>
          <div className="doc-paper">
            <DocText
              doc={doc} paras={paras} quotes={quotes} codes={codes} activeQ={activeQ} focusCode={focusCode}
              hits={hits} curHit={search.cur} sel={sel} textRef={textRef} size={size} lh={prefs.lineHeight} font={font}
              onMouseUp={onMouseUp} onContextMenu={onContext} onDrop={onDrop}
            />
          </div>
          <Margin quotes={quotes} codes={codes} activeQ={activeQ} focusCode={focusCode} textRef={textRef} width={marginW}
            deps={[size, font, prefs.lineHeight, paras]}
            onPick={(id) => st().setActiveQuotation(id)} onMenu={quoteMenu} />
        </div>
        {sel && toolbarPos && (
          <div className="sel-toolbar" style={{ left: toolbarPos.x, top: Math.max(4, toolbarPos.y) }} onMouseDown={(e) => e.preventDefault()}>
            <button className="btn primary sm" onClick={() => openPicker('sel')} title={`${modKey}J`}><Tag size={14} />Codificar</button>
            {lastCode && (
              <button className="btn ghost sm" onClick={() => codeSel([lastCode.id])} title={`Aplicar el último código usado (${modKey}L)`}>
                <span className="code-swatch" style={{ background: lastCode.color, width: 10, height: 10 }} />
                <span className="ellipsis" style={{ maxWidth: 120 }}>{lastCode.name}</span>
              </button>
            )}
            <button className="btn ghost sm" onClick={inVivo} title={`Crear un código con el texto seleccionado (${modKey}I)`}><WandSparkles size={14} />In vivo</button>
            <button className="btn ghost sm" onClick={freeQuote} title="Crear una cita sin código"><Quote size={14} />Cita</button>
            <button className="btn ghost sm" onClick={memoForSel} title={`Crear una cita y escribir un memo (${modKey}⇧M)`}><StickyNote size={14} />Memo</button>
            <button className="btn ghost icon sm" onClick={() => expandSel('sentence')} title="Ampliar a la oración completa"><Expand size={14} /></button>
            <button className="btn ghost icon sm" onClick={clearSel} title="Cancelar (Esc)"><X size={14} /></button>
          </div>
        )}
      </div>
      {picker && (
        <CodePicker x={picker.x} y={picker.y} initial={picker.initial}
          exclude={picker.target === 'sel' ? [] : quotes.find((q) => q.id === picker.target)?.codeIds}
          title={picker.target === 'sel' ? 'Codificar selección con…' : 'Agregar código a la cita'}
          onClose={() => setPicker(null)}
          onPick={(ids) => {
            if (picker.target === 'sel') codeSel(ids);
            else ids.forEach((c) => st().toggleCodeOnQuotation(picker.target as ID, c, true));
          }} />
      )}
      {menu}
    </>
  );
}

// ------------------------------------------------------------------ Texto

interface DocTextProps {
  doc: Doc; paras: Para[]; quotes: Quotation[]; codes: Map<ID, Code>; activeQ: ID | null; focusCode: ID | null;
  hits: { start: number; end: number }[]; curHit: number; sel: { start: number; end: number } | null;
  textRef: React.RefObject<HTMLDivElement | null>; size: number; lh: number; font: 'sans' | 'serif';
  onMouseUp: (e: React.MouseEvent) => void; onContextMenu: (e: React.MouseEvent) => void; onDrop: (e: React.DragEvent) => void;
}

const DocText = memo(function DocText({ doc, paras, quotes, codes, activeQ, focusCode, hits, curHit, sel, textRef, size, lh, font, onMouseUp, onContextMenu, onDrop }: DocTextProps) {
  const [over, setOver] = useState(false);
  const segsFor = (p: Para): Seg[] => {
    const cuts = new Set([p.start, p.end]);
    const qs = quotes.filter((q) => q.start < p.end && q.end > p.start);
    for (const q of qs) { cuts.add(Math.max(p.start, q.start)); cuts.add(Math.min(p.end, q.end)); }
    const hs = hits.map((h, i) => ({ ...h, i })).filter((h) => h.start < p.end && h.end > p.start);
    for (const h of hs) { cuts.add(Math.max(p.start, h.start)); cuts.add(Math.min(p.end, h.end)); }
    if (sel && sel.start < p.end && sel.end > p.start) { cuts.add(Math.max(p.start, sel.start)); cuts.add(Math.min(p.end, sel.end)); }
    const pts = [...cuts].sort((a, b) => a - b);
    const out: Seg[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const s = pts[i], e = pts[i + 1];
      if (e <= s) continue;
      const h = hs.find((x) => x.start <= s && x.end >= e);
      out.push({ start: s, end: e, qs: qs.filter((q) => q.start <= s && q.end >= e), hit: h?.i, pending: !!sel && sel.start <= s && sel.end >= e });
    }
    return out;
  };

  return (
    <div
      ref={textRef}
      className="doc-text"
      style={{ ['--doc-size' as any]: size + 'px', ['--doc-lh' as any]: lh, fontFamily: font === 'serif' ? 'var(--font-serif)' : undefined, outline: over ? '2px dashed var(--accent)' : undefined, outlineOffset: 12 }}
      onMouseUp={onMouseUp}
      onContextMenu={onContextMenu}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-glosa-code')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); onDrop(e); }}
    >
      {paras.map((p) => (
        <ParaView key={p.start} p={p} segs={segsFor(p)} text={doc.text} codes={codes} activeQ={activeQ} focusCode={focusCode} curHit={curHit} />
      ))}
    </div>
  );
});

const ParaView = memo(function ParaView({ p, segs, text, codes, activeQ, focusCode, curHit }: { p: Para; segs: Seg[]; text: string; codes: Map<ID, Code>; activeQ: ID | null; focusCode: ID | null; curHit: number }) {
  return (
    <>
      {p.pageBefore && <div className="page-mark" contentEditable={false}>Página {p.pageBefore}</div>}
      <p className={p.level ? `h${p.level}` : undefined} data-s={p.start} data-e={p.end}>
        {segs.map((s) => {
          const isActive = !!activeQ && s.qs.some((q) => q.id === activeQ);
          const activeColor = isActive ? codes.get(s.qs.find((q) => q.id === activeQ)!.codeIds[0])?.color : undefined;
          const cls = [s.qs.length ? 'q' : '', isActive ? 'on' : '', s.hit !== undefined ? 'hit' + (s.hit === curHit ? ' cur' : '') : ''].filter(Boolean).join(' ');
          const bg = s.pending ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : s.hit !== undefined ? undefined : segBackground(s.qs, codes, focusCode);
          return (
            <span key={s.start} data-s={s.start} data-e={s.end} data-q={s.qs.length ? s.qs.map((q) => q.id).join(' ') : undefined}
              className={cls || undefined} style={{ background: bg, ['--qc' as any]: activeColor }}>
              {text.slice(s.start, s.end)}
            </span>
          );
        })}
      </p>
    </>
  );
});

// ------------------------------------------------------------------ Margen de códigos

interface MarginProps {
  quotes: Quotation[]; codes: Map<ID, Code>; activeQ: ID | null; focusCode: ID | null; width: number;
  textRef: React.RefObject<HTMLDivElement | null>; deps: unknown[];
  onPick: (id: ID) => void; onMenu: (e: React.MouseEvent, id: ID) => void;
}

function Margin({ quotes, codes, activeQ, focusCode, textRef, deps, onPick, onMenu, width }: MarginProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ id: ID; top: number; height: number; lane: number; labelTop: number }[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [textRef]);

  useLayoutEffect(() => {
    const root = textRef.current, m = ref.current;
    if (!root || !m) return;
    const base = m.getBoundingClientRect().top;
    const spanIndex = new Map<string, HTMLElement[]>();
    root.querySelectorAll<HTMLElement>('span[data-q]').forEach((s) => {
      for (const id of s.dataset.q!.split(' ')) { if (!spanIndex.has(id)) spanIndex.set(id, []); spanIndex.get(id)!.push(s); }
    });
    const items: { id: ID; top: number; height: number; lane: number; labelTop: number; n: number }[] = [];
    for (const q of quotes) {
      const spans = spanIndex.get(q.id);
      if (!spans?.length) continue;
      const first = spans[0].getClientRects()[0] ?? spans[0].getBoundingClientRect();
      const lastRects = spans[spans.length - 1].getClientRects();
      const last = lastRects[lastRects.length - 1] ?? spans[spans.length - 1].getBoundingClientRect();
      const top = first.top - base, bottom = last.bottom - base;
      items.push({ id: q.id, top, height: Math.max(14, bottom - top), lane: 0, labelTop: top, n: Math.max(1, q.codeIds.length) });
    }
    // Carriles para barras solapadas.
    const laneEnds: number[] = [];
    for (const it of items.sort((a, b) => a.top - b.top || b.height - a.height)) {
      let lane = laneEnds.findIndex((end) => end < it.top - 3);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = it.top + it.height;
      it.lane = lane;
    }
    // Etiquetas sin encimarse.
    let floor = -Infinity;
    for (const it of items) {
      it.labelTop = Math.max(it.top, floor);
      floor = it.labelTop + it.n * 20 + 4;
    }
    setLayout(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, codes, tick, ...deps]);

  const lanes = Math.max(1, ...layout.map((l) => l.lane + 1));
  const laneW = 9;
  const qmap = new Map(quotes.map((q) => [q.id, q]));
  return (
    <div className="margin" ref={ref} style={{ width }} aria-label="Margen de códigos">
      {layout.map((l) => {
        const q = qmap.get(l.id);
        if (!q) return null;
        const first = codes.get(q.codeIds[0]);
        const color = focusCode && q.codeIds.includes(focusCode) ? codes.get(focusCode)!.color : first?.color ?? '#9aa3b2';
        const dim = focusCode ? !q.codeIds.includes(focusCode) : false;
        const on = q.id === activeQ;
        return (
          <div key={l.id} className={'m-bar' + (on ? ' on' : '') + (dim ? ' dim' : '')} style={{ top: l.top, left: l.lane * laneW, height: l.height, ['--c' as any]: color }}
            onClick={() => onPick(q.id)} onContextMenu={(e) => { e.preventDefault(); onPick(q.id); onMenu(e, q.id); }}
            title={q.codeIds.map((c) => codes.get(c)?.name).join(', ') || 'Cita sin código'}>
            <div className="line" style={{ position: 'relative' }} />
            <div className="m-labels" style={{ left: (lanes - l.lane) * laneW + 4, top: l.labelTop - l.top - 1 }}>
              {q.codeIds.length ? q.codeIds.map((c) => {
                const code = codes.get(c);
                return code ? <div key={c} className="m-label" style={{ ['--c' as any]: code.color, maxWidth: width - lanes * laneW - 12 }}>{code.name}</div> : null;
              }) : <div className="m-label free"><Highlighter size={10} /> cita libre</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function quotePage(doc: Doc, q: Quotation) {
  return pageOf(doc, q.start);
}
