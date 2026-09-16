# Migración de Supabase + Netlify a Cloudflare

Plan de implementación. Escrito después de inspeccionar **el proyecto vivo**,
no el repositorio: donde los dos no coinciden, manda el que está en
producción, y más abajo se dice dónde no coinciden.

El destino es que este calendario deje de ser una aplicación suelta y pase a
ser la primera herramienta de un hub. Ese segundo plan está en
[`hub-cloudflare.md`](./hub-cloudflare.md); éste sólo mueve la aplicación de
sitio, y lo hace dejándola lista para entrar allí.

## Estado

| Fase | Estado |
|---|---|
| 0 · Congelar la verdad | Utillaje escrito; falta **ejecutarlo** y borrar `image-gen` |
| 1 · Cimientos | ✔ D1 `calendarios-db` y R2 `juancito-contenido` creadas; esquema aplicado y probado |
| 2 · Sesión y acceso | ✔ `worker/lib/sesion.js` + `scripts/sembrar-admin.mjs` |
| 3 · La API de datos | ✔ Capa de acceso, rutas y `db.js` reescrito con las mismas firmas |
| 4 · El enlace público | ✔ `worker/lib/publico.js`, con 23 casos |
| 5 · Las funciones de IA | ✔ Portadas a `worker/rutas/` |
| 6 · Imágenes a R2 | Rutas y conversión listas; **falta mover los datos** |
| 7 · Aprobaciones en vivo | ✔ Sondeo de 15 s, misma firma |
| 8 · Hosting | ✔ `wrangler.jsonc` + `public/_headers`; **falta desplegar y mover el DNS** |
| 9 · Tests de despliegue | ✔ Reescritos: 260 tests + 11 de bundle |

**Lo que falta no es código.** Falta ejecutar el volcado (necesita la clave
de servicio de Supabase), desplegar el Worker (necesita
`CLOUDFLARE_API_TOKEN`) y mover el DNS.

> **Esta rama no se puede mergear y desplegar a Netlify.** El front ya no
> habla con Supabase: habla con `/api/*`, que sólo existe dentro del Worker.
> Mergear sin desplegar el Worker deja el sitio sin datos.

Lo comprobado contra la D1 real está en § 5.2; el utillaje, en
[`scripts/migracion/README.md`](../scripts/migracion/README.md).

---

## 1. Lo que hay hoy, medido

Proyecto `Calendario APP` (`lwkepnrprcyabyhhorrc`), organización JuancitoAds,
**plan free**, us-west-2, Postgres 17.6.

| Tabla | Columnas | Filas | Peso |
|---|---|---|---|
| `clients` | 33 | 4 | 280 kB |
| `calendars` | 21 | 5 | 2.720 kB |
| `approvals` | 10 | 5 | 64 kB |
| `chat_messages` | 6 | 65 | 112 kB |
| `client_memories` | 5 | 5 | 48 kB |
| `client_tasks` | 11 | 0 | 40 kB |
| `task_templates` | 8 | 0 | 32 kB |
| `content_bank` | 9 | 1 | 48 kB |

Además: **1 usuario** en `auth.users`, **1 bucket** privado (`content-bank`)
con **1 objeto**, 16 políticas RLS, 7 funciones en `public` y una publicación
de Realtime que lleva **una sola tabla**: `approvals`.

El total real de datos son unos **3,3 MB**. Eso cambia la estrategia entera:
no hace falta escritura doble, ni sincronización progresiva, ni ventana de
mantenimiento larga. Cabe un corte limpio con ensayo previo.

### El detalle que decide medio plan

`calendars.days` no guarda referencias a imágenes: guarda **las imágenes**, en
base64, dentro del JSON.

| Calendario | `days` | `visual_references` | Posts | Con imagen |
|---|---|---|---|---|
| MES DE AGOSTO | **501.884** | 2 | 25 | **12** |
| Septiembre 2026 | 49.790 | **237.368** | 25 | 0 |
| Septiembre (visión clara) | 68.341 | 2 | 25 | 0 |
| Septiembre 2026 | 40.841 | 2 | 46 | 0 |
| Septiembre 2026 | 69.034 | **338.097** | 25 | 0 |

`clients.logo` es igual: `data:image/jpeg;base64,…` de 2,4 a 5,7 kB.
`utils.js` ya reduce a 400 px antes de codificar (`compressImage`), y aun así
doce imágenes pesan medio mega.

---

## 2. Lo que ya hay en Cloudflare

La cuenta no está vacía, y eso condiciona el hub más que la migración:

| Recurso | Nombre | Estado |
|---|---|---|
| D1 | `juancitoads-bot-db` | **18 tablas reales**, 258 kB |
| Worker | `juancitoads-bot` | activo |
| Worker | `nebula-storefront` | activo |
| Worker | `nebula-admin` | activo |
| R2 | `nebula-media`, `nebula-media-privada` | creados |
| KV | — | ninguno |

Dos avisos:

