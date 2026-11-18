// Acciones de archivo: abrir, guardar, importar, exportar, guardado automático y recuperación.

import { importFile, kindFromName } from './core/importers';
import { emptyProject } from './core/model';
import { deserializeProject, serializeProject } from './core/projectFile';
import { exportCodebookQdc, exportQdpx, importRefi } from './core/qdpx';
import { sampleProject } from './core/sample';
import type { Doc, ProjectData } from './core/types';
import { platform, toArrayBuffer, type PickedFile } from './platform';
import { useStore } from './store';

const S = () => useStore.getState();

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Pide confirmación si hay cambios sin guardar; devuelve true si se puede continuar. */
function guardUnsaved(next: () => void) {
  const s = S();
  if (!s.project || !s.dirty) return next();
  s.setDialog({
    type: 'confirm', title: 'Cambios sin guardar',
    message: `«${s.project.name}» tiene cambios sin guardar. Si continúas sin guardar los perderás.`,
    confirmLabel: 'Continuar sin guardar', danger: true,
    onConfirm: next,
  });
}

export function newProject(name?: string) {
  guardUnsaved(() => {
    if (name === undefined) {
      S().prompt('Nuevo proyecto', 'Nombre del proyecto', '', (v) => startNew(v.trim() || 'Proyecto sin título'), 'Crear proyecto');
    } else startNew(name);
  });
}

function startNew(name: string) {
  const p = emptyProject(name, S().prefs.author);
  S().loadProject(p, null);
  useStore.setState({ dirty: true });
  if (!S().prefs.onboardingDone) S().setDialog({ type: 'tour' });
}

export function openSample() {
  guardUnsaved(() => {
    S().loadProject(sampleProject(), null);
    S().toast('Proyecto de ejemplo abierto. Guárdalo si quieres conservar tus cambios.', 'info');
  });
}

export async function openProjectFile(file?: PickedFile) {
  guardUnsaved(async () => {
    try {
      const f = file ?? (await platform.openProject());
      if (!f) return;
      S().setBusy('Abriendo proyecto…');
      const p = await deserializeProject(f.data);
      S().loadProject(p, f.path ?? null);
      S().toast(`Proyecto «${p.name}» abierto`, 'success');
    } catch (e) {
      S().toast('No se pudo abrir el proyecto: ' + errMsg(e), 'error');
    } finally {
      S().setBusy(null);
    }
  });
}

export async function openRecent(path: string) {
  try {
    const f = await platform.readPath(path);
    openProjectFile(f);
  } catch (e) {
    S().toast('No se encontró el archivo. Quizá se movió o se borró.', 'error');
    await platform.recentRemove(path);
  }
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const s = S();
  if (!s.project || s.saving) return false;
  s.setSaving(true);
  try {
    const snapshot = s.project;
    const data = await serializeProject(snapshot);
    const target = await platform.saveProject(saveAs ? null : s.filePath, data, s.project.name);
    if (target === null && (saveAs || !s.filePath)) {
      // En navegador la descarga no devuelve ruta; en escritorio, el usuario canceló.
      if (!window.glosaNative) { S().markSaved(null); return true; }
      return false;
    }
    S().markSaved(target);
    // Si hubo cambios mientras se guardaba, siguen pendientes.
    if (S().project !== snapshot) useStore.setState({ dirty: true });
    else await platform.recoveryClear(snapshot.id);
    return true;
  } catch (e) {
    s.toast('No se pudo guardar: ' + errMsg(e), 'error');
    return false;
  } finally {
    S().setSaving(false);
  }
}

export function closeProject() {
  guardUnsaved(() => {
    const id = S().project?.id;
    S().closeProject();
    if (id) platform.recoveryClear(id);
  });
}

// ------------------------------------------------------------ documentos

export async function addDocumentsFromFiles(files: PickedFile[] | File[]) {
  if (!S().project || !files.length) return;
  const picked: PickedFile[] = await Promise.all(
    (files as any[]).map(async (f) => (f instanceof File ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : f)),
  );
  // Si arrastran un proyecto o un REFI-QDA, lo tratamos como tal.
  const proj = picked.find((f) => /\.(glosa)$/i.test(f.name));
  if (proj) return openProjectFile(proj);
  const refi = picked.find((f) => /\.(qdpx|qdc)$/i.test(f.name));
  if (refi) return importRefiFile(refi);

  const docs: Doc[] = [];
  const errors: string[] = [];
  const unsupported = picked.filter((f) => !kindFromName(f.name));
  for (const [i, f] of picked.filter((f) => kindFromName(f.name)).entries()) {
    S().setBusy(`Importando ${f.name} (${i + 1} de ${picked.length})…`);
    try {
      docs.push(await importFile({ name: f.name, data: toArrayBuffer(f.data) }));
    } catch (e) {
      errors.push(`${f.name}: ${errMsg(e)}`);
    }
  }
  S().setBusy(null);
  if (docs.length) {
    S().addDocuments(docs);
    S().openTab('document', docs[0].id);
    S().toast(docs.length === 1 ? `Documento «${docs[0].name}» agregado` : `${docs.length} documentos agregados`, 'success');
  }
  if (unsupported.length) errors.push(...unsupported.map((f) => `${f.name}: formato no compatible (usa TXT, DOCX, PDF, ODT, RTF, Markdown o HTML).`));
  if (errors.length) S().setDialog({ type: 'info', title: 'Algunos archivos no se pudieron importar', lines: errors });
}

