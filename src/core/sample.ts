// Proyecto de ejemplo para aprender a usar Glosa. Las entrevistas son ficticias.

import { emptyProject, makeCode, makeDoc, makeGroup, makeMemo, makeQuotation, uid } from './model';
import type { ProjectData } from './types';

const E1 = `Entrevista 1 — Mariana, 21 años, Licenciatura en Psicología

Entrevistadora: ¿Cómo fue tu experiencia cuando las clases pasaron a ser en línea?

Mariana: Al principio fue un caos. No tenía un espacio propio en mi casa para conectarme, compartía la computadora con mi hermano y a veces teníamos clase a la misma hora. Me sentía muy culpable de pedirla.

Entrevistadora: ¿Y cómo lo resolvieron?

Mariana: Hicimos un horario pegado en el refrigerador. Yo usaba el celular para las clases que sólo eran de escuchar y la computadora para los exámenes. También me metí a un grupo de WhatsApp con compañeras donde nos pasábamos los apuntes y nos recordábamos las entregas.

Entrevistadora: ¿Qué fue lo más difícil?

Mariana: La soledad. Extrañaba platicar en los pasillos, eso de salir de clase y comentar con alguien. En la pantalla todos teníamos la cámara apagada y sentía que hablaba sola. Hubo semanas en que no tenía ganas de nada.

Entrevistadora: ¿Hubo algo positivo?

Mariana: Sí, aprendí a organizarme. Antes dejaba todo para el final y ahora uso una agenda. También algunos profesores grababan las clases y eso me ayudaba muchísimo porque podía volver a verlas cuando no entendía algo.`;

const E2 = `Entrevista 2 — Jorge, 23 años, Ingeniería Civil

Entrevistador: Cuéntame cómo viviste el cambio a las clases virtuales.

Jorge: En mi comunidad el internet es muy inestable. Muchas veces se cortaba la conexión a mitad de la clase y cuando volvía ya habían explicado todo. Llegué a subirme a la azotea para tener señal.

Entrevistador: ¿Lo hablaste con tus profesores?

Jorge: Con algunos sí. Hubo un profesor que nos dio más tiempo para entregar y nos mandaba el material en PDF para descargarlo. Otros simplemente decían que era nuestra responsabilidad tener buena conexión, y eso se sentía injusto.

Entrevistador: ¿Cómo te sentías en ese tiempo?

Jorge: Estresado todo el tiempo. Además tuve que trabajar en la tienda de mi tío porque la economía en la casa estaba difícil, entonces estudiaba en la noche. Pensé en darme de baja varias veces.

Entrevistador: ¿Qué te hizo quedarte?

Jorge: Mis compañeros. Formamos un equipo de estudio por videollamada los domingos y nos explicábamos los temas entre nosotros. Eso me salvó el semestre.`;

const E3 = `Entrevista 3 — Lucía, 20 años, Comunicación

Entrevistadora: ¿Qué recuerdas de las clases en línea?

Lucía: Que eran muy cansadas. Pasaba ocho horas frente a la pantalla y terminaba con dolor de cabeza. Al final del día ya no podía concentrarme en las tareas.

Entrevistadora: ¿Qué estrategias usaste?

Lucía: Empecé a tomar descansos cortos entre clases y a salir a caminar. También apagaba las notificaciones del celular mientras estudiaba. Y me ayudó mucho la psicóloga de la universidad; daban sesiones en línea gratuitas.

Entrevistadora: ¿Cómo era la relación con tus profesores?

Lucía: Dependía mucho. Hubo una maestra que al inicio de cada clase preguntaba cómo estábamos y eso hacía la diferencia, sentías que le importabas. Otros sólo leían diapositivas y nunca supieron nuestros nombres.

Entrevistadora: ¿Qué te gustaría que se conservara?

Lucía: Las clases grabadas y la flexibilidad para entregar. Y que se tome en serio la salud mental, porque muchos la pasamos muy mal y no se hablaba de eso.`;

