// Exportaciones en formatos abiertos y de uso común: XLSX, CSV, DOCX, Markdown, GraphML.

import { codeDensity, codeFrequency, type Table } from './analysis';
import { entityName, pageOf, quotationNumber } from './model';
import type { Network, ProjectData, Quotation } from './types';
import { parseMarkdown, type Inline } from './markdown';

const fmtDate = (s: string) => new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function quotationRows(p: ProjectData, quotes: Quotation[] = p.quotations) {
  const docs = new Map(p.documents.map((d) => [d.id, d]));
  const codes = new Map(p.codes.map((c) => [c.id, c]));
  const dgroups = new Map(p.documentGroups.map((g) => [g.id, g.name]));
  return [...quotes]
    .sort((a, b) => p.documents.findIndex((d) => d.id === a.docId) - p.documents.findIndex((d) => d.id === b.docId) || a.start - b.start)
    .map((q) => {
      const d = docs.get(q.docId)!;
      return {
        ID: quotationNumber(p, q),
        Documento: d.name,
        'Grupos de documentos': d.groupIds.map((g) => dgroups.get(g)).filter(Boolean).join('; '),
        Página: pageOf(d, q.start) ?? '',
        Inicio: q.start,
        Fin: q.end,
        Cita: d.text.slice(q.start, q.end),
        Códigos: q.codeIds.map((c) => codes.get(c)?.name).filter(Boolean).join('; '),
        Comentario: q.comment,
        Memos: p.memos.filter((m) => m.links.some((l) => l.kind === 'quotation' && l.id === q.id)).map((m) => m.title).join('; '),
        Creada: fmtDate(q.createdAt),
      };
    });
}

export function codebookRows(p: ProjectData) {
  const freq = codeFrequency(p);
  const dens = codeDensity(p);
  const groups = new Map(p.codeGroups.map((g) => [g.id, g.name]));
  const byId = new Map(p.codes.map((c) => [c.id, c]));
  const path = (id: string): string => { const c = byId.get(id)!; return c.parentId && byId.has(c.parentId) ? path(c.parentId) + ' › ' + c.name : c.name; };
  return [...p.codes].sort((a, b) => path(a.id).localeCompare(path(b.id), 'es')).map((c) => ({
    Código: c.name,
    Ruta: path(c.id),
    Descripción: c.description,
    Grupos: c.groupIds.map((g) => groups.get(g)).filter(Boolean).join('; '),
    Frecuencia: freq.get(c.id) ?? 0,
    Densidad: dens.get(c.id) ?? 0,
    Color: c.color,
  }));
}

export function memoRows(p: ProjectData) {
  return p.memos.map((m) => ({
    Título: m.title,
    Tipo: m.type,
    Contenido: m.content,
    'Vinculado a': m.links.map((l) => entityName(p, l)).join('; '),
    Creado: fmtDate(m.createdAt),
    Modificado: fmtDate(m.modifiedAt),
  }));
}

export function tableRows(t: Table, cornerLabel: string, opts: { totals?: boolean; format?: (v: number, r: number, c: number) => number | string } = {}) {
  const f = opts.format ?? ((v) => v);
  const rows: Record<string, string | number>[] = t.rows.map((r, ri) => {
    const o: Record<string, string | number> = { [cornerLabel]: r.name };
    t.cols.forEach((c, ci) => { o[c.name] = f(t.values[ri][ci], ri, ci); });
    if (opts.totals) o['Total'] = t.rowTotals[ri];
    return o;
  });
  if (opts.totals) {
    const o: Record<string, string | number> = { [cornerLabel]: 'Total' };
    t.cols.forEach((c, ci) => { o[c.name] = t.colTotals[ci]; });
    o['Total'] = t.total;
    rows.push(o);
  }
  return rows;
}

// ---------------------------------------------------------------- CSV

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n;\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // BOM para que Excel reconozca UTF-8 (acentos) al abrir el CSV.
  return '﻿' + [headers.map(cell).join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n');
}

// ---------------------------------------------------------------- XLSX

export interface Sheet { name: string; rows: Record<string, unknown>[]; widths?: Record<string, number>; heat?: boolean }

export async function toXlsx(sheets: Sheet[]): Promise<Uint8Array> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Glosa';
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja');
    const headers = s.rows.length ? Object.keys(s.rows[0]) : ['(sin datos)'];
    ws.columns = headers.map((h) => ({ header: h, key: h, width: s.widths?.[h] ?? Math.min(60, Math.max(10, h.length + 2, ...s.rows.slice(0, 200).map((r) => Math.min(60, String(r[h] ?? '').length + 2)))) }));
    s.rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    ws.views = [{ state: 'frozen', xSplit: s.heat ? 1 : 0, ySplit: 1 }];
    ws.eachRow((row: any, i: number) => { if (i > 1) row.alignment = { vertical: 'top', wrapText: true }; });
    if (s.heat && s.rows.length) {
      const nums = s.rows.flatMap((r) => headers.slice(1).filter((h) => h !== 'Total').map((h) => Number(r[h]) || 0));
      const max = Math.max(1, ...nums);
      ws.eachRow((row: any, i: number) => {
        if (i === 1 || String(row.getCell(1).value) === 'Total') return;
        headers.forEach((h, ci) => {
          if (ci === 0 || h === 'Total') return;
          const v = Number(row.getCell(ci + 1).value) || 0;
          if (!v) return;
          row.getCell(ci + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + blend('2563eb', v / max) } };
        });
      });
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