- **La API de listado de D1 miente.** Dice `num_tables: 0` para
  `juancitoads-bot-db`. Tiene dieciocho: `conversations`, `messages`,
  `leads`, `tickets`, `catalog_items`, `kb_docs`, `settings`,
  `conversation_insights`, `customer_facts`, `followup_sends`,
  `improvement_suggestions`, `keyword_hits`, `template_sends`,
  `tracked_links`, `conv_labels`, `magic_links`, `admin_emails` y
  `sqlite_sequence`. Antes de dar por vacía una base de D1, pregúntale a
  `sqlite_master`.
- **El bot ya resolvió la autenticación.** Tiene
  `magic_links(token, email, created_at, expires_at, used_at)` y
  `admin_emails(email, role, added_at)`. No se replica: se asciende al hub.

---

## 3. Equivalencias, pieza a pieza

| Hoy | En Cloudflare | Dificultad |
|---|---|---|
| Postgres + 16 políticas RLS | D1 (SQLite), **sin RLS** | **Alta** — la propiedad se muda al código |
| Auth (GoTrue), 1 usuario | Sesión propia: cookie + D1 | Media |
| PostgREST (`.from().select()`) | Rutas REST en el Worker | Media — 374 líneas de `db.js` |
| 5 RPC `security definer` | Rutas del Worker | Baja — «security definer» es «código de servidor» |
| Realtime sobre `approvals` | Sondeo, y más tarde Durable Object | Baja |
| Storage `content-bank` | R2 | Baja |
| Edge Functions (Deno) ×3 | Workers | **Baja** — ya son `Deno.serve(req => Response)` |
| Netlify + `netlify.toml` | Workers Static Assets + `_headers` | Baja |
| `admin-seed` (función Netlify) | Ruta del Worker, o `wrangler d1 execute` | Baja |

Las tres Edge Functions que sí se usan (`ai`, `ai-chat`, `github-adn`) son
manejadores HTTP planos: leen `Deno.env.get`, validan el JWT y hacen `fetch`
contra Anthropic, Groq o GitHub. El único uso que hacen de `supabase-js` es
`auth.getUser()` para comprobar la sesión. Cambiar `Deno.env.get(X)` por
`env.X` y esa comprobación por la del Worker es casi todo el trabajo.

---

## 4. Lo que la migración regala

No es sólo mover de sitio. Hay cuatro problemas que se caen solos:

1. **Se acaba la trampa de `isSupabaseEnabled`.** Hoy es una constante de
   compilación: sin `VITE_*` en el build, Vite la pliega a `false` y rollup
   borra el panel entero del bundle. De ahí `build:verificado`, el canario
   del bundle y medio párrafo de `CLAUDE.md`. Sin claves en el navegador no
   hay variable que borre nada: el build vuelve a ser `npm run build`.

2. **El bundle adelgaza.** `@supabase/supabase-js` arrastra PostgREST, GoTrue,
   Storage y Realtime (con su WebSocket) para lo que acaban siendo llamadas
   `fetch` al mismo origen. Los presupuestos de
   `tests/despliegue/rendimiento.bundle.test.js` habrá que **bajarlos**, no
   subirlos.

3. **La CSP se simplifica.** `connect-src 'self' https://*.supabase.co
   wss://*.supabase.co` pasa a `connect-src 'self'`, porque la API y la
   aplicación comparten origen. Y la regla de oro de `CLAUDE.md` —si
   reaparece un dominio de IA en `connect-src`, una clave volvió al front—
   se vuelve más afilada: ahora **cualquier** origen ajeno es sospechoso.

4. **Los proyectos gratuitos de Supabase se pausan por inactividad.** Un
   calendario que se usa unos días al mes es justo el perfil que acaba
   pausado, y el síntoma («no carga») no se parece a la causa. Workers y D1
   no se pausan.

Y uno que no se cae solo pero queda al alcance: hoy las tres rutas públicas
(`get_shared_calendar`, `submit_approval`, `update_post_content`) no tienen
**ningún límite de frecuencia** propio. En Workers se les puede poner uno de
verdad.

---

## 5. Los cuatro riesgos

### 5.1. D1 no tiene RLS — y con un solo usuario no se nota

Hoy hay dieciséis políticas haciendo de segunda red: aunque el código pida mal
los datos, Postgres no devuelve filas de otro dueño. En D1 eso no existe. Una
consulta a la que se le olvide el `owner_id` **no falla**: devuelve datos
ajenos, en silencio.

Con un usuario es invisible. Es exactamente la forma del fallo que
`20260915182356_cerrar_brechas_rls.sql` ya arregló una vez en el banco de
contenido —tres políticas que se llamaban «own» y sólo filtraban por
`bucket_id`—, y la migración lo reintroduce multiplicado por ocho tablas.

**Mitigación, y es innegociable:** una única capa de acceso. Ningún
`env.DB.prepare(...)` suelto por el Worker. Las tablas con dueño se leen y se
escriben por funciones que reciben el `owner_id` **al construirse** —no en cada
llamada, que es donde se olvidaría— y no ofrecen forma de omitirlo.

