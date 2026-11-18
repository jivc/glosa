import {
  ArrowRight, BookOpen, ClipboardPaste, FileJson, FileSpreadsheet, FileText, FolderOpen, Import, Keyboard, Link2, Merge, MousePointerClick, Package,
  Plus, Quote, Search, Settings, Share2, StickyNote, Tag, TriangleAlert,
} from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { closeProject, importRefiFile, newProject, openProjectFile, openSample, pickAndAddDocuments, runExport, saveProject } from '../actions';
import { docFromPaste } from '../core/importers';
import { entityName } from '../core/model';
import type { EntityRef } from '../core/types';
import { modKey } from '../platform';
import { useStore, type DialogState } from '../store';
import { Dialog, KindIcon, KIND_LABEL, matches } from './common';

export function Dialogs() {
  const d = useStore((s) => s.dialog);
  const close = () => useStore.getState().setDialog(null);
  if (!d) return null;
  switch (d.type) {
    case 'confirm': return <ConfirmDialog d={d} close={close} />;
    case 'prompt': return <PromptDialog d={d} close={close} />;
    case 'info': return (
      <Dialog title={d.title} onClose={close} icon={<TriangleAlert size={20} style={{ color: 'var(--warn)', marginTop: 2 }} />} footer={<button className="btn primary" onClick={close}>Entendido</button>}>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, color: 'var(--text-2)' }} className="selectable">{d.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </Dialog>
    );
    case 'export': return <ExportDialog close={close} />;
    case 'preferences': return <PrefsDialog close={close} />;
    case 'shortcuts': return <ShortcutsDialog close={close} />;
    case 'tour': return <TourDialog close={close} />;
    case 'guide': return <GuideDialog close={close} />;
    case 'palette': return <Palette close={close} />;
    case 'paste': return <PasteDialog close={close} />;
    case 'project-info': return <ProjectInfoDialog close={close} />;
    case 'merge-codes': return <MergeDialog codeIds={d.codeIds} close={close} />;
    case 'link': return <LinkDialog d={d} close={close} />;
  }
}

function ConfirmDialog({ d, close }: { d: Extract<DialogState, { type: 'confirm' }>; close: () => void }) {
  return (
    <Dialog title={d.title} onClose={close} footer={<>
      <button className="btn" onClick={close}>Cancelar</button>
      <button className={'btn ' + (d.danger ? 'danger solid' : 'primary')} autoFocus onClick={() => { close(); d.onConfirm(); }}>{d.confirmLabel ?? 'Aceptar'}</button>
    </>}>
      <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.55 }}>{d.message}</p>
    </Dialog>
  );
}

function PromptDialog({ d, close }: { d: Extract<DialogState, { type: 'prompt' }>; close: () => void }) {
  const [v, setV] = useState(d.value);
  const ok = () => { close(); d.onConfirm(v); };
  return (
    <Dialog title={d.title} onClose={close} footer={<><button className="btn" onClick={close}>Cancelar</button><button className="btn primary" onClick={ok}>{d.confirmLabel ?? 'Aceptar'}</button></>}>
      <label className="field">{d.label}
        {d.multiline
          ? <textarea className="textarea" autoFocus rows={7} value={v} placeholder={d.placeholder} onChange={(e) => setV(e.target.value)}
            onFocus={(e) => { const n = e.target.value.length; e.target.setSelectionRange(n, n); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ok(); } }} />
          : <input className="input" autoFocus value={v} placeholder={d.placeholder} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} />}
      </label>
      {(d.hint || d.multiline) && <div className="small muted" style={{ marginTop: 6 }}>{d.hint ?? `Pulsa ${modKey}+Enter para guardar.`}</div>}
    </Dialog>
  );
}

