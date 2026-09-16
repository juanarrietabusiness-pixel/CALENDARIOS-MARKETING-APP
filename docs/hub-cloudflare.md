# El hub de herramientas en Cloudflare

Plan de implementación del hub: un solo sitio donde entran las herramientas de
Juancito Ads, con un acceso único y un diseño común. El calendario es la
primera que entra, pero **no la primera que existe**: hay dos más ya
funcionando en la cuenta, y eso cambia el orden del trabajo.

Se lee después de [`migracion-cloudflare.md`](./migracion-cloudflare.md). Ese
plan mueve el calendario a Cloudflare; éste lo mete dentro del hub. Se pueden
solapar a partir de la fase 3 de aquél, pero no adelantar: un hub con una sola
herramienta a medio migrar es un hub que no se puede probar.

---

## 1. Lo que ya existe

Inventario real de la cuenta, no lo que se planeó:

| Herramienta | Worker | Datos | Estado |
|---|---|---|---|
| Bot de atención | `juancitoads-bot` | D1 `juancitoads-bot-db`, 18 tablas | En producción |
| Tienda | `nebula-storefront` | R2 `nebula-media` | En producción |
| Administración de la tienda | `nebula-admin` | R2 `nebula-media-privada` | En producción |
| **Calendarios** | — | Supabase | Por migrar |

Son **tres herramientas con tres accesos distintos** y ningún sitio común. Eso
es el problema que resuelve el hub, y es mayor que el de mover el calendario.

### El bot ya resolvió la identidad

`juancitoads-bot-db` tiene:

```sql
magic_links  (token, email, created_at, expires_at, used_at)
admin_emails (email, role, added_at)
settings     (key, value, updated_at)
```

Enlaces mágicos con caducidad y marca de uso, y una lista de administradores
con rol. Eso **no se replica: se asciende**. El hub se queda con ese patrón y
el bot deja de tener el suyo propio.

Que ya exista es además la respuesta a por qué el calendario se migra con
contraseña (fase 2 del otro plan) y no con enlace mágico: el enlace mágico
necesita un proveedor de correo, y aquí ya está resuelto. Se hereda en la
fase H2, no se inventa dos veces.

---

## 2. Qué es «el hub», concretamente

Tres cosas, y conviene no confundirlas:

1. **Una puerta.** Un acceso, una sesión, una lista de qué puede ver cada
   quien. Hoy hay tres puertas y ninguna se habla con las otras.
2. **Un lanzador.** Una pantalla que dice qué herramientas hay y lleva a
   ellas.
3. **Un suelo común.** Los mismos tokens de diseño, los mismos iconos, los
   mismos diálogos accesibles, las mismas reglas de despliegue.

Lo que **no** es: una aplicación única. Cada herramienta sigue siendo un Worker
que se despliega solo y se rompe solo. Un fallo en la tienda no puede tumbar el
calendario.

---

## 3. La forma: un nombre, rutas dentro

Dos maneras de montarlo, y la elección tiene consecuencias que se pagan tarde:

| | Subdominio por herramienta | **Rutas bajo un nombre** |
|---|---|---|
| Direcciones | `calendarios.juancitoads.com` | `juancitoads.com/calendarios` |
| Cookie | Necesita `Domain=.juancitoads.com` | **`__Host-`**, atada a un origen |
| CSP | Una por subdominio | Una sola |
| CORS entre herramientas | Hace falta | No existe |
| Aislamiento del navegador | Mejor | Peor: todo comparte origen |

**Se elige rutas**, y el motivo decisivo es la cookie. El prefijo `__Host-`
prohíbe el atributo `Domain`: la cookie sólo vale para el origen exacto que la
puso, y ningún subdominio —ni uno comprometido— la ve. Con subdominios hay que
renunciar a `__Host-` y abrir la sesión a `*.juancitoads.com`.

El precio es real y hay que decirlo: todas las herramientas comparten origen,
así que comparten `localStorage` y el alcance de un XSS. Se compensa con la CSP
estricta que ya usa este repositorio (`script-src 'self'`, sin
`'unsafe-inline'`) aplicada a todo el hub.