Ya está escrita: `worker/lib/acceso.js`, con 21 casos en
`tests/migracion/acceso.test.js` y una guarda en
`tests/despliegue/acceso.test.js` que falla si aparece un `prepare(` fuera de
ella. La guarda se probó rompiéndola a propósito: señala archivo, línea y el
arreglo.

Tres decisiones que el código fija y conviene conocer:

- `approvals` no tiene `owner_id`: se acota por `calendar_id in (select id
  from calendars where owner_id = ?)`, que es lo que hacía su política RLS.
  Acotar por `calendar_id` a secas dejaría leer las aprobaciones de cualquier
  calendario cuyo identificador se filtre.
- En `insertar`, el `owner_id` de la capa **pisa** el que traiga el cuerpo de
  la petición. Si el cuerpo pudiera fijarlo, cualquiera escribiría en nombre
  de otro.
- El upsert de `guardar` lleva `where <tabla>.owner_id = ?` al final. Sin eso,
  un upsert con el identificador de una fila ajena la sobrescribiría: el
  INSERT choca, el UPDATE gana, y el dato de otro desaparece sin ningún error.

### 5.2. El techo de 2 MB por fila, con 490 kB ya gastados

Límites reales de D1, comprobados:

| Límite | Valor |
|---|---|
| Fila / string / BLOB | **2.000.000 bytes** |
| Sentencia SQL | **100.000 bytes** |
| Parámetros ligados por consulta | 100 |
| Consultas por invocación | 50 (free) / 1.000 (paid) |
| Tamaño de base | 500 MB (free) / 10 GB (paid) |

El calendario de agosto ocupa **501.884 caracteres con 12 imágenes**. Veinticinco
imágenes en ese mismo calendario son ~1 MB; súmale unas
`visual_references` como las que ya existen (338 kB) y la fila no cabe. Se
llega al muro **sin hacer nada raro**, sólo usando la aplicación como está
pensada.

Y el límite de 100 kB por sentencia significa que ese calendario **no se puede
ni importar** con un `INSERT` literal: hay que pasarlo por parámetros ligados.

**Mitigación:** las imágenes salen del JSON a R2 **durante** la migración
(fase 6), no después. Es el único momento en que ese cambio sale gratis,
porque ya se está reescribiendo el formato de cada fila.

#### Lo que se midió, no lo que se supone

El esquema de § 6 se aplicó sobre una D1 de verdad (`calendarios-db`) y se
sometió a estos casos antes de dar nada por bueno:

| Caso | Resultado |
|---|---|
| Un `days` de **500.036 bytes** | Entra. `json_valid` = 1 y `json_extract` navega dentro |
| `client_id` que no existe | `FOREIGN KEY constraint failed` |
| `days` que no es JSON | `CHECK constraint failed: json_valid(days)` |
| `month = 12` | `CHECK constraint failed: month between 0 and 11` |
| Upsert `(calendar_id, post_id)` ×2 | Una sola fila, con el último estado |

La primera línea es la que importa: **el calendario de agosto cabe**. El
techo de 2 MB es real pero todavía no está tocado, así que la migración no
depende de resolver las imágenes el mismo día — pero sí antes de que se
ilustren las trece publicaciones que hoy van sin imagen.

La segunda confirma que D1 aplica las claves ajenas: la importación va en
orden (`users` → `clients` → `calendars` → el resto) o falla en la primera
fila.

#### La forma real de los datos, perfilada

Antes de mover nada se perfiló lo que hay, porque el riesgo de una
conversión no es el volumen: es un campo que nadie esperaba.

| Qué | Resultado |
|---|---|
| Claves de una publicación | `category, comment, creativo, descripcion, format, guion, hashtagsFinales, id, idea, image, publishTime, referenceLink, script, status, title` |
| Claves de un día | `category, concept, date, dayName, posts, specialDate, weekNumber` |
| Claves de una referencia visual | `format, id, name, url` |
| JSON con tipo inesperado | 0 |
| Testigos de menos de 24 caracteres | 0 |
| Meses fuera de 0–11 | 0 |
| Campos con `data:` | **sólo `posts[].image` (12) y `visualReferences[].url`** |

`creativo` asustaba —suena a imagen— pero no pasa de **24 caracteres**, y
`referenceLink` es una dirección. O sea que el conversor cubre todo lo que
hay hoy.

Lo que no cubre es lo que venga mañana: si una versión de la interfaz
empieza a guardar una miniatura en un campo nuevo, ese base64 viaja a D1
sin que nadie lo note hasta que la fila choca con el techo de 2 MB. Por eso
`base64SinConvertir()` recorre TODOS los campos y el importador lo avisa.

### 5.3. Sacar las imágenes rompe dos cosas que nadie mira

Esto no se descubre leyendo `db.js`. Hay dos sitios que necesitan **los bytes**,
no una clave de R2:

