import JSZip from 'jszip';
import { makeDoc, normalizeText } from './model';
import type { Doc, DocKind } from './types';

export const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx', '.pdf', '.html', '.htm', '.rtf', '.odt'];

export function kindFromName(name: string): DocKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'txt': return 'text';
    case 'md': case 'markdown': return 'markdown';
    case 'docx': return 'docx';
    case 'pdf': return 'pdf';
    case 'html': case 'htm': return 'html';
    case 'rtf': return 'rtf';
    case 'odt': return 'odt';
    default: return null;
  }
}

export interface ImportInput {
  name: string;
  data: ArrayBuffer;
}

interface Built { text: string; headings: { start: number; end: number; level: number }[]; pageStarts?: number[] }

/** Constructor incremental de texto: recuerda títulos y evita saltos dobles. */
class TextBuilder {
  parts: string[] = [];
  len = 0;
  headings: Built['headings'] = [];
  pageStarts: number[] = [];
  private push(s: string) { this.parts.push(s); this.len += s.length; }
  block(text: string, heading = 0) {
    const t = text.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (!t) return;
    if (this.len > 0) this.push('\n\n');
    const start = this.len;
    this.push(t);
    if (heading) this.headings.push({ start, end: this.len, level: heading });
  }
  page() { this.pageStarts.push(this.len === 0 ? 0 : this.len + 2); }
  build(): Built { return { text: this.parts.join(''), headings: this.headings, pageStarts: this.pageStarts.length ? this.pageStarts : undefined }; }
}

function decodeText(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    // Archivos antiguos de Windows suelen venir en Latin-1 / Windows-1252.
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function walkHtml(root: Element | Document, b: TextBuilder) {
  const blockTags = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TR', 'DT', 'DD', 'SECTION', 'ARTICLE', 'CAPTION', 'FIGCAPTION']);
  const visit = (el: Element) => {
    const tag = el.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HEAD' || tag === 'NOSCRIPT') return;
    const h = /^H([1-6])$/.exec(tag);
    if (h) { b.block(inlineText(el), Number(h[1])); return; }
    if (tag === 'TR') { b.block([...el.children].map((c) => inlineText(c).trim()).join(' | ')); return; }
    const hasBlockChild = [...el.children].some((c) => blockTags.has(c.tagName.toUpperCase()) || /^H[1-6]$/.test(c.tagName.toUpperCase()) || ['UL', 'OL', 'TABLE', 'TBODY', 'THEAD'].includes(c.tagName.toUpperCase()));
    if (blockTags.has(tag) && !hasBlockChild) {
      const prefix = tag === 'LI' ? '• ' : '';
      b.block(prefix + inlineText(el));
      return;
    }
    for (const c of el.children) visit(c);
  };
  const body = root instanceof Document ? root.body ?? root.documentElement : root;
  if (body) visit(body);
}

function inlineText(el: Element): string {
  let s = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) s += n.textContent;
    else if (n.nodeType === 1) {
      const e = n as Element;
      if (e.tagName.toUpperCase() === 'BR') s += '\n';
      else s += inlineText(e);
    }
  });
  return s;
}

async function fromDocx(data: ArrayBuffer): Promise<Built> {
  const mammoth: any = await import('mammoth');
  const res = await (mammoth.convertToHtml ?? mammoth.default.convertToHtml)({ arrayBuffer: data });
  const doc = new DOMParser().parseFromString(`<body>${res.value}</body>`, 'text/html');
  const b = new TextBuilder();
  walkHtml(doc, b);
  return b.build();
}

function fromHtml(data: ArrayBuffer): Built {
  const doc = new DOMParser().parseFromString(decodeText(data), 'text/html');
  const b = new TextBuilder();
  walkHtml(doc, b);
  return b.build();
}

