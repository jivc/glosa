import {
  Background, BaseEdge, ConnectionMode, Controls, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider,
  getNodesBounds, getViewportForBounds, useInternalNode, useReactFlow, useNodesState, useStore as useFlowStore,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Download, Expand, Eye, EyeOff, Map as MapIcon, Maximize2, Plus, Search, Share2, Sparkles, Trash2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { exportFile } from '../actions';
import { codeDensity, codeFrequency } from '../core/analysis';
import { networkGraphml } from '../core/exporters';
import { forceLayout, resolveOverlaps, type Box } from '../core/layout';
import { entityName, quotationLabel, quotationNumber } from '../core/model';
import type { EntityRef, ID, Link, ProjectData } from '../core/types';
import { useStore } from '../store';
import { KindIcon, KIND_LABEL, matches, useContextMenu } from './common';

const keyOf = (r: EntityRef) => `${r.kind}:${r.id}`;
const refOf = (k: string): EntityRef => { const i = k.indexOf(':'); return { kind: k.slice(0, i) as EntityRef['kind'], id: k.slice(i + 1) }; };
/** Prefijo de las aristas implícitas (cita–código, memo–elemento): no son vínculos del proyecto. */
const IMPLICIT = 'imp:';

type NodeData = { ref: EntityRef; label: string; color?: string; meta?: string };
type EdgeData = { label: string; color: string; offset: number; onLabel?: (e: React.MouseEvent, id: string) => void };

const EntityNode = memo(function EntityNode({ data }: NodeProps<Node<NodeData>>) {
  const { ref, label, color, meta } = data;
  return (
    <div className={'net-node ' + ref.kind} style={{ ['--c' as any]: color }}>
      <Handle type="target" position={Position.Left} />
      <div className="nk"><KindIcon kind={ref.kind} size={11} />{KIND_LABEL[ref.kind]}</div>
      <div className="nt">{label}</div>
      {meta && <div className="nm">{meta}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

// Aristas "flotantes": salen del borde de cada nodo en dirección al otro.
function intersect(n: { x: number; y: number; w: number; h: number }, tx: number, ty: number) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = (n.w / 2) / Math.abs(dx || 1e-9), sy = (n.h / 2) / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

const DEFAULT_W = 170, DEFAULT_H = 64;

function FloatingEdge({ id, source, target, markerEnd, markerStart, style, data, selected }: EdgeProps<Edge<EdgeData>>) {
  const s = useInternalNode(source), t = useInternalNode(target);
  if (!s || !t) return null;
  const box = (n: typeof s) => ({ x: n!.internals.positionAbsolute.x, y: n!.internals.positionAbsolute.y, w: n!.measured.width ?? DEFAULT_W, h: n!.measured.height ?? DEFAULT_H });
  const a = box(s), b = box(t);
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  // Las relaciones paralelas entre los mismos nodos se curvan para no encimarse.
  const off = data?.offset ?? 0;
  const dx = cb.x - ca.x, dy = cb.y - ca.y, len = Math.hypot(dx, dy) || 1;
  const ctrl = { x: (ca.x + cb.x) / 2 + (-dy / len) * off * 2, y: (ca.y + cb.y) / 2 + (dx / len) * off * 2 };
  const p1 = off ? intersect(a, ctrl.x, ctrl.y) : intersect(a, cb.x, cb.y);
  const p2 = off ? intersect(b, ctrl.x, ctrl.y) : intersect(b, ca.x, ca.y);
  const path = off ? `M ${p1.x},${p1.y} Q ${ctrl.x},${ctrl.y} ${p2.x},${p2.y}` : `M ${p1.x},${p1.y} L ${p2.x},${p2.y}`;
  const lx = off ? 0.25 * p1.x + 0.5 * ctrl.x + 0.25 * p2.x : (p1.x + p2.x) / 2;
  const ly = off ? 0.25 * p1.y + 0.5 * ctrl.y + 0.25 * p2.y : (p1.y + p2.y) / 2;
  const implicit = id.startsWith(IMPLICIT);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={{ ...style, strokeWidth: implicit ? 1.2 : selected ? 2.6 : 1.6 }} interactionWidth={implicit ? 0 : 16} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div className={'edge-label nodrag nopan' + (selected ? ' on' : '')} style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, color: data.color }}
            onClick={(e) => data.onLabel?.(e, id)} onContextMenu={(e) => { e.preventDefault(); data.onLabel?.(e, id); }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { entity: EntityNode };
const edgeTypes = { floating: FloatingEdge };

export function NetworkView({ id }: { id: ID }) {
  return <ReactFlowProvider><NetworkCanvas id={id} /></ReactFlowProvider>;
}

function nodeData(p: ProjectData, ref: EntityRef, freq: Map<ID, number>, dens: Map<ID, number>): NodeData {
  if (ref.kind === 'code') {
    const c = p.codes.find((x) => x.id === ref.id);
    if (!c) return { ref, label: '(eliminado)' };
    return { ref, label: c.name, color: c.color, meta: `${freq.get(c.id) ?? 0} citas · ${dens.get(c.id) ?? 0} vínculos` };
  }
  if (ref.kind === 'quotation') {
    const q = p.quotations.find((x) => x.id === ref.id);
    if (!q) return { ref, label: '(eliminada)' };
    return { ref, label: '«' + quotationLabel(p, q, 140) + '»', meta: quotationNumber(p, q) };
  }
  if (ref.kind === 'memo') { const m = p.memos.find((x) => x.id === ref.id); return { ref, label: m?.title || 'Memo', meta: m ? 'memo ' + m.type : undefined }; }
  const d = p.documents.find((x) => x.id === ref.id);
  return { ref, label: d?.name ?? '(eliminado)' };
}

// ------------------------------------------------------------------ Vista general (con relaciones)

function NetMiniMap({ edges }: { edges: Edge<EdgeData>[] }) {
  const rf = useReactFlow();
  const lookup = useFlowStore((s) => s.nodeLookup);
  const transform = useFlowStore((s) => s.transform);
  const vw = useFlowStore((s) => s.width), vh = useFlowStore((s) => s.height);
  const [tx, ty, zoom] = transform;
  const W = 200, H = 140;
  const nodes = [...lookup.values()].map((n) => ({
    id: n.id, x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y,
    w: n.measured.width ?? DEFAULT_W, h: n.measured.height ?? DEFAULT_H, color: (n.data as NodeData).color, kind: (n.data as NodeData).ref.kind,
  }));
  if (!nodes.length) return null;
  const view = { x: -tx / zoom, y: -ty / zoom, w: vw / zoom, h: vh / zoom };
  const minX = Math.min(view.x, ...nodes.map((n) => n.x)), minY = Math.min(view.y, ...nodes.map((n) => n.y));
  const maxX = Math.max(view.x + view.w, ...nodes.map((n) => n.x + n.w)), maxY = Math.max(view.y + view.h, ...nodes.map((n) => n.y + n.h));
  const pad = 40;
  const bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
  const sc = Math.min(W / bw, H / bh);
  const ox = (W - bw * sc) / 2 - (minX - pad) * sc, oy = (H - bh * sc) / 2 - (minY - pad) * sc;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pan = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    rf.setCenter((e.clientX - r.left - ox) / sc, (e.clientY - r.top - oy) / sc, { zoom });
  };
  return (
    <div className="net-minimap" title="Vista general: haz clic o arrastra para moverte">
      <svg width={W} height={H}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pan(e); }}
        onPointerMove={(e) => { if (e.buttons & 1) pan(e); }}>
        <g transform={`translate(${ox} ${oy}) scale(${sc})`}>
          {edges.map((e) => {
            const a = byId.get(e.source), b = byId.get(e.target);
            if (!a || !b) return null;
            const implicit = e.id.startsWith(IMPLICIT);
            return <line key={e.id} x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={b.x + b.w / 2} y2={b.y + b.h / 2}
              stroke={implicit ? 'var(--text-3)' : (e.data?.color ?? '#64748b')} strokeWidth={(implicit ? 1 : 2) / sc} strokeOpacity={implicit ? 0.55 : 0.95}
              strokeDasharray={implicit ? `${3 / sc} ${3 / sc}` : undefined} />;
          })}
          {nodes.map((n) => (
            <rect key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} rx={8}
              fill={n.color ?? (n.kind === 'memo' ? '#f5c542' : n.kind === 'quotation' ? '#94a3b8' : '#64748b')} fillOpacity={0.8} />
          ))}
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="var(--accent)" fillOpacity={0.06} stroke="var(--accent)" strokeWidth={1.5 / sc} />
        </g>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ Lienzo

function NetworkCanvas({ id }: { id: ID }) {
  const project = useStore((s) => s.project!);
  const net = project.networks.find((n) => n.id === id)!;
  const st = useStore.getState;
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const [menu, openMenu] = useContextMenu();
  const [showAdd, setShowAdd] = useState(net.nodes.length === 0);
  const [showImplicit, setShowImplicit] = useState(() => { try { return localStorage.getItem('glosa:net:implicit') !== '0'; } catch { return true; } });
  const [showMap, setShowMap] = useState(() => { try { return localStorage.getItem('glosa:net:map') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('glosa:net:implicit', showImplicit ? '1' : '0'); localStorage.setItem('glosa:net:map', showMap ? '1' : '0'); } catch { /* */ } }, [showImplicit, showMap]);
  const freq = useMemo(() => codeFrequency(project), [project]);
  const dens = useMemo(() => codeDensity(project), [project]);
  const onKeys = useMemo(() => new Set(net.nodes.map((n) => keyOf(n.ref))), [net.nodes]);

  const buildNodes = useCallback((): Node<NodeData>[] => net.nodes.map((n) => ({
    id: keyOf(n.ref), type: 'entity', position: { x: n.x, y: n.y }, data: nodeData(project, n.ref, freq, dens),
  })), [net.nodes, project, freq, dens]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(buildNodes());
  // Sincroniza con el proyecto (deshacer, cambios de nombre, nodos añadidos) conservando selección y medidas.
  useEffect(() => {
    setNodes((cur) => {
      const prev = new Map(cur.map((n) => [n.id, n]));
      return buildNodes().map((n) => ({ ...n, selected: prev.get(n.id)?.selected ?? false, measured: prev.get(n.id)?.measured }));
    });
  }, [buildNodes, setNodes]);

  const onLabel = useCallback((e: React.MouseEvent, linkId: string) => {
    e.stopPropagation();
    const p = st().project!;
    const link = p.links.find((l) => l.id === linkId);
    if (!link) return;
    openMenu(e, [
      ...p.relations.map((r) => ({ label: (r.id === link.relationId ? '✓ ' : '   ') + r.name, onClick: () => st().updateLink(linkId, r.id) })),
      { sep: true },
      { label: 'Invertir dirección', onClick: () => st().mutate((d) => { const l = d.links.find((x) => x.id === linkId)!; [l.source, l.target] = [l.target, l.source]; }) },
      { label: 'Eliminar vínculo', icon: <Trash2 size={15} />, danger: true, onClick: () => st().deleteLinks([linkId]) },
    ]);
  }, [openMenu, st]);

  const edges: Edge<EdgeData>[] = useMemo(() => {
    const list: Edge<EdgeData>[] = project.links
      .filter((l) => onKeys.has(keyOf(l.source)) && onKeys.has(keyOf(l.target)) && keyOf(l.source) !== keyOf(l.target))
      .map((l: Link) => {
        const r = project.relations.find((x) => x.id === l.relationId);
        const color = r?.color ?? '#64748b';
        return {
          id: l.id, source: keyOf(l.source), target: keyOf(l.target), type: 'floating',
          style: { stroke: color, strokeDasharray: r?.dashed ? '6 4' : undefined },
          markerEnd: r?.symmetric ? undefined : { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
          data: { label: r?.name ?? '', color, offset: 0, onLabel },
        };
      });
    if (showImplicit) {
      // Vínculos que ya existen en los datos aunque no sean relaciones con nombre.
      const seen = new Set<string>();
      const implicit = (a: EntityRef, b: EntityRef) => {
        const s = keyOf(a), t = keyOf(b);
        const eid = `${IMPLICIT}${s}>${t}`;
        if (!onKeys.has(s) || !onKeys.has(t) || s === t || seen.has(eid)) return;
        seen.add(eid);
        list.push({
          id: eid, source: s, target: t, type: 'floating', selectable: false, deletable: false, focusable: false,
          style: { stroke: 'var(--text-3)', strokeDasharray: '3 4', opacity: 0.75 },
          data: { label: '', color: 'var(--text-3)', offset: 0 },
        });
      };
      for (const n of net.nodes) {
        if (n.ref.kind === 'quotation') {
          const q = project.quotations.find((x) => x.id === n.ref.id);
          if (q) { for (const c of q.codeIds) implicit(n.ref, { kind: 'code', id: c }); implicit(n.ref, { kind: 'document', id: q.docId }); }
        }
        if (n.ref.kind === 'memo') for (const l of project.memos.find((x) => x.id === n.ref.id)?.links ?? []) implicit(n.ref, l);
      }
    }
    // Curvar las aristas paralelas entre el mismo par de nodos.
    const groups = new Map<string, Edge<EdgeData>[]>();
    for (const e of list) { const k = e.source < e.target ? e.source + '|' + e.target : e.target + '|' + e.source; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(e); }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      g.forEach((e, i) => { const o = (i - (g.length - 1) / 2) * 34; e.data = { ...e.data!, offset: e.source < e.target ? o : -o }; });
    }
    return list;
  }, [project.links, project.relations, project.quotations, project.memos, net.nodes, onKeys, onLabel, showImplicit]);

  const sizeOf = (k: string) => { const n = rf.getInternalNode(k); return { w: n?.measured.width ?? DEFAULT_W, h: n?.measured.height ?? DEFAULT_H }; };
  const currentBoxes = (): Box[] => (st().project!.networks.find((n) => n.id === id)?.nodes ?? []).map((n) => { const k = keyOf(n.ref); return { k, x: n.x, y: n.y, ...sizeOf(k) }; });

  /** Agrega nodos cerca de las posiciones sugeridas sin encimarlos con los que ya están. */
  const place = (items: { ref: EntityRef; x: number; y: number }[]) => {
    const fresh = items.filter((r, i, a) => !onKeys.has(keyOf(r.ref)) && a.findIndex((o) => keyOf(o.ref) === keyOf(r.ref)) === i);
    if (!fresh.length) return;
    const existing = currentBoxes();
    const boxes: Box[] = [...existing, ...fresh.map((r) => ({ k: keyOf(r.ref), x: r.x, y: r.y, w: DEFAULT_W, h: DEFAULT_H + (r.ref.kind === 'quotation' ? 30 : 0) }))];
    resolveOverlaps(boxes, new Set(existing.map((b) => b.k)));
    const placed = new Map(boxes.map((b) => [b.k, b]));
    st().addNetworkNodes(id, fresh.map((r) => { const b = placed.get(keyOf(r.ref))!; return { ref: r.ref, x: Math.round(b.x), y: Math.round(b.y) }; }));
  };

  const addAt = (refs: EntityRef[]) => {
    const r = wrap.current?.getBoundingClientRect();
    const center = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 });
    const cols = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(refs.length))));
    place(refs.map((ref, i) => ({ ref, x: center.x + (i % cols) * 230 - ((cols - 1) * 230) / 2 - DEFAULT_W / 2, y: center.y + Math.floor(i / cols) * 120 - DEFAULT_H / 2 })));
  };

  const neighbors = (refs: EntityRef[]) => {
    const p = st().project!;
    const out: EntityRef[] = [];
    for (const r of refs) {
      for (const l of p.links) {
        if (keyOf(l.source) === keyOf(r)) out.push(l.target);
        if (keyOf(l.target) === keyOf(r)) out.push(l.source);
      }
      for (const m of p.memos) if (m.links.some((x) => keyOf(x) === keyOf(r))) out.push({ kind: 'memo', id: m.id });
      if (r.kind === 'memo') out.push(...(p.memos.find((m) => m.id === r.id)?.links ?? []));
      if (r.kind === 'quotation') out.push(...(p.quotations.find((q) => q.id === r.id)?.codeIds ?? []).map((c) => ({ kind: 'code' as const, id: c })));
    }
    return out.filter((r, i, a) => a.findIndex((o) => keyOf(o) === keyOf(r)) === i && !onKeys.has(keyOf(r)));
  };

  const expand = (refs: EntityRef[], withQuotes = false) => {
    let add: EntityRef[] = [];
    if (withQuotes) {
      const p = st().project!;
      for (const r of refs) if (r.kind === 'code') add.push(...p.quotations.filter((q) => q.codeIds.includes(r.id)).slice(0, 12).map((q) => ({ kind: 'quotation' as const, id: q.id })));
      add = add.filter((r, i, a) => a.findIndex((o) => keyOf(o) === keyOf(r)) === i && !onKeys.has(keyOf(r)));
    } else add = neighbors(refs);
    if (!add.length) { st().toast(withQuotes ? 'Todas sus citas ya están en la red.' : 'No hay más elementos vinculados para agregar.', 'info'); return; }
    // Colocar los nuevos en círculo alrededor del centro del primer nodo.
    const base = currentBoxes().find((b) => b.k === keyOf(refs[0]));
    const cx = base ? base.x + base.w / 2 : 0, cy = base ? base.y + base.h / 2 : 0;
    const R = Math.max(240, (add.length * 210) / (2 * Math.PI));
    place(add.map((r, i) => {
      const a = (i / add.length) * Math.PI * 2 - Math.PI / 2;
      return { ref: r, x: cx + Math.cos(a) * R - DEFAULT_W / 2, y: cy + Math.sin(a) * R * 0.75 - DEFAULT_H / 2 };
    }));
  };

  const layout = () => {
    const boxes = currentBoxes();
    if (boxes.length < 2) return;
    const idx = new Map(boxes.map((b, i) => [b.k, i]));
    const links = edges.map((e) => [idx.get(e.source), idx.get(e.target)] as [number | undefined, number | undefined])
      .filter((x): x is [number, number] => x[0] !== undefined && x[1] !== undefined);
    const out = forceLayout(boxes, links);
    st().moveNetworkNodes(id, out.map((b) => ({ ref: refOf(b.k), x: Math.round(b.x), y: Math.round(b.y) })));
    setTimeout(() => rf.fitView({ padding: 0.15, duration: 400 }), 60);
  };

  const exportImage = async (kind: 'png' | 'svg') => {
    const { toPng, toSvg } = await import('html-to-image');
    const bounds = getNodesBounds(rf.getNodes());
    const w = Math.min(4000, Math.max(800, bounds.width + 200)), h = Math.min(4000, Math.max(600, bounds.height + 200));
    const vp = getViewportForBounds(bounds, w, h, 0.2, 2, 0.08);
    const el = wrap.current!.querySelector('.react-flow__viewport') as HTMLElement;
    const bg = getComputedStyle(document.body).getPropertyValue('--bg-elev').trim() || '#ffffff';
    const opts = { backgroundColor: bg, width: w, height: h, pixelRatio: 2, style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } };
    try {
      if (kind === 'png') {
        const url = await toPng(el, opts);
        const bin = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
        await exportFile(net.name, bin, 'png', 'Imagen PNG');
      } else {
        const url = await toSvg(el, opts);
        await exportFile(net.name, decodeURIComponent(url.split(',')[1]), 'svg', 'Imagen SVG');
      }
    } catch (e) {
      st().toast('No se pudo generar la imagen: ' + (e as Error).message, 'error');
    }
  };

  const selectedRefs = () => rf.getNodes().filter((n) => n.selected).map((n) => refOf(n.id));

  const onNodeContext = (e: React.MouseEvent, n: Node<NodeData>) => {
    const r = n.data.ref;
    openMenu(e, [
      { label: 'Abrir', icon: <KindIcon kind={r.kind} size={15} />, onClick: () => openRef(r) },
      { label: 'Agregar vecinos vinculados', icon: <Expand size={15} />, onClick: () => expand([r]) },
      ...(r.kind === 'code' ? [{ label: 'Agregar sus citas', icon: <Plus size={15} />, onClick: () => expand([r], true) }] : []),
      { label: 'Vincular con…', icon: <Share2 size={15} />, onClick: () => st().setDialog({ type: 'link', source: r }) },
      { sep: true },
      { label: 'Quitar de la red', icon: <X size={15} />, onClick: () => st().removeNetworkNodes(id, [r]) },
    ]);
  };

  const openRef = (r: EntityRef) => {
    if (r.kind === 'quotation') st().revealQuotation(r.id);
    else if (r.kind === 'memo') st().openTab('memo', r.id);
    else if (r.kind === 'document') st().openTab('document', r.id);
    else st().select(r);
  };

  return (
    <>
      <div className="toolbar">
        <input className="input sm" style={{ width: 220, fontWeight: 600 }} defaultValue={net.name} key={net.name} onBlur={(e) => e.target.value.trim() && e.target.value !== net.name && st().updateNetwork(id, { name: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <div className="sep" />
        <button className={'btn sm' + (showAdd ? ' active' : '')} onClick={() => setShowAdd(!showAdd)}><Plus size={14} />Agregar nodos</button>
        <button className="btn sm" onClick={() => { const s = selectedRefs(); s.length ? expand(s) : st().toast('Selecciona uno o más nodos primero.', 'info'); }}><Expand size={14} />Vecinos</button>
        <button className="btn sm" onClick={layout} title="Reorganizar automáticamente"><Sparkles size={14} />Organizar</button>
        <button className="btn sm" onClick={() => rf.fitView({ padding: 0.15, duration: 300 })}><Maximize2 size={14} />Ajustar vista</button>
        <button className={'btn ghost icon sm' + (showImplicit ? ' active' : '')} onClick={() => setShowImplicit(!showImplicit)}
          title={showImplicit ? 'Ocultar las líneas punteadas (cita–código, memo–elemento)' : 'Mostrar como líneas punteadas los vínculos cita–código y memo–elemento'}>{showImplicit ? <Eye size={15} /> : <EyeOff size={15} />}</button>
        <button className={'btn ghost icon sm' + (showMap ? ' active' : '')} onClick={() => setShowMap(!showMap)} title="Mostrar u ocultar la vista general"><MapIcon size={15} /></button>
        <span className="spacer" />
        <span className="small muted net-hint">Arrastra desde el punto azul de un nodo hasta otro para vincularlos</span>
        <button className="btn sm" onClick={() => exportImage('png')}><Download size={14} />PNG</button>
        <button className="btn sm" onClick={() => exportImage('svg')}><Download size={14} />SVG</button>
        <button className="btn sm" onClick={() => exportFile(net.name, networkGraphml(project, net), 'graphml', 'GraphML (Gephi, yEd, Cytoscape)')}><Download size={14} />GraphML</button>
      </div>
      <div className="net-wrap" ref={wrap}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-glosa-code') || e.dataTransfer.types.includes('application/x-glosa-ref')) e.preventDefault(); }}
        onDrop={(e) => {
          const code = e.dataTransfer.getData('application/x-glosa-code');
          const ref = e.dataTransfer.getData('application/x-glosa-ref');
          const r: EntityRef | null = code ? { kind: 'code', id: code } : ref ? refOf(ref) : null;
          if (!r) return;
          e.preventDefault();
          const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          place([{ ref: r, x: pos.x - DEFAULT_W / 2, y: pos.y - DEFAULT_H / 2 }]);
        }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, __, dragged) => st().moveNetworkNodes(id, dragged.map((n) => ({ ref: refOf(n.id), x: n.position.x, y: n.position.y })))}
          onConnect={(c) => { if (c.source && c.target && c.source !== c.target) st().setDialog({ type: 'link', source: refOf(c.source), target: refOf(c.target) }); }}
          // Al borrar un nodo, React Flow también borra sus aristas. Aquí sólo se quita el nodo de la red;
          // del proyecto se eliminan únicamente los vínculos que se seleccionaron explícitamente.
          onDelete={({ nodes: dn, edges: de }) => {
            if (dn.length) st().removeNetworkNodes(id, dn.map((n) => refOf(n.id)));
            const gone = new Set(dn.map((n) => n.id));
            const links = de.filter((e) => !e.id.startsWith(IMPLICIT) && !gone.has(e.source) && !gone.has(e.target));
            if (links.length) { st().deleteLinks(links.map((e) => e.id)); st().toast(links.length === 1 ? 'Vínculo eliminado' : `${links.length} vínculos eliminados`, 'info', { label: 'Deshacer', run: () => st().undo() }); }
          }}
          onNodeDoubleClick={(_, n) => openRef(n.data.ref)}
          onNodeClick={(_, n) => { if (n.data.ref.kind !== 'document') st().select(n.data.ref); }}
          onNodeContextMenu={onNodeContext}
          onPaneClick={() => st().select(null)}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          minZoom={0.1} maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1.2} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
        {showMap && <NetMiniMap edges={edges} />}
        {showAdd && <AddPanel project={project} onKeys={onKeys} onAdd={addAt} onClose={() => setShowAdd(false)} />}
        {net.nodes.length === 0 && !showAdd && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <div className="muted">Arrastra códigos desde la barra lateral o usa «Agregar nodos».</div>
          </div>
        )}
      </div>
      {menu}
    </>
  );
}

