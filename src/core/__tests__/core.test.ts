// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { codeDocumentTable, cooccurrence, evalQuery, expandRange, wordFrequencies } from '../analysis';
import { emptyProject, makeCode, makeDoc, makeQuotation, normalizeProject } from '../model';
import { deserializeProject, serializeProject } from '../projectFile';
import { exportCodebookQdc, exportQdpx, importRefi } from '../qdpx';
import { sampleProject } from '../sample';
import { importFile } from '../importers';
import { codebookMarkdown, networkGraphml, quotationRows, toCsv } from '../exporters';

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('proyecto de ejemplo', () => {
  it('se construye y es consistente', () => {
    const p = sampleProject();
    expect(p.documents).toHaveLength(3);
    expect(p.quotations.length).toBeGreaterThan(15);
    expect(normalizeProject(JSON.parse(JSON.stringify(p))).quotations).toHaveLength(p.quotations.length);
  });
});

describe('formato .glosa', () => {
  it('ida y vuelta sin pérdida', async () => {
    const p = sampleProject();
    const back = await deserializeProject(await serializeProject(p));
    expect(back).toEqual(p);
  });
  it('rechaza archivos no válidos con mensaje claro', async () => {
    await expect(deserializeProject(new TextEncoder().encode('hola'))).rejects.toThrow(/no es un proyecto/);
  });
});

describe('normalizeProject', () => {
  it('descarta referencias rotas y recorta citas fuera de rango', () => {
    const p = emptyProject();
    const d = makeDoc('a', 'text', 'Hola mundo');
    p.documents.push(d);
    p.quotations.push({ ...makeQuotation(d.id, 5, 999, ['nope']) });
    p.quotations.push(makeQuotation('missing', 0, 3));
    const n = normalizeProject(p);
    expect(n.quotations).toHaveLength(1);
    expect(n.quotations[0].end).toBe(d.text.length);
    expect(n.quotations[0].codeIds).toEqual([]);
  });
});

describe('REFI-QDA', () => {
  it('exporta e importa conservando citas, códigos, memos, vínculos y redes', async () => {
    const p = sampleProject();
    const { project: back, warnings } = await importRefi(buf(await exportQdpx(p)), 'x.qdpx');
    expect(warnings).toEqual([]);
    expect(back.documents.map((d) => d.text)).toEqual(p.documents.map((d) => d.text));
    expect(back.codes.map((c) => c.name).sort()).toEqual(p.codes.map((c) => c.name).sort());
    expect(back.codes.find((c) => c.name === 'Conectividad')?.parentId).toBe(back.codes.find((c) => c.name === 'Barreras tecnológicas')?.id);
    const texts = (pp: typeof p) => pp.quotations.map((q) => pp.documents.find((d) => d.id === q.docId)!.text.slice(q.start, q.end)).sort();
    expect(texts(back)).toEqual(texts(p));
    expect(back.memos).toHaveLength(p.memos.length);
    expect(back.memos.find((m) => m.title.startsWith('Las redes'))!.links).toHaveLength(2);
    expect(back.links).toHaveLength(p.links.length);
    expect(back.networks[0].nodes).toHaveLength(p.networks[0].nodes.length);
    expect(back.documentGroups.map((g) => g.name).sort()).toEqual(p.documentGroups.map((g) => g.name).sort());
    expect(back.codeGroups.map((g) => g.name).sort()).toEqual(p.codeGroups.map((g) => g.name).sort());
  });

  it('convierte posiciones con emojis y \\r\\n correctamente', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><Project xmlns="urn:QDA-XML:project:1.0" name="T"><CodeBook><Codes><Code guid="11111111-1111-4111-a111-111111111111" name="C" isCodable="true"/></Codes></CodeBook><Sources><TextSource guid="22222222-2222-4222-a222-222222222222" name="Doc"><PlainTextContent>😀 a&#13;\nbola</PlainTextContent><PlainTextSelection guid="33333333-3333-4333-a333-333333333333" startPosition="5" endPosition="9"><Coding guid="44444444-4444-4444-a444-444444444444"><CodeRef targetGUID="11111111-1111-4111-a111-111111111111"/></Coding></PlainTextSelection></TextSource></Sources></Project>`;
    const JSZip = (await import('jszip')).default;
    const z = new JSZip();
    z.file('project.qde', xml);
    const { project } = await importRefi(buf(await z.generateAsync({ type: 'uint8array' })), 't.qdpx');
    const q = project.quotations[0];
    expect(project.documents[0].text.slice(q.start, q.end)).toBe('bola');
    expect(q.codeIds).toHaveLength(1);
  });

  it('genera un libro de códigos .qdc válido', async () => {
    const qdc = exportCodebookQdc(sampleProject());
    const { project } = await importRefi(new TextEncoder().encode(qdc).buffer as ArrayBuffer, 'libro.qdc');
    expect(project.codes).toHaveLength(12);
  });
});

