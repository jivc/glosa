import type { Code, Doc, EntityRef, Group, Memo, ProjectData, Quotation, Relation } from './types';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export const now = () => new Date().toISOString();

/** Paleta de colores para códigos: distinguibles entre sí y legibles en claro/oscuro. */
export const CODE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#be123c',
  '#7c3aed', '#ca8a04', '#0284c7', '#57534e',
];

export const GROUP_COLORS = ['#64748b', '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444'];

export function nextColor(used: string[]): string {
  const counts = new Map(CODE_COLORS.map((c) => [c, 0]));
  for (const u of used) if (counts.has(u)) counts.set(u, counts.get(u)! + 1);
  let best = CODE_COLORS[0];
  let min = Infinity;
  for (const [c, n] of counts) if (n < min) { min = n; best = c; }
  return best;
}

export function defaultRelations(): Relation[] {
  return [
    { id: 'rel-assoc', name: 'está asociado con', symmetric: true, color: '#64748b', dashed: false },
    { id: 'rel-part', name: 'es parte de', symmetric: false, color: '#2563eb', dashed: false },
    { id: 'rel-cause', name: 'es causa de', symmetric: false, color: '#dc2626', dashed: false },
    { id: 'rel-contra', name: 'contradice', symmetric: true, color: '#d97706', dashed: true },
    { id: 'rel-isa', name: 'es un tipo de', symmetric: false, color: '#9333ea', dashed: false },
    { id: 'rel-prop', name: 'es propiedad de', symmetric: false, color: '#0891b2', dashed: false },
    { id: 'rel-strat', name: 'es una estrategia para', symmetric: false, color: '#16a34a', dashed: false },
  ];
}

export function emptyProject(name = 'Proyecto sin título', author = ''): ProjectData {
  const t = now();
  return {
    format: 'glosa', version: 1, id: uid(), name, description: '', author,
    createdAt: t, modifiedAt: t,
    documents: [], documentGroups: [], codes: [], codeGroups: [], quotations: [],
    memos: [], relations: defaultRelations(), links: [], networks: [],
  };
}

export function makeCode(name: string, color: string, extra: Partial<Code> = {}): Code {
  return { id: uid(), name: name.trim(), color, description: '', groupIds: [], createdAt: now(), ...extra };
}

export function makeGroup(name: string, color = GROUP_COLORS[0]): Group {
  return { id: uid(), name: name.trim(), color, comment: '' };
}

export function makeQuotation(docId: string, start: number, end: number, codeIds: string[] = []): Quotation {
  return { id: uid(), docId, start, end, codeIds, comment: '', createdAt: now() };
}

export function makeMemo(title: string, links: EntityRef[] = [], content = ''): Memo {
  const t = now();
  return { id: uid(), title, content, type: 'analítico', links, createdAt: t, modifiedAt: t };
}

export function makeDoc(name: string, kind: Doc['kind'], text: string, extra: Partial<Doc> = {}): Doc {
  return { id: uid(), name, kind, text: normalizeText(text), comment: '', groupIds: [], createdAt: now(), ...extra };
}

