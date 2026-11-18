import { produce } from 'immer';
import { create } from 'zustand';
import { GROUP_COLORS, makeCode, makeGroup, makeMemo, makeQuotation, nextColor, now, uid } from './core/model';
import type { Code, Doc, EntityRef, ID, Memo, ProjectData, Quotation, Relation } from './core/types';

export type TabType =
  | 'document' | 'network' | 'memo'
  | 'codes' | 'quotations' | 'memos' | 'documents' | 'networks' | 'relations'
  | 'codeDoc' | 'cooc' | 'query' | 'words' | 'search' | 'overview';

export interface Tab { key: string; type: TabType; refId?: ID }

export type DialogState =
  | { type: 'export' } | { type: 'preferences' } | { type: 'shortcuts' } | { type: 'tour' } | { type: 'guide' }
  | { type: 'palette' } | { type: 'paste' } | { type: 'project-info' }
  | { type: 'confirm'; title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void }
  | { type: 'prompt'; title: string; label: string; value: string; confirmLabel?: string; onConfirm: (v: string) => void; multiline?: boolean; placeholder?: string; hint?: string }
  | { type: 'merge-codes'; codeIds: ID[] }
  | { type: 'link'; source: EntityRef; target?: EntityRef; onDone?: (linkId: ID) => void }
  | { type: 'info'; title: string; lines: string[] };

export interface Toast { id: string; kind: 'info' | 'success' | 'error'; text: string; action?: { label: string; run: () => void } }

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  fontSize: number;
  lineHeight: number;
  autosave: boolean;
  author: string;
  onboardingDone: boolean;
  showSidebar: boolean;
  showInspector: boolean;
  marginWidth: number;
  /** Ancho del documento: normal (columna de lectura), amplio o toda la ventana. */
  docWidth: 'normal' | 'wide' | 'full';
}

export const defaultPrefs: Prefs = {
  theme: 'system', fontSize: 16, lineHeight: 1.75, autosave: true, author: '', onboardingDone: false,
  showSidebar: true, showInspector: true, marginWidth: 220, docWidth: 'full',
};

interface State {
  project: ProjectData | null;
  filePath: string | null;
  dirty: boolean;
  savedAt: string | null;
  saving: boolean;
  past: ProjectData[];
  future: ProjectData[];
  lastCoalesce: { key: string; at: number } | null;

  tabs: Tab[];
  activeTab: string | null;
  selected: EntityRef | null;
  activeQuotationId: ID | null;
  scrollTarget: { docId: ID; start: number; end: number; nonce: number } | null;
  lastCodeIds: ID[];
  /** Selección pendiente (sin codificar) en el documento abierto. */
  docSelection: { docId: ID; start: number; end: number } | null;
  dialog: DialogState | null;
  toasts: Toast[];
  prefs: Prefs;
  busy: string | null;

  // ciclo de vida
  loadProject(p: ProjectData, filePath: string | null): void;
  closeProject(): void;
  markSaved(path: string | null): void;
  setSaving(b: boolean): void;
  mutate(fn: (d: ProjectData) => void, coalesceKey?: string): void;
  undo(): void;
  redo(): void;

  // ui
  openTab(type: TabType, refId?: ID): void;
  closeTab(key: string): void;
  setActiveTab(key: string): void;
  moveTab(from: number, to: number): void;
  select(ref: EntityRef | null): void;
  setActiveQuotation(id: ID | null): void;
  revealQuotation(id: ID): void;
  revealRange(docId: ID, start: number, end: number): void;
  setDialog(d: DialogState | null): void;
  toast(text: string, kind?: Toast['kind'], action?: Toast['action']): void;
  dismissToast(id: string): void;
  setPrefs(p: Partial<Prefs>): void;
  setBusy(b: string | null): void;
  confirm(title: string, message: string, onConfirm: () => void, opts?: { confirmLabel?: string; danger?: boolean }): void;
  prompt(title: string, label: string, value: string, onConfirm: (v: string) => void, confirmLabel?: string, opts?: { multiline?: boolean; placeholder?: string; hint?: string }): void;

