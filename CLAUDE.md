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
escrita esté enrutada, el presupuesto de descarga y las trampas de este
archivo. Nada de eso se ve mirando la pantalla: el sitio se ve igual con
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
src/
  App.jsx                 Enrutado (App) + puerta de acceso (Panel) + estado (Workspace)
  constants.js            Formatos, estados, planes, meses, categorías
  utils.js                Fechas, IDs, compresión de imágenes, escapado, iniciales
  api.js                  Llama a las funciones del servidor (IA y ADN)
  export.js               Genera el HTML autónomo que se envía al cliente
  index.css               Sistema de diseño: tokens y clases base
  hooks/useDialogA11y.js  Foco atrapado, Escape y bloqueo de scroll en diálogos
  hooks/useConfigIA.js    El modelo y el razonamiento del espacio, releídos con `pulso`
  lib/
    filas.js              Conversores fila ⇄ aplicación
    auth.js               Sesión, inicio y cierre
    db.js                 Llama a /api/*; conserva todas sus firmas
    equipo.js             Miembros, invitaciones y perfil propio
    rutas.js              Slugs, análisis y construcción de direcciones (puro)
    vivo.js               WebSocket: reconexión, latido, presencia
    horas.js              «9am» → «09:00» y vuelta (puro)
    lote.js               Editar muchas publicaciones de una vez (puro)
    exportarContenido.js  Texto de «Exportar ideas y descripciones» (puro)
    completitud.js        Cuánto le falta a una publicación (puro)
    agenda.js             «Mi día»: hoy, atrasos, periodos de las recurrentes (puro;
                          también lo importa el Worker)
    foco.js               La empresa en foco de cada persona, por día
    configIA.js           Nombres de modelos y niveles de razonamiento (puro)
    mensajeChat.js        Marcas del chat: piezas, imágenes, contexto (puro)
    medios.js             Fotogramas de video, imagen para la IA, descarga a tamaño
    drive.js              Id de carpeta a partir del enlace, tipo y tamaño (puro;
                          también lo importa el Worker)
    buscar.js             Lo que encuentra el buscador Ctrl+K (puro)
    resumenCliente.js     Por aprobar / con cambios / a medias; mes por defecto (puro)
    publicacion.js        Qué se publica, límites de cada red, qué ve el cliente, a qué
                          hora sale (puro; también lo importa el Worker)
    cola.js               La cola de publicación resumida para la rejilla y el panel, la
                          página Programación y «Programar lo aprobado» (puro)
    resultados.js         De las filas de métricas a cifras, formatos, horarios (puro)
    colores.js            Colores y logo de la marca a partir del ADN (puro)
    semanas.js            La vista de lista por semanas: agrupar, resumen, cuál se abre (puro)
    subir.js              «Subir»: formato deducido, redes por defecto, rellenar lo vacío con
                          la propuesta de la IA, poner o mover una publicación de día (puro)
    auditoria.js          Auditoría de perfil: cifras, usuario, límites de Instagram (puro;
                          también lo importa el Worker)
  components/
    Icon.jsx              Set de iconos SVG monocromos (rejilla 24, trazo 1.75)
    Presencia.jsx         Avatares, estado de la conexión, «X está editando»
    SelectorFecha.jsx     Calendario del mes para escoger una fecha (portal)
    SeccionIA.jsx         Ajustes → IA: modelo, nivel al escribir, nivel del asistente
    SeccionPresupuesto.jsx  Ajustes → presupuesto, qué pasa al llegar, consumo por día/cliente
    SeccionDrive.jsx      Ajustes → Integraciones: conectar Google Drive
    SeccionMeta.jsx       Ajustes → Integraciones: conectar Meta y asignar cuentas
    SeccionTikTok.jsx     Ajustes → Integraciones: TikTok de cada cliente y su modo
    SeccionInformes.jsx   Resultados → informes mensuales: generar, revisar, compartir
    InformeVista.jsx      El informe como documento (claro, con la marca, imprimible)
    AuditoriaVista.jsx    La auditoría de perfil como documento, con copiar y portadas
    Graficas.jsx          Línea y barras en SVG, sin librería
    MedidorIA.jsx         El gasto del mes contra el presupuesto, en la cabecera
    SubirRapido.jsx       «Subir»: cliente → archivo → la IA escribe → cuándo sale (diálogo)
    calendario/cuandoSale.jsx   «¿Cuándo sale?» del panel: Ahora / Programar / La publico yo
    calendario/horaSugerida.jsx La hora con mejores resultados, compartida por los dos
    ExploradorDrive.jsx   La carpeta de Drive de un cliente: gestionar o escoger
    BancoSelector.jsx     Escoger de Drive (o del banco anterior); forma única
    PestanaContenido.jsx  La pestaña Contenido: Drive + migrar el banco anterior
    NavPrincipal.jsx / MenuCuenta.jsx / BarraInferior.jsx / Buscador.jsx
                          Armazón: secciones, cuenta, barra del móvil, Ctrl+K
    ClientModal.jsx       Alta y edición de cliente (5 pestañas)
    PlanWizard.jsx        Asistente de 7 pasos para crear un calendario
    CalendarView.jsx      Vista de lista y de rejilla, filtros, generación, envío
  pages/
    Login.jsx             Acceso
    Equipo.jsx            Quién entra en el espacio; invitar y sacar
    Invitacion.jsx        Lo que ve quien abre un enlace de invitación
    Aprobar.jsx           Página pública que ve el cliente final
    Tareas.jsx            «Mi día»: Atrasadas, Hoy, Próximas; y la vista por empresa
    Resultados.jsx        La pestaña Resultados de un cliente y /resultados (la agencia)
    Programacion.jsx      /programacion: lo que sale en todas las cuentas; lo que falló, arriba
    Auditorias.jsx        /auditorias: auditar el perfil de un cliente o de un prospecto
    AuditoriaPublica.jsx  Lo que abre el cliente o el prospecto con el enlace (sin sesión)
    ConectarClaude.jsx    /conectar-claude: el permiso que pide Claude (OAuth)
    PublicarAMano.jsx     /a-mano/…: publicar desde el teléfono (música, stickers…)
    Informe.jsx           Lo que ve el cliente al abrir su informe mensual (sin sesión)
    Ajustes.jsx           IA, presupuesto y consumo, integraciones, tareas, copia
worker/
  index.js                Enrutado, sesión y cabeceras de /api/*
  hub.js                  Durable Object: un espacio, sus sockets y su presencia
  lib/
    acceso.js             La capa que sustituye a las políticas RLS
    sesion.js             PBKDF2, cookie __Host-, espacio de trabajo e invitaciones
    vivo.js               Difundir un cambio al espacio; la firma de quién lo hizo
    publico.js            El enlace de aprobación, sin sesión
    respuesta.js          Cabeceras y errores de la API
    flujoAnthropic.js     El SSE de Anthropic, reconstruido en mensaje (puro)
    anthropic.js          La llamada a Anthropic: streaming, reintento, rechazo con motivo
    configIA.js           Modelo y razonamiento del espacio, Opus de la cuenta, costo,
                          presupuesto (`prepararIA`, `bloqueoPorPresupuesto`)
    google.js             OAuth de Drive, refresh token cifrado, llamadas a Drive,
                          «¿está dentro de la carpeta del cliente?»
    firmas.js             Cifrar y firmar con el secreto de una integración (HKDF)
    meta.js               OAuth de Meta, cliente de la Graph API, cuentas, medios firmados
    publicador.js         La cola: programar, procesar (Instagram/Facebook/TikTok), reintentos
    tiktok.js             OAuth de TikTok por cliente, tokens que se renuevan, subida en trozos
    metricas.js           La foto diaria de métricas de cada cuenta y de la competencia
    informes.js           Cifras del mes (congeladas) + análisis de la IA; el del día 1
    auditorias.js         Leer un perfil (cuenta propia o business_discovery) y auditarlo
    mcp.js                Las herramientas de Claude por MCP (consulta + escritura)
    herramientasServidor.js  Lo que el asistente consulta sin el navegador:
                          web, repositorio de GitHub, calendarios, tareas, ideas
    ids.js                UUID, testigos, huellas
  rutas/
    datos.js              CRUD: clientes, calendarios, chat, tareas, banco
    equipo.js             Miembros e invitaciones; la ruta pública del enlace
    ia.js                 Generación del calendario (Anthropic/Groq)
    iaEspacio.js          Modelos de la cuenta y consumo del mes
    chat.js               El asistente: streaming, bucle de herramientas de
                          servidor y resumen de conversaciones largas
    imagen.js             Generación de imágenes (Gemini)
    video.js              Análisis de un video del banco (Gemini)
    adn.js                Lectura del ADN de marca con el token del servidor
    drive.js              Google Drive como banco: listar, miniatura, archivo,
                          subir, papelera, a-publicacion, migrar-banco
    iaEspacio.js          Modelos de la cuenta, consumo del mes y el medidor (/ia/gasto)
    redes.js              Conectar Meta, asignar cuentas, la cola (/api/publicar) y el
                          medio público firmado que descarga Meta
    metricas.js           Resultados de un cliente, de la agencia y la miniatura de Meta
    informes.js           Informes: listar, generar, compartir; el público va en index.js
    auditorias.js         Auditorías: listar, generar, compartir; la pública va en index.js
    mcp.js                El servidor MCP (/mcp), su OAuth (/oauth/*, /.well-known/*) y
                          el permiso y las conexiones (/api/mcp/*)
migraciones/d1/           Esquema de D1 (0001 base … 0012 aprobación, 0013 redes, 0014 métricas, 0015 informes, 0016 variantes, 0017 auditorías, 0018 mcp)
scripts/migracion/        Volcado desde Supabase, conversión e importación
tests/
  utils/                  Lector de wrangler.jsonc y _headers, fallos e informe
  despliegue/             Plantillas, secretos, migraciones, funciones, acceso,
                          tiempo real, bundle
  migracion/              Conversión, capa de acceso, enlace público, equipo
                          y enrutado (pide las rutas del Worker de verdad)
  vivo/                   Levanta workerd y comprueba que el cambio de una
                          persona LLEGA al socket de la otra
```

### Las direcciones

| Dirección | Qué es |
|---|---|
| `/` | Panel, sin cliente elegido |
| `/cliente/<slug>` | Un cliente |
| `/cliente/<slug>/<slug-del-mes>` | Un calendario de ese cliente |
| `/cliente/<slug>/tareas` · `/contenido` · `/ideas` · `/resultados` · `/ficha` | Las otras pestañas del cliente |
| `/tareas` | Mi día |
| `/ajustes` | IA, presupuesto, integraciones, tareas, copia de seguridad |
| `/resultados` | Todos los clientes, últimos 30 días |
| `/programacion` | La cola de todos los clientes: lo que falló, lo que sale, lo que salió |
| `/auditorias` | Auditorías de perfil de clientes y prospectos |
| `/auditoria?t=<testigo>` | Auditoría compartida (sin sesión) |
| `/conectar-claude?…` | El permiso de Claude (OAuth: `authorization_endpoint`) |
| `/a-mano/<calendario>/<publicación>` | Publicar a mano desde el teléfono |
| `/mcp` | El servidor MCP (del Worker, no de la SPA) |
| `/equipo` | Quién entra en el espacio |
| `/invitacion/<testigo>` | Enlace de invitación (sin sesión) |
| `/aprobar?t=<testigo>` | Página del cliente final (sin sesión) |
| `/informe?t=<testigo>` | Informe mensual del cliente final (sin sesión) |

El slug sale del nombre normalizado, y `slugsUnicos()` garantiza que dos
clientes que normalicen igual no compartan dirección. Los nombres de las
pestañas (`PESTANAS_CLIENTE`) están reservados: un calendario llamado
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

## Trampas conocidas

- `App.jsx` separa el enrutado (`App`), la puerta de acceso (`Panel`) y el
  estado (`Workspace`) a propósito: llamar hooks después de un `return`
  condicional rompe la regla de los hooks, y oxlint lo marca como error.
  `App` sí llama un hook ahora —`useRuta`—, pero antes de su primer
  `return`; la separación es lo que impide que alguien meta el siguiente
  después.
- **D1 no tiene RLS, y con una sola cuenta no se nota.** Supabase tenía
  dieciséis políticas haciendo de segunda red: aunque el código pidiera mal
  los datos, Postgres no devolvía filas de otro dueño. Aquí no hay nada. Una
  consulta a la que se le olvide el `owner_id` **no falla**: devuelve datos
  ajenos, en silencio. La red es `worker/lib/acceso.js`, que recibe el dueño
  **al construirse** —no en cada llamada, que es donde se olvidaría—, y
  `tests/despliegue/acceso.test.js`, que falla si aparece un `prepare()`
  fuera de los tres módulos declarados.
- **Una migración que no se puede reaplicar para el despliegue entero.** El
  esquema de la fase 1 se aplicó a mano sobre la D1 viva, así que
  `d1_migrations` quedó vacía: al desplegar, wrangler no sabía que
  `0001_esquema.sql` ya estaba puesto y lo reaplicó. Murió en la primera
  sentencia —«table users already exists»— y el paso «Desplegar el Worker»
  ni se intentó. El síntoma no se parece a la causa: el SQL era correcto y
  los 263 tests pasaban. Por eso **todo `create` del esquema lleva
  `if not exists`**, y `tests/despliegue/migraciones.test.js` falla si
  aparece uno que no lo lleve.
- **Las filas importadas no pertenecen a quien las tenía en Supabase.**
  El `owner_id` que traen es de un usuario de GoTrue, y en D1 no existe:
  el administrador se siembra aparte, con un UUID nuevo. La primera
  importación real murió en el primer cliente con «FOREIGN KEY constraint
  failed», que no dice ni qué clave ni por qué. Lo resuelve
  `resolverDueno()`, y tampoco casa por correo —aquí la agencia entra con
  uno distinto del que tenía—: con un dueño a cada lado la
  correspondencia es evidente, y con más de uno para en vez de adivinar.
- **Un ensayo que no toca la base no comprueba nada de la base.** El
  ensayo de la migración pasó en verde y la importación real cayó a la
  primera fila. Ahora las LECTURAS sí se hacen en ensayo —la de usuarios,
  que es la que faltaba—; sólo se saltan las escrituras.
- **La clave del banco de contenido lleva prefijo.** En Supabase la ruta
  era `{clientId}/{uuid}.jpg`; en R2 todo cuelga de `clientes/`, y la
  ruta de medios del Worker lo exige para saber de qué cliente es el
  archivo. Una clave sin prefijo no la sirve nadie, y el fallo es mudo:
  la fila está, el objeto está, y la imagen no carga. Lo normaliza
  `claveBanco()`, que usan el volcado y la importación para que la fila
  y el objeto coincidan.
- **D1 corta la fila a 2.000.000 bytes y la sentencia a 100.000.** Las
  imágenes iban en base64 dentro del JSON: el calendario de agosto ocupaba
  501.884 caracteres con 12 de 25 publicaciones ilustradas. Por eso viven en
  R2 y en el JSON va la clave. Si algo vuelve a escribir un `data:` ahí, la
  fila crece hasta que D1 la rechaza, y el límite de sentencia hace que ni
  siquiera se pueda importar con un `INSERT` literal: **siempre parámetros
  ligados**.
- **Sacar una imagen del JSON rompe dos cosas que nadie mira.**
  `export.js` mete `post.image` como `src` del HTML autónomo, que se abre
  como fichero local: una ruta `/api/media/…` no resuelve contra nada. Y
  `CalendarView.jsx` manda la imagen a Anthropic como base64. Los dos
  necesitan rehidratar desde R2.
- Las aprobaciones que llegan del sondeo se vuelcan sobre `days` **sólo en
  el estado** (`onUpdateCalLocal`). Persistirlas dispararía una escritura por
  respuesta. La tabla `approvals` es la fuente de verdad y se relee al cargar.
  `subscribeApprovals` conserva su firma: devuelve con qué pararlo, y sin eso
  cambiar de calendario deja sondeos vivos acumulándose.
- El HTML exportado por `export.js` es autónomo y usa manejadores `onclick`
  en línea. Es correcto: se abre como archivo local, fuera de la CSP del sitio.
- La CSP de `public/_headers` necesita `'unsafe-inline'` en `style-src`
  porque React aplica la prop `style` como atributo en línea. `script-src` no
  lo lleva y no debe llevarlo.
- **El tope de PBKDF2 sólo existe en producción.** workerd rechaza más
  de **100.000 iteraciones por llamada** a `deriveBits`
  —«Pbkdf2 failed: iteration counts above 100000 are not supported»—, y
  ese tope **no lo aplican ni `wrangler dev` ni Node**. Con 210.000 de
  una vez, entrar devolvía «Error interno» en el sitio publicado
  mientras en local funcionaba y los 278 tests seguían verdes. Por eso
  `derivar()` encadena vueltas de 100.000 hasta sumar las 600.000 que
  recomienda OWASP: el coste para quien intente adivinar la contraseña
  es el mismo y ninguna llamada pasa del tope.
  El caso que lo vigila espía lo que se le pide a `crypto.subtle`,
  porque ejecutarlo en cualquier entorno de pruebas pasa igual.
- **El alta y el acceso no pueden tener dos implementaciones del hash.**
  `scripts/sembrar-admin.mjs` reimplementaba PBKDF2 por su cuenta. Dos
  copias del mismo cálculo es una que se queda atrás: el día que una
  cambie un parámetro, el hash guardado deja de cuadrar y nadie entra
  —y el síntoma es «contraseña incorrecta», que no apunta a nada—.
  Ahora el script importa `hashearContrasena` del Worker, y un test
  falla si vuelve a nombrar `deriveBits`.
- **La página salía EN BLANCO y los 278 tests estaban en verde.** `base`
  de `vite.config.js` estaba condicionado a `GITHUB_ACTIONS` —de cuando
  el sitio se publicaba en GitHub Pages bajo un subdirectorio—, así que
  el build de CI, **que es el que se publica**, pedía los recursos en
  `/CALENDARIOS-MARKETING-APP/assets/…`. Esa ruta no existe; el respaldo
  de la SPA devuelve `index.html` con `content-type: text/html`; y el
  navegador se niega —bien— a ejecutar HTML como módulo. Título correcto
  en la pestaña, cero errores en el registro, y nada en pantalla.
  En local funcionaba, porque en local no hay `GITHUB_ACTIONS`.
  Lo peor: **un test exigía la condición** («usa base relativa cuando
  publica en GitHub Pages»), así que la suite defendía el fallo. Ahora
  hay tres guardas: `base` fija, un caso de bundle que comprueba que
  cada ruta de `dist/index.html` exista en `dist/`, y uno en vivo que
  exige que el JavaScript se sirva **como** JavaScript.
- **Las cabeceras de seguridad viven en DOS sitios.** `public/_headers` vale
  para el HTML y los recursos; **no se aplica a lo que genera el Worker**. Lo
  de `/api/*` lo pone `worker/lib/respuesta.js`. Traducir la configuración
  vieja a `_headers` y quedarse ahí deja la API sin `nosniff`, sin
  `Cache-Control` y sin CSP —y el sitio se ve exactamente igual—.
- **En D1 el boolean es 0/1, y `rowToCalendar` hace
  `row.share_enabled !== false`.** Con un `0`, eso da `true`: un enlace
  desactivado se vería activo. Las rutas convierten a booleano antes de
  devolver la fila; si se quita esa conversión, no falla nada, sólo miente.
- **El testigo de compartición se reutiliza, nunca se regenera.** Abrir el
  enlace de un calendario que ya lo tenía devuelve el mismo: generar uno
  nuevo mataría los enlaces que el cliente ya tiene en su correo.
- **Los modelos actuales piensan si no se les dice que no, y ese
  pensamiento se paga del mismo `max_tokens` que el texto.** (Historia:
  hoy el razonamiento va ENCENDIDO a propósito, ver la entrada siguiente.) Sonnet 5 corre
  en modo adaptativo cuando la petición no lleva `thinking`, y su
  presentación viene «omitida»: el bloque llega vacío. Una respuesta puede
  volver con `stop_reason: "max_tokens"` y **sin un solo bloque de texto**.
  Eso se veía como «la respuesta se cortó antes de completar ninguna pieza»,
  y subir el presupuesto o pedir menos publicaciones no lo arreglaba: sólo
  cambiaba cuánto razonaba. Porque escribir las fichas
  del lote es transcribir un calendario ya aprobado, no razonar. Lo fija
  `worker/rutas/ia.js` por nivel (`niveles()`) y en «calidad» lo apagaba.
- **Qué modelo y cuánto razona lo decide el ESPACIO, no el código.**
  Había tres modelos repartidos sin que se vieran: Haiku para casi todo
  el calendario —los guiones profesionales los escribía el más pequeño
  sin que nadie lo hubiera decidido—, Sonnet sin razonar para las fichas
  y Opus 5.5 fijo en el chat. Ahora TODA la IA de texto lee
  `ajustes_espacio.ia_modelo` («sonnet» por defecto, u «opus») e
  `ia_razonamiento` («alto» por defecto), que cambia sólo el
  administrador en Equipo → Inteligencia artificial (`worker/lib/configIA.js`).
  El razonamiento va siempre encendido y se le suma su margen
  (`MARGEN_RAZONAMIENTO`) al presupuesto que pide el navegador: sin él
  vuelve la trampa de arriba. El `tier` que manda el navegador ya no
  elige nada. Imágenes y video siguen en Gemini.
- **Un id de modelo fijo es una apuesta sobre la cuenta, y se perdió.**
  Con `claude-opus-5-5` fijo, el primer «Hola» devolvió «El proveedor de
  IA devolvió un error»: la clave no tenía ese modelo y el mensaje
  genérico lo escondía (lo mismo que pasó con Gemini). Tres guardas:
  «opus» se resuelve preguntando a `/v1/models` cuál tiene la cuenta; si
  aun así la cuenta rechaza el modelo, se vuelve a Sonnet 5 y se avisa;
  y cualquier otro rechazo enseña el motivo de Anthropic
  (`mensajeDeRechazo()` en `worker/lib/anthropic.js`). Todo pasa por esa
  librería y en streaming: con razonamiento, una respuesta puede tardar
  minutos, y sin streaming la API rechaza lo que podría pasar de diez.
- **Cada llamada deja su costo en `consumo_ia`.** Es lo que enseña el
  contador del mes en Equipo. `registrarConsumo()` no puede tumbar una
  respuesta: si falla, se pierde un apunte, no el guion.
- **El asistente tiene DOS bucles, y cada herramienta vive en uno.** Las
  de servidor (búsqueda web y lectura de páginas de Anthropic; repositorio
  de GitHub; ver_calendario/tareas/ideas) las encadena el Worker sin
  volver al navegador. Las que ESCRIBEN en el calendario abierto siguen en
  el navegador, que sabe no pisar lo que la persona está editando: cuando
  el modelo pide una, el Worker cierra el turno con `resultadosServidor`
  y el navegador junta los suyos en el MISMO mensaje —la API exige todos
  los tool_result de una vuelta juntos—. Y lo que el Worker devuelve en
  `mensajes` se reenvía TAL CUAL: los bloques de razonamiento llevan
  firma, y tocados son un 400. Entre turnos no se reenvían: el historial
  guardado es texto.
- **Lo que el asistente hace se guarda con su respuesta.** Va plegado como
  `[[contexto: Acciones realizadas]]`: antes sólo se guardaba el texto y
  «¿qué cambiaste ayer?» no tenía respuesta. El historial ya no se corta
  en 50 mensajes: pasado el umbral, lo viejo se pliega en `chat_resumenes`
  y el modelo recibe resumen + recientes enteros.
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
  lleva `position: relative` y 8px de padding inferior, y la barra va
  absoluta pegada al borde de abajo. La regla de móvil vuelve a declarar el
  padding: si se resetea a `3px 2px`, la barra se come el texto. La pista es
  un blanco translúcido y no un token de color porque el fondo del chip es
  un HSL calculado a partir de la categoría.
- **El chip del mes es un BOTÓN, y medía 24px.** Por debajo de `--tap-sm`
  (36) y de `--tap` (44), y encima arrastrable. Metía cinco cosas en una
  sola línea con `nowrap` —punto, icono, etiqueta, hora y barra—, así que
  la etiqueta acababa SIEMPRE en puntos suspensivos: el texto estaba y no
  servía. Ahora son dos filas en rejilla (`grid-template-areas`): arriba
  estado, formato y hora; abajo el texto a todo el ancho, hasta dos
  líneas. La hora en la misma fila le robaba media columna —la celda mide
  ~1/7 de la pantalla— y era la causa real del recorte, no la longitud.
  `--tap-sm` y no `--tap` a propósito: a 44px un mes de cinco semanas con
  cuatro publicaciones por día no entra en ninguna pantalla. Es el caso de
  «control denso» del sistema de diseño, y quien trabaje a dedo tiene la
  vista de lista.
- **En móvil el chip no decía NADA.** La regla de `max-width: 599px`
  ocultaba `.cal-post-label` **y** `.cal-post-time`, y el comentario decía
  «se reduce a icono + hora» —describía algo que el CSS no hacía—. Quedaba
  un punto de color y un icono de formato: en el teléfono no había forma
  de saber qué era ninguna publicación sin abrirla. Ahora la etiqueta va a
  una línea recortada, que distingue «Promo…» de «Educa…»; la hora sí se
  cae, que ahí no cabe.
- **Algo puede llamarse «own X» y no acotar nada.** Las tres políticas del
  banco de contenido decían «can read/delete own content-bank» y su única
  condición era `bucket_id = 'content-bank'`: cualquier sesión autenticada
  leía —y borraba— los archivos de todos los clientes. Con una sola cuenta de
  agencia no se nota nada. Esa misma forma de fallo es la que la capa de
  acceso existe para impedir, y por eso sus tests recorren **todas** las
  tablas con dueño en un bucle: añadir una la mete en el test sola.
- **Algo desplegado a mano no está en ningún commit.** `ai-chat` corrió
  semanas con código que no estaba en el repositorio, e `image-gen` corrió
  meses entera sin existir aquí. El síntoma no se parece a la causa: campos
  que faltan, respuestas recortadas, y un diff limpio. `wrangler deploy` sube
  el Worker entero, así que el desajuste de «una carpeta se quedó fuera» ya
  no puede darse; lo que sí puede es una ruta escrita y **no enrutada**, y
  eso lo vigila `tests/despliegue/funciones.test.js`. El test en vivo busca
  lo contrario: Workers desplegados que nadie declara.
- **«No puedo» de la IA casi nunca es del modelo: es que no le diste la
  herramienta.** `publishTime` existe en el modelo de datos desde el
  principio, pero no estaba en el esquema de ninguna de las herramientas
  del asistente, así que a «ponle las 9 de la mañana» contestaba que no
  podía —y era verdad—. Antes de tocar el prompt o cambiar de modelo,
  mira `getChatTools()` y el contexto de `buildChatSystemPrompt()`: lo
  que no está declarado ahí no existe para la IA.
  El mismo fallo al revés: los datos SÍ estaban —descripción y guion van
  en el contexto— y aun así decía que no podía leerlos, porque la lista
  de «QUIÉN ERES» enumeraba sólo crear, editar y eliminar. Un modelo se
  ciñe a lo que le dicen que puede hacer, aunque tenga el dato delante.
- **Un filtro declarado y no implementado no falla: acierta por
  casualidad.** `editar_publicaciones_lote` declaraba `filtro_dia`,
  `filtro_formato` y `filtro_categoria`, y el ejecutor **no los leía**:
  aplicaba los cambios por `post_id` y ya. Como la IA además mandaba los
  ids correctos, el resultado salía bien y nadie lo notó. El día que
  confiara en el filtro habría editado lo que no era. Ahora la lógica
  vive en `lib/lote.js`, que es pura y tiene sus casos.
- **Una hora que el campo no entiende se guarda igual y desaparece.**
  El modelo escribe «9am», «9:00 PM» o «21:30» según le venga. Si eso
  entra tal cual en `publishTime`, el `<input type="time">` —que exige
  «HH:MM»— lo muestra **vacío**: la IA dice que puso la hora, la fila se
  guardó, y la publicación no tiene hora. Lo normaliza
  `normalizarHora()`, y lo que no entiende se RECHAZA con un mensaje en
  vez de escribirse.
- **El asistente global vuelca TODAS las publicaciones en el prompt, y
  eso tiene fecha de caducidad.** Hoy son cuatro clientes y cabe. El
  coste se paga en CADA mensaje, aunque la pregunta sea «hola», y crece
  con la agencia: a partir de cierto punto desplaza la conversación y
  hay que cambiarlo por consultas —que la IA pida lo que necesita en vez
  de recibirlo todo—. La descripción ya se recorta a 120 caracteres para
  que quepa, que es la primera señal.
- **Un fichero de 3.000 líneas hace que las guardas dejen de guardar.**
  `CalendarView.jsx` tenía 3.034 líneas y diecisiete componentes dentro.
  El test que exige `useDialogA11y` en todo fichero con `role="dialog"`
  pasaba en verde **porque la cadena aparecía en algún otro sitio del
  mismo fichero**: bastaba con que uno de los diecisiete lo llamara. Al
  partirlo salió lo que tapaba — el desplegable de la hora se anunciaba
  como diálogo sin foco atrapado—. Con ficheros por componente, la
  granularidad del test es la del componente.
  Al partir también hay que declarar qué usa cada pieza, que es lo que
  el ámbito común no obligaba a hacer: dos de los componentes movidos
  arrastraban importaciones que nunca habían necesitado.
- **Un hook sin importar no lo ve el lint, ni el build: revienta al
  renderizar.** Al meter `useCallback` en `CalendarView.jsx` no se añadió
  al `import` de react. oxlint no lo marca, `vite build` compila, los 425
  tests pasan, y el bundle se publica. Falla al RENDERIZAR, con
  «useCallback is not defined» — y como el fallo está en el árbol de la
  vista CON SESIÓN, abrir el sitio sin entrar no lo reproduce: la
  pantalla de acceso se pinta perfecta. El síntoma es la página en blanco
  con el título correcto en la pestaña, igual que la trampa del `base` de
  Vite, y tampoco apunta a su causa.
  Lo vigila `tests/despliegue/capas.test.js`, que compara los hooks
  LLAMADOS con los importados en cada fichero. Sólo cuenta llamadas y
  descarta comentarios: `rutas.js` nombra `useState` al explicar por qué
  la dirección ya no es estado.
  La lección más general: **una refactorización que mueve código entre
  ficheros hay que probarla en la pantalla que usa ese código**, no sólo
  con `npm run verificar`. La que lo cazó fue cargar la vista autenticada
  en Chromium con una sesión de verdad.
- **Y no eran sólo los hooks: el mismo corte se dejó cuatro
  constantes.** `FORMAT_ICONS`, `fieldHeaderStyle`, `vivo` y
  `CAMPOS_EXPORTABLES` se quedaron sin importar al partir
  `CalendarView.jsx` en seis ficheros. Con ellas quedaron rotos el
  **panel de edición de una publicación** —el centro de la aplicación—,
  el banco de ideas en cuanto tiene algo dentro, el diálogo de «Exportar
  ideas y descripciones» y «Agregar publicación». Los cuatro revientan
  al abrirlos con «FORMAT_ICONS is not defined», y los cuatro estuvieron
  así **en producción** con todo en verde: lint limpio, 426 tests, build,
  bundle y tiempo real.
  Por qué no lo vio el caso de arriba: vigila los HOOKS. La forma del
  fallo no es «un hook sin importar», es **un identificador sin
  importar**, y ahí caben las constantes.
  Lo cubre ahora `no-undef` en `.oxlintrc.json`, que corre en
  `npm run lint` y por tanto en `verificar` y en CI. Lleva `env.browser`
  a propósito: sin declarar el entorno marcaría `document`, `window` y
  `fetch` en cada fichero, y esa avalancha es justo la razón por la que
  alguien acabaría apagando la regla. Que siga encendida —y con su
  entorno— lo vigila `tests/despliegue/capas.test.js`.
  Y la lección de la entrada anterior, otra vez: **lo que caza esto es
  abrir la pantalla**. El panel de edición no se abre desde la lista
  —hay que desplegar el día y pulsar «Editar publicación»—, así que un
  barrido que sólo pulsa lo que se ve a primera vista lo da por bueno.
- **Un desplegable anclado a un botón NO es `role="dialog"`.** Ese rol
  le promete a un lector de pantalla foco atrapado y fondo inerte. El
  selector de hora se cierra con Escape y con un clic fuera, y el fondo
  sigue navegable a propósito: es `role="group"`. Poner el rol de
  diálogo «porque flota» obliga después a meter un `useDialogA11y` que
  rompería justo lo que hace que funcione.
- **Rellenar no es reescribir.** «Generar guiones» sólo escribe donde no
  hay nada: lo que ya tiene texto gana sobre lo que devuelve el modelo.
  Y lo que le falta a una publicación depende de su formato —un post sólo
  lleva caption; un reel, además, guion—, así que un reel que llega del
  asistente con la descripción escrita sigue entrando a por su guion.
- **El acceso ponía la cookie y no cambiaba de pantalla.** `Login.jsx`
  llamaba a `signIn()` y **no hacía nada con lo que devolvía**: el
  comentario decía «no hace falta navegar, onAuthStateChange levanta el
  workspace», y `onAuthStateChange` se fue con Supabase. Aquí no hay
  ningún canal que se dispare solo. El servidor respondía 200, ponía la
  cookie `__Host-`, y la pantalla de acceso se quedaba quieta; al
  recargar sí entrabas, porque el arranque pregunta a `/api/yo`. Ahora
  `useSession` devuelve `setSession` y Login lo llama —igual que
  `Invitacion`—. Lo vigila `tests/despliegue/tiempo-real.test.js`.
  **La regla general: la sesión es de quien la pinta.** Cualquier pantalla
  nueva que abra sesión tiene que propagarla a mano.
- **Qué se está mirando NO es estado: es la dirección.** `selectedClientId`
  y `selectedCalId` eran `useState`, y por eso recargar devolvía al
  principio, el botón de atrás sacaba de la aplicación y no había forma de
  mandarle a nadie «mira esto». Ahora salen de la URL con `porRuta()` y se
  cambian con `navegar()`. Dos cosas que hay que recordar al tocarlo:
  `pushState` **no dispara `popstate`**, así que `navegar()` lo lanza a
  mano o la barra cambia y la pantalla no; y justo después de crear algo,
  el slug hay que calcularlo sobre la lista **que va a haber**, no sobre la
  que hay, o se navega a una dirección que todavía no resuelve.
- **El Durable Object te devuelve tu propio guardado, y te pisa lo que
  estabas escribiendo.** El evento de un cambio va a TODOS los conectados
  —llegó por HTTP, así que el objeto no sabe de qué socket salió—, y eso
  incluye a quien lo hizo. Aplicarse el propio eco parecía inofensivo
  hasta que se ve el síntoma: guardas, sigues tecleando, y a los 300 ms
  el cursor salta y la última palabra desaparece. Lo corta el id de
  **PESTAÑA** (`X-Pestana` en `src/lib/db.js`, que vuelve en `por.tab`).
  Por pestaña y no por persona a propósito: el panel abierto en el
  portátil y en el móvil sí tiene que verse.
- **Un evento que el servidor manda y nadie recoge no falla.** La
  escritura fue bien, la respuesta fue 200, y la otra persona sigue
  viendo lo de antes hasta que recargue. Con una sola sesión abierta
  —que es como se mira siempre— es invisible. Por eso hay un test que
  compara los `tipo: "x"` del Worker con los `case "x"` de `App.jsx`: si
  añades un evento y no lo atiendes, falla al escribirlo, no en
  producción.
- **Que el tiempo real esté ESCRITO no es que llegue.** Los 27 casos de
  `tests/despliegue/tiempo-real.test.js` se resuelven leyendo ficheros:
  comparan los `tipo:` con los `case`, buscan el `difundir()` pegado a
  cada escritura, comprueban que el objeto usa `acceptWebSocket`. Con
  todos en verde, el tiempo real puede estar muerto: entre lo escrito y
  lo que llega están el binding `HUB` —sin él `difundir()` hace `return`
  y no se entera nadie—, la ruta `/api/live`, la cookie que el socket
  lleva o no lleva, y que las dos personas caigan en el **mismo** objeto.
  Las cuatro fallan calladas, con la misma cara: la fila entra en D1, la
  respuesta es 200, y la otra persona sigue viendo lo de antes.
  Lo ejecuta `npm run test:vivo` (`tests/vivo/`), que levanta workerd de
  verdad y mira el socket de la otra persona. Trece segundos, sin llaves,
  y está dentro de `verificar`: un test que sólo se lanza a mano no
  defiende nada.
- **`/api/entrar` no existe: la ruta de acceso es `/api/acceso`.** Pedir
  a una ruta que no está devuelve **401 «No autenticado»**, no un 404,
  porque la comprobación de sesión va antes de que nadie mire el camino.
  Así que un error de nombre se disfraza de «credenciales incorrectas» y
  se puede pasar media tarde depurando el acceso. Un 401 sólo dice algo
  del acceso si el cuerpo es «Usuario o contraseña incorrectos.».
- **Una escritura remota no puede pisar lo que tienes a medias.** Si
  alguien guarda el mismo calendario que estás editando, aplicar su
  versión te borra el buffer sin decir nada. `App.jsx` comprueba
  `pendingSaves`/`saveTimers` antes de aplicar y, si hay algo pendiente,
  **avisa en vez de pisar**: lo tuyo se queda, y se ofrece releer.
- **En los Durable Objects, `new_sqlite_classes` y no `new_classes`.**
  Los de almacenamiento SQLite son los que entran en el plan gratuito;
  con `new_classes` el despliegue pide plan de pago y el error habla de
  facturación, no de que la clase esté mal declarada. Y la clase se
  **reexporta desde `worker/index.js`**, que es el módulo al que apunta
  `main`: exportándola sólo desde `hub.js`, el despliegue muere con
  «class not found».
- **Un aviso que aparece solo cada poco deja de querer decir algo.** El
  sondeo de aprobaciones anunciaba «tu cliente acaba de responder» en
  CADA vuelta, respondiera alguien o no. Ahora compara una huella de lo
  que ya había visto y sólo habla si de verdad cambió algo.
- **Sacar a alguien del equipo borra su cuenta, no sólo su pertenencia.**
  Dejar la cuenta viva sin fila en `memberships` es peor: al volver a
  entrar, la resolución de espacio la trata como un administrador sin
  sitio y le funda un espacio propio y vacío. La persona ve una
  aplicación que funciona y no tiene nada dentro, y nadie sabe por qué.
  Al fundador no se le puede sacar: ahí la cascada sí se llevaría los
  clientes y los calendarios, que cuelgan de su id.
- **La subida de imágenes estaba escrita, desplegada y muerta.** `POST
  /api/media` iba en un `if` posterior al que valida la clave, y a `POST`
  no le llega ninguna clave: `partes` vale `["media"]`, la clave sale
  vacía, y el `if (!m) return noEncontrado("Archivo")` de arriba
  contestaba 404 antes de que nadie mirase el método. Leyendo el fichero
  las dos ramas están ahí y las dos parecen bien. Es la misma forma del
  fallo de `ai-chat` —código en el commit que no se ejecuta nunca—, pero
  DENTRO de `worker/index.js`, donde `funciones.test.js` no llega: ese
  test sólo vigila `worker/rutas/`. Lo cubre ahora
  `tests/migracion/enrutado.test.js`, que **pide las rutas de verdad**
  con un `env` de mentira en vez de leer el fichero. Si añades una rama a
  esta puerta, ponle su caso ahí: leerla no basta para saber si alguien
  llega.
- **`.wrangler/` no se versiona.** Estuvo versionado por descuido hasta
  que se sacó. Es la D1 y el R2 de `wrangler dev`: cada arranque
  reescribe catorce ficheros `.sqlite-shm`/`.sqlite-wal`, y quien levante
  el Worker en local contra datos de verdad acaba con clientes reales
  dentro de un binario que nadie mira antes de hacer commit. Misma
  familia que `scripts/migracion/datos/`. (El que había en el historial
  estaba vacío: no llegó a colarse ningún dato.)
- **Lo que no es prosa en el chat viaja DENTRO del texto, como marca.**
  `chat_messages.content` es texto, así que las piezas copiables
  (`[[pieza: …]]`), las imágenes generadas (`[[imagen: clave | formato]]`)
  y el análisis de lo adjuntado (`[[contexto: …]]`) se guardan como
  marcas y `partirMensaje()` (`lib/mensajeChat.js`) las convierte en
  bloques al pintar. Las de pieza las escribe el MODELO porque se le pide
  en `INSTRUCCION_PIEZAS`: si un día salen juntas otra vez, mira el prompt
  antes que el pintado. Una clave de imagen que no cuelgue de `clientes/`
  se queda como texto: nunca llega a un `src`.
- **La API de Claude no recibe video.** El video lo ve Gemini
  (`worker/rutas/video.js`, por su Files API para no pasar decenas de
  megas a base64 dentro del Worker) y el análisis escrito se guarda en el
  mensaje del usuario, para que el hilo lo recuerde después. Los
  fotogramas los saca el navegador y sólo viajan en ese turno. Un video
  subido desde el chat se guarda antes en el banco del cliente: el
  análisis lee de R2.
- **`post.image` es una ruta `/api/media/…`, y el cliente final no tiene
  sesión.** La página de aprobación la reescribe a
  `/api/publico/<testigo>/media/…` (`srcPublico()`), y `mediaPermitida`
  acepta la imagen en las dos formas. El HTML exportado las incrusta
  antes de construirse (`conImagenesIncrustadas`), y lo que se manda a la
  IA pasa por `base64DeImagen()`: mandar la ruta como si fuera base64
  hace que Anthropic rechace la petición entera. Las imágenes viejas en
  `data:` siguen valiendo.
- **Las tareas terminadas se borran solas al LEER, no con un cron.**
  `purgarTareas()` corre en cada GET de tareas según
  `ajustes_espacio.purga_tareas`. Una tarea recurrente no se borra nunca
  —ni a mano ni sola—: es la definición de algo que vuelve.
- **Una tarea recurrente se completaba una vez y no volvía nunca.**
  `recurrence` se guardaba y se pintaba, pero nada la reabría: la de los
  lunes, hecha un lunes, seguía cerrada para siempre. Ahora el Worker la
  reabre AL LEER (`reabrirRecurrentes()`, junto a la purga) cuando empieza
  su periodo siguiente. Las fechas las calcula `src/lib/agenda.js`, el
  MISMO módulo que usa «Mi día»: dos copias de «qué semana es» acaban
  discrepando, y entonces la tarea sale atrasada en pantalla y cerrada en
  la base. El «hoy» es el de Panamá (`fechaEnZona`), nunca `toISOString()`.
- **Las fechas de las tareas se escogen en un calendario, no se teclean.**
  El `<input type="date">` pedía día, mes y año a mano y cada navegador lo
  pintaba distinto. `SelectorFecha` abre el mes y se toca el día. Va en un
  PORTAL con posición fija y su propio nivel (`--z-sobre-dialogo`): dentro
  del panel de tareas (`overflow: hidden`) o del diálogo de edición, un
  desplegable normal salía recortado o debajo del fondo oscuro. Es un
  desplegable, no un diálogo: rol de grupo, Escape y clic fuera.
- **«Hoy» es una FECHA, no un sí/no.** `today_date` guarda el día en que
  se marcó: si no se hace, al día siguiente queda en el pasado y la tarea
  pasa sola a Atrasadas sin que nadie la desmarque.
- **El saldo de Anthropic se acabó sin que nadie lo viera.** El contador
  existía, al fondo de Equipo, sin tope, y sin contar ni la búsqueda web
  (10 $ por 1.000) ni lo que se paga a Google. Ahora: medidor en la
  cabecera, Ajustes con presupuesto (`presupuesto_usd`, 30 $ por defecto)
  y qué hacer al llegar (`al_limite`: avisar, bajar a Sonnet Bajo o
  detener, 402). TODA llamada de IA pasa por `prepararIA()` (texto) o
  `bloqueoPorPresupuesto()` (Gemini) antes de salir, y por
  `registrarConsumo()`/`registrarConsumoGemini()` al volver. Una ruta de
  IA nueva que se salte cualquiera de las dos gasta sin tope o sin
  apuntarlo. Lo que gaste OTRA aplicación con la misma clave no lo ve
  nadie aquí: sólo la consola de Anthropic.
- **Escribir caché que nadie lee cuesta un 25 % más.** El consumo real
  del asistente enseñó 49.000 tokens escritos en caché y 0 leídos: los
  mensajes llegaban con horas de diferencia y la caché dura cinco
  minutos. El navegador manda `seguido` (menos de 4,5 min desde la
  anterior) y el Worker sólo marca caché entonces o desde la segunda
  vuelta del bucle, que sí la lee.
- **El saldo agotado llega como un 400 cualquiera.** «Your credit balance
  is too low…» se traduce en `mensajeDeRechazo()` a qué hacer.
- **Google Drive: tres trampas.** (1) Con la app de Google «en prueba»,
  el refresh token caduca a los 7 días: tiene que estar «en producción».
  Si Google lo revoca (`invalid_grant`), la fila se borra y la pantalla
  pide reconectar. (2) Una cuenta de servicio NO sirve: no tiene espacio y
  no sube a un Drive personal; entra la cuenta de la agencia por OAuth.
  (3) El Picker de Google carga scripts de Google: rompería la CSP. Todo
  pasa por `/api/drive/*`.
- **Cada id de Drive que llega del navegador se comprueba subiendo por
  sus padres hasta la carpeta del cliente** (`dentroDelCliente`). Sin
  eso, con la sesión de la agencia se leería cualquier archivo suyo.
- **Lo que se sirve desde Drive no puede ejecutarse en este origen.** Un
  `.html` o un `.svg` servido tal cual sería código con la sesión de la
  agencia: sólo imagen (sin SVG) y video van en línea, lo demás como
  descarga, y todo con `sandbox` y `nosniff`. Lo vigila
  `tests/migracion/enrutado.test.js`.
- **La imagen de Drive que va en una publicación se COPIA a R2**
  (`a-publicacion`). La página de aprobación y el HTML exportado no
  pueden leer el Drive de la agencia.
- **La vuelta del OAuth (`/api/drive/callback`) va SIN sesión**: la
  identidad viaja en el `state` firmado con HMAC y atado a la cookie
  `__Host-drive-oauth` de la pestaña que lo pidió. Sin la cookie, un
  enlace de conexión reenviado conectaría el Drive de otra persona al
  espacio de quien lo generó.
- **El asistente es diálogo o panel según el ancho.** Desde 1280 px se
  acopla a la derecha (`role="complementary"`, `useDialogA11y(…, {
  activo: false })`): sin foco atrapado ni fondo oscuro. Por debajo,
  diálogo como siempre.
- **`connect-src 'self'` ya cubre el WebSocket.** En una página `https`,
  `'self'` casa con `wss:` del mismo host —lo dice la especificación de
  CSP—. Si alguien ve el socket caer y «lo arregla» metiendo un origen
  ahí, rompe la regla de oro: un tercero en `connect-src` es la señal de
  que una clave ha vuelto al navegador.

- **Instagram no deja programar por API: la hora la cumple el cron.**
  `scheduled` en `worker/index.js`, cada minuto, procesa
  `publicaciones_programadas` (`worker/lib/publicador.js`). Publicar en
  Instagram son varios pasos —contenedor, esperar a que Meta lo procese,
  publicar— y un reel no cabe en una vuelta: cada paso guarda su avance y
  la siguiente sigue. Lo que NUNCA se repite es publicar: el id que
  devuelve Meta se guarda antes que nada, y a partir de ahí un fallo deja
  la fila «publicada con aviso» en vez de reintentar (sería un duplicado
  en el perfil del cliente). Dos vueltas a la vez se evitan reservando la
  fila con su `updated_at` como condición.
- **Lo que caduca a los 60 días es el token de la PERSONA, no el de las
  páginas.** El de usuario (`integracion_meta`) sólo sirve para listar
  páginas («Actualizar cuentas»). Publicar y medir usan el token de cada
  página (`cuentas_sociales.token_cifrado`), que se pide con el de larga
  duración y por eso no vence (salvo que se cambie la contraseña, se
  quite la app o se pierda el rol en la página: entonces, reconectar).
  Decirle a la agencia que «tiene que renovar cada 60 días» es falso y
  ya se dijo una vez; la pantalla lo explica bien ahora.
- **Meta DESCARGA los medios: no se le suben.** Los de R2 están detrás de
  la sesión, así que se le da `/api/medio-publico/<testigo>/<nombre>`,
  firmado con `META_APP_SECRET`, que abre ESE archivo y caduca en tres
  días. Va antes de la sesión en `worker/index.js`, igual que la vuelta
  del OAuth (`/api/redes/meta/callback`, atada a la cookie
  `__Host-meta-oauth`). La cola necesita saber el dominio sin petición
  delante: lo guarda `integracion_meta.origen` al conectar.
- **Instagram sólo publica JPEG, y el Worker no puede convertir.** El
  panel convierte con el lienzo antes de programar
  (`prepararMediosParaMeta` en `lib/medios.js`) y de paso apunta las
  medidas, que es lo que deja comprobar la proporción del feed (4:5 a
  1.91:1) al escribir y no a la hora de salir. «Programar al aprobar»
  corre en el servidor sin navegador: si la imagen no es JPEG, lo avisa
  al equipo en vez de programar.
- **Lo que sale es lo que hay en D1, no lo que hay en pantalla.** Antes de
  programar, el panel guarda el calendario YA (sin esperar al agrupado de
  600 ms), y la cola relee la publicación del calendario antes del primer
  paso. Mover una publicación de día u hora mueve lo programado
  (`resincronizarCalendario`, en el PUT del calendario); quitarla lo
  cancela; que el cliente pida cambios, también.
- **Un campo de archivo se vacía al resetearlo, y su `files` con él.**
  `const fs = e.target.files; e.target.value = ""` dejaba `fs` vacío y la
  subida de imágenes del panel no salía nunca, sin error. Copiar la lista
  ANTES de resetear (`[...e.target.files]`).
- **El cron vive dentro de los límites del plan GRATUITO de Workers:**
  50 peticiones de salida y 50 consultas a D1 por invocación. Por eso la
  cola publica tres por vuelta, la foto de métricas es UNA cuenta por
  vuelta (~30 llamadas a Meta) y sólo si la cola no tenía nada, y
  «Actualizar ahora» en Resultados mide cuenta a cuenta, una petición
  cada una. Las escrituras en serie van en `acceso.guardarVarios`, que
  las manda en un lote. Una tercera tarea periódica que se sume a la
  misma vuelta pasa del límite y falla a medias, sin avisar.
- **Meta sólo guarda unos días de historia: los seguidores de hace un mes
  sólo existen si se apuntaron.** La foto es de AYER (el último día
  completo), desde las 6:00 de Panamá. Cada grupo de métricas se pide por
  su lado: Meta retira y renombra (`impressions` → `views`), y una
  métrica que falla deja su hueco vacío, no la foto entera. Una cuenta
  cuyo token no vale se apunta con `datos.error` para no bloquear a las
  demás, y la pantalla la salta.
- **Las miniaturas de Instagram no se pintan tal cual:** la CSP dice
  `img-src 'self'`. Pasan por `/api/metricas/miniatura`, que sólo sirve
  imágenes de `*.cdninstagram.com` y `*.fbcdn.net`. Ampliar la CSP a esos
  dominios sería abrir la puerta a cualquier imagen de Meta.
- **TikTok no es Meta: una conexión POR CLIENTE.** No hay un usuario de
  agencia que vea todas las cuentas; cada una se conecta entrando con
  ella. Por eso existe el enlace firmado para el cliente
  (`/api/redes/tiktok/inicio/<firmado>`, sin sesión, una semana), que
  abre el permiso en SU teléfono y deja la cuenta en SU ficha. El token
  de acceso dura 24 horas: `tokenTikTok()` lo renueva y GUARDA el nuevo
  (TikTok puede cambiar también el de renovación; perderlo obliga a
  reconectar). Sin auditar, la publicación directa sale en privado: el
  modo por defecto es Borrador, que llega a la bandeja del cliente.
- **A TikTok el video se le SUBE, en trozos, desde R2.** Que lo descargue
  de una URL exige verificar el dominio, y en workers.dev no se puede.
  Cada trozo es un rango de R2 que pasa tal cual (sin cargarlo en
  memoria). El `publish_id` se guarda sólo cuando la subida terminó: a
  partir de ahí nunca se abre otra, que sería un segundo video.
- **Las cifras del informe NO las escribe la IA.** Las calcula
  `src/lib/resultados.js` —el mismo código que la pestaña Resultados— y
  se CONGELAN en `informes.contenido`; la IA sólo escribe el análisis con
  esas cifras delante y la orden de no inventar ninguna. Si el informe y
  la pantalla dicen números distintos, alguien calculó por su cuenta.
  Regenerar conserva el testigo: el enlace que el cliente ya tiene sigue
  valiendo. El automático sale del día 1 al 5, desde las 9:00, después de
  la cola y de las fotos (ver `scheduled`).
- **La impresión general oculta todo `<header>` y los `.overlay`**
  (`index.css`, para imprimir un calendario). El informe tiene portada en
  un `<header>` y la vista previa de la agencia vive en un diálogo: sin
  las excepciones de `InformeVista.css`, el PDF salía sin portada, o en
  blanco desde la vista previa.
- **Una publicación puede salir DOS veces por red: el post y su
  historia.** Cada salida es una fila de la cola con su `variante`
  (`post` | `historia`); `piezasDe()` dice cuáles tocan y
  `publicacionDeVariante()` convierte el post en la historia (sus medios
  son `post.historias`). Al reprogramar, lo que ya salió o está saliendo
  se SALTA en vez de fallar: si no, añadir la historia a un post ya
  publicado obligaría a borrar la fila publicada.
- **Una tanda de historias sale una a una, y nunca se repite una.** El
  avance vive en `carga.tanda` (`i`, `ids`); una tanda que falla a medias
  queda «publicada» con cuántas faltaron. Mismo principio que
  `externo_id`: publicar es lo único que no se reintenta.
- **La imagen de Flow (3:4) no se recorta: se ADAPTA una copia.**
  `post.adaptados["feed|<src>"]` (o `"historia|<src>"`) es la copia 4:5 o
  9:16 que sale en esa red; el original lo siguen viendo Facebook, el
  cliente y la página de aprobación. La hace el NAVEGADOR al programar
  (`prepararParaRedes` en `lib/medios.js`): el Worker no puede tocar
  imágenes, así que el servidor, sin copia, sigue dando error.
  `revisarPublicacion(…, { navegador: true })` convierte ese error en aviso
  para el panel; sin la opción, la regla es la estricta.
- **El panel de una publicación se carga aparte** (`lazy` en
  `CalendarView.jsx`, con su `publicar.css`). El JS principal estaba en
  107,6 kB de un tope de 110 y el CSS inicial en 10,5 de 12: lo que sólo
  usa el panel no va al arranque.
- **Programar una y programar muchas son LA MISMA regla.** `programar()` y
  `programarLote()` (worker/lib/publicador.js) llaman a `planificar()`,
  que no toca la base: se le da leído lo común (cuentas, Meta, la cola del
  calendario) y devuelve qué crear y qué sustituir. Uno a uno, «Programar
  lo aprobado» de un mes de veinte publicaciones pasaba de las 50
  consultas por invocación del plan gratuito; en lote son cuatro lecturas
  y un `guardarVarios`. Un caso lo vigila contando los `prepare()`.
- **Lo que falla en la cola no se puede perder en un aviso.** El cron
  publica sin nadie delante, así que el aviso del momento se va si nadie
  miraba. Lo que no salió se queda en tres sitios hasta que se reintenta o
  se descarta: el número rojo de «Programación» en la navegación
  (`?fallidas=1`, una lectura corta porque se repite con cada `pulso`),
  el bloque de Mi día y el primer bloque de /programacion, con el motivo.
- **El panel de una publicación tiene dos pestañas sobre el MISMO `form`.**
  Contenido planifica; Publicar (`calendario/seccionPublicar.jsx`) va en el
  orden en que se publica: redes, medios (arrastrar, pegar con Ctrl+V,
  reordenar), vista previa, texto, revisión y una barra fija con la hora y
  los botones. Cambiar de pestaña no guarda ni pierde nada: el guardado
  sigue siendo al desmontar el panel.
- **La vista previa pasa cada imagen por el mismo lienzo que el
  programado** (`vistaAjuste`, `calendario/vistaRed.jsx`). Si enseñara el
  original, volvería a mentir sobre lo que Instagram corta: ése era el
  fallo de la vista previa anterior.
- **Cada problema lleva su arreglo, pero la regla sigue siendo una.**
  `revisarPublicacion()` devuelve además `arreglos` (por texto del
  problema: `{ codigo, etiqueta }`) y `aplicarArreglo()` lo aplica; los
  dos son puros y tienen sus casos. Un arreglo sólo toca lo que dice
  —quitar una red, mover los hashtags al comentario, recortar a 30—, y
  «quitar la red» no se ofrece si es la única: no arreglaría nada.
- **La hora sugerida no sale con pocos datos** (`horaSugerida()` en
  `lib/resultados.js`): dos publicaciones ese día de la semana en la
  misma franja, o cuatro en la franja contando toda la semana. Con menos,
  nada: una sugerencia sacada de una publicación es ruido con aspecto de
  consejo.
- **Una auditoría de un PROSPECTO se lee con la cuenta de otro.**
  `business_discovery` pide una cuenta de Instagram conectada del espacio
  desde la que mirar, y sólo lee cuentas de empresa o creador. Una
  personal devuelve un error de Meta que no dice eso («Invalid user id»):
  `leerPerfil()` lo traduce y ofrece las capturas, que es además lo único
  que enseña los destacados (la API no los da nunca). `client_id` puede
  ir vacío: un prospecto no es cliente.
- **La IA juzga la rejilla MIRÁNDOLA.** La foto de perfil y las nueve
  últimas publicaciones van como imágenes (bajadas del CDN de Meta en el
  Worker, nunca como URL en el texto). Las cifras las calcula
  `cifrasPerfil()` y lo propuesto pasa por `limpiarAnalisis()`, que tira
  la biografía que pase de 150 caracteres: una que no entra en Instagram
  no sirve para copiar y pegar. La foto se guarda incrustada porque el
  enlace público no tiene sesión para pasar por el proxy de miniaturas.
- **El MCP vive FUERA de `/api`, y eso obliga a tocar `run_worker_first`.**
  `/mcp`, `/oauth/*` y `/.well-known/oauth-*` los fija el estándar o se
  pegan en claude.ai; sin estar en `run_worker_first` de wrangler.jsonc,
  el respaldo de la SPA contesta `index.html` con un 200 y Claude dice
  «no se pudo conectar» sin más. La pantalla de permiso, en cambio, SÍ
  es de la SPA (`/conectar-claude`): así se entra con la sesión de
  siempre, y la puerta de acceso sale sola si no la hay.
- **El token del MCP es una sesión: vive en `sesion.js` y se guarda en
  huella.** Queda atado a la persona y a SU espacio (se construye la capa
  de acceso con el `owner_id` del token), el código sirve una vez, PKCE
  S256 es obligatorio y el de renovación se rota en cada uso. Desconectar
  en Ajustes → Claude borra la fila y corta al momento.
- **Claude es el asistente, no llama al asistente.** Las consultas del MCP
  son las MISMAS funciones del asistente (`crearEjecutor`); las escrituras
  hacen lo que el PUT del calendario (resincronizar la cola y avisar al
  espacio con `calendario:recargar`), firmadas «Claude (persona)».
- **Lo marcado «a mano» no sale solo.** `post.asistida` es para lo que la
  API no deja (música de Instagram, stickers, encuestas): `planificar()`
  lo rechaza, así que no se cuela ni por «Programar lo aprobado», ni al
  aprobar, ni desde el MCP. Sale en Mi día y en Programación, y
  `/a-mano/…` da el archivo para guardar o compartir con Instagram y el
  texto para copiar.
- **La lista va por semanas plegables; el mes del móvil se queda.** La
  lista era los treinta días seguidos: interminable en el teléfono. Ahora
  `agruparPorSemana()` (lib/semanas.js) la parte por la semana del
  calendario (`weekNumber`, la del concepto) —o la natural de lunes a
  domingo si el día no la trae—, con su resumen, y sólo se abre la semana
  de hoy. La rejilla del mes en el móvil NO se quita: la agencia la
  prefiere a la lista.
- **Publicar es UNA pregunta: «¿Cuándo sale?».** Programar, publicar ya
  y «la publico yo» eran tres controles que parecían cosas distintas, y
  el día no se podía cambiar desde ahí. `calendario/cuandoSale.jsx` pone
  un solo botón que dice lo que va a pasar («Programar para sáb 10 oct,
  9:00 a. m.»). Programar para OTRO día MUEVE la publicación
  (`moverEnCalendario`, lib/subir.js); a otro mes no, que es otro
  calendario. Una vez en la cola, el selector se cambia por la tarjeta
  «Programada para… · Cambiar · Cancelar»: así no quedan botones que
  inviten a programar dos veces. Las pestañas del panel son «Idea» y
  «Subir».
- **La IA lee el contenido, y sólo RELLENA.** «Escribir a partir del
  contenido» (`escribirDesdeContenido` en api.js) manda las imágenes y,
  de un video, el análisis de Gemini más cuatro fotogramas: la API de
  Claude no recibe video. `rellenarDesdeContenido()` escribe sólo en los
  campos vacíos; lo escrito a mano gana. En el panel el aviso se calcula
  con lo de ahora y el cambio se aplica con `setForm(p => …)`: se pudo
  seguir escribiendo mientras la IA miraba.
- **Lo subido con «Subir» sale DIRECTO: queda aprobado** (`subidaRapida`),
  sin pasar por el cliente —decisión de la agencia—. El diálogo crea la
  publicación en su día y el calendario del mes si no existe, y guarda el
  calendario por su cuenta. Dos cosas que lo hacen funcionar: el eco de la
  propia pestaña se ignora, así que App lo mete en el estado
  (`calendarioGuardado`); y ANTES de guardar suelta el guardado agrupado
  pendiente de ese calendario (`soltarPendiente`): lo pendiente ya va
  dentro —sale del estado—, y si saliera después, borraría la
  publicación nueva.
- **El calendario abre en «Mes», también en el móvil.** La lista por
  semanas sigue a un toque.
- **`tests/utils/d1Memoria.js` es una D1 de verdad** (SQLite de Node con
  todas las migraciones). Para lo que un doble a mano no ve: que las
  consultas de la capa de acceso existen en el esquema. La cola de
  publicación se prueba ahí (`tests/migracion/publicar.test.js`).

## Documentos relacionados

- `DEPLOY.md` — puesta en producción en Cloudflare: Worker, D1, R2 y el corte.
- `docs/auditoria-ux-ui.md` — auditoría de UX, UI, responsive y accesibilidad,
  con lo corregido y lo pendiente.
- `docs/migracion-cloudflare.md` — plan para mover la aplicación de Supabase +
  Netlify a Cloudflare (D1, R2, Workers). Escrito sobre la base viva, no sobre
  el repositorio: incluye dónde los dos no coinciden.
- `docs/propuesta-publicacion.md` — propuesta para la experiencia de publicar
  (Flow a 4:5, historias, colaboradores, página de programación, MCP).
- `docs/hub-cloudflare.md` — plan del hub donde este calendario pasa a ser una
  herramienta más, junto al bot y la tienda que ya están en Cloudflare.