- `src/export.js:57` monta `<img src="${esc(post.image)}">` dentro del HTML
  autónomo que se manda al cliente. Ese fichero **se abre en local**: una ruta
  `/api/media/…` no resuelve contra nada. Si se migra sin más, el HTML
  exportado sale con todas las imágenes rotas.
- `src/components/CalendarView.jsx:2009-2012` manda la imagen a Anthropic como
  `source: { type: "base64", media_type: "image/jpeg", data: … }`.

Los dos necesitan rehidratar desde R2 en el momento. Es trabajo pequeño y muy
fácil de olvidar; por eso va escrito aquí y con un caso de regresión en la
fase 9.

### 5.4. El repositorio y la base viva no cuentan la misma historia

- `supabase_migrations` registra **8** versiones. El repositorio tiene **13**
  ficheros.
- Una versión registrada —`restrict_agency_rpc_to_authenticated`— **no tiene
  fichero** en el repositorio.
- Seis ficheros del repositorio no están registrados (`client_editing`,
  `visual_refs_and_day_labels`, `meta_recipe`, `ai_instructions`,
  `calendar_offers_and_meta_recipe`, `ref_approvals_and_post_editing`).
- Hay una Edge Function **desplegada y ausente del repositorio**: `image-gen`,
  versión 1, un proxy a Nano Banana. `grep -rn "image-gen"` en todo el
  repositorio no devuelve **nada**: no la llama ni la despliega nadie. Es el
  mismo caso que `ai-chat` documentado en `CLAUDE.md`, sólo que éste nunca se
  llegó a usar.

**Consecuencia directa:** el esquema de D1 se deriva de la **introspección de
la base viva** —que ya está hecha y transcrita en la fase 1—, no de reproducir
el SQL del repositorio. Reproducir el repositorio daría un esquema distinto del
que está en producción.

---

## 6. Traducción del esquema

Reglas de conversión:

| Postgres | SQLite / D1 | Motivo |
|---|---|---|
| `uuid` + `gen_random_uuid()` | `text`, generado en el Worker | SQLite no trae UUID |
| `jsonb` | `text` + `check (json_valid(x))` | D1 trae las funciones `json_*` |
| `timestamptz` + `now()` | `text` ISO-8601 UTC | El front ya recibe cadenas ISO: no se toca ni una fecha |
| `boolean` | `integer` 0/1 | — |
| `smallint` | `integer` | — |
| trigger `set_updated_at` | lo pone la capa de acceso | Un trigger `after update` sobre la misma tabla se llama a sí mismo |

Sobre las fechas: el bot usa enteros epoch. **No se toca el bot.** La
convención del hub para lo nuevo es ISO-8601 en texto, porque es lo que ya
consume este front y porque `fmtDate()` sigue siendo la única puerta a las
fechas (`toISOString()` mueve el día medio mundo; eso no cambia aquí).

### Esquema de D1

```sql
-- ----- identidad -----
create table users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,          -- PBKDF2-SHA256, 210.000 iteraciones
  salt          text not null,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Se guarda el SHA-256 del testigo, no el testigo: un volcado de D1 no
-- puede devolver sesiones utilizables.
create table sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at text not null,
  expires_at text not null
);
create index sessions_expira on sessions(expires_at);

-- ----- datos -----
create table clients (
  id               text primary key,
  owner_id         text not null references users(id) on delete cascade,
  name             text not null,
  industry         text not null default '',
  instagram        text not null default '',
  phone            text not null default '',
  whatsapp         text not null default '',
  sucursales       text not null default '',
  direcciones      text not null default '',
  primary_color    text not null default '#1E90FF',
  secondary_color  text not null default '#FFFFFF',
  accent_color     text not null default '#F5A623',
  logo             text,                 -- clave de R2 tras la fase 6
  descripcion      text not null default '',
  valores          text not null default '',
  audiencia        text not null default '',
  competencia      text not null default '',
  estilo_guion     text not null default '',
  estilo_locucion  text not null default '',
  hashtags         text not null default '',
  notas_inspeccion text not null default '',
  github_repo      text not null default '',
  github_folder    text not null default '',
  github_context   text not null default '',
  ai_instructions  text not null default '',
  ideas_bank       text not null default '[]' check (json_valid(ideas_bank)),
  saved_categories text not null default '[]' check (json_valid(saved_categories)),
  weekly_structure text not null default '[]' check (json_valid(weekly_structure)),
  meta_recipe      text check (meta_recipe is null or json_valid(meta_recipe)),
  meta_recipe_sha  text,
  meta_recipe_at   text,
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index clients_owner on clients(owner_id, created_at);

create table calendars (
  id                text primary key,
  client_id         text not null references clients(id) on delete cascade,
  owner_id          text not null references users(id) on delete cascade,
  name              text not null default '',
  month             integer not null,
  year              integer not null,
  campaign          text not null default '',
  week_concepts     text not null default '[]'  check (json_valid(week_concepts)),
  days              text not null default '[]'  check (json_valid(days)),
  visual_references text not null default '[]'  check (json_valid(visual_references)),
  day_labels        text not null default '{}'  check (json_valid(day_labels)),
  offers            text not null default '',
  promo_code        text not null default '',
  approval_id       text,
  generated_at      text,
  share_token       text,
  share_enabled     integer not null default 1,
  share_expires_at  text,
  allow_editing     integer not null default 0,
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index        calendars_owner  on calendars(owner_id, created_at);
create index        calendars_client on calendars(client_id);
create unique index calendars_share  on calendars(share_token) where share_token is not null;

-- El UNIQUE no es decorativo: es lo que sostiene el upsert de submit_approval.
create table approvals (
  id                    text primary key,
  calendar_id           text not null references calendars(id) on delete cascade,
  post_id               text not null,
  estado                text not null check (estado in ('aprobado','cambios')),
  comentario            text not null default '',
  reviewer_name         text not null default '',
  suggested_descripcion text,
  suggested_guion       text,
  created_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (calendar_id, post_id)
);
create index approvals_cal on approvals(calendar_id);

create table chat_messages (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  owner_id   text not null references users(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index chat_cliente on chat_messages(client_id, created_at);

create table client_memories (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  owner_id   text not null references users(id) on delete cascade,
  content    text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index memorias_cliente on client_memories(client_id, created_at);

create table client_tasks (
  id             text primary key,
  client_id      text not null references clients(id) on delete cascade,
  owner_id       text not null references users(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  status         text not null default 'pending',
  due_date       text,
  recurrence     text not null default 'none',
  recurrence_day integer,
  completed_at   text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index tareas_cliente on client_tasks(client_id, status);

create table task_templates (
  id             text primary key,
  owner_id       text not null references users(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  recurrence     text not null default 'none',
  recurrence_day integer,
  is_mandatory   integer not null default 1,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table content_bank (
  id          text primary key,
  client_id   text not null references clients(id) on delete cascade,
  owner_id    text not null references users(id) on delete cascade,
  file_path   text not null,            -- clave de R2
  file_name   text not null,
  file_type   text not null default 'image',
  description text not null default '',
  size_bytes  integer not null default 0,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index banco_cliente on content_bank(client_id, created_at);
```

