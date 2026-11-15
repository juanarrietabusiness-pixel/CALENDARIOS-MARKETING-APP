# Trampas conocidas · Base de datos, acceso, despliegue y tiempo real

**Qué cubre:** D1 sin RLS y la capa de acceso, migraciones, sesión y contraseñas, CSP y cabeceras, Vite y el bundle, el cron y sus límites, el Durable Object (eco, eventos), subir archivos, lo que sólo falla en producción.

**Cuándo leerlo:** Antes de tocar `worker/index.js`, `worker/lib/acceso.js`, una migración, `public/_headers`, `vite.config.js`, el tiempo real o el cron.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

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
- **El panel lateral guarda al desmontar, no al pulsar cerrar.** El fondo
  oscuro y la tecla Escape llaman a `onClose` a secas: con el guardado
  colgado sólo del botón, todo lo editado —y todo lo que acababa de
  generar la IA— se perdía sin decir nada. Los tres botones que sacan la
  publicación de su sitio (borrar, mover, banco de ideas) levantan
  `yaEscrito` antes de reescribir el calendario ellos mismos: sin esa
  guarda, el guardado del desmonte llega con el calendario de antes y
  deshace lo que acaban de hacer.
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
- **Una ficha de la galería sin su archivo se veía rota.** «Ampliar con IA» pide por
  `/api/generar-imagen`, que apunta la imagen en la galería, y luego descarta la
  intermedia con `/api/feedback-imagen` (`liked: false`), que borraba el archivo de R2
  y dejaba la ficha. Ahora ese descarte quita también la ficha (`olvidarClave`); las
  que ya estaban las detecta la pantalla (la imagen no carga) y «Quitarlas de la
  galería» llama a `POST …/archivos/<id>/perdido`, que sólo borra la ficha si R2 dice
  que el archivo NO está: una imagen que falló por la red no se pierde.
- **La aplicación vive en `calendario.juancitoads.com` Y en workers.dev.** El
  subdominio es un dominio propio del Worker declarado en `wrangler.jsonc`
  (`routes`, `custom_domain: true`): lo crea el despliegue, no el panel. Dos
  trampas: con `routes` puesto, wrangler da `workers_dev` por `false` y APAGA
  workers.dev en el siguiente despliegue —de él cuelgan las vueltas de OAuth
  registradas, el webhook de la Bandeja y el conector de Claude—, así que `workers_dev: true` va
  escrito y `tests/despliegue/plantillas.test.js` lo exige; y el token de
  despliegue necesita *Zone → Workers Routes → Edit* sobre juancitoads.com, o
  falla el despliegue ENTERO. El DNS de la zona está en Cloudflare con todo en
  nube gris salvo este registro: la web sigue en Netlify.
- **`connect-src 'self'` ya cubre el WebSocket.** En una página `https`,
  `'self'` casa con `wss:` del mismo host —lo dice la especificación de
  CSP—. Si alguien ve el socket caer y «lo arregla» metiendo un origen
  ahí, rompe la regla de oro: un tercero en `connect-src` es la señal de
  que una clave ha vuelto al navegador.
- **El cron vive dentro de los límites del plan GRATUITO de Workers:**
  50 peticiones de salida y 50 consultas a D1 por invocación. Por eso la
  cola publica tres por vuelta, la foto de métricas es UNA cuenta por
  vuelta (~30 llamadas a Meta) y sólo si la cola no tenía nada, y
  «Actualizar ahora» en Resultados mide cuenta a cuenta, una petición
  cada una. Las escrituras en serie van en `acceso.guardarVarios`, que
  las manda en un lote. Una tercera tarea periódica que se sume a la
  misma vuelta pasa del límite y falla a medias, sin avisar.
- **Un colaborador sólo ve sus clientes, y lo acota la CAPA.** Papeles:
  admin, editor, colaborador (`memberships.clientes`, JSON) y sólo lectura
  (`solo_lectura`); sin tocar el `check` de `rol`, que obligaría a
  reconstruir la tabla. `crearAcceso(db, owner, { clientes })` añade
  `client_id in (…)` a toda lectura de `TABLAS_CON_CLIENTE`, acota por
  calendario lo que cuelga de uno y comprueba el cliente de lo que se
  escribe —también en el `on conflict`, o un id ajeno se «movería»—. Un
  test falla si aparece una tabla con `client_id` sin declarar. Sólo
  lectura se corta en `worker/index.js` antes de cualquier ruta. Borrar
  clientes/calendarios y publicar al momento son de admin.
