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

**Ese `build` a secas NO verifica el panel.** Sin las `VITE_*`, Vite lo
elimina entero y el bundle sale a 137 kB en vez de 500 kB: el build pasa sin
haber compilado lo que acabas de tocar, y el hash del chunk ni siquiera
cambia. Para comprobar de verdad:

```bash
VITE_SUPABASE_URL="https://ejemplo.supabase.co" \
VITE_SUPABASE_ANON_KEY="verificacion-de-build" npm run build
```

## Arquitectura

Aplicación de una sola página en React 19 + Vite. Sin router: `App.jsx`
decide entre dos vistas según la URL.

```
src/
  App.jsx                 Enrutado (App) + puerta de acceso (Panel) + estado (Workspace)
  constants.js            Formatos, estados, planes, meses, categorías
  utils.js                Fechas, IDs, compresión de imágenes, escapado
  api.js                  Llama a las funciones del servidor (IA y ADN)
  export.js               Genera el HTML autónomo que se envía al cliente
  index.css               Sistema de diseño: tokens y clases base
  hooks/useDialogA11y.js  Foco atrapado, Escape y bloqueo de scroll en diálogos
  lib/
    supabase.js           Cliente de Supabase + conversores fila ⇄ aplicación
    auth.js               Sesión, inicio y cierre
    db.js                 CRUD, enlace de aprobación y suscripción a Realtime
    migrateLocal.js       Sube a la nube lo que quedara en el navegador
    exportarContenido.js  Texto de «Exportar ideas y descripciones» (puro)
    completitud.js        Cuánto le falta a una publicación (puro)
  components/
    Icon.jsx              Set de iconos SVG monocromos (rejilla 24, trazo 1.75)
    ClientModal.jsx       Alta y edición de cliente (5 pestañas)
    PlanWizard.jsx        Asistente de 7 pasos para crear un calendario
    CalendarView.jsx      Vista de lista y de rejilla, filtros, generación, envío
  pages/
    Login.jsx             Acceso del administrador
    Aprobar.jsx           Página pública que ve el cliente final
netlify/functions/
  admin-seed.mjs          Alta del administrador desde las variables de Netlify
supabase/
  functions/ai/           Proxy de Anthropic/Groq
  functions/github-adn/   Lectura del ADN de marca con el token del servidor
  migrations/             Esquema, políticas RLS y funciones del enlace
```

### Dónde viven los datos

Todo en Supabase. `localStorage` sólo conserva la marca de migración
(`jads-migrado-a-supabase`) y los datos antiguos (`jads-data`) como red de
seguridad; ya no se leen.

- **clients / calendars:** RLS por `owner_id`. El navegador consulta directo.
- **approvals:** las escribe el cliente final por RPC y la agencia las recibe
  por Realtime. No hay botón de sincronizar.

**Ninguna clave vive en el navegador.** Las de IA y la de GitHub están en los
secretos de Supabase; las credenciales del administrador, en Netlify.

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
`service_role`, las de IA y `ADMIN_PASSWORD` jamás llevan ese prefijo.

Si alguna vez vuelves a ver `api.anthropic.com`, `api.groq.com` o
`api.github.com` en el `connect-src` de `netlify.toml`, es la señal de que
una clave ha vuelto al front: esas llamadas son del servidor.

## Trampas conocidas

- `App.jsx` separa el enrutado (`App`), la puerta de acceso (`Panel`) y el
  estado (`Workspace`) a propósito: llamar hooks después de un `return`
  condicional rompe la regla de los hooks, y oxlint lo marca como error.
- **`isSupabaseEnabled` se resuelve en tiempo de compilación.** Sin las
  variables `VITE_*` en el build, Vite lo constant-folda a `false` y rollup
  elimina el panel entero del bundle (127 kB en vez de 380 kB): el sitio sólo
  muestra el aviso de configuración. Para verificar el bundle hay que
  construir con esas variables definidas, o estarás analizando media
  aplicación.
- Las aprobaciones que llegan por Realtime se vuelcan sobre `days` **sólo en
  el estado** (`onUpdateCalLocal`). Persistirlas dispararía una escritura por
  respuesta, y esa escritura volvería como otro evento: un bucle. La tabla
  `approvals` es la fuente de verdad y se relee al cargar.
- Las funciones `security definer` de Supabase llevan `set search_path = ''`
  y nombres cualificados. Además, este proyecto concede EXECUTE a `anon` por
  defecto en toda función nueva de `public`, y `revoke ... from public` **no**
  deshace una concesión por rol: hay que revocar de `anon` explícitamente.