function fromMarkdown(data: ArrayBuffer): Built {
  const b = new TextBuilder();
  const src = decodeText(data).replace(/\r\n?/g, '\n');
  const clean = (s: string) => s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');
  for (const para of src.split(/\n\s*\n/)) {
    const lines = para.split('\n');
    let buf: string[] = [];
    const flush = () => { if (buf.length) b.block(clean(buf.join(' '))); buf = []; };
    for (const line of lines) {
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { flush(); b.block(clean(h[2].replace(/#+\s*$/, '')), h[1].length); }
      else if (/^\s*([-*+]|\d+\.)\s+/.test(line)) { flush(); b.block('• ' + clean(line.replace(/^\s*([-*+]|\d+\.)\s+/, ''))); }
      else if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) flush();
      else buf.push(line.replace(/^>\s?/, ''));
    }
    flush();
  }
  return b.build();
}

function fromPlain(data: ArrayBuffer): Built {
  return { text: normalizeText(decodeText(data)), headings: [] };
}

function fromRtf(data: ArrayBuffer): Built {
  const src = new TextDecoder('latin1').decode(data);
  let out = '';
  let depth = 0;
  const skipAt: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { if (skipAt.length && skipAt[skipAt.length - 1] === depth) skipAt.pop(); depth--; continue; }
    const skipping = skipAt.length > 0;
    if (ch === '\\') {
      const next = src[i + 1];
      if (next === '\\' || next === '{' || next === '}') { if (!skipping) out += next; i++; continue; }
      if (next === "'") { if (!skipping) out += String.fromCharCode(parseInt(src.substr(i + 2, 2), 16)); i += 3; continue; }
      if (next === '*') { skipAt.push(depth); i++; continue; }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
      if (m) {
        const w = m[1];
        if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer'].includes(w)) skipAt.push(depth);
        else if (!skipping) {
          if (w === 'par' || w === 'line') out += '\n';
          else if (w === 'tab') out += '\t';
          else if (w === 'u' && m[2]) { out += String.fromCharCode(Number(m[2]) < 0 ? Number(m[2]) + 65536 : Number(m[2])); i += m[0].length; if (src[i] === '?') i++; i--; continue; }
        }
        i += m[0].length - 1;
        continue;
      }
      continue;
    }
    if (!skipping && ch !== '\r' && ch !== '\n') out += ch;
  }
  const b = new TextBuilder();
  out.split(/\n+/).forEach((p) => b.block(p));
  return b.build();
}

async function fromOdt(data: ArrayBuffer): Promise<Built> {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file('content.xml')?.async('string');
  if (!xml) throw new Error('El archivo ODT no tiene contenido.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const b = new TextBuilder();
  const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
  const inline = (el: Element): string => {
    let s = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.nodeType === 1) {
        const e = n as Element;
        if (e.localName === 's') s += ' '.repeat(Number(e.getAttributeNS(TEXT_NS, 'c') ?? 1) || 1);
        else if (e.localName === 'tab') s += '\t';
        else if (e.localName === 'line-break') s += '\n';
        else if (e.localName !== 'note') s += inline(e);
      }
    });
    return s;
  };
  const visit = (el: Element) => {
    if (el.localName === 'h') b.block(inline(el), Number(el.getAttributeNS(TEXT_NS, 'outline-level') ?? 1) || 1);
    else if (el.localName === 'p') b.block(inline(el));
    else for (const c of el.children) visit(c);
  };
  visit(doc.documentElement);
  return b.build();
}

async function fromPdf(data: ArrayBuffer): Promise<Built> {
  const pdfjs: any = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
  const b = new TextBuilder();
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    b.page();
    // Agrupar en líneas por coordenada Y y luego en párrafos por separación vertical.
    const lines: { y: number; h: number; text: string }[] = [];
    let cur: { y: number; h: number; text: string } | null = null;
    for (const it of content.items as any[]) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform[5];
      const h = Math.abs(it.transform[3]) || it.height || 10;
      if (!cur || Math.abs(cur.y - y) > h * 0.5) {
        if (cur) lines.push(cur);
        cur = { y, h, text: it.str };
      } else {
        cur.text += it.str;
      }
      if (it.hasEOL && cur) { lines.push(cur); cur = null; }
    }
    if (cur) lines.push(cur);
    const nonEmpty = lines.filter((l) => l.text.trim());
    const gaps = nonEmpty.slice(1).map((l, i) => Math.abs(nonEmpty[i].y - l.y)).filter((g) => g > 0).sort((a, b) => a - b);
    // Interlineado típico: percentil bajo, para que los saltos de párrafo no lo inflen.
    const typical = gaps.length ? gaps[Math.floor(gaps.length * 0.3)] : 14;
    let para = '';
    for (let i = 0; i < nonEmpty.length; i++) {
      const l = nonEmpty[i].text.replace(/\s+/g, ' ').trim();
      if (i > 0) {
        const gap = Math.abs(nonEmpty[i - 1].y - nonEmpty[i].y);
        if (gap > typical * 1.45) { b.block(para); para = ''; }
      }
      if (!para) para = l;
      else if (/[A-Za-zÁÉÍÓÚáéíóúñÑ]-$/.test(para)) para = para.slice(0, -1) + l;
      else para += ' ' + l;
    }
    b.block(para);
  }
  const built = b.build();
  if (built.text.replace(/\s/g, '').length < 20 && pdf.numPages > 0) {
    throw new Error('Este PDF parece ser una imagen escaneada sin texto. Pásalo antes por un programa de OCR para poder codificarlo.');
  }
  return built;
}

export async function importFile(input: ImportInput): Promise<Doc> {
  const kind = kindFromName(input.name);
  if (!kind) throw new Error(`Formato no compatible: ${input.name}`);
  let built: Built;
  switch (kind) {
    case 'docx': built = await fromDocx(input.data); break;
    case 'pdf': built = await fromPdf(input.data); break;
    case 'markdown': built = fromMarkdown(input.data); break;
    case 'html': built = fromHtml(input.data); break;
    case 'rtf': built = fromRtf(input.data); break;
    case 'odt': built = await fromOdt(input.data); break;
    default: built = fromPlain(input.data);
  }
  if (!built.text.trim()) throw new Error(`El documento «${input.name}» no contiene texto.`);
  const name = input.name.replace(/\.[^.]+$/, '');
  // El texto ya viene limpio; makeDoc lo normaliza de nuevo sin alterar posiciones
  // salvo en texto plano (donde aún no hay títulos que desplazar).
  const doc = makeDoc(name, kind, built.text, { importedFrom: input.name });
  if (doc.text !== built.text) {
    // Si la normalización cambió algo, los títulos/páginas podrían desfasarse: los descartamos.
    return doc;
  }
  return { ...doc, headings: built.headings.length ? built.headings : undefined, pageStarts: built.pageStarts };
}

/** Crea un documento a partir de texto pegado por el usuario. */
export function docFromPaste(name: string, text: string): Doc {
  return makeDoc(name || 'Texto pegado', 'text', text);
}