```
/                        lanzador
/acceso                  entrada (enlace mágico)
/calendarios/*        →  Worker  calendarios
/bot/*                →  Worker  juancitoads-bot
/tienda/*             →  Worker  nebula-storefront
/tienda/admin/*       →  Worker  nebula-admin
/aprobar/:token          público, sin sesión
```

### El reparto: Service Bindings

El Worker raíz (`hub`) resuelve la sesión una vez y reparte a la herramienta
por **Service Binding**: una llamada entre Workers que no sale a la red, no
cuesta petición aparte y no añade latencia apreciable.

```jsonc
// wrangler.jsonc del Worker  hub
{
  "name": "hub",
  "services": [
    { "binding": "CALENDARIOS", "service": "calendarios" },
    { "binding": "BOT",         "service": "juancitoads-bot" },
    { "binding": "TIENDA",      "service": "nebula-storefront" }
  ]
}
```

### La trampa que hay que escribir antes de caer en ella

El `hub` resuelve quién eres y se lo pasa a la herramienta en una cabecera.
La herramienta se fía de esa cabecera. **Si esa herramienta sigue teniendo
dirección pública propia, cualquiera puede llamarla directamente poniendo la
cabecera a mano y ser quien quiera.**

No es teórico: `juancitoads-bot`, `nebula-storefront` y `nebula-admin` **hoy
tienen dirección propia**, porque hoy es la única que tienen.

Dos cierres, y se ponen los dos:

1. **Quitarles la puerta.** `workers_dev: false` y ninguna ruta ni dominio
   propio en los Workers de herramienta. La única forma de entrar es el
   binding.
2. **Firmar la identidad.** El `hub` manda un HMAC-SHA256 de
   `usuario|herramienta|caducidad` con un secreto compartido y vida corta; la
   herramienta lo verifica y rechaza lo que no cuadre. Así, si mañana alguien
   le devuelve una ruta a un Worker por comodidad, la puerta no se abre sola.

Esto es el caso 7 de la fase 9 del plan de migración, y por eso se escribe ese
test antes de que el hub exista.

---

## 4. Los datos: una base por herramienta, más un núcleo

D1 **no hace joins entre bases**. Eso decide el reparto: lo que se consulta
junto, vive junto.

```
hub-core-db          usuarios, sesiones, enlaces mágicos, herramientas,
                     permisos, registro de actividad
calendarios-db       clientes, calendarios, aprobaciones, chat, banco
juancitoads-bot-db   ya existe — no se toca
tienda-db            cuando la tienda lo pida
```

La identidad la **referencian** todas y la **cruzan** ninguna: el `hub`
resuelve el usuario una vez por petición y pasa el identificador. Así que
separarla no cuesta un join, y a cambio da migraciones independientes y radio
de daño acotado.

```sql
-- hub-core-db
create table users (
  id         text primary key,
  email      text not null unique,
  nombre     text not null default '',
  activo     integer not null default 1,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table magic_links (
  token_hash text primary key,       -- el enlace se manda; sólo se guarda su hash
  email      text not null,
  created_at text not null,
  expires_at text not null,          -- 15 minutos
  used_at    text
);
create index magic_caduca on magic_links(expires_at);

create table sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at text not null,
  expires_at text not null,
  user_agent text
);

create table tools (
  id       text primary key,          -- 'calendarios', 'bot', 'tienda'
  nombre   text not null,
  icono    text not null,             -- nombre en Icon.jsx, no un emoji
  ruta     text not null,             -- '/calendarios'
  activa   integer not null default 1,
  orden    integer not null default 0
);

create table tool_access (
  user_id text not null references users(id) on delete cascade,
  tool_id text not null references tools(id)  on delete cascade,
  rol     text not null default 'usuario',    -- usuario | admin
  primary key (user_id, tool_id)
);

-- Quién hizo qué, en qué herramienta. Con tres herramientas y varias manos,
-- la pregunta «¿quién borró esto?» llega sola.
create table activity (
  id         text primary key,
  user_id    text,
  tool_id    text,
  accion     text not null,
  detalle    text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index activity_tiempo on activity(created_at);
```

