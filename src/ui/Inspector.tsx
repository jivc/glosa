import { ArrowRight, Crop, ExternalLink, Folder, Link2, Lightbulb, Merge, Plus, Quote, Share2, StickyNote, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { codeDensity, codeFrequency, descendants, wordCount } from '../core/analysis';
import { entityName, pageOf, quotationLabel, quotationNumber } from '../core/model';
import type { EntityRef, ID, ProjectData } from '../core/types';
import { useStore } from '../store';
import { CodeChip, ColorPicker, fmtDate, InlineEdit, KindIcon, KIND_LABEL } from './common';
import { CodePicker } from './CodePicker';

const sameRef = (a: EntityRef, b: EntityRef) => a.kind === b.kind && a.id === b.id;

export function Inspector() {
  const project = useStore((s) => s.project!);
  const selected = useStore((s) => s.selected);
  const exists = selected && (
    selected.kind === 'code' ? project.codes.some((c) => c.id === selected.id)
      : selected.kind === 'quotation' ? project.quotations.some((q) => q.id === selected.id)
        : selected.kind === 'memo' ? project.memos.some((m) => m.id === selected.id)
          : project.documents.some((d) => d.id === selected.id));
  return (
    <aside className="inspector" aria-label="Detalles">
      {!selected || !exists ? <ProjectPanel p={project} />
        : selected.kind === 'quotation' ? <QuotationPanel id={selected.id} />
          : selected.kind === 'code' ? <CodePanel id={selected.id} />
            : selected.kind === 'memo' ? <MemoPanel id={selected.id} />
              : <DocPanel id={selected.id} />}
    </aside>
  );
}

function Head({ kind, title, actions }: { kind: EntityRef['kind']; title: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="insp-head">
      <div className="insp-kind"><KindIcon kind={kind} size={12} />{KIND_LABEL[kind]}<span className="spacer" />{actions}</div>
      <div className="insp-title">{title}</div>
    </div>
  );
}

/** Memos y vínculos asociados a una entidad, comunes a todos los paneles. */
function Connections({ refx }: { refx: EntityRef }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const memos = project.memos.filter((m) => m.links.some((l) => sameRef(l, refx)));
  const links = project.links.filter((l) => sameRef(l.source, refx) || sameRef(l.target, refx));
  const rel = new Map(project.relations.map((r) => [r.id, r]));
  const open = (r: EntityRef) => (r.kind === 'quotation' ? st().revealQuotation(r.id) : r.kind === 'memo' ? st().openTab('memo', r.id) : r.kind === 'document' ? st().openTab('document', r.id) : st().select(r));
  return (
    <>
      <div className="insp-sec">
        <h4><StickyNote size={13} />Memos <span className="badge">{memos.length}</span><span className="spacer" />
          <button className="btn ghost sm" onClick={() => { const id = st().createMemo('Memo: ' + entityName(project, refx).slice(0, 50), [refx]); st().openTab('memo', id); }}><Plus size={13} />Nuevo</button>
        </h4>
        <div className="mini-list">
          {memos.map((m) => (
            <div key={m.id} className="mini-item" onClick={() => st().openTab('memo', m.id)}>
              <StickyNote size={13} style={{ color: '#d9a91a', marginTop: 2, flexShrink: 0 }} />
              <div className="grow"><div style={{ fontWeight: 600 }}>{m.title}</div><div className="muted ellipsis">{m.content.slice(0, 90) || 'Sin contenido'}</div></div>
            </div>
          ))}
          {!memos.length && <div className="small muted">Sin memos vinculados.</div>}
        </div>
      </div>
      <div className="insp-sec">
        <h4><Link2 size={13} />Vínculos <span className="badge">{links.length}</span><span className="spacer" />
          <button className="btn ghost sm" onClick={() => st().setDialog({ type: 'link', source: refx })}><Plus size={13} />Vincular</button>
        </h4>
        <div className="mini-list">
          {links.map((l) => {
            const out = sameRef(l.source, refx);
            const other = out ? l.target : l.source;
            const r = rel.get(l.relationId);
            return (
              <div key={l.id} className="mini-item" onClick={() => open(other)}>
                <span className="small" style={{ color: r?.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{out ? r?.name : `← ${r?.name}`}</span>
                <span className="grow ellipsis">{entityName(project, other)}</span>
                <span className="x" role="button" title="Quitar vínculo" onClick={(e) => { e.stopPropagation(); st().deleteLinks([l.id]); }}><X size={13} /></span>
              </div>
            );
          })}
          {!links.length && <div className="small muted">Relaciona esta entidad con otras para construir tu modelo.</div>}
        </div>
      </div>
    </>
  );
}

function QuotationPanel({ id }: { id: ID }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const q = project.quotations.find((x) => x.id === id)!;
  const doc = project.documents.find((d) => d.id === q.docId)!;
  const codes = q.codeIds.map((c) => project.codes.find((x) => x.id === c)!).filter(Boolean);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const page = pageOf(doc, q.start);
  const text = doc.text.slice(q.start, q.end);
  return (
    <>
      <Head kind="quotation" title={<span>{quotationNumber(project, q)} <span className="muted" style={{ fontWeight: 500 }}>en {doc.name}</span></span>}
        actions={<button className="btn ghost icon sm" title="Eliminar cita" onClick={() => { st().deleteQuotations([id]); st().toast('Cita eliminada', 'info', { label: 'Deshacer', run: () => st().undo() }); }}><Trash2 size={14} /></button>} />
      <div className="insp-body">
        <div className="insp-sec">
          <div className="quote-text" style={{ ['--c' as any]: codes[0]?.color }}>{text}</div>
          <div className="row small muted" style={{ marginTop: 8 }}>
            <span>{wordCount(text)} palabras{page ? ` · página ${page}` : ''}</span>
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => st().revealQuotation(id)}><ExternalLink size={13} />Ir al texto</button>
          </div>
        </div>
        <div className="insp-sec">
          <h4><Tag size={13} />Códigos <span className="badge">{codes.length}</span></h4>
          <div className="chips">
            {codes.map((c) => <CodeChip key={c.id} name={c.name} color={c.color} onClick={() => st().select({ kind: 'code', id: c.id })} onRemove={() => st().toggleCodeOnQuotation(id, c.id, false)} />)}
            <button className="btn sm" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPicker({ x: r.left - 160, y: r.bottom + 4 }); }}><Plus size={13} />Código</button>
          </div>
        </div>
        <div className="insp-sec">
          <h4>Comentario</h4>
          <InlineEdit multiline value={q.comment} placeholder="Escribe una nota breve sobre esta cita…" onSave={(v) => st().updateQuotation(id, { comment: v })} />
        </div>
        <div className="insp-sec">
          <h4><Crop size={13} />Límites de la cita</h4>
          <p className="small muted" style={{ margin: '0 0 8px' }}>Para cambiar el fragmento, selecciona el nuevo texto en el documento y pulsa el botón.</p>
          <AdjustBounds qid={id} />
        </div>
        <Connections refx={{ kind: 'quotation', id }} />
        <div className="insp-sec small muted">Creada {fmtDate(q.createdAt)}</div>
      </div>
      {picker && <CodePicker x={picker.x} y={picker.y} exclude={q.codeIds} title="Agregar código a la cita" onClose={() => setPicker(null)} onPick={(ids) => ids.forEach((c) => st().toggleCodeOnQuotation(id, c, true))} />}
    </>
  );
}

