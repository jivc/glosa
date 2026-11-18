// Proceso principal de Glosa (Electron): ventanas, menús y acceso a archivos.
const { app, BrowserWindow, dialog, ipcMain, Menu, shell, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

const isDev = !app.isPackaged && process.env.GLOSA_DEV_URL;
const isMac = process.platform === 'darwin';
const userData = app.getPath('userData');
const recentFile = path.join(userData, 'recientes.json');
const recoveryDir = path.join(userData, 'recuperacion');
const prefsFile = path.join(userData, 'preferencias.json');

/** @type {Map<number, {dirty: boolean, filePath: string|null, allowClose: boolean}>} */
const windowState = new Map();
let pendingOpen = [];

// ------------------------------------------------------------ utilidades

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

/** Escritura atómica: escribe a un temporal y lo renombra, con copia de seguridad. */
async function atomicWrite(file, data) {
  const tmp = file + '.tmp-' + process.pid;
  await fs.writeFile(tmp, data);
  try {
    if (fsSync.existsSync(file)) await fs.copyFile(file, file + '.bak');
  } catch { /* la copia de seguridad es opcional */ }
  await fs.rename(tmp, file);
}

async function addRecent(filePath) {
  const list = (await readJson(recentFile, [])).filter((r) => r.path !== filePath);
  list.unshift({ path: filePath, name: path.basename(filePath).replace(/\.glosa$/i, ''), openedAt: new Date().toISOString() });
  await fs.mkdir(userData, { recursive: true });
  await fs.writeFile(recentFile, JSON.stringify(list.slice(0, 15), null, 1));
  if (isMac || process.platform === 'win32') app.addRecentDocument(filePath);
}

const toBuffer = (data) => Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);

// ------------------------------------------------------------ ventanas

function createWindow(fileToOpen) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    title: 'Glosa',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14161a' : '#f6f7f9',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    autoHideMenuBar: false,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  const wcId = win.webContents.id;
  windowState.set(wcId, { dirty: false, filePath: null, allowClose: false });
  win.once('ready-to-show', () => win.show());

  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(isDev ? process.env.GLOSA_DEV_URL : 'file://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });

  win.on('close', async (e) => {
    const st = windowState.get(wcId);
    if (!st || st.allowClose || !st.dirty) return;
    e.preventDefault();
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Guardar', 'No guardar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      message: 'Hay cambios sin guardar en el proyecto.',
      detail: '¿Quieres guardarlos antes de cerrar?',
    });
    if (response === 2) return;
    if (response === 1) { st.allowClose = true; win.close(); return; }
    win.webContents.send('menu', 'save-and-close');
  });
  win.on('closed', () => windowState.delete(wcId));

  if (isDev) win.loadURL(process.env.GLOSA_DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  if (fileToOpen) win.webContents.once('did-finish-load', () => openPathInWindow(win, fileToOpen));
  if (process.env.GLOSA_SMOKE) win.webContents.once('did-finish-load', () => runSmoke(win));
  return win;
}

async function openPathInWindow(win, filePath) {
  try {
    const data = await fs.readFile(filePath);
    await addRecent(filePath);
    win.webContents.send('open-file', { path: filePath, name: path.basename(filePath), data: new Uint8Array(data) });
  } catch (err) {
    dialog.showErrorBox('No se pudo abrir el archivo', String(err.message || err));
  }
}

// Prueba automática: importa los archivos indicados dentro de la app real y termina.
async function runSmoke(win) {
  const files = process.env.GLOSA_SMOKE.split(path.delimiter);
  const results = {};
  for (const f of files) {
    const b64 = (await fs.readFile(f)).toString('base64');
    results[path.basename(f)] = await win.webContents.executeJavaScript(`(async () => {
      const bin = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));
      try { const d = await window.__glosa.importFile({ name: ${JSON.stringify(path.basename(f))}, data: bin.buffer }); return { ok: true, chars: d.text.length, pages: d.pageStarts?.length ?? 0, start: d.text.slice(0, 60) }; }
      catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    })()`);
  }
  console.log('GLOSA_SMOKE ' + JSON.stringify(results));
  app.exit(0);
}

function focused() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
}

const send = (action) => () => focused()?.webContents.send('menu', action);

