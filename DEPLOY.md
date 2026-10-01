# Puesta en producción

**Todo esto se hace desde el navegador.** No hay ningún paso que requiera
una consola: el código vive en GitHub y se publica en Cloudflare a través
de GitHub Actions, que es quien ejecuta los comandos.

## Por qué NO se conecta Cloudflare directamente al repositorio

Cloudflare ofrece conectar el repositorio y desplegar solo en cada push.
**No se usa, y no es una preferencia de estilo.** Esa integración
construye y publica **sin pasar por los tests de este repositorio**: un
merge a medias, o un push directo a `main`, llegaría a producción sin que
nada lo parase, y el fallo se descubriría en una captura de pantalla del
cliente.

El despliegue vive en `.github/workflows/desplegar.yml`, y ese job corre
`npm run verificar` —lint, tests, build y presupuesto de bundle— **entero
y antes de publicar nada**. El filtro está dentro del mismo job, no en
otro del que éste dependa: así no hay forma de saltárselo.

---

## Parte 1 · Crear el token de Cloudflare

1. Entra en **dash.cloudflare.com**.
2. Arriba a la derecha, el icono de tu perfil → **My Profile**.
3. Pestaña **API Tokens** → **Create Token**.
4. Abajo del todo, **Create Custom Token** → *Get started*.
5. Ponle un nombre: `despliegue-calendarios`.
6. En **Permissions**, añade estas cuatro filas. Todas son de tipo
   **Account** (la primera columna del desplegable):

   | Permiso | Nivel |
   |---|---|
   | `Workers Scripts` | **Edit** |
   | `D1` | **Edit** |
   | `Workers R2 Storage` | **Edit** |
   | `Account Settings` | **Read** |

7. En **Account Resources**: *Include* → tu cuenta.
8. **Continue to summary** → **Create Token**.
9. **Copia el token ahora.** Sólo se muestra una vez; si lo pierdes hay
   que crear otro.

> Atajo: en *Permission policies* existe una plantilla llamada **Edit
> Cloudflare Workers** que ya trae todo esto. Sirve igual, sólo que
> concede algo más de lo necesario.

## Parte 2 · Copiar el Account ID

1. En el menú lateral, **Workers & Pages**.
2. En la columna de la derecha, **Account Details**.
3. Botón de copiar junto a **Account ID**.

## Parte 3 · Pegar los secretos en GitHub

En el repositorio: **Settings** → **Secrets and variables** → **Actions**
→ botón **New repository secret**. Uno por uno:

| Nombre | Qué pegar | Hace falta para |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | El token de la Parte 1 | Desplegar |
| `CLOUDFLARE_ACCOUNT_ID` | El id de la Parte 2 | Desplegar |
| `ADMIN_EMAIL` | Tu correo de acceso al panel | Entrar |
| `ADMIN_PASSWORD` | Una contraseña de **12 caracteres o más** | Entrar |
| `SUPABASE_URL` | `https://lwkepnrprcyabyhhorrc.supabase.co` | Traer los datos (una vez) |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave `service_role` del proyecto | Traer los datos (una vez) |
| `SITIO_URL` | La dirección publicada | Comprobación diaria (opcional) |

La clave `service_role` está en el panel de Supabase: **Project Settings**
→ **API** → *Project API keys* → `service_role`. **Ignora RLS y da acceso
total al proyecto**: se usa una vez y se borra en la Parte 7.

> `ADMIN_PASSWORD` también se borra después. No se guarda en ningún sitio
> de forma permanente: lo que queda en la base es su hash.

## Parte 4 · Publicar por primera vez

1. Mergea el pull request a `main`. Eso dispara **Desplegar** solo.
2. Pestaña **Actions** → workflow **Desplegar**. Tarda un par de minutos.
3. Si sale en rojo en el paso **Verificar**, no se ha publicado nada: el
   filtro hizo su trabajo. El motivo está en el registro, y el informe con
   *qué / dónde / por qué importa / arreglo* queda como artefacto.

