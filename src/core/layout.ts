// Disposición automática de redes: separación de nodos y algoritmo de fuerzas.
// No depende de la interfaz, para poder probarse por separado.


export type Box = { k: string; x: number; y: number; w: number; h: number };

/** Separa los rectángulos que se enciman. Los de `fixed` no se mueven. */
export function resolveOverlaps(boxes: Box[], fixed: Set<string> = new Set(), gap = 36, rounds = 80) {
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const fa = fixed.has(a.k), fb = fixed.has(b.k);
      if (fa && fb) continue;
      const ox = Math.min(a.x + a.w + gap, b.x + b.w + gap) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h + gap, b.y + b.h + gap) - Math.max(a.y, b.y);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      // Empujar por el eje con menos solapamiento.
      const horiz = ox < oy;
      const amount = (horiz ? ox : oy) + 1;
      const dir = horiz ? (a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1) : (a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1);
      const ma = fa ? 0 : fb ? 1 : 0.5, mb = fb ? 0 : fa ? 1 : 0.5;
      if (horiz) { a.x += dir * amount * ma; b.x -= dir * amount * mb; } else { a.y += dir * amount * ma; b.y -= dir * amount * mb; }
    }
    if (!moved) break;
  }
  return boxes;
}

/** Disposición de fuerzas (Fruchterman–Reingold) que considera el tamaño de cada nodo. */
export function forceLayout(boxes: Box[], links: [number, number][]) {
  const n = boxes.length;
  const avg = boxes.reduce((s, b) => s + (b.w + b.h) / 2, 0) / Math.max(1, n);
  const k = Math.max(170, avg * 1.7); // distancia ideal entre centros
  // Posición inicial determinista en círculo (los más conectados primero).
  const deg = new Array(n).fill(0);
  for (const [a, b] of links) { deg[a]++; deg[b]++; }
  const order = [...boxes.keys()].sort((a, b) => deg[b] - deg[a]);
  const R = Math.max(k, (n * k) / (2 * Math.PI));
  const pos = boxes.map(() => ({ x: 0, y: 0 }));
  order.forEach((idx, i) => {
    const r = i === 0 && deg[idx] > 0 ? 0 : R * (0.55 + 0.45 * ((i % 3) / 2));
    const ang = (i / n) * Math.PI * 2;
    pos[idx] = { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
  });
  let temp = R / 2;
  for (let it = 0; it < 350; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
      let d = Math.hypot(dx, dy);
      if (d < 0.01) { dx = 0.01 * (i - j); dy = 0.01; d = Math.hypot(dx, dy); }
      // Restar parte del tamaño: los nodos anchos se repelen más.
      const eff = Math.max(10, d - (boxes[i].w + boxes[j].w) / 4);
      const f = (k * k) / eff;
      disp[i].x += (dx / d) * f; disp[i].y += (dy / d) * f;
      disp[j].x -= (dx / d) * f; disp[j].y -= (dy / d) * f;
    }
    for (const [a, b] of links) {
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / k;
      disp[a].x -= (dx / d) * f; disp[a].y -= (dy / d) * f;
      disp[b].x += (dx / d) * f; disp[b].y += (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      // Gravedad suave: mantiene cerca los nodos sueltos.
      disp[i].x -= pos[i].x * 0.03; disp[i].y -= pos[i].y * 0.03;
      const d = Math.hypot(disp[i].x, disp[i].y) || 1;
      const m = Math.min(d, temp);
      pos[i].x += (disp[i].x / d) * m;
      pos[i].y += (disp[i].y / d) * m * 0.8;
    }
    temp = Math.max(2, temp * 0.985);
  }
  const out = boxes.map((b, i) => ({ ...b, x: pos[i].x - b.w / 2, y: pos[i].y - b.h / 2 }));
  return resolveOverlaps(out);
}

