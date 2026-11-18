# Glosa

Programa libre y gratuito para análisis cualitativo de datos (QDA), inspirado en el flujo de trabajo de Atlas.ti y pensado para estudiantes. Funciona sin conexión en macOS, Windows y Linux (Fedora, Ubuntu y otras).

## Qué puedes hacer

- **Documentos:** importa Word (DOCX), PDF con texto, OpenDocument (ODT), RTF, Markdown, HTML y texto plano, o pega texto directamente. Puedes organizarlos en grupos (p. ej. «mujeres», «zona rural»).
- **Codificación:** selecciona un fragmento y pulsa «Codificar» (⌘J / Ctrl+J). También puedes usar codificación *in vivo*, aplicar el último código usado (⌘L), arrastrar un código hasta el texto o crear citas libres. Los códigos se ven en el margen, como en Atlas.ti.
- **Códigos:** colores, definiciones, jerarquías (arrastra un código sobre otro), grupos, fusión de códigos y frecuencias.
- **Memos:** analíticos, metodológicos, teóricos o reflexivos, con formato (títulos, viñetas, negritas…) y vinculados a citas, códigos o documentos.
- **Redes:** lienzo visual con códigos, citas, memos y documentos, con relaciones con nombre («es causa de», «contradice»…). Se exportan a PNG, SVG o GraphML.
- **Análisis:** tabla código–documento (por documento o por grupo, en conteos o porcentajes), tabla de co-ocurrencias con coeficiente c, consultas booleanas (Y / O / SIN), nube y lista de palabras, y búsqueda de texto con autocodificación.
- **Exportación abierta:** REFI-QDA (.qdpx y .qdc) para Atlas.ti, MAXQDA, NVivo y QualCoder; Excel (.xlsx), CSV, Word (.docx), Markdown y JSON.
- **Seguridad del trabajo:** deshacer y rehacer (hasta 150 pasos), guardado automático, copias de recuperación si el programa se cierra inesperadamente y escritura segura del archivo con copia `.bak`.

## Instalación

Los instaladores están en la sección **Releases** del repositorio, o en la carpeta `release/` si los construiste tú.

| Sistema | Archivo | Cómo instalar |
|---|---|---|
| macOS (Apple Silicon / Intel) | `Glosa-x.y.z-arm64.dmg` / `Glosa-x.y.z.dmg` | Abre el .dmg y arrastra Glosa a Aplicaciones. La primera vez, haz clic derecho sobre Glosa → **Abrir** → **Abrir** (la app no está firmada con un certificado de Apple). |
| Windows 10/11 | `Glosa Setup x.y.z.exe` | Ejecuta el instalador. Si aparece «Windows protegió su PC», elige **Más información → Ejecutar de todas formas**. |
| Fedora / RHEL | `glosa-x.y.z.x86_64.rpm` | `sudo dnf install ./glosa-*.rpm` |
| Ubuntu / Debian | `glosa_x.y.z_amd64.deb` | `sudo apt install ./glosa_*.deb` |
| Cualquier Linux | `Glosa-x.y.z.AppImage` | `chmod +x Glosa-*.AppImage` y ábrelo con doble clic. |

## Migrar desde Atlas.ti

1. En Atlas.ti: **Archivo → Exportar → Proyecto de intercambio QDA-REFI** (.qdpx).
2. En Glosa: **Importar desde Atlas.ti u otro programa** y elige el archivo.

Se importan documentos de texto y PDF, citas, códigos (con colores, jerarquía y grupos), memos, vínculos y redes. Las fuentes de imagen, audio y video se omiten por ahora, y Glosa te avisa cuando lo hace.

## Para desarrollar

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev        # interfaz en el navegador (http://localhost:5199)
npm run dev:app    # app de escritorio con recarga en vivo
npm test           # pruebas del núcleo (importación, REFI-QDA, análisis)
npm run dist:mac   # instalador para macOS
npm run dist:win   # instalador para Windows
npm run dist:linux # RPM, DEB y AppImage (el RPM requiere rpmbuild)
```

Cada instalador se construye en su propio sistema:

- **Fedora:** `sudo dnf install nodejs rpm-build libxcrypt-compat`, copia la carpeta del proyecto y ejecuta `npm install && npm run dist:linux`. Obtendrás el `.rpm` (y el `.AppImage`) en `release/`.
- **Windows:** instala Node.js desde nodejs.org y ejecuta `npm install` y `npm run dist:win` en la carpeta del proyecto.
- **macOS:** `npm install && npm run dist:mac`.

Para publicar una versión nueva con los instaladores de los tres sistemas, sigue [PUBLICAR.md](PUBLICAR.md): basta con `npm run publicar` (o un botón en la pestaña *Actions* de GitHub). Los cambios de cada versión están en [CHANGELOG.md](CHANGELOG.md), y las notas para continuar el desarrollo, en [CLAUDE.md](CLAUDE.md).

### Estructura

- `src/core/`: modelo de datos, importadores, análisis, REFI-QDA y exportadores. No depende de la interfaz y tiene pruebas.
- `src/ui/`: componentes de la interfaz (React).
- `src/store.ts`: estado del proyecto con historial para deshacer y rehacer.
- `electron/`: proceso principal de escritorio (ventanas, menús, archivos y recuperación).

### Formato de archivo

Un proyecto `.glosa` es un ZIP que contiene `project.json` legible: documentos, códigos, citas (posiciones de carácter sobre el texto), memos, vínculos y redes. Puedes procesarlo directamente con R o Python.

## Licencia

MIT. Glosa es un proyecto independiente: no está afiliado a ATLAS.ti Scientific Software Development GmbH ni contiene código suyo.