Al terminar, el Worker `calendarios` existe y el sitio responde. Las
funciones de IA todavía no: les faltan las claves, que van en la Parte 5.

## Parte 5 · Pegar las claves en Cloudflare

Ahora que el Worker existe, ya tiene dónde guardarlas.

1. **Workers & Pages** → **calendarios**.
2. Pestaña **Settings** → **Variables and Secrets**.
3. **Add** → en *Type* elige **Secret** (no *Text*: *Text* se ve en claro
   y se versiona en el panel).

| Nombre | Qué pegar | Dónde se saca |
|---|---|---|
| `ANTHROPIC_API_KEY` | Tu clave de Anthropic | console.anthropic.com → API Keys |
| `GOOGLE_AI_KEY` | Tu clave de Google AI (Gemini) | aistudio.google.com → Get API key. Genera las imágenes (Nano Banana) y **lee** los videos para el asistente. Sin ella, las imágenes con IA dan «El servidor no tiene configurada la clave de Google AI» |
| `FAL_KEY` | Tu llave de fal.ai *(opcional)* | fal.ai → Dashboard → Keys. Activa en el Estudio los modelos de fal (Seedream, Flux, Kling, Seedance, Hailuo, Veo 3). Sin ella se ven apagados, con «sin llave» |
| `HF_KEY` | Tu llave de Higgsfield, `id:secreto` *(opcional)* | cloud.higgsfield.ai → API Keys. Activa en el Estudio los modelos de Higgsfield (Soul, Kling 3, Seedance, Wan, Ideogram…). También vale `HF_API_KEY` + `HF_API_SECRET` por separado. Sin ella se ven apagados |
| `META_API_KEY` | Tu llave de la API de Meta (Muse) *(opcional)* | dev.meta.ai → API keys (la documentación de Meta la llama `MODEL_API_KEY`; vale cualquiera de los dos nombres). Activa **Muse Spark** como modelo de texto en Ajustes → IA —y en cuanto está, **redacción y guiones pasan a Muse Spark 1.2 Contributor**, salvo que elijas otro— y **Muse Image** en el Estudio y para adaptar a 4:5. Ojo: con el modelo *Contributor*, Meta puede usar lo que se le manda para entrenar sus modelos |
| `GITHUB_TOKEN` | Un token de **sólo lectura** | GitHub → Settings → Developer settings → Personal access tokens |
| `GOOGLE_CLIENT_ID` | El ID de cliente OAuth de Google | Ver «Google Drive» abajo |
| `GOOGLE_CLIENT_SECRET` | Su secreto | Ver «Google Drive» abajo. Los mismos dos sirven para **YouTube** (ver «YouTube») |
| `META_APP_ID` | El identificador de la app de Meta | Ver «Instagram y Facebook» abajo |
| `META_APP_SECRET` | Su clave secreta | Ver «Instagram y Facebook» abajo |
| `META_CONFIG_ID` | El ID de configuración del inicio de sesión | Ver «Instagram y Facebook» abajo |
| `META_CONFIG_ID_BANDEJA` | El ID de la configuración CON los permisos de la bandeja *(opcional)* | Ver «La bandeja: comentarios y mensajes» abajo |
| `META_WEBHOOK_VERIFY_TOKEN` | Un testigo que inventas tú, para verificar el webhook *(opcional)* | Ver «La bandeja: comentarios y mensajes» abajo |

| `META_CONFIG_ID_ANUNCIOS` | El ID de la configuración CON los permisos de anuncios *(opcional)* | Ver «Anuncios de Meta» abajo. Sólo hace falta si se usa `META_CONFIG_ID` |
| `TIKTOK_CLIENT_KEY` | La Client key de la app de TikTok | Ver «TikTok» abajo |
| `TIKTOK_CLIENT_SECRET` | Su Client secret | Ver «TikTok» abajo |

El `GITHUB_TOKEN` es para leer el ADN de marca de los repositorios de los
clientes —lo usa «Llenar desde el repositorio» de la pestaña Cerebro—. Con
permiso de lectura de repositorios basta (en un token de acceso fino:
**Contents → Read-only** sobre `Agencia_Workspace` y sobre cada repositorio
de ADN que uses); no necesita escritura.