/** Normaliza saltos de línea y espacios raros para que las posiciones sean estables. */
export function normalizeText(t: string): string {
  return t.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Valida y completa un proyecto leído de disco. Tolera archivos de versiones
 * previas o editados a mano, y descarta referencias rotas en lugar de fallar.
 */
export function normalizeProject(raw: any): ProjectData {
  if (!raw || typeof raw !== 'object') throw new Error('El archivo no contiene un proyecto válido.');
  const base = emptyProject(String(raw.name ?? 'Proyecto'));
  const p: ProjectData = {
    ...base,
    ...raw,
    format: 'glosa',
    version: 1,
    documents: arr(raw.documents),
    documentGroups: arr(raw.documentGroups),
    codes: arr(raw.codes),
    codeGroups: arr(raw.codeGroups),
    quotations: arr(raw.quotations),
    memos: arr(raw.memos),
    relations: arr(raw.relations).length ? arr(raw.relations) : defaultRelations(),
    links: arr(raw.links),
    networks: arr(raw.networks),
  };
  const docIds = new Set(p.documents.map((d) => d.id));
  const codeIds = new Set(p.codes.map((c) => c.id));
  const dg = new Set(p.documentGroups.map((g) => g.id));
  const cg = new Set(p.codeGroups.map((g) => g.id));
  p.documents = p.documents.map((d) => ({ ...d, text: String(d.text ?? ''), comment: d.comment ?? '', groupIds: arr(d.groupIds).filter((g) => dg.has(g)) }));
  p.codes = p.codes.map((c) => ({
    ...c, description: c.description ?? '', groupIds: arr(c.groupIds).filter((g) => cg.has(g)),
    parentId: c.parentId && codeIds.has(c.parentId) && c.parentId !== c.id ? c.parentId : undefined,
  }));
  const docLen = new Map(p.documents.map((d) => [d.id, d.text.length]));
  p.quotations = p.quotations
    .filter((q) => docIds.has(q.docId))
    .map((q) => {
      const len = docLen.get(q.docId)!;
      const start = clamp(q.start, 0, len);
      const end = clamp(q.end, start, len);
      return { ...q, comment: q.comment ?? '', start, end, codeIds: [...new Set(arr(q.codeIds).filter((c) => codeIds.has(c)))] };
    })
    .filter((q) => q.end > q.start);
  const exists = makeExists(p);
  p.memos = p.memos.map((m) => ({ ...m, type: m.type ?? 'analítico', content: m.content ?? '', links: arr(m.links).filter(exists) }));
  const relIds = new Set(p.relations.map((r) => r.id));
  p.links = p.links.filter((l) => exists(l.source) && exists(l.target) && relIds.has(l.relationId));
  p.networks = p.networks.map((n) => ({ ...n, description: n.description ?? '', nodes: arr(n.nodes).filter((nd) => exists(nd.ref)) }));
  return p;
}

export function makeExists(p: ProjectData) {
  const sets: Record<string, Set<string>> = {
    code: new Set(p.codes.map((c) => c.id)),
    quotation: new Set(p.quotations.map((q) => q.id)),
    memo: new Set(p.memos.map((m) => m.id)),
    document: new Set(p.documents.map((d) => d.id)),
  };
  return (r: EntityRef) => !!r && !!sets[r.kind]?.has(r.id);
}

const arr = <T = any>(x: any): T[] => (Array.isArray(x) ? x : []);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));

export function quotationLabel(p: ProjectData, q: Quotation, max = 80): string {
  const d = p.documents.find((x) => x.id === q.docId);
  const t = d ? d.text.slice(q.start, q.end).replace(/\s+/g, ' ').trim() : '';
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Número de cita tipo Atlas.ti: «D3:12» (documento 3, cita 12 dentro de ese documento). */
const numberCache = new WeakMap<Quotation[], WeakMap<Doc[], Map<string, string>>>();

export function quotationNumber(p: ProjectData, q: Quotation): string {
  let byDocs = numberCache.get(p.quotations);
  if (!byDocs) numberCache.set(p.quotations, (byDocs = new WeakMap()));
  let map = byDocs.get(p.documents);
  if (!map) {
    map = new Map();
    const docIndex = new Map(p.documents.map((d, i) => [d.id, i + 1]));
    const byDoc = new Map<string, Quotation[]>();
    for (const x of p.quotations) {
      if (!byDoc.has(x.docId)) byDoc.set(x.docId, []);
      byDoc.get(x.docId)!.push(x);
    }
    for (const [docId, list] of byDoc) {
      list.sort((a, b) => a.start - b.start || a.end - b.end);
      list.forEach((x, i) => map!.set(x.id, `D${docIndex.get(docId)}:${i + 1}`));
    }
    byDocs.set(p.documents, map);
  }
  return map.get(q.id) ?? '?';
}

export function entityName(p: ProjectData, r: EntityRef): string {
  switch (r.kind) {
    case 'code': return p.codes.find((c) => c.id === r.id)?.name ?? '(código eliminado)';
    case 'memo': return p.memos.find((m) => m.id === r.id)?.title ?? '(memo eliminado)';
    case 'document': return p.documents.find((d) => d.id === r.id)?.name ?? '(documento eliminado)';
    case 'quotation': {
      const q = p.quotations.find((x) => x.id === r.id);
      return q ? `${quotationNumber(p, q)} «${quotationLabel(p, q, 60)}»` : '(cita eliminada)';
    }
  }
}

export function pageOf(doc: Doc, pos: number): number | undefined {
  if (!doc.pageStarts?.length) return undefined;
  let page = 1;
  for (let i = 0; i < doc.pageStarts.length; i++) if (doc.pageStarts[i] <= pos) page = i + 1;
  return page;
}