function ExportDialog({ close }: { close: () => void }) {
  const Card = ({ k, icon, title, ext, desc }: { k: string; icon: ReactNode; title: string; ext: string; desc: string }) => (
    <div className="export-card" onClick={() => { close(); runExport(k); }}>
      <div className="ico">{icon}</div>
      <div><b>{title}<span className="ext">{ext}</span></b><span>{desc}</span></div>
    </div>
  );
  return (
    <Dialog title="Exportar" sub="Todos los formatos son abiertos o de uso común: tu trabajo nunca queda encerrado en Glosa." onClose={close} className="wide">
      <h4 style={{ margin: '4px 0 8px', fontSize: 12.5, color: 'var(--text-2)' }}>Intercambio con otros programas</h4>
      <div className="export-grid">
        <Card k="qdpx" icon={<Package size={18} />} title="Proyecto REFI-QDA" ext=".qdpx" desc="Abre tu proyecto completo en Atlas.ti, MAXQDA, NVivo o QualCoder." />
        <Card k="qdc" icon={<Tag size={18} />} title="Libro de códigos REFI-QDA" ext=".qdc" desc="Comparte sólo tus códigos y definiciones con otro equipo o programa." />
        <Card k="json" icon={<FileJson size={18} />} title="Datos completos" ext=".json" desc="Todo el proyecto en JSON, para análisis con R, Python u otras herramientas." />
      </div>
      <h4 style={{ margin: '18px 0 8px', fontSize: 12.5, color: 'var(--text-2)' }}>Tablas y reportes</h4>
      <div className="export-grid">
        <Card k="xlsx" icon={<FileSpreadsheet size={18} />} title="Libro de Excel" ext=".xlsx" desc="Citas, códigos, memos y documentos, cada uno en su hoja." />
        <Card k="docx" icon={<FileText size={18} />} title="Reporte en Word" ext=".docx" desc="Libro de códigos, citas agrupadas por código y memos, listo para editar." />
        <Card k="quotes-csv" icon={<Quote size={18} />} title="Citas" ext=".csv" desc="Una fila por cita con documento, página, códigos y comentario." />
        <Card k="codes-csv" icon={<Tag size={18} />} title="Libro de códigos" ext=".csv" desc="Códigos con definiciones, grupos y frecuencias." />
        <Card k="codebook-md" icon={<BookOpen size={18} />} title="Libro de códigos" ext=".md" desc="Lista jerárquica en Markdown, ideal para anexos." />
        <Card k="memos-md" icon={<StickyNote size={18} />} title="Memos" ext=".md" desc="Todos tus memos en un solo documento Markdown." />
        <Card k="memos-csv" icon={<StickyNote size={18} />} title="Memos" ext=".csv" desc="Una fila por memo con sus vínculos." />
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>Las redes se exportan como imagen (PNG, SVG) o GraphML desde la propia red. Las tablas de análisis tienen su propio botón de exportar.</p>
    </Dialog>
  );
}