> Ese nombre sólo vale aquí. GitHub no deja crear un secreto de
> repositorio que empiece por `GITHUB_`, pero esto vive en Cloudflare.

**Los secretos sobreviven a los despliegues.** No hay que volver a
ponerlos cada vez.

Lo que **no** va aquí son los modelos y las políticas: viven en `vars` de
`wrangler.jsonc`, se versionan y no abren nada.

### Google Drive (el banco de contenido)

Una vez, con la cuenta de Google de la AGENCIA:

1. console.cloud.google.com → crear un proyecto.
2. **APIs y servicios → Biblioteca → Google Drive API → Habilitar.**
3. **Pantalla de consentimiento de OAuth**: tipo *Externo*; en *Público*,
   **Publicar app** («En producción»). En modo de prueba Google corta la
   conexión cada 7 días.
4. **Clientes → Crear cliente → Aplicación web**. En *URI de
   redireccionamiento autorizados*, la dirección que enseña la app en
   **Ajustes → Integraciones** (`https://<dominio>/api/drive/callback`).
5. Pegar el ID y el secreto aquí, como `GOOGLE_CLIENT_ID` y
   `GOOGLE_CLIENT_SECRET` (tipo *Secret*).
6. En la app: **Ajustes → Integraciones → Conectar Google Drive**. Al aviso
   de «Google no verificó esta app»: *Configuración avanzada → Ir a…*.
7. Cada cliente comparte su carpeta con la cuenta de la agencia (Editor) y
   se pega el enlace en su **Ficha → Drive y GitHub**.

### Instagram y Facebook (publicar y programar)

**No hace falta la revisión de Meta.** Con acceso estándar, la app puede
hacer todo mientras quien la conecta tenga un rol en ella (administrador o
desarrollador). La revisión sólo es para apps que usan personas ajenas.

Una vez, con el Facebook de la AGENCIA (el que administra las páginas):

1. developers.facebook.com/apps → **Crear app** → caso de uso **Otro** →
   tipo **Empresa** → asociarla al portafolio comercial de la agencia.
2. Añadir los productos **Inicio de sesión con Facebook para empresas** e
   **Instagram** (configuración con inicio de sesión con Facebook).
3. **Inicio de sesión con Facebook para empresas → Configuración** → en
   *URI de redireccionamiento de OAuth válidos*, la dirección que enseña la
   app en **Ajustes → Integraciones** (`https://<dominio>/api/redes/meta/callback`).
4. **Configuraciones → Crear configuración**: token de acceso de
   **usuario**, y los permisos `pages_show_list`, `pages_read_engagement`,
   `pages_read_user_content`, `pages_manage_posts`, `read_insights`,
   `business_management`, `instagram_basic`, `instagram_content_publish`,
   `instagram_manage_insights`, `instagram_manage_comments`. Copiar el
   **ID de configuración**.

   Un permiso que se añada DESPUÉS (como `pages_read_user_content`, que
   deja leer reacciones y comentarios de Facebook) hay que marcarlo en
   ESTA configuración —activarlo en la app no basta— y luego volver a
   pulsar **Conectar con Facebook**: el token que ya había no lo lleva.
5. **Configuración de la app → Básica**: copiar el identificador y la clave
   secreta; poner `https://<dominio>/privacidad` como política de
   privacidad.
6. Pegar aquí `META_APP_ID`, `META_APP_SECRET` y `META_CONFIG_ID` (tipo
   *Secret*).
7. Poner la app en modo **Activo** y, en la app del calendario, **Ajustes →
   Integraciones → Conectar con Facebook**. Marcar TODAS las páginas e
   Instagram de los clientes.
8. En la misma pantalla, asignar cada cuenta a su cliente.

Cada Instagram tiene que ser **profesional** (empresa o creador) y estar
vinculado a su página de Facebook. Un cliente nuevo da acceso a la agencia
como **socio** desde su Business Suite; después, **Actualizar cuentas**.

