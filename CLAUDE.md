# Notas del proyecto para Claude

Aplicación de la agencia **Juancito Ads** para planificar, generar y aprobar
calendarios de contenido de redes sociales.

## Cómo trabajar aquí

```bash
npm install
npm run dev        # interfaz sola (Vite, puerto 5173)
npm run dev:worker # aplicación + API sobre el runtime real (wrangler)
npm run lint       # oxlint — debe terminar sin errores NI avisos
npm run build      # build de producción a dist/
npm run deploy     # build + wrangler deploy
npm run sembrar    # alta del administrador (ADMIN_EMAIL / ADMIN_PASSWORD)
```

`npm run dev` sirve sólo la interfaz: las llamadas a `/api/*` no van a
ninguna parte. Para trabajar contra la API de verdad, `npm run dev:worker`,
que levanta el Worker con D1 y R2 en local.

**Las operaciones NO se hacen desde una consola.** Desplegar, dar de alta
al administrador, migrar datos y comprobar la infraestructura son
workflows que se lanzan desde la pestaña Actions de GitHub. El
procedimiento completo está en `DEPLOY.md`, y es sólo de navegador.

Y **Cloudflare no se conecta directamente al repositorio**: esa
integración construye y publica en cada push sin pasar por los tests. El
despliegue vive en `.github/workflows/desplegar.yml`, que corre
`npm run verificar` entero y dentro del mismo job antes de publicar
nada, para que no haya forma de saltárselo.

**Un cambio no está terminado hasta que está DESPLEGADO** (decisión de la agencia: dos veces se dio por hecho
algo que sólo estaba en la rama y en el sitio seguía el error). Al acabar: subir la rama, abrir el pull request,
esperar el job `verificar` en verde, unirlo a `main` y seguir el workflow «Desplegar» (`desplegar.yml`, que corre
solo con el push a `main`) hasta que termine bien. Si falla, se arregla y se vuelve a desplegar. Nunca decir
«está en la rama» como si fuera el final.

**Antes de dar por terminado cualquier cambio:**

```bash
npm run verificar
```

Es lint + tests + build + tests de bundle, en ese orden, y es exactamente
lo que ejecuta CI. Si pasa aquí, pasa allí.

**`npm run build` a secas ya vale.** Con Supabase no valía: sin las
`VITE_*`, Vite plegaba `isSupabaseEnabled` a `false`, rollup borraba el
panel entero y el bundle salía a 140 kB en vez de 570 sin que nada
fallara. Esa trampa murió con la migración —la API vive en el mismo
origen y no hay variable de la que dependa qué se compila—, y con ella
`build:verificado` y el canario del bundle.

### Tests

| Comando | Qué comprueba | Necesita |
|---|---|---|
| `npm test` | Lógica y todo lo que se resuelve leyendo el repositorio | Nada |
| `npm run test:bundle` | El `dist/`: peso, caché, minificado | Un build |
| `npm run test:vivo` | Que el cambio de una persona **llega** al socket de la otra | Nada (levanta `wrangler dev`) |
| `npm run test:infra` | El sitio publicado y la cuenta de Cloudflare | Llaves |
| `npm run verificar` | Los cuatro primeros en orden | Nada |

`tests/despliegue/` no comprueba que la aplicación funcione: comprueba
que **lo que se despliega es lo que se cree que se despliega**. La CSP y
las cabeceras —que ahora viven en dos sitios—, el esquema de D1, que
nadie consulte la base por fuera de la capa de acceso, que toda ruta
escrita esté enrutada, el presupuesto de descarga y las trampas de
`docs/trampas/`. Nada de eso se ve mirando la pantalla: el sitio se ve igual con
la CSP puesta que sin ella.

Cada fallo se imprime con **qué, dónde, por qué importa y el arreglo**, y
CI compone con esos campos un `informe-despliegue.md` que sube como
artefacto y comenta en el pull request. El procedimiento para corregir
está en `.claude/skills/arreglar-despliegue/`.