function blend(hex: string, t: number) {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const k = 0.12 + t * 0.6;
  return c.map((v) => Math.round(255 + (v - 255) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function projectSheets(p: ProjectData): Sheet[] {
  return [
    { name: 'Citas', rows: quotationRows(p), widths: { Cita: 70, Comentario: 40 } },
    { name: 'Códigos', rows: codebookRows(p), widths: { Descripción: 50 } },
    { name: 'Memos', rows: memoRows(p), widths: { Contenido: 80 } },
    { name: 'Documentos', rows: p.documents.map((d) => ({ Documento: d.name, Tipo: d.kind.toUpperCase(), Grupos: d.groupIds.map((g) => p.documentGroups.find((x) => x.id === g)?.name).join('; '), Palabras: (d.text.match(/[\p{L}\p{N}]+/gu) ?? []).length, Citas: p.quotations.filter((q) => q.docId === d.id).length, Comentario: d.comment })) },
  ];
}

// ---------------------------------------------------------------- Markdown

export function memosMarkdown(p: ProjectData): string {
  const out = [`# Memos — ${p.name}`, ''];
  for (const m of [...p.memos].sort((a, b) => a.title.localeCompare(b.title, 'es'))) {
    out.push(`## ${m.title}`, '', `*Tipo:* ${m.type} · *Modificado:* ${fmtDate(m.modifiedAt)}`);
    if (m.links.length) out.push('', '*Vinculado a:* ' + m.links.map((l) => entityName(p, l)).join('; '));
    out.push('', m.content || '_(sin contenido)_', '');
  }
  return out.join('\n');
}

export function codebookMarkdown(p: ProjectData): string {
  const freq = codeFrequency(p);
  const out = [`# Libro de códigos — ${p.name}`, ''];
  const walk = (parent: string | undefined, depth: number) => {
    for (const c of p.codes.filter((x) => x.parentId === parent).sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
      out.push(`${'  '.repeat(depth)}- **${c.name}** (${freq.get(c.id) ?? 0})${c.description ? ': ' + c.description.replace(/\n+/g, ' ') : ''}`);
      walk(c.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out.join('\n');
}

// ---------------------------------------------------------------- GraphML

export function networkGraphml(p: ProjectData, n: Network): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const key = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;
  const on = new Set(n.nodes.map((x) => key(x.ref)));
  const nodes = n.nodes.map((x) => {
    const color = x.ref.kind === 'code' ? p.codes.find((c) => c.id === x.ref.id)?.color ?? '' : '';
    return `    <node id="${esc(key(x.ref))}"><data key="label">${esc(entityName(p, x.ref))}</data><data key="type">${x.ref.kind}</data><data key="color">${color}</data><data key="x">${Math.round(x.x)}</data><data key="y">${Math.round(x.y)}</data></node>`;
  });
  const edges = p.links.filter((l) => on.has(key(l.source)) && on.has(key(l.target))).map((l) => {
    const r = p.relations.find((x) => x.id === l.relationId);
    return `    <edge id="${l.id}" source="${esc(key(l.source))}" target="${esc(key(l.target))}"><data key="relation">${esc(r?.name ?? '')}</data></edge>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="type" for="node" attr.name="tipo" attr.type="string"/>
  <key id="color" for="node" attr.name="color" attr.type="string"/>
  <key id="x" for="node" attr.name="x" attr.type="double"/>
  <key id="y" for="node" attr.name="y" attr.type="double"/>
  <key id="relation" for="edge" attr.name="relación" attr.type="string"/>
  <graph id="${esc(n.name)}" edgedefault="directed">
${[...nodes, ...edges].join('\n')}
  </graph>
</graphml>`;
}

// ---------------------------------------------------------------- DOCX

export async function reportDocx(p: ProjectData, opts: { codeIds?: string[]; includeMemos?: boolean; includeQuotes?: boolean } = {}): Promise<Uint8Array> {
  const d: any = await import('docx');
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, BorderStyle } = d;
  const freq = codeFrequency(p);
  const codes = (opts.codeIds ? p.codes.filter((c) => opts.codeIds!.includes(c.id)) : p.codes).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const docs = new Map(p.documents.map((x) => [x.id, x]));
  const children: any[] = [
    new Paragraph({ text: p.name, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Reporte generado con Glosa el ${new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}`, italics: true, color: '666666' })] }),
  ];
  if (p.description) children.push(new Paragraph({ text: p.description, spacing: { before: 200 } }));
  children.push(new Paragraph({ text: 'Resumen', heading: HeadingLevel.HEADING_1 }));
  children.push(new Paragraph({ text: `${p.documents.length} documentos · ${p.codes.length} códigos · ${p.quotations.length} citas · ${p.memos.length} memos` }));

  children.push(new Paragraph({ text: 'Libro de códigos', heading: HeadingLevel.HEADING_1 }));
  for (const c of codes) {
    children.push(new Paragraph({ children: [new TextRun({ text: '■ ', color: c.color.replace('#', '') }), new TextRun({ text: c.name, bold: true }), new TextRun({ text: `  (${freq.get(c.id) ?? 0} citas)`, color: '666666' })] }));
    if (c.description) children.push(new Paragraph({ text: c.description, indent: { left: 360 } }));
  }

  if (opts.includeQuotes !== false) {
    children.push(new Paragraph({ text: 'Citas por código', heading: HeadingLevel.HEADING_1 }));
    for (const c of codes) {
      const qs = p.quotations.filter((q) => q.codeIds.includes(c.id));
      if (!qs.length) continue;
      children.push(new Paragraph({ children: [new TextRun({ text: c.name, color: c.color.replace('#', '') })], heading: HeadingLevel.HEADING_2 }));
      for (const q of qs) {
        const doc = docs.get(q.docId)!;
        const page = pageOf(doc, q.start);
        children.push(new Paragraph({ children: [new TextRun({ text: `${quotationNumber(p, q)} · ${doc.name}${page ? ` · p. ${page}` : ''}`, bold: true, size: 18, color: '555555' })], spacing: { before: 160 } }));
        children.push(new Paragraph({
          children: [new TextRun({ text: doc.text.slice(q.start, q.end), italics: true })],
          indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: c.color.replace('#', ''), space: 8 } },
        }));
        if (q.comment) children.push(new Paragraph({ children: [new TextRun({ text: 'Comentario: ', bold: true }), new TextRun(q.comment)], indent: { left: 360 } }));
      }
    }
  }

  if (opts.includeMemos !== false && p.memos.length) {
    children.push(new Paragraph({ text: 'Memos', heading: HeadingLevel.HEADING_1 }));
    for (const m of p.memos) {
      children.push(new Paragraph({ text: m.title, heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ children: [new TextRun({ text: `${m.type} · ${fmtDate(m.modifiedAt)}`, italics: true, color: '666666', size: 18 })] }));
      children.push(...markdownToDocx(d, m.content || ''));
    }
  }
  const doc = new Document({
    creator: p.author || 'Glosa', title: p.name,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: {}, children }],
  });
  const blob: Blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Convierte el Markdown ligero de un memo en párrafos de Word con formato. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function markdownToDocx(d: any, md: string): any[] {
  const { Paragraph, TextRun, HeadingLevel, BorderStyle } = d;
  const runs = (c: Inline[], f: { bold?: boolean; italics?: boolean; strike?: boolean } = {}): any[] => c.flatMap((x) => {
    if (x.t === 'text') return [new TextRun({ text: x.v, ...f })];
    if (x.t === 'code') return [new TextRun({ text: x.v, font: 'Consolas', ...f })];
    if (x.t === 'q') return [new TextRun({ text: `«${x.v}»`, ...f, italics: true })];
    if (x.t === 'b') return runs(x.c, { ...f, bold: true });
    if (x.t === 'i') return runs(x.c, { ...f, italics: true });
    return runs(x.c, { ...f, strike: true });
  });
  const lines = (ls: Inline[][], f = {}) => ls.flatMap((l, i) => (i ? [new TextRun({ text: '', break: 1 }), ...runs(l, f)] : runs(l, f)));
  const out: any[] = [];
  for (const b of parseMarkdown(md)) {
    if (b.t === 'h') out.push(new Paragraph({ children: runs(b.c), heading: [HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5][b.level - 1] }));
    else if (b.t === 'p') out.push(new Paragraph({ children: lines(b.lines), spacing: { after: 120 } }));
    else if (b.t === 'quote') out.push(new Paragraph({ children: lines(b.lines, { italics: true }), indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } } }));
    else if (b.t === 'hr') out.push(new Paragraph({ text: '', border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } } }));
    else {
      const counters = [0, 0, 0, 0, 0];
      for (const it of b.items) {
        if (b.ordered) {
          counters[it.level]++;
          for (let k = it.level + 1; k < counters.length; k++) counters[k] = 0;
          const n = it.level === 0 ? b.start - 1 + counters[0] : counters[it.level];
          out.push(new Paragraph({ children: [new TextRun({ text: `${n}.\t` }), ...runs(it.c)], indent: { left: 360 + it.level * 360, hanging: 360 } }));
        } else out.push(new Paragraph({ children: runs(it.c), bullet: { level: it.level } }));
      }
    }
  }
  return out;
}