export function sampleProject(): ProjectData {
  const p = emptyProject('Ejemplo: educación en línea', 'Glosa');
  p.description = 'Proyecto de ejemplo con tres entrevistas ficticias a estudiantes universitarios sobre su experiencia con las clases en línea. Explóralo libremente: puedes modificarlo o borrarlo sin problema.';
  const d1 = makeDoc('Entrevista 1 — Mariana', 'text', E1);
  const d2 = makeDoc('Entrevista 2 — Jorge', 'text', E2);
  const d3 = makeDoc('Entrevista 3 — Lucía', 'text', E3);
  const gMujeres = makeGroup('Mujeres', '#a855f7');
  const gHombres = makeGroup('Hombres', '#0ea5e9');
  const gSociales = makeGroup('Ciencias sociales', '#22c55e');
  d1.groupIds = [gMujeres.id, gSociales.id];
  d2.groupIds = [gHombres.id];
  d3.groupIds = [gMujeres.id, gSociales.id];
  p.documents = [d1, d2, d3];
  p.documentGroups = [gMujeres, gHombres, gSociales];

  const C = (name: string, color: string, description: string) => makeCode(name, color, { description });
  const barreras = C('Barreras tecnológicas', '#dc2626', 'Problemas de acceso a equipo, conectividad o espacio físico para tomar clases en línea.');
  const conect = C('Conectividad', '#ea580c', 'Fallas o ausencia de internet estable.');
  conect.parentId = barreras.id;
  const equipo = C('Equipo compartido', '#d97706', 'Dispositivos compartidos con otros miembros del hogar.');
  equipo.parentId = barreras.id;
  const aislamiento = C('Aislamiento social', '#9333ea', 'Sensación de soledad o falta de contacto con compañeros.');
  const salud = C('Malestar emocional', '#db2777', 'Estrés, cansancio, desánimo o afectaciones a la salud mental.');
  const apoyoPares = C('Apoyo entre pares', '#16a34a', 'Redes de ayuda entre compañeras y compañeros.');
  const docenteEmp = C('Docente empático', '#0891b2', 'Prácticas docentes que muestran cuidado o flexibilidad.');
  const docenteRig = C('Docente rígido', '#57534e', 'Prácticas docentes poco flexibles o impersonales.');
  const autorreg = C('Autorregulación', '#2563eb', 'Estrategias propias para organizarse, concentrarse o cuidarse.');
  const grabadas = C('Clases grabadas', '#4f46e5', 'Valoración de poder revisar las clases después.');
  const economia = C('Presión económica', '#be123c', 'Necesidad de trabajar o dificultades económicas del hogar.');
  const desercion = C('Intención de abandono', '#7c3aed', 'Menciones a darse de baja o abandonar los estudios.');
  p.codes = [barreras, conect, equipo, aislamiento, salud, apoyoPares, docenteEmp, docenteRig, autorreg, grabadas, economia, desercion];
  const gObst = makeGroup('Obstáculos', '#ef4444');
  const gRec = makeGroup('Recursos y estrategias', '#22c55e');
  p.codeGroups = [gObst, gRec];
  for (const c of [barreras, conect, equipo, aislamiento, salud, economia, desercion, docenteRig]) c.groupIds = [gObst.id];
  for (const c of [apoyoPares, docenteEmp, autorreg, grabadas]) c.groupIds = [gRec.id];

  const q = (doc: typeof d1, fragment: string, codes: string[], comment = '') => {
    const start = doc.text.indexOf(fragment);
    if (start < 0) throw new Error('Fragmento no encontrado: ' + fragment);
    const quote = makeQuotation(doc.id, start, start + fragment.length, codes);
    quote.comment = comment;
    p.quotations.push(quote);
    return quote;
  };
  q(d1, 'No tenía un espacio propio en mi casa para conectarme, compartía la computadora con mi hermano y a veces teníamos clase a la misma hora.', [equipo.id]);
  q(d1, 'Me sentía muy culpable de pedirla.', [salud.id], 'La culpa aparece ligada al recurso compartido: ¿se repite en otras entrevistas?');
  q(d1, 'También me metí a un grupo de WhatsApp con compañeras donde nos pasábamos los apuntes y nos recordábamos las entregas.', [apoyoPares.id]);
  const qSoledad = q(d1, 'La soledad. Extrañaba platicar en los pasillos, eso de salir de clase y comentar con alguien. En la pantalla todos teníamos la cámara apagada y sentía que hablaba sola.', [aislamiento.id]);
  q(d1, 'Hubo semanas en que no tenía ganas de nada.', [salud.id, aislamiento.id]);
  q(d1, 'aprendí a organizarme. Antes dejaba todo para el final y ahora uso una agenda.', [autorreg.id]);
  q(d1, 'algunos profesores grababan las clases y eso me ayudaba muchísimo porque podía volver a verlas cuando no entendía algo.', [grabadas.id, docenteEmp.id]);
  q(d2, 'En mi comunidad el internet es muy inestable. Muchas veces se cortaba la conexión a mitad de la clase y cuando volvía ya habían explicado todo.', [conect.id]);
  q(d2, 'Llegué a subirme a la azotea para tener señal.', [conect.id, autorreg.id], 'Ejemplo vívido; posible cita para el reporte.');
  q(d2, 'Hubo un profesor que nos dio más tiempo para entregar y nos mandaba el material en PDF para descargarlo.', [docenteEmp.id]);
  q(d2, 'Otros simplemente decían que era nuestra responsabilidad tener buena conexión, y eso se sentía injusto.', [docenteRig.id, conect.id]);
  q(d2, 'Estresado todo el tiempo.', [salud.id]);
  q(d2, 'tuve que trabajar en la tienda de mi tío porque la economía en la casa estaba difícil, entonces estudiaba en la noche.', [economia.id]);
  const qBaja = q(d2, 'Pensé en darme de baja varias veces.', [desercion.id]);
  const qEquipo = q(d2, 'Formamos un equipo de estudio por videollamada los domingos y nos explicábamos los temas entre nosotros. Eso me salvó el semestre.', [apoyoPares.id]);
  q(d3, 'Pasaba ocho horas frente a la pantalla y terminaba con dolor de cabeza. Al final del día ya no podía concentrarme en las tareas.', [salud.id]);
  q(d3, 'Empecé a tomar descansos cortos entre clases y a salir a caminar. También apagaba las notificaciones del celular mientras estudiaba.', [autorreg.id]);
  q(d3, 'me ayudó mucho la psicóloga de la universidad; daban sesiones en línea gratuitas.', [salud.id]);
  q(d3, 'Hubo una maestra que al inicio de cada clase preguntaba cómo estábamos y eso hacía la diferencia, sentías que le importabas.', [docenteEmp.id]);
  q(d3, 'Otros sólo leían diapositivas y nunca supieron nuestros nombres.', [docenteRig.id, aislamiento.id]);
  q(d3, 'Las clases grabadas y la flexibilidad para entregar.', [grabadas.id, docenteEmp.id]);
  q(d3, 'que se tome en serio la salud mental, porque muchos la pasamos muy mal y no se hablaba de eso.', [salud.id]);

  const rel = (name: string) => p.relations.find((r) => r.name === name)!.id;
  const L = (a: string, b: string, r: string) => p.links.push({ id: uid(), source: { kind: 'code', id: a }, target: { kind: 'code', id: b }, relationId: rel(r) });
  L(barreras.id, salud.id, 'es causa de');
  L(aislamiento.id, salud.id, 'es causa de');
  L(economia.id, desercion.id, 'es causa de');
  L(salud.id, desercion.id, 'está asociado con');
  L(apoyoPares.id, aislamiento.id, 'es una estrategia para');
  L(apoyoPares.id, desercion.id, 'contradice');
  L(docenteEmp.id, docenteRig.id, 'contradice');
  L(grabadas.id, conect.id, 'es una estrategia para');
  L(autorreg.id, salud.id, 'es una estrategia para');
  p.links.push({ id: uid(), source: { kind: 'quotation', id: qEquipo.id }, target: { kind: 'quotation', id: qBaja.id }, relationId: rel('contradice') });

  const m1 = makeMemo('Las redes de pares como factor protector', [{ kind: 'code', id: apoyoPares.id }, { kind: 'code', id: desercion.id }],
    'En las tres entrevistas aparecen grupos informales (WhatsApp, videollamadas) que sostienen la continuidad académica.\n\nJorge lo dice explícitamente: el equipo de estudio «me salvó el semestre». Conviene explorar si el apoyo entre pares amortigua el efecto de la presión económica sobre la intención de abandono.');
  const m2 = makeMemo('Bitácora metodológica', [], 'Codificación abierta de las tres primeras entrevistas.\n\nDecisión: separar «Docente empático» y «Docente rígido» en lugar de un solo código «Práctica docente», porque los estudiantes contrastan ambos tipos de forma muy marcada.');
  m2.type = 'metodológico';
  const m3 = makeMemo('Soledad y cámara apagada', [{ kind: 'quotation', id: qSoledad.id }], 'La cámara apagada aparece como símbolo de distancia. ¿Es una elección o una norma tácita del grupo?');
  m3.type = 'reflexivo';
  p.memos = [m1, m2, m3];

  p.networks = [{
    id: uid(), name: 'Mapa general', description: 'Relaciones entre obstáculos, recursos y abandono.', createdAt: new Date().toISOString(),
    nodes: [
      { ref: { kind: 'code', id: barreras.id }, x: 0, y: 0 },
      { ref: { kind: 'code', id: aislamiento.id }, x: 0, y: 160 },
      { ref: { kind: 'code', id: economia.id }, x: 0, y: 320 },
      { ref: { kind: 'code', id: salud.id }, x: 320, y: 80 },
      { ref: { kind: 'code', id: desercion.id }, x: 640, y: 240 },
      { ref: { kind: 'code', id: apoyoPares.id }, x: 320, y: 420 },
      { ref: { kind: 'code', id: autorreg.id }, x: 320, y: -120 },
      { ref: { kind: 'memo', id: m1.id }, x: 640, y: 420 },
    ],
  }];
  return p;
}
