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
| `GITHUB_TOKEN` | Un token de **sólo lectura** | GitHub → Settings → Developer settings → Personal access tokens |
| `GROQ_API_KEY` | Opcional | console.groq.com |
| `GOOGLE_CLIENT_ID` | El ID de cliente OAuth de Google | Ver «Google Drive» abajo |
| `GOOGLE_CLIENT_SECRET` | Su secreto | Ver «Google Drive» abajo |
| `META_APP_ID` | El identificador de la app de Meta | Ver «Instagram y Facebook» abajo |
| `META_APP_SECRET` | Su clave secreta | Ver «Instagram y Facebook» abajo |
| `META_CONFIG_ID` | El ID de configuración del inicio de sesión | Ver «Instagram y Facebook» abajo |

El `GITHUB_TOKEN` es para leer el ADN de marca de los repositorios de los
clientes. Con permiso de lectura de repositorios basta; no necesita
escritura.

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
   `pages_manage_posts`, `read_insights`, `business_management`,
   `instagram_basic`, `instagram_content_publish`,
   `instagram_manage_insights`, `instagram_manage_comments`. Copiar el
   **ID de configuración**.
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
| `GROQ_API_KEY` | **Cloudflare** | Idem |

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