- **`return await` en las rutas con sesión.** Un error lanzado dentro de
  una ruta devuelta sin `await` escapa del `try` de `fetch` y sale como
  500 genérico: así se perdía el 403 de un colaborador.
- **Un video que no contesta por trozos no se reproduce en el iPhone.**
  Safari pide `Range: bytes=0-1` antes de nada y, si le llega un 200 con
  el archivo entero, pinta el primer fotograma y al darle a reproducir no
  hace nada. En el ordenador funcionaba —Chrome se conforma con el 200—,
  así que sólo se veía en el teléfono, en «Subir» y en el panel.
  `sirveMedia()` (worker/index.js) pasa el `Range` a R2 y contesta 206 con
  `Content-Range` (`rangoServido()` en lib/respuesta.js). Lo vigila
  `tests/migracion/enrutado.test.js`.
- **Un reel de 80 MB no subía, y no decía nada.** `POST /api/media` lee el formulario entero dentro del Worker: minutos
  sin señal y, pasado de 100 MB (el tope del cuerpo de una petición en Cloudflare), no llegaba nunca. Lo de más de
  `SUBIDA_DE_UNA_VEZ` (20 MB) va por TROZOS (`worker/rutas/trozos.js`, `subirPorTrozos` en src/lib/db.js): R2 junta las
  partes con su subida multiparte. Los trozos miden `TAMANO_TROZO` (10 MiB): R2 exige al menos 5 MiB y que todos midan
  lo mismo salvo el último. Cada trozo se reintenta solo (un 4xx no), y si la subida muere se abandona (`DELETE`) para no
  dejar partes. La clave la inventa el servidor y cada paso comprueba que sea de un cliente del espacio: el navegador la
  devuelve en cada trozo. La pantalla enseña el tamaño, el porcentaje y una `<progress>` (XHR, por `upload.onprogress`:
  `fetch` no da el avance de la subida). **Nada de la multiparte se ha probado contra el R2 real**: el test usa un doble.
- **Cambiar un CHECK en SQLite es reconstruir la tabla.** `ia_modelo` sólo
  admitía «sonnet»/«opus»: 0022 crea `ajustes_espacio_v2` con todas las
  columnas y checks de hoy, copia, suelta la vieja y renombra. Los tests
  del esquema (`tablasDelEsquema()` en tests/despliegue/acceso.test.js)
  siguen `drop table` y `rename to` en orden: sin eso veían la tabla
  provisional como una tabla nueva con dueño y sin declarar.
- **`tests/utils/d1Memoria.js` es una D1 de verdad** (SQLite de Node con
  todas las migraciones). Para lo que un doble a mano no ve: que las
  consultas de la capa de acceso existen en el esquema. La cola de
  publicación se prueba ahí (`tests/migracion/publicar.test.js`).
- **Los tests del presupuesto fallaban el último día de cada mes por la
  noche.** Apuntaban el gasto con `new Date().toISOString().slice(0, 7)` —el
  mes en UTC— y el Worker lo suma con `mesActual()`, el de Panamá: de las
  19:00 del último día en adelante son meses distintos, el gasto «no
  existía» y seis casos daban 201 en vez de 402. Los tests usan ahora
  `mesActual()`. La misma trampa de `toISOString()` de siempre, en los tests.
- **`wrangler d1 migrations apply` pinta la tabla ENTERA de migraciones tras cada una**: su salida crece con el cuadrado de
  cuántas hay, y con la 0076 (72 migraciones) pasó del 1 MB que `execFile` admite por defecto. `npm run test:vivo` moría con
  «stdout maxBuffer length exceeded» antes de arrancar el Worker, con el SQL perfecto. `tests/vivo/espacio.js` le da 64 MB.
