import {
  Bold, Columns2, Eye, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Pencil, Plus, Share2, Strikethrough, TextQuote, Trash2, X,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { parseMarkdown, type Inline } from '../core/markdown';
import { entityName } from '../core/model';
import type { EntityRef, ID, Memo } from '../core/types';
import { modKey } from '../platform';
import { useStore } from '../store';
import { fmtDate, KindIcon } from './common';

// ---------------------------------------------------------------- Vista con formato

function renderInline(c: Inline[], key = ''): ReactNode[] {
  return c.map((x, i) => {
    const k = key + '.' + i;
    if (x.t === 'text') return <Fragment key={k}>{x.v}</Fragment>;
    if (x.t === 'code') return <code key={k}>{x.v}</code>;
    if (x.t === 'q') return <span key={k} className="md-q">«{x.v}»</span>;
    if (x.t === 'b') return <strong key={k}>{renderInline(x.c, k)}</strong>;
    if (x.t === 'i') return <em key={k}>{renderInline(x.c, k)}</em>;
    return <s key={k}>{renderInline(x.c, k)}</s>;
  });
}

const lines = (ls: Inline[][], k: string) => ls.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{renderInline(l, k + j)}</Fragment>);

/** Markdown ligero y seguro (nunca interpreta HTML): títulos, formato, listas, citas y separadores. */
export function MiniMarkdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        const k = String(i);
        if (b.t === 'h') { const T = (`h${b.level + 1}`) as 'h2' | 'h3' | 'h4'; return <T key={k}>{renderInline(b.c, k)}</T>; }
        if (b.t === 'p') return <p key={k}>{lines(b.lines, k)}</p>;
        if (b.t === 'quote') return <blockquote key={k}>{lines(b.lines, k)}</blockquote>;
        if (b.t === 'hr') return <hr key={k} />;
        const L = b.ordered ? 'ol' : 'ul';
        return (
          <L key={k} start={b.ordered && b.start !== 1 ? b.start : undefined}>
            {b.items.map((it, j) => <li key={j} style={it.level ? { marginLeft: it.level * 22 } : undefined} className={it.level ? 'sub' : undefined}>{renderInline(it.c, k + '-' + j)}</li>)}
          </L>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Edición

type Mode = 'write' | 'split' | 'preview';

/** Aplica un cambio al área de texto conservando el historial nativo de deshacer. */
function replaceRange(el: HTMLTextAreaElement, start: number, end: number, text: string, selStart?: number, selEnd?: number) {
  el.focus();
  el.setSelectionRange(start, end);
  // execCommand mantiene ⌘Z del área de texto; si no está disponible se usa setRangeText.
  if (!document.execCommand('insertText', false, text)) el.setRangeText(text, start, end, 'end');
  el.setSelectionRange(selStart ?? start + text.length, selEnd ?? selStart ?? start + text.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function wrapSelection(el: HTMLTextAreaElement, mark: string, placeholder: string) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const sel = value.slice(s, e);
  // Si ya está envuelta, se quita la marca.
  if (value.slice(s - mark.length, s) === mark && value.slice(e, e + mark.length) === mark) {
    replaceRange(el, s - mark.length, e + mark.length, sel, s - mark.length, e - mark.length);
    return;
  }
  const inner = sel || placeholder;
  replaceRange(el, s, e, mark + inner + mark, s + mark.length, s + mark.length + inner.length);
}

/** Pone o quita un prefijo de línea (título, viñeta, cita…) en las líneas seleccionadas. */
function toggleLinePrefix(el: HTMLTextAreaElement, kind: 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote') {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const ls = value.lastIndexOf('\n', s - 1) + 1;
  let le = value.indexOf('\n', e);
  if (le < 0) le = value.length;
  const block = value.slice(ls, le).split('\n');
  const strip = (l: string) => l.replace(/^(#{1,6}\s+|\s*[-*•+]\s+|\s*\d{1,4}[.)]\s+|>\s?)/, '');
  const has: Record<typeof kind, RegExp> = { h1: /^#\s/, h2: /^##\s/, h3: /^###\s/, ul: /^\s*[-*•+]\s/, ol: /^\s*\d{1,4}[.)]\s/, quote: /^>/ };
  const filled = block.filter((l) => l.trim());
  const all = filled.length > 0 && filled.every((l) => has[kind].test(l));
  const out = block.map((l, i) => {
    if (!l.trim() && block.length > 1) return l;
    const base = strip(l);
    if (all) return base;
    return ({ h1: '# ', h2: '## ', h3: '### ', ul: '- ', ol: `${i + 1}. `, quote: '> ' } as const)[kind] + base;
  }).join('\n');
  replaceRange(el, ls, le, out, ls + out.length);
}

function insertBlock(el: HTMLTextAreaElement, text: string) {
  const { selectionStart: s, value } = el;
  const before = value.slice(0, s);
  const pre = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  replaceRange(el, s, el.selectionEnd, pre + text + '\n\n');
}

/** Enter dentro de una lista continúa la lista; en un elemento vacío, la termina. */
function handleEnter(el: HTMLTextAreaElement): boolean {
  const { selectionStart: s, selectionEnd: e, value } = el;
  if (s !== e) return false;
  const ls = value.lastIndexOf('\n', s - 1) + 1;
  const line = value.slice(ls, s);
  const m = /^(\s*)([-*•+]|\d{1,4}[.)]|>)(\s+)(.*)$/.exec(line);
  if (!m) return false;
  if (!m[4].trim() && value.slice(s, value.indexOf('\n', s) < 0 ? value.length : value.indexOf('\n', s)).trim() === '') {
    replaceRange(el, ls, s, ''); // elemento vacío: salir de la lista
    return true;
  }
  const num = /^(\d{1,4})([.)])$/.exec(m[2]);
  const marker = num ? `${Number(num[1]) + 1}${num[2]}` : m[2];
  replaceRange(el, s, s, '\n' + m[1] + marker + m[3]);
  return true;
}

/** Tab / Mayús+Tab cambian el nivel de los elementos de lista seleccionados. */
function handleTab(el: HTMLTextAreaElement, outdent: boolean): boolean {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const ls = value.lastIndexOf('\n', s - 1) + 1;
  let le = value.indexOf('\n', e);
  if (le < 0) le = value.length;
  const block = value.slice(ls, le).split('\n');
  if (!block.every((l) => !l.trim() || /^\s*([-*•+]|\d{1,4}[.)])\s/.test(l))) return false;
  const out = block.map((l) => (outdent ? l.replace(/^ {1,2}/, '') : (l.trim() ? '  ' + l : l))).join('\n');
  if (s === e) {
    // Con el cursor en una sola línea, se queda en el mismo punto del texto.
    const caret = Math.max(ls, s + out.length - (le - ls));
    replaceRange(el, ls, le, out, caret, caret);
  } else replaceRange(el, ls, le, out, ls, ls + out.length);
  return true;
}

export function MemoView({ id }: { id: ID }) {
  const memo = useStore((s) => s.project!.memos.find((m) => m.id === id));
  if (!memo) return null;
  return <MemoEditor memo={memo} />;
}

function MemoEditor({ memo }: { memo: Memo }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [title, setTitle] = useState(memo.title);
  const [content, setContent] = useState(memo.content);
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem('glosa:memo:mode') as Mode) || 'write'; } catch { return 'write'; } });
  useEffect(() => { try { localStorage.setItem('glosa:memo:mode', mode); } catch { /* */ } }, [mode]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setTitle(memo.title); }, [memo.id, memo.title]);
  useEffect(() => { if (document.activeElement !== bodyRef.current) setContent(memo.content); }, [memo.id, memo.content]);

  // Guardado continuo mientras se escribe (agrupado en un solo paso de deshacer).
  const save = (patch: Partial<Memo>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => st().updateMemo(memo.id, patch), 350);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Auto-ajuste de altura del área de texto.
  useEffect(() => { const el = bodyRef.current; if (el) { el.style.height = 'auto'; el.style.height = Math.max(window.innerHeight * 0.5, el.scrollHeight) + 'px'; } }, [content, mode]);

  const words = (content.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const open = (r: EntityRef) => (r.kind === 'quotation' ? st().revealQuotation(r.id) : r.kind === 'document' ? st().openTab('document', r.id) : r.kind === 'memo' ? st().openTab('memo', r.id) : st().select(r));

  const fmt = (f: (el: HTMLTextAreaElement) => void) => () => { const el = bodyRef.current; if (el) f(el); };
  const tools: { icon: ReactNode; title: string; run: () => void; sep?: boolean }[] = [
    { icon: <Heading1 size={15} />, title: 'Título (#)', run: fmt((el) => toggleLinePrefix(el, 'h1')) },
    { icon: <Heading2 size={15} />, title: 'Subtítulo (##)', run: fmt((el) => toggleLinePrefix(el, 'h2')) },
    { icon: <Heading3 size={15} />, title: 'Apartado (###)', run: fmt((el) => toggleLinePrefix(el, 'h3')) },
    { icon: <Bold size={15} />, title: `Negritas (${modKey}B)`, run: fmt((el) => wrapSelection(el, '**', 'texto en negritas')), sep: true },
    { icon: <Italic size={15} />, title: `Cursivas (${modKey}I)`, run: fmt((el) => wrapSelection(el, '*', 'texto en cursivas')) },
    { icon: <Strikethrough size={15} />, title: 'Tachado', run: fmt((el) => wrapSelection(el, '~~', 'texto tachado')) },
    { icon: <List size={15} />, title: 'Lista con viñetas (-)', run: fmt((el) => toggleLinePrefix(el, 'ul')), sep: true },
    { icon: <ListOrdered size={15} />, title: 'Lista numerada (1.)', run: fmt((el) => toggleLinePrefix(el, 'ol')) },
    { icon: <TextQuote size={15} />, title: 'Cita en bloque (>)', run: fmt((el) => toggleLinePrefix(el, 'quote')) },
    { icon: <Minus size={15} />, title: 'Línea separadora (---)', run: fmt((el) => insertBlock(el, '---')) },
  ];

  // ⌘B también llega como acción del menú nativo; se evita aplicarlo dos veces.
  const lastBold = useRef(0);
  useEffect(() => {
    const h = () => { const el = bodyRef.current; if (el && document.activeElement === el && Date.now() - lastBold.current > 250) { lastBold.current = Date.now(); wrapSelection(el, '**', 'texto en negritas'); } };
    window.addEventListener('glosa:memo-bold', h);
    return () => window.removeEventListener('glosa:memo-bold', h);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && k === 'b') { e.preventDefault(); if (Date.now() - lastBold.current > 250) { lastBold.current = Date.now(); wrapSelection(el, '**', 'texto en negritas'); } }
    else if (mod && !e.shiftKey && k === 'i') { e.preventDefault(); e.stopPropagation(); wrapSelection(el, '*', 'texto en cursivas'); }
    else if (e.key === 'Enter' && !e.shiftKey && !mod && !e.nativeEvent.isComposing) { if (handleEnter(el)) e.preventDefault(); }
    else if (e.key === 'Tab' && !mod) { if (handleTab(el, e.shiftKey)) e.preventDefault(); }
  };

  const editor = (
    <div className="memo-write">
      <div className="memo-format" role="toolbar" aria-label="Formato" onMouseDown={(e) => e.preventDefault()}>
        {tools.map((t, i) => (
          <Fragment key={i}>
            {t.sep && <span className="sep" />}
            <button className="btn ghost icon sm" title={t.title} aria-label={t.title} onClick={t.run}>{t.icon}</button>
          </Fragment>
        ))}
      </div>
      <textarea ref={bodyRef} className="memo-body" value={content} autoFocus={!memo.content}
        placeholder={'Escribe aquí tus ideas…\n\nUsa la barra de arriba o escribe directamente: # Título, ## Subtítulo, **negritas**, *cursivas*, - viñetas, 1. listas numeradas, > citas.\n\nPreguntas útiles: ¿qué patrón estoy viendo? ¿qué me sorprende? ¿qué decisión tomé y por qué?'}
        onKeyDown={onKeyDown}
        onChange={(e) => { setContent(e.target.value); save({ content: e.target.value }); }}
        onBlur={() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } if (content !== memo.content) st().updateMemo(memo.id, { content }); }} />
    </div>
  );
  const preview = (
    <div className="memo-preview selectable" style={{ fontFamily: 'var(--font-read)', fontSize: 15.5, lineHeight: 1.7 }}>
      {content.trim() ? <MiniMarkdown text={content} /> : <span className="muted">Nada que mostrar todavía.</span>}
    </div>
  );

  return (
    <>
      <div className="toolbar">
        <select className="input sm" style={{ width: 160 }} value={memo.type} onChange={(e) => st().updateMemo(memo.id, { type: e.target.value as Memo['type'] })}>
          {['analítico', 'metodológico', 'teórico', 'reflexivo', 'otro'].map((t) => <option key={t} value={t}>Memo {t}</option>)}
        </select>
        <div className="seg">
          <button className={mode === 'write' ? 'on' : ''} onClick={() => setMode('write')}><Pencil size={12} /> Escribir</button>
          <button className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')} title="Escribir y ver el resultado al mismo tiempo"><Columns2 size={12} /> Dividido</button>
          <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}><Eye size={12} /> Vista previa</button>
        </div>
        <span className="small muted">{words} palabras · modificado {fmtDate(memo.modifiedAt)}</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => { const nid = st().createNetwork('Red: ' + memo.title, [{ kind: 'memo', id: memo.id }, ...memo.links]); st().openTab('network', nid); }}><Share2 size={14} />Ver en red</button>
        <button className="btn ghost icon sm" title="Eliminar memo" onClick={() => st().confirm('Eliminar memo', `¿Eliminar «${memo.title}»?`, () => st().deleteMemos([memo.id]), { danger: true, confirmLabel: 'Eliminar' })}><Trash2 size={15} /></button>
      </div>
      <div className="view-scroll" onClick={(e) => { if (e.target === e.currentTarget) bodyRef.current?.focus(); }}>
        <div className={'memo-editor' + (mode === 'split' ? ' split' : '')}>
          <input className="memo-title" value={title} placeholder="Título del memo"
            onChange={(e) => { setTitle(e.target.value); save({ title: e.target.value }); }} />
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <Link2 size={14} className="muted" />
            {memo.links.map((l) => (
              <span key={l.kind + l.id} className="chip" style={{ cursor: 'default' }} onClick={() => open(l)}>
                <KindIcon kind={l.kind} size={11} /><span>{entityName(project, l).slice(0, 60)}</span>
                <span className="x" role="button" onClick={(e) => { e.stopPropagation(); st().updateMemo(memo.id, { links: memo.links.filter((x) => !(x.kind === l.kind && x.id === l.id)) }); }}><X size={11} /></span>
              </span>
            ))}
            <LinkAdder memo={memo} />
          </div>
          {mode === 'write' && editor}
          {mode === 'preview' && <div style={{ minHeight: '50vh' }}>{preview}</div>}
          {mode === 'split' && <div className="memo-split">{editor}<div className="memo-split-preview">{preview}</div></div>}
        </div>
      </div>
    </>
  );
}

