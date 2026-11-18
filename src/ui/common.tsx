import { FileText, MessageSquare, Quote, StickyNote, Tag, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CODE_COLORS } from '../core/model';
import type { EntityKind } from '../core/types';

export const KIND_LABEL: Record<EntityKind, string> = { code: 'Código', quotation: 'Cita', memo: 'Memo', document: 'Documento' };

export function KindIcon({ kind, size = 14 }: { kind: EntityKind; size?: number }) {
  if (kind === 'code') return <Tag size={size} />;
  if (kind === 'quotation') return <Quote size={size} />;
  if (kind === 'memo') return <StickyNote size={size} />;
  return <FileText size={size} />;
}

export function CodeChip({ name, color, onRemove, onClick, title }: { name: string; color: string; onRemove?: () => void; onClick?: () => void; title?: string }) {
  return (
    <span className="chip" style={{ ['--c' as any]: color }} onClick={onClick} title={title ?? name}>
      <span>{name}</span>
      {onRemove && (
        <span className="x" role="button" aria-label={`Quitar ${name}`} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <X size={12} />
        </span>
      )}
    </span>
  );
}

export function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onOut(); };
    const t = setTimeout(() => { document.addEventListener('mousedown', h); document.addEventListener('keydown', k); });
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onOut, active]);
}

/** Coloca un elemento flotante cerca de (x, y) sin salirse de la ventana. */
export function useFitPosition(x: number, y: number, deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height - 8) : y;
    setPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, ...deps]);
  return { ref, style: { left: pos.left, top: pos.top } };
}

export interface MenuItem { label?: string; icon?: ReactNode; onClick?: () => void; danger?: boolean; kbd?: string; sep?: boolean; disabled?: boolean }

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const { ref, style } = useFitPosition(x, y);
  useOutside(ref, onClose);
  return createPortal(
    <div className="menu" ref={ref} style={style} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.sep ? <div key={i} className="menu-sep" /> : (
          <div key={i} role="menuitem" className={'menu-item' + (it.danger ? ' danger' : '')} style={it.disabled ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
            onClick={() => { onClose(); it.onClick?.(); }}>
            {it.icon}<span>{it.label}</span>{it.kbd && <span className="kbd">{it.kbd}</span>}
          </div>
        ),
      )}
    </div>,
    document.body,
  );
}

/** Hook para menús contextuales: devuelve [elemento, abrir]. */
export function useContextMenu(): [ReactNode, (e: React.MouseEvent | { clientX: number; clientY: number }, items: MenuItem[]) => void] {
  const [st, setSt] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const el = st ? <ContextMenu x={st.x} y={st.y} items={st.items} onClose={() => setSt(null)} /> : null;
  return [el, (e, items) => { if ('preventDefault' in e) { e.preventDefault(); e.stopPropagation(); } setSt({ x: e.clientX, y: e.clientY, items }); }];
}

export function Dialog({ title, sub, children, footer, onClose, className = '', icon }: { title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; className?: string; icon?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'dialog ' + className} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="dialog-head">
          {icon}
          <div className="grow"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {CODE_COLORS.map((c) => (
        <button key={c} aria-label={`Color ${c}`} onClick={() => onChange(c)}
          style={{ width: 22, height: 22, borderRadius: 6, background: c, border: 0, boxShadow: value.toLowerCase() === c ? `0 0 0 2px var(--bg-elev), 0 0 0 4px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,.15)' }} />
      ))}
      <label title="Otro color" style={{ width: 22, height: 22, borderRadius: 6, overflow: 'hidden', position: 'relative', background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </label>
    </div>
  );
}

/** Campo de texto que guarda al perder el foco o con Enter (evita un paso de deshacer por tecla). */
export function InlineEdit({ value, onSave, className = 'input', placeholder, multiline, autoFocus, rows }: { value: string; onSave: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean; autoFocus?: boolean; rows?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onSave(v); };
  if (multiline) {
    return <textarea className={className.replace('input', 'textarea')} value={v} placeholder={placeholder} rows={rows ?? 3} autoFocus={autoFocus}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Escape') { setV(value); (e.target as HTMLElement).blur(); } }} />;
  }
  return <input className={className} value={v} placeholder={placeholder} autoFocus={autoFocus}
    onChange={(e) => setV(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLElement).blur(); } }} />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="ico">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Resizer({ onResize, side }: { onResize: (dx: number) => void; side: 'left' | 'right' }) {
  const [drag, setDrag] = useState(false);
  return (
    <div className={'resizer' + (drag ? ' drag' : '')} onMouseDown={(e) => {
      e.preventDefault();
      setDrag(true);
      let last = e.clientX;
      const mv = (ev: MouseEvent) => { onResize(side === 'left' ? ev.clientX - last : last - ev.clientX); last = ev.clientX; };
      const up = () => { setDrag(false); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; };
      document.body.style.cursor = 'col-resize';
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    }} />
  );
}

export function CommentIcon({ has }: { has: boolean }) {
  return has ? <MessageSquare size={12} style={{ color: 'var(--text-3)' }} /> : null;
}

export function fmtDate(s: string) {
  try { return new Date(s).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; }
}

export function fmtNum(n: number, digits = 0) {
  return n.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Coincidencia aproximada sin acentos ni mayúsculas. */
export function fold(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
export function matches(hay: string, needle: string) {
  if (!needle) return true;
  const h = fold(hay);
  return fold(needle).split(/\s+/).filter(Boolean).every((w) => h.includes(w));
}