function PrefsDialog({ close }: { close: () => void }) {
  const prefs = useStore((s) => s.prefs);
  const set = (p: Partial<typeof prefs>) => useStore.getState().setPrefs(p);
  return (
    <Dialog title="Preferencias" onClose={close} footer={<button className="btn primary" onClick={close}>Listo</button>}>
      <div className="col" style={{ gap: 16 }}>
        <label className="field">Tu nombre (aparece como autor en exportaciones)
          <input className="input" value={prefs.author} onChange={(e) => set({ author: e.target.value })} placeholder="Nombre y apellido" />
        </label>
        <div className="field">Apariencia
          <div className="seg">
            {(['system', 'light', 'dark'] as const).map((t) => <button key={t} className={prefs.theme === t ? 'on' : ''} onClick={() => set({ theme: t })}>{t === 'system' ? 'Como el sistema' : t === 'light' ? 'Clara' : 'Oscura'}</button>)}
          </div>
        </div>
        <label className="field">Tamaño del texto de los documentos: {prefs.fontSize}px
          <input type="range" min={13} max={24} value={prefs.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
        </label>
        <label className="field">Interlineado: {prefs.lineHeight.toFixed(2)}
          <input type="range" min={1.4} max={2.2} step={0.05} value={prefs.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })} />
        </label>
        <label className="field">Ancho del margen de códigos: {prefs.marginWidth}px
          <input type="range" min={140} max={360} step={10} value={prefs.marginWidth} onChange={(e) => set({ marginWidth: Number(e.target.value) })} />
        </label>
        <label className="field">Ancho de los documentos
          <select className="select" value={prefs.docWidth ?? 'full'} onChange={(e) => set({ docWidth: e.target.value as 'normal' | 'wide' | 'full' })}>
            <option value="full">Ocupar toda la ventana</option>
            <option value="wide">Amplio (hasta 1100 px)</option>
            <option value="normal">Columna de lectura (760 px)</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={prefs.autosave} onChange={(e) => set({ autosave: e.target.checked })} />Guardar automáticamente los proyectos que ya tienen archivo</label>
        <p className="small muted" style={{ margin: 0 }}>Aunque desactives el guardado automático, Glosa guarda copias de recuperación por si el programa se cierra inesperadamente.</p>
      </div>
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Paleta de comandos y búsqueda rápida', `${modKey} K`],
  ['Codificar la selección', `${modKey} J`],
  ['Aplicar el último código usado', `${modKey} L`],
  ['Codificación in vivo', `${modKey} I`],
  ['Crear cita con memo', `${modKey} ⇧ M`],
  ['Eliminar la cita activa', 'Supr'],
  ['Buscar en el documento', `${modKey} F`],
  ['Deshacer / Rehacer', `${modKey} Z  /  ${modKey} ⇧ Z`],
  ['Guardar', `${modKey} S`],
  ['Agregar documentos', `${modKey} ⇧ D`],
  ['Exportar', `${modKey} E`],
  ['Gestor de códigos / citas / memos / documentos', `${modKey} 1 – 4`],
  ['Mostrar/ocultar barra lateral', `${modKey} B`],
  ['Cerrar pestaña', `${modKey} W`],
  ['Pestaña siguiente / anterior', 'Ctrl Tab / Ctrl ⇧ Tab'],
];

function ShortcutsDialog({ close }: { close: () => void }) {
  return (
    <Dialog title="Atajos de teclado" onClose={close} icon={<Keyboard size={20} style={{ marginTop: 2 }} />}>
      <div className="shortcut-grid">{SHORTCUTS.map(([a, k]) => <Fragment key={a}><span>{a}</span><span><kbd>{k}</kbd></span></Fragment>)}</div>
      <p className="small muted" style={{ marginTop: 14 }}>Consejo: también puedes arrastrar un código de la barra lateral hasta el texto seleccionado.</p>
    </Dialog>
  );
}

const TOUR = [
  { icon: <FolderOpen size={44} />, title: 'Bienvenido a Glosa', text: 'Glosa te ayuda a analizar entrevistas, notas de campo y otros textos. Todo se guarda en tu computadora, en un único archivo .glosa que puedes respaldar o compartir.' },
  { icon: <FileText size={44} />, title: '1. Agrega tus documentos', text: 'Usa el botón + junto a «Documentos» o arrastra archivos a la ventana. Acepta Word, PDF con texto, ODT, RTF, Markdown, HTML y texto plano.' },
  { icon: <MousePointerClick size={44} />, title: '2. Selecciona y codifica', text: 'Lee el documento y selecciona un fragmento con el ratón. Aparecerá una barra: pulsa «Codificar», escribe el nombre del código y Enter. Así se crea una cita.' },
  { icon: <Tag size={44} />, title: '3. Organiza tus códigos', text: 'En la barra lateral puedes filtrar, renombrar y arrastrar un código sobre otro para crear jerarquías. Haz clic en un código para resaltar sólo sus citas en el texto.' },
  { icon: <StickyNote size={44} />, title: '4. Escribe memos', text: 'Los memos guardan tus interpretaciones. Vincúlalos a citas, códigos o documentos para no perder el hilo de tus ideas.' },
  { icon: <Share2 size={44} />, title: '5. Construye redes y analiza', text: 'Relaciona códigos en redes visuales y usa las tablas de co-ocurrencias y código–documento. Exporta a Excel, Word o REFI-QDA cuando quieras.' },
];

