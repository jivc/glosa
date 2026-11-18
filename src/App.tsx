import {
  CircleCheck, Cloud, FileDown, FileText, Grid3x3, Info, LayoutDashboard, Network, PanelLeft, PanelRight, Quote, Redo2, Save, Search, Settings, Share2,
  StickyNote, Table2, Tag, Undo2, Upload, Waypoints, X, Link2, TriangleAlert, Files, ChevronLeft, ChevronRight, ChevronDown,
} from 'lucide-react';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { addDocumentsFromFiles, closeProject, importRefiFile, newProject, openProjectFile, openSample, pickAndAddDocuments, saveProject, startAutosave } from './actions';
import { isMac, modKey, platform } from './platform';
import { defaultPrefs, useStore, type Tab } from './store';
import { CodeDocView, CooccurrenceView, QueryView, RelationsView, SearchView, WordsView } from './ui/Analysis';
import { Resizer, useContextMenu } from './ui/common';
import { Dialogs } from './ui/Dialogs';
import { DocumentView } from './ui/DocumentView';
import { Overview, Welcome } from './ui/Home';
import { Inspector } from './ui/Inspector';
import { CodeManager, DocumentManager, MemoManager, QuotationManager } from './ui/Managers';
import { MemoView } from './ui/MemoView';
import { NetworkView } from './ui/NetworkView';
import { Sidebar } from './ui/Sidebar';

const TAB_META: Record<string, { icon: ReactNode; label: string }> = {
  overview: { icon: <LayoutDashboard size={14} />, label: 'Inicio' },
  codes: { icon: <Table2 size={14} />, label: 'Códigos' },
  quotations: { icon: <Quote size={14} />, label: 'Citas' },
  memos: { icon: <StickyNote size={14} />, label: 'Memos' },
  documents: { icon: <Files size={14} />, label: 'Documentos' },
  codeDoc: { icon: <Grid3x3 size={14} />, label: 'Código–documento' },
  cooc: { icon: <Network size={14} />, label: 'Co-ocurrencias' },
  query: { icon: <Waypoints size={14} />, label: 'Consulta' },
  words: { icon: <Cloud size={14} />, label: 'Palabras' },
  search: { icon: <Search size={14} />, label: 'Búsqueda' },
  relations: { icon: <Link2 size={14} />, label: 'Relaciones' },
  networks: { icon: <Share2 size={14} />, label: 'Redes' },
};

function tabLabel(t: Tab) {
  const p = useStore.getState().project!;
  if (t.type === 'document') return { icon: <FileText size={14} />, label: p.documents.find((d) => d.id === t.refId)?.name ?? 'Documento' };
  if (t.type === 'memo') return { icon: <StickyNote size={14} />, label: p.memos.find((m) => m.id === t.refId)?.title || 'Memo' };
  if (t.type === 'network') return { icon: <Share2 size={14} />, label: p.networks.find((n) => n.id === t.refId)?.name ?? 'Red' };
  return TAB_META[t.type] ?? { icon: <Tag size={14} />, label: t.type };
}

function TabContent({ tab }: { tab: Tab }) {
  switch (tab.type) {
    case 'document': return <DocumentView docId={tab.refId!} />;
    case 'memo': return <MemoView id={tab.refId!} />;
    case 'network': return <NetworkView id={tab.refId!} />;
    case 'codes': return <CodeManager />;
    case 'quotations': return <QuotationManager />;
    case 'memos': return <MemoManager />;
    case 'documents': return <DocumentManager />;
    case 'codeDoc': return <CodeDocView />;
    case 'cooc': return <CooccurrenceView />;
    case 'query': return <QueryView />;
    case 'words': return <WordsView />;
    case 'search': return <SearchView />;
    case 'relations': return <RelationsView />;
    default: return <Overview />;
  }
}