La convención de fechas del hub es **ISO-8601 en texto**. El bot usa enteros
epoch y se queda como está: reescribir dieciocho tablas en producción por
coherencia estética no se paga. Lo nuevo va en ISO.

Con esto, el `owner_id` que el plan de migración mete en cada tabla del
calendario deja de ser «el único usuario que hay» y pasa a ser una clave ajena
de verdad contra `hub-core-db.users`. La capa de acceso no cambia: ya exigía el
`owner_id`. Ése era el motivo de exigirlo.

---

## 5. El suelo común

Hoy este repositorio tiene un sistema de diseño en `index.css` —tokens `--fs-*`,
`--sp-*`, `--tap`, tres radios, dos niveles de sombra— y un juego de iconos en
`components/Icon.jsx` con rejilla de 24 y trazo 1,75. Es bueno y está escrito.
La tienda y el bot no lo tienen.

```
packages/
  ui/       tokens, Icon.jsx, useDialogA11y, armazón, lanzador
  auth/     sesión, cookies, firma de identidad, guardas
  db/       ayudantes de D1, migraciones, la capa de acceso con dueño
  test/     el formato «qué / dónde / por qué importa / arreglo» y el informe
workers/
  hub/          raíz: acceso, lanzador, reparto
  calendarios/
  bot/
  tienda/
apps/
  calendarios/  el front React de hoy
  ...
```

Monorepo con espacios de trabajo de npm. Las herramientas entran de una en una;
mientras no entren, siguen en su repositorio y funcionando.

Lo que se sube a `packages/ui` sube con sus reglas, no sólo con su código:
nunca por debajo de `--fs-3xs`, campos a 16 px en móvil, pulsables de 44 px,
nada de concatenar variables CSS con sufijos de opacidad, un hijo nunca con más
radio que su padre, y **ningún emoji como icono de interfaz**.

---

## 6. Las fases

### H1 — El nombre y el lanzador vacío · 1 día

Dominio en Cloudflare. Worker `hub` sirviendo una página que dice «Juancito
Ads» y nada más. Sin sesión, sin herramientas.

**Salida:** el dominio responde desde el Worker `hub` con su CSP puesta.

### H2 — La identidad compartida · 2–3 días

`hub-core-db` con el esquema del § 4. Enlace mágico heredado del bot: se manda
el testigo por correo, se guarda sólo su hash, caduca a los 15 minutos y se
marca `used_at` al canjearlo (un enlace mágico reutilizable es una contraseña
que no caduca). Sesión en cookie `__Host-sesion`.

Se siembran los usuarios reales y el catálogo de `tools`.

**Salida:** entrar con un correo de `admin_emails`, ver el lanzador con las
herramientas a las que se tiene acceso, y que un enlace ya usado no sirva dos
veces.

### H3 — Entra Calendarios · 2 días

La primera de verdad, y la más fácil porque llega recién migrada y ya pensada
para esto.

- `workers_dev: false` y sin ruta propia.
- Verificación de la identidad firmada (§ 3) en vez de su propia sesión.
- `users` y `sessions` propias del calendario **se retiran**: vivían en
  `calendarios-db` sólo para el corte. `owner_id` pasa a apuntar a
  `hub-core-db.users`.
- La ruta base pasa a `/calendarios`. `App.jsx` decide entre dos vistas según
  la URL, así que hay que revisar ese reparto y el `%BASE_URL%` de
  `index.html` —el mismo motivo por el que las imágenes se importan en vez de
  referenciarse con ruta absoluta—.
- **`/aprobar/:token` se queda fuera de la sesión.** Es la página que ve el
  cliente final. Si el reparto la mete detrás de la puerta, los enlaces ya
  enviados dejan de abrirse.