- El HTML exportado por `export.js` es autónomo y usa manejadores `onclick`
  en línea. Es correcto: se abre como archivo local, fuera de la CSP del sitio.
- La CSP de `netlify.toml` necesita `'unsafe-inline'` en `style-src` porque
  React aplica la prop `style` como atributo en línea. `script-src` no lo
  lleva y no debe llevarlo.
- **Los modelos actuales piensan si no se les dice que no, y ese
  pensamiento se paga del mismo `max_tokens` que el texto.** Sonnet 5 corre
  en modo adaptativo cuando la petición no lleva `thinking`, y su
  presentación viene «omitida»: el bloque llega vacío. Una respuesta puede
  volver con `stop_reason: "max_tokens"` y **sin un solo bloque de texto**.
  Eso se veía como «la respuesta se cortó antes de completar ninguna pieza»,
  y subir el presupuesto o pedir menos publicaciones no lo arreglaba: sólo
  cambiaba cuánto razonaba. `supabase/functions/ai/` fija la política por
  nivel (`Nivel.pensar`) y en «calidad» lo apaga, porque escribir las fichas
  del lote es transcribir un calendario ya aprobado, no razonar. Para
  volver a encenderlo: `AI_PENSAR=adaptativo` en los secretos de Supabase.
- **Al leer la respuesta de Anthropic hay que recorrer TODOS los bloques**,
  no `content.find(b => b.type === "text")`: basta un bloque de pensamiento
  por delante para que ese `find` devuelva `undefined` y el texto llegue
  vacío sin ningún error. La función devuelve además `diagnostico`
  (`stopReason`, tokens de entrada y salida, tipos de bloque) para no tener
  que deducir a qué se fue el presupuesto.
- El asistente y los modales se anidan dentro de `.overlay`; el scroll del
  fondo lo bloquea `useDialogA11y`, no hace falta añadir nada.
- **La carpeta del ADN se guarda escapada.** GitHub escribe los espacios
  como `%20` en la barra de direcciones, así que la ficha de un cliente
  acaba con `Baby%20Caleb/01_ADN_y_Memoria`. Las rutas del árbol que
  devuelve la API vienen SIN escapar: la carpeta no coincidía con ninguna,
  la lectura volvía vacía y el cliente parecía desconectado —sólo los
  clientes con un espacio en el nombre, que es lo que lo hacía invisible—.
  Lo deshace `decodeRutaGitHub()` en `lib/parse.js`, y la función lo
  decodifica otra vez por su cuenta para las fichas viejas. Además, una
  carpeta que no existe en el árbol ahora devuelve 404 con el nombre, en
  vez de 200 con todo vacío.
- **El panel lateral guarda al desmontar, no al pulsar cerrar.** El fondo
  oscuro y la tecla Escape llaman a `onClose` a secas: con el guardado
  colgado sólo del botón, todo lo editado —y todo lo que acababa de
  generar la IA— se perdía sin decir nada. Los tres botones que sacan la
  publicación de su sitio (borrar, mover, banco de ideas) levantan
  `yaEscrito` antes de reescribir el calendario ellos mismos: sin esa
  guarda, el guardado del desmonte llega con el calendario de antes y
  deshace lo que acaban de hacer.
- **El chip del mes reserva sitio para la barra de completado.** `.cal-post`
  lleva `position: relative` y 6px de padding inferior, y la barra va
  absoluta pegada al borde de abajo. La regla de móvil vuelve a declarar el
  padding: si se resetea a `3px 2px`, la barra se come el texto. La pista es
  un blanco translúcido y no un token de color porque el fondo del chip es
  un HSL calculado a partir de la categoría.
- **Rellenar no es reescribir.** «Generar guiones» sólo escribe donde no
  hay nada: lo que ya tiene texto gana sobre lo que devuelve el modelo.
  Y lo que le falta a una publicación depende de su formato —un post sólo
  lleva caption; un reel, además, guion—, así que un reel que llega del
  asistente con la descripción escrita sigue entrando a por su guion.

## Documentos relacionados

- `DEPLOY.md` — puesta en producción con Netlify y Supabase vía MCP.
- `docs/auditoria-ux-ui.md` — auditoría de UX, UI, responsive y accesibilidad,
  con lo corregido y lo pendiente.