Dos diferencias deliberadas respecto de Postgres, y por qué:

- Donde Postgres tenía `text` nulable con `default ''`, aquí va
  `not null default ''`. Es lo que la aplicación hace de todos modos, y
  elimina el `?? ""` disperso.
- `approvals.estado` gana un `check`. Hoy la validación vive sólo dentro de
  `submit_approval`; si mañana otra ruta escribe ahí, la base lo para.

D1 aplica las claves ajenas, así que la importación va en orden
(`users` → `clients` → `calendars` → el resto) o dentro de una transacción con
`pragma defer_foreign_keys = true`.

---

## 7. El mapa de rutas

`src/lib/db.js` (374 líneas) es toda la superficie. Queda así:

| `db.js` | Ruta del Worker |
|---|---|
| `loadWorkspace` | `GET /api/espacio` |
| `saveClient` / `deleteClient` | `PUT` / `DELETE /api/clientes/:id` |
| `saveCalendar` / `deleteCalendar` | `PUT` / `DELETE /api/calendarios/:id` |
| `shareCalendar` | `POST /api/calendarios/:id/enlace` |
| `setShareEnabled` | `PATCH /api/calendarios/:id/enlace` |
| `fetchApprovals` | `GET /api/calendarios/:id/aprobaciones` |
| `subscribeApprovals` | *(sondeo sobre la anterior — § 8.7)* |
| chat × 3 | `GET`/`POST`/`DELETE /api/clientes/:id/chat` |
| memorias × 3 | `… /api/clientes/:id/memoria` |
| tareas × 5 | `… /api/clientes/:id/tareas` |
| plantillas × 3 | `… /api/plantillas-tarea` |
| `applyTemplatesToClient` | `POST /api/clientes/:id/tareas/plantillas` |
| banco × 5 | `… /api/clientes/:id/banco` |

Público, sin sesión:

| RPC | Ruta |
|---|---|
| `get_shared_calendar` | `GET /api/publico/:token` |
| `submit_approval` | `POST /api/publico/:token/aprobacion` |
| `update_post_content` | `PATCH /api/publico/:token/publicacion/:postId` |

IA y medios:

| Hoy | Ruta |
|---|---|
| función `ai` | `POST /api/ia` |
| función `ai-chat` | `POST /api/ia/chat` |
| función `github-adn` | `POST /api/adn` |
| — | `GET /api/media/:clave` *(con sesión)* |
| — | `GET /api/publico/:token/media/:clave` *(sin sesión)* |

---

## 8. Las fases

Cada una acaba con algo comprobable. Si el criterio de salida no se cumple, no
se pasa a la siguiente.

### Fase 0 — Congelar la verdad · ½ día

1. Decidir `image-gen`: borrarla del proyecto y borrar `IMAGE_GEN_API_KEY` de
   los secretos. (Si se quiere conservar la idea, se commitea primero y se
   migra como una ruta más; lo que no puede es seguir existiendo sin código.)