class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  componentDidCatch(e: Error) { console.error(e); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty">
        <div className="ico" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><TriangleAlert size={26} /></div>
        <h3>Esta vista tuvo un problema</h3>
        <p>Tu proyecto está a salvo. Puedes cerrar esta pestaña o intentarlo de nuevo.</p>
        <code className="small muted selectable" style={{ maxWidth: 420 }}>{this.state.error.message}</code>
        <button className="btn" onClick={() => this.setState({ error: null })}>Reintentar</button>
      </div>
    );
  }
}

function TopBar() {
  const project = useStore((s) => s.project);
  const dirty = useStore((s) => s.dirty);
  const saving = useStore((s) => s.saving);
  const filePath = useStore((s) => s.filePath);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const prefs = useStore((s) => s.prefs);
  const st = useStore.getState;
  return (
    <header className={'topbar' + (isMac && window.glosaNative ? ' mac' : '')}>
      <div className="brand"><div className="brand-logo">G</div>{!project && 'Glosa'}</div>
      {project && (
        <>
          <button className="btn ghost icon sm" title={`Explorador (${modKey}B)`} onClick={() => st().setPrefs({ showSidebar: !prefs.showSidebar })}><PanelLeft size={16} /></button>
          <div className="project-name ellipsis no-drag" onClick={() => st().setDialog({ type: 'project-info' })} title="Datos del proyecto">{project.name}</div>
          <div className={'save-state' + (dirty ? ' dirty' : '')} title={filePath ?? 'Aún no se ha guardado en un archivo'}>
            {saving ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />Guardando…</>
              : dirty ? (filePath && prefs.autosave ? 'Guardando cambios…' : <button className="btn ghost sm" onClick={() => saveProject()}><Save size={13} />{filePath ? 'Sin guardar' : 'Guardar proyecto'}</button>)
                : <><CircleCheck size={13} />Guardado</>}
          </div>
          <span className="spacer" />
          <div className="searchbox no-drag" onClick={() => st().setDialog({ type: 'palette' })} role="button">
            <Search size={14} /><span className="grow">Buscar o ejecutar un comando…</span><kbd>{modKey} K</kbd>
          </div>
          <span className="spacer" />
          <button className="btn ghost icon sm" disabled={!canUndo} title={`Deshacer (${modKey}Z)`} onClick={() => st().undo()}><Undo2 size={16} /></button>
          <button className="btn ghost icon sm" disabled={!canRedo} title="Rehacer" onClick={() => st().redo()}><Redo2 size={16} /></button>
          <button className="btn sm" onClick={pickAndAddDocuments}><Upload size={14} />Documentos</button>
          <button className="btn sm" onClick={() => st().setDialog({ type: 'export' })}><FileDown size={14} />Exportar</button>
          <button className="btn ghost icon sm" title="Preferencias" onClick={() => st().setDialog({ type: 'preferences' })}><Settings size={16} /></button>
          <button className="btn ghost icon sm" title={`Panel de detalles`} onClick={() => st().setPrefs({ showInspector: !prefs.showInspector })}><PanelRight size={16} /></button>
        </>
      )}
      {!project && (<><span className="spacer" /><button className="btn ghost icon sm" title="Preferencias" onClick={() => st().setDialog({ type: 'preferences' })}><Settings size={16} /></button></>)}
    </header>
  );
}

