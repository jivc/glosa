// Formato nativo .glosa: un ZIP con project.json legible por cualquier persona
// o programa. Así el proyecto nunca queda encerrado en Glosa.

import JSZip from 'jszip';
import { normalizeProject } from './model';
import type { ProjectData } from './types';

export const PROJECT_EXT = 'glosa';

export async function serializeProject(p: ProjectData): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/x-glosa+zip', { compression: 'STORE' });
  zip.file('project.json', JSON.stringify(p, null, 1));
  zip.file('LEEME.txt',
    'Proyecto de análisis cualitativo creado con Glosa.\n' +
    'project.json contiene todos los documentos, códigos, citas, memos y redes en formato JSON abierto.\n' +
    'Para abrirlo en Atlas.ti, MAXQDA, NVivo o QualCoder exporta desde Glosa a REFI-QDA (.qdpx).\n');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function deserializeProject(data: ArrayBuffer | Uint8Array): Promise<ProjectData> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    // Permitimos también un project.json suelto.
    try {
      return normalizeProject(JSON.parse(new TextDecoder().decode(data)));
    } catch {
      throw new Error('El archivo no es un proyecto de Glosa válido.');
    }
  }
  const f = zip.file('project.json');
  if (!f) throw new Error('El archivo no contiene project.json; quizá esté dañado.');
  return normalizeProject(JSON.parse(await f.async('string')));
}