function buildMenu() {
  const template = [
    ...(isMac ? [{
      label: 'Glosa',
      submenu: [
        { role: 'about', label: 'Acerca de Glosa' },
        { type: 'separator' },
        { label: 'Preferencias…', accelerator: 'Cmd+,', click: send('preferences') },
        { type: 'separator' },
        { role: 'services', label: 'Servicios' },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar Glosa' },
        { role: 'hideOthers', label: 'Ocultar otros' },
        { role: 'unhide', label: 'Mostrar todo' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir de Glosa' },
      ],
    }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nuevo proyecto', accelerator: 'CmdOrCtrl+N', click: send('new-project') },
        { label: 'Abrir proyecto…', accelerator: 'CmdOrCtrl+O', click: send('open-project') },
        { label: 'Nueva ventana', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
        { type: 'separator' },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { type: 'separator' },
        { label: 'Agregar documentos…', accelerator: 'CmdOrCtrl+Shift+D', click: send('add-documents') },
        { label: 'Importar proyecto REFI-QDA (Atlas.ti, MAXQDA, NVivo)…', click: send('import-qdpx') },
        { label: 'Exportar…', accelerator: 'CmdOrCtrl+E', click: send('export') },
        { type: 'separator' },
        { label: 'Cerrar proyecto', accelerator: 'CmdOrCtrl+Shift+W', click: send('close-project') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: 'Preferencias…', accelerator: 'Ctrl+,', click: send('preferences') }, { role: 'quit', label: 'Salir' }]),
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: 'Rehacer', accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y', click: send('redo') },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
        { type: 'separator' },
        { label: 'Buscar en el proyecto…', accelerator: 'CmdOrCtrl+F', click: send('search') },
        { label: 'Paleta de comandos…', accelerator: 'CmdOrCtrl+K', click: send('palette') },
      ],
    },
    {
      label: 'Analizar',
      submenu: [
        { label: 'Gestor de códigos', accelerator: 'CmdOrCtrl+1', click: send('open:codes') },
        { label: 'Gestor de citas', accelerator: 'CmdOrCtrl+2', click: send('open:quotations') },
        { label: 'Gestor de memos', accelerator: 'CmdOrCtrl+3', click: send('open:memos') },
        { label: 'Gestor de documentos', accelerator: 'CmdOrCtrl+4', click: send('open:documents') },
        { type: 'separator' },
        { label: 'Tabla código–documento', click: send('open:codeDoc') },
        { label: 'Tabla de co-ocurrencias', click: send('open:cooc') },
        { label: 'Consulta de citas', click: send('open:query') },
        { label: 'Nube y lista de palabras', click: send('open:words') },
        { type: 'separator' },
        { label: 'Nueva red', click: send('new-network') },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Mostrar/ocultar explorador', accelerator: 'CmdOrCtrl+B', click: send('toggle-sidebar') },
        { label: 'Mostrar/ocultar panel de detalles', accelerator: 'CmdOrCtrl+Alt+I', click: send('toggle-inspector') },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Aumentar tamaño' },
        { role: 'zoomOut', label: 'Reducir tamaño' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        ...(isDev ? [{ role: 'toggleDevTools' }, { role: 'reload' }] : []),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Recorrido guiado', click: send('tour') },
        { label: 'Atajos de teclado', accelerator: 'CmdOrCtrl+/', click: send('shortcuts') },
        { label: 'Guía rápida de análisis cualitativo', click: send('guide') },
        { type: 'separator' },
        { label: 'Abrir proyecto de ejemplo', click: send('sample') },
        { label: 'Mostrar carpeta de recuperación', click: () => shell.openPath(recoveryDir) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------ IPC

const filters = {
  project: [{ name: 'Proyecto de Glosa', extensions: ['glosa'] }],
  documents: [
    { name: 'Documentos', extensions: ['txt', 'md', 'markdown', 'docx', 'pdf', 'html', 'htm', 'rtf', 'odt'] },
    { name: 'Todos los archivos', extensions: ['*'] },
  ],
  refi: [{ name: 'REFI-QDA (proyecto o libro de códigos)', extensions: ['qdpx', 'qdc'] }],
};

function senderWin(e) { return BrowserWindow.fromWebContents(e.sender); }

ipcMain.handle('open-project-dialog', async (e) => {
  const r = await dialog.showOpenDialog(senderWin(e), { title: 'Abrir proyecto', filters: filters.project, properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  await addRecent(p);
  return { path: p, name: path.basename(p), data: new Uint8Array(await fs.readFile(p)) };
});

ipcMain.handle('read-path', async (_e, p) => {
  const data = await fs.readFile(p);
  await addRecent(p);
  return { path: p, name: path.basename(p), data: new Uint8Array(data) };
});

ipcMain.handle('open-files-dialog', async (e, kind) => {
  const r = await dialog.showOpenDialog(senderWin(e), {
    title: kind === 'refi' ? 'Importar REFI-QDA' : 'Agregar documentos',
    filters: filters[kind] ?? filters.documents,
    properties: kind === 'refi' ? ['openFile'] : ['openFile', 'multiSelections'],
  });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(async (p) => ({ path: p, name: path.basename(p), data: new Uint8Array(await fs.readFile(p)) })));
});

ipcMain.handle('save-project', async (e, { filePath, data, suggestedName }) => {
  let target = filePath;
  if (!target) {
    const docs = app.getPath('documents');
    const r = await dialog.showSaveDialog(senderWin(e), {
      title: 'Guardar proyecto',
      defaultPath: path.join(docs, (suggestedName || 'Proyecto').replace(/[\\/:*?"<>|]/g, '-') + '.glosa'),
      filters: filters.project,
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath.endsWith('.glosa') ? r.filePath : r.filePath + '.glosa';
  }
  await atomicWrite(target, toBuffer(data));
  await addRecent(target);
  return target;
});

ipcMain.handle('save-export', async (e, { suggestedName, data, extensions, label }) => {
  const r = await dialog.showSaveDialog(senderWin(e), {
    title: 'Exportar',
    defaultPath: path.join(app.getPath('documents'), suggestedName.replace(/[\\/:*?"<>|]/g, '-')),
    filters: [{ name: label || extensions.join(', ').toUpperCase(), extensions }],
  });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, typeof data === 'string' ? data : toBuffer(data));
  return r.filePath;
});

ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

ipcMain.handle('recent-list', async () => {
  const list = await readJson(recentFile, []);
  return list.map((r) => ({ ...r, exists: fsSync.existsSync(r.path) }));
});
ipcMain.handle('recent-remove', async (_e, p) => {
  const list = (await readJson(recentFile, [])).filter((r) => r.path !== p);
  await fs.writeFile(recentFile, JSON.stringify(list, null, 1));
});

ipcMain.handle('set-state', (e, { dirty, filePath, title }) => {
  const st = windowState.get(e.sender.id);
  if (st) { st.dirty = !!dirty; st.filePath = filePath ?? null; }
  const win = senderWin(e);
  if (win) {
    win.setTitle(title || 'Glosa');
    if (isMac) { win.setDocumentEdited(!!dirty); win.setRepresentedFilename(filePath || ''); }
  }
});

ipcMain.handle('allow-close', (e) => {
  const st = windowState.get(e.sender.id);
  if (st) st.allowClose = true;
  senderWin(e)?.close();
});

// Recuperación ante cierres inesperados: una copia por proyecto en la carpeta de datos.
ipcMain.handle('recovery-write', async (_e, { id, name, data }) => {
  await fs.mkdir(recoveryDir, { recursive: true });
  await atomicWrite(path.join(recoveryDir, `${id}.glosa`), toBuffer(data));
  await fs.writeFile(path.join(recoveryDir, `${id}.json`), JSON.stringify({ id, name, savedAt: new Date().toISOString() }));
});
ipcMain.handle('recovery-list', async () => {
  try {
    const files = (await fs.readdir(recoveryDir)).filter((f) => f.endsWith('.json'));
    return (await Promise.all(files.map((f) => readJson(path.join(recoveryDir, f), null)))).filter(Boolean);
  } catch { return []; }
});
ipcMain.handle('recovery-read', async (_e, id) => new Uint8Array(await fs.readFile(path.join(recoveryDir, `${id}.glosa`))));
ipcMain.handle('recovery-clear', async (_e, id) => {
  for (const ext of ['.glosa', '.json', '.glosa.bak']) await fs.rm(path.join(recoveryDir, id + ext), { force: true });
});

ipcMain.handle('prefs-get', () => readJson(prefsFile, {}));
ipcMain.handle('prefs-set', async (_e, prefs) => {
  await fs.mkdir(userData, { recursive: true });
  await fs.writeFile(prefsFile, JSON.stringify(prefs, null, 1));
  if (prefs.theme) nativeTheme.themeSource = prefs.theme;
});

ipcMain.handle('app-info', () => ({ version: app.getVersion(), platform: process.platform, documents: app.getPath('documents') }));

// ------------------------------------------------------------ ciclo de vida

// Abrir un .glosa con doble clic (macOS) o desde la línea de comandos (Windows/Linux).
app.on('open-file', (e, file) => {
  e.preventDefault();
  if (app.isReady()) {
    const win = focused();
    win ? openPathInWindow(win, file) : createWindow(file);
  } else pendingOpen.push(file);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    const file = argv.find((a) => a.toLowerCase().endsWith('.glosa'));
    if (file) createWindow(file);
    else focused()?.focus();
  });
}

app.whenReady().then(async () => {
  const prefs = await readJson(prefsFile, {});
  if (prefs.theme) nativeTheme.themeSource = prefs.theme;
  buildMenu();
  const argFile = process.argv.slice(1).find((a) => a.toLowerCase().endsWith('.glosa'));
  const first = pendingOpen[0] || argFile;
  createWindow(first);
  pendingOpen.slice(1).forEach((f) => createWindow(f));
  pendingOpen = [];
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
