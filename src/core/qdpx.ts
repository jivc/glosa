// Importación y exportación en el estándar abierto REFI-QDA (.qdpx / .qdc).
// Compatible con Atlas.ti, MAXQDA, NVivo, QualCoder y otros programas.
// https://www.qdasoftware.org/

import JSZip from 'jszip';
import { defaultRelations, emptyProject, makeExists, nextColor, normalizeProject, uid } from './model';
import type { Code, Doc, EntityRef, Link, Memo, ProjectData, Quotation, Relation } from './types';

const NS = 'urn:QDA-XML:project:1.0';
const NS_CODEBOOK = 'urn:QDA-XML:codebook:1.0';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** REFI-QDA exige GUIDs; convierte cualquier id en un GUID estable. */
export function toGuid(id: string): string {
  if (UUID_RE.test(id)) return id.toLowerCase();
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507);
    h3 = Math.imul(h3 ^ c, 3266489909); h4 = Math.imul(h4 ^ c, 668265263);
  }
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const attr = (o: Record<string, string | number | boolean | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('');
const dt = (s?: string) => (s ? new Date(s).toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined);

/** Convierte índices UTF-16 (JavaScript) a puntos de código Unicode (REFI-QDA). */
function utf16ToCodePoints(text: string) {
  const map = new Int32Array(text.length + 1);
  let cp = 0;
  for (let i = 0; i < text.length; i++) {
    map[i] = cp;
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) { map[i + 1] = cp; i++; }
    cp++;
  }
  map[text.length] = cp;
  return (i: number) => map[Math.max(0, Math.min(text.length, i))];
}

function codePointsToUtf16(text: string) {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    out.push(i);
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) i++;
  }
  out.push(text.length);
  return (cp: number) => out[Math.max(0, Math.min(out.length - 1, cp))];
}

// ------------------------------------------------------------------ Exportar

