# Notas del proyecto para Claude

Aplicación de la agencia **Juancito Ads** para planificar, generar y aprobar
calendarios de contenido de redes sociales.

## Cómo trabajar aquí

```bash
npm install
npm run dev      # servidor de desarrollo (Vite, puerto 5173)
npm run lint     # oxlint — debe terminar sin errores NI avisos
npm run build    # build de producción a dist/
npm run preview  # sirve dist/ para comprobar el build
```

Antes de dar por terminado cualquier cambio: `npm run lint && npm run build`.

## Arquitectura

Aplicación de una sola página en React 19 + Vite. Sin router: `App.jsx`
decide entre dos vistas según la URL.

```
src/
  App.jsx                 Enrutado + estado global (clientes, cliente activo)
  constants.js            Formatos, estados, planes, meses, categorías
  utils.js                Fechas, IDs, compresión de imágenes, escapado
  api.js                  Llamadas a IA (Anthropic/Groq) y lectura de ADN en GitHub
  export.js               Genera el HTML autónomo que se envía al cliente
  index.css               Sistema de diseño: tokens y clases base
  hooks/useDialogA11y.js  Foco atrapado, Escape y bloqueo de scroll en diálogos
  lib/supabase.js         Cliente de Supabase (inerte si no hay variables)
  components/
    Icon.jsx              Set de iconos SVG monocromos (rejilla 24, trazo 1.75)
    ApiSetup.jsx          Diálogo de configuración de la clave de IA
    ClientModal.jsx       Alta y edición de cliente (5 pestañas)
    PlanWizard.jsx        Asistente de 7 pasos para crear un calendario
    CalendarView.jsx      Vista de lista y de rejilla, filtros, generación, envío
  pages/Aprobar.jsx       Página pública que ve el cliente final
netlify/functions/
  approval.mjs            API del flujo de aprobación (Supabase o Netlify Blobs)
supabase/migrations/      Esquema y políticas RLS
```

### Dónde viven los datos

- **Ahora:** `localStorage`, clave `jads-data`. La clave de IA en `ja-apikey`.
- **Aprobaciones:** función de Netlify → Supabase si está configurado, si no
  Netlify Blobs.
- **Supabase:** el esquema existe y la función lo usa, pero la aplicación
  todavía **no** guarda clientes ni calendarios ahí. Ver `DEPLOY.md` § 6.

### Modelo de datos

```
cliente
  └── calendars[]
        └── days[]          un día natural del mes
              └── posts[]   una publicación
```

Una publicación tiene `format` (post/reel/carrusel/historia/live),
`status` (pending/approved/rejected/published), `idea`, `guion`,
`descripcion`, `hashtagsFinales`, `image`, `publishTime`.
El campo `script` es heredado: se conserva para no romper datos antiguos y se
lee como respaldo de `descripcion`.

## Convenciones

**Idioma.** Toda la interfaz está en español, con tildes y signos de apertura
(«¿», «¡»). Los identificadores del código están en inglés. Los comentarios,
en español.

**Estilos.** Hay un sistema de diseño en `index.css` con tokens
(`--fs-*` tipografía, `--sp-*` espaciado, `--tap` objetivos táctiles).
Los estilos en línea son habituales en este código; úsalos referenciando los
tokens (`fontSize: "var(--fs-sm)"`), no números sueltos.

- Nunca bajes de `--fs-3xs` (11px) en texto visible.
- Los campos de formulario van a 16px en móvil: por debajo, iOS Safari hace
  zoom al enfocarlos. Ya está resuelto en la clase `.input`.
- Los controles pulsables miden al menos `--tap` (44px); `--tap-sm` (36px)
  sólo para controles densos bien separados.
- **No concatenes variables CSS con sufijos de opacidad**
  (`"var(--accent)" + "44"`): produce CSS inválido que el navegador descarta
  en silencio. Usa los tokens `--accent-soft`, `--accent-line`, `--alt-soft`…
- **Superficies por elevación:** `--bg` < `--surface` < `--surface-2` <
  `--surface-3`. Sombras sólo en dos niveles: `--elev-1` (tarjeta que se
  despega) y `--elev-2` (capa flotante: menús, diálogos, panel lateral).
- **Tres radios:** `--radius-sm` (8), `--radius` (12), `--radius-lg` (16) y
  `--radius-pill`. Un hijo nunca lleva más radio que su padre.

