// Genera build/icon.png (1024×1024) a partir de un SVG. electron-builder deriva .icns y .ico.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3355dd"/><stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#g)"/>
  <rect x="250" y="270" width="420" height="44" rx="22" fill="#ffffff" opacity=".9"/>
  <rect x="250" y="370" width="520" height="44" rx="22" fill="#ffffff" opacity=".55"/>
  <rect x="250" y="470" width="300" height="44" rx="22" fill="#ffd166"/>
  <rect x="250" y="570" width="480" height="44" rx="22" fill="#ffffff" opacity=".55"/>
  <rect x="250" y="670" width="360" height="44" rx="22" fill="#ffffff" opacity=".55"/>
  <rect x="790" y="450" width="18" height="290" rx="9" fill="#ffd166"/>
  <rect x="790" y="450" width="54" height="18" rx="9" fill="#ffd166"/>
  <rect x="790" y="722" width="54" height="18" rx="9" fill="#ffd166"/>
</svg>`;

mkdirSync('build', { recursive: true });
await sharp(Buffer.from(svg)).png().toFile('build/icon.png');
await sharp(Buffer.from(svg)).resize(256, 256).png().toFile('public/icon-256.png').catch(() => {});
console.log('build/icon.png listo');

// .ico para Windows (PNG embebidos) y .icns para macOS (con iconutil si está disponible).
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(svg)).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = Buffer.concat(sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
}));
writeFileSync('build/icon.ico', Buffer.concat([header, dir, ...pngs]));
if (process.platform === 'darwin') {
  const set = 'build/icon.iconset';
  mkdirSync(set, { recursive: true });
  for (const s of [16, 32, 128, 256, 512]) {
    await sharp(Buffer.from(svg)).resize(s, s).png().toFile(`${set}/icon_${s}x${s}.png`);
    await sharp(Buffer.from(svg)).resize(s * 2, s * 2).png().toFile(`${set}/icon_${s}x${s}@2x.png`);
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', 'build/icon.icns']);
  rmSync(set, { recursive: true });
}
console.log('build/icon.ico y build/icon.icns listos');

// Juego de íconos para Linux: GNOME/KDE sólo buscan tamaños estándar (hasta 512×512).
mkdirSync('build/icons', { recursive: true });
for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) {
  await sharp(Buffer.from(svg)).resize(s, s).png().toFile(`build/icons/${s}x${s}.png`);
}
console.log('build/icons listo');