2. Volcar las 85 filas a JSON desde la base viva, con `pg_column_size` incluido
   para saber cuáles rozan el techo de D1.
3. Descargar el único objeto de `content-bank`.
4. Anotar el desfase de migraciones en el propio volcado, para que quien lo lea
   dentro de seis meses sepa que el repositorio no lo explica.

**Salida:** un directorio con el esquema introspectado, las 85 filas y el
objeto. Reproducible sin Supabase delante.

### Fase 1 — Cimientos · ½ día

Workers Paid ($5/mes). No es por el precio: es porque el plan gratuito da
**10 ms de CPU** por invocación y 50 consultas de D1, y aquí se serializan
objetos de medio mega.

```
D1  →  calendarios-db     ✔ creada (77aa10eb-…), esquema aplicado y probado
R2  →  juancito-contenido
Worker → calendarios  (wrangler.jsonc, assets + run_worker_first ["/api/*"])
```

El esquema vive en `migraciones/d1/0001_esquema.sql` y la conversión de tipos,
en `scripts/migracion/convertir.js` —puro y con 27 casos en `npm test`, porque
es donde se pierden datos sin que falle nada—.

**Salida:** ✔ las diez tablas y los diez índices existen, y los cinco casos de
§ 5.2 se comportan como se esperaba.

### Fase 2 — Sesión y acceso · 1–2 días

Se conserva el acceso por contraseña. Los enlaces mágicos son mejores, pero
exigen un proveedor de correo, y esa dependencia se resuelve en el hub
(donde el bot ya la tiene); meterla aquí es alargar el corte sin motivo.

- PBKDF2-SHA256, 210.000 iteraciones, vía `crypto.subtle`. Workers no trae
  bcrypt.
- Cookie `__Host-sesion`: `Secure; HttpOnly; SameSite=Lax; Path=/`, sin
  `Domain`. El prefijo `__Host-` la ata a este origen exacto; sobrevive al
  hub porque el hub va a ser **un solo nombre con rutas**, no un subdominio
  por herramienta (ver `hub-cloudflare.md` § 3).
- El alta del administrador sustituye a `netlify/functions/admin-seed.mjs`:
  `wrangler d1 execute` con el hash ya calculado. Un endpoint que crea
  administradores deja de existir, que era el motivo de `ADMIN_SEED_TOKEN`.
- `src/lib/auth.js` cambia por dentro y no por fuera: `useSession()`,
  `signIn()` y `signOut()` mantienen la firma, así que `App.jsx`,
  `Panel` y `Login.jsx` no se tocan.

**Salida:** iniciar sesión, recargar, seguir dentro; cerrar sesión invalida la
fila de `sessions`, no sólo la cookie.

### Fase 3 — La API de datos · 2–3 días

El grueso. Se escribe primero la capa de acceso del § 5.1 y después las rutas
del § 7 encima de ella.

`src/lib/db.js` conserva **todas** sus firmas y cambia el cuerpo: donde ponía
`supabase.from("clients").select()` pone `fetch("/api/clientes")`. Ni
`Workspace`, ni `CalendarView`, ni `ClientModal` se enteran. Es lo que hace
que esta fase sea larga pero no arriesgada.

**Salida:** `npm test` en verde y el panel funcionando contra D1 con los datos
de la fase 0 cargados en local (`wrangler dev --local`).

### Fase 4 — El enlace público · 1 día

Las tres RPC son la superficie **no autenticada**. Se portan validación por
validación, y ninguna se da por obvia:

`get_shared_calendar` — testigo de 24 caracteres mínimo; `share_enabled`;
caducidad; y sobre todo **la lista blanca de campos**. Hoy devuelve `name`,
`industry`, `primary_color` y `logo` del cliente, y nada más: ni `owner_id`, ni
`share_token`, ni el ADN de marca. En SQL esa lista está escrita a mano. En el
Worker hay que escribirla igual de a mano — un `select *` recortado después en
JavaScript es una filtración esperando su turno.

`submit_approval` — estado en `('aprobado','cambios')`; `post_id` de 1 a 200
caracteres; calendario vigente; **el `post_id` tiene que existir dentro de
`days[].posts[]` o de `visual_references[]` de ese calendario** (sin esa
comprobación cualquiera escribe aprobaciones sobre identificadores inventados);
sugerencias sólo si `allow_editing`; truncados a 2.000 / 120 / 5.000; upsert
por `(calendar_id, post_id)`.

`update_post_content` — exige `allow_editing`; localiza el post; y modifica
**sólo** `descripcion` y `guion`, truncados a 10.000. El `jsonb_set` original
es quirúrgico; en JavaScript hay que mutar esas dos claves del objeto
encontrado, no reescribir el post entero.

Se añade lo que hoy no hay: un límite de frecuencia por testigo y por IP.

**Salida:** `Aprobar.jsx` funciona contra el Worker, y hay un caso por cada
validación de arriba —incluido el del `post_id` que no pertenece al calendario.

### Fase 5 — Las funciones de IA · 1 día

