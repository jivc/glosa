import {
  ChartColumn, ChevronDown, ChevronRight, ClipboardPaste, Cloud, FilePlus2, FileText, Files, Folder, Grid3x3, LayoutDashboard, List, Merge, MessageSquareText, Network, Pencil, Plus,
  Quote, Search, Share2, StickyNote, Table2, Tag, Trash2, Waypoints,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { pickAndAddDocuments } from '../actions';
import { codeFrequency } from '../core/analysis';
import type { Code, ID } from '../core/types';
import { useStore, type TabType } from '../store';
import { matches, useContextMenu } from './common';
import { editCodeComment, editDocComment } from './comments';

function Section({ id, title, count, actions, children, defaultOpen = true }: { id: string; title: string; count?: number; actions?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const key = 'glosa:sb:' + id;
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(key); return v == null ? defaultOpen : v === '1'; } catch { return defaultOpen; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem(key, open ? '0' : '1'); } catch { /* */ } };
  return (
    <div className="sb-section">
      <div className={'sb-head' + (open ? '' : ' closed')} onClick={toggle} role="button" aria-expanded={open}>
        <ChevronDown size={13} className="chev" />
        <span>{title}</span>
        {count !== undefined && <span className="badge">{count}</span>}
        <div className="actions" onClick={(e) => e.stopPropagation()}>{actions}</div>
      </div>
      {open && children}
    </div>
  );
}