function Tabs() {
  const tabs = useStore((s) => s.tabs);
  const active = useStore((s) => s.activeTab);
  useStore((s) => s.project); // re-render nombres
  const st = useStore.getState;
  const [drag, setDrag] = useState<number | null>(null);
  const [menu, openMenu] = useContextMenu();
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Flechas visibles sólo cuando hay pestañas ocultas a ese lado.
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 2, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // La rueda vertical del ratón desplaza las pestañas en horizontal.
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollLeft += e.deltaY; }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [measure]);
  // Mantener a la vista la pestaña activa.
  useEffect(() => {
    const el = scroller.current, tab = el?.querySelector<HTMLElement>('.tab.on');
    if (el && tab) {
      const s = el.getBoundingClientRect(), r = tab.getBoundingClientRect();
      const fade = 30; // espacio del desvanecido en los bordes
      if (r.left < s.left + fade) el.scrollLeft -= s.left + fade - r.left;
      else if (r.right > s.right - fade) el.scrollLeft += r.right - (s.right - fade);
    }
    measure();
  }, [active, tabs.length, measure]);

  const scrollBy = (dir: number) => { const el = scroller.current; el?.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.7), behavior: 'smooth' }); };
  const closeMany = (keys: string[]) => keys.forEach((k) => st().closeTab(k));
  const tabMenu = (e: React.MouseEvent, key: string) => openMenu(e, [
    { label: 'Cerrar', icon: <X size={15} />, onClick: () => st().closeTab(key) },
    { label: 'Cerrar las demás', onClick: () => closeMany(st().tabs.filter((t) => t.key !== key).map((t) => t.key)) },
    { label: 'Cerrar las de la derecha', onClick: () => { const all = st().tabs; const i = all.findIndex((t) => t.key === key); closeMany(all.slice(i + 1).map((t) => t.key)); } },
    { sep: true },
    { label: 'Cerrar todas', onClick: () => closeMany(st().tabs.map((t) => t.key)) },
  ]);
  const listMenu = (e: React.MouseEvent) => {
    e.stopPropagation(); // que el mismo clic no cierre el menú recién abierto
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu({ clientX: r.right - 250, clientY: r.bottom + 2 }, [
      ...st().tabs.map((t) => { const { icon, label } = tabLabel(t); return { label: (t.key === st().activeTab ? '● ' : '') + label, icon, onClick: () => st().setActiveTab(t.key) }; }),
      { sep: true },
      { label: 'Cerrar todas las pestañas', icon: <X size={15} />, onClick: () => closeMany(st().tabs.map((t) => t.key)) },
    ]);
  };
  const overflow = edges.left || edges.right;

  return (
    <div className="tabs-bar">
      {overflow && <button className="tabs-arrow" disabled={!edges.left} title="Pestañas anteriores" onClick={() => scrollBy(-1)}><ChevronLeft size={15} /></button>}
      <div className={'tabs' + (edges.left ? ' fade-l' : '') + (edges.right ? ' fade-r' : '')} role="tablist" ref={scroller} onScroll={measure}>
        {tabs.map((t, i) => {
          const { icon, label } = tabLabel(t);
          return (
            <div key={t.key} role="tab" aria-selected={active === t.key} className={'tab' + (active === t.key ? ' on' : '')} title={label}
              onClick={() => st().setActiveTab(t.key)} onAuxClick={(e) => e.button === 1 && st().closeTab(t.key)}
              onContextMenu={(e) => tabMenu(e, t.key)}
              draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { if (drag !== null) e.preventDefault(); }} onDrop={() => { if (drag !== null && drag !== i) st().moveTab(drag, i); setDrag(null); }}>
              {icon}<span className="ellipsis">{label}</span>
              <span className="close" role="button" aria-label="Cerrar pestaña" onClick={(e) => { e.stopPropagation(); st().closeTab(t.key); }}><X size={13} /></span>
            </div>
          );
        })}
      </div>
      {overflow && <button className="tabs-arrow" disabled={!edges.right} title="Pestañas siguientes" onClick={() => scrollBy(1)}><ChevronRight size={15} /></button>}
      {tabs.length > 1 && <button className="tabs-arrow list" title={`Todas las pestañas (${tabs.length})`} onClick={listMenu}>{overflow && <span className="tabs-count">{tabs.length}</span>}<ChevronDown size={15} /></button>}
      {menu}
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const st = useStore.getState;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.kind === 'success' ? <CircleCheck size={16} className="lead" /> : t.kind === 'error' ? <TriangleAlert size={16} /> : <Info size={16} />}
          <span>{t.text}</span>
          {t.action && <button className="btn sm" onClick={() => { t.action!.run(); st().dismissToast(t.id); }}>{t.action.label}</button>}
          <button className="btn ghost icon sm" style={{ background: 'transparent', color: '#fff' }} onClick={() => st().dismissToast(t.id)}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function Workspace() {
  const tabs = useStore((s) => s.tabs);
  const active = useStore((s) => s.activeTab);
  const prefs = useStore((s) => s.prefs);
  const [sbw, setSbw] = useState(() => Number(localStorage.getItem('glosa:sbw')) || 280);
  const [inw, setInw] = useState(() => Number(localStorage.getItem('glosa:inw')) || 340);
  useEffect(() => { try { localStorage.setItem('glosa:sbw', String(sbw)); localStorage.setItem('glosa:inw', String(inw)); } catch { /* */ } }, [sbw, inw]);
  const tab = tabs.find((t) => t.key === active);
  return (
    <div className="workspace">
      {prefs.showSidebar && <div style={{ width: sbw, flexShrink: 0, display: 'flex' }}><Sidebar /></div>}
      {prefs.showSidebar && <Resizer side="left" onResize={(d) => setSbw((w) => Math.max(200, Math.min(480, w + d)))} />}
      <main className="main">
        <Tabs />
        <div className="tab-body">
          {tab ? <ErrorBoundary resetKey={tab.key}><TabContent key={tab.key} tab={tab} /></ErrorBoundary> : <Overview />}
        </div>
      </main>
      {prefs.showInspector && <Resizer side="right" onResize={(d) => setInw((w) => Math.max(260, Math.min(560, w + d)))} />}
      {prefs.showInspector && <div style={{ width: inw, flexShrink: 0, display: 'flex' }}><Inspector /></div>}
    </div>
  );
}