`ai`, `ai-chat` y `github-adn` pasan a rutas del mismo Worker.

Lo que se conserva sin tocar, porque está aprendido a base de golpes y sigue
siendo cierto en Workers:

- La política de pensamiento por nivel (`Nivel.pensar`), apagada en «calidad».
- **Recorrer todos los bloques** de la respuesta de Anthropic, nunca
  `content.find(b => b.type === "text")`.
- El `diagnostico` con `stopReason` y tokens.
- `decodeRutaGitHub()` y el 404 con nombre cuando la carpeta no está en el
  árbol.

Lo que mejora: los tiempos. Netlify cortaba a los 10 s y por eso esto vivía en
Supabase (150 s). En Workers de pago el reloj **no tiene límite mientras el
cliente siga conectado**, y los 5 minutos son de **CPU**, que esperar a
Anthropic no consume. El lote de seis publicaciones deja de ir contra un
cronómetro.

Las claves (`ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GITHUB_TOKEN`) pasan a
secretos de Worker. Siguen sin llevar prefijo `VITE_` porque siguen sin pisar
el navegador.

**Salida:** generar un lote de seis y leer el ADN de un cliente **con espacio
en el nombre** (el caso de `Baby Caleb`, que es el que destapó el escapado).

### Fase 6 — Las imágenes salen del JSON · 1–2 días

El cambio estructural. `posts[].image` y `clients.logo` dejan de ser
`data:image/…;base64,…` y pasan a ser claves de R2:

```
clientes/{clientId}/logo.jpg
clientes/{clientId}/posts/{uuid}.jpg
```

- Subida: `POST /api/media` devuelve la clave; `compressImage` sigue reduciendo
  a 400 px antes de subir.
- Lectura con sesión: `GET /api/media/:clave`.
- Lectura pública: `GET /api/publico/:token/media/:clave`, que comprueba que
  esa clave pertenece al calendario de ese testigo. Sin esa comprobación el
  testigo de un cliente abre los medios de otro.
- **Rehidratación** en los dos sitios del § 5.3: `export.js` vuelve a embeber
  base64 al exportar, y el envío a Anthropic descarga los bytes de R2.
- Conversión de los datos existentes: recorrer los cinco calendarios y los
  cuatro clientes, extraer cada base64, subirlo, sustituirlo por la clave.

**Salida:** ninguna fila de `calendars` supera los 100 kB; el HTML exportado se
abre en local **con las imágenes puestas**; el análisis de imagen por IA sigue
respondiendo.

### Fase 7 — Aprobaciones en vivo · 1 día

No hay equivalente de Realtime, y resulta que casi no hace falta.

`CLAUDE.md` ya lo dice: lo que llega por Realtime se vuelca **sólo en el
estado** (`onUpdateCalLocal`), nunca se persiste. O sea que el trabajo real ya
lo hace `fetchApprovals()`, y `subscribeApprovals()` sólo dispara una relectura.

Se reimplementa con la **misma firma**:

```js
export function subscribeApprovals(calendarDbId, onChange) {
  const id = setInterval(() => { onChange(); }, 15000);
  return () => clearInterval(id);
}
```

Quince segundos mientras el calendario está abierto. El cliente final tarda
minutos en revisar; nadie va a notar la diferencia, y se ahorra un Durable
Object entero.

Cuando el hub justifique notificaciones de verdad (varias herramientas, avisos
al móvil), se sustituye por un Durable Object con hibernación de WebSocket
—disponible incluso en el plan gratuito, con respaldo SQLite—. Entonces sirve
para las tres herramientas, no sólo para ésta.

**Salida:** aprobar desde el enlace público y ver el cambio en el panel sin
recargar.

### Fase 8 — Hosting y corte · 1 día

