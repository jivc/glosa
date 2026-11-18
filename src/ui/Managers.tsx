import { ArrowDown, ArrowUp, Download, FilePlus2, FileText, Folder, FolderPlus, Merge, MessageSquareText, Pencil, Plus, Quote, Search, Share2, StickyNote, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { exportFile, pickAndAddDocuments } from '../actions';
import { codeDensity, codeFrequency, descendants, wordCount } from '../core/analysis';
import { codebookRows, memoRows, quotationRows, toCsv, toXlsx } from '../core/exporters';
import { entityName, pageOf, quotationNumber } from '../core/model';
import type { ID, Memo, Quotation } from '../core/types';
import { useStore } from '../store';
import { CodeChip, Empty, fmtDate, InlineEdit, matches, useContextMenu } from './common';
import { CodePicker } from './CodePicker';
import { editCodeComment, editDocComment, editQuotationComment } from './comments';

/** Celda de texto que se edita con un clic (definiciones y comentarios). */
function CommentCell({ text, placeholder, onEdit }: { text: string; placeholder: string; onEdit: () => void }) {
  return (
    <td className="desc">
      <span className="desc-edit" role="button" title={text ? text + '\n\n(Clic para editar)' : placeholder} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
        {text ? <span className="ellipsis">{text}</span> : <span className="ph">{placeholder}</span>}
        <Pencil size={12} className="pen" />
      </span>
    </td>
  );
}

type Sort = { key: string; dir: 1 | -1 };

function Th({ k, sort, setSort, children, num }: { k: string; sort: Sort; setSort: (s: Sort) => void; children: ReactNode; num?: boolean }) {
  return (
    <th className={'sortable' + (num ? ' num' : '')} onClick={() => setSort({ key: k, dir: sort.key === k ? (-sort.dir as 1 | -1) : num ? -1 : 1 })}>
      {children}{sort.key === k && (sort.dir === 1 ? <ArrowUp size={11} style={{ marginLeft: 3 }} /> : <ArrowDown size={11} style={{ marginLeft: 3 }} />)}
    </th>
  );
}

function useSelection() {
  const [sel, setSel] = useState<ID[]>([]);
  const [anchor, setAnchor] = useState<ID | null>(null);
  const click = (id: ID, e: React.MouseEvent, order: ID[]) => {
    if (e.shiftKey && anchor) {
      const a = order.indexOf(anchor), b = order.indexOf(id);
      const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
      setSel([...new Set([...sel, ...range])]);
    } else if (e.metaKey || e.ctrlKey) {
      setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
      setAnchor(id);
    } else { setSel([id]); setAnchor(id); }
  };
  return { sel, setSel, click };
}

// ======================================================================== Códigos

export function CodeManager() {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<ID | ''>('');
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 1 });
  const { sel, setSel, click } = useSelection();
  const [menu, openMenu] = useContextMenu();
  const freq = useMemo(() => codeFrequency(project), [project]);
  const dens = useMemo(() => codeDensity(project), [project]);
  const byId = useMemo(() => new Map(project.codes.map((c) => [c.id, c])), [project.codes]);
  const path = (id: ID): string => { const c = byId.get(id)!; return c.parentId && byId.has(c.parentId) ? path(c.parentId) + ' › ' + c.name : c.name; };
  const docsPer = useMemo(() => {
    const m = new Map<ID, Set<ID>>();
    for (const x of project.quotations) for (const c of x.codeIds) { if (!m.has(c)) m.set(c, new Set()); m.get(c)!.add(x.docId); }
    return m;
  }, [project.quotations]);

  const rows = project.codes
    .filter((c) => matches(c.name + ' ' + c.description, q) && (!group || c.groupIds.includes(group)))
    .map((c) => ({ c, path: path(c.id), f: freq.get(c.id) ?? 0, d: dens.get(c.id) ?? 0, docs: docsPer.get(c.id)?.size ?? 0 }))
    .sort((a, b) => {
      const v = sort.key === 'name' ? a.path.localeCompare(b.path, 'es') : sort.key === 'f' ? a.f - b.f : sort.key === 'd' ? a.d - b.d : sort.key === 'docs' ? a.docs - b.docs : a.c.createdAt.localeCompare(b.c.createdAt);
      return v * sort.dir;
    });
  const order = rows.map((r) => r.c.id);

  const delSel = () => st().confirm('Eliminar códigos', `Se eliminarán ${sel.length} códigos y se quitarán de sus citas. Las citas se conservan.`, () => { st().deleteCodes(sel); setSel([]); }, { danger: true, confirmLabel: 'Eliminar' });
  const groupSel = () => st().prompt('Agrupar códigos', 'Nombre del grupo', '', (v) => { if (v.trim()) { st().createCodeGroup(v.trim(), sel); st().toast(`Grupo «${v.trim()}» creado con ${sel.length} códigos`, 'success'); } }, 'Crear grupo');

  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Gestor de códigos</div><div className="view-sub">{project.codes.length} códigos · {project.codeGroups.length} grupos</div></div>
        <span className="spacer" />
        <button className="btn" onClick={() => exportFile(project.name + ' - libro de códigos', toCsv(codebookRows(project)), 'csv', 'CSV')}><Download size={15} />CSV</button>
        <button className="btn" onClick={async () => exportFile(project.name + ' - libro de códigos', await toXlsx([{ name: 'Códigos', rows: codebookRows(project) }]), 'xlsx', 'Excel')}><Download size={15} />Excel</button>
        <button className="btn primary" onClick={() => st().prompt('Nuevo código', 'Nombre del código', '', (v) => { if (v.trim()) { const id = st().createCode(v.trim()); st().select({ kind: 'code', id }); } }, 'Crear')}><Plus size={15} />Nuevo código</button>
      </div>
      <div className="toolbar">
        <div className="input-wrap" style={{ width: 260 }}><Search size={14} /><input className="input sm" placeholder="Buscar por nombre o definición…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select input sm" style={{ width: 200 }} value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Todos los grupos</option>
          {project.codeGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="sep" />
        <span className="small muted">{sel.length ? `${sel.length} seleccionados` : 'Usa ⇧ o Ctrl/⌘ para seleccionar varios'}</span>
        {sel.length > 0 && <>
          <button className="btn sm" onClick={groupSel}><FolderPlus size={14} />Agrupar</button>
          <button className="btn sm" onClick={() => st().setDialog({ type: 'merge-codes', codeIds: sel })}><Merge size={14} />Fusionar</button>
          <button className="btn sm" onClick={() => { const id = st().createNetwork('Red de códigos', sel.map((c) => ({ kind: 'code' as const, id: c }))); st().openTab('network', id); }}><Share2 size={14} />Crear red</button>
          <button className="btn sm danger" onClick={delSel}><Trash2 size={14} />Eliminar</button>
        </>}
      </div>
      <div className="view-scroll">
        {project.codes.length === 0 ? (
          <Empty icon={<Tag size={26} />} title="Todavía no hay códigos">Los códigos son etiquetas que asignas a fragmentos del texto. Puedes crearlos aquí o directamente mientras lees un documento.</Empty>
        ) : (
          <table className="table">
            <thead><tr>
              <th style={{ width: 28 }}></th>
              <Th k="name" sort={sort} setSort={setSort}>Código</Th>
              <Th k="f" sort={sort} setSort={setSort} num>Citas</Th>
              <Th k="docs" sort={sort} setSort={setSort} num>Docs.</Th>
              <Th k="d" sort={sort} setSort={setSort} num>Vínculos</Th>
              <th>Grupos</th>
              <th>Definición</th>
              <Th k="created" sort={sort} setSort={setSort}>Creado</Th>
            </tr></thead>
            <tbody>
              {rows.map(({ c, path: pth, f, d, docs }) => (
                <tr key={c.id} className={sel.includes(c.id) ? 'on' : ''}
                  onClick={(e) => { click(c.id, e, order); st().select({ kind: 'code', id: c.id }); }}
                  onDoubleClick={() => { st().select({ kind: 'code', id: c.id }); st().openTab('quotations'); }}
                  onContextMenu={(e) => { if (!sel.includes(c.id)) setSel([c.id]); st().select({ kind: 'code', id: c.id }); openMenu(e, [
                    { label: 'Ver citas', icon: <Quote size={15} />, onClick: () => st().openTab('quotations') },
                    { label: c.description ? 'Editar definición o comentario…' : 'Agregar definición o comentario…', icon: <MessageSquareText size={15} />, onClick: () => editCodeComment(c) },
                    { label: 'Fusionar…', icon: <Merge size={15} />, onClick: () => st().setDialog({ type: 'merge-codes', codeIds: sel.includes(c.id) ? sel : [c.id] }) },
                    { label: 'Agrupar…', icon: <FolderPlus size={15} />, onClick: groupSel },
                    { sep: true },
                    { label: 'Eliminar', icon: <Trash2 size={15} />, danger: true, onClick: () => st().confirm('Eliminar código', `¿Eliminar «${c.name}»?`, () => st().deleteCodes([c.id]), { danger: true, confirmLabel: 'Eliminar' }) },
                  ]); }}
                  draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-glosa-code', c.id); }}>
                  <td><span className="code-swatch" style={{ background: c.color, display: 'block' }} /></td>
                  <td style={{ fontWeight: 500 }}>{pth.includes(' › ') ? <><span className="muted">{pth.slice(0, pth.lastIndexOf(' › ') + 3)}</span>{c.name}</> : c.name}</td>
                  <td className="num">{f}</td>
                  <td className="num">{docs}</td>
                  <td className="num">{d}</td>
                  <td><div className="chips">{c.groupIds.map((g) => { const gg = project.codeGroups.find((x) => x.id === g); return gg ? <CodeChip key={g} name={gg.name} color={gg.color} /> : null; })}</div></td>
                  <CommentCell text={c.description} placeholder="Agregar definición…" onEdit={() => editCodeComment(c)} />
                  <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{new Date(c.createdAt).toLocaleDateString('es-MX')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {project.codeGroups.length > 0 && (
          <div className="view-pad">
            <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Grupos de códigos</h3>
            <GroupList kind="code" />
          </div>
        )}
      </div>
      {menu}
    </>
  );
}

function GroupList({ kind }: { kind: 'code' | 'document' }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const groups = kind === 'code' ? project.codeGroups : project.documentGroups;
  const members = (gid: ID) => (kind === 'code' ? project.codes.filter((c) => c.groupIds.includes(gid)).map((c) => c.name) : project.documents.filter((d) => d.groupIds.includes(gid)).map((d) => d.name));
  const rename = (gid: ID, name: string) => st().mutate((d) => { const g = (kind === 'code' ? d.codeGroups : d.documentGroups).find((x) => x.id === gid); if (g) g.name = name; });
  const remove = (gid: ID) => st().mutate((d) => {
    if (kind === 'code') { d.codeGroups = d.codeGroups.filter((g) => g.id !== gid); d.codes.forEach((c) => { c.groupIds = c.groupIds.filter((x) => x !== gid); }); }
    else { d.documentGroups = d.documentGroups.filter((g) => g.id !== gid); d.documents.forEach((c) => { c.groupIds = c.groupIds.filter((x) => x !== gid); }); }
  });
  return (
    <div className="col">
      {groups.map((g) => (
        <div key={g.id} className="card row" style={{ padding: 10, alignItems: 'flex-start' }}>
          <Folder size={16} style={{ color: g.color, marginTop: 7 }} />
          <div className="grow col" style={{ gap: 4 }}>
            <InlineEdit value={g.name} className="input sm" onSave={(v) => v.trim() && rename(g.id, v.trim())} />
            <div className="small muted">{members(g.id).join(', ') || 'Sin miembros'}</div>
          </div>
          <button className="btn ghost icon sm" title="Eliminar grupo" onClick={() => st().confirm('Eliminar grupo', `¿Eliminar el grupo «${g.name}»? Sus miembros no se borran.`, () => remove(g.id), { danger: true, confirmLabel: 'Eliminar' })}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// ======================================================================== Citas

export function QuotationList({ quotes, empty, compact }: { quotes: Quotation[]; empty?: ReactNode; compact?: boolean }) {
  const project = useStore((s) => s.project!);
  const active = useStore((s) => s.activeQuotationId);
  const st = useStore.getState;
  const [limit, setLimit] = useState(200);
  const [picker, setPicker] = useState<{ x: number; y: number; qid: ID } | null>(null);
  const [menu, openMenu] = useContextMenu();
  const docs = useMemo(() => new Map(project.documents.map((d) => [d.id, d])), [project.documents]);
  const codes = useMemo(() => new Map(project.codes.map((c) => [c.id, c])), [project.codes]);
  if (!quotes.length) return <>{empty ?? <div className="muted small" style={{ padding: 20, textAlign: 'center' }}>No hay citas que mostrar.</div>}</>;
  return (
    <div className="qlist">
      {quotes.slice(0, limit).map((q) => {
        const d = docs.get(q.docId)!;
        const page = pageOf(d, q.start);
        const qc = q.codeIds.map((c) => codes.get(c)).filter(Boolean);
        return (
          <div key={q.id} className={'qcard' + (active === q.id ? ' on' : '')}
            onClick={() => st().setActiveQuotation(q.id)} onDoubleClick={() => st().revealQuotation(q.id)}
            onContextMenu={(e) => { st().setActiveQuotation(q.id); openMenu(e, [
              { label: 'Ir al documento', icon: <FileText size={15} />, onClick: () => st().revealQuotation(q.id) },
              { label: 'Agregar código…', icon: <Tag size={15} />, onClick: () => setPicker({ x: e.clientX, y: e.clientY, qid: q.id }) },
              { label: q.comment ? 'Editar comentario…' : 'Comentar la cita…', icon: <MessageSquareText size={15} />, onClick: () => editQuotationComment(q.id) },
              { label: 'Escribir memo', icon: <StickyNote size={15} />, onClick: () => { const id = st().createMemo('Memo sobre ' + quotationNumber(project, q), [{ kind: 'quotation', id: q.id }]); st().openTab('memo', id); } },
              { sep: true },
              { label: 'Eliminar cita', icon: <Trash2 size={15} />, danger: true, onClick: () => st().deleteQuotations([q.id]) },
            ]); }}>
            <div className="meta">
              <b>{quotationNumber(project, q)}</b>
              <span className="ellipsis">{d.name}{page ? ` · p. ${page}` : ''}</span>
              <span className="spacer" />
              <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); st().revealQuotation(q.id); }}>Ver en contexto</button>
            </div>
            <div className="txt" style={compact ? { WebkitLineClamp: 3 } : undefined}>{d.text.slice(q.start, q.end)}</div>
            <div className="chips">
              {qc.map((c) => <CodeChip key={c!.id} name={c!.name} color={c!.color} onRemove={() => st().toggleCodeOnQuotation(q.id, c!.id, false)} />)}
              <button className="btn ghost sm" style={{ height: 22 }} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setPicker({ x: r.left, y: r.bottom + 4, qid: q.id }); }}><Plus size={12} />código</button>
              {!q.comment && <button className="btn ghost sm" style={{ height: 22 }} onClick={(e) => { e.stopPropagation(); editQuotationComment(q.id); }}><MessageSquareText size={12} />comentario</button>}
            </div>
            {q.comment && <div className="cm editable" title="Clic para editar el comentario" onClick={(e) => { e.stopPropagation(); editQuotationComment(q.id); }}>{q.comment}</div>}
          </div>
        );
      })}
      {quotes.length > limit && <button className="btn" onClick={() => setLimit(limit + 200)}>Mostrar más ({quotes.length - limit} restantes)</button>}
      {picker && <CodePicker x={picker.x} y={picker.y} exclude={quotes.find((x) => x.id === picker.qid)?.codeIds} onClose={() => setPicker(null)} onPick={(ids) => ids.forEach((c) => st().toggleCodeOnQuotation(picker.qid, c, true))} title="Agregar código a la cita" />}
      {menu}
    </div>
  );
}

export function QuotationManager() {
  const project = useStore((s) => s.project!);
  const selected = useStore((s) => s.selected);
  const [q, setQ] = useState('');
  const [docF, setDocF] = useState<ID | ''>('');
  const [docGroup, setDocGroup] = useState<ID | ''>('');
  const [codeF, setCodeF] = useState<ID | ''>('');
  const [onlyFree, setOnlyFree] = useState(false);
  const [order, setOrder] = useState<'doc' | 'new' | 'long'>('doc');
  // Al abrir desde un código o documento, filtrar por él.
  const [lastSel, setLastSel] = useState<string | null>(null);
  const selKey = selected ? selected.kind + selected.id : null;
  if (selKey !== lastSel) {
    setLastSel(selKey);
    if (selected?.kind === 'code') { setCodeF(selected.id); setOnlyFree(false); }
    if (selected?.kind === 'document') setDocF(selected.id);
  }
  const codeSet = codeF ? descendants(project, codeF) : null;
  const docIndex = new Map(project.documents.map((d, i) => [d.id, i]));
  const list = project.quotations.filter((x) => {
    if (docF && x.docId !== docF) return false;
    if (docGroup && !project.documents.find((d) => d.id === x.docId)?.groupIds.includes(docGroup)) return false;
    if (codeSet && !x.codeIds.some((c) => codeSet.has(c))) return false;
    if (onlyFree && x.codeIds.length) return false;
    if (q) {
      const d = project.documents.find((dd) => dd.id === x.docId)!;
      if (!matches(d.text.slice(x.start, x.end) + ' ' + x.comment, q)) return false;
    }
    return true;
  }).sort((a, b) => order === 'doc' ? (docIndex.get(a.docId)! - docIndex.get(b.docId)! || a.start - b.start) : order === 'new' ? b.createdAt.localeCompare(a.createdAt) : (b.end - b.start) - (a.end - a.start));

  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Gestor de citas</div><div className="view-sub">{list.length} de {project.quotations.length} citas</div></div>
        <span className="spacer" />
        <button className="btn" onClick={() => exportFile(project.name + ' - citas', toCsv(quotationRows(project, list)), 'csv', 'CSV')}><Download size={15} />CSV</button>
        <button className="btn" onClick={async () => exportFile(project.name + ' - citas', await toXlsx([{ name: 'Citas', rows: quotationRows(project, list), widths: { Cita: 70 } }]), 'xlsx', 'Excel')}><Download size={15} />Excel</button>
      </div>
      <div className="toolbar">
        <div className="input-wrap" style={{ width: 240 }}><Search size={14} /><input className="input sm" placeholder="Buscar en el texto o comentario…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input sm" style={{ width: 190 }} value={codeF} onChange={(e) => setCodeF(e.target.value)}>
          <option value="">Todos los códigos</option>
          {[...project.codes].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input sm" style={{ width: 190 }} value={docF} onChange={(e) => setDocF(e.target.value)}>
          <option value="">Todos los documentos</option>
          {project.documents.map((d, i) => <option key={d.id} value={d.id}>D{i + 1} · {d.name}</option>)}
        </select>
        {project.documentGroups.length > 0 && (
          <select className="input sm" style={{ width: 170 }} value={docGroup} onChange={(e) => setDocGroup(e.target.value)}>
            <option value="">Todos los grupos</option>
            {project.documentGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <label className="check small"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />Sólo sin código</label>
        <span className="spacer" />
        <div className="seg">
          <button className={order === 'doc' ? 'on' : ''} onClick={() => setOrder('doc')}>Por documento</button>
          <button className={order === 'new' ? 'on' : ''} onClick={() => setOrder('new')}>Recientes</button>
          <button className={order === 'long' ? 'on' : ''} onClick={() => setOrder('long')}>Extensión</button>
        </div>
        {(codeF || docF || docGroup || q || onlyFree) && <button className="btn ghost sm" onClick={() => { setCodeF(''); setDocF(''); setDocGroup(''); setQ(''); setOnlyFree(false); }}><X size={14} />Limpiar</button>}
      </div>
      <div className="view-scroll"><div className="view-pad" style={{ maxWidth: 980 }}>
        <QuotationList quotes={list} empty={<Empty icon={<Quote size={26} />} title={project.quotations.length ? 'Ninguna cita coincide' : 'Todavía no hay citas'}>{project.quotations.length ? 'Prueba con otros filtros.' : 'Abre un documento, selecciona un fragmento y codifícalo para crear tu primera cita.'}</Empty>} />
      </div></div>
    </>
  );
}

// ======================================================================== Memos

export function MemoManager() {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const list = project.memos.filter((m) => matches(m.title + ' ' + m.content, q) && (!type || m.type === type)).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Gestor de memos</div><div className="view-sub">{project.memos.length} memos</div></div>
        <span className="spacer" />
        <button className="btn" onClick={() => exportFile(project.name + ' - memos', toCsv(memoRows(project)), 'csv', 'CSV')}><Download size={15} />CSV</button>
        <button className="btn primary" onClick={() => { const id = st().createMemo('Memo sin título'); st().openTab('memo', id); }}><Plus size={15} />Nuevo memo</button>
      </div>
      <div className="toolbar">
        <div className="input-wrap" style={{ width: 260 }}><Search size={14} /><input className="input sm" placeholder="Buscar en memos…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input sm" style={{ width: 170 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {['analítico', 'metodológico', 'teórico', 'reflexivo', 'otro'].map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>
      <div className="view-scroll"><div className="view-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {list.map((m) => <MemoCard key={m.id} m={m} />)}
        {!list.length && <div style={{ gridColumn: '1 / -1' }}><Empty icon={<StickyNote size={26} />} title={project.memos.length ? 'Ningún memo coincide' : 'Todavía no hay memos'}>Un memo es un espacio para escribir tus interpretaciones, dudas y decisiones. Puedes vincularlo con citas, códigos o documentos.</Empty></div>}
      </div></div>
    </>
  );
}

function MemoCard({ m }: { m: Memo }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  return (
    <div className="card" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', gap: 8 }} onClick={() => st().openTab('memo', m.id)}>
      <div className="row"><StickyNote size={15} style={{ color: '#d9a91a' }} /><b className="grow ellipsis">{m.title || 'Memo sin título'}</b><span className="chip">{m.type}</span></div>
      <div className="small" style={{ color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap', minHeight: 20 }}>{m.content || <span className="muted">Sin contenido</span>}</div>
      {m.links.length > 0 && <div className="small muted ellipsis">Vinculado a: {m.links.map((l) => entityName(project, l)).join('; ')}</div>}
      <div className="small muted">Modificado {fmtDate(m.modifiedAt)}</div>
    </div>
  );
}

// ======================================================================== Documentos

export function DocumentManager() {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const { sel, setSel, click } = useSelection();
  const [group, setGroup] = useState<ID | ''>('');
  const qcount = useMemo(() => { const m = new Map<ID, number>(); for (const x of project.quotations) m.set(x.docId, (m.get(x.docId) ?? 0) + 1); return m; }, [project.quotations]);
  const rows = project.documents.map((d, i) => ({ d, i })).filter(({ d }) => !group || d.groupIds.includes(group));
  const order = rows.map((r) => r.d.id);
  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Gestor de documentos</div><div className="view-sub">{project.documents.length} documentos · {project.documentGroups.length} grupos</div></div>
        <span className="spacer" />
        <button className="btn primary" onClick={pickAndAddDocuments}><FilePlus2 size={15} />Agregar documentos</button>
      </div>
      <div className="toolbar">
        <select className="input sm" style={{ width: 200 }} value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Todos los grupos</option>
          {project.documentGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="sep" />
        <span className="small muted">{sel.length ? `${sel.length} seleccionados` : 'Selecciona documentos para agruparlos'}</span>
        {sel.length > 0 && <>
          <button className="btn sm" onClick={() => st().prompt('Agrupar documentos', 'Nombre del grupo (p. ej. «Mujeres», «Docentes», «Zona rural»)', '', (v) => v.trim() && st().createDocGroup(v.trim(), sel), 'Crear grupo')}><FolderPlus size={14} />Agrupar</button>
          {project.documentGroups.length > 0 && (
            <select className="input sm" style={{ width: 180 }} value="" onChange={(e) => {
              const gid = e.target.value; if (!gid) return;
              st().mutate((d) => { d.documents.forEach((doc) => { if (sel.includes(doc.id) && !doc.groupIds.includes(gid)) doc.groupIds.push(gid); }); });
            }}>
              <option value="">Añadir a grupo…</option>
              {project.documentGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <button className="btn sm danger" onClick={() => st().confirm('Eliminar documentos', `Se eliminarán ${sel.length} documentos y todas sus citas.`, () => { st().deleteDocs(sel); setSel([]); }, { danger: true, confirmLabel: 'Eliminar' })}><Trash2 size={14} />Eliminar</button>
        </>}
      </div>
      <div className="view-scroll">
        {!project.documents.length ? (
          <Empty icon={<FileText size={26} />} title="Agrega tu primer documento" action={<button className="btn primary" onClick={pickAndAddDocuments}><FilePlus2 size={15} />Agregar documentos</button>}>
            Glosa acepta Word (DOCX), PDF con texto, OpenDocument (ODT), RTF, Markdown, HTML y texto plano. También puedes arrastrar los archivos a la ventana.
          </Empty>
        ) : (
          <table className="table">
            <thead><tr><th style={{ width: 50 }}>#</th><th>Documento</th><th>Tipo</th><th className="num">Palabras</th><th className="num">Citas</th><th>Grupos</th><th>Comentario</th></tr></thead>
            <tbody>
              {rows.map(({ d, i }) => (
                <tr key={d.id} className={sel.includes(d.id) ? 'on' : ''} onClick={(e) => { click(d.id, e, order); st().select({ kind: 'document', id: d.id }); }} onDoubleClick={() => st().openTab('document', d.id)}>
                  <td className="muted">D{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{d.name}</td>
                  <td><span className="ext">{d.kind.toUpperCase()}</span></td>
                  <td className="num">{wordCount(d.text).toLocaleString('es-MX')}</td>
                  <td className="num">{qcount.get(d.id) ?? 0}</td>
                  <td><div className="chips">{d.groupIds.map((g) => { const gg = project.documentGroups.find((x) => x.id === g); return gg ? <CodeChip key={g} name={gg.name} color={gg.color} /> : null; })}</div></td>
                  <CommentCell text={d.comment} placeholder="Agregar comentario…" onEdit={() => editDocComment(d.id)} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {project.documentGroups.length > 0 && <div className="view-pad"><h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Grupos de documentos</h3><GroupList kind="document" /></div>}
      </div>
    </>
  );
}
