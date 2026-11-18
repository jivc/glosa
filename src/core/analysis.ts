import type { ID, ProjectData, Quotation } from './types';

/** Conjunto de códigos de un código y todos sus descendientes. */
export function descendants(p: ProjectData, codeId: ID): Set<ID> {
  const out = new Set<ID>([codeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of p.codes) if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); grew = true; }
  }
  return out;
}

export function codeFrequency(p: ProjectData): Map<ID, number> {
  const m = new Map<ID, number>(p.codes.map((c) => [c.id, 0]));
  for (const q of p.quotations) for (const c of q.codeIds) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

/** Densidad: número de vínculos con otros códigos (como «D» en Atlas.ti). */
export function codeDensity(p: ProjectData): Map<ID, number> {
  const m = new Map<ID, number>(p.codes.map((c) => [c.id, 0]));
  for (const l of p.links) {
    if (l.source.kind === 'code' && l.target.kind === 'code') {
      m.set(l.source.id, (m.get(l.source.id) ?? 0) + 1);
      m.set(l.target.id, (m.get(l.target.id) ?? 0) + 1);
    }
  }
  return m;
}

export interface Table {
  rows: { id: ID; name: string; color?: string }[];
  cols: { id: ID; name: string; color?: string }[];
  /** values[r][c] */
  values: number[][];
  rowTotals: number[];
  colTotals: number[];
  total: number;
}

export function totals(values: number[][], nCols: number) {
  const rowTotals = values.map((r) => r.reduce((a, b) => a + b, 0));
  const colTotals = Array.from({ length: nCols }, (_, c) => values.reduce((a, r) => a + (r[c] ?? 0), 0));
  return { rowTotals, colTotals, total: rowTotals.reduce((a, b) => a + b, 0) };
}

/** Tabla códigos × documentos (o grupos de documentos). */
export function codeDocumentTable(
  p: ProjectData,
  codeIds: ID[],
  columns: { id: ID; name: string; docIds: ID[] }[],
  mode: 'count' | 'words' = 'count',
  /** Si es verdadero, cada código padre suma también las citas de sus subcódigos. */
  aggregateChildren = false,
): Table {
  const docText = new Map(p.documents.map((d) => [d.id, d.text]));
  const colOf = new Map<ID, number[]>();
  columns.forEach((col, i) => col.docIds.forEach((d) => colOf.set(d, [...(colOf.get(d) ?? []), i])));
  const rowIndex = new Map(codeIds.map((c, i) => [c, i]));
  const parentOf = new Map(p.codes.filter((c) => c.parentId).map((c) => [c.id, c.parentId!]));
  const values = codeIds.map(() => columns.map(() => 0));
  for (const q of p.quotations) {
    const cols = colOf.get(q.docId);
    if (!cols) continue;
    const w = mode === 'count' ? 1 : wordCount(docText.get(q.docId)!.slice(q.start, q.end));
    const rows = new Set<number>();
    for (const c of q.codeIds) {
      let cur: string | undefined = c;
      while (cur) {
        const r = rowIndex.get(cur);
        if (r !== undefined) rows.add(r);
        cur = aggregateChildren ? parentOf.get(cur) : undefined;
      }
    }
    for (const r of rows) for (const ci of cols) values[r][ci] += w;
  }
  const rows = codeIds.map((id) => { const c = p.codes.find((x) => x.id === id)!; return { id, name: c.name, color: c.color }; });
  return { rows, cols: columns.map(({ id, name }) => ({ id, name })), values, ...totals(values, columns.length) };
}

export function wordCount(s: string) {
  const m = s.match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

/**
 * Co-ocurrencia: dos códigos co-ocurren si están en la misma cita o en citas
 * del mismo documento que se solapan. Devuelve conteos y coeficiente c
 * (n12 / (n1 + n2 - n12)), igual que la tabla de co-ocurrencias de Atlas.ti.
 */
export function cooccurrence(p: ProjectData, codeIds: ID[], docIds?: Set<ID>) {
  const idx = new Map(codeIds.map((c, i) => [c, i]));
  const n = codeIds.length;
  const counts = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const pairs = Array.from({ length: n }, () => Array.from({ length: n }, () => new Set<string>()));
  const freq = new Array<number>(n).fill(0);
  const byDoc = new Map<ID, Quotation[]>();
  for (const q of p.quotations) {
    if (docIds && !docIds.has(q.docId)) continue;
    if (!byDoc.has(q.docId)) byDoc.set(q.docId, []);
    byDoc.get(q.docId)!.push(q);
    for (const c of q.codeIds) { const i = idx.get(c); if (i !== undefined) freq[i]++; }
  }
  // Pares de citas (q1, q2) que se solapan: cada par aporta una co-ocurrencia.
  const add = (i: number, j: number, key: string) => {
    if (i === j) return;
    const [a, b] = i < j ? [i, j] : [j, i];
    if (!pairs[a][b].has(key)) { pairs[a][b].add(key); counts[a][b]++; counts[b][a] = counts[a][b]; }
  };
  for (const list of byDoc.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let x = 0; x < list.length; x++) {
      const q1 = list[x];
      // misma cita
      for (const c1 of q1.codeIds) for (const c2 of q1.codeIds) {
        const i = idx.get(c1), j = idx.get(c2);
        if (i !== undefined && j !== undefined) add(i, j, q1.id);
      }
      for (let y = x + 1; y < list.length && list[y].start < q1.end; y++) {
        const q2 = list[y];
        const key = q1.id < q2.id ? q1.id + '|' + q2.id : q2.id + '|' + q1.id;
        for (const c1 of q1.codeIds) for (const c2 of q2.codeIds) {
          const i = idx.get(c1), j = idx.get(c2);
          if (i !== undefined && j !== undefined) add(i, j, key);
        }
      }
    }
  }
  const coef = counts.map((row, i) => row.map((v, j) => (i === j || v === 0 ? 0 : v / (freq[i] + freq[j] - v))));
  return { counts, coef, freq };
}

/** Citas donde co-ocurren los códigos a y b (para inspeccionar una celda). */
export function cooccurringQuotations(p: ProjectData, a: ID, b: ID): Quotation[] {
  const out = new Set<Quotation>();
  const withA = p.quotations.filter((q) => q.codeIds.includes(a));
  const withB = p.quotations.filter((q) => q.codeIds.includes(b));
  for (const q1 of withA) for (const q2 of withB) {
    if (q1.docId === q2.docId && q1.start < q2.end && q2.start < q1.end) { out.add(q1); out.add(q2); }
  }
  return [...out];
}

// ---------- Consulta booleana ----------

export type Query =
  | { op: 'code'; codeId: ID; includeChildren?: boolean }
  | { op: 'and' | 'or'; items: Query[] }
  | { op: 'not'; item: Query };

export function evalQuery(p: ProjectData, q: Query, quotes: Quotation[] = p.quotations): Quotation[] {
  const test = compile(p, q);
  return quotes.filter(test);
}

function compile(p: ProjectData, q: Query): (x: Quotation) => boolean {
  switch (q.op) {
    case 'code': {
      const set = q.includeChildren ? descendants(p, q.codeId) : new Set([q.codeId]);
      return (x) => x.codeIds.some((c) => set.has(c));
    }
    case 'and': { const fs = q.items.map((i) => compile(p, i)); return (x) => fs.length > 0 && fs.every((f) => f(x)); }
    case 'or': { const fs = q.items.map((i) => compile(p, i)); return (x) => fs.some((f) => f(x)); }
    case 'not': { const f = compile(p, q.item); return (x) => !f(x); }
  }
}

// ---------- Frecuencia de palabras ----------

export const STOPWORDS_ES = new Set(
  ('a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estado estamos estan estar este esto estos estoy fue fueron ha había han hasta hay la las le les lo los mas me mi mis mucho muy más mí nada ni no nos nosotros o os otra otro para pero poco por porque que qué quien se ser si sí sin sobre son su sus también tanto te tengo ti tiene tienen todo todos tu tus tú un una uno unos usted vez y ya yo él éste ésta así eh pues bueno entonces osea o sea cosa cosas creo digo dice decir hacer hace hacía hay ahí allí aquí sido siendo tenía tener puede pueden voy va van ir estás está están estaba sea solo sólo cada otros otras algún alguna mismo misma mismos ese esa este esta nuestra nuestro nuestros nuestras vamos tan')
    .split(/\s+/),
);
export const STOPWORDS_EN = new Set(
  'a an the and or but if of to in on at for with by from as is are was were be been being it its this that these those i you he she we they me him her us them my your his our their not no yes do does did have has had so than then there here what which who whom when where why how all any both each few more most other some such only own same too very can will just should now'.split(' '),
);

export function wordFrequencies(texts: string[], opts: { minLength?: number; stopwords?: boolean; exclude?: string[] } = {}) {
  const min = opts.minLength ?? 3;
  const excl = new Set((opts.exclude ?? []).map((w) => w.toLowerCase()));
  const m = new Map<string, number>();
  for (const t of texts) {
    for (const raw of t.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? []) {
      const w = raw.replace(/^['-]+|['-]+$/g, '');
      if (w.length < min || /^\d+$/.test(w) || excl.has(w)) continue;
      if (opts.stopwords !== false && (STOPWORDS_ES.has(w) || STOPWORDS_EN.has(w))) continue;
      m.set(w, (m.get(w) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
}

/** Búsqueda de texto en documentos; devuelve coincidencias con contexto. */
export function searchText(p: ProjectData, term: string, opts: { caseSensitive?: boolean; wholeWord?: boolean; docIds?: Set<ID> } = {}) {
  if (!term.trim()) return [];
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(opts.wholeWord ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, 'gu' + (opts.caseSensitive ? '' : 'i'));
  const out: { docId: ID; start: number; end: number; before: string; match: string; after: string }[] = [];
  for (const d of p.documents) {
    if (opts.docIds && !opts.docIds.has(d.id)) continue;
    for (const m of d.text.matchAll(re)) {
      const s = m.index!, e = s + m[0].length;
      out.push({ docId: d.id, start: s, end: e, before: d.text.slice(Math.max(0, s - 60), s), match: m[0], after: d.text.slice(e, e + 60) });
      if (out.length > 2000) return out;
    }
  }
  return out;
}

/** Amplía [start,end] a la oración o al párrafo completo que contiene la posición. */
export function expandRange(text: string, start: number, end: number, unit: 'sentence' | 'paragraph') {
  if (unit === 'paragraph') {
    const s = text.lastIndexOf('\n', start - 1) + 1;
    let e = text.indexOf('\n', end);
    if (e < 0) e = text.length;
    return { start: s, end: e };
  }
  let s = start;
  while (s > 0 && !/[.!?¿¡\n]/.test(text[s - 1])) s--;
  while (s < end && /\s/.test(text[s])) s++;
  let e = end;
  while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
  if (e < text.length && text[e] !== '\n') e++;
  return { start: s, end: e };
}
