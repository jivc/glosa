import { BookOpen, Check, Clock, FilePlus2, FileText, FolderOpen, GraduationCap, Import, Plus, Quote, Share2, Sparkles, StickyNote, Tag, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { importRefiFile, newProject, openProjectFile, openRecent, openSample, pickAndAddDocuments, restoreRecovery } from '../actions';
import { codeFrequency } from '../core/analysis';
import { isDesktop, platform, type RecentItem, type RecoveryItem } from '../platform';
import { useStore } from '../store';
import { fmtDate } from './common';

export function Welcome() {
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [recovery, setRecovery] = useState<RecoveryItem[]>([]);
  useEffect(() => {
    platform.recentList().then(setRecent).catch(() => {});
    platform.recoveryList().then(setRecovery).catch(() => {});
  }, []);
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div>
          <div className="brand"><div className="brand-logo" style={{ width: 40, height: 40, fontSize: 24, borderRadius: 11 }}>G</div></div>
          <h1>Glosa</h1>
          <p className="lead">Análisis cualitativo sencillo y libre. Codifica entrevistas y documentos, escribe memos, construye redes y exporta en formatos abiertos, todo en tu computadora.</p>
          <div className="big-actions">
            <button className="big-action primary" onClick={() => newProject()}>
              <div className="ico"><Plus size={20} /></div>
              <div><b>Nuevo proyecto</b><span>Empieza desde cero con tus propios documentos</span></div>
            </button>
            <button className="big-action" onClick={() => openProjectFile()}>
              <div className="ico"><FolderOpen size={20} /></div>
              <div><b>Abrir proyecto</b><span>Un archivo .glosa guardado antes</span></div>
            </button>
            <button className="big-action" onClick={() => importRefiFile()}>
              <div className="ico"><Import size={20} /></div>
              <div><b>Importar desde Atlas.ti u otro programa</b><span>Archivo REFI-QDA (.qdpx) de Atlas.ti, MAXQDA, NVivo o QualCoder</span></div>
            </button>
            <button className="big-action" onClick={openSample}>
              <div className="ico"><GraduationCap size={20} /></div>
              <div><b>Explorar el proyecto de ejemplo</b><span>Tres entrevistas ya codificadas para aprender</span></div>
            </button>
          </div>
        </div>
        <div>
          {recovery.map((r) => (
            <div key={r.id} className="recover">
              <div className="row"><TriangleAlert size={16} style={{ color: 'var(--warn)' }} /><b className="grow">Hay trabajo sin guardar de «{r.name}»</b></div>
              <div className="small" style={{ margin: '6px 0 10px', color: 'var(--text-2)' }}>Glosa guardó una copia de seguridad ({fmtDate(r.savedAt)}). ¿Quieres recuperarla?</div>
              <div className="row">
                <button className="btn sm primary" onClick={() => restoreRecovery(r.id)}>Recuperar</button>
                <button className="btn sm" onClick={() => { platform.recoveryClear(r.id); setRecovery(recovery.filter((x) => x.id !== r.id)); }}>Descartar</button>
              </div>
            </div>
          ))}
          <div className="panel">
            <div className="panel-head"><Clock size={15} />Proyectos recientes</div>
            {recent.length === 0 && <div className="small muted" style={{ padding: '6px 16px 16px' }}>{isDesktop ? 'Aquí aparecerán los proyectos que abras o guardes.' : 'En la versión web, abre tus proyectos con «Abrir proyecto».'}</div>}
            {recent.slice(0, 8).map((r) => (
              <div key={r.path} className="recent" onClick={() => (r.exists === false ? null : openRecent(r.path))} style={r.exists === false ? { opacity: 0.5 } : undefined} title={r.path}>
                <div className="ico"><FileText size={17} /></div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }} className="ellipsis">{r.name}</div>
                  <div className="small muted ellipsis">{r.exists === false ? 'No se encuentra el archivo' : r.path}</div>
                </div>
                <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.openedAt).toLocaleDateString('es-MX')}</span>
              </div>
            ))}
          </div>
          <div className="panel" style={{ marginTop: 14, padding: 16 }}>
            <div className="row" style={{ marginBottom: 8 }}><BookOpen size={15} /><b>¿Primera vez?</b></div>
            <div className="small" style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>
              1. Crea un proyecto y agrega tus documentos (Word, PDF, texto).<br />
              2. Lee, selecciona fragmentos y asígnales <b>códigos</b>.<br />
              3. Escribe <b>memos</b> con tus ideas y relaciona códigos en <b>redes</b>.<br />
              4. Analiza con tablas y exporta a Excel, Word o REFI-QDA.
            </div>
            <button className="btn sm" style={{ marginTop: 10 }} onClick={() => useStore.getState().setDialog({ type: 'guide' })}>Guía rápida de análisis cualitativo</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Overview() {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const freq = useMemo(() => codeFrequency(project), [project]);
  const top = [...project.codes].sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0)).slice(0, 12);
  const max = Math.max(1, ...top.map((c) => freq.get(c.id) ?? 0));
  const coded = new Set(project.quotations.map((q) => q.docId)).size;
  const steps = [
    { done: project.documents.length > 0, t: 'Agrega tus documentos', act: pickAndAddDocuments },
    { done: project.quotations.length > 0, t: 'Selecciona un fragmento y codifícalo', act: () => project.documents[0] && st().openTab('document', project.documents[0].id) },
    { done: project.codes.some((c) => c.description), t: 'Escribe la definición de un código', act: () => st().openTab('codes') },
    { done: project.memos.length > 0, t: 'Escribe tu primer memo', act: () => { const id = st().createMemo('Bitácora del análisis'); st().openTab('memo', id); } },
    { done: project.networks.length > 0, t: 'Crea una red con tus códigos', act: () => { const id = st().createNetwork('Mi primera red', top.slice(0, 6).map((c) => ({ kind: 'code' as const, id: c.id }))); st().openTab('network', id); } },
    { done: false, t: 'Explora la tabla de co-ocurrencias', act: () => st().openTab('cooc') },
  ];
  return (
    <div className="view-scroll">
      <div className="view-pad" style={{ maxWidth: 1100 }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 22, letterSpacing: '-.01em' }} className="grow">{project.name}</h2>
          <button className="btn" onClick={() => st().setDialog({ type: 'project-info' })}>Editar datos</button>
          <button className="btn primary" onClick={pickAndAddDocuments}><FilePlus2 size={15} />Agregar documentos</button>
        </div>
        {project.description && <p style={{ color: 'var(--text-2)', marginTop: 0, maxWidth: 760, lineHeight: 1.6 }}>{project.description}</p>}
        <div className="stats" style={{ margin: '16px 0 20px' }}>
          <div className="stat" onClick={() => st().openTab('documents')}><div className="n">{project.documents.length}</div><div className="l"><FileText size={14} />Documentos · {coded} codificados</div></div>
          <div className="stat" onClick={() => st().openTab('codes')}><div className="n">{project.codes.length}</div><div className="l"><Tag size={14} />Códigos</div></div>
          <div className="stat" onClick={() => st().openTab('quotations')}><div className="n">{project.quotations.length}</div><div className="l"><Quote size={14} />Citas</div></div>
          <div className="stat" onClick={() => st().openTab('memos')}><div className="n">{project.memos.length}</div><div className="l"><StickyNote size={14} />Memos</div></div>
          <div className="stat" onClick={() => project.networks[0] && st().openTab('network', project.networks[0].id)}><div className="n">{project.networks.length}</div><div className="l"><Share2 size={14} />Redes</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16 }}>
          <div className="card">
            <h3>Códigos más frecuentes</h3>
            {top.length ? (
              <div className="bars">
                {top.map((c) => (
                  <div key={c.id} className="bar-row" onClick={() => st().select({ kind: 'code', id: c.id })}>
                    <span className="ellipsis row"><span className="code-swatch" style={{ background: c.color }} />{c.name}</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${((freq.get(c.id) ?? 0) / max) * 100}%`, background: c.color }} /></div>
                    <span className="num small" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{freq.get(c.id) ?? 0}</span>
                  </div>
                ))}
              </div>
            ) : <div className="muted small">Cuando codifiques, aquí verás un resumen.</div>}
          </div>
          <div className="card">
            <h3><Sparkles size={14} style={{ verticalAlign: -2 }} /> Primeros pasos</h3>
            <div className="steps">
              {steps.map((s, i) => (
                <div key={i} className={'step' + (s.done ? ' done' : '')}>
                  <span className="dot">{s.done ? <Check size={13} strokeWidth={3} /> : <span className="small muted">{i + 1}</span>}</span>
                  <span className="t grow">{s.t}</span>
                  {!s.done && <button className="btn sm" onClick={s.act}>Hacer</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
        {project.memos.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Memos recientes</h3>
            <div className="mini-list">
              {[...project.memos].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 5).map((m) => (
                <div key={m.id} className="mini-item" onClick={() => st().openTab('memo', m.id)}>
                  <StickyNote size={14} style={{ color: '#d9a91a', marginTop: 2 }} />
                  <div className="grow"><b>{m.title}</b><div className="muted ellipsis">{m.content.slice(0, 160)}</div></div>
                  <span className="small muted">{fmtDate(m.modifiedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