  // documentos
  addDocuments(docs: Doc[]): void;
  updateDoc(id: ID, patch: Partial<Pick<Doc, 'name' | 'comment' | 'groupIds'>>): void;
  deleteDocs(ids: ID[]): void;
  moveDoc(id: ID, toIndex: number): void;
  createDocGroup(name: string, docIds?: ID[]): ID;
  // códigos
  createCode(name: string, opts?: Partial<Code>): ID;
  updateCode(id: ID, patch: Partial<Omit<Code, 'id'>>): void;
  deleteCodes(ids: ID[]): void;
  mergeCodes(targetId: ID, sourceIds: ID[]): void;
  createCodeGroup(name: string, codeIds?: ID[]): ID;
  // citas
  createQuotation(docId: ID, start: number, end: number, codeIds?: ID[]): ID;
  codeRange(docId: ID, start: number, end: number, codeIds: ID[]): ID;
  updateQuotation(id: ID, patch: Partial<Pick<Quotation, 'start' | 'end' | 'comment' | 'codeIds'>>): void;
  toggleCodeOnQuotation(qid: ID, codeId: ID, on?: boolean): void;
  deleteQuotations(ids: ID[]): void;
  // memos
  createMemo(title: string, links?: EntityRef[], content?: string): ID;
  updateMemo(id: ID, patch: Partial<Omit<Memo, 'id' | 'createdAt'>>): void;
  deleteMemos(ids: ID[]): void;
  // vínculos y redes
  createLink(source: EntityRef, target: EntityRef, relationId: ID): ID | null;
  updateLink(id: ID, relationId: ID): void;
  deleteLinks(ids: ID[]): void;
  createRelation(r: Omit<Relation, 'id'>): ID;
  updateRelation(id: ID, patch: Partial<Omit<Relation, 'id'>>): void;
  deleteRelation(id: ID): void;
  createNetwork(name: string, nodes?: EntityRef[]): ID;
  updateNetwork(id: ID, patch: Partial<{ name: string; description: string }>): void;
  deleteNetworks(ids: ID[]): void;
  addNetworkNodes(netId: ID, nodes: { ref: EntityRef; x: number; y: number }[]): void;
  moveNetworkNodes(netId: ID, moves: { ref: EntityRef; x: number; y: number }[]): void;
  removeNetworkNodes(netId: ID, refs: EntityRef[]): void;
  updateProjectInfo(patch: Partial<Pick<ProjectData, 'name' | 'description' | 'author'>>): void;
}

const tabKey = (type: TabType, refId?: ID) => (refId ? `${type}:${refId}` : type);
const sameRef = (a: EntityRef, b: EntityRef) => a.kind === b.kind && a.id === b.id;
const HISTORY_LIMIT = 150;

/** Al borrar entidades, limpia todas las referencias que apunten a ellas. */
function purgeRefs(d: ProjectData, gone: EntityRef[]) {
  const isGone = (r: EntityRef) => gone.some((g) => sameRef(g, r));
  d.links = d.links.filter((l) => !isGone(l.source) && !isGone(l.target));
  for (const m of d.memos) m.links = m.links.filter((r) => !isGone(r));
  for (const n of d.networks) n.nodes = n.nodes.filter((x) => !isGone(x.ref));
}

