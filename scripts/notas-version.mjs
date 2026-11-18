#!/usr/bin/env node
// Imprime la sección de CHANGELOG.md de una versión, para usarla como notas de la Release.
//   node scripts/notas-version.mjs 1.1.0
import { existsSync, readFileSync } from 'node:fs';

const v = (process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version).replace(/^v/, '');
const md = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : '';
const m = new RegExp(`^## \\[?${v.replace(/\./g, '\\.')}\\]?.*$`, 'm').exec(md);
let body = '';
if (m) {
  const rest = md.slice(m.index + m[0].length);
  const end = rest.search(/^## /m);
  body = (end < 0 ? rest : rest.slice(0, end)).trim();
}
process.stdout.write(`${body || `Versión ${v}.`}

---

**Cómo instalar**

| Sistema | Archivo |
|---|---|
| macOS con chip M1–M4 | el \`.dmg\` que dice **arm64** |
| macOS con Intel | el otro \`.dmg\` |
| Windows 10/11 | \`Glosa Setup ${v}.exe\` |
| Fedora | el \`.rpm\` (\`sudo dnf install ./glosa-*.rpm\`) |
| Ubuntu/Debian | el \`.deb\` |
| Cualquier Linux | el \`.AppImage\` |

La app no está firmada con certificado comercial: en macOS, la primera vez haz clic derecho → **Abrir**; en Windows, **Más información → Ejecutar de todas formas**.
`);
