// Capa de plataforma: en escritorio usa Electron; en navegador, descargas y almacenamiento local.

export interface PickedFile { path?: string; name: string; data: Uint8Array }
export interface RecentItem { path: string; name: string; openedAt: string; exists?: boolean }
export interface RecoveryItem { id: string; name: string; savedAt: string }

interface Native {
  platform: string;
  openProjectDialog(): Promise<PickedFile | null>;
  readPath(p: string): Promise<PickedFile>;
  openFilesDialog(kind: 'documents' | 'refi'): Promise<PickedFile[]>;
  saveProject(a: { filePath: string | null; data: Uint8Array; suggestedName: string }): Promise<string | null>;
  saveExport(a: { suggestedName: string; data: Uint8Array | string; extensions: string[]; label?: string }): Promise<string | null>;
  reveal(p: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  recentList(): Promise<RecentItem[]>;
  recentRemove(p: string): Promise<void>;
  setState(s: { dirty: boolean; filePath: string | null; title: string }): Promise<void>;
  allowClose(): Promise<void>;
  recoveryWrite(a: { id: string; name: string; data: Uint8Array }): Promise<void>;
  recoveryList(): Promise<RecoveryItem[]>;
  recoveryRead(id: string): Promise<Uint8Array>;
  recoveryClear(id: string): Promise<void>;
  prefsGet(): Promise<Record<string, unknown>>;
  prefsSet(p: Record<string, unknown>): Promise<void>;
  appInfo(): Promise<{ version: string; platform: string }>;
  pathForFile(f: File): string;
  onMenu(cb: (action: string) => void): () => void;
  onOpenFile(cb: (f: PickedFile) => void): () => void;
}

declare global { interface Window { glosaNative?: Native } }

const native = typeof window !== 'undefined' ? window.glosaNative : undefined;
export const isDesktop = !!native;
export const isMac = native ? native.platform === 'darwin' : /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

function pickBrowserFiles(accept: string, multiple: boolean): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
    };
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

function download(name: string, data: Uint8Array | string, mime = 'application/octet-stream') {
  const blob = new Blob([data as BlobPart], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const LS = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('glosa:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('glosa:' + k, JSON.stringify(v)); } catch { /* sin espacio */ } },
};

// IndexedDB mínimo para la recuperación en navegador (localStorage es muy pequeño).
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('glosa', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('recovery');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('recovery', mode);
      const req = fn(tx.objectStore('recovery'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

export const platform = {
  async openProject(): Promise<PickedFile | null> {
    if (native) return native.openProjectDialog();
    return (await pickBrowserFiles('.glosa,.json', false))[0] ?? null;
  },
  readPath: (p: string) => native!.readPath(p),
  async pickDocuments(): Promise<PickedFile[]> {
    if (native) return native.openFilesDialog('documents');
    return pickBrowserFiles('.txt,.md,.markdown,.docx,.pdf,.html,.htm,.rtf,.odt', true);
  },
  async pickRefi(): Promise<PickedFile | null> {
    if (native) return (await native.openFilesDialog('refi'))[0] ?? null;
    return (await pickBrowserFiles('.qdpx,.qdc', false))[0] ?? null;
  },
  async saveProject(filePath: string | null, data: Uint8Array, suggestedName: string): Promise<string | null> {
    if (native) return native.saveProject({ filePath, data, suggestedName });
    download(suggestedName + '.glosa', data);
    return null;
  },
  async saveExport(suggestedName: string, data: Uint8Array | string, extensions: string[], label?: string): Promise<string | null> {
    if (native) return native.saveExport({ suggestedName, data, extensions, label });
    download(suggestedName, data);
    return suggestedName;
  },
  reveal: (p: string) => native?.reveal(p),
  openExternal: (url: string) => (native ? native.openExternal(url) : void window.open(url, '_blank', 'noopener')),
  async recentList(): Promise<RecentItem[]> { return native ? native.recentList() : []; },
  recentRemove: (p: string) => native?.recentRemove(p),
  setState(s: { dirty: boolean; filePath: string | null; title: string }) {
    if (native) native.setState(s);
    else document.title = (s.dirty ? '• ' : '') + s.title;
  },
  allowClose: () => native?.allowClose(),
  async recoveryWrite(id: string, name: string, data: Uint8Array) {
    if (native) return native.recoveryWrite({ id, name, data });
    await idb('readwrite', (s) => s.put({ id, name, savedAt: new Date().toISOString(), data }, id));
  },
  async recoveryList(): Promise<RecoveryItem[]> {
    if (native) return native.recoveryList();
    try { return ((await idb('readonly', (s) => s.getAll())) as any[]).map(({ id, name, savedAt }) => ({ id, name, savedAt })); } catch { return []; }
  },
  async recoveryRead(id: string): Promise<Uint8Array> {
    if (native) return native.recoveryRead(id);
    return ((await idb('readonly', (s) => s.get(id))) as any).data;
  },
  async recoveryClear(id: string) {
    if (native) return native.recoveryClear(id);
    try { await idb('readwrite', (s) => s.delete(id)); } catch { /* nada que limpiar */ }
  },
  async prefsGet(): Promise<Record<string, any>> { return native ? native.prefsGet() : LS.get('prefs', {}); },
  async prefsSet(p: Record<string, unknown>) { if (native) await native.prefsSet(p); else LS.set('prefs', p); },
  pathForFile: (f: File) => native?.pathForFile(f) ?? '',
  onMenu: (cb: (a: string) => void) => native?.onMenu(cb) ?? (() => {}),
  onOpenFile: (cb: (f: PickedFile) => void) => native?.onOpenFile(cb) ?? (() => {}),
};

export function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}