describe('análisis', () => {
  const p = emptyProject();
  const d = makeDoc('d', 'text', 'uno dos tres cuatro cinco seis');
  const a = makeCode('A', '#000000'), b = makeCode('B', '#000000'), c = makeCode('C', '#000000');
  p.documents.push(d); p.codes.push(a, b, c);
  p.quotations.push(makeQuotation(d.id, 0, 7, [a.id, b.id]), makeQuotation(d.id, 4, 12, [c.id]), makeQuotation(d.id, 20, 25, [a.id]));

  it('co-ocurrencia por misma cita y por solapamiento', () => {
    const { counts, coef } = cooccurrence(p, [a.id, b.id, c.id]);
    expect(counts[0][1]).toBe(1); // A-B misma cita
    expect(counts[0][2]).toBe(1); // A-C solapan
    expect(counts[1][2]).toBe(1);
    expect(coef[0][1]).toBeCloseTo(1 / (2 + 1 - 1));
  });
  it('tabla código-documento', () => {
    const t = codeDocumentTable(p, [a.id, b.id], [{ id: d.id, name: 'd', docIds: [d.id] }]);
    expect(t.values).toEqual([[2], [1]]);
    expect(t.total).toBe(3);
  });
  it('suma subcódigos al padre sólo si se pide', () => {
    const q = { ...p, codes: p.codes.map((x) => (x.id === b.id ? { ...x, parentId: a.id } : x)) };
    expect(codeDocumentTable(q, [a.id], [{ id: d.id, name: 'd', docIds: [d.id] }]).values).toEqual([[2]]);
    // La primera cita tiene A y B (hijo de A): cuenta una sola vez para A.
    expect(codeDocumentTable(q, [a.id], [{ id: d.id, name: 'd', docIds: [d.id] }], 'count', true).values).toEqual([[2]]);
    const r = { ...q, quotations: [...q.quotations, makeQuotation(d.id, 26, 30, [b.id])] };
    expect(codeDocumentTable(r, [a.id], [{ id: d.id, name: 'd', docIds: [d.id] }], 'count', true).values).toEqual([[3]]);
  });
  it('consultas booleanas', () => {
    expect(evalQuery(p, { op: 'and', items: [{ op: 'code', codeId: a.id }, { op: 'not', item: { op: 'code', codeId: b.id } }] })).toHaveLength(1);
    expect(evalQuery(p, { op: 'or', items: [{ op: 'code', codeId: b.id }, { op: 'code', codeId: c.id }] })).toHaveLength(2);
  });
  it('frecuencia de palabras ignora palabras vacías', () => {
    const f = wordFrequencies(['La casa y la casa de los perros']);
    expect(f[0]).toEqual(['casa', 2]);
    expect(f.find(([w]) => w === 'los')).toBeUndefined();
  });
  it('expande a oración y párrafo', () => {
    const t = 'Primera oración. Segunda oración aquí.\nOtro párrafo.';
    expect(t.slice(...Object.values(expandRange(t, 20, 22, 'sentence')) as [number, number])).toBe('Segunda oración aquí.');
    expect(t.slice(...Object.values(expandRange(t, 2, 3, 'paragraph')) as [number, number])).toBe('Primera oración. Segunda oración aquí.');
  });
});

describe('importadores', () => {
  it('texto plano en Windows-1252', async () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x6d, 0x69, 0xf3, 0x6e]); // "camión" en cp1252
    const d = await importFile({ name: 'a.txt', data: bytes.buffer });
    expect(d.text).toBe('camión');
  });
  it('markdown con títulos', async () => {
    const d = await importFile({ name: 'n.md', data: new TextEncoder().encode('# Título\n\nTexto **fuerte** y [enlace](http://x).').buffer as ArrayBuffer });
    expect(d.text).toBe('Título\n\nTexto fuerte y enlace.');
    expect(d.headings).toEqual([{ start: 0, end: 6, level: 1 }]);
  });
  it('html', async () => {
    const d = await importFile({ name: 'p.html', data: new TextEncoder().encode('<h2>A</h2><p>uno <b>dos</b></p><ul><li>x</li></ul>').buffer as ArrayBuffer });
    expect(d.text).toBe('A\n\nuno dos\n\n• x');
  });
  it('rtf', async () => {
    const d = await importFile({ name: 'p.rtf', data: new TextEncoder().encode("{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Hola cami\\'f3n\\par Adi\\u243?s}").buffer as ArrayBuffer });
    expect(d.text).toBe('Hola camión\n\nAdiós');
  });
});

