# Cómo publicar una versión nueva de Glosa

No necesitas construir los instaladores en tu computadora: **GitHub los construye para macOS, Windows y
Linux** y los publica en la sección *Releases* del repositorio. Tarda unos 15–25 minutos.

Antes de publicar, escribe en [`CHANGELOG.md`](CHANGELOG.md) una sección `## [X.Y.Z]` con lo que cambió.
Ese texto aparece como descripción de la versión en GitHub.

---

## Opción A — Un solo comando (recomendada)

Requiere `git` y Node.js. En la carpeta del proyecto:

```bash
npm run publicar
```

Usa la versión que ya está en `package.json` (ahora 1.1.0). Para publicar otra versión:

```bash
npm run publicar -- 1.2.0
```

El comando revisa que exista la sección en `CHANGELOG.md`, corre las pruebas, te pide confirmación, guarda todo
en un commit, crea la etiqueta `v1.2.0` y la sube. Al terminar imprime los enlaces para ver el avance y las descargas.

## Opción B — Con GitHub Desktop o desde la página de GitHub

1. Sube los cambios como siempre (en GitHub Desktop: *Commit to main* y luego *Push origin*).
2. En github.com, abre el repositorio → pestaña **Actions** → **Instaladores** → botón **Run workflow**.
3. Deja marcada la casilla «¿Publicar la versión al terminar?» y pulsa **Run workflow**.

Se publica como `v` + la versión de `package.json`. Si quieres revisar la versión antes de que sea pública,
marca también «borrador» y después, en **Releases**, pulsa **Publish release**.

> Si sólo quieres probar los instaladores sin publicar nada, desmarca «Publicar». Los archivos quedan en la
> página de esa ejecución de Actions, en la sección *Artifacts*.

---

## Si algo falla

- **La etiqueta ya existe:** esa versión ya se publicó. Sube el número (`1.1.1`, `1.2.0`…) en `package.json`
  y en `CHANGELOG.md`.
- **Falla un sistema en Actions:** abre la ejecución en rojo, entra al sistema que falló y copia el error.
  Los otros sistemas siguen y sus instaladores se pueden descargar desde *Artifacts*.
- **Quiero los instaladores también en Dropbox:** descárgalos de la Release y cópialos a `Dropbox/Glosa/Instaladores`.

## Numeración de versiones

- `1.1.0 → 1.1.1`: sólo correcciones.
- `1.1.0 → 1.2.0`: funciones nuevas.
- `1.x → 2.0.0`: cambios que rompen la compatibilidad de los archivos `.glosa` (evitarlos).