**`main` está protegida:** sin el job `verificar` en verde no se puede
mergear. El nombre del job está en `ci.yml` y en el ruleset del
repositorio; si se renombra en uno, hay que renombrarlo en el otro.

Los tests de migraciones leen el SQL del repositorio: que pasen significa
que la corrección **está escrita**, no aplicada. Para lo aplicado está
`npm run test:infra`, que además busca lo contrario: Workers desplegados
que no estén en ningún commit. Eso ya pasó dos veces —`ai-chat` y
`image-gen`— y el síntoma nunca se parece a la causa.

## Arquitectura

Aplicación de una sola página en React 19 + Vite, con **direcciones de
verdad** (`/cliente/baby-caleb/agosto-2026`) resueltas por un router
propio de 150 líneas: `src/lib/rutas.js`. Sin dependencias nuevas —un
router de librería son 10 kB comprimidos para cinco direcciones— y sin
`hash`: el respaldo de la SPA de `wrangler.jsonc` sirve `index.html` para
cualquier ruta, así que recargar en cualquier sitio funciona.

```
src/                  La aplicación (React): App.jsx (enrutado, acceso y estado), api.js, index.css (tokens)
  components/         Pantallas y piezas de interfaz; cliente/ (pestañas del cliente), calendario/ (el mes y el
                      panel de una publicación), anuncios/, negocio/, cerebro3d/
  hooks/              useDialogA11y, useTareas, useBancoIdeas, useAjustada…
  lib/                La lógica PURA (también la importa el Worker): rutas, motor de textos, director, kit,
                      estudio, video, pauta, campañas… y los clientes de cada /api/* (*Api.js, db.js)
  pages/              Las pantallas de nivel superior y las páginas públicas sin sesión (Aprobar, Informe…)
worker/               El Worker: index.js (enrutado, sesión, cron), hub.js (Durable Object del espacio)
  lib/                Todo lo del servidor: acceso.js (la capa de D1), sesion.js, publicador.js, mcp.js,
                      cerebro/, estudio/ (imagen, video, voz, música, encargos, render), bandeja/, mcpVista/
  rutas/              Una ruta de /api/* por área
container/            El Container (Node + canvas + ffmpeg): cuadros, render a mp4, imágenes para redes
migraciones/d1/       Esquema de D1: una migración por cambio, numeradas
tests/                despliegue/ (lo que se despliega), migracion/ (rutas y lógica), vivo/ (workerd de verdad)
docs/                 Propuestas, análisis, el árbol completo (arquitectura.md) y las trampas por área (trampas/)
```

**El árbol archivo por archivo está en [`docs/arquitectura.md`](docs/arquitectura.md).** Antes de crear un archivo,
búscalo ahí con grep (casi siempre ya hay uno que hace la mitad), y al crear uno, añade su línea.

### Las direcciones