### La bandeja: comentarios y mensajes

La página **Bandeja** (`/bandeja`) junta los comentarios y los mensajes
privados de Facebook e Instagram de los clientes que la tienen ENCENDIDA
(el interruptor está en la ficha del cliente, pestaña «Básico», y en la
propia Bandeja). Apagada, no se lee ni se guarda nada de ese cliente.

**Esto sí pasa por la revisión de Meta (App Review).** Los permisos que
usa no van en «Conectar con Facebook» —lo romperían mientras la app no
los tenga aprobados— y se piden aparte con el botón **Conceder permisos de
comentarios y mensajes** de la Bandeja (sólo el administrador):

| Permiso | Para qué |
|---|---|
| `pages_manage_metadata` | Suscribir la página a la app (sin esto Meta no avisa de nada) |
| `pages_manage_engagement` | Responder, ocultar y borrar comentarios de Facebook |
| `pages_messaging` | Leer y responder Messenger |
| `instagram_manage_messages` | Leer y responder los mensajes directos de Instagram |
| `instagram_manage_comments` | Responder, ocultar y borrar en Instagram (ya se pedía) |

Hasta que Meta los apruebe funcionan con las personas que tienen un rol en
la app (modo de desarrollo / acceso estándar), que es lo que hay que usar
para grabar el video que pide la revisión.

Una vez, en developers.facebook.com, con la app de antes:

1. **Inicio de sesión con Facebook para empresas → Configuraciones → Crear
   configuración** (una segunda, aparte de la de siempre): token de
   **usuario**, con TODOS los permisos de la configuración normal MÁS los
   cuatro de la tabla. Tiene que llevarlos todos: el token que sale de ella
   sustituye al anterior. Copiar su **ID de configuración** y pegarlo en
   Cloudflare como `META_CONFIG_ID_BANDEJA` (Secret). Sin él, si la app usa
   configuraciones, el botón no aparece y la Bandeja lo dice.
2. **Productos → Webhooks** (o «Casos de uso → Personalizar → Webhooks»):
   - Objeto **Page**: URL de devolución de llamada
     `https://<dominio>/api/webhooks/meta`, y como *token de verificación*
     un texto largo que inventes. Ese mismo texto va en Cloudflare como
     `META_WEBHOOK_VERIFY_TOKEN` (Secret) — ponlo ANTES de pulsar
     «Verificar y guardar», porque Meta lo comprueba en ese momento.
     Suscribir los campos **feed** y **messages**.
   - Objeto **Instagram**: la misma URL y el mismo token. Suscribir
     **comments** y **messages** (y `live_comments` si se quiere).
   Meta firma cada aviso con la clave secreta de la app
   (`META_APP_SECRET`, que ya está puesta): lo que no venga firmado se
   rechaza.
3. En la app del calendario: **Bandeja → Conceder permisos de comentarios y
   mensajes**, entrar con el Facebook de la agencia y aceptar.
4. Encender la bandeja de cada cliente. Al encenderla, el Worker suscribe
   su página a la app (`/{page-id}/subscribed_apps` con `feed,messages`);
   si Meta no lo acepta, el interruptor lo dice y la Bandeja sigue
   funcionando con **Actualizar**.

Sin el webhook (sin `META_WEBHOOK_VERIFY_TOKEN` o sin el paso 2), la
Bandeja funciona igual con el botón **Actualizar**, que lee los últimos
comentarios de las publicaciones recientes y las últimas conversaciones.

Meta sólo deja responder un mensaje privado **dentro de las 24 horas**
siguientes al último mensaje de la persona. Pasado ese plazo, el campo se
desactiva y lo explica.

### Biblioteca de anuncios (`/biblioteca`)

**Ningún secreto ni permiso nuevo**, ni revisión de Meta: usa la misma app y
el token de quien pulsó **Conectar con Facebook**. Lo que pide Meta es de
ESA persona, una vez:

1. Confirmar su identidad en **facebook.com/ID** (documento oficial; puede
   tardar días). Sin eso, cada búsqueda contesta «Verifica tu identidad en
   facebook.com/ID y vuelve a intentar».
