// Markdown ligero para memos: lo bastante sencillo para escribirse a mano y
// lo bastante estructurado para mostrarse con formato y exportarse a Word.
// No admite HTML (nunca se interpreta), sólo esta sintaxis:
//   # Título · ## Subtítulo · ### Apartado
//   **negritas** · *cursivas* o _cursivas_ · ~~tachado~~ · `código` · «cita textual»
//   - viñetas (también * o •), 1. listas numeradas, sangría con 2 espacios para subniveles
//   > cita en bloque · --- separador

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 's'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'q'; v: string };

export type Block =
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'p'; lines: Inline[][] }
  | { t: 'list'; ordered: boolean; start: number; items: { level: number; c: Inline[] }[] }
  | { t: 'quote'; lines: Inline[][] }
  | { t: 'hr' };

const INLINE_RE = /(\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|`([^`]+)`|\*([^*\s][^*]*?)\*|(?<![\p{L}\p{N}])_([^_\s][^_]*?)_(?![\p{L}\p{N}])|«([^»]+)»)/gu;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_RE.source, INLINE_RE.flags);
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[2] !== undefined || m[3] !== undefined) out.push({ t: 'b', c: parseInline(m[2] ?? m[3]) });
    else if (m[4] !== undefined) out.push({ t: 's', c: parseInline(m[4]) });
    else if (m[5] !== undefined) out.push({ t: 'code', v: m[5] });
    else if (m[6] !== undefined || m[7] !== undefined) out.push({ t: 'i', c: parseInline(m[6] ?? m[7]) });
    else if (m[8] !== undefined) out.push({ t: 'q', v: m[8] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

const BULLET = /^(\s*)[-*•+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,4})[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function parseMarkdown(text: string): Block[] {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (HR.test(line)) { blocks.push({ t: 'hr' }); i++; continue; }
    const h = HEADING.exec(line);
    if (h) { blocks.push({ t: 'h', level: Math.min(3, h[1].length) as 1 | 2 | 3, c: parseInline(h[2]) }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const ls: Inline[][] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { ls.push(parseInline(lines[i].replace(/^\s*>\s?/, ''))); i++; }
      blocks.push({ t: 'quote', lines: ls });
      continue;
    }
    const b = BULLET.exec(line), o = ORDERED.exec(line);
    if (b || o) {
      const ordered = !b;
      const items: { level: number; c: Inline[] }[] = [];
      const start = o ? Number(o[2]) : 1;
      while (i < lines.length) {
        const lb = BULLET.exec(lines[i]), lo = ORDERED.exec(lines[i]);
        const mm = ordered ? lo : lb;
        if (mm) {
          items.push({ level: Math.min(4, Math.floor(mm[1].replace(/\t/g, '  ').length / 2)), c: parseInline(ordered ? mm[3] : mm[2]) });
          i++;
        } else if ((lb || lo) && /^\s{2,}/.test(lines[i])) {
          // Sublista de otro tipo dentro de la lista: se trata como viñeta anidada.
          const x = (lb ?? lo)!;
          items.push({ level: Math.min(4, Math.max(1, Math.floor(x[1].length / 2))), c: parseInline(lb ? lb[2] : lo![3]) });
          i++;
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          // Línea de continuación del elemento anterior.
          items[items.length - 1].c.push({ t: 'text', v: ' ' }, ...parseInline(lines[i].trim()));
          i++;
        } else break;
      }
      blocks.push({ t: 'list', ordered, start, items });
      continue;
    }
    const ls: Inline[][] = [];
    while (i < lines.length && lines[i].trim() && !HEADING.test(lines[i]) && !/^\s*>/.test(lines[i]) && !BULLET.test(lines[i]) && !ORDERED.test(lines[i]) && !HR.test(lines[i])) {
      ls.push(parseInline(lines[i]));
      i++;
    }
    blocks.push({ t: 'p', lines: ls });
  }
  return blocks;
}

/** Texto sin marcas (para búsquedas, conteos o exportaciones de texto plano). */
export function inlineText(c: Inline[]): string {
  return c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : x.t === 'q' ? `«${x.v}»` : inlineText(x.c))).join('');
}