function LinkAdder({ memo }: { memo: Memo }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  if (!open) return <button className="btn ghost sm" onClick={() => setOpen(true)}><Plus size={13} />Vincular</button>;
  const have = new Set(memo.links.map((l) => l.kind + l.id));
  const opts: EntityRef[] = [
    ...project.codes.map((c) => ({ kind: 'code' as const, id: c.id })),
    ...project.documents.map((d) => ({ kind: 'document' as const, id: d.id })),
    ...project.quotations.map((x) => ({ kind: 'quotation' as const, id: x.id })),
  ].filter((r) => !have.has(r.kind + r.id) && entityName(project, r).toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div style={{ position: 'relative' }}>
      <input className="input sm" autoFocus style={{ width: 240 }} placeholder="Buscar código, documento o cita…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <div className="popover" style={{ position: 'absolute', top: 32, left: 0, width: 360 }}>
        <div className="list">
          {opts.map((r) => (
            <div key={r.kind + r.id} className="opt" onMouseDown={(e) => { e.preventDefault(); st().updateMemo(memo.id, { links: [...memo.links, r] }); setQ(''); }}>
              <KindIcon kind={r.kind} size={13} /><span className="ellipsis">{entityName(project, r)}</span>
            </div>
          ))}
          {!opts.length && <div className="small muted" style={{ padding: 10 }}>Sin resultados.</div>}
        </div>
      </div>
    </div>
  );
}