2. Abrir **facebook.com/ads/library/api** con esa misma cuenta y aceptar
   las condiciones de la API de la Biblioteca.

Si quien conectó Meta no puede verificarse, que conecte otra persona del
equipo que sí (Ajustes → Integraciones → Conectar con Facebook).

Lo que NO va a salir, haga lo que haga la agencia: fuera de la UE y el
Reino Unido, la API sólo devuelve anuncios de temas sociales, elecciones o
política. Los anuncios comerciales de Panamá se ven en la web de la
Biblioteca; la pantalla lleva un enlace con la búsqueda ya rellena.

### Anuncios de Meta (/campanas)

Ver, crear y activar campañas usa el MISMO Facebook conectado, con dos
permisos más: `ads_read` y `ads_management`. **Esos dos sí pasan por la
revisión de Meta (App Review)** si los usan personas sin rol en la app; con
acceso estándar valen para quien tenga rol en la app y en la cuenta
publicitaria. No van en la configuración de siempre a propósito: si Meta
no los aprueba, «Conectar con Facebook» seguiría funcionando.

1. En la app de Meta, **Casos de uso → Crear y administrar anuncios** (o
   añadir el producto **Marketing API**).
2. **Inicio de sesión con Facebook para empresas → Configuraciones → Crear
   configuración**: token de **usuario**, con TODOS los permisos de la
   configuración de siempre **más** `ads_read` y `ads_management`. Copiar su
   ID y pegarlo aquí como `META_CONFIG_ID_ANUNCIOS` (tipo *Secret*). (Con la
   app clásica, sin `META_CONFIG_ID`, no hace falta: se piden por lista.)
3. Quien conecta tiene que tener un papel en cada **cuenta publicitaria**
   del cliente (Business Suite → Configuración → Cuentas publicitarias →
   asignar personas), y la página del cliente tiene que estar asignada a su
   cliente en **Ajustes → Integraciones**: los anuncios salen a nombre de
   esa página.
4. En la app del calendario: **Anuncios → Conceder permisos de anuncios**
   (administrador), y después **Actualizar cuentas** y escoger la cuenta
   publicitaria de cada cliente.

Todo lo que se crea desde la app nace **en pausa**. Activar es del
administrador y pide escribir ACTIVAR. **Nada de esto se ha probado contra
la Marketing API real:** lo primero, una campaña de Tráfico de 1 $ al día
mirada en el Administrador de anuncios antes de activarla.

### TikTok

Una vez, con la cuenta de TikTok de la AGENCIA:

1. developers.tiktok.com → **Manage apps → Connect an app**.
2. Productos: **Login Kit** y **Content Posting API** (con «Direct Post» si
   se quiere publicar sin pasar por la bandeja del cliente).
3. En Login Kit, *Redirect URI*: la que enseña la app en **Ajustes →
   Integraciones** (`https://<dominio>/api/redes/tiktok/callback`).
4. Permisos: `user.info.basic`, `user.info.profile`, `user.info.stats`,
   `video.list`, `video.upload`, `video.publish`. Política de privacidad:
   `https://<dominio>/privacidad`; términos de servicio:
   `https://<dominio>/terminos`.
5. Pegar aquí `TIKTOK_CLIENT_KEY` y `TIKTOK_CLIENT_SECRET` (tipo *Secret*).
6. Hasta que TikTok revise la app, funciona en **Sandbox**: añadir ahí las
   cuentas de los clientes como usuarios de prueba (hasta 10). Para más,
   enviarla a revisión desde el mismo panel.

Cada cliente se conecta aparte (en TikTok no hay un usuario de agencia que
vea todas): **Conectar aquí** si la agencia tiene su acceso, o **Enlace para
el cliente**, que el cliente abre en su teléfono (vale una semana).

Por defecto los videos van a la **bandeja de TikTok del cliente** (modo
Borrador) y se publican desde la app con un toque. En modo **Directo**
salen publicados, pero **en privado** hasta que TikTok audite la app.

