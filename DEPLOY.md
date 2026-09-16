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

El `GITHUB_TOKEN` es para leer el ADN de marca de los repositorios de los
clientes. Con permiso de lectura de repositorios basta; no necesita
escritura.

> Ese nombre sólo vale aquí. GitHub no deja crear un secreto de
> repositorio que empiece por `GITHUB_`, pero esto vive en Cloudflare.

**Los secretos sobreviven a los despliegues.** No hay que volver a
ponerlos cada vez.

Lo que **no** va aquí son los modelos y las políticas: viven en `vars` de
`wrangler.jsonc`, se versionan y no abren nada.

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

Mientras el dominio no apunte al Worker, el despliegue anterior sigue
siendo la producción y esto es un ensayo.

El proyecto de Supabase se deja **pausado, no borrado**, un mes: uno
pausado conserva los datos; uno borrado, no.