| Dirección | Qué es |
|---|---|
| `/` | Panel, sin cliente elegido |
| `/cliente/<slug>` | Un cliente |
| `/cliente/<slug>/<mes>-<año>` | Un mes del calendario de ese cliente (`octubre-2026`), exista o no su cajón. Los enlaces viejos con el nombre o el id del calendario siguen abriendo su mes |
| `/cliente/<slug>/crear` · `/crear/a-mano` · `/crear/director` · `/crear/galeria` | Crear: «A mano» (el compositor arriba, recordado), el director («¿Qué quieres crear?») y la galería del Estudio |
| `/cliente/<slug>/referencias` · `/referencias/ideas` · `/inspiracion` · `/competencia` | Referencias: el banco de ideas, «Lo mejor» del cliente (`?pieza=<clave>` la señala) y la competencia del estudio de mercado |
| `/cliente/<slug>/marca` · `/marca/ficha` · `/kit` · `/sonido` · `/negocio` · `/whatsapp` · `/cerebro` · `/plan` · `/fechas` · `/drive` | Marca: ficha, kit y voz, música y efectos (la biblioteca de sonido), números del negocio, el kit de WhatsApp y la voz de los clientes, cerebro (con el estudio de mercado), plan semanal, fechas especiales y la carpeta de Drive, con el semáforo del kit arriba |
| `/cliente/<slug>/resultados` · `/resultados/redes` · `/resultados/anuncios` | Resultados del cliente: redes y la revisión 3Q de sus anuncios |
| `/cliente/<slug>/tareas` | Todas las tareas del cliente (con las que se repiten). Ya no es pestaña: su cabecera lleva a Mi día por empresa |
| `/cliente/<slug>/estudio` · `/diseno` · `/ideas` · `/inspiracion` · `/cerebro` · `/ficha` · `/contenido` | Las pestañas de antes: abren la nueva en su sub-sección (Crear → Galería / Director, Referencias → Ideas / Lo mejor, Marca → Cerebro / Ficha / Drive) sin reescribir la dirección, así `?lote=`, `?receta=` y `?pieza=` siguen |
| `/tareas` | Mi día (`?empresa=<id>`: la vista por empresa con la de ese cliente) |
| `/ajustes` | IA, presupuesto, integraciones, tareas, copia de seguridad |
| `/resultados` | Todos los clientes, últimos 30 días |
| `/produccion` | Producción: lo por producir (aprobado por programar, ideas por producir) y la cola de todos los clientes: lo que falló, lo que sale, lo que salió. `/programacion` (su nombre de antes) también |
| `/tablero` | Ya no existe: un enlace viejo abre Producción |
| `/bandeja` | Comentarios y mensajes de Facebook e Instagram de los clientes con la bandeja encendida |
| `/auditorias` | Auditorías de perfil de clientes y prospectos |
| `/biblioteca` | Anuncios → Biblioteca de anuncios: todos por Scrape Creators (con llave) o los de política por la API de Meta; filtros guardados, CSV |
| `/lo-mejor` | «Lo mejor del momento»: lo que mejor funciona de la competencia, la inspiración, los anuncios y lo propio, para recrearlo (`?pieza=<clave>` la señala) |
| `/campanas` | Anuncios → Campañas de Meta: cifras y crear (en pausa) |
| `/plan-campanas?cliente=<id>&mes=AAAA-MM` | Anuncios → Plan de campañas: el ciclo de un cliente y un mes para montarlo en el Ads Manager |
| `/auditoria?t=<testigo>` | Auditoría compartida (sin sesión) |
| `/conectar-claude?…` | El permiso de Claude (OAuth: `authorization_endpoint`) |
| `/a-mano/<calendario>/<publicación>` | Publicar a mano desde el teléfono |
| `/mcp` | El servidor MCP (del Worker, no de la SPA) |
| `/equipo` | Quién entra en el espacio |
| `/invitacion/<testigo>` | Enlace de invitación (sin sesión) |
| `/aprobar?t=<testigo>` | Página del cliente final (sin sesión) |
| `/informe?t=<testigo>` | Informe mensual del cliente final (sin sesión) |
| `/informe-anuncios?t=<testigo>` | Informe de anuncios del cliente final (sin sesión) |
| `/ventas?t=<testigo>` | «Tus ventas de la semana» del cliente final (sin sesión) |
| `/voz?t=<testigo>` | «Tu opinión»: la encuesta para los clientes del cliente (sin sesión) |

El slug sale del nombre normalizado, y `slugsUnicos()` garantiza que dos
clientes que normalicen igual no compartan dirección. Los nombres de las
pestañas (`PESTANAS_CLIENTE`: las nuevas, «tareas» y las de antes) están reservados: un calendario llamado
«Ideas» no puede quedarse `/ideas`. Un id en crudo
también resuelve, para los enlaces que alguien pegara antes.

### El tiempo real

Un **Durable Object por espacio** (`worker/hub.js`), con hibernación de
WebSocket. Cloudflare garantiza una sola instancia por espacio en todo el
mundo: las dos personas, estén donde estén, se conectan a la misma.