function TourDialog({ close }: { close: () => void }) {
  const [i, setI] = useState(0);
  const done = () => { useStore.getState().setPrefs({ onboardingDone: true }); close(); };
  const s = TOUR[i];
  return (
    <Dialog title={s.title} onClose={done} footer={<>
      <div className="tour-dots" style={{ marginRight: 'auto', alignSelf: 'center' }}>{TOUR.map((_, j) => <i key={j} className={j === i ? 'on' : ''} />)}</div>
      {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Atrás</button>}
      {i < TOUR.length - 1 ? <button className="btn primary" autoFocus onClick={() => setI(i + 1)}>Siguiente <ArrowRight size={14} /></button> : <button className="btn primary" onClick={done}>Comenzar</button>}
    </>}>
      <div className="tour-art">{s.icon}</div>
      <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text-2)', fontSize: 14 }}>{s.text}</p>
    </Dialog>
  );
}

function GuideDialog({ close }: { close: () => void }) {
  return (
    <Dialog title="Guía rápida de análisis cualitativo" onClose={close} className="wide" icon={<BookOpen size={20} style={{ marginTop: 2 }} />}>
      <div className="guide selectable">
        <h3>Conceptos básicos</h3>
        <ul>
          <li><b>Documento:</b> cada fuente de datos (una entrevista, un diario de campo, un artículo).</li>
          <li><b>Cita:</b> un fragmento de un documento que te parece relevante. Se identifica como D2:5 (documento 2, cita 5).</li>
          <li><b>Código:</b> una etiqueta breve que resume el sentido de una cita. Una cita puede tener varios códigos.</li>
          <li><b>Memo:</b> un texto tuyo donde registras interpretaciones, dudas y decisiones metodológicas.</li>
          <li><b>Red:</b> un diagrama que muestra cómo se relacionan códigos, citas y memos.</li>
          <li><b>Grupos:</b> conjuntos de documentos (p. ej. «mujeres», «zona rural») o de códigos (p. ej. «obstáculos»), útiles para comparar.</li>
        </ul>
        <h3>Un flujo de trabajo recomendado</h3>
        <ol>
          <li><b>Lectura inicial:</b> lee completos dos o tres documentos antes de codificar; escribe un memo con tus primeras impresiones.</li>
          <li><b>Codificación abierta:</b> codifica libremente, usando a veces las palabras de las personas (codificación <i>in vivo</i>).</li>
          <li><b>Depuración:</b> en el gestor de códigos, fusiona sinónimos, escribe definiciones claras y organiza jerarquías o grupos.</li>
          <li><b>Codificación focalizada:</b> aplica el libro de códigos depurado al resto de los documentos.</li>
          <li><b>Relaciones:</b> usa la tabla de co-ocurrencias para descubrir patrones y construye redes que expliquen tu fenómeno.</li>
          <li><b>Comparación:</b> con la tabla código–documento compara grupos (p. ej. ¿qué códigos predominan en cada grupo?).</li>
          <li><b>Escritura:</b> exporta el reporte en Word con citas por código y tus memos como base para redactar resultados.</li>
        </ol>
        <h3>Consejos para la calidad</h3>
        <ul>
          <li>Una buena definición de código dice qué incluye, qué excluye y un ejemplo.</li>
          <li>Registra en un memo metodológico cada decisión importante (fusionar, dividir o renombrar códigos).</li>
          <li>Guarda copias del archivo .glosa en distintos momentos del análisis.</li>
          <li>Si trabajan en equipo, compartan el libro de códigos (.qdc) para codificar con los mismos criterios.</li>
        </ul>
      </div>
    </Dialog>
  );
}