### YouTube

**No hay secretos nuevos:** usa el mismo proyecto y el mismo cliente OAuth
de Google Drive (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). Una vez, en
console.cloud.google.com, en ESE proyecto:

1. **APIs y servicios → Biblioteca**: habilitar **YouTube Data API v3** y
   **YouTube Analytics API**.
2. **Pantalla de consentimiento → Acceso a los datos → Agregar o quitar
   permisos**: `https://www.googleapis.com/auth/youtube.upload`,
   `https://www.googleapis.com/auth/youtube.readonly` y
   `https://www.googleapis.com/auth/yt-analytics.readonly`.
3. **Clientes → el cliente web de Drive → URI de redireccionamiento
   autorizados**: añadir la que enseña la app en **Ajustes → Integraciones →
   YouTube** (`https://<dominio>/api/redes/youtube/callback`), sin quitar
   la de Drive.
4. La app tiene que estar **«En producción»** (si no, el permiso caduca a los
   7 días y sólo entran los usuarios de prueba). Política de privacidad:
   `https://<dominio>/privacidad`; términos: `https://<dominio>/terminos`
   (ya nombran YouTube, como pide Google).

Cada cliente se conecta aparte, como en TikTok: **Conectar aquí** (entrando
con la cuenta de Google que administra SU canal) o **Enlace para el
cliente** (vale una semana). Si esa cuenta tiene varios canales, la app
pide elegir cuál. La privacidad (público, oculto o privado) se elige por
canal en la misma pantalla.

Lo que impone Google, y que la app no puede saltarse:

- **Mientras el proyecto no pase la auditoría de la API de YouTube, TODO
  video subido por la API queda en PRIVADO**, se elija lo que se elija. Se
  cambia a mano en YouTube Studio. Para quitarlo: pedir la auditoría
  («YouTube API Services — Audit and Quota Extension Form»).
- Los alcances `youtube.upload`/`youtube.readonly` son **sensibles**: con la
  app «En producción», Google pide **verificar la app** (pantalla de
  consentimiento) para que deje de salir el aviso de «app no verificada».
- **Cupo:** la subida tiene su propio tope diario por proyecto, y poner la
  portada gasta del cupo general (10.000 unidades al día). Las métricas
  diarias gastan muy poco (5 peticiones por canal y día, sin `search`).
- **La portada propia** sólo se pone si el canal está **verificado**
  (youtube.com/verify). Si no, el video sale igual, con un aviso.

**La programación la cumple el cron** (`triggers` en `wrangler.jsonc`,
cada minuto): la app no tiene que estar abierta. Instagram admite 50
publicaciones por API cada 24 horas y cuenta.

## Parte 6 · Dar de alta al administrador

1. Pestaña **Actions** → workflow **Sembrar administrador**.
2. **Run workflow** → **Run workflow**.

Lee `ADMIN_EMAIL` y `ADMIN_PASSWORD` de los secretos, calcula el hash
—PBKDF2-SHA256 con 210.000 iteraciones— y lo guarda. La contraseña nunca
se guarda en claro ni aparece en el registro.

Es idempotente: si lo vuelves a lanzar con otra contraseña, la cambia.
Eso es también cómo se recupera el acceso si se olvida.

**No existe ningún endpoint que cree administradores.** Antes sí lo había
y por eso había que protegerlo con un token: uno que quede abierto por un
despiste entrega el panel entero. Aquí la puerta es el permiso de lanzar
workflows en este repositorio.

## Parte 6 bis · Meter a alguien más en el equipo

Esto NO se hace desde Actions ni desde ninguna consola: se hace dentro de
la aplicación, y por eso está aquí abajo y no arriba.

1. Entra con la cuenta de administrador.
2. Icono de **Equipo** en la cabecera → **Invitar a alguien**.
3. Pon el nombre (y el correo, si quieres que venga ya escrito), elige si
   esa persona podrá invitar a su vez, y **Crear enlace**.
