import { Check, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { codeFrequency } from '../core/analysis';
import type { ID } from '../core/types';
import { useStore } from '../store';
import { fold, matches, useFitPosition, useOutside } from './common';

interface Props {
  x: number;
  y: number;
  onPick: (codeIds: ID[]) => void;
  onClose: () => void;
  exclude?: ID[];
  title?: string;
  /** Texto inicial (p. ej. la selección para codificación «in vivo»). */
  initial?: string;
}

/**
 * Selector rápido de códigos: escribir para filtrar, Enter para aplicar,
 * o crear un código nuevo con el texto escrito. Admite varios a la vez.
 */
export function CodePicker({ x, y, onPick, onClose, exclude = [], title = 'Codificar con…', initial = '' }: Props) {
  const project = useStore((s) => s.project!);
  const lastCodeIds = useStore((s) => s.lastCodeIds);
  const createCode = useStore((s) => s.createCode);
  const [q, setQ] = useState(initial);
  const [hi, setHi] = useState(0);
  const [checked, setChecked] = useState<ID[]>([]);
  const { ref, style } = useFitPosition(x, y);
  useOutside(ref, onClose);
  const freq = useMemo(() => codeFrequency(project), [project]);
  const byId = useMemo(() => new Map(project.codes.map((c) => [c.id, c])), [project.codes]);
  const pathOf = (id: ID): string => { const c = byId.get(id); return c?.parentId && byId.has(c.parentId) ? pathOf(c.parentId) + ' › ' : ''; };

  const options = useMemo(() => {
    const ex = new Set(exclude);
    const all = project.codes.filter((c) => !ex.has(c.id) && matches(c.name, q));
    const recent = q ? [] : lastCodeIds.map((id) => all.find((c) => c.id === id)).filter(Boolean).slice(0, 5) as typeof all;
    const rest = all.filter((c) => !recent.includes(c)).sort((a, b) => {
      if (q) {
        const sa = fold(a.name).startsWith(fold(q)) ? 0 : 1, sb = fold(b.name).startsWith(fold(q)) ? 0 : 1;
        if (sa !== sb) return sa - sb;
      }
      return a.name.localeCompare(b.name, 'es');
    });
    return { recent, rest, flat: [...recent, ...rest] };
  }, [project.codes, q, lastCodeIds, exclude]);

  const exact = project.codes.some((c) => fold(c.name) === fold(q.trim()));
  const canCreate = q.trim().length > 0 && !exact;
  const total = options.flat.length + (canCreate ? 1 : 0);

  const apply = (extra?: ID) => {
    const ids = [...new Set([...checked, ...(extra ? [extra] : [])])];
    if (ids.length) { onPick(ids); onClose(); }
  };
  const create = () => {
    const id = createCode(q.trim());
    apply(id);
  };
  const choose = (i: number) => {
    if (canCreate && i === 0) return create();
    const c = options.flat[i - (canCreate ? 1 : 0)];
    if (c) apply(c.id);
  };
  const toggle = (id: ID) => setChecked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  let idx = canCreate ? 1 : 0;
  const row = (c: (typeof options.flat)[number]) => {
    const i = idx++;
    const on = checked.includes(c.id);
    return (
      <div key={c.id} className={'opt' + (i === hi ? ' on' : '')} onMouseEnter={() => setHi(i)} onClick={(e) => (e.metaKey || e.ctrlKey ? toggle(c.id) : apply(c.id))}>
        <span role="checkbox" aria-checked={on} title="Marcar para aplicar varios" onClick={(e) => { e.stopPropagation(); toggle(c.id); }}
          style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid ' + (on ? c.color : 'var(--line-strong)'), background: on ? c.color : 'transparent', display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
          {on && <Check size={11} strokeWidth={3} />}
        </span>
        <span className="code-swatch" style={{ background: c.color }} />
        <span className="ellipsis grow"><span className="muted">{pathOf(c.id)}</span>{c.name}</span>
        <span className="hint">{freq.get(c.id) ?? 0}</span>
      </div>
    );
  };

  return createPortal(
    <div className="popover" ref={ref} style={{ ...style, width: 320 }} onMouseDown={(e) => e.stopPropagation()}>
      <div style={{ padding: '10px 10px 6px' }}>
        <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
        <div className="input-wrap">
          <Search size={14} />
          <input className="input" autoFocus value={q} placeholder="Buscar o crear un código…"
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(total - 1, h + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); if ((e.metaKey || e.ctrlKey) && checked.length) apply(); else choose(hi); }
              else if (e.key === 'Escape') onClose();
              else if (e.key === ' ' && e.altKey) { e.preventDefault(); const c = options.flat[hi - (canCreate ? 1 : 0)]; if (c) toggle(c.id); }
            }} />
        </div>
      </div>
      <div className="list">
        {canCreate && (
          <div className={'opt' + (hi === 0 ? ' on' : '')} onMouseEnter={() => setHi(0)} onClick={create}>
            <Plus size={15} style={{ color: 'var(--accent)' }} />
            <span className="ellipsis">Crear código <b>«{q.trim()}»</b></span>
            <span className="hint">Enter</span>
          </div>
        )}
        {options.recent.length > 0 && <div className="opt-head">Usados recientemente</div>}
        {options.recent.map(row)}
        {options.rest.length > 0 && options.recent.length > 0 && <div className="opt-head">Todos los códigos</div>}
        {options.rest.map(row)}
        {total === 0 && <div className="muted small" style={{ padding: 12 }}>Escribe el nombre de un código para crearlo.</div>}
      </div>
      {checked.length > 0 && (
        <div className="row" style={{ padding: 8, borderTop: '1px solid var(--line)' }}>
          <span className="small muted grow">{checked.length} marcados</span>
          <button className="btn primary sm" onClick={() => apply()}>Aplicar {checked.length}</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
