import { Check, Download, Plus, Search, Tag, Trash2, WandSparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { exportFile } from '../actions';
import { codeDocumentTable, cooccurrence, cooccurringQuotations, descendants, evalQuery, expandRange, searchText, wordFrequencies, type Query, type Table } from '../core/analysis';
import { tableRows, toCsv, toXlsx } from '../core/exporters';
import { entityName } from '../core/model';
import type { ID, Quotation } from '../core/types';
import { useStore } from '../store';
import { ColorPicker, Empty, fmtNum } from './common';
import { CodePicker } from './CodePicker';
import { QuotationList } from './Managers';

function heat(v: number, max: number, color = 'var(--accent)') {
  if (!v || !max) return undefined;
  const pct = Math.round(8 + (v / max) * 52);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

function useCodeScope() {
  const project = useStore((s) => s.project!);
  const [group, setGroup] = useState<ID | ''>('');
  const codes = project.codes.filter((c) => !group || c.groupIds.includes(group)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const control = (
    <select className="input sm" style={{ width: 200 }} value={group} onChange={(e) => setGroup(e.target.value)}>
      <option value="">Todos los códigos</option>
      {project.codeGroups.map((g) => <option key={g.id} value={g.id}>Grupo: {g.name}</option>)}
    </select>
  );
  return { codes, control };
}

function SplitResults({ title, quotes, onClose }: { title: string; quotes: Quotation[]; onClose: () => void }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', height: '42%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div className="row" style={{ padding: '8px 16px' }}>
        <b className="grow ellipsis">{title}</b>
        <span className="small muted">{quotes.length} citas</span>
        <button className="btn ghost icon sm" onClick={onClose}><X size={14} /></button>
      </div>
      <div style={{ overflow: 'auto', padding: '0 16px 16px' }}><QuotationList quotes={quotes} compact /></div>
    </div>
  );
}

// ======================================================================== Código–documento

export function CodeDocView() {
  const project = useStore((s) => s.project!);
  const { codes, control } = useCodeScope();
  const [cols, setCols] = useState<'docs' | 'groups'>('docs');
  const [mode, setMode] = useState<'count' | 'words'>('count');
  const [norm, setNorm] = useState<'abs' | 'row' | 'col' | 'total'>('abs');
  const [hideZero, setHideZero] = useState(false);
  const [agg, setAgg] = useState(true);
  const [cell, setCell] = useState<{ r: number; c: number } | null>(null);

  const columns = cols === 'docs'
    ? project.documents.map((d, i) => ({ id: d.id, name: `D${i + 1} ${d.name}`, docIds: [d.id] }))
    : project.documentGroups.map((g) => ({ id: g.id, name: g.name, docIds: project.documents.filter((d) => d.groupIds.includes(g.id)).map((d) => d.id) }));
  const table = useMemo(() => codeDocumentTable(project, codes.map((c) => c.id), columns, mode, agg), [project, codes, columns.map((c) => c.id + c.docIds.join()).join(), mode, agg]); // eslint-disable-line
  const rowsIdx = table.rows.map((_, i) => i).filter((i) => !hideZero || table.rowTotals[i] > 0);
  const val = (r: number, c: number) => {
    const v = table.values[r][c];
    if (norm === 'abs') return v;
    if (norm === 'row') return table.rowTotals[r] ? (v / table.rowTotals[r]) * 100 : 0;
    if (norm === 'col') return table.colTotals[c] ? (v / table.colTotals[c]) * 100 : 0;
    return table.total ? (v / table.total) * 100 : 0;
  };
  const max = Math.max(0, ...rowsIdx.flatMap((r) => table.cols.map((_, c) => val(r, c))));
  const fmt = (v: number) => (norm === 'abs' ? fmtNum(v) : fmtNum(v, 1) + '%');
  const cellQuotes = cell ? (() => { const set = agg ? descendants(project, table.rows[cell.r].id) : new Set([table.rows[cell.r].id]); return project.quotations.filter((q) => q.codeIds.some((c) => set.has(c)) && columns[cell.c].docIds.includes(q.docId)); })() : [];

  const exportRows = () => {
    const t: Table = { ...table, rows: rowsIdx.map((i) => table.rows[i]), values: rowsIdx.map((i) => table.values[i]), rowTotals: rowsIdx.map((i) => table.rowTotals[i]) };
    return tableRows(t, 'Código', { totals: norm === 'abs', format: norm === 'abs' ? undefined : (_v, r, c) => Number(val(rowsIdx[r], c).toFixed(2)) });
  };

  if (!project.codes.length || !project.documents.length) return <Empty icon={<Tag size={26} />} title="Faltan datos">Necesitas documentos y códigos para construir la tabla código–documento.</Empty>;

  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Tabla código–documento</div><div className="view-sub">Cuántas veces aparece cada código en cada documento o grupo. Haz clic en una celda para ver sus citas.</div></div>
        <span className="spacer" />
        <button className="btn" onClick={() => exportFile(project.name + ' - código-documento', toCsv(exportRows()), 'csv')}><Download size={15} />CSV</button>
        <button className="btn" onClick={async () => exportFile(project.name + ' - código-documento', await toXlsx([{ name: 'Código-documento', rows: exportRows(), heat: true }]), 'xlsx', 'Excel')}><Download size={15} />Excel</button>
      </div>
      <div className="toolbar">
        {control}
        <div className="seg"><button className={cols === 'docs' ? 'on' : ''} onClick={() => setCols('docs')}>Documentos</button><button className={cols === 'groups' ? 'on' : ''} onClick={() => setCols('groups')} disabled={!project.documentGroups.length}>Grupos de documentos</button></div>
        <div className="seg"><button className={mode === 'count' ? 'on' : ''} onClick={() => setMode('count')}>Nº de citas</button><button className={mode === 'words' ? 'on' : ''} onClick={() => setMode('words')}>Nº de palabras</button></div>
        <select className="input sm" style={{ width: 170 }} value={norm} onChange={(e) => setNorm(e.target.value as typeof norm)}>
          <option value="abs">Valores absolutos</option><option value="row">% por fila</option><option value="col">% por columna</option><option value="total">% del total</option>
        </select>
        <label className="check small"><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />Ocultar filas vacías</label>
        {project.codes.some((c) => c.parentId) && <label className="check small" title="Un código padre cuenta también las citas de sus subcódigos"><input type="checkbox" checked={agg} onChange={(e) => setAgg(e.target.checked)} />Sumar subcódigos al padre</label>}
      </div>
      <div className="view-scroll">
        <table className="matrix">
          <thead><tr><th>Código</th>{table.cols.map((c) => <th key={c.id} title={c.name}><span className="rot">{c.name}</span></th>)}<th className="total">Total</th></tr></thead>
          <tbody>
            {rowsIdx.map((r) => (
              <tr key={table.rows[r].id}>
                <th><span className="row"><span className="code-swatch" style={{ background: table.rows[r].color }} />{table.rows[r].name}</span></th>
                {table.cols.map((_, c) => {
                  const v = val(r, c);
                  return <td key={c} className={'cell' + (v ? '' : ' zero') + (cell?.r === r && cell?.c === c ? ' sel' : '')} style={{ background: heat(v, max) }} onClick={() => setCell({ r, c })}>{v ? fmt(v) : '·'}</td>;
                })}
                <td className="total">{fmtNum(table.rowTotals[r])}</td>
              </tr>
            ))}
            <tr className="total"><th>Total</th>{table.colTotals.map((v, c) => <td key={c}>{fmtNum(v)}</td>)}<td>{fmtNum(table.total)}</td></tr>
          </tbody>
        </table>
      </div>
      {cell && <SplitResults title={`${table.rows[cell.r].name} × ${table.cols[cell.c].name}`} quotes={cellQuotes} onClose={() => setCell(null)} />}
    </>
  );
}

// ======================================================================== Co-ocurrencias

export function CooccurrenceView() {
  const project = useStore((s) => s.project!);
  const { codes, control } = useCodeScope();
  const [mode, setMode] = useState<'count' | 'coef'>('count');
  const [cell, setCell] = useState<{ a: number; b: number } | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const ids = codes.map((c) => c.id);
  const res = useMemo(() => cooccurrence(project, ids), [project, ids.join()]); // eslint-disable-line
  const show = ids.map((_, i) => i).filter((i) => !hideEmpty || res.counts[i].some((v) => v > 0));
  const m = mode === 'count' ? res.counts : res.coef;
  const max = Math.max(0, ...show.flatMap((i) => show.map((j) => (i === j ? 0 : m[i][j]))));
  const rowsFor = () => show.map((i) => {
    const o: Record<string, string | number> = { Código: codes[i].name };
    show.forEach((j) => { o[codes[j].name] = i === j ? '' : mode === 'count' ? m[i][j] : Number(m[i][j].toFixed(3)); });
    return o;
  });
  if (project.codes.length < 2) return <Empty icon={<Tag size={26} />} title="Se necesitan al menos dos códigos">La tabla de co-ocurrencias muestra qué códigos aparecen juntos en el mismo fragmento o en fragmentos que se solapan.</Empty>;
  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Co-ocurrencia de códigos</div><div className="view-sub">Códigos aplicados a la misma cita o a citas que se solapan. El coeficiente c va de 0 (nunca juntos) a 1 (siempre juntos).</div></div>
        <span className="spacer" />
        <button className="btn" onClick={() => exportFile(project.name + ' - co-ocurrencias', toCsv(rowsFor()), 'csv')}><Download size={15} />CSV</button>
        <button className="btn" onClick={async () => exportFile(project.name + ' - co-ocurrencias', await toXlsx([{ name: 'Co-ocurrencias', rows: rowsFor(), heat: true }]), 'xlsx', 'Excel')}><Download size={15} />Excel</button>
      </div>
      <div className="toolbar">
        {control}
        <div className="seg"><button className={mode === 'count' ? 'on' : ''} onClick={() => setMode('count')}>Frecuencia</button><button className={mode === 'coef' ? 'on' : ''} onClick={() => setMode('coef')}>Coeficiente c</button></div>
        <label className="check small"><input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />Ocultar códigos sin co-ocurrencias</label>
      </div>
      <div className="view-scroll">
        {show.length === 0 ? <Empty title="Sin co-ocurrencias todavía">Aplica varios códigos a una misma cita, o codifica fragmentos que se solapen, para ver aquí sus relaciones.</Empty> : (
          <table className="matrix">
            <thead><tr><th></th>{show.map((j) => <th key={j} title={codes[j].name}><span className="rot"><span className="code-swatch" style={{ background: codes[j].color, display: 'inline-block', marginRight: 4 }} />{codes[j].name}</span></th>)}</tr></thead>
            <tbody>
              {show.map((i) => (
                <tr key={i}>
                  <th><span className="row"><span className="code-swatch" style={{ background: codes[i].color }} />{codes[i].name} <span className="muted small">({res.freq[i]})</span></span></th>
                  {show.map((j) => {
                    if (i === j) return <td key={j} style={{ background: 'var(--bg-sunken)' }} />;
                    const v = m[i][j];
                    return <td key={j} className={'cell' + (v ? '' : ' zero') + (cell && ((cell.a === i && cell.b === j) || (cell.a === j && cell.b === i)) ? ' sel' : '')} style={{ background: heat(v, max) }} onClick={() => v && setCell({ a: i, b: j })}>{v ? (mode === 'count' ? v : v.toFixed(2)) : '·'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {cell && <SplitResults title={`${codes[cell.a].name} + ${codes[cell.b].name}`} quotes={cooccurringQuotations(project, codes[cell.a].id, codes[cell.b].id)} onClose={() => setCell(null)} />}
    </>
  );
}

// ======================================================================== Consulta

interface Cond { codeId: ID; children: boolean }

export function QueryView() {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [op, setOp] = useState<'and' | 'or'>('and');
  const [conds, setConds] = useState<Cond[]>([]);
  const [nots, setNots] = useState<Cond[]>([]);
  const [docGroup, setDocGroup] = useState<ID | ''>('');
  const [picker, setPicker] = useState<{ x: number; y: number; target: 'inc' | 'exc' } | null>(null);
  const name = (id: ID) => project.codes.find((c) => c.id === id)?.name ?? '?';
  const color = (id: ID) => project.codes.find((c) => c.id === id)?.color ?? '#999';

  const results = useMemo(() => {
    if (!conds.length) return [];
    const items: Query[] = conds.map((c) => ({ op: 'code', codeId: c.codeId, includeChildren: c.children }));
    let q: Query = { op, items };
    if (nots.length) q = { op: 'and', items: [q, ...nots.map((c) => ({ op: 'not' as const, item: { op: 'code' as const, codeId: c.codeId, includeChildren: c.children } }))] };
    const docs = docGroup ? new Set(project.documents.filter((d) => d.groupIds.includes(docGroup)).map((d) => d.id)) : null;
    return evalQuery(project, q, docs ? project.quotations.filter((x) => docs.has(x.docId)) : project.quotations)
      .sort((a, b) => project.documents.findIndex((d) => d.id === a.docId) - project.documents.findIndex((d) => d.id === b.docId) || a.start - b.start);
  }, [project, conds, nots, op, docGroup]);

  const describe = () => {
    if (!conds.length) return '';
    let s = conds.map((c) => `«${name(c.codeId)}»`).join(op === 'and' ? ' Y ' : ' O ');
    if (nots.length) s = `(${s}) SIN ${nots.map((c) => `«${name(c.codeId)}»`).join(' NI ')}`;
    return s;
  };

  const condRow = (c: Cond, i: number, list: Cond[], set: (l: Cond[]) => void) => (
    <div key={c.codeId} className="row card" style={{ padding: '6px 10px' }}>
      <span className="code-swatch" style={{ background: color(c.codeId) }} /><span className="grow">{name(c.codeId)}</span>
      {descendants(project, c.codeId).size > 1 && <label className="check small"><input type="checkbox" checked={c.children} onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, children: e.target.checked } : x)))} />con subcódigos</label>}
      <button className="btn ghost icon sm" onClick={() => set(list.filter((_, j) => j !== i))}><X size={14} /></button>
    </div>
  );

  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Consulta de citas</div><div className="view-sub">Combina códigos para recuperar las citas que cumplen ciertas condiciones.</div></div>
      </div>
      <div className="view-scroll">
        <div className="view-pad" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 24, alignItems: 'start' }}>
          <div className="col" style={{ gap: 14, position: 'sticky', top: 0 }}>
            <div className="card col">
              <b>1. Citas que tengan…</b>
              <div className="seg"><button className={op === 'and' ? 'on' : ''} onClick={() => setOp('and')}>Todos estos códigos (Y)</button><button className={op === 'or' ? 'on' : ''} onClick={() => setOp('or')}>Cualquiera (O)</button></div>
              {conds.map((c, i) => condRow(c, i, conds, setConds))}
              <button className="btn sm" onClick={(e) => setPicker({ x: e.clientX, y: e.clientY, target: 'inc' })}><Plus size={14} />Agregar código</button>
            </div>
            <div className="card col">
              <b>2. Pero que no tengan… <span className="muted small">(opcional)</span></b>
              {nots.map((c, i) => condRow(c, i, nots, setNots))}
              <button className="btn sm" onClick={(e) => setPicker({ x: e.clientX, y: e.clientY, target: 'exc' })}><Plus size={14} />Excluir código</button>
            </div>
            <div className="card col">
              <b>3. Buscar en…</b>
              <select className="input sm" value={docGroup} onChange={(e) => setDocGroup(e.target.value)}>
                <option value="">Todos los documentos</option>
                {project.documentGroups.map((g) => <option key={g.id} value={g.id}>Grupo: {g.name}</option>)}
              </select>
            </div>
          </div>
          <div className="col" style={{ gap: 12 }}>
            {conds.length > 0 ? (
              <>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <div className="grow"><b>{results.length} citas</b> <span className="muted">· {describe()}</span></div>
                  <button className="btn sm" disabled={!results.length} onClick={async () => { const ex = await import('../core/exporters'); exportFile(project.name + ' - consulta', await ex.toXlsx([{ name: 'Consulta', rows: ex.quotationRows(project, results), widths: { Cita: 70 } }]), 'xlsx', 'Excel'); }}><Download size={14} />Excel</button>
                  <button className="btn sm" disabled={!results.length} title="Crea un código nuevo y lo aplica a todas las citas encontradas" onClick={() => st().prompt('Guardar resultados como código', 'Nombre del nuevo código', describe().replace(/«|»/g, '').slice(0, 60), (v) => {
                    if (!v.trim()) return;
                    const cid = st().createCode(v.trim(), { description: 'Creado a partir de la consulta: ' + describe() });
                    st().mutate((d) => { for (const q of d.quotations) if (results.some((r) => r.id === q.id) && !q.codeIds.includes(cid)) q.codeIds.push(cid); });
                    st().toast(`Código «${v.trim()}» aplicado a ${results.length} citas`, 'success');
                  }, 'Crear y aplicar')}><Tag size={14} />Guardar como código</button>
                </div>
                <QuotationList quotes={results} empty={<Empty title="Ninguna cita cumple estas condiciones">Prueba con «Cualquiera (O)» o quita alguna exclusión.</Empty>} />
              </>
            ) : <Empty icon={<Search size={26} />} title="Arma tu consulta">Agrega uno o más códigos a la izquierda. Por ejemplo: citas con «Malestar emocional» Y «Aislamiento social», pero SIN «Apoyo entre pares».</Empty>}
          </div>
        </div>
      </div>
      {picker && <CodePicker x={picker.x} y={picker.y} title={picker.target === 'inc' ? 'Incluir código' : 'Excluir código'} exclude={[...conds, ...nots].map((c) => c.codeId)}
        onClose={() => setPicker(null)} onPick={(ids) => { const add = ids.map((codeId) => ({ codeId, children: true })); picker.target === 'inc' ? setConds([...conds, ...add]) : setNots([...nots, ...add]); }} />}
    </>
  );
}

// ======================================================================== Palabras

export function WordsView() {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [scope, setScope] = useState<string>('all');
  const [stop, setStop] = useState(true);
  const [minLen, setMinLen] = useState(4);
  const [exclude, setExclude] = useState('');
  const [view, setView] = useState<'cloud' | 'list'>('cloud');
  const texts = useMemo(() => {
    if (scope === 'all') return project.documents.map((d) => d.text);
    const [k, id] = scope.split(':');
    if (k === 'doc') return [project.documents.find((d) => d.id === id)?.text ?? ''];
    if (k === 'dg') return project.documents.filter((d) => d.groupIds.includes(id)).map((d) => d.text);
    if (k === 'code') {
      const set = descendants(project, id);
      return project.quotations.filter((q) => q.codeIds.some((c) => set.has(c))).map((q) => project.documents.find((d) => d.id === q.docId)!.text.slice(q.start, q.end));
    }
    return [];
  }, [project, scope]);
  const freq = useMemo(() => wordFrequencies(texts, { stopwords: stop, minLength: minLen, exclude: exclude.split(/[,\s]+/).filter(Boolean) }), [texts, stop, minLen, exclude]);
  const top = freq.slice(0, 90);
  const max = top[0]?.[1] ?? 1, min = top[top.length - 1]?.[1] ?? 1;
  const palette = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#db2777', '#4f46e5', '#0d9488'];
  const shuffled = useMemo(() => [...top].sort((a, b) => (a[0].charCodeAt(0) * 7 + a[0].length) % 11 - (b[0].charCodeAt(0) * 7 + b[0].length) % 11), [top]);
  const total = freq.reduce((a, [, n]) => a + n, 0);

  const goSearch = (w: string) => { st().openTab('search'); setTimeout(() => window.dispatchEvent(new CustomEvent('glosa:search', { detail: { term: w } })), 30); };

  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Nube y lista de palabras</div><div className="view-sub">Palabras más frecuentes. Haz clic en una palabra para buscarla en los documentos.</div></div>
        <span className="spacer" />
        <button className="btn" onClick={() => exportFile(project.name + ' - frecuencia de palabras', toCsv(freq.map(([w, n]) => ({ Palabra: w, Frecuencia: n, Porcentaje: ((n / total) * 100).toFixed(2) }))), 'csv')}><Download size={15} />CSV</button>
      </div>
      <div className="toolbar">
        <select className="input sm" style={{ width: 240 }} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">Todos los documentos</option>
          <optgroup label="Documento">{project.documents.map((d) => <option key={d.id} value={'doc:' + d.id}>{d.name}</option>)}</optgroup>
          {project.documentGroups.length > 0 && <optgroup label="Grupo de documentos">{project.documentGroups.map((g) => <option key={g.id} value={'dg:' + g.id}>{g.name}</option>)}</optgroup>}
          {project.codes.length > 0 && <optgroup label="Citas de un código">{[...project.codes].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((c) => <option key={c.id} value={'code:' + c.id}>{c.name}</option>)}</optgroup>}
        </select>
        <label className="check small"><input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} />Omitir palabras vacías</label>
        <label className="row small">Mín. letras <input type="number" className="input sm" style={{ width: 56 }} min={1} max={12} value={minLen} onChange={(e) => setMinLen(Number(e.target.value) || 1)} /></label>
        <input className="input sm" style={{ width: 220 }} placeholder="Excluir palabras (separadas por coma)" value={exclude} onChange={(e) => setExclude(e.target.value)} />
        <span className="spacer" />
        <div className="seg"><button className={view === 'cloud' ? 'on' : ''} onClick={() => setView('cloud')}>Nube</button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Lista</button></div>
      </div>
      <div className="view-scroll">
        {!freq.length ? <Empty title="No hay palabras que mostrar">Agrega documentos o cambia el alcance.</Empty> : view === 'cloud' ? (
          <div className="cloud">
            {shuffled.map(([w, n], i) => {
              const t = max === min ? 0.5 : (n - min) / (max - min);
              return <span key={w} onClick={() => goSearch(w)} title={`${n} apariciones`} style={{ fontSize: 13 + Math.sqrt(t) * 40, color: palette[i % palette.length], opacity: 0.65 + t * 0.35 }}>{w}</span>;
            })}
          </div>
        ) : (
          <table className="table" style={{ maxWidth: 640 }}>
            <thead><tr><th>#</th><th>Palabra</th><th className="num">Frecuencia</th><th className="num">%</th><th style={{ width: 200 }}></th></tr></thead>
            <tbody>{freq.slice(0, 500).map(([w, n], i) => (
              <tr key={w} onClick={() => goSearch(w)}>
                <td className="muted">{i + 1}</td><td style={{ fontWeight: 500 }}>{w}</td><td className="num">{n}</td><td className="num">{((n / total) * 100).toFixed(2)}</td>
                <td><div className="bar-track" style={{ height: 8 }}><div className="bar-fill" style={{ width: `${(n / max) * 100}%`, background: 'var(--accent)' }} /></div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ======================================================================== Búsqueda y autocodificación

export function SearchView() {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [term, setTerm] = useState('');
  const [caseS, setCaseS] = useState(false);
  const [whole, setWhole] = useState(true);
  const [docId, setDocId] = useState<ID | ''>('');
  const [unit, setUnit] = useState<'match' | 'sentence' | 'paragraph'>('sentence');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.term) { setTerm(d.term); setDocId(d.docId ?? ''); } };
    window.addEventListener('glosa:search', h);
    return () => window.removeEventListener('glosa:search', h);
  }, []);

  const results = useMemo(() => searchText(project, term, { caseSensitive: caseS, wholeWord: whole, docIds: docId ? new Set([docId]) : undefined }), [project, term, caseS, whole, docId]);
  useEffect(() => setChecked(new Set(results.map((_, i) => i))), [results]);
  const docName = (id: ID) => { const i = project.documents.findIndex((d) => d.id === id); return `D${i + 1} ${project.documents[i]?.name}`; };

  const autocode = (codeIds: ID[]) => {
    const ranges = new Map<string, { docId: ID; start: number; end: number }>();
    for (const i of checked) {
      const r = results[i];
      if (!r) continue;
      const text = project.documents.find((d) => d.id === r.docId)!.text;
      const rng = unit === 'match' ? { start: r.start, end: r.end } : expandRange(text, r.start, r.end, unit);
      ranges.set(`${r.docId}:${rng.start}:${rng.end}`, { docId: r.docId, ...rng });
    }
    // Una sola operación de deshacer para toda la autocodificación.
    st().mutate((d) => {
      for (const r of ranges.values()) {
        const ex = d.quotations.find((q) => q.docId === r.docId && q.start === r.start && q.end === r.end);
        if (ex) ex.codeIds = [...new Set([...ex.codeIds, ...codeIds])];
        else d.quotations.push({ id: crypto.randomUUID(), docId: r.docId, start: r.start, end: r.end, codeIds: [...codeIds], comment: '', createdAt: new Date().toISOString() });
      }
    });
    st().toast(`${ranges.size} fragmentos codificados con ${codeIds.map((c) => entityName(project, { kind: 'code', id: c })).join(', ')}`, 'success', { label: 'Deshacer', run: () => st().undo() });
  };

  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Búsqueda y autocodificación</div><div className="view-sub">Encuentra palabras o frases en todos los documentos y codifica los resultados de una sola vez. Revisa siempre los resultados antes de codificar.</div></div>
      </div>
      <div className="toolbar">
        <div className="input-wrap" style={{ width: 320 }}><Search size={14} /><input className="input" autoFocus placeholder="Palabra o frase…" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
        <label className="check small"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} />Palabra completa</label>
        <label className="check small"><input type="checkbox" checked={caseS} onChange={(e) => setCaseS(e.target.checked)} />Distinguir mayúsculas</label>
        <select className="input sm" style={{ width: 200 }} value={docId} onChange={(e) => setDocId(e.target.value)}>
          <option value="">Todos los documentos</option>
          {project.documents.map((d, i) => <option key={d.id} value={d.id}>D{i + 1} {d.name}</option>)}
        </select>
      </div>
      {results.length > 0 && (
        <div className="toolbar" style={{ background: 'var(--bg)' }}>
          <b>{results.length} coincidencias</b>
          <button className="btn ghost sm" onClick={() => setChecked(checked.size === results.length ? new Set() : new Set(results.map((_, i) => i)))}>{checked.size === results.length ? 'Ninguna' : 'Todas'}</button>
          <div className="sep" />
          <span className="small">Codificar</span>
          <select className="input sm" style={{ width: 190 }} value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
            <option value="match">sólo la palabra encontrada</option><option value="sentence">la oración completa</option><option value="paragraph">el párrafo completo</option>
          </select>
          <button className="btn primary sm" disabled={!checked.size} onClick={(e) => setPicker({ x: e.clientX - 150, y: e.clientY + 10 })}><WandSparkles size={14} />Codificar {checked.size} resultados…</button>
        </div>
      )}
      <div className="view-scroll"><div className="view-pad" style={{ maxWidth: 1000 }}>
        {!term ? <Empty icon={<Search size={26} />} title="Escribe algo para buscar">Por ejemplo, busca «internet» y codifica todas las oraciones donde aparece con «Conectividad».</Empty>
          : !results.length ? <Empty title="Sin coincidencias">Prueba desmarcando «Palabra completa».</Empty> : (
            <div className="col" style={{ gap: 6 }}>
              {results.map((r, i) => (
                <div key={i} className="row card" style={{ padding: '8px 12px', alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={checked.has(i)} onChange={() => { const n = new Set(checked); n.has(i) ? n.delete(i) : n.add(i); setChecked(n); }} style={{ marginTop: 4, accentColor: 'var(--accent)' }} />
                  <div className="grow" style={{ cursor: 'default' }} onClick={() => st().revealRange(r.docId, r.start, r.end)}>
                    <div className="small muted">{docName(r.docId)}</div>
                    <div style={{ fontFamily: 'var(--font-read)', lineHeight: 1.55 }}>…{r.before}<mark style={{ background: '#ffe36e', color: '#000', borderRadius: 2 }}>{r.match}</mark>{r.after}…</div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div></div>
      {picker && <CodePicker x={picker.x} y={picker.y} title="Autocodificar con…" initial={term} onClose={() => setPicker(null)} onPick={autocode} />}
    </>
  );
}

// ======================================================================== Relaciones

export function RelationsView() {
  const project = useStore((s) => s.project!);
  const st = useStore.getState;
  const [editing, setEditing] = useState<ID | null>(null);
  const counts = new Map<ID, number>();
  for (const l of project.links) counts.set(l.relationId, (counts.get(l.relationId) ?? 0) + 1);
  return (
    <>
      <div className="view-head">
        <div><div className="view-title">Relaciones y vínculos</div><div className="view-sub">Tipos de relación disponibles para vincular códigos, citas y memos en las redes.</div></div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => st().prompt('Nueva relación', 'Nombre (p. ej. «influye en», «se opone a»)', '', (v) => { if (v.trim()) setEditing(st().createRelation({ name: v.trim(), symmetric: false, color: '#64748b', dashed: false })); }, 'Crear')}><Plus size={15} />Nueva relación</button>
      </div>
      <div className="view-scroll"><div className="view-pad" style={{ maxWidth: 900 }}>
        <div className="col">
          {project.relations.map((r) => (
            <div key={r.id} className="card" style={{ padding: 12 }}>
              <div className="row">
                <svg width="46" height="12"><line x1="2" y1="6" x2={r.symmetric ? 44 : 36} y2="6" stroke={r.color} strokeWidth="2" strokeDasharray={r.dashed ? '5 3' : undefined} />{!r.symmetric && <path d="M36 1 L45 6 L36 11 z" fill={r.color} />}</svg>
                <b className="grow">{r.name}</b>
                <span className="small muted">{counts.get(r.id) ?? 0} vínculos</span>
                <button className="btn ghost sm" onClick={() => setEditing(editing === r.id ? null : r.id)}>{editing === r.id ? <><Check size={14} />Listo</> : 'Editar'}</button>
                <button className="btn ghost icon sm" disabled={project.relations.length < 2} title="Eliminar relación" onClick={() => st().confirm('Eliminar relación', `Los ${counts.get(r.id) ?? 0} vínculos de este tipo pasarán a «${project.relations.find((x) => x.id !== r.id)?.name}».`, () => st().deleteRelation(r.id), { danger: true, confirmLabel: 'Eliminar' })}><Trash2 size={14} /></button>
              </div>
              {editing === r.id && (
                <div className="col" style={{ marginTop: 12, gap: 10 }}>
                  <input className="input" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && st().updateRelation(r.id, { name: e.target.value.trim() })} />
                  <ColorPicker value={r.color} onChange={(c) => st().updateRelation(r.id, { color: c })} />
                  <div className="row">
                    <label className="check"><input type="checkbox" checked={!r.symmetric} onChange={(e) => st().updateRelation(r.id, { symmetric: !e.target.checked })} />Dirigida (con flecha)</label>
                    <label className="check"><input type="checkbox" checked={r.dashed} onChange={(e) => st().updateRelation(r.id, { dashed: e.target.checked })} />Línea punteada</label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <h3 style={{ fontSize: 14, margin: '26px 0 10px' }}>Todos los vínculos ({project.links.length})</h3>
        {project.links.length ? (
          <table className="table">
            <thead><tr><th>Origen</th><th>Relación</th><th>Destino</th><th></th></tr></thead>
            <tbody>{project.links.map((l) => {
              const r = project.relations.find((x) => x.id === l.relationId);
              return (
                <tr key={l.id}>
                  <td>{entityName(project, l.source)}</td>
                  <td><select className="input sm" style={{ color: r?.color, fontWeight: 600 }} value={l.relationId} onChange={(e) => st().updateLink(l.id, e.target.value)}>{project.relations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                  <td>{entityName(project, l.target)}</td>
                  <td><button className="btn ghost icon sm" onClick={() => st().deleteLinks([l.id])}><Trash2 size={14} /></button></td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <div className="muted">Aún no hay vínculos. Créalos desde una red o desde el panel de detalles de un código.</div>}
      </div></div>
    </>
  );
}
