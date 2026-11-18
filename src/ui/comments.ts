// Atajos para escribir la definición o el comentario de un código, una cita o un documento
// desde cualquier menú, sin depender de que el panel de detalles esté abierto.
import { quotationNumber } from '../core/model';
import type { Code, ID } from '../core/types';
import { useStore } from '../store';

export function editCodeComment(c: Pick<Code, 'id' | 'name'>) {
  const st = useStore.getState();
  const cur = st.project?.codes.find((x) => x.id === c.id);
  if (!cur) return;
  st.prompt(`Definición de «${cur.name}»`, 'Definición o comentario del código', cur.description,
    (v) => { if (v !== cur.description) useStore.getState().updateCode(c.id, { description: v.trim() }); }, 'Guardar',
    { multiline: true, placeholder: '¿Qué significa este código? ¿Cuándo se aplica y cuándo no?' });
}

export function editQuotationComment(id: ID) {
  const st = useStore.getState();
  const p = st.project;
  const q = p?.quotations.find((x) => x.id === id);
  if (!p || !q) return;
  st.prompt(`Comentario de la cita ${quotationNumber(p, q)}`, 'Comentario', q.comment,
    (v) => { if (v !== q.comment) useStore.getState().updateQuotation(id, { comment: v.trim() }); }, 'Guardar',
    { multiline: true, placeholder: 'Una nota breve sobre esta cita…' });
}

export function editDocComment(id: ID) {
  const st = useStore.getState();
  const d = st.project?.documents.find((x) => x.id === id);
  if (!d) return;
  st.prompt(`Comentario de «${d.name}»`, 'Comentario del documento', d.comment,
    (v) => { if (v !== d.comment) useStore.getState().updateDoc(id, { comment: v.trim() }); }, 'Guardar',
    { multiline: true, placeholder: 'Contexto de la entrevista, fecha, lugar, características de la persona…' });
}