```
navegador ──HTTP──> Worker ──escribe──> D1
                       └──difundir()──> Durable Object ──WS──> los demás navegadores
```

Toda escritura de `worker/rutas/datos.js` lleva su `difundir()` pegado.
El aviso NO se espera: si el objeto tarda o falla, la escritura ya entró
en D1 y la respuesta no debe retrasarse por eso. Lo que se pierda se
repone al reconectar, porque **el socket es un atajo y D1 es la verdad**.

### Dónde viven los datos

Todo en Cloudflare: **D1** (`calendarios-db`) para las filas y **R2**
(`juancito-contenido`) para las imágenes. El navegador no consulta la base:
habla con el Worker, que es quien acota.

- **clients / calendars:** el navegador pide, el Worker acota por
  `owner_id`. D1 **no tiene RLS**: la red es `worker/lib/acceso.js`.
- **memberships / invitaciones:** quién entra en el espacio y con qué
  papel. Tienen dueño como las demás, así que pasan por la misma capa.
- **approvals:** las escribe el cliente final por el enlace público. El
  enlace avisa al espacio en el momento, así que la agencia lo ve sin
  recargar; el sondeo de `subscribeApprovals` sigue ahí, a un minuto,
  como red para cuando el socket esté caído. No hay botón de sincronizar.
- **imágenes:** en R2, y en el JSON va la clave, nunca los bytes.
- **banco de contenido:** la carpeta de **Google Drive** de cada cliente
  (`clients.drive_folder`, el id). La tabla `content_bank` es el banco
  de antes y se vacía con «Pasar todo a Drive».

### Qué significa `owner_id`

**El ESPACIO DE TRABAJO, no quien ha iniciado sesión.** Mientras hubo una
sola cuenta las dos cosas coincidían y el nombre no mentía; con dos
personas en la agencia, sí: los clientes son de la agencia y los ve igual
quien los creó que quien entró ayer.

El espacio se identifica por el id del administrador que lo fundó, así
que **las filas de antes siguen valiendo sin tocar ni una**: el
administrador ya era su propio espacio sin saberlo. La sesión devuelve
las dos identidades por separado:

| Campo | Qué es | Para qué |
|---|---|---|
| `usuario.id` | La persona | Quién firma un cambio, quién sale en la presencia |
| `usuario.ownerId` | El espacio | Qué filas puede tocar: es lo que recibe `crearAcceso` |
| `usuario.rol` | `admin` o `editor` | Sólo `admin` invita y saca gente |

Quien traduce «este usuario → este espacio» es `worker/lib/sesion.js`, no
la capa de acceso: la capa necesita el espacio para construirse, así que
no puede ser quien lo averigüe.

**Ninguna clave vive en el navegador, y ahora tampoco ninguna variable.**
Las de IA, la de GitHub y `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` son
secretos del Worker (`wrangler secret put`).

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

**Secretos.** El navegador ya no recibe ninguna variable: la API va en el
mismo origen y no hay nada que configurar desde fuera. Las claves son
secretos del Worker (`wrangler secret put`) y nunca aparecen en
`wrangler.jsonc`, que sí se versiona.

La regla de oro sigue, y ahora es más afilada: el `connect-src` de
`public/_headers` es `'self'` **a secas**. Si alguna vez aparece ahí
`api.anthropic.com`, `api.groq.com`, `api.github.com` —o de nuevo
Supabase—, es la señal de que una clave ha vuelto al front: esas llamadas
son del servidor.

## Reglas de oro

Lo que rompe en silencio, en todas las áreas. El porqué de cada una está en `docs/trampas/`.

1. **D1 no tiene RLS.** Toda consulta va por `worker/lib/acceso.js`, que recibe el dueño al construirse; un `prepare()`
   fuera de los módulos declarados hace fallar un test. Una tabla nueva con dueño se declara en la capa.
2. **Migraciones:** todo `create` con `if not exists`; cambiar un CHECK es reconstruir la tabla; soltar una tabla con hijas
   dispara sus cascadas. Siempre parámetros ligados (D1 corta la fila a 2 MB y la sentencia a 100 kB).