export function Sidebar() {
  const project = useStore((s) => s.project!);
  const activeTab = useStore((s) => s.activeTab);
  const selected = useStore((s) => s.selected);
  const st = useStore.getState;
  const [codeFilter, setCodeFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<ID>>(new Set());
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [menu, openMenu] = useContextMenu();
  const freq = useMemo(() => codeFrequency(project), [project]);
  const docQuotes = useMemo(() => {
    const m = new Map<ID, number>();
    for (const q of project.quotations) m.set(q.docId, (m.get(q.docId) ?? 0) + 1);
    return m;
  }, [project.quotations]);

  const isOn = (type: TabType, id?: string) => activeTab === (id ? `${type}:${id}` : type);

  const newCode = (parentId?: ID) => st().prompt(parentId ? 'Nuevo subcódigo' : 'Nuevo código', 'Nombre del código', '', (v) => {
    if (!v.trim()) return;
    const id = st().createCode(v.trim(), parentId ? { parentId } : {});
    st().select({ kind: 'code', id });
  }, 'Crear');

  const codeMenu = (e: React.MouseEvent, c: Code) => openMenu(e, [
    { label: 'Ver citas del código', icon: <Quote size={15} />, onClick: () => { st().select({ kind: 'code', id: c.id }); st().openTab('quotations'); } },
    { label: 'Renombrar…', icon: <Pencil size={15} />, onClick: () => st().prompt('Renombrar código', 'Nombre', c.name, (v) => v.trim() && st().updateCode(c.id, { name: v.trim() }), 'Guardar') },
    { label: c.description ? 'Editar definición o comentario…' : 'Agregar definición o comentario…', icon: <MessageSquareText size={15} />, onClick: () => editCodeComment(c) },
    { label: 'Nuevo subcódigo…', icon: <Plus size={15} />, onClick: () => newCode(c.id) },
    { label: 'Escribir memo sobre el código', icon: <StickyNote size={15} />, onClick: () => { const id = st().createMemo('Memo: ' + c.name, [{ kind: 'code', id: c.id }]); st().openTab('memo', id); } },
    { label: 'Fusionar con…', icon: <Merge size={15} />, onClick: () => st().setDialog({ type: 'merge-codes', codeIds: [c.id] }) },
    { label: 'Agregar a una red nueva', icon: <Share2 size={15} />, onClick: () => { const id = st().createNetwork('Red: ' + c.name, [{ kind: 'code', id: c.id }]); st().openTab('network', id); } },
    ...(c.parentId ? [{ label: 'Sacar de la jerarquía', icon: <ChevronRight size={15} />, onClick: () => st().updateCode(c.id, { parentId: undefined }) }] : []),
    { sep: true },
    { label: 'Eliminar código', icon: <Trash2 size={15} />, danger: true, onClick: () => st().confirm('Eliminar código', `Se eliminará «${c.name}» y se quitará de ${freq.get(c.id) ?? 0} citas. Las citas se conservan.`, () => st().deleteCodes([c.id]), { danger: true, confirmLabel: 'Eliminar' }) },
  ]);

  // Árbol de códigos
  const children = useMemo(() => {
    const m = new Map<string, Code[]>();
    for (const c of project.codes) {
      const k = c.parentId ?? '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    for (const l of m.values()) l.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return m;
  }, [project.codes]);

  const renderCode = (c: Code, depth: number): ReactNode => {
    const kids = children.get(c.id) ?? [];
    const open = !collapsed.has(c.id);
    const total = (freq.get(c.id) ?? 0);
    return (
      <div key={c.id}>
        <div
          className={'sb-item' + (selected?.kind === 'code' && selected.id === c.id ? ' on' : '') + (dropOn === c.id ? ' drop' : '')}
          style={{ ['--depth' as any]: depth }}
          draggable
          onDragStart={(e) => { e.dataTransfer.setData('application/x-glosa-code', c.id); e.dataTransfer.setData('text/plain', c.name); e.dataTransfer.effectAllowed = 'copyMove'; }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-glosa-code')) { e.preventDefault(); setDropOn(c.id); } }}
          onDragLeave={() => setDropOn(null)}
          onDrop={(e) => {
            setDropOn(null);
            const src = e.dataTransfer.getData('application/x-glosa-code');
            if (!src || src === c.id) return;
            // Evitar ciclos: no se puede mover un código dentro de su descendiente.
            let p: Code | undefined = c;
            while (p) { if (p.id === src) return; p = project.codes.find((x) => x.id === p!.parentId); }
            st().updateCode(src, { parentId: c.id });
            st().toast(`«${project.codes.find((x) => x.id === src)?.name}» ahora es subcódigo de «${c.name}»`, 'info', { label: 'Deshacer', run: () => st().undo() });
          }}
          onClick={() => st().select({ kind: 'code', id: c.id })}
          onDoubleClick={() => { st().select({ kind: 'code', id: c.id }); st().openTab('quotations'); }}
          onContextMenu={(e) => { st().select({ kind: 'code', id: c.id }); codeMenu(e, c); }}
          title={c.description || c.name}
        >
          {kids.length > 0 ? (
            <span className="twisty" onClick={(e) => { e.stopPropagation(); const n = new Set(collapsed); open ? n.add(c.id) : n.delete(c.id); setCollapsed(n); }}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
          ) : null}
          <span className="code-swatch" style={{ background: c.color }} />
          <span className="ellipsis">{c.name}</span>
          <span className="count">{total}</span>
        </div>
        {open && kids.map((k) => renderCode(k, depth + 1))}
      </div>
    );
  };

  const filteredCodes = codeFilter ? project.codes.filter((c) => matches(c.name, codeFilter)).sort((a, b) => a.name.localeCompare(b.name, 'es')) : null;

  const Item = ({ icon, label, type, id, count, onClick, onContext }: { icon: ReactNode; label: string; type: TabType; id?: string; count?: number; onClick?: () => void; onContext?: (e: React.MouseEvent) => void }) => (
    <div className={'sb-item' + (isOn(type, id) ? ' on' : '')} onClick={onClick ?? (() => st().openTab(type, id))} onContextMenu={onContext}>
      {icon}<span className="ellipsis">{label}</span>{count !== undefined && <span className="count">{count}</span>}
    </div>
  );

  return (
    <aside className="sidebar" aria-label="Explorador del proyecto">
      <div className="sb-scroll">
        <div style={{ padding: '4px 0 6px' }}>
          <Item icon={<LayoutDashboard size={15} />} label="Inicio del proyecto" type="overview" />
        </div>

        <Section id="docs" title="Documentos" count={project.documents.length} actions={<>
          <button className="btn ghost icon sm" title="Gestor de documentos" onClick={() => st().openTab('documents')}><Files size={14} /></button>
          <button className="btn ghost icon sm" title="Pegar texto como documento" onClick={() => st().setDialog({ type: 'paste' })}><ClipboardPaste size={14} /></button>
          <button className="btn ghost icon sm" title="Agregar documentos" onClick={pickAndAddDocuments}><Plus size={15} /></button>
        </>}>
          {project.documents.length === 0 && (
            <div className="sb-empty">Agrega entrevistas, notas de campo o artículos.<br />
              <button className="btn sm primary" onClick={pickAndAddDocuments}><FilePlus2 size={14} />Agregar documentos</button>
            </div>
          )}
          {project.documents.map((d, i) => (
            <div key={d.id} className={'sb-item' + (isOn('document', d.id) ? ' on' : '')}
              draggable onDragStart={(e) => e.dataTransfer.setData('application/x-glosa-doc', d.id)}
              onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-glosa-doc')) e.preventDefault(); }}
              onDrop={(e) => { const id = e.dataTransfer.getData('application/x-glosa-doc'); if (id && id !== d.id) st().moveDoc(id, i); }}
              onClick={() => { st().openTab('document', d.id); st().select({ kind: 'document', id: d.id }); }}
              onContextMenu={(e) => openMenu(e, [
                { label: 'Abrir', icon: <FileText size={15} />, onClick: () => st().openTab('document', d.id) },
                { label: 'Renombrar…', icon: <Pencil size={15} />, onClick: () => st().prompt('Renombrar documento', 'Nombre', d.name, (v) => v.trim() && st().updateDoc(d.id, { name: v.trim() }), 'Guardar') },
                { label: d.comment ? 'Editar comentario…' : 'Agregar comentario…', icon: <MessageSquareText size={15} />, onClick: () => editDocComment(d.id) },
                { label: 'Escribir memo sobre el documento', icon: <StickyNote size={15} />, onClick: () => { const id = st().createMemo('Memo: ' + d.name, [{ kind: 'document', id: d.id }]); st().openTab('memo', id); } },
                { sep: true },
                { label: 'Eliminar documento', icon: <Trash2 size={15} />, danger: true, onClick: () => st().confirm('Eliminar documento', `Se eliminará «${d.name}» junto con sus ${docQuotes.get(d.id) ?? 0} citas.`, () => st().deleteDocs([d.id]), { danger: true, confirmLabel: 'Eliminar' }) },
              ])}
              title={d.name}>
              <span className="badge" style={{ minWidth: 26 }}>D{i + 1}</span>
              <span className="ellipsis">{d.name}</span>
              <span className="count">{docQuotes.get(d.id) ?? 0}</span>
            </div>
          ))}
          {project.documentGroups.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {project.documentGroups.map((g) => (
                <div key={g.id} className="sb-item" onClick={() => { st().openTab('documents'); }} title="Grupo de documentos">
                  <Folder size={14} style={{ color: g.color }} /><span className="ellipsis">{g.name}</span>
                  <span className="count">{project.documents.filter((d) => d.groupIds.includes(g.id)).length}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section id="codes" title="Códigos" count={project.codes.length} actions={<>
          <button className="btn ghost icon sm" title="Gestor de códigos" onClick={() => st().openTab('codes')}><Table2 size={14} /></button>
          <button className="btn ghost icon sm" title="Nuevo código" onClick={() => newCode()}><Plus size={15} /></button>
        </>}>
          {project.codes.length > 6 && (
            <div className="sb-filter">
              <div className="input-wrap"><Search size={13} /><input className="input sm" placeholder="Filtrar códigos…" value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} /></div>
            </div>
          )}
          {project.codes.length === 0 && (
            <div className="sb-empty">Selecciona texto en un documento y elige <b>Codificar</b>, o crea tus códigos aquí.<br />
              <button className="btn sm" onClick={() => newCode()}><Tag size={14} />Nuevo código</button>
            </div>
          )}
          <div
            onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-glosa-code') && e.target === e.currentTarget) e.preventDefault(); }}
            onDrop={(e) => { if (e.target !== e.currentTarget) return; const src = e.dataTransfer.getData('application/x-glosa-code'); if (src) st().updateCode(src, { parentId: undefined }); }}
            style={{ paddingBottom: 6 }}
          >
            {filteredCodes ? filteredCodes.map((c) => renderCode(c, 0)) : (children.get('') ?? []).map((c) => renderCode(c, 0))}
          </div>
          {project.codeGroups.length > 0 && project.codeGroups.map((g) => (
            <div key={g.id} className="sb-item" onClick={() => st().openTab('codes')} title="Grupo de códigos">
              <Folder size={14} style={{ color: g.color }} /><span className="ellipsis">{g.name}</span>
              <span className="count">{project.codes.filter((c) => c.groupIds.includes(g.id)).length}</span>
            </div>
          ))}
        </Section>

        <Section id="memos" title="Memos" count={project.memos.length} actions={<>
          <button className="btn ghost icon sm" title="Gestor de memos" onClick={() => st().openTab('memos')}><List size={14} /></button>
          <button className="btn ghost icon sm" title="Nuevo memo" onClick={() => { const id = st().createMemo('Memo sin título'); st().openTab('memo', id); }}><Plus size={15} /></button>
        </>}>
          {project.memos.length === 0 && <div className="sb-empty">Los memos guardan tus ideas, decisiones y reflexiones durante el análisis.</div>}
          {[...project.memos].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).map((m) => (
            <Item key={m.id} icon={<StickyNote size={14} />} label={m.title || 'Memo sin título'} type="memo" id={m.id}
              onContext={(e) => openMenu(e, [{ label: 'Eliminar memo', icon: <Trash2 size={15} />, danger: true, onClick: () => st().confirm('Eliminar memo', `¿Eliminar «${m.title}»?`, () => st().deleteMemos([m.id]), { danger: true, confirmLabel: 'Eliminar' }) }])} />
          ))}
        </Section>

        <Section id="nets" title="Redes" count={project.networks.length} actions={
          <button className="btn ghost icon sm" title="Nueva red" onClick={() => st().prompt('Nueva red', 'Nombre de la red', 'Red ' + (project.networks.length + 1), (v) => { const id = st().createNetwork(v.trim() || 'Red'); st().openTab('network', id); }, 'Crear')}><Plus size={15} /></button>
        }>
          {project.networks.length === 0 && <div className="sb-empty">Las redes muestran visualmente cómo se relacionan tus códigos, citas y memos.</div>}
          {project.networks.map((n) => (
            <Item key={n.id} icon={<Share2 size={14} />} label={n.name} type="network" id={n.id} count={n.nodes.length}
              onContext={(e) => openMenu(e, [
                { label: 'Renombrar…', icon: <Pencil size={15} />, onClick: () => st().prompt('Renombrar red', 'Nombre', n.name, (v) => v.trim() && st().updateNetwork(n.id, { name: v.trim() }), 'Guardar') },
                { label: 'Eliminar red', icon: <Trash2 size={15} />, danger: true, onClick: () => st().confirm('Eliminar red', `¿Eliminar la red «${n.name}»? Los códigos y vínculos se conservan.`, () => st().deleteNetworks([n.id]), { danger: true, confirmLabel: 'Eliminar' }) },
              ])} />
          ))}
        </Section>

        <Section id="analysis" title="Análisis">
          <Item icon={<Quote size={15} />} label="Gestor de citas" type="quotations" count={project.quotations.length} />
          <Item icon={<Grid3x3 size={15} />} label="Tabla código–documento" type="codeDoc" />
          <Item icon={<Network size={15} />} label="Co-ocurrencia de códigos" type="cooc" />
          <Item icon={<Waypoints size={15} />} label="Consulta de citas" type="query" />
          <Item icon={<Cloud size={15} />} label="Nube de palabras" type="words" />
          <Item icon={<Search size={15} />} label="Búsqueda y autocodificación" type="search" />
          <Item icon={<ChartColumn size={15} />} label="Relaciones" type="relations" count={project.links.length} />
        </Section>
      </div>
      {menu}
    </aside>
  );
}