function AddPanel({ project, onKeys, onAdd, onClose }: { project: ProjectData; onKeys: Set<string>; onAdd: (r: EntityRef[]) => void; onClose: () => void }) {
  const [kind, setKind] = useState<EntityRef['kind']>('code');
  const [q, setQ] = useState('');
  const items: EntityRef[] = (kind === 'code' ? project.codes.map((c) => ({ kind, id: c.id }))
    : kind === 'memo' ? project.memos.map((m) => ({ kind, id: m.id }))
      : kind === 'document' ? project.documents.map((d) => ({ kind, id: d.id }))
        : project.quotations.map((x) => ({ kind, id: x.id })))
    .filter((r) => !onKeys.has(keyOf(r)) && matches(entityName(project, r), q))
    .slice(0, 300);
  return (
    <div className="net-side">
      <div className="row" style={{ padding: '10px 10px 6px' }}>
        <b className="grow">Agregar a la red</b>
        <button className="btn ghost icon sm" onClick={onClose}><X size={14} /></button>
      </div>
      <div style={{ padding: '0 10px 8px' }} className="col">
        <div className="seg" style={{ width: '100%' }}>
          {(['code', 'quotation', 'memo', 'document'] as const).map((k) => <button key={k} className={kind === k ? 'on' : ''} style={{ flex: 1, padding: 0 }} onClick={() => setKind(k)}>{KIND_LABEL[k]}s</button>)}
        </div>
        <div className="input-wrap"><Search size={13} /><input className="input sm" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div style={{ overflowY: 'auto', padding: '0 6px 8px', flex: 1 }}>
        {items.map((r) => {
          const c = r.kind === 'code' ? project.codes.find((x) => x.id === r.id) : undefined;
          return (
            <div key={keyOf(r)} className="opt" draggable onDragStart={(e) => e.dataTransfer.setData('application/x-glosa-ref', keyOf(r))} onClick={() => onAdd([r])} title="Clic para agregar o arrástralo al lienzo">
              {c ? <span className="code-swatch" style={{ background: c.color }} /> : <KindIcon kind={r.kind} size={13} />}
              <span className="ellipsis small">{entityName(project, r)}</span>
            </div>
          );
        })}
        {!items.length && <div className="small muted" style={{ padding: 10 }}>No hay elementos para agregar.</div>}
      </div>
      {items.length > 1 && <div style={{ padding: 8, borderTop: '1px solid var(--line)' }}><button className="btn sm" style={{ width: '100%' }} onClick={() => onAdd(items.slice(0, 40))}>Agregar todos ({Math.min(40, items.length)})</button></div>}
    </div>
  );
}