3. **Fechas:** `fmtDate()`, nunca `toISOString()` para un día; el «hoy» es el de Panamá (`fechaEnZona`).
4. **Tiempo real:** toda escritura avisa con `difundir()` sin esperarlo; un evento nuevo necesita su `case` en App.jsx; el
   eco de la propia pestaña se descarta (si hace falta releer, sube el `pulso`). El socket es un atajo: D1 es la verdad.
5. **No pisar a nadie:** el panel de una publicación guarda al DESMONTAR; lo que escribe el servidor en un calendario va con
   su `updated_at` como condición (`worker/lib/estudio/ponerEnPost.js`) y avisa `calendario:recargar`.
6. **Imágenes en R2, en el JSON la clave.** Nada de `data:` en una fila. Lo que se sirve sin sesión, por su ruta firmada.
7. **Topes de peso** (`tests/despliegue/rendimiento.bundle.test.js`): la carga inicial y el chunk del Estudio están al
   límite. Lo nuevo va en componentes lazy; mide antes de añadir.
8. **IA:** toda llamada pasa por `prepararIA`/`bloqueoPorPresupuesto` al salir y `registrarConsumo` al volver
   (`worker/lib/configIA.js`). Una función nueva se declara en `FUNCIONES_IA` con su hueco. Qué modelo escribe y cuánto
   razona lo decide el ESPACIO en Ajustes → IA, no el código. Recorre TODOS los bloques de la respuesta.
9. **Costo:** desde 0,50 $ el SERVIDOR exige `confirmado: true` (salvo «crear imágenes sin preguntar»); video, voz y
   música preguntan siempre. Lo que propone la IA no se guarda solo.
10. **Ninguna clave en el navegador:** `connect-src 'self'` a secas en `public/_headers`. Las cabeceras viven en DOS sitios:
    `_headers` y `worker/lib/respuesta.js`.
11. **El cron cabe en el plan:** 50 peticiones y 50 consultas por invocación; una tarea pesada por vuelta.
12. **Publicar no se repite nunca:** el id que devuelve la red se guarda antes que nada; lo que sale es lo que hay en D1.
13. **Un identificador sin importar revienta al renderizar** y el build no lo ve (`no-undef` en oxlint lo caza); una
    refactorización se prueba ABRIENDO la pantalla en Chromium, no sólo con `npm run verificar`.
14. **Interfaz:** sin emoji como icono (`Icon.jsx`), sin `window.confirm` ni `alert`, `Interruptor.jsx` para lo que se
    enciende, `useDialogA11y` en todo diálogo, `--tap` en lo pulsable, nunca por debajo de `--fs-3xs`.
15. **Lo que no se ha probado contra el servicio real se dice** (en el código, en la trampa y al entregar).
16. **Guardar un mes va con su versión:** el PUT del calendario lleva el `updated_at` que se leyó y contesta 409 si otra
    persona guardó; la pantalla junta por publicación y vuelve a guardar. El MCP también va con versión (`guardarDias`: si otro guardó,
    repite la herramienta). Un guardado sin versión (lo de antes) sigue.
17. **Las páginas públicas tienen su propia entrada** (`vite.publico.config.js`, `npm run build` hace las dos): /aprobar y
    compañía no cargan la aplicación de la agencia. Lo que se añada ahí, ligero.
18. **El cron se escribe en `correrCron`** (`worker/lib/salud.js`): cada tarea con su nombre; su salud (último éxito, error,
    fallos seguidos) se ve en Ajustes → Salud. Una tarea nueva va en esa lista, no como un `if (...) return` suelto.

## Trampas conocidas, por área

Son más de 380 entradas: cosas que ya pasaron o que no se ven leyendo el código. **Antes de tocar un área, lee su
archivo** (o búscalo con grep: `grep -n "<tema>" docs/trampas/*.md`). Una trampa nueva va AL FINAL del archivo de su área,
no aquí.