**Iconos.** Todos salen de `components/Icon.jsx`: `<Icon name="trash" />`.
Son SVG monocromos que heredan `currentColor`, así que dentro de un botón
toman su color sin variantes.

- **No uses emoji como icono de interfaz.** Los dibuja el sistema operativo,
  cambian según la plataforma, traen color propio (el fondo blanco de 📋
  recortaba un rectángulo sobre los fondos azules) y no heredan el color.
- Para añadir uno, mete el `<path>` en el objeto `paths` de `Icon.jsx`
  usando la misma rejilla de 24 y trazo de 1.75.
- El icono de cada formato de publicación está en `FORMATS[x].icon`
  (constants.js), y `FORMAT_ICONS` mapea formato → nombre de icono.

**Marca.** El logo original (2048×2048, 1,3 MB) está fuera del repositorio;
lo que se versiona son los derivados optimizados:

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `src/assets/logo-mark.png` | Monograma, 192px, fondo transparente | Cabecera, diálogo de IA, pie de la página de aprobación |
| `public/logo.png` | Lockup completo con «JUANCITO», 512px | `og:image` |
| `public/favicon-32.png` | Sólo las letras «JA» sobre placa blanca | Pestaña del navegador |
| `public/apple-touch-icon.png` | Igual, 180px a sangre | Pantalla de inicio en iOS |

Dos decisiones a respetar si se regeneran:

- **El favicon lleva sólo las letras, no el monograma completo.** El megáfono
  y la constelación son ilegibles por debajo de 32px, y el azul de marca no
  contrasta contra el fondo oscuro del navegador. La placa blanca resuelve
  ambas cosas y funciona en tema claro y oscuro.
- **Las imágenes de la interfaz se importan** (`import logoMark from
  "./assets/logo-mark.png"`), no se referencian con ruta absoluta: el sitio
  también se publica en GitHub Pages bajo un subdirectorio y `/logo.png` se
  rompería. En `index.html` se usa `%BASE_URL%` por el mismo motivo.

**Layout.** El armazón es `.app-shell` > `.app-body` > `.app-sidebar` +
`.app-main` > `.app-content`. La barra lateral aparece a partir de 1024px;
por debajo, la lista de clientes es un cajón modal (`ClientDrawer`).
`--content-max` (1180px) limita el ancho de lectura: a pantalla completa
las líneas superaban los 150 caracteres.

**Accesibilidad.** Es un requisito, no un extra:

- Todo botón que sólo muestre un emoji necesita `aria-label`.
- Los emojis decorativos van con `aria-hidden="true"`.
- Cada campo lleva `<label htmlFor>` o `aria-label`. Usa `useId()` para los
  identificadores.
- Los diálogos usan `role="dialog"`, `aria-modal` y el hook `useDialogA11y`.
- Los botones de alternancia exponen `aria-pressed`; los desplegables,
  `aria-expanded` + `aria-controls`.
- Nada interactivo debe ser un `<div onClick>`.
- Los mensajes van a una región `role="status"` / `role="alert"`, no a
  `alert()`.

**Fechas.** Usa siempre `fmtDate()` de `utils.js`. No uses `toISOString()`
para obtener una fecha: convierte a UTC y desplaza el día en medio mundo.

**Secretos.** Sólo las variables `VITE_*` llegan al navegador. La clave
`service_role` de Supabase jamás lleva ese prefijo.

## Trampas conocidas

- `App.jsx` separa el enrutado (`App`) del estado (`Workspace`) a propósito:
  llamar hooks después de un `return` condicional rompe la regla de los hooks,
  y oxlint lo marca como error.
- El HTML exportado por `export.js` es autónomo y usa manejadores `onclick`
  en línea. Es correcto: se abre como archivo local, fuera de la CSP del sitio.
- La CSP de `netlify.toml` necesita `'unsafe-inline'` en `style-src` porque
  React aplica la prop `style` como atributo en línea. `script-src` no lo
  lleva y no debe llevarlo.
- El asistente y los modales se anidan dentro de `.overlay`; el scroll del
  fondo lo bloquea `useDialogA11y`, no hace falta añadir nada.

## Documentos relacionados

- `DEPLOY.md` — puesta en producción con Netlify y Supabase vía MCP.
- `docs/auditoria-ux-ui.md` — auditoría de UX, UI, responsive y accesibilidad,
  con lo corregido y lo pendiente.