**Salida:** entrar por el hub, llegar a un calendario, compartirlo, y que el
enlace público siga abriéndose **sin sesión y con su testigo de siempre**.

### H4 — Entra el Bot · 2–3 días

- Su `magic_links` y `admin_emails` se retiran en favor de `hub-core-db`.
  Los correos de `admin_emails` se migran a `users` + `tool_access`.
- `workers_dev: false`, identidad firmada.
- El panel de conversaciones adopta `packages/ui`.
- Sus 18 tablas se quedan donde están, con sus enteros epoch.

**Salida:** el panel del bot se abre desde el lanzador, sin su acceso propio.

### H5 — Entra la Tienda · 3–4 días

Dos Workers (`nebula-storefront` y `nebula-admin`) y dos R2. El escaparate es
**público**: no va detrás de la sesión, sólo la administración.

Ése es el caso que obliga a que el reparto distinga rutas públicas de privadas
por herramienta, y no herramienta por herramienta. Conviene que llegue después
de `/aprobar` (H3), que plantea lo mismo en pequeño.

**Salida:** el escaparate abierto a cualquiera, la administración detrás de la
sesión, y las dos desplegándose por separado.

### H6 — El suelo común · 2 días

Se extrae `packages/ui` de este repositorio y se aplica a las otras dos. Se
unifican los diálogos accesibles (`role="dialog"`, `aria-modal`,
`useDialogA11y`), las regiones `role="status"` y los objetivos táctiles.

**Salida:** las tres herramientas se ven de la misma agencia, y `oxlint` pasa
sin avisos en todo el monorepo.

### H7 — Lo transversal · 2–3 días

Lo que sólo tiene sentido cuando ya hay hub:

- **Notificaciones.** Aquí sí se paga el Durable Object con hibernación de
  WebSocket que la fase 7 de la migración aplazó: una aprobación de un cliente,
  un ticket nuevo del bot, un pedido de la tienda. Un canal, tres herramientas.
- **Cron.** Las tareas recurrentes de `client_tasks` (`recurrence`,
  `recurrence_day`) no las dispara nadie hoy. Un Cron Trigger las materializa.
- **Registro de actividad** en el lanzador, desde `activity`.
- **Un panel de estado**: qué se desplegó, cuándo y con qué commit.

**Salida:** aprobar desde el enlace público levanta un aviso en el lanzador,
estando en otra herramienta.

---

## 7. Presupuesto

| Fase | Días |
|---|---|
| H1 · Nombre y lanzador | 1 |
| H2 · Identidad compartida | 2,5 |
| H3 · Entra Calendarios | 2 |
| H4 · Entra el Bot | 2,5 |
| H5 · Entra la Tienda | 3,5 |
| H6 · Suelo común | 2 |
| H7 · Lo transversal | 2,5 |
| **Total** | **~16 días** |

Con la migración: **~28 días** de trabajo efectivo. H4 y H5 son independientes
entre sí.

Coste: los mismos **5 $/mes** de Workers Paid. Los Service Bindings no se
cobran aparte, D1 y R2 caben en los tramos incluidos con este volumen, y el
plan cubre todos los Workers de la cuenta, no uno por Worker.

---

## 8. Lo que hay que decidir antes de H2

Tres cosas que este plan deja abiertas a propósito, porque dependen del negocio
y no de la arquitectura:

1. **El dominio.** Hoy el calendario vive en `calendarioapp-juancito.netlify.app`.
   El hub necesita un nombre propio, y una vez elegido es caro cambiarlo: entra
   en la cookie, en la CSP y en los enlaces de aprobación que ya tienen los
   clientes.
2. **Quién entra.** Hoy hay **un** usuario en todo el sistema. El hub sólo se
   paga si van a entrar varias personas con distintos permisos; si va a seguir
   siendo una sola, `tool_access` sobra y el lanzador es un menú.
3. **El proveedor de correo** para los enlaces mágicos. El bot ya usa uno:
   lo que use, se hereda.

Ninguna de las tres bloquea la migración del calendario, que es lo que empieza
primero.