4. **Copia el enlace en ese momento.** Se enseña una sola vez: en la base
   sólo queda su huella SHA-256, así que ni una consulta a D1 ni un
   volcado pueden reconstruirlo. Si se pierde, se invita otra vez y ya.
5. Mándaselo por donde ya habléis. Quien lo abra elige **su propia**
   contraseña —tú no llegas a verla nunca— y entra directo.

El enlace caduca a la semana y sólo sirve una vez.

**Por qué no hay correo de invitación:** mandar correo exige un proveedor
—y su clave, y su dominio verificado—, que es la misma dependencia que
aplaza los enlaces mágicos al hub. Copiar un enlace y pegarlo en WhatsApp
resuelve lo mismo hoy y no añade nada que mantener.

**Para sacar a alguien:** misma pantalla, botón **Sacar**. Se lleva su
cuenta y sus sesiones; no se lleva ni un cliente ni un calendario, porque
esas filas están a nombre del ESPACIO —el id de quien lo fundó—, no de
quien las escribió. A quien fundó el espacio la aplicación se niega a
sacarlo: ahí la cascada sí se llevaría todo por delante.

## Parte 7 · Traer los datos de Supabase

1. **Actions** → **Migrar datos desde Supabase**.
2. **Run workflow**. Déjalo con la casilla de **ensayo marcada** la
   primera vez: convierte, mide y avisa **sin escribir nada**.
3. Mira el registro. Lo que hay que comprobar:
   - que ningún calendario supere los **2.000.000 bytes** que admite D1;
   - cuántas imágenes saldrían del JSON hacia R2;
   - que los recuentos cuadren con los de Supabase.
4. Si todo cuadra, vuelve a lanzarlo **desmarcando la casilla**.

El volcado no se sube como artefacto ni se imprime: son clientes reales.
Vive sólo en la máquina de la ejecución, que se destruye al terminar.

**Los testigos de compartición se migran tal cual.** Si se regeneraran,
todos los enlaces que tus clientes ya tienen en su correo dejarían de
abrirse.

### Y ahora borra dos secretos

Vuelve a **Settings** → **Secrets and variables** → **Actions** y borra:

- `SUPABASE_SERVICE_ROLE_KEY` — ya no hace falta, y da acceso total al
  proyecto de Supabase.
- `ADMIN_PASSWORD` — ya está aplicada. Dejarla guardada sólo añade un
  sitio más del que se puede filtrar.

## Parte 8 · El dominio

1. **Workers & Pages** → **calendarios** → **Settings** → **Domains &
   Routes** → **Add** → **Custom domain**.
2. Escribe el dominio. Si está en Cloudflare, el DNS se configura solo.

Elige con calma: el dominio entra en la cookie de sesión, en la CSP y en
los enlaces de aprobación que ya tienen tus clientes. Cambiarlo después
cuesta.

Cuando esté, añade `SITIO_URL` a los secretos de GitHub para que la
comprobación diaria pueda mirar el sitio publicado.

---

## Parte 9 · Apagar Netlify

**Netlify sigue conectado al repositorio.** Del repositorio ya no queda
nada suyo —`netlify.toml` y `_redirects` se fueron en la migración—, pero
la integración vive en el panel de Netlify, no aquí, así que sobrevive a
todo lo que se borre del árbol: construye y publica en cada push a `main`
y deja su vista previa en cada pull request.

Y lo que publica ahora está roto de una forma que no se ve: el front pide
a `/api/*`, y `/api/*` sólo existe dentro del Worker. En Netlify no hay
nada ahí. El sitio carga, se ve igual que siempre, y ninguna pantalla
trae datos.

**El orden importa.** Mientras el dominio no sirva desde el Worker
—parte 8—, **Netlify sigue siendo la producción**: es la marcha atrás.
No lo apagues antes.

Cuando el dominio ya responda desde el Worker:

1. **app.netlify.com** → el proyecto `calendarioapp-juancito` → **Site
   configuration** → **Build & deploy** → **Continuous deployment**.
   Ahí hay dos niveles: **Stop builds** deja el sitio publicado pero deja
   de construir en cada push, y desvincular el repositorio corta del todo.