| Archivo | Qué cubre |
|---|---|
| [`base-datos-y-despliegue.md`](docs/trampas/base-datos-y-despliegue.md) | D1 y la capa de acceso, migraciones, sesión, CSP y cabeceras, Vite y el bundle, el cron, el Durable Object, subir archivos |
| [`ia-asistente-y-claude.md`](docs/trampas/ia-asistente-y-claude.md) | Modelos y razonamiento, Anthropic y Meta, consumo y presupuesto, caché, el asistente, el conector MCP |
| [`cerebro.md`](docs/trampas/cerebro.md) | Notas e índice, lo interno, ficha y cifras, importar desde GitHub, lo que aprende |
| [`calendario-y-textos.md`](docs/trampas/calendario-y-textos.md) | El mes y las semanas, plan semanal, estrategia, el motor de ideas y textos, fechas especiales, UGC, el asistente del mes |
| [`estudio-e-imagen.md`](docs/trampas/estudio-e-imagen.md) | Trabajos y encargos, motores de imagen, kit, director de arte, lote, carruseles, control de calidad, logo, galería y papelera |
| [`video-y-sonido.md`](docs/trampas/video-y-sonido.md) | Reel por planos, video animado y su render, voz, música, «con tu canción», «publicar con música» |
| [`publicar-redes-y-cliente.md`](docs/trampas/publicar-redes-y-cliente.md) | La cola y cada red, preparar imágenes, historias, aprobación y enlace del cliente, Drive, Bandeja, métricas, informes |
| [`anuncios-y-negocio.md`](docs/trampas/anuncios-y-negocio.md) | Curso de campañas, plan de campañas, revisión 3Q, pauta, número mágico, negocio, ventas, WhatsApp, estudio de mercado |
| [`referencias-y-lo-mejor.md`](docs/trampas/referencias-y-lo-mejor.md) | Banco de ideas, Inspiración, «Lo mejor», competencia, Biblioteca de anuncios, Scrape Creators |
| [`equipo-tareas-y-pantalla.md`](docs/trampas/equipo-tareas-y-pantalla.md) | Mi día y tareas, avisos, papeles, navegación, componentes compartidos de la interfaz |

## Documentos relacionados

- `docs/propuesta-estudio-y-meta.md` — el Estudio de Agents Office —imagen y video por trabajos,
  por cliente— y Meta (Muse Spark) como proveedor de la IA de texto. Implementado: el Estudio
  entero (imágenes y video por Google, fal.ai y Higgsfield; «Crear con IA» y «Animar» en el panel
  de la publicación y en «Subir»; las herramientas del asistente y del MCP; el cerebro para imagen;
  la lista de modelos ordenable). Pendiente: toda la parte de Meta como proveedor de texto, y
  probar fal.ai y Higgsfield con una llave real.
- `DEPLOY.md` — puesta en producción en Cloudflare: Worker, D1, R2 y el corte.
- `docs/auditoria-estudio-mcp.md` — auditoría del Estudio por MCP (2026-11-18): errores del diseño, del video y del
  sonido, el director, el contexto que le llega a Claude, los cuellos de botella y lo que la app hace y el MCP no; lo que
  se toma de rea-video, HyperFrames y lemo-opuscar (y por qué no se instalan), el plan en nueve entregas y cómo se
  usa después. Revisada el 2026-11-19: arriba, lo SEGURO (S1–S10, implementado), lo que hay que medir y lo que queda fuera.
- `docs/auditoria-ux-ui.md` — auditoría de UX, UI, responsive y accesibilidad,
  con lo corregido y lo pendiente.
- `docs/migracion-cloudflare.md` — plan para mover la aplicación de Supabase +
  Netlify a Cloudflare (D1, R2, Workers). Escrito sobre la base viva, no sobre
  el repositorio: incluye dónde los dos no coinciden.
- `docs/propuesta-publicacion.md` — propuesta para la experiencia de publicar
  (Flow a 4:5, historias, colaboradores, página de programación, MCP).
