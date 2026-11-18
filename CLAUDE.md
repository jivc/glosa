# Glosa — notas para continuar el desarrollo

Este archivo lo lee Claude Code automáticamente al abrir el proyecto. Resume qué es Glosa, cómo está
organizado, qué se decidió y qué queda pendiente. **Actualízalo al terminar cada sesión de trabajo.**
El historial de cambios para usuarios está en [CHANGELOG.md](CHANGELOG.md); cómo publicar, en [PUBLICAR.md](PUBLICAR.md).

## Qué es

Programa de escritorio libre (MIT) para análisis cualitativo de datos, al estilo de Atlas.ti, pensado para
estudiantes. Autor: Julio Vega. Interfaz y textos **en español** (México). Electron + React 19 + TypeScript + Vite.
Funciona sin conexión; cada proyecto es un archivo `.glosa` (ZIP con `project.json`).

## Comandos

```bash
npm ci             # dependencias (Node 20 o superior; se probó con Node 22)
npm run dev        # interfaz en el navegador, http://localhost:5199
npm run dev:app    # app de escritorio con recarga en vivo
npm test           # pruebas del núcleo (vitest), deben pasar todas
npx tsc -p . --noEmit   # revisión de tipos
npm run dist:mac   # instaladores .dmg (arm64 y x64) en release/
npm run publicar   # publica la versión en GitHub (ver PUBLICAR.md)
```

Autoprueba de la app empaquetada: `GLOSA_SMOKE=/ruta/a/archivo.txt <ejecutable>` imprime `GLOSA_SMOKE {...ok:true}` y se cierra.

## Estructura

- `src/core/` — lógica sin interfaz y con pruebas: `model.ts`, `types.ts` (modelo de datos), `importers.ts`,
  `qdpx.ts` (REFI-QDA), `analysis.ts`, `exporters.ts` (Excel, CSV, Word, Markdown, GraphML),
  `markdown.ts` (Markdown ligero de los memos), `layout.ts` (disposición automática de redes).
- `src/ui/` — componentes React. `NetworkView.tsx` (redes, con @xyflow/react), `MemoView.tsx` (editor de memos),
  `DocumentView.tsx` (lector y codificación), `Managers.tsx` (gestores de códigos, citas, memos, documentos),
  `Sidebar.tsx` (explorador izquierdo), `Inspector.tsx` (panel de detalles derecho), `comments.ts` (diálogos
  para editar definiciones y comentarios).
- `src/store.ts` — estado (zustand + immer) con historial de deshacer. Toda modificación pasa por `mutate`.
- `src/App.tsx` — barra superior, pestañas, atajos globales y menú nativo.
- `electron/` — proceso principal: ventanas, menú nativo (atajos), archivos, recuperación.
- `.github/workflows/release.yml` — construye instaladores para los 3 sistemas y publica la Release.

## Decisiones tomadas (y por qué)

- **Memos en Markdown, no HTML.** Se guardan como texto Markdown ligero (`core/markdown.ts`) para que sigan siendo
  legibles en `project.json`, compatibles con versiones anteriores y con REFI-QDA (`PlainTextContent`). El editor es
  un `<textarea>` con barra de formato y modos Escribir / Dividido / Vista previa; nunca se interpreta HTML.
  La exportación a Word convierte el Markdown en estilos reales (`markdownToDocx`).
- **⌘B en memos.** En Electron, ⌘B es acelerador del menú (mostrar/ocultar explorador). Si el foco está en
  `.memo-body`, `App.tsx` reenvía la acción como evento `glosa:memo-bold` y el editor aplica negritas.
- **Redes: borrar nodo ≠ borrar vínculos.** React Flow, al borrar un nodo, borra también sus aristas. Se usa
  `onDelete` para quitar el nodo sólo de la red y eliminar del proyecto únicamente los vínculos seleccionados
  explícitamente. (En 1.0.0 esto borraba relaciones de todo el proyecto.)
- **Aristas implícitas** (prefijo `imp:`): cita–código, cita–documento y memo–elemento vinculado. Se dibujan
  punteadas, no se pueden seleccionar ni borrar y no se exportan a GraphML (no son `links` del proyecto).
- **Vista general propia** (`NetMiniMap`) en lugar del `MiniMap` de React Flow, porque éste no dibuja aristas.
- **Disposición determinista** (sin `Math.random`), considera el tamaño medido de cada nodo y termina con una
  pasada que elimina solapamientos. Probada en `core.test.ts`.
- **Pestañas:** el contenedor `.app` usa `grid-template-columns: minmax(0, 1fr)`; sin eso, el ancho mínimo de la
  fila de pestañas ensanchaba toda la cuadrícula y empujaba el panel derecho fuera de la ventana.
- **Ancho del documento:** preferencia `docWidth` (`full` por defecto, `wide`, `normal`). El margen de códigos
  se reduce en ventanas angostas (`marginW` en `DocumentView.tsx`).
- **Publicación:** GitHub Actions construye todo; no hace falta una máquina con Windows o Linux. Las notas de la
  Release salen de la sección del CHANGELOG (`scripts/notas-version.mjs`).

## Estado actual — versión 1.1.0 (17 nov 2026)

Hecho en esta versión: ver CHANGELOG. Verificado: `tsc` sin errores, 23 pruebas pasan, revisión manual en el
navegador (pestañas, gestor de documentos, definición de códigos, redes, memos, ancho del documento),
`.dmg` de Apple Silicon generado y autoprueba `GLOSA_SMOKE` aprobada.

No verificado todavía:
- Instaladores de Windows, Linux y Mac Intel 1.1.0 (los genera GitHub Actions al publicar).
  Localmente no se generó el de Intel: la conexión era muy lenta para descargar otro Electron (130 MB).
- Probar a mano en la app de escritorio el atajo ⌘B dentro de un memo (en el navegador funciona).

## Pendientes e ideas

- Los gestores de citas y memos podrían tener un buscador de comentarios.
- Agregar «Agregar sus citas» también desde el menú de varios códigos seleccionados en una red.
- Las fuentes de imagen, audio y video de REFI-QDA se siguen omitiendo al importar.
- La app no está firmada (avisos de macOS y Windows). Firmarla requiere certificados de pago.

## Entorno de la Mac de Julio

No tiene Node.js ni git instalados en el sistema. En la sesión del 17 nov 2026 se usó Node 22 portátil en
`~/glosa-tools/node/bin` y el código se trabajó en `~/glosa` (fuera de Dropbox, por el tamaño de `node_modules`).
El código fuente empaquetado y los instaladores se dejan en `~/Dropbox/Glosa`.
Si electron-builder se cuelga descargando Electron, bájalo con `curl -C -` a `~/glosa-tools/electron-dist`
y usa `npx electron-builder --mac dmg --arm64 -c.electronDist=$HOME/glosa-tools/electron-dist`.