describe('exportadores', () => {
  it('CSV, Markdown y GraphML', () => {
    const p = sampleProject();
    const csv = toCsv(quotationRows(p));
    expect(csv.startsWith('﻿ID,Documento')).toBe(true);
    expect(codebookMarkdown(p)).toContain('  - **Conectividad**');
    expect(networkGraphml(p, p.networks[0])).toContain('<edge');
  });
});

describe('disposición de redes (1.1)', () => {
  const overlaps = (bs: { x: number; y: number; w: number; h: number }[]) => {
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return true;
    }
    return false;
  };
  it('separa nodos encimados sin mover los fijos', async () => {
    const { resolveOverlaps } = await import('../layout');
    const bs = [{ k: 'a', x: 0, y: 0, w: 200, h: 60 }, { k: 'b', x: 10, y: 10, w: 200, h: 60 }, { k: 'c', x: 20, y: 5, w: 300, h: 100 }];
    resolveOverlaps(bs, new Set(['a']));
    expect(bs[0]).toMatchObject({ x: 0, y: 0 });
    expect(overlaps(bs)).toBe(false);
  });
  it('organiza una red sin encimar nodos y de forma determinista', async () => {
    const { forceLayout } = await import('../layout');
    const mk = () => Array.from({ length: 14 }, (_, i) => ({ k: 'n' + i, x: 0, y: 0, w: i % 3 ? 170 : 300, h: i % 3 ? 60 : 110 }));
    const links: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [5, 6], [7, 8]];
    const a = forceLayout(mk(), links), b = forceLayout(mk(), links);
    expect(overlaps(a)).toBe(false);
    expect(a).toEqual(b);
    expect(a.every((x) => Number.isFinite(x.x) && Number.isFinite(x.y))).toBe(true);
  });
});

describe('markdown de memos (1.1)', () => {
  it('reconoce títulos, listas, citas y formato en línea', async () => {
    const { parseMarkdown, inlineText } = await import('../markdown');
    const b = parseMarkdown('# Hallazgos\nTexto con **negritas** y *cursivas*.\n- uno\n- dos\n  - anidado\n1. primero\n2. segundo\n> cita\n---\n## Sub');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'list', 'list', 'quote', 'hr', 'h']);
    const p = b[1] as Extract<typeof b[number], { t: 'p' }>;
    expect(p.lines[0].map((x) => x.t)).toEqual(['text', 'b', 'text', 'i', 'text']);
    const l = b[2] as Extract<typeof b[number], { t: 'list' }>;
    expect(l.items.map((x) => x.level)).toEqual([0, 0, 1]);
    expect((b[3] as { ordered: boolean }).ordered).toBe(true);
    expect(inlineText(p.lines[0])).toBe('Texto con negritas y cursivas.');
  });
  it('no confunde guiones bajos dentro de palabras', async () => {
    const { parseInline } = await import('../markdown');
    expect(parseInline('archivo_de_datos.csv').map((x) => x.t)).toEqual(['text']);
  });
});

describe('reporte Word con memos con formato (1.1)', () => {
  it('convierte el markdown del memo en estilos de Word, sin símbolos sueltos', async () => {
    const { reportDocx } = await import('../exporters');
    const JSZip = (await import('jszip')).default;
    const p = sampleProject();
    p.memos[0].content = '## Hallazgo\nTexto con **negritas** y *cursivas*.\n\n- uno\n- dos\n\n1. primero';
    const bytes = await reportDocx(p, { includeQuotes: false });
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
    expect(xml).toContain('negritas');
    expect(xml).not.toContain('**negritas**');
    expect(xml).not.toContain('## Hallazgo');
    expect(xml).toMatch(/<w:b\/>/);
    expect(xml).toMatch(/<w:numPr>/); // viñetas reales de Word
  });
});
