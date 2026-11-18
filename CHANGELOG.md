# Cambios en Glosa

Cada versión tiene su sección `## [X.Y.Z]`. Al publicar, GitHub copia esa sección como notas de la versión,
así que escríbela pensando en quien usa el programa, no en quien lo programa.

## [1.1.0] — 2026-11-17

### Interfaz
- **Pestañas que ya no empujan la ventana.** Con muchas pestañas abiertas, la barra se desplaza en horizontal
  (con la rueda del ratón o con las flechas ‹ ›) en lugar de sacar de la pantalla el panel de detalles.
  Un botón ▾ muestra la lista de todas las pestañas, y el clic derecho sobre una pestaña permite
  «Cerrar las demás», «Cerrar las de la derecha» o «Cerrar todas».
- **El documento se adapta a la pantalla.** Al maximizar la ventana, el texto aprovecha todo el ancho.
  Un botón en la barra del documento alterna entre «toda la ventana», «amplio» y «columna de lectura»;
  también se elige en Preferencias.
- **Acceso directo a los gestores** desde el explorador de la izquierda: ahora Documentos y Memos tienen,
  como Códigos, un botón para abrir su gestor. Los botones de cada sección se ven siempre (antes sólo al pasar el ratón).

### Comentarios y definiciones
- La **definición o comentario de un código** se escribe con un clic en la columna «Definición» del gestor de
  códigos, o con clic derecho sobre el código (en el explorador o en el gestor) → «Agregar definición o comentario…».
  Ya no es necesario abrir el panel de detalles.
- Lo mismo para **citas** (botón «comentario» en cada cita, o clic derecho → «Comentar la cita…», también desde el
  margen del documento) y para **documentos** (columna «Comentario» del gestor de documentos).

### Memos con formato
- Barra de formato: título, subtítulo, apartado, negritas, cursivas, tachado, viñetas, lista numerada,
  cita en bloque y línea separadora.
- Atajos: ⌘B / Ctrl+B (negritas), ⌘I / Ctrl+I (cursivas). Enter continúa la lista; Tab y Mayús+Tab cambian el nivel.
- Nuevo modo **Dividido**: se escribe a la izquierda y se ve el resultado con formato a la derecha.
- El texto se sigue guardando como Markdown sencillo, así que es compatible con versiones anteriores y con REFI-QDA.
- Al **exportar a Word**, los memos conservan títulos, viñetas, listas numeradas, negritas y cursivas
  (antes aparecían los símbolos `#` y `**`).

### Redes
- **Corregido:** al quitar un nodo de una red con la tecla Supr/Retroceso se borraban también, de todo el proyecto,
  las relaciones de ese código con otros. Ahora sólo se quita el nodo de esa red.
- **Vista general con relaciones:** el recuadro de la esquina inferior derecha ahora dibuja las líneas entre nodos
  (con el color de cada relación), no sólo los rectángulos. Se puede ocultar con el botón del mapa.
- **«Organizar» mejorado:** tiene en cuenta el tamaño de cada nodo (las citas son más anchas), ya no los encima
  y siempre da el mismo resultado para la misma red.
- Al agregar nodos, vecinos o citas, se colocan en espacios libres en vez de caer encima de otros.
- Dos relaciones entre los mismos dos nodos se dibujan curvas, cada una con su etiqueta visible.
- **Vínculos implícitos:** las citas se unen con línea punteada a sus códigos y a su documento, y los memos a los
  elementos con que están vinculados. Se pueden ocultar con el botón del ojo. «Vecinos» sobre una cita agrega sus códigos.
- Una red ya no falla si contiene un elemento que se eliminó del proyecto.

## [1.0.0] — 2026-10-17

Primera versión pública.