function Palette({ close }: { close: () => void }) {
  const project = useStore((s) => s.project);
  const st = useStore.getState;
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const items = useMemo(() => {
    const cmds: { label: string; hint?: string; icon: ReactNode; run: () => void; group: string }[] = [];
    const C = (label: string, icon: ReactNode, run: () => void, hint?: string) => cmds.push({ label, icon, run, hint, group: 'Comandos' });
    C('Nuevo proyecto', <Plus size={15} />, () => newProject());
    C('Abrir proyecto…', <FolderOpen size={15} />, () => openProjectFile());
    C('Importar REFI-QDA (Atlas.ti, MAXQDA, NVivo)…', <Import size={15} />, () => importRefiFile());
    C('Abrir proyecto de ejemplo', <BookOpen size={15} />, openSample);
    if (project) {
      C('Guardar', <FileText size={15} />, () => saveProject(), `${modKey}S`);
      C('Agregar documentos…', <Plus size={15} />, pickAndAddDocuments);
      C('Pegar texto como documento', <ClipboardPaste size={15} />, () => st().setDialog({ type: 'paste' }));
      C('Exportar…', <Package size={15} />, () => st().setDialog({ type: 'export' }), `${modKey}E`);
      C('Nuevo código', <Tag size={15} />, () => st().prompt('Nuevo código', 'Nombre', '', (v) => v.trim() && st().createCode(v.trim()), 'Crear'));
      C('Nuevo memo', <StickyNote size={15} />, () => { const id = st().createMemo('Memo sin título'); st().openTab('memo', id); });
      C('Nueva red', <Share2 size={15} />, () => { const id = st().createNetwork('Red ' + (project.networks.length + 1)); st().openTab('network', id); });
      ([['Gestor de códigos', 'codes'], ['Gestor de citas', 'quotations'], ['Gestor de memos', 'memos'], ['Gestor de documentos', 'documents'], ['Tabla código–documento', 'codeDoc'], ['Co-ocurrencia de códigos', 'cooc'], ['Consulta de citas', 'query'], ['Nube de palabras', 'words'], ['Búsqueda y autocodificación', 'search'], ['Relaciones', 'relations'], ['Inicio del proyecto', 'overview']] as const)
        .forEach(([l, t]) => C('Abrir: ' + l, <ArrowRight size={15} />, () => st().openTab(t)));
      C('Cerrar proyecto', <FileText size={15} />, closeProject);
    }
    C('Preferencias', <Settings size={15} />, () => st().setDialog({ type: 'preferences' }));
    C('Atajos de teclado', <Keyboard size={15} />, () => st().setDialog({ type: 'shortcuts' }));
    C('Recorrido guiado', <MousePointerClick size={15} />, () => st().setDialog({ type: 'tour' }));
    const filtered = cmds.filter((c) => matches(c.label, q));
    if (project && q.trim()) {
      for (const d of project.documents) if (matches(d.name, q)) filtered.push({ label: d.name, icon: <FileText size={15} />, group: 'Documentos', run: () => st().openTab('document', d.id) });
      for (const c of project.codes) if (matches(c.name, q)) filtered.push({ label: c.name, icon: <span className="code-swatch" style={{ background: c.color }} />, group: 'Códigos', run: () => st().select({ kind: 'code', id: c.id }) });
      for (const m of project.memos) if (matches(m.title + ' ' + m.content, q)) filtered.push({ label: m.title, icon: <StickyNote size={15} />, group: 'Memos', run: () => st().openTab('memo', m.id) });
      if (q.trim().length > 2) filtered.push({ label: `Buscar «${q}» en los documentos`, icon: <Search size={15} />, group: 'Texto', run: () => { st().openTab('search'); setTimeout(() => window.dispatchEvent(new CustomEvent('glosa:search', { detail: { term: q } })), 30); } });
    }
    return filtered.slice(0, 60);
  }, [q, project, st]);
  const run = (i: number) => { const it = items[i]; if (it) { close(); it.run(); } };
  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog palette">
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 16, top: 14, color: 'var(--text-3)' }} />
          <input className="input" autoFocus placeholder="Escribe un comando, código, documento o memo…" value={q}
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
              if (e.key === 'Enter') run(hi);
              if (e.key === 'Escape') close();
            }} />
        </div>
        <div className="list">
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? <div className="opt-head">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={i}>{head}
                <div className={'opt' + (i === hi ? ' on' : '')} onMouseEnter={() => setHi(i)} onClick={() => run(i)}>
                  {it.icon}<span className="ellipsis">{it.label}</span>{it.hint && <span className="hint">{it.hint}</span>}
                </div>
              </div>
            );
          })}
          {!items.length && <div className="muted small" style={{ padding: 14 }}>Sin resultados.</div>}
        </div>
      </div>
    </div>
  );
}