export function App() {
  const project = useStore((s) => s.project);
  const prefs = useStore((s) => s.prefs);
  const busy = useStore((s) => s.busy);
  const [dropping, setDropping] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Preferencias persistentes
  useEffect(() => {
    platform.prefsGet().then((p) => { useStore.getState().setPrefs({ ...defaultPrefs, ...p }); setPrefsLoaded(true); }).catch(() => setPrefsLoaded(true));
  }, []);
  useEffect(() => { if (prefsLoaded) platform.prefsSet(prefs as unknown as Record<string, unknown>); }, [prefs, prefsLoaded]);
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);

  useEffect(() => startAutosave(), []);

  // Menú nativo y archivos abiertos desde el sistema
  useEffect(() => {
    const offMenu = platform.onMenu(async (a) => {
      const st = useStore.getState();
      if (a === 'new-project') newProject();
      else if (a === 'open-project') openProjectFile();
      else if (a === 'save') saveProject();
      else if (a === 'save-as') saveProject(true);
      else if (a === 'save-and-close') { if (await saveProject()) platform.allowClose(); }
      else if (a === 'add-documents' && st.project) pickAndAddDocuments();
      else if (a === 'import-qdpx') importRefiFile();
      else if (a === 'export' && st.project) st.setDialog({ type: 'export' });
      else if (a === 'close-project') closeProject();
      else if (a === 'undo') { if (!isEditable()) st.undo(); else document.execCommand('undo'); }
      else if (a === 'redo') { if (!isEditable()) st.redo(); else document.execCommand('redo'); }
      else if (a === 'search' || a === 'palette') st.setDialog({ type: 'palette' });
      else if (a === 'preferences') st.setDialog({ type: 'preferences' });
      else if (a === 'shortcuts') st.setDialog({ type: 'shortcuts' });
      else if (a === 'tour') st.setDialog({ type: 'tour' });
      else if (a === 'guide') st.setDialog({ type: 'guide' });
      else if (a === 'sample') openSample();
      else if (a === 'toggle-sidebar') {
        // En un memo, ⌘B es «negritas» (el menú nativo lo intercepta antes que el área de texto).
        if ((document.activeElement as HTMLElement | null)?.classList.contains('memo-body')) window.dispatchEvent(new CustomEvent('glosa:memo-bold'));
        else st.setPrefs({ showSidebar: !st.prefs.showSidebar });
      }
      else if (a === 'toggle-inspector') st.setPrefs({ showInspector: !st.prefs.showInspector });
      else if (a === 'new-network' && st.project) { const id = st.createNetwork('Red ' + (st.project.networks.length + 1)); st.openTab('network', id); }
      else if (a.startsWith('open:') && st.project) st.openTab(a.slice(5) as Tab['type']);
    });
    const offOpen = platform.onOpenFile((f) => openProjectFile(f));
    return () => { offMenu(); offOpen(); };
  }, []);

  // Atajos globales (en navegador, y los que no están en el menú nativo)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'k') { e.preventDefault(); st.setDialog({ type: 'palette' }); return; }
      if (st.dialog) return;
      if (mod && key === 'w' && st.project && st.activeTab) { e.preventDefault(); st.closeTab(st.activeTab); return; }
      if (e.ctrlKey && key === 'tab' && st.tabs.length > 1) {
        e.preventDefault();
        const i = st.tabs.findIndex((t) => t.key === st.activeTab);
        st.setActiveTab(st.tabs[(i + (e.shiftKey ? -1 : 1) + st.tabs.length) % st.tabs.length].key);
        return;
      }
      if (window.glosaNative) return; // el resto lo gestiona el menú nativo
      if (mod && key === 's') { e.preventDefault(); saveProject(e.shiftKey); }
      else if (mod && key === 'z' && !isEditable()) { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); }
      else if (mod && key === 'y' && !isEditable()) { e.preventDefault(); st.redo(); }
      else if (mod && key === 'e' && st.project) { e.preventDefault(); st.setDialog({ type: 'export' }); }
      else if (mod && key === 'b' && st.project && !(document.activeElement as HTMLElement | null)?.classList.contains('memo-body')) { e.preventDefault(); st.setPrefs({ showSidebar: !st.prefs.showSidebar }); }
      else if (mod && /^[1-4]$/.test(key) && st.project) { e.preventDefault(); st.openTab((['codes', 'quotations', 'memos', 'documents'] as const)[Number(key) - 1]); }
      else if (mod && key === '/') { e.preventDefault(); st.setDialog({ type: 'shortcuts' }); }
    };
    window.addEventListener('keydown', k);
    const before = (e: BeforeUnloadEvent) => { if (!window.glosaNative && useStore.getState().dirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', before);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('beforeunload', before); };
  }, []);

  // Arrastrar y soltar archivos en la ventana
  useEffect(() => {
    let depth = 0;
    const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => { if (isFiles(e)) { depth++; setDropping(true); } };
    const leave = (e: DragEvent) => { if (isFiles(e)) { depth--; if (depth <= 0) { depth = 0; setDropping(false); } } };
    const over = (e: DragEvent) => { if (isFiles(e)) e.preventDefault(); };
    const drop = async (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault(); depth = 0; setDropping(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      const st = useStore.getState();
      const proj = files.find((f) => /\.glosa$/i.test(f.name));
      const refi = files.find((f) => /\.(qdpx|qdc)$/i.test(f.name));
      if (proj) return openProjectFile({ name: proj.name, path: platform.pathForFile(proj) || undefined, data: new Uint8Array(await proj.arrayBuffer()) });
      if (refi) return importRefiFile({ name: refi.name, data: new Uint8Array(await refi.arrayBuffer()) });
      if (!st.project) { newProjectWith(files); return; }
      addDocumentsFromFiles(files);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);

  return (
    <div className="app">
      <TopBar />
      {project ? <Workspace /> : <Welcome />}
      <Dialogs />
      <Toasts />
      {busy && <div className="busy"><div className="busy-card"><div className="spinner" />{busy}</div></div>}
      {dropping && <div className="drop-overlay"><div><Upload size={20} />{project ? 'Suelta para agregar los documentos' : 'Suelta para crear un proyecto con estos documentos'}</div></div>}
    </div>
  );
}

function newProjectWith(files: File[]) {
  const st = useStore.getState();
  st.prompt('Nuevo proyecto', 'Nombre del proyecto', 'Mi proyecto', (v) => {
    newProject(v.trim() || 'Mi proyecto');
    setTimeout(() => addDocumentsFromFiles(files), 0);
  }, 'Crear y agregar');
}

function isEditable() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