function AdjustBounds({ qid }: { qid: ID }) {
  const st = useStore.getState;
  const sel = useStore((s) => s.docSelection);
  const q = useStore((s) => s.project!.quotations.find((x) => x.id === qid));
  const usable = !!sel && !!q && sel.docId === q.docId;
  return (
    <button className="btn sm" disabled={!usable} onMouseDown={(e) => e.preventDefault()} onClick={() => {
      if (!usable) return;
      st().updateQuotation(qid, { start: sel!.start, end: sel!.end });
      useStore.setState({ docSelection: null });
      st().toast('Límites de la cita actualizados', 'success');
    }}>Ajustar a la selección actual</button>
  );
}

function CodePanel({ id }: { id: ID }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const c = project.codes.find((x) => x.id === id)!;
  const [withChildren, setWithChildren] = useState(true);
  const freq = useMemo(() => codeFrequency(project), [project]);
  const dens = useMemo(() => codeDensity(project), [project]);
  const set = withChildren ? descendants(project, id) : new Set([id]);
  const quotes = project.quotations.filter((q) => q.codeIds.some((x) => set.has(x)));
  const docsWith = new Set(quotes.map((q) => q.docId)).size;
  const subs = project.codes.filter((x) => x.parentId === id);
  const parentOptions = project.codes.filter((x) => !descendants(project, id).has(x.id));
  return (
    <>
      <Head kind="code" title={
        <InlineEdit value={c.name} className="input" onSave={(v) => v.trim() && st().updateCode(id, { name: v.trim() })} />
      } actions={<button className="btn ghost icon sm" title="Eliminar código" onClick={() => st().confirm('Eliminar código', `Se eliminará «${c.name}» y se quitará de ${freq.get(id) ?? 0} citas.`, () => st().deleteCodes([id]), { danger: true, confirmLabel: 'Eliminar' })}><Trash2 size={14} /></button>} />
      <div className="insp-body">
        <div className="insp-sec">
          <div className="row" style={{ gap: 18 }}>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{freq.get(id) ?? 0}</div><div className="small muted">citas</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{docsWith}</div><div className="small muted">documentos</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{dens.get(id) ?? 0}</div><div className="small muted">vínculos</div></div>
          </div>
        </div>
        <div className="insp-sec">
          <h4>Color</h4>
          <ColorPicker value={c.color} onChange={(v) => st().updateCode(id, { color: v })} />
        </div>
        <div className="insp-sec">
          <h4>Definición</h4>
          <InlineEdit multiline rows={4} value={c.description} placeholder="¿Qué significa este código? ¿Cuándo se aplica y cuándo no? Una buena definición ayuda a codificar con consistencia." onSave={(v) => st().updateCode(id, { description: v })} />
        </div>
        <div className="insp-sec">
          <h4><Folder size={13} />Organización</h4>
          <label className="field">Código padre
            <select className="select" value={c.parentId ?? ''} onChange={(e) => st().updateCode(id, { parentId: e.target.value || undefined })}>
              <option value="">(ninguno: código principal)</option>
              {parentOptions.sort((a, b) => a.name.localeCompare(b.name, 'es')).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <div style={{ marginTop: 10 }}>
            <div className="small muted" style={{ marginBottom: 5 }}>Grupos</div>
            <GroupToggles kind="code" id={id} />
          </div>
          {subs.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>Subcódigos: {subs.map((s) => s.name).join(', ')}</div>}
        </div>
        <div className="insp-sec">
          <h4><Quote size={13} />Citas <span className="badge">{quotes.length}</span><span className="spacer" />
            {subs.length > 0 && <label className="check small"><input type="checkbox" checked={withChildren} onChange={(e) => setWithChildren(e.target.checked)} />incluir subcódigos</label>}
          </h4>
          <div className="mini-list">
            {quotes.slice(0, 50).map((q) => (
              <div key={q.id} className="mini-item" onClick={() => st().revealQuotation(q.id)}>
                <span className="ref">{quotationNumber(project, q)}</span>
                <span className="grow" style={{ fontFamily: 'var(--font-read)' }}>{quotationLabel(project, q, 140)}</span>
              </div>
            ))}
            {quotes.length > 50 && <button className="btn ghost sm" onClick={() => st().openTab('quotations')}>Ver las {quotes.length} citas <ArrowRight size={13} /></button>}
            {!quotes.length && <div className="small muted">Aún no hay citas con este código.</div>}
          </div>
        </div>
        <div className="insp-sec row" style={{ flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => st().setDialog({ type: 'merge-codes', codeIds: [id] })}><Merge size={13} />Fusionar…</button>
          <button className="btn sm" onClick={() => { const nid = st().createNetwork('Red: ' + c.name, [{ kind: 'code', id }]); st().openTab('network', nid); }}><Share2 size={13} />Abrir en red</button>
        </div>
        <Connections refx={{ kind: 'code', id }} />
      </div>
    </>
  );
}

function GroupToggles({ kind, id }: { kind: 'code' | 'document'; id: ID }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const groups = kind === 'code' ? project.codeGroups : project.documentGroups;
  const item = kind === 'code' ? project.codes.find((c) => c.id === id)! : project.documents.find((d) => d.id === id)!;
  const toggle = (gid: ID) => {
    const next = item.groupIds.includes(gid) ? item.groupIds.filter((g) => g !== gid) : [...item.groupIds, gid];
    kind === 'code' ? st().updateCode(id, { groupIds: next }) : st().updateDoc(id, { groupIds: next });
  };
  return (
    <div className="chips">
      {groups.map((g) => (
        <button key={g.id} className={'btn sm' + (item.groupIds.includes(g.id) ? ' active' : '')} onClick={() => toggle(g.id)}>
          <Folder size={12} style={{ color: g.color }} />{g.name}
        </button>
      ))}
      <button className="btn ghost sm" onClick={() => st().prompt(kind === 'code' ? 'Nuevo grupo de códigos' : 'Nuevo grupo de documentos', 'Nombre del grupo', '', (v) => {
        if (!v.trim()) return;
        kind === 'code' ? st().createCodeGroup(v.trim(), [id]) : st().createDocGroup(v.trim(), [id]);
      }, 'Crear')}><Plus size={12} />Grupo</button>
    </div>
  );
}

function MemoPanel({ id }: { id: ID }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const m = project.memos.find((x) => x.id === id)!;
  return (
    <>
      <Head kind="memo" title={m.title} />
      <div className="insp-body">
        <div className="insp-sec">
          <div className="small" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-read)', lineHeight: 1.6, maxHeight: 300, overflow: 'auto' }}>{m.content || <span className="muted">Sin contenido</span>}</div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => st().openTab('memo', id)}><ExternalLink size={13} />Abrir memo</button>
        </div>
        <Connections refx={{ kind: 'memo', id }} />
      </div>
    </>
  );
}

function DocPanel({ id }: { id: ID }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const d = project.documents.find((x) => x.id === id)!;
  const quotes = project.quotations.filter((q) => q.docId === id);
  const codeCount = new Map<ID, number>();
  for (const q of quotes) for (const c of q.codeIds) codeCount.set(c, (codeCount.get(c) ?? 0) + 1);
  const top = [...codeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <>
      <Head kind="document" title={d.name} actions={<button className="btn ghost icon sm" title="Eliminar documento" onClick={() => st().confirm('Eliminar documento', `Se eliminará «${d.name}» y sus ${quotes.length} citas.`, () => st().deleteDocs([id]), { danger: true, confirmLabel: 'Eliminar' })}><Trash2 size={14} /></button>} />
      <div className="insp-body">
        <div className="insp-sec">
          <dl className="kv">
            <dt>Tipo</dt><dd>{d.kind.toUpperCase()}</dd>
            <dt>Palabras</dt><dd>{wordCount(d.text).toLocaleString('es-MX')}</dd>
            <dt>Citas</dt><dd>{quotes.length}</dd>
            {d.pageStarts && <><dt>Páginas</dt><dd>{d.pageStarts.length}</dd></>}
            {d.importedFrom && <><dt>Archivo</dt><dd className="ellipsis">{d.importedFrom}</dd></>}
            <dt>Agregado</dt><dd>{fmtDate(d.createdAt)}</dd>
          </dl>
        </div>
        <div className="insp-sec"><h4><Folder size={13} />Grupos</h4><GroupToggles kind="document" id={id} /></div>
        <div className="insp-sec">
          <h4>Comentario</h4>
          <InlineEdit multiline value={d.comment} placeholder="Contexto de la entrevista, fecha, lugar, características de la persona…" onSave={(v) => st().updateDoc(id, { comment: v })} />
        </div>
        {top.length > 0 && (
          <div className="insp-sec">
            <h4><Tag size={13} />Códigos más usados</h4>
            <div className="chips">{top.map(([cid, n]) => { const c = project.codes.find((x) => x.id === cid)!; return <CodeChip key={cid} name={`${c.name} · ${n}`} color={c.color} onClick={() => st().select({ kind: 'code', id: cid })} />; })}</div>
          </div>
        )}
        <Connections refx={{ kind: 'document', id }} />
      </div>
    </>
  );
}

function ProjectPanel({ p }: { p: ProjectData }) {
  const st = useStore.getState;
  const tips = [
    'Selecciona texto en un documento y pulsa «Codificar» para crear tu primera cita.',
    'Arrastra un código desde la barra lateral hasta un texto seleccionado para aplicarlo.',
    'Haz clic en un código de la barra lateral para resaltar sólo sus citas en el documento.',
    'Usa memos para registrar tus decisiones de análisis: te servirán al escribir los resultados.',
    'Arrastra un código sobre otro en la barra lateral para convertirlo en subcódigo.',
    'Con «In vivo» el propio texto seleccionado se convierte en el nombre del código.',
  ];
  const tip = !p.documents.length ? 'Empieza agregando documentos con el botón «Documentos» de la barra superior, o arrastrándolos a la ventana.'
    : !p.quotations.length ? tips[0]
      : tips[1 + ((p.quotations.length + p.codes.length) % (tips.length - 1))];
  return (
    <>
      <div className="insp-head"><div className="insp-kind">Proyecto</div><div className="insp-title">{p.name}</div></div>
      <div className="insp-body">
        <div className="insp-sec">
          <dl className="kv">
            <dt>Documentos</dt><dd>{p.documents.length}</dd>
            <dt>Códigos</dt><dd>{p.codes.length}</dd>
            <dt>Citas</dt><dd>{p.quotations.length}</dd>
            <dt>Memos</dt><dd>{p.memos.length}</dd>
            <dt>Redes</dt><dd>{p.networks.length}</dd>
            <dt>Creado</dt><dd>{fmtDate(p.createdAt)}</dd>
          </dl>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => st().setDialog({ type: 'project-info' })}>Editar datos del proyecto</button>
        </div>
        <div className="insp-sec">
          <h4><Lightbulb size={13} />Consejo</h4>
          <p className="small" style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.55 }}>{tip}</p>
        </div>
        <div className="insp-sec small muted">Selecciona una cita, un código, un memo o un documento para ver aquí sus detalles.</div>
      </div>
    </>
  );
}