function PasteDialog({ close }: { close: () => void }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    const d = docFromPaste(name.trim() || 'Texto pegado', text);
    useStore.getState().addDocuments([d]);
    useStore.getState().openTab('document', d.id);
    close();
  };
  return (
    <Dialog title="Pegar texto como documento" sub="Útil para transcripciones, respuestas abiertas de encuestas o notas copiadas." onClose={close} className="wide"
      footer={<><button className="btn" onClick={close}>Cancelar</button><button className="btn primary" disabled={!text.trim()} onClick={add}>Agregar documento</button></>}>
      <div className="col" style={{ gap: 12 }}>
        <label className="field">Nombre<input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Entrevista 4 — Ana" /></label>
        <label className="field">Texto<textarea className="textarea" style={{ minHeight: 300, fontFamily: 'var(--font-read)' }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega aquí el texto…" /></label>
      </div>
    </Dialog>
  );
}

function ProjectInfoDialog({ close }: { close: () => void }) {
  const p = useStore((s) => s.project!);
  const [name, setName] = useState(p.name);
  const [desc, setDesc] = useState(p.description);
  const [author, setAuthor] = useState(p.author);
  const save = () => { useStore.getState().updateProjectInfo({ name: name.trim() || p.name, description: desc, author }); close(); };
  return (
    <Dialog title="Datos del proyecto" onClose={close} footer={<><button className="btn" onClick={close}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      <div className="col" style={{ gap: 12 }}>
        <label className="field">Nombre<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Autor(es)<input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
        <label className="field">Descripción, pregunta de investigación u objetivos<textarea className="textarea" rows={6} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      </div>
    </Dialog>
  );
}

function MergeDialog({ codeIds, close }: { codeIds: string[]; close: () => void }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [sources, setSources] = useState<string[]>(codeIds);
  const [target, setTarget] = useState<string>(codeIds[0]);
  const [q, setQ] = useState('');
  const others = project.codes.filter((c) => matches(c.name, q)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const go = () => {
    const src = sources.filter((s) => s !== target);
    if (!src.length) return;
    const tName = project.codes.find((c) => c.id === target)?.name;
    st().mergeCodes(target, src);
    st().toast(`${src.length} código(s) fusionado(s) en «${tName}»`, 'success', { label: 'Deshacer', run: () => st().undo() });
    st().select({ kind: 'code', id: target });
    close();
  };
  return (
    <Dialog title="Fusionar códigos" sub="Las citas de los códigos marcados pasarán al código destino, y los demás se eliminarán." onClose={close} className="wide" icon={<Merge size={20} style={{ marginTop: 2 }} />}
      footer={<><button className="btn" onClick={close}>Cancelar</button><button className="btn primary" disabled={sources.filter((s) => s !== target).length === 0} onClick={go}>Fusionar {sources.filter((s) => s !== target).length} en «{project.codes.find((c) => c.id === target)?.name}»</button></>}>
      <div className="input-wrap" style={{ marginBottom: 10 }}><Search size={14} /><input className="input" placeholder="Buscar códigos…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <table className="table">
        <thead><tr><th>Fusionar</th><th>Destino</th><th>Código</th><th className="num">Citas</th></tr></thead>
        <tbody>{others.map((c) => (
          <tr key={c.id}>
            <td><input type="checkbox" checked={sources.includes(c.id)} onChange={() => setSources(sources.includes(c.id) ? sources.filter((x) => x !== c.id) : [...sources, c.id])} /></td>
            <td><input type="radio" name="target" checked={target === c.id} onChange={() => { setTarget(c.id); if (!sources.includes(c.id)) setSources([...sources, c.id]); }} /></td>
            <td><span className="row"><span className="code-swatch" style={{ background: c.color }} />{c.name}</span></td>
            <td className="num">{project.quotations.filter((x) => x.codeIds.includes(c.id)).length}</td>
          </tr>
        ))}</tbody>
      </table>
    </Dialog>
  );
}

function LinkDialog({ d, close }: { d: Extract<DialogState, { type: 'link' }>; close: () => void }) {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [target, setTarget] = useState<EntityRef | undefined>(d.target);
  const [rel, setRel] = useState(project.relations[0]?.id);
  const [q, setQ] = useState('');
  const [newRel, setNewRel] = useState('');
  const opts: EntityRef[] = [
    ...project.codes.map((c) => ({ kind: 'code' as const, id: c.id })),
    ...project.memos.map((m) => ({ kind: 'memo' as const, id: m.id })),
    ...project.quotations.map((x) => ({ kind: 'quotation' as const, id: x.id })),
  ].filter((r) => !(r.kind === d.source.kind && r.id === d.source.id) && matches(entityName(project, r), q)).slice(0, 80);
  const go = (t: EntityRef | undefined = target) => {
    if (!t) return;
    let rid = rel;
    if (newRel.trim()) rid = st().createRelation({ name: newRel.trim(), symmetric: false, color: '#64748b', dashed: false });
    const id = st().createLink(d.source, t, rid);
    if (id) d.onDone?.(id);
    close();
  };
  return (
    <Dialog title="Vincular" onClose={close} className="wide" icon={<Link2 size={20} style={{ marginTop: 2 }} />}
      footer={<><button className="btn" onClick={close}>Cancelar</button><button className="btn primary" disabled={!target} onClick={() => go()}>Crear vínculo</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <div className="row card" style={{ padding: 10, flexWrap: 'wrap' }}>
          <span className="chip"><KindIcon kind={d.source.kind} size={11} /><span>{entityName(project, d.source).slice(0, 50)}</span></span>
          <select className="input sm" style={{ width: 220, fontWeight: 600 }} value={rel} onChange={(e) => setRel(e.target.value)} disabled={!!newRel.trim()}>
            {project.relations.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <span className="chip">{target ? <><KindIcon kind={target.kind} size={11} /><span>{entityName(project, target).slice(0, 50)}</span></> : <span className="muted">elige el destino abajo</span>}</span>
        </div>
        <input className="input sm" placeholder="…o escribe una relación nueva (p. ej. «influye en»)" value={newRel} onChange={(e) => setNewRel(e.target.value)} />
        {!d.target && (
          <>
            <div className="input-wrap"><Search size={14} /><input className="input" autoFocus placeholder="Buscar código, memo o cita destino…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 4 }}>
              {opts.map((r) => {
                const c = r.kind === 'code' ? project.codes.find((x) => x.id === r.id) : undefined;
                const on = target?.kind === r.kind && target.id === r.id;
                return (
                  <div key={r.kind + r.id} className={'opt' + (on ? ' on' : '')} onClick={() => setTarget(r)} onDoubleClick={() => go(r)}>
                    {c ? <span className="code-swatch" style={{ background: c.color }} /> : <KindIcon kind={r.kind} size={13} />}
                    <span className="small muted" style={{ width: 62 }}>{KIND_LABEL[r.kind]}</span>
                    <span className="ellipsis">{entityName(project, r)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