export async function pickAndAddDocuments() {
  addDocumentsFromFiles(await platform.pickDocuments());
}

// ------------------------------------------------------------ REFI-QDA

export async function importRefiFile(file?: PickedFile | null) {
  const f = file ?? (await platform.pickRefi());
  if (!f) return;
  try {
    S().setBusy('Leyendo archivo REFI-QDA…');
    const { project, warnings } = await importRefi(toArrayBuffer(f.data), f.name);
    S().setBusy(null);
    const isCodebook = f.name.toLowerCase().endsWith('.qdc');
    const current = S().project;
    if (isCodebook && current) {
      // Un libro de códigos se añade al proyecto actual.
      const names = new Set(current.codes.map((c) => c.name.toLowerCase()));
      const fresh = project.codes.filter((c) => !names.has(c.name.toLowerCase()));
      S().mutate((d) => { d.codes.push(...fresh.map((c) => ({ ...c, groupIds: [], parentId: fresh.some((x) => x.id === c.parentId) ? c.parentId : undefined }))); });
      S().toast(`${fresh.length} códigos importados del libro de códigos`, 'success');
      return;
    }
    guardUnsaved(() => {
      S().loadProject(project, null);
      useStore.setState({ dirty: true });
      const summary = `${project.documents.length} documentos, ${project.codes.length} códigos, ${project.quotations.length} citas y ${project.memos.length} memos importados.`;
      if (warnings.length) S().setDialog({ type: 'info', title: 'Proyecto importado con avisos', lines: [summary, ...warnings] });
      else S().toast(summary, 'success');
    });
  } catch (e) {
    S().setBusy(null);
    S().toast('No se pudo importar: ' + errMsg(e), 'error');
  }
}

// ------------------------------------------------------------ exportar

const slug = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'proyecto';

export async function exportFile(name: string, data: Uint8Array | string, ext: string, label?: string) {
  try {
    const path = await platform.saveExport(name.endsWith('.' + ext) ? name : `${name}.${ext}`, data, [ext], label);
    if (path) S().toast('Archivo exportado', 'success', window.glosaNative ? { label: 'Mostrar', run: () => platform.reveal(path) } : undefined);
  } catch (e) {
    S().toast('No se pudo exportar: ' + errMsg(e), 'error');
  }
}

export async function runExport(kind: string, p: ProjectData = S().project!) {
  const base = slug(p.name);
  const ex = await import('./core/exporters');
  S().setBusy('Preparando exportación…');
  try {
    switch (kind) {
      case 'qdpx': return await exportFile(base, await exportQdpx(p), 'qdpx', 'Proyecto REFI-QDA');
      case 'qdc': return await exportFile(base + ' - libro de códigos', exportCodebookQdc(p), 'qdc', 'Libro de códigos REFI-QDA');
      case 'xlsx': return await exportFile(base, await ex.toXlsx(ex.projectSheets(p)), 'xlsx', 'Excel');
      case 'quotes-csv': return await exportFile(base + ' - citas', ex.toCsv(ex.quotationRows(p)), 'csv', 'CSV');
      case 'codes-csv': return await exportFile(base + ' - códigos', ex.toCsv(ex.codebookRows(p)), 'csv', 'CSV');
      case 'memos-csv': return await exportFile(base + ' - memos', ex.toCsv(ex.memoRows(p)), 'csv', 'CSV');
      case 'docx': return await exportFile(base + ' - reporte', await ex.reportDocx(p), 'docx', 'Word');
      case 'memos-md': return await exportFile(base + ' - memos', ex.memosMarkdown(p), 'md', 'Markdown');
      case 'codebook-md': return await exportFile(base + ' - libro de códigos', ex.codebookMarkdown(p), 'md', 'Markdown');
      case 'json': return await exportFile(base, JSON.stringify(p, null, 2), 'json', 'JSON');
      case 'glosa-copy': return await exportFile(base + ' (copia)', await serializeProject(p), 'glosa', 'Proyecto de Glosa');
    }
  } finally {
    S().setBusy(null);
  }
}

// ------------------------------------------------------------ autoguardado y recuperación

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

export function startAutosave() {
  return useStore.subscribe((s, prev) => {
    if (s.project !== prev.project || s.dirty !== prev.dirty || s.filePath !== prev.filePath) {
      const name = s.project ? s.project.name : '';
      platform.setState({ dirty: s.dirty, filePath: s.filePath, title: s.project ? `${name}${s.dirty ? ' — editado' : ''} · Glosa` : 'Glosa' });
    }
    if (!s.project || s.project === prev.project || !s.dirty) return;
    if (s.filePath && s.prefs.autosave && window.glosaNative) {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => { if (S().dirty) saveProject(false); }, 1500);
    } else {
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(async () => {
        const p = S().project;
        if (!p || !S().dirty) return;
        try { await platform.recoveryWrite(p.id, p.name, await serializeProject(p)); } catch { /* no crítico */ }
      }, 4000);
    }
  });
}

export async function restoreRecovery(id: string) {
  try {
    const p = await deserializeProject(await platform.recoveryRead(id));
    S().loadProject(p, null);
    useStore.setState({ dirty: true });
    S().toast('Proyecto recuperado. Guárdalo para conservarlo.', 'success');
  } catch (e) {
    S().toast('No se pudo recuperar: ' + errMsg(e), 'error');
  }
}