```jsonc
{
  "name": "calendarios",
  "main": "./worker/index.js",
  "compatibility_date": "2026-09-16",
  "assets": {
    "directory": "./dist/",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

**La trampa de las cabeceras.** Workers Static Assets lee un `public/_headers`
(hasta 100 reglas, 2.000 caracteres por línea), pero
*«los encabezados personalizados definidos en `_headers` no se aplican a las
respuestas generadas por el código de tu Worker»*. O sea que las cabeceras de
seguridad viven **en dos sitios**: `_headers` para el HTML y los recursos,
y el código del Worker para todo lo que cuelga de `/api/*`. Si sólo se
traduce `netlify.toml` a `_headers`, la API se queda sin `X-Content-Type-Options`,
sin `Cache-Control: no-store` y sin CSP, y el sitio se ve exactamente igual.
Es el mismo tipo de fallo invisible que justifica `tests/despliegue/`.

La CSP queda:

```
default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self';
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

`'unsafe-inline'` sigue en `style-src` y sigue sin estar en `script-src`, por
el mismo motivo de siempre. `img-src` pierde `https:` cuando termine la fase 6,
porque ya no habrá imágenes de terceros. `connect-src` pierde Supabase.

El corte, con 3,3 MB de datos, cabe en una tarde:

1. Ensayo completo contra una D1 de pruebas. Cronometrar.
2. Poner el panel en sólo lectura (o avisar y no tocarlo) una hora.
3. Volcar, convertir, importar **con parámetros ligados** (recordar: 100 kB
   por sentencia).
4. Cotejar recuentos y, fila por fila, los cinco calendarios.
5. Mover el DNS. Netlify se queda en pie una semana como marcha atrás.
6. Pausar el proyecto de Supabase —no borrarlo— durante un mes.

**Salida:** los recuentos cuadran, el enlace público de un calendario ya
compartido **sigue funcionando con su testigo de siempre** (los tokens se
migran tal cual; si no, los enlaces que ya tiene el cliente mueren), y
`npm run verificar` pasa.

### Fase 9 — Los tests de despliegue · 2 días

2.753 líneas acopladas a `netlify.toml` y al SQL del repositorio, y `main`
está protegida por el job `verificar`. No es opcional.

| Fichero | Qué pasa |
|---|---|
| `tests/utils/toml.js` | Lee `netlify.toml` → lee `wrangler.jsonc` |
| `tests/utils/sql.js` | Sigue valiendo: cambia el directorio y el dialecto |
| `plantillas.test.js` | CSP y cabeceras → ahora **en dos sitios** (§ fase 8) |
| `migraciones.test.js` | Las políticas RLS ya no existen: pasa a vigilar la capa de acceso |
| `funciones.test.js` | Paridad `supabase/functions/` ↔ workflow → paridad `worker/rutas/` ↔ rutas registradas |
| `secretos.test.js` | Sigue igual de necesario: ninguna clave con prefijo `VITE_` |
| `rendimiento.bundle.test.js` | Fuera el canario de `isSupabaseEnabled`; presupuestos **a la baja** |
| `infra.live.test.js` | API de Supabase → API de Cloudflare |

Casos nuevos, uno por cada trampa que estrena la migración:

1. Ningún `prepare(` fuera de la capa de acceso.
2. Toda tabla con `owner_id` tiene su guarda.
3. Nada que se escriba en D1 empieza por `data:` (el techo de 2 MB).
4. Ninguna fila de `calendars` supera un presupuesto declarado.
5. El HTML de `export.js` lleva las imágenes embebidas, no claves de R2.
6. Las cabeceras de seguridad están en `_headers` **y** en las respuestas de
   `/api/*`.
7. El Worker no confía en ninguna cabecera de identidad que venga de fuera
   (esto empieza a importar en el hub; se escribe ya).

Se conserva el formato de fallo con **qué / dónde / por qué importa / arreglo**
y el `informe-despliegue.md` que CI comenta en el pull request. Y hay que
renombrar el job en `ci.yml` y en el ruleset a la vez, o `main` se queda sin
puerta.

---

## 9. Presupuesto

| Fase | Días |
|---|---|
| 0 · Congelar la verdad | 0,5 |
| 1 · Cimientos | 0,5 |
| 2 · Sesión y acceso | 1,5 |
| 3 · La API de datos | 2,5 |
| 4 · El enlace público | 1 |
| 5 · Las funciones de IA | 1 |
| 6 · Imágenes a R2 | 1,5 |
| 7 · Aprobaciones en vivo | 1 |
| 8 · Hosting y corte | 1 |
| 9 · Tests de despliegue | 2 |
| **Total** | **~12,5 días** |

Las fases 5, 6 y 7 son independientes entre sí: si hay más de una mano, van en
paralelo después de la 3.

Coste corriente: **5 $/mes** (Workers Paid), con D1 y R2 dentro de sus tramos
incluidos para este volumen. Hoy son 0 $ en Supabase free y Netlify free, con
la pausa por inactividad como peaje.

---

## 10. Lo que no se migra

- **`image-gen`.** No la llama nadie. Se borra, con su secreto.
- **`netlify/functions/admin-seed.mjs`.** Su motivo de existir era materializar
  un usuario de GoTrue desde variables de Netlify. Sin GoTrue, sobra.
- **`src/lib/migrateLocal.js`.** Subía a la nube lo que quedara en
  `localStorage`. Esa migración terminó; la marca `jads-migrado-a-supabase` y
  el respaldo `jads-data` se pueden retirar en la fase 3.
- **Las políticas RLS.** No tienen destino. Su intención sí: se traduce a la
  capa de acceso y a los casos 1 y 2 de la fase 9.
- **Las seis migraciones sin registrar.** Su efecto ya está en el esquema
  introspectado. Se archivan, no se reproducen.

## 11. El punto de retorno

La marcha atrás es barata hasta el paso 5 de la fase 8: mientras el DNS siga
apuntando a Netlify, Supabase sigue siendo la producción y Cloudflare un
ensayo. Después del DNS, la vuelta cuesta lo que se haya escrito en D1 desde el
corte —con este volumen, otro volcado.

Se mantiene Supabase **pausado, no borrado**, un mes. Un proyecto pausado
conserva los datos; uno borrado, no.