2. Quita la **Netlify GitHub App** del repositorio si no la usa otro
   proyecto. Eso es lo que hace desaparecer los checks de Netlify y los
   comentarios de vista previa de los pull requests.
3. **No borres el sitio todavía.** Igual que el proyecto de Supabase se
   deja pausado un mes, el sitio de Netlify se deja publicado hasta estar
   seguro de que el Worker aguanta. Borrarlo es lo último, y no corre
   prisa.

---

## Comprobar que llegó

**Actions** → **Infraestructura** → **Run workflow**. Corre sola cada
mañana y mira lo que no se ve en pantalla:

- que las cabeceras de seguridad **lleguen de verdad** —estar en el
  fichero no es llegar al navegador—;
- que la CSP publicada no deje hablar con Supabase ni con ningún
  proveedor de IA;
- que `/api/yo` responda **401 y no 404**. Un 404 ahí significa que el
  Worker no atiende `/api/*` y toda la API está muerta aunque el sitio se
  vea perfectamente;
- que no haya Workers desplegados que nadie declara. Eso ya pasó dos
  veces con Supabase: `ai-chat` corrió semanas con código que no estaba
  en ningún commit, e `image-gen` corrió meses entera sin existir en el
  repositorio.

Y una cosa que sólo se comprueba con **dos navegadores abiertos a la
vez**, porque con uno solo es invisible: entra con las dos cuentas, abre
el mismo cliente, y edita en uno. En el otro tiene que aparecer el cambio
sin recargar, y en la cabecera tiene que verse el avatar de la otra
persona con el punto verde. Si el punto se queda gris, el Worker no está
sirviendo `/api/live`: mira que el Durable Object se haya creado en el
despliegue (`EspacioHub`, migración `v1` de `wrangler.jsonc`).

---

## Resumen de dónde va cada cosa

| Secreto | Dónde | Por qué ahí |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub | Lo usa el workflow para publicar |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub | Idem |
| `ADMIN_EMAIL` | GitHub | Lo lee el workflow de alta |
| `ADMIN_PASSWORD` | GitHub, **y se borra** | Idem |
| `SUPABASE_*` | GitHub, **y se borra** | Sólo para la migración |
| `SITIO_URL` | GitHub | Lo lee la comprobación diaria |
| `ANTHROPIC_API_KEY` | **Cloudflare** | La usa el Worker en cada petición |
| `GITHUB_TOKEN` | **Cloudflare** | Idem |
| `GOOGLE_AI_KEY` | **Cloudflare** | Idem (imágenes y lectura de video) |
| `FAL_KEY` / `HF_KEY` | **Cloudflare** | El Estudio: fal.ai y Higgsfield (opcionales, cada una activa sus modelos) |
| `META_API_KEY` | **Cloudflare** | Muse Spark (texto) y Muse Image (Estudio, adaptar a 4:5); opcional |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Cloudflare** | Google Drive y YouTube |
| `META_APP_ID` / `META_APP_SECRET` / `META_CONFIG_ID` | **Cloudflare** | Instagram y Facebook |
| `META_CONFIG_ID_BANDEJA` / `META_WEBHOOK_VERIFY_TOKEN` | **Cloudflare** | La Bandeja (opcionales) |

| `META_CONFIG_ID_ANUNCIOS` | **Cloudflare** | Anuncios de Meta (opcional) |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | **Cloudflare** | TikTok |

La regla: **en GitHub, lo que necesita el workflow. En Cloudflare, lo que
necesita el Worker mientras corre.** Ninguna de las dos listas llega
nunca al navegador.

---

## Marcha atrás

Mientras el dominio no apunte al Worker, **el despliegue anterior es
Netlify** —sigue construyendo en cada push— y esto es un ensayo. Por eso
la parte 9 va después de la 8 y no antes: apagarlo mientras sirve la
producción deja el sitio sin nada detrás.

El proyecto de Supabase se deja **pausado, no borrado**, un mes: uno
pausado conserva los datos; uno borrado, no.