- `docs/propuesta-idea-programada.md` — aprobar la idea o la pieza final, y el
  paso final antes de programar lo aprobado. Implementada (sin que salga sola).
- `docs/propuesta-equipo.md` — trabajar en equipo en tres fases (responsables,
  avisos, hilo, etapas, revisión interna, tablero, historial, papeles, carga).
  Implementada.
- `docs/propuesta-calendario-continuo.md` — un calendario siempre activo (sin crear
  uno por mes), capas de planificación, fuera categorías; qué limpiar; el móvil.
  Fase 1 y la limpieza, implementadas; fases 2 a 4, pendientes.
- `docs/hub-cloudflare.md` — plan del hub donde este calendario pasa a ser una
  herramienta más, junto al bot y la tienda que ya están en Cloudflare.
- `docs/propuesta-higgsfield-con-claude.md` — lo que el MCP de Higgsfield hace «con Claude» (recetas, flujos,
  galerías, modelos), qué es exclusivo suyo, qué ya tiene el calendario y la estructura para hacerlo aquí: recetas como
  dato, «Crear con Claude» con handoff, el director y el lote por MCP con imágenes en el resultado, terminar en el
  Container lo que hoy necesita la pantalla y que el render acepte video. Investigación hecha (sólo lectura, sin gastar
  créditos). Hecho: el video animado (render, música, subtítulos, ver un cuadro por MCP). Lo que falta, por fases A–H
  y comparado con `main` del 2026-11-05, en su §10.
- `docs/propuesta-lo-mejor-y-creacion.md` — «Lo mejor del momento» (una galería de lo que mejor funciona, de la
  competencia, la inspiración, los anuncios y lo propio, para recrearlo con un clic) y la auditoría de toda la creación
  de contenido: caminos que no aplican las mismas reglas, puertas y nombres de más, motor de textos, video y navegación,
  con el plan por fases. Propuesta; nada implementado.
- `docs/propuesta-curso-campanas.md` — el curso de campañas de Meta Ads de la agencia (Parte 1: interacción a
  WhatsApp) cruzado con la app: qué está y qué falta. La dirección: las campañas se MONTAN en el Ads Manager y el
  calendario planifica, escribe y vigila (la creación por API, congelada). Fases: lo que va a pauta nace como anuncio
  (`post.pauta`, textos de anuncio), número mágico y 3 Q sobre lo que corre en el Ads Manager, la campaña completa
  sugerida con su guía de montaje, qué pieza es cada anuncio, WhatsApp. Las cuentas son las de la agencia (los Excel
  del curso y la calculadora de deeplook), con sus fórmulas confirmadas. El PLAN FINAL (§5: cómo queda cada pantalla,
  los datos y 8 entregas en orden) está aprobado y las ocho entregas, implementadas (sin probar contra Meta ni la IA reales). Se amplía con cada parte del curso.
- `docs/propuesta-edicion-video-grabado.md` — el EDITOR DE VIDEO GRABADO: un chat nuevo de Claude edita los clips de una
  persona hablando a cámara con lo que guarda el calendario (manual del editor con versiones, estilo de edición por
  cliente, kit de piezas Python + Remotion descargable, actas y aprendizaje que propone), con las decisiones de la agencia
  (§11). Fase 1 (el manual del editor, con versiones, en Ajustes), 2a (el kit: corte y sonido, `kit_edicion`) y 2b (la
  imagen: recorte con RVM, cámara virtual, piezas de Remotion, muestras y render por tramos; Rofer v2 rehecho lado a
  lado, §14) implementadas; 3 a 6, pendientes.
- `docs/propuesta-cerebro-por-cliente.md` — un cerebro por cliente (notas en D1, índice
  en R2, ficha técnica y cifras, búsqueda por pasajes) en lugar de volcar el ADN entero
  en cada llamada. Fases 0 y 1 implementadas; memoria de decisiones, visualización,
  PDF/Word/Excel, Estudio, Meta y el puente con Agents Office, pendientes.