export function buildProjectXml(p: ProjectData, userName = 'Glosa'): { xml: string; texts: Map<string, string> } {
  const userGuid = toGuid('user:' + (p.author || userName));
  const u = { creatingUser: userGuid };
  const texts = new Map<string, string>();
  const memosFor = (ref: EntityRef) => p.memos.filter((m) => m.links.some((l) => l.kind === ref.kind && l.id === ref.id));
  const noteRefs = (ref: EntityRef) => memosFor(ref).map((m) => `<NoteRef${attr({ targetGUID: toGuid(m.id) })}/>`).join('');

  const codeXml = (c: Code): string => {
    const children = p.codes.filter((x) => x.parentId === c.id);
    return `<Code${attr({ guid: toGuid(c.id), name: c.name, isCodable: true, color: c.color.toUpperCase() })}>` +
      (c.description ? `<Description>${esc(c.description)}</Description>` : '') +
      noteRefs({ kind: 'code', id: c.id }) +
      children.map(codeXml).join('') + '</Code>';
  };
  const codeSets = p.codeGroups.map((g) => `<Set${attr({ guid: toGuid(g.id), name: g.name })}>` +
    (g.comment ? `<Description>${esc(g.comment)}</Description>` : '') +
    p.codes.filter((c) => c.groupIds.includes(g.id)).map((c) => `<MemberCode${attr({ targetGUID: toGuid(c.id) })}/>`).join('') + '</Set>').join('');

  const selectionXml = (d: Doc, q: Quotation, toCp: (i: number) => number) =>
    `<PlainTextSelection${attr({ guid: toGuid(q.id), name: d.text.slice(q.start, Math.min(q.end, q.start + 60)).replace(/\s+/g, ' '), startPosition: toCp(q.start), endPosition: toCp(q.end), ...u, creationDateTime: dt(q.createdAt) })}>` +
    (q.comment ? `<Description>${esc(q.comment)}</Description>` : '') +
    q.codeIds.map((c) => `<Coding${attr({ guid: toGuid(q.id + ':' + c), ...u, creationDateTime: dt(q.createdAt) })}><CodeRef${attr({ targetGUID: toGuid(c) })}/></Coding>`).join('') +
    noteRefs({ kind: 'quotation', id: q.id }) + '</PlainTextSelection>';

  const sources = p.documents.map((d) => {
    const g = toGuid(d.id);
    texts.set(`${g}.txt`, d.text);
    const toCp = utf16ToCodePoints(d.text);
    const sels = p.quotations.filter((q) => q.docId === d.id).sort((a, b) => a.start - b.start).map((q) => selectionXml(d, q, toCp)).join('');
    return `<TextSource${attr({ guid: g, name: d.name, plainTextPath: `internal://${g}.txt`, ...u, creationDateTime: dt(d.createdAt) })}>` +
      (d.comment ? `<Description>${esc(d.comment)}</Description>` : '') + sels + noteRefs({ kind: 'document', id: d.id }) + '</TextSource>';
  }).join('');

  const notes = p.memos.map((m) => `<Note${attr({ guid: toGuid(m.id), name: m.title, ...u, creationDateTime: dt(m.createdAt), modifiedDateTime: dt(m.modifiedAt) })}>` +
    `<PlainTextContent>${esc(m.content)}</PlainTextContent>` + noteRefs({ kind: 'memo', id: m.id }) + '</Note>').join('');

  const relName = new Map(p.relations.map((r) => [r.id, r]));
  const links = p.links.map((l) => {
    const r = relName.get(l.relationId);
    return `<Link${attr({ guid: toGuid(l.id), name: r?.name ?? 'relación', direction: r?.symmetric ? 'Associative' : 'OneWay', color: r?.color?.toUpperCase(), originGUID: toGuid(l.source.id), targetGUID: toGuid(l.target.id) })}/>`;
  }).join('');

  const docSets = p.documentGroups.map((g) => `<Set${attr({ guid: toGuid(g.id), name: g.name })}>` +
    (g.comment ? `<Description>${esc(g.comment)}</Description>` : '') +
    p.documents.filter((d) => d.groupIds.includes(g.id)).map((d) => `<MemberSource${attr({ targetGUID: toGuid(d.id) })}/>`).join('') + '</Set>').join('');

  const exists = makeExists(p);
  const graphs = p.networks.map((n) => {
    const vid = (ref: EntityRef) => toGuid(`v:${n.id}:${ref.kind}:${ref.id}`);
    const on = new Set(n.nodes.map((x) => x.ref.kind + ':' + x.ref.id));
    const vertices = n.nodes.filter((x) => exists(x.ref)).map((x) => {
      const c = x.ref.kind === 'code' ? p.codes.find((k) => k.id === x.ref.id)?.color : undefined;
      return `<Vertex${attr({ guid: vid(x.ref), representedGUID: toGuid(x.ref.id), name: nameOf(p, x.ref), firstX: Math.round(x.x), firstY: Math.round(x.y), shape: 'Rectangle', color: c?.toUpperCase() })}/>`;
    }).join('');
    const edges = p.links.filter((l) => on.has(l.source.kind + ':' + l.source.id) && on.has(l.target.kind + ':' + l.target.id))
      .map((l) => `<Edge${attr({ guid: toGuid(`e:${n.id}:${l.id}`), representedGUID: toGuid(l.id), name: relName.get(l.relationId)?.name, sourceVertex: vid(l.source), targetVertex: vid(l.target), direction: relName.get(l.relationId)?.symmetric ? 'Associative' : 'OneWay' })}/>`).join('');
    return `<Graph${attr({ guid: toGuid(n.id), name: n.name })}>${vertices}${edges}</Graph>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<Project xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${attr({ name: p.name, origin: 'Glosa 1.0', creatingUserGUID: userGuid, creationDateTime: dt(p.createdAt), modifiedDateTime: dt(p.modifiedAt) })}>` +
    `<Users><User${attr({ guid: userGuid, name: p.author || userName })}/></Users>` +
    `<CodeBook><Codes>${p.codes.filter((c) => !c.parentId).map(codeXml).join('')}</Codes>${codeSets ? `<Sets>${codeSets}</Sets>` : ''}</CodeBook>` +
    (sources ? `<Sources>${sources}</Sources>` : '') +
    (notes ? `<Notes>${notes}</Notes>` : '') +
    (links ? `<Links>${links}</Links>` : '') +
    (docSets ? `<Sets>${docSets}</Sets>` : '') +
    (graphs ? `<Graphs>${graphs}</Graphs>` : '') +
    (p.description ? `<Description>${esc(p.description)}</Description>` : '') +
    `</Project>`;
  return { xml, texts };
}

function nameOf(p: ProjectData, r: EntityRef) {
  if (r.kind === 'code') return p.codes.find((c) => c.id === r.id)?.name;
  if (r.kind === 'memo') return p.memos.find((m) => m.id === r.id)?.title;
  if (r.kind === 'document') return p.documents.find((d) => d.id === r.id)?.name;
  const q = p.quotations.find((x) => x.id === r.id);
  const d = q && p.documents.find((x) => x.id === q.docId);
  return q && d ? d.text.slice(q.start, Math.min(q.end, q.start + 50)) : undefined;
}

export async function exportQdpx(p: ProjectData): Promise<Uint8Array> {
  const { xml, texts } = buildProjectXml(p);
  const zip = new JSZip();
  zip.file('project.qde', xml);
  const src = zip.folder('sources')!;
  for (const [name, text] of texts) src.file(name, text);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Libro de códigos REFI-QDA (.qdc), para compartir sólo la lista de códigos. */
export function exportCodebookQdc(p: ProjectData): string {
  const codeXml = (c: Code): string =>
    `<Code${attr({ guid: toGuid(c.id), name: c.name, isCodable: true, color: c.color.toUpperCase() })}>` +
    (c.description ? `<Description>${esc(c.description)}</Description>` : '') +
    p.codes.filter((x) => x.parentId === c.id).map(codeXml).join('') + '</Code>';
  const sets = p.codeGroups.map((g) => `<Set${attr({ guid: toGuid(g.id), name: g.name })}>` +
    p.codes.filter((c) => c.groupIds.includes(g.id)).map((c) => `<MemberCode${attr({ targetGUID: toGuid(c.id) })}/>`).join('') + '</Set>').join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<CodeBook xmlns="${NS_CODEBOOK}" origin="Glosa 1.0"><Codes>${p.codes.filter((c) => !c.parentId).map(codeXml).join('')}</Codes>${sets ? `<Sets>${sets}</Sets>` : ''}</CodeBook>`;
}

// ------------------------------------------------------------------ Importar

export interface ImportReport {
  project: ProjectData;
  warnings: string[];
}

const kids = (el: Element | null | undefined, name: string) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0];
const textOf = (el: Element | undefined) => (el?.textContent ?? '').trim();

function normColor(c: string | null, used: string[]): string {
  if (c && /^#?[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) return ('#' + c.replace('#', '').slice(0, 6)).toLowerCase();
  return nextColor(used);
}

/** Lee un .qdpx (proyecto completo) o un .qdc (sólo libro de códigos). */
export async function importRefi(data: ArrayBuffer, fileName: string): Promise<ImportReport> {
  const warnings: string[] = [];
  let xml: string;
  let zip: JSZip | null = null;
  if (fileName.toLowerCase().endsWith('.qdc')) {
    xml = new TextDecoder().decode(data);
  } else {
    zip = await JSZip.loadAsync(data);
    const entry = zip.file(/\.qde$/i)[0];
    if (!entry) throw new Error('El archivo .qdpx no contiene un proyecto (project.qde).');
    xml = await entry.async('string');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('El archivo REFI-QDA está dañado o no es XML válido.');
  const root = doc.documentElement;
  const p = emptyProject(root.getAttribute('name') || fileName.replace(/\.[^.]+$/, ''));
  p.description = textOf(kid(root, 'Description'));
  const users = new Map(kids(kid(root, 'Users'), 'User').map((u) => [u.getAttribute('guid'), u.getAttribute('name') ?? '']));
  p.author = users.get(root.getAttribute('creatingUserGUID')) ?? '';

  const guidMap = new Map<string, EntityRef>();
  const pendingNoteRefs: { owner: EntityRef; note: string }[] = [];
  const collectNoteRefs = (el: Element, owner: EntityRef) =>
    kids(el, 'NoteRef').forEach((n) => pendingNoteRefs.push({ owner, note: n.getAttribute('targetGUID') ?? '' }));

  // Códigos (jerárquicos)
  const codebook = root.localName === 'CodeBook' ? root : kid(root, 'CodeBook');
  const walkCodes = (parent: Element | undefined, parentId?: string) => {
    for (const el of kids(parent, 'Code')) {
      const c: Code = {
        id: uid(), name: el.getAttribute('name') || 'Código', color: normColor(el.getAttribute('color'), p.codes.map((x) => x.color)),
        description: textOf(kid(el, 'Description')), parentId, groupIds: [], createdAt: new Date().toISOString(),
      };
      p.codes.push(c);
      guidMap.set(el.getAttribute('guid') ?? c.id, { kind: 'code', id: c.id });
      collectNoteRefs(el, { kind: 'code', id: c.id });
      walkCodes(el, c.id);
    }
  };
  walkCodes(kid(codebook, 'Codes'));
  for (const s of kids(kid(codebook, 'Sets'), 'Set')) {
    const g = { id: uid(), name: s.getAttribute('name') || 'Grupo', color: '#64748b', comment: textOf(kid(s, 'Description')) };
    p.codeGroups.push(g);
    for (const m of kids(s, 'MemberCode')) {
      const r = guidMap.get(m.getAttribute('targetGUID') ?? '');
      if (r) p.codes.find((c) => c.id === r.id)!.groupIds.push(g.id);
    }
  }

  // Fuentes
  const readInternal = async (path: string | null): Promise<string | null> => {
    if (!path || !zip) return null;
    const name = path.replace(/^internal:\/\//, '').replace(/^relative:\/\//, '');
    const f = zip.file('sources/' + name) ?? zip.file(name) ?? zip.file(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'))[0];
    if (!f) return null;
    const bytes = await f.async('uint8array');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(bytes); }
  };

  const sources = kid(root, 'Sources');
  let skipped = 0;
  for (const el of sources ? [...sources.children] : []) {
    let raw: string | null = null;
    let holder: Element = el;
    let kind: Doc['kind'] = 'text';
    const readSource = async (e: Element) => {
      const inline = kid(e, 'PlainTextContent');
      return inline ? inline.textContent ?? '' : readInternal(e.getAttribute('plainTextPath'));
    };
    if (el.localName === 'TextSource') {
      raw = await readSource(el);
    } else if (el.localName === 'PDFSource') {
      kind = 'pdf';
      const rep = kid(el, 'Representation');
      if (rep) { holder = rep; raw = await readSource(rep); }
    } else { skipped++; continue; }
    if (raw == null) { warnings.push(`No se encontró el texto de «${el.getAttribute('name')}».`); continue; }
    // No normalizamos más allá de los saltos de línea: las posiciones dependen del texto exacto.
    const text = raw.replace(/\r\n/g, '\n');
    const d: Doc = { id: uid(), name: el.getAttribute('name') || 'Documento', kind, text, comment: textOf(kid(el, 'Description')), groupIds: [], createdAt: el.getAttribute('creationDateTime') || new Date().toISOString(), importedFrom: fileName };
    // Las posiciones se cuentan sobre el original; si tenía \r\n, cada salto valía 2 caracteres.
    const fromCp = codePointsToUtf16(raw);
    const crBefore = new Int32Array(raw.length + 1);
    for (let i = 0, n = 0; i <= raw.length; i++) { crBefore[i] = n; if (raw[i] === '\r' && raw[i + 1] === '\n') n++; }
    const crlfAdjust = (i: number) => i - crBefore[Math.max(0, Math.min(raw!.length, i))];
    p.documents.push(d);
    guidMap.set(el.getAttribute('guid') ?? d.id, { kind: 'document', id: d.id });
    collectNoteRefs(el, { kind: 'document', id: d.id });
    for (const s of kids(holder, 'PlainTextSelection')) {
      const start = crlfAdjust(fromCp(Number(s.getAttribute('startPosition') ?? 0)));
      const end = crlfAdjust(fromCp(Number(s.getAttribute('endPosition') ?? 0)));
      if (!(end > start)) continue;
      const codeIds = kids(s, 'Coding').map((c) => guidMap.get(kid(c, 'CodeRef')?.getAttribute('targetGUID') ?? '')).filter((r) => r?.kind === 'code').map((r) => r!.id);
      const q: Quotation = { id: uid(), docId: d.id, start, end, codeIds: [...new Set(codeIds)], comment: textOf(kid(s, 'Description')), createdAt: s.getAttribute('creationDateTime') || new Date().toISOString() };
      p.quotations.push(q);
      guidMap.set(s.getAttribute('guid') ?? q.id, { kind: 'quotation', id: q.id });
      collectNoteRefs(s, { kind: 'quotation', id: q.id });
    }
  }
  if (skipped) warnings.push(`Se omitieron ${skipped} fuente(s) de imagen, audio o video: esta versión de Glosa sólo trabaja con texto.`);

  // Notas → memos
  for (const n of kids(kid(root, 'Notes'), 'Note')) {
    const m: Memo = { id: uid(), title: n.getAttribute('name') || 'Memo', content: textOf(kid(n, 'PlainTextContent')), type: 'analítico', links: [], createdAt: n.getAttribute('creationDateTime') || new Date().toISOString(), modifiedAt: n.getAttribute('modifiedDateTime') || new Date().toISOString() };
    p.memos.push(m);
    guidMap.set(n.getAttribute('guid') ?? m.id, { kind: 'memo', id: m.id });
  }
  for (const { owner, note } of pendingNoteRefs) {
    const r = guidMap.get(note);
    if (r?.kind === 'memo') p.memos.find((m) => m.id === r.id)!.links.push(owner);
  }

  // Vínculos
  const rels: Relation[] = defaultRelations();
  const relByName = new Map(rels.map((r) => [r.name.toLowerCase(), r]));
  const linkGuid = new Map<string, Link>();
  for (const l of kids(kid(root, 'Links'), 'Link')) {
    const s = guidMap.get(l.getAttribute('originGUID') ?? ''), t = guidMap.get(l.getAttribute('targetGUID') ?? '');
    if (!s || !t) continue;
    const name = (l.getAttribute('name') || 'está asociado con').trim();
    let r = relByName.get(name.toLowerCase());
    if (!r) {
      r = { id: uid(), name, symmetric: l.getAttribute('direction') !== 'OneWay', color: normColor(l.getAttribute('color'), rels.map((x) => x.color)), dashed: false };
      rels.push(r); relByName.set(name.toLowerCase(), r);
    }
    const link: Link = { id: uid(), source: s, target: t, relationId: r.id };
    p.links.push(link);
    linkGuid.set(l.getAttribute('guid') ?? link.id, link);
  }
  p.relations = rels;

  // Conjuntos de documentos
  for (const s of kids(kid(root, 'Sets'), 'Set')) {
    const members = kids(s, 'MemberSource').map((m) => guidMap.get(m.getAttribute('targetGUID') ?? '')).filter((r) => r?.kind === 'document');
    const codeMembers = kids(s, 'MemberCode').map((m) => guidMap.get(m.getAttribute('targetGUID') ?? '')).filter((r) => r?.kind === 'code');
    if (members.length) {
      const g = { id: uid(), name: s.getAttribute('name') || 'Grupo', color: '#64748b', comment: textOf(kid(s, 'Description')) };
      p.documentGroups.push(g);
      members.forEach((r) => p.documents.find((d) => d.id === r!.id)!.groupIds.push(g.id));
    }
    if (codeMembers.length) {
      const g = { id: uid(), name: s.getAttribute('name') || 'Grupo', color: '#64748b', comment: '' };
      p.codeGroups.push(g);
      codeMembers.forEach((r) => p.codes.find((c) => c.id === r!.id)!.groupIds.push(g.id));
    }
  }

  // Redes
  for (const g of kids(kid(root, 'Graphs'), 'Graph')) {
    const nodes = kids(g, 'Vertex').map((v) => ({ ref: guidMap.get(v.getAttribute('representedGUID') ?? ''), x: Number(v.getAttribute('firstX') ?? 0), y: Number(v.getAttribute('firstY') ?? 0) }))
      .filter((n): n is { ref: EntityRef; x: number; y: number } => !!n.ref);
    if (nodes.length) p.networks.push({ id: uid(), name: g.getAttribute('name') || 'Red', description: '', nodes, createdAt: new Date().toISOString() });
  }

  return { project: normalizeProject(p), warnings };
}