export const useStore = create<State>((set, get) => ({
  project: null, filePath: null, dirty: false, savedAt: null, saving: false,
  past: [], future: [], lastCoalesce: null,
  tabs: [], activeTab: null, selected: null, activeQuotationId: null, scrollTarget: null, lastCodeIds: [], docSelection: null,
  dialog: null, toasts: [], prefs: defaultPrefs, busy: null,

  loadProject(p, filePath) {
    const first = p.documents[0];
    const tabs: Tab[] = first ? [{ key: tabKey('document', first.id), type: 'document', refId: first.id }] : [{ key: 'overview', type: 'overview' }];
    set({ project: p, filePath, dirty: false, savedAt: filePath ? now() : null, past: [], future: [], tabs, activeTab: tabs[0].key, selected: null, activeQuotationId: null, lastCodeIds: [] });
  },
  closeProject() { set({ project: null, filePath: null, dirty: false, past: [], future: [], tabs: [], activeTab: null, selected: null }); },
  markSaved(path) { set({ filePath: path ?? get().filePath, dirty: false, savedAt: now() }); },
  setSaving(b) { set({ saving: b }); },

  mutate(fn, coalesceKey) {
    const { project, past, lastCoalesce } = get();
    if (!project) return;
    const next = produce(project, (d) => { fn(d); d.modifiedAt = now(); });
    if (next === project) return;
    const t = Date.now();
    const coalesce = coalesceKey && lastCoalesce?.key === coalesceKey && t - lastCoalesce.at < 2000;
    set({
      project: next,
      past: coalesce ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
      future: [],
      dirty: true,
      lastCoalesce: coalesceKey ? { key: coalesceKey, at: t } : null,
    });
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true, lastCoalesce: null });
    fixTabs();
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project], dirty: true, lastCoalesce: null });
    fixTabs();
  },

  openTab(type, refId) {
    const key = tabKey(type, refId);
    const { tabs } = get();
    if (!tabs.some((t) => t.key === key)) {
      const idx = tabs.findIndex((t) => t.key === get().activeTab);
      const nt = [...tabs];
      nt.splice(idx + 1, 0, { key, type, refId });
      set({ tabs: nt });
    }
    set({ activeTab: key });
  },
  closeTab(key) {
    const { tabs, activeTab } = get();
    const i = tabs.findIndex((t) => t.key === key);
    const nt = tabs.filter((t) => t.key !== key);
    set({ tabs: nt, activeTab: activeTab === key ? (nt[Math.min(i, nt.length - 1)]?.key ?? null) : activeTab });
  },
  setActiveTab(key) { set({ activeTab: key }); },
  moveTab(from, to) {
    const nt = [...get().tabs];
    const [t] = nt.splice(from, 1);
    nt.splice(to, 0, t);
    set({ tabs: nt });
  },
  select(ref) { set({ selected: ref, activeQuotationId: ref?.kind === 'quotation' ? ref.id : get().activeQuotationId }); },
  setActiveQuotation(id) { set({ activeQuotationId: id, selected: id ? { kind: 'quotation', id } : get().selected }); },
  revealQuotation(id) {
    const q = get().project?.quotations.find((x) => x.id === id);
    if (!q) return;
    get().openTab('document', q.docId);
    set({ activeQuotationId: id, selected: { kind: 'quotation', id }, scrollTarget: { docId: q.docId, start: q.start, end: q.end, nonce: Math.random() } });
  },
  revealRange(docId, start, end) {
    get().openTab('document', docId);
    set({ scrollTarget: { docId, start, end, nonce: Math.random() } });
  },
  setDialog(d) { set({ dialog: d }); },
  toast(text, kind = 'info', action) {
    const id = uid();
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text, action }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : action ? 7000 : 3500);
  },
  dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },
  setPrefs(p) { set({ prefs: { ...get().prefs, ...p } }); },
  setBusy(b) { set({ busy: b }); },
  confirm(title, message, onConfirm, opts = {}) { set({ dialog: { type: 'confirm', title, message, onConfirm, ...opts } }); },
  prompt(title, label, value, onConfirm, confirmLabel, opts = {}) { set({ dialog: { type: 'prompt', title, label, value, onConfirm, confirmLabel, ...opts } }); },

  // ---------------------------------------------------------------- documentos
  addDocuments(docs) { get().mutate((d) => { d.documents.push(...docs); }); },
  updateDoc(id, patch) { get().mutate((d) => { Object.assign(d.documents.find((x) => x.id === id)!, patch); }, `doc:${id}:${Object.keys(patch).join()}`); },
  deleteDocs(ids) {
    get().mutate((d) => {
      const gone = new Set(ids);
      const qs = d.quotations.filter((q) => gone.has(q.docId)).map((q) => ({ kind: 'quotation' as const, id: q.id }));
      d.documents = d.documents.filter((x) => !gone.has(x.id));
      d.quotations = d.quotations.filter((q) => !gone.has(q.docId));
      purgeRefs(d, [...qs, ...ids.map((id) => ({ kind: 'document' as const, id }))]);
    });
    fixTabs();
  },
  moveDoc(id, toIndex) {
    get().mutate((d) => {
      const i = d.documents.findIndex((x) => x.id === id);
      const [doc] = d.documents.splice(i, 1);
      d.documents.splice(toIndex, 0, doc);
    });
  },
  createDocGroup(name, docIds = []) {
    const g = makeGroup(name, GROUP_COLORS[(get().project?.documentGroups.length ?? 0) % GROUP_COLORS.length]);
    get().mutate((d) => {
      d.documentGroups.push(g);
      for (const doc of d.documents) if (docIds.includes(doc.id)) doc.groupIds.push(g.id);
    });
    return g.id;
  },

  // ---------------------------------------------------------------- códigos
  createCode(name, opts = {}) {
    const p = get().project!;
    const existing = p.codes.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing.id;
    const c = makeCode(name, opts.color ?? nextColor(p.codes.map((x) => x.color)), opts);
    get().mutate((d) => { d.codes.push(c); });
    return c.id;
  },
  updateCode(id, patch) { get().mutate((d) => { Object.assign(d.codes.find((x) => x.id === id)!, patch); }, `code:${id}:${Object.keys(patch).join()}`); },
  deleteCodes(ids) {
    get().mutate((d) => {
      const gone = new Set(ids);
      for (const c of d.codes) if (c.parentId && gone.has(c.parentId)) c.parentId = d.codes.find((x) => x.id === c.parentId)?.parentId;
      d.codes = d.codes.filter((c) => !gone.has(c.id));
      for (const q of d.quotations) q.codeIds = q.codeIds.filter((c) => !gone.has(c));
      purgeRefs(d, ids.map((id) => ({ kind: 'code' as const, id })));
    });
    set({ lastCodeIds: get().lastCodeIds.filter((c) => !ids.includes(c)) });
  },
  mergeCodes(targetId, sourceIds) {
    const src = sourceIds.filter((s) => s !== targetId);
    get().mutate((d) => {
      const target = d.codes.find((c) => c.id === targetId)!;
      const gone = new Set(src);
      for (const c of d.codes) if (gone.has(c.id)) {
        if (c.description && !target.description.includes(c.description)) target.description = [target.description, c.description].filter(Boolean).join('\n\n');
        target.groupIds = [...new Set([...target.groupIds, ...c.groupIds])];
      }
      for (const c of d.codes) if (c.parentId && gone.has(c.parentId)) c.parentId = targetId;
      for (const q of d.quotations) {
        if (q.codeIds.some((c) => gone.has(c))) q.codeIds = [...new Set(q.codeIds.map((c) => (gone.has(c) ? targetId : c)))];
      }
      // Reapuntar vínculos, memos y nodos al código destino.
      const remap = (r: EntityRef) => (r.kind === 'code' && gone.has(r.id) ? { kind: 'code' as const, id: targetId } : r);
      for (const l of d.links) { l.source = remap(l.source); l.target = remap(l.target); }
      d.links = d.links.filter((l, i, all) => !sameRef(l.source, l.target) && all.findIndex((o) => sameRef(o.source, l.source) && sameRef(o.target, l.target) && o.relationId === l.relationId) === i);
      for (const m of d.memos) m.links = m.links.map(remap).filter((r, i, all) => all.findIndex((o) => sameRef(o, r)) === i);
      for (const n of d.networks) n.nodes = n.nodes.map((x) => ({ ...x, ref: remap(x.ref) })).filter((x, i, all) => all.findIndex((o) => sameRef(o.ref, x.ref)) === i);
      d.codes = d.codes.filter((c) => !gone.has(c.id));
    });
  },
  createCodeGroup(name, codeIds = []) {
    const g = makeGroup(name, GROUP_COLORS[(get().project?.codeGroups.length ?? 0) % GROUP_COLORS.length]);
    get().mutate((d) => {
      d.codeGroups.push(g);
      for (const c of d.codes) if (codeIds.includes(c.id)) c.groupIds.push(g.id);
    });
    return g.id;
  },

  // ---------------------------------------------------------------- citas
  createQuotation(docId, start, end, codeIds = []) {
    const q = makeQuotation(docId, start, end, codeIds);
    get().mutate((d) => { d.quotations.push(q); });
    if (codeIds.length) rememberCodes(codeIds);
    set({ activeQuotationId: q.id, selected: { kind: 'quotation', id: q.id } });
    return q.id;
  },
  codeRange(docId, start, end, codeIds) {
    const p = get().project!;
    const same = p.quotations.find((q) => q.docId === docId && q.start === start && q.end === end);
    if (same) {
      get().mutate((d) => {
        const q = d.quotations.find((x) => x.id === same.id)!;
        q.codeIds = [...new Set([...q.codeIds, ...codeIds])];
      });
      rememberCodes(codeIds);
      set({ activeQuotationId: same.id, selected: { kind: 'quotation', id: same.id } });
      return same.id;
    }
    return get().createQuotation(docId, start, end, codeIds);
  },
  updateQuotation(id, patch) { get().mutate((d) => { Object.assign(d.quotations.find((x) => x.id === id)!, patch); }, `q:${id}:${Object.keys(patch).join()}`); },
  toggleCodeOnQuotation(qid, codeId, on) {
    get().mutate((d) => {
      const q = d.quotations.find((x) => x.id === qid)!;
      const has = q.codeIds.includes(codeId);
      const want = on ?? !has;
      if (want && !has) q.codeIds.push(codeId);
      if (!want && has) q.codeIds = q.codeIds.filter((c) => c !== codeId);
    });
    if (on !== false) rememberCodes([codeId]);
  },
  deleteQuotations(ids) {
    get().mutate((d) => {
      const gone = new Set(ids);
      d.quotations = d.quotations.filter((q) => !gone.has(q.id));
      purgeRefs(d, ids.map((id) => ({ kind: 'quotation' as const, id })));
    });
    if (get().activeQuotationId && ids.includes(get().activeQuotationId!)) set({ activeQuotationId: null, selected: null });
  },

  // ---------------------------------------------------------------- memos
  createMemo(title, links = [], content = '') {
    const m = makeMemo(title, links, content);
    get().mutate((d) => { d.memos.push(m); });
    return m.id;
  },
  updateMemo(id, patch) {
    get().mutate((d) => { const m = d.memos.find((x) => x.id === id)!; Object.assign(m, patch); m.modifiedAt = now(); }, `memo:${id}:${Object.keys(patch).join()}`);
  },
  deleteMemos(ids) {
    get().mutate((d) => {
      const gone = new Set(ids);
      d.memos = d.memos.filter((m) => !gone.has(m.id));
      purgeRefs(d, ids.map((id) => ({ kind: 'memo' as const, id })));
    });
    fixTabs();
  },

  // ---------------------------------------------------------------- vínculos y redes
  createLink(source, target, relationId) {
    if (sameRef(source, target)) return null;
    const p = get().project!;
    const dup = p.links.find((l) => sameRef(l.source, source) && sameRef(l.target, target) && l.relationId === relationId);
    if (dup) return dup.id;
    const id = uid();
    get().mutate((d) => { d.links.push({ id, source, target, relationId }); });
    return id;
  },
  updateLink(id, relationId) { get().mutate((d) => { d.links.find((l) => l.id === id)!.relationId = relationId; }); },
  deleteLinks(ids) { get().mutate((d) => { d.links = d.links.filter((l) => !ids.includes(l.id)); }); },
  createRelation(r) { const id = uid(); get().mutate((d) => { d.relations.push({ id, ...r }); }); return id; },
  updateRelation(id, patch) { get().mutate((d) => { Object.assign(d.relations.find((r) => r.id === id)!, patch); }, `rel:${id}`); },
  deleteRelation(id) {
    get().mutate((d) => {
      const fallback = d.relations.find((r) => r.id !== id)!;
      for (const l of d.links) if (l.relationId === id) l.relationId = fallback.id;
      d.relations = d.relations.filter((r) => r.id !== id);
    });
  },
  createNetwork(name, nodes = []) {
    const id = uid();
    get().mutate((d) => {
      d.networks.push({ id, name, description: '', createdAt: now(), nodes: nodes.map((ref, i) => ({ ref, x: (i % 4) * 260, y: Math.floor(i / 4) * 160 })) });
    });
    return id;
  },
  updateNetwork(id, patch) { get().mutate((d) => { Object.assign(d.networks.find((n) => n.id === id)!, patch); }, `net:${id}`); },
  deleteNetworks(ids) { get().mutate((d) => { d.networks = d.networks.filter((n) => !ids.includes(n.id)); }); fixTabs(); },
  addNetworkNodes(netId, nodes) {
    get().mutate((d) => {
      const n = d.networks.find((x) => x.id === netId)!;
      for (const nd of nodes) if (!n.nodes.some((x) => sameRef(x.ref, nd.ref))) n.nodes.push(nd);
    });
  },
  moveNetworkNodes(netId, moves) {
    get().mutate((d) => {
      const n = d.networks.find((x) => x.id === netId)!;
      for (const m of moves) { const nd = n.nodes.find((x) => sameRef(x.ref, m.ref)); if (nd) { nd.x = m.x; nd.y = m.y; } }
    }, `netmove:${netId}`);
  },
  removeNetworkNodes(netId, refs) {
    get().mutate((d) => {
      const n = d.networks.find((x) => x.id === netId)!;
      n.nodes = n.nodes.filter((x) => !refs.some((r) => sameRef(r, x.ref)));
    });
  },
  updateProjectInfo(patch) { get().mutate((d) => { Object.assign(d, patch); }, 'project-info'); },
}));

function rememberCodes(ids: ID[]) {
  const s = useStore.getState();
  useStore.setState({ lastCodeIds: [...ids, ...s.lastCodeIds.filter((c) => !ids.includes(c))].slice(0, 8) });
}

/** Cierra pestañas cuyas entidades ya no existen (tras borrar o deshacer). */
function fixTabs() {
  const { tabs, project, activeTab } = useStore.getState();
  if (!project) return;
  const ok = (t: Tab) =>
    t.type === 'document' ? project.documents.some((d) => d.id === t.refId)
      : t.type === 'network' ? project.networks.some((n) => n.id === t.refId)
        : t.type === 'memo' ? project.memos.some((m) => m.id === t.refId) : true;
  const nt = tabs.filter(ok);
  if (nt.length !== tabs.length) useStore.setState({ tabs: nt, activeTab: nt.some((t) => t.key === activeTab) ? activeTab : nt[0]?.key ?? null });
}

// Selectores reutilizables
export const useProject = () => useStore((s) => s.project!);
