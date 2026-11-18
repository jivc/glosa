#!/usr/bin/env node
// Publica una nueva versión de Glosa en GitHub con un solo comando:
//
//   npm run publicar            → usa la versión que ya está en package.json
//   npm run publicar -- 1.2.0   → cambia la versión a 1.2.0 y la publica
//
// Qué hace: comprueba que CHANGELOG.md tenga la sección de esa versión, corre las pruebas,
// guarda los cambios en un commit, crea la etiqueta vX.Y.Z y la sube a GitHub. Al recibir la
// etiqueta, GitHub Actions construye los instaladores de macOS, Windows y Linux y publica la
// «Release» con ellos (tarda unos 15–25 minutos). Funciona igual en macOS, Windows y Linux.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const fail = (msg) => { console.error('\n✖ ' + msg + '\n'); process.exit(1); };

try { out('git --version'); } catch { fail('No encontré git. Instálalo (o usa GitHub Desktop y sigue PUBLICAR.md, opción B).'); }
try { out('git rev-parse --is-inside-work-tree'); } catch { fail('Esta carpeta no es un repositorio de git. Sigue PUBLICAR.md para conectarla con GitHub.'); }

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const pedida = process.argv[2]?.replace(/^v/, '');
if (pedida && !/^\d+\.\d+\.\d+$/.test(pedida)) fail(`«${pedida}» no es una versión válida (usa el formato 1.2.0).`);
const version = pedida ?? pkg.version;
const tag = 'v' + version;

if (out(`git tag --list ${tag}`)) fail(`La etiqueta ${tag} ya existe. Sube el número de versión: npm run publicar -- X.Y.Z`);
const changelog = readFileSync('CHANGELOG.md', 'utf8');
if (!new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?`, 'm').test(changelog)) {
  fail(`CHANGELOG.md no tiene una sección «## [${version}]». Escribe ahí qué cambió (es lo que verán quienes descarguen).`);
}

const rama = out('git rev-parse --abbrev-ref HEAD');
console.log(`\nVersión: ${version}   Rama: ${rama}`);
const pendientes = out('git status --porcelain');
if (pendientes) console.log('\nCambios que se incluirán en el commit:\n' + pendientes);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ok = (await rl.question(`\n¿Publicar Glosa ${version} en GitHub? (s/n) `)).trim().toLowerCase();
rl.close();
if (!['s', 'si', 'sí', 'y', 'yes'].includes(ok)) fail('Cancelado. No se cambió nada.');

console.log('\n→ Corriendo las pruebas…');
run('npm test');

if (pedida && pedida !== pkg.version) {
  pkg.version = version;
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  try { run('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', { stdio: 'ignore' }); } catch { /* el lock se actualizará en el siguiente npm install */ }
}

console.log('\n→ Guardando y subiendo a GitHub…');
run('git add -A');
if (out('git status --porcelain')) run(`git commit -m "Glosa ${version}"`);
run(`git tag -a ${tag} -m "Glosa ${version}"`);
run(`git push origin ${rama}`);
run(`git push origin ${tag}`);

let repo = '';
try { repo = out('git remote get-url origin').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, ''); } catch { /* */ }
console.log(`\n✔ Listo. GitHub está construyendo los instaladores (15–25 min).`);
if (repo) console.log(`  Progreso:  ${repo}/actions\n  Descargas: ${repo}/releases/tag/${tag}\n`);
