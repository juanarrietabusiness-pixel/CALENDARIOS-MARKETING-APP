# El Estudio y Meta como proveedor de IA

Estado a 2026-09-30: **plan, nada implementado.** Se investigó Agents Office
(`media.mjs`, `estudio-mcp.mjs`, `src/studio.js`), la app (`worker/rutas/imagen.js`,
`video.js`, `lib/anthropic.js`, `lib/configIA.js`, el cron) y lo publicado sobre Meta.
Lo que **no** se pudo comprobar está marcado como tal: hace falta la llave de Meta.

---

## En diez líneas

1. **El Estudio** convierte «una llamada a Gemini que devuelve una imagen» en un
   servicio de **trabajos**: se pide, se avanza por pasos (sin que el Worker espere), y el
   resultado —imagen o video— acaba en R2, en la ficha del cliente, listo para
   ponerlo en una publicación.
2. **No se copia Agents Office.** Es una aplicación de escritorio con disco, procesos y
   un solo dueño: guarda en carpetas, espera con `setTimeout` y lee llaves del entorno de
   Windows. Aquí hay clientes, R2, D1, un plan gratuito de Workers (10 ms de CPU, 50
   peticiones por invocación) y una regla: el navegador no habla con nadie más que con el
   Worker. Se portan **las ideas y los contratos** (catálogo por modelo, cola con reanudación,
   presupuesto, «Animar», papelera), no el código.
3. **Se empieza por lo que ya hay:** Gemini (Nano Banana y Veo) con la llave que el Worker ya
   tiene. Después **fal.ai** (una sola llave da Kling, Seedance, Flux, Hailuo…). Higgsfield,
   OpenAI y Grok van al final y sólo si se usan.
4. **Lo que más valor tiene para una agencia** no es la lista de 50 modelos: es **«Animar»** una
   imagen aprobada para sacar un reel 9:16, generar con la guía visual **del cliente** (que ya
   está en su cerebro) y no salir de la publicación para hacerlo.
5. **Meta como proveedor** significa una cosa concreta: **Muse Spark por el punto de entrada
   compatible con Anthropic** (`api.meta.ai/v1/messages`) para la IA de **texto** del espacio.
   No genera imágenes para este proyecto, y «Meta AI» —donde la agencia monta el HTML— sigue
   siendo un paso manual.
6. **Hallazgo que hay que decidir antes de nada:** el modelo que usa el lanzador de Agents Office
   (`muse-spark-1.3-contributor`) es el nivel **«contributor»: cuesta 10–20 veces menos a cambio de
   que Meta entrene con lo que se le manda.** Con el ADN de los clientes —costos, márgenes— eso no
   entra. El plan lo **prohíbe** para datos de clientes.
7. **No se sabe cuánto de la API de Anthropic acepta Meta** (razonamiento, caché, herramientas,
   imágenes): las fuentes dicen «puede ignorar o rechazar». Por eso lo primero de Meta es un
   **ensayo de compatibilidad contra la llave real**, no código.
8. Todo pasa por **los mismos cuellos de botella que ya existen**: `abrirFlujo` (texto),
   `prepararIA` y `registrarConsumo` (presupuesto y contador), `/api/media` (archivos por cliente).
   Ninguna ruta nueva gasta sin tope ni sin apuntarlo.
9. **Orden:** ensayo de Meta (medio día, con llave) → Estudio A (motor + trabajos + Gemini) →
   Estudio B (pantalla) → Meta en producción → Estudio C (video) → Estudio D (agentes) →
   Estudio E (más motores). Cada paso se despliega solo y no rompe el anterior.
10. **Decisiones que necesito de ti** al final (§7), con mi recomendación en cada una.

---

## 1. Punto de partida

### Lo que la app tiene hoy

| Pieza | Estado |
|---|---|
| **Imágenes** | `POST /api/generar-imagen`: **una** llamada síncrona a Gemini (`gemini-2.5-flash-image`, o lo que diga `GEMINI_MODEL`), 120 s de plazo, sube el resultado a `clientes/<id>/generadas/<uuid>.<ext>` y devuelve la clave. Cuatro usos: imagen de una publicación, **historia** desde un post, **ampliar** a otra proporción, **portada de destacado**, y el chat. |
| **Video** | Sólo se **lee**: `rutas/video.js` sube un video a Gemini para que el asistente lo describa. **No se genera ninguno.** |
| **Llave** | `GOOGLE_AI_KEY` (secreto del Worker). |
| **Gasto** | `consumo_ia` ya tiene `proveedor`, `funcion`, `client_id`, `costo_usd`; `registrarConsumoGemini()` apunta la imagen; `bloqueoPorPresupuesto()` la frena si el espacio eligió «detener». El medidor de la cabecera lo suma todo. |
| **Archivos** | R2 `juancito-contenido`; `/api/media/*` sirve y borra **sólo** claves `clientes/<id>/…` de un cliente del espacio (con `Range`, para que el iPhone reproduzca video). `/api/medio-publico/<testigo>/<nombre>` da a un tercero (Meta) un enlace firmado que caduca en tres días. |
| **Cron** | Cada minuto: cola de publicación → foto de métricas → informe del día 1, **en ese orden y sólo si el anterior no tuvo nada**. Ya vive en los límites del plan gratuito. |
| **Texto** | Cinco sitios llaman a Anthropic, **todos por `abrirFlujo()`** (calendario, chat ×2, informes, auditorías, cerebro). Modelo y razonamiento los decide el espacio (`ajustes_espacio`). |

### Lo que Agents Office tiene

`media.mjs` (939 líneas): catálogo de unos 70 modelos con sus ajustes y qué medios aceptan
(fotograma inicial/final, referencias, un video), seis motores (Higgsfield, Google, Grok, OpenAI,
fal, «prueba»), **trabajos en segundo plano** que guardan los ids remotos y **se reanudan**,
presupuesto por día y por mes con estimación previa, galería con carpetas y papelera de 30 días,
tarjetas y visor, y `estudio-mcp.mjs`, la herramienta que usan sus agentes. 327 líneas de pruebas
(presupuesto, carpetas, nombres, Higgsfield, Google).

### Qué se porta y qué no

| Se porta (la idea o el contrato) | No se porta |
|---|---|
| El **catálogo por modelo**: motor, tipo, medios que acepta, ajustes con sus valores, costo estimado | La galería **global** en disco: aquí todo es **por cliente** |
| La **cola con ids remotos y reanudación** (el trabajo sobrevive a un reinicio) | `setTimeout`/sondeo dentro del proceso: el Worker no puede esperar |
| **Presupuesto con estimación previa** y aviso de costo | El presupuesto **separado** del Estudio (ver §7, decisión 4) |
| El motor **«prueba»** (gratis, sin llave) para probar todo el flujo | Llaves del entorno de Windows: son secretos del Worker |
| **Animar** una imagen, **Variar**, papelera con plazo, carpetas como etiquetas | La interfaz: es JS de DOM a mano; se reescribe en React con los tokens de aquí |
| La herramienta de agentes (`generar_imagen`, `generar_video`, `estado_trabajo`) | Los 53 modelos de Higgsfield con su `higgsfield-schemas.json` (62 KB): sólo si hay llave |

---

## 2. Lo que la infraestructura impone

Cada punto es una trampa ya vivida en este repositorio (`CLAUDE.md`). El diseño se dobla a ellas:

| Restricción | Consecuencia para el Estudio |
|---|---|
| **10 ms de CPU por invocación** (plan gratuito) | No decodificar base64 de imágenes de entrada ni de salida en el Worker si se puede evitar; **pasar los bytes por streaming** de la respuesta del motor a R2 (`FixedLengthStream` con el `content-length`). Las referencias van por **enlace firmado**, no en base64 |
| **50 peticiones de salida y 50 consultas a D1 por invocación** | Un paso hace **una** cosa: enviar, o sondear, o descargar **un** archivo. Nada de «esperar hasta que termine» |
| **El cron ya está lleno** | El Estudio **no** es una tarea nueva del cron: es el **cuarto y último** paso de la misma vuelta, sólo si no hubo nada que publicar ni medir. Y no es el único que avanza los trabajos (§3.5) |
| **`connect-src 'self'`** | Ningún motor se llama desde el navegador. Los resultados se ven desde `/api/media/…` |
| **D1 no tiene RLS** | Tablas nuevas **con `owner_id` y `client_id`** declaradas en `acceso.js`; un test recorre todas las tablas con dueño y falla si falta una |
| **Fila ≤ 2 MB, sentencia ≤ 100 KB, parámetros ligados** | Ningún archivo dentro de D1: **la clave de R2** y sus metadatos |
| **El navegador no lleva llaves** | `HF_KEY`, `FAL_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `META_MODEL_API_KEY` = secretos del Worker; `GOOGLE_AI_KEY` ya está |
| **Todo `create` lleva `if not exists`; todo `references` lleva índice** | Lo vigila `tests/despliegue/migraciones.test.js` |
| **Toda IA pasa por el presupuesto** | Cada motor llama a `bloqueoPorPresupuesto()` antes y apunta en `consumo_ia` después. Un motor nuevo que se salte cualquiera de las dos gasta sin tope o sin apuntarlo |
| **Todo evento del servidor tiene su `case` en `App.jsx`** | Los eventos del Estudio se declaran y se atienden a la vez; hay un test que compara los dos |
| **JS inicial ≤ 110 kB por chunk** | El Estudio es una carga **perezosa** (como el mapa 3D y el panel de publicación), con su propio tope en `rendimiento.bundle.test.js` |
| **Lo que falla sin ruido** | Un trabajo que se pierde no puede quedarse «en marcha» para siempre: plazo y estado `failed` con el motivo, visibles (como la cola fallida de `/programacion`) |

---

## 3. Parte A — El Estudio

### 3.1 Cómo funciona

```
navegador ──► /api/estudio/trabajos (POST) ──► D1 estudio_trabajos   (estado: en cola)
     ▲                                              │
     │  cada 4 s mientras se mira                    ▼
     └── GET …/trabajos/<id>  ──►  avanzarTrabajo()  ── un paso ──►  motor (Gemini · fal · …)
     ▲                                     │                                │
     │  y por el socket:                   │  descarga el resultado         │
     └── «estudio:trabajo» ◄── Hub ◄───────┴──── streaming ──► R2 clientes/<id>/estudio/AAAA-MM/…
                                                    │
        el cron (último paso de la vuelta) ─────────┘  avanza los que nadie está mirando
```

Un **trabajo** es una fila con su estado, sus ids remotos y lo ya descargado. Cada llamada a
`avanzarTrabajo()` da **un paso acotado** y guarda su avance —el mismo principio que la cola
de Instagram («cada paso guarda su avance y la siguiente sigue»)—:

| Estado | Qué pasa en un paso |
|---|---|
| `en_cola` | Se comprueban modelo, llave, medios y presupuesto; se **envía** al motor y se guardan sus ids |
| `en_marcha` | Se **sondea** una vez cada pedido remoto; si terminó, se **descarga un** archivo a R2 |
| `hecho` | Todo descargado. `warning` si sólo llegaron algunos |
| `fallido` | El motivo, en palabras (`friendly()` de Agents Office: sin saldo, filtro de contenido, plazo…) |

**Idempotencia** —lo que hace seguro reintentar—: los ids remotos se guardan **antes** de
sondear, y cada URL ya descargada se apunta (`rq.got` en Agents Office) para que un paso
repetido nunca guarde dos veces el mismo archivo ni cobre dos veces. Publicar es lo único que
no se repite; aquí, **enviar al motor** es lo único que no se repite.

### 3.2 Quién avanza los trabajos

Un trabajo de imagen suele terminar en el primer paso; uno de video tarda de uno a diez minutos.
Alguien tiene que volver a mirar. Tres candidatos:

| Quién | A favor | En contra |
|---|---|---|
| **El navegador** (sondea cada 4 s mientras la pantalla está abierta) | Sin infraestructura nueva; respuesta casi inmediata | Si se cierra la pestaña, se para |
| **El cron** (último paso de la vuelta de cada minuto) | Sigue aunque nadie mire; es lo que hace la cola de publicación | Granularidad de un minuto; cabe **un** trabajo por vuelta si los otros pasos no tuvieron nada |
| **Una alarma del Durable Object** (`EspacioHub`) | Sondeo cada 5–8 s sin navegador, con presupuesto propio de 50 peticiones, y empuja el resultado por el socket | Código nuevo dentro del objeto que ya sostiene el tiempo real; más cosas que pueden fallar sin ruido |

**Recomendación: navegador + cron.** Es lo que ya está probado en este proyecto, y un video
que tarda cuatro minutos y termina en cinco no es un problema. La alarma del objeto se deja
como mejora si el uso lo pide. Los dos caminos llaman a **la misma** `avanzarTrabajo()`, y una
reserva condicional por `updated_at` (como la cola de publicación) evita que dos vueltas
avancen el mismo trabajo a la vez.

### 3.3 Datos (migración 0026)

Todas con `owner_id`, `client_id`, `if not exists`, índices en cada clave foránea, JSON con
`check (json_valid())` y **sin `check` en tipo ni estado** (cambiarlos es reconstruir la tabla).

| Tabla | Para qué |
|---|---|
| `estudio_trabajos` | `id`, `client_id` (null = del espacio, sin cliente), `estado`, `tipo` (imagen/video), `motor`, `modelo`, `prompt`, `n`, `ajustes` (json), `medios` (json: ids de archivos por función), `remoto` (json: ids del motor, ya descargados), `archivos` (json: ids resultantes), `nota` (lo que está pasando), `costo_estimado`, `costo`, `error`, `creado_por`, `origen` (`persona`/`asistente`/`claude`), `calendar_id` + `post_id` (si nació de una publicación), `carpeta_id`, tiempos |
| `estudio_archivos` | Lo que sale y lo que se sube: `id`, `client_id`, `clave` (R2), `tipo`, `mime`, `ancho`, `alto`, `bytes`, `prompt`, `modelo`, `ajustes`, `trabajo_id`, `carpeta_id`, `favorito`, `usado_en` (json: publicaciones), `borrado_at` (papelera) |
| `estudio_carpetas` | Etiquetas, no directorios (como en Agents Office): un archivo nunca se mueve en R2, así los enlaces que ya tiene una publicación siguen valiendo |

**La papelera** borra al **leer**, como `purgarTareas()`: pasados 30 días se quita de R2 y de
la tabla. Lo que una publicación usa **no se purga** (`usado_en`), o una imagen aprobada
desaparecería del calendario.

### 3.4 Motores y catálogo

**El catálogo es datos, no código**: un modelo es un objeto (`motor`, `tipo`, `roles`, `ajustes`,
`costo`, `nota`, `calidad`, `velocidad`, `creador`) y un motor es una función con **el mismo
contrato** para todos:

```js
motor.enviar(env, trabajo, medios)  → { remoto: [{ id, … }] } | { archivos: [{ bytes|url, mime }] }
motor.sondear(env, trabajo, remoto) → { listo, archivos?, nota?, error? }
```

Un test recorre **todo el catálogo** y falla si un modelo de imagen acepta fotogramas (Agents
Office ya tuvo ese fallo: la tarjeta de prueba pedía cuadros y parecía un formulario de video),
si un ajuste no tiene su valor por defecto entre los permitidos, o si un modelo no declara costo.

**Modelos de la primera entrega** (precios de Agents Office, estimados y marcados como tales):

| Motor | Modelos | Costo aprox. |
|---|---|---|
| **Gemini** (llave ya puesta) | Nano Banana 2.5 · **Nano Banana 2** · 2 Lite · **Pro** (hasta 14 referencias, 4K) | 0,02 – 0,134 $ / imagen |
| **Gemini** | **Veo 3.1** · Fast · Lite (con sonido; **exige facturación** en el proyecto de Google) | 0,05 – 0,40 $ / s |
| **fal.ai** (llave nueva) | Flux Schnell · Kontext · Seedream 4 · Ideogram 3 · **Kling 2.5 Turbo** · Seedance 1 · Hailuo 02 | 0,003 $/img · 0,045–0,12 $/s |
| **prueba** | Tarjeta SVG y «video» animado: **gratis, sin llave** | 0 |

**Después, y sólo si se usan:** OpenAI (`gpt-image-1`, texto legible en la imagen), Grok, y
**Higgsfield** con su esquema de 62 KB (Kling 3, Seedance 2, Soul…): es el motor más grande de
portar y el que exige una llave de pago propia.

**Un video de Veo cuesta hasta 3,20 $** (8 s a 0,40). Por eso la estimación previa no es un lujo (§3.7).

### 3.5 Referencias y medios

Los motores piden las imágenes de referencia de tres maneras: en base64 dentro de la petición
(Gemini), como **URL pública** (Higgsfield, fal) o subiéndolas a su almacén. Codificar en base64
en el Worker come CPU; **la app ya tiene la respuesta**: `medio-publico` (enlace firmado a **un**
archivo de R2, caduca a los tres días, sin sesión). Las referencias se entregan así: **cero
bytes por el Worker**, y sólo se puede referenciar lo que es **del mismo cliente** (se comprueba
la clave `clientes/<id>/` antes de firmar, igual que `imagenDelPost()` hoy).

Para Gemini, que sólo acepta base64, se codifica **por trozos** (`aBase64`, ya existe) y se
limita a tres referencias por petición; con más, se avisa.

### 3.6 Salida: de dónde viene y cómo entra a R2

- **Gemini imagen** devuelve base64 dentro del JSON (~1–2 MB): es la única decodificación que
  queda en el Worker. Hoy ya se hace; se mide el CPU y, si roza los 10 ms, se pide al motor
  imágenes más pequeñas o se pasa al camino por URL (fal/Higgsfield/Veo devuelven URL).
- **URLs de resultado** (fal, Higgsfield, Veo): `https` únicamente, sin credenciales del
  cliente, tope de tamaño (imagen 25 MB, video 200 MB), tipo comprobado por sus **primeros
  bytes** (`MAGIC` de Agents Office: PNG/JPEG/WebP/MP4/WebM) y **sin seguir una redirección a
  `http`**. Se pasa el cuerpo directo a `env.MEDIA.put(clave, cuerpo)` con
  `FixedLengthStream`.
- **Clave:** `clientes/<id>/estudio/AAAA-MM/<AAAA-MM-DD prompt-corto HHMMSS>.<ext>`, **nunca
  reutilizada** (Agents Office aprendió que reutilizar un nombre hacía que la galería mostrara
  una imagen vieja desde la caché del navegador; aquí la ruta de medios cachea una hora
  —`private, max-age=3600`— y por eso la clave lleva un `uuid` al final).
- **Lo subido a mano** al Estudio (fotos del producto, logo, una cara) se guarda igual y se marca
  `subido`: sirve de referencia o de fotograma inicial.

### 3.7 Costos y presupuesto

| Momento | Qué se hace |
|---|---|
| **Al pedir** | `estimar(modelo, ajustes, n)` con la tabla de precios; se **enseña** el costo en el botón («Generar · ≈ 0,40 $») y, **desde 0,50 $, se pide un segundo toque** («Este video cuesta ≈ 3,20 $»). Si el presupuesto del mes se agotaría, `bloqueoPorPresupuesto()` lo dice **antes** de enviar |
| **Al terminar** | `registrarConsumo` con `proveedor` = `gemini`/`fal`/…, `funcion` = `estudio-imagen`/`estudio-video`, `client_id` y `costo_usd` **estimado** (los motores no devuelven el costo real) |
| **Nunca** | Un trabajo que **falla** sin entregar nada no cuesta; uno que entrega parte, cuesta lo entregado. Nunca se apunta dos veces (la idempotencia de §3.1) |

El medidor de la cabecera, Ajustes → Presupuesto y el consumo por cliente **ya lo suman todo**
sin cambios: sólo hay que dar de alta los proveedores nuevos en las etiquetas. Los precios
llevan **fecha** (`PRECIOS_AL`) y un test avisa cuando pasan de 90 días, como `costs.mjs`.

### 3.8 La interfaz

**Dos puertas al mismo servicio, ninguna nueva pantalla entera:**

1. **Pestaña «Estudio»** del cliente (`/cliente/<slug>/estudio`, junto a Contenido y Cerebro):
   compositor (prompt, modelo, formato, cantidad, referencias) y **galería** del cliente con
   trabajos en curso arriba. El prompt **arranca con la guía visual del cliente** (§3.9).
2. **Dentro del panel de una publicación:** en la pestaña **Subir**, dos botones —«Crear
   imagen» y «Crear video»— que abren el compositor ya preparado con el formato de la
   publicación (post 4:5, reel 9:16), su idea y su descripción, y que al terminar **la ponen en
   la publicación** sin pasar por la galería. Y sobre una imagen ya puesta: **«Animar»**.

Piezas: escoger modelo (ordenar por «recomendado / más barato / mejor calidad», filtrar por
creador, buscar; con los que no tienen llave **visibles y atenuados con cómo activarlos**, como en
Agents Office); tarjetas con la acción principal a la vista y el resto en «⋯»; visor de dos
columnas; «Variar» y «Repetir»; carpetas; papelera con «días que quedan»; descarga con el
tamaño pedido.

**Cuidados heredados del sistema de diseño:** sólo tokens; iconos de `Icon.jsx` (hay que añadir
los que falten con la rejilla de 24); objetivos ≥ `--tap`; nada se atenúa con `opacity` para decir
«sin llave» (el texto sigue a 4,5:1); `role="status"` para lo que va pasando; a 390 px el
compositor **es una hoja**, no un panel; un trabajo en curso se anuncia **sin robar el foco**.

**Peso:** carga perezosa, con tope propio en `rendimiento.bundle.test.js` (objetivo ≤ 35 kB
comprimidos). Se comprueba también que **no** entra en la carga inicial.

### 3.9 Cómo encaja con lo que ya existe

| Ya existe | Cambio |
|---|---|
| `/api/generar-imagen` (historias, ampliar, portada, chat) | **Mismo contrato de entrada y de salida** —`{ clave, mimeType }`—, pero por dentro crea un trabajo `prueba`-o-Gemini y espera el primer paso. No se rompe ningún llamador y de paso **se ven en la galería** |
| `GOOGLE_AI_KEY` / `GEMINI_MODEL` | Se conservan. El modelo por defecto sale del catálogo (`nano-banana-2`), y `GEMINI_MODEL` sigue mandando si está puesto |
| **Cerebro** | Nuevo uso `para: "imagen"` en `USOS`: devuelve las notas de **estilo visual** (marca, `maquetacion`: paleta, tipografía, negativos, escala) que **hoy se dejan fuera del texto a propósito**, y sigue **sin dar las internas**. El compositor las pega como base del prompt. Un test comprueba que una nota interna nunca llega a un prompt de imagen |
| **`post.image`** | El resultado se guarda como `/api/media/clientes/<id>/estudio/…` —la misma forma que ya sirve la página de aprobación (`srcPublico()`) y el HTML exportado—. **Instagram sólo acepta JPEG**: `prepararMediosParaMeta` ya convierte en el navegador al programar; para video, el navegador comprueba **códec y proporción** al ponerlo |
| **Reels** | «Animar» genera 9:16 con la imagen como **fotograma inicial**; la portada del video (`portada`, `portadaMs`) se escoge como hoy |
| **Chat** | La herramienta `generar_imagen` pasa al motor nuevo, gana `modelo` y `referencias`, y aparece `generar_video`, que **no espera**: devuelve una marca `[[trabajo: id]]` que el chat convierte en la tarjeta cuando termina (el mismo mecanismo de marcas de `mensajeChat.js`) |
| **MCP (Claude)** | `generar_imagen`, `generar_video`, `ver_estudio`, `estado_trabajo`. **Escriben y cuestan dinero:** cada una pasa por el presupuesto, se firma «Claude (persona)» y **no puede pedir más de 4 variantes ni un video de más de 10 s** sin que lo ponga una persona |
| **Subir** («Subir rápido») | Un tercer origen: «crear con IA» además de archivo y Drive |
| **Aprobación** | Sin cambios: el cliente ve la imagen o el video como cualquier otro medio |

### 3.10 Seguridad

- **Acotado por cliente, en la capa:** las tres tablas en `TABLAS_CON_DUENO` y
  `TABLAS_CON_CLIENTE`; un colaborador sólo ve el Estudio de **sus** clientes; «sólo lectura» ve la
  galería pero no genera (se corta en `worker/index.js`, antes de cualquier ruta).
- **Un id de archivo o de referencia que llega del navegador se comprueba** contra el cliente del
  trabajo (subiendo por `clave`, no confiando en el id).
- **Sin llaves en ningún sitio que no sea un secreto del Worker.** `tests/despliegue/secretos.test.js`
  ya falla si aparece una; se añaden los nombres nuevos a su lista.
- **La CSP no cambia.** Si al terminar el trabajo alguien ve `fal.run` o `googleapis.com` en
  `connect-src`, es la señal de que una llave volvió al navegador.
- **El filtro de contenido del motor se respeta y se dice:** «lo bloqueó el filtro de Google;
  cambia el prompt», no un error genérico.
- **Video servido desde R2** con `nosniff` y `Content-Type` fijo por extensión: nunca el que
  venga del motor.
- **Un archivo generado no es «del cliente»:** no se marca como aprobado ni se programa solo. Sale
  por el camino de siempre (aprobación → paso final → programar).

### 3.11 Pruebas

| Nivel | Qué | Cómo |
|---|---|---|
| **Puro** | Catálogo íntegro, estimación, `friendly()`, elegir la ruta de un modelo, nombres de clave sin repetir | Vitest, sin red |
| **Motores** | Cada motor contra un **doble de `fetch`** (como los SSE falsos de Anthropic): envío, sondeo, descarga, filtro de contenido, 401/402/429, plazo agotado, respuesta sin archivo | Vitest |
| **Trabajos** | `avanzarTrabajo` contra `d1EnMemoria()`: **reanudar tras un fallo a medias** (se cae entre dos descargas y no se guarda dos veces), reserva condicional (dos vueltas a la vez), cancelar, reintentar, presupuesto justo, motor sin llave | Vitest con D1 real |
| **Acceso** | Un cliente ajeno da «no encontrado» en **todas** las rutas; colaborador y sólo lectura; una referencia de otro cliente se rechaza | Vitest sobre el Worker de verdad (`pide las rutas`) |
| **Despliegue** | Tablas declaradas, `if not exists`, índices, secretos, evento del socket con su `case`, chunk del Estudio ≤ tope y fuera de la carga inicial | `tests/despliegue/` |
| **Vivo** | El cambio de un trabajo **llega** al socket de la otra persona | `npm run test:vivo` (con «prueba») |
| **Con llave** | Un pedido real de cada motor, barato (Flux Schnell, Nano Banana 2 Lite, Veo Lite 4 s) | `npm run test:motores`, sólo a mano y con llaves, como `test:infra` |
| **Pantalla** | Abrir el compositor, generar con «prueba», ver la tarjeta, ponerla en una publicación, 390 px y 1280 px, sin errores en consola | Chromium real (lo único que cazó los fallos de «identificador sin importar») |

### 3.12 Entregas

| | Qué | «Hecho» cuando |
|---|---|---|
| **A0** | Migración 0026, tablas declaradas en `acceso.js`, catálogo y motor **prueba**, `avanzarTrabajo`, rutas `/api/estudio/*`, eventos | El flujo completo corre con «prueba»: crear, avanzar, reanudar, cancelar, presupuesto; con sus pruebas |
| **A1** | Motor **Gemini imagen** con referencias por enlace firmado; `/api/generar-imagen` pasa por él sin cambiar de contrato; consumo y estimación | Las cuatro pantallas que hoy generan imágenes siguen igual **y** aparecen en `estudio_archivos` |
| **B** | Pestaña **Estudio** y botones en el panel: compositor, galería, «Usar en la publicación», carpetas, papelera | Recorrido completo en Chromium a 390 y 1280 px |
| **C** | **Video**: Veo (Gemini) y fal (cola), **Animar**, avance por navegador **y por cron**, evento por el socket | Un video de «prueba» cruza el cron sin nadie mirando; uno real (Veo Lite, 4 s) llega a R2 |
| **D** | Herramientas del chat y del MCP; nuevo uso `para: "imagen"` del cerebro | Claude pide una imagen por MCP y queda en la galería del cliente, con costo apuntado |
| **E** | Motores adicionales (OpenAI, Grok, **Higgsfield** con su esquema), ordenar/filtrar modelos, «Variar» | Sólo lo que se use de verdad |

---

## 4. Parte B — Meta como proveedor de IA

### 4.1 Qué es, exactamente

Meta ofrece **Muse Spark** (1.3 desde el 2 de septiembre de 2026) por la *Meta Model API*, con un
punto de entrada **compatible con el SDK de Anthropic** —`https://api.meta.ai/v1/messages`,
autenticación con un token de portador (`MODEL_API_KEY`), 1 M de tokens de contexto, entrada de
texto, imagen y video—. Es un modelo de **texto/razonamiento**. No genera imágenes ni video en
este proyecto.

**Precios** (según las fuentes, a 30-sep-2026):

| | Entrada | Salida | Caché leída | Búsqueda web |
|---|---|---|---|---|
| **Muse Spark 1.3 estándar** | 1,25 $/M | 4,25 $/M | 0,15 $/M | 2,50 $/1.000 |
| Muse Spark 1.3 **contributor** | ~0,10 $/M | ~0,20 $/M | — | — |
| *Sonnet 5 (lo que usa hoy la app)* | *2 $/M* | *10 $/M* | *0,20 $/M* | *10 $/1.000* |

Es decir: ~40 % menos en entrada y ~57 % menos en salida que Sonnet, y una caché que vale lo
mismo. **No es un cambio de orden de magnitud**; la razón para tenerlo es sobre todo
**redundancia**: el saldo de Anthropic ya se agotó una vez sin que nadie lo viera.

### 4.2 Lo que hay que decidir primero: el nivel «contributor»

El lanzador de Agents Office usa `muse-spark-1.3-contributor`. **Ese modelo es el barato *porque
Meta entrena con lo que se le manda.*** Para Agents Office puede ser una decisión razonable
(prompts propios, tareas de la casa); **aquí el ADN de un cliente lleva costos, márgenes y
proveedores «que no se dicen al cliente»,** y el cerebro existe justo para que esos datos no
salgan. Regla de este plan:

> **El nivel «contributor» no se admite en esta aplicación.** El código rechaza cualquier id de modelo
> que lo lleve y lo dice, y la configuración sólo ofrece el estándar. Un test lo comprueba.

(Y una observación para Agents Office: si su oficina de PanaClaw también trabaja con datos de
clientes, conviene mirar qué elige su opción 2.)

### 4.3 Lo que se sabe y lo que no

| | Estado |
|---|---|
| Existe el endpoint `/v1/messages` y funciona con el SDK de Anthropic y Claude Code | **Publicado** por Meta y por terceros; Agents Office lo usa |
| Razonamiento (`thinking: adaptive`, `output_config.effort`) | **No verificado.** Lo más probable es que lo rechace o lo ignore; hoy toda la app lo manda |
| Caché de prompt (`cache_control`) | **No verificado.** Si se ignora, el ahorro de la Fase 0 (≈14 000 tokens cacheados por tanda) **se pierde con este proveedor** |
| Herramientas con nuestra forma (`tools`, `tool_use`, `tool_result`) | **No verificado**, y de ellas depende el asistente |
| Herramientas **de servidor de Anthropic** (`web_search_2026…`, `web_fetch_2026…`) | **No existen fuera de Anthropic.** Meta cobra su propia búsqueda web (2,50 $/1.000), con otra forma |
| Bloques de imagen en base64 | **No verificado**; los usa el chat y las auditorías (miran la rejilla) |
| Forma del flujo SSE (`message_start`, `content_block_delta`, `usage`) | **No verificado**; nuestro lector es estricto |
| Forma de `usage` (tokens de entrada, salida, caché) | **No verificado**; de ahí sale el costo |
| Lista de modelos (`/v1/models`) | **No verificado** |
| Forma de los errores (401/402/429) | **No verificado**; `mensajeDeRechazo` supone la de Anthropic |

No pude leer la documentación oficial (`ai.developer.meta.com` está bloqueada desde aquí): lo de
arriba sale de páginas de terceros. **Por eso la primera entrega de Meta es un ensayo.**

### 4.4 Diseño

**Un solo punto de cambio:** todo el texto ya pasa por `abrirFlujo()`, y el presupuesto por
`prepararIA()` / `registrarConsumo()`. No hay que tocar las cinco rutas: se **generaliza lo que
`adaptarAlModelo()` ya hace para Haiku** (traducir la petición al idioma del modelo dentro de
`abrirFlujo`, para que una ruta nueva no tenga que saberlo).

```
ruta (chat, calendario, informe…)  →  prepararIA() ─► { proveedor, modelo, esfuerzo, capacidades }
                                          │
                                          ▼
                                    abrirFlujo(env, peticion, { proveedor })
                                          │  adaptar(peticion, capacidades)   ← quita/traduce lo que el proveedor no habla
                                          ▼
                              anthropic (api.anthropic.com)   |   meta (api.meta.ai)
                                          │
                                          ▼
                     leerFlujo  ─►  { texto, uso }  ─►  registrarConsumo({ proveedor, modelo, uso })
```

**`worker/lib/proveedoresIA.js`** (nuevo, puro donde se pueda): por proveedor, `{ id, nombre,
url, cabeceras(env), modelos, precios, adaptar(peticion), capacidades }`. `capacidades` es un mapa
—`razonamiento`, `cache`, `herramientas`, `web`, `imagenes`, `documentos`— que **se mide** (§4.5) y se
guarda, no se supone.

**Configuración** (migración 0027, sin `check` en la columna):

| Columna | Valores | Efecto |
|---|---|---|
| `ajustes_espacio.ia_proveedor` | `anthropic` (por defecto), `meta` | Quién contesta la IA de texto |
| `ajustes_espacio.ia_respaldo` | `no` (por defecto), `si` | Si el elegido falla por **saldo agotado, 5xx o saturación**, se prueba con el otro **una vez**, se avisa, y el gasto se apunta al que contestó |
| `ajustes_espacio.ia_capacidades` | json | Resultado del último ensayo de compatibilidad, por proveedor |

**Secreto:** `META_MODEL_API_KEY` (Agents Office lo llama `MODEL_API_KEY`).

**Pantalla (Ajustes → IA):** selector de proveedor, y **«Probar la conexión»**, que corre el
ensayo **desde el Worker** (con la llave del servidor) y enseña qué acepta cada proveedor. Cada
carencia se dice en palabras: «Meta no tiene razonamiento: las fichas se escribirán sin
pensar» / «Meta no tiene búsqueda web con esta forma: el asistente no podrá buscar en internet».

**Modelos:** Meta tiene, hasta donde se sabe, **un solo modelo estándar por versión**. Los
niveles «Sonnet / Opus / Haiku» del espacio dejan de tener sentido con Meta: la pantalla lo dice
y el selector de nivel de razonamiento se deshabilita si `razonamiento` no está en las
capacidades.

### 4.5 Diferencias que hay que resolver

| Hoy la app manda… | Con Meta | Decisión de diseño |
|---|---|---|
| `thinking: adaptive` + `output_config.effort` | Probablemente inválido | `adaptar` los quita; **sin razonamiento el `max_tokens` no necesita el margen** (`MARGEN_RAZONAMIENTO`), se recalcula |
| `cache_control` en el ADN | Puede ignorarse | Se mide (ensayo §4.6, caso 3). **Si no cachea**, el proveedor se **desaconseja** para el calendario y el asistente, donde el prompt es enorme y repetido, y se deja para tareas cortas |
| Web `web_search_2026…` / `web_fetch_2026…` (herramientas de servidor) | No existen | Se quitan; si el modelo debe poder buscar, hay que **implementar la búsqueda de Meta como herramienta propia** (otra forma y otro costo) — **no entra en la primera entrega** |
| `tools` con `input_schema` | Depende | Sin herramientas funcionales, el **asistente no se puede pasar a Meta** (sus dos bucles dependen de `tool_use`). Se apaga esa función para ese proveedor en vez de dejarla rota |
| Imágenes en base64 (chat, auditorías) | Depende | Idem: sin imágenes, las **auditorías de perfil** (que «miran» la rejilla) no pueden ir por Meta |
| `usage.cache_read_input_tokens`… | Otra forma posible | `costoUSD` se generaliza por proveedor; sin `usage` fiable se **estima** y se marca «estimado» |
| Mensajes de error | Otra forma | `RechazoAnthropic` pasa a `RechazoIA`, con `proveedor`; `mensajeDeRechazo` habla del proveedor que fue |
| `/v1/models` para resolver «opus» | Puede no existir | Sólo Anthropic lo usa; Meta usa su id fijo |

**Lo que de verdad podría pasar a Meta sin perder nada** (si el ensayo sale bien): la redacción de
publicaciones (`rutas/ia.js`), las propuestas de reglas del cerebro (`cerebro/ia.js`), la ficha
técnica y los informes. **Lo que no:** el asistente (herramientas + web) y las auditorías
(imágenes), salvo que el ensayo demuestre lo contrario.

### 4.6 El ensayo de compatibilidad (Fase B0, sin código de producción)

Un script (`npm run test:meta`, **sólo a mano, con llave**, como `test:infra`) y el mismo código
detrás del botón «Probar la conexión». Diez casos, cada uno con su veredicto ✅ / ⚠️ degradable / ❌:

1. Una petición mínima, en streaming: ¿la forma de los eventos es la que lee `partirSSE`?
2. `usage`: ¿trae `input_tokens` y `output_tokens`? ¿y de caché?
3. **Caché:** dos peticiones iguales con `cache_control`; ¿la segunda lee de caché?
4. `thinking` y `output_config.effort`: ¿aceptados, ignorados o rechazados (y con qué mensaje)?
5. `tools` con dos funciones; ¿devuelve un `tool_use` bien formado y acepta el `tool_result`?
6. Una imagen en base64 (una de las de prueba); ¿la describe?
7. Un documento PDF/`document`: ¿se acepta?
8. `max_tokens` grande (64 000): ¿lo acepta?
9. Errores: llave inválida, modelo inexistente, saldo agotado: ¿qué códigos y textos vuelven?
10. **El id de modelo del nivel estándar** frente al `-contributor`, y que el primero **no**
    diga que entrena con lo que se manda (se guarda la respuesta oficial, no una suposición).

El resultado va a `ia_capacidades` y **manda sobre el diseño**: si la caché falla, el plan cambia
(Meta sólo para tareas cortas); si `tools` falla, el asistente queda fuera; si todo va bien, se
amplía.

### 4.7 Calidad: no se cambia el proveedor por defecto sin medirlo

Los prompts de esta app están escritos y afinados para Claude (las marcas `[[pieza: …]]`, el
formato `REGLA: / TEXTO: / RESPALDO:` de las reglas, el tono de Panamá, «SIN REGLAS»). Un modelo
distinto puede seguirlos peor sin que ningún test falle: **un texto peor es un fallo mudo.**

Antes de activarlo para nadie: **12 casos reales** (tres publicaciones de tres clientes, una
propuesta de reglas, una ficha técnica), los dos proveedores con el mismo contexto, y una
**rúbrica** de cuatro columnas (fidelidad al ADN, cumple el formato exacto, tono y
español, inventa datos). Se guarda en `docs/`, y la decisión de qué funciones pasan a Meta sale
de ahí, **función por función**. Hasta entonces el selector existe y **el valor por defecto sigue
siendo Anthropic**.

### 4.8 Pruebas

| Nivel | Qué |
|---|---|
| **Puro** | `adaptar` por proveedor (quita lo que no habla, recalcula `max_tokens`), `costoUSD` por proveedor, rechazo del nivel contributor, elegir proveedor y respaldo |
| **Contrato** | Un doble de `fetch` que **habla como Meta** —lo que salga del ensayo, con sus carencias— contra `leerFlujo` y contra las cinco rutas de texto |
| **Respaldo** | Anthropic devuelve 400 «credit balance is too low» → contesta Meta, se avisa y se apunta a Meta; Meta cae → no hay bucle (una sola vez) |
| **Despliegue** | El nombre del secreto en su lista; `META_MODEL_API_KEY` nunca en `wrangler.jsonc`; `connect-src` intacto |
| **Consumo** | `consumo_ia.proveedor = 'meta'` suma en el medidor y en el desglose por cliente |
| **Con llave** | `npm run test:meta` (§4.6) |

### 4.9 Entregas

| | Qué | «Hecho» cuando |
|---|---|---|
| **B0** | Ensayo de compatibilidad contra la llave real | Informe con los diez veredictos, guardado en `docs/` |
| **B1** | `proveedoresIA.js`, `abrirFlujo`/`prepararIA`/`registrarConsumo` generalizados, migración 0027, **sin** cambiar el comportamiento de Anthropic | `npm run verificar` verde y **ni un solo test de Anthropic modificado** |
| **B2** | Ajustes → IA con selector, «Probar la conexión» y avisos de carencias; respaldo opcional | Se ve y se prueba en Chromium; el respaldo se prueba con un saldo agotado simulado |
| **B3** | Evaluación de calidad (§4.7) y activar **por función** lo que la rúbrica apruebe | Decisión escrita, función por función |

---

## 5. El orden y por qué

```
B0 ensayo Meta ─┬─► A0 motor + trabajos ─► A1 Gemini ─► B (pantalla) ─► C (video) ─► D (agentes) ─► E
                └─► B1 proveedores ─► B2 ajustes ─► B3 calidad
```

- **B0 primero** porque es corto, no toca producción y **decide** cuánto de la Parte B vale la
  pena. Necesita **tu llave de Meta de nivel estándar**.
- **A0 antes que la pantalla:** con el motor «prueba» se puede probar y **enseñar** todo el flujo sin
  gastar un centavo, y el resto se construye sobre lo ya comprobado.
- **B1 y A0 son independientes:** tocan archivos distintos (`anthropic.js`/`configIA.js` contra
  `estudio/*`) y pueden ir en paralelo si se quiere.
- **Video (C) después de la pantalla** porque necesita el avance por cron y por navegador, que es
  la parte más delicada, y conviene tener antes lo más simple en producción.

## 6. Riesgos

| Riesgo | Cómo se atiende |
|---|---|
| **Un video de 3 $ pedido sin querer** | Estimación previa, segundo toque desde 0,50 $, tope de variantes, presupuesto del mes; y «Animar» ofrece primero el modelo barato |
| **Trabajos «en marcha» para siempre** | Plazo por motor (15 min), estado `fallido` con motivo, y un bloque visible como el de la cola fallida |
| **El cron ya está lleno** | El Estudio es su último paso y no es el único que avanza; si un día no cabe, el navegador lo cubre. **No se añade un segundo disparador** |
| **R2 se llena de video** | Papelera de 30 días, «lo que no usa ninguna publicación» visible y con tamaño total por cliente; los archivos de una publicación no se purgan |
| **Precios que envejecen** | Tabla con fecha y test que avisa a los 90 días; y siempre «estimado» en pantalla |
| **Un motor cambia su API** | Todo detrás del contrato de §3.4; el test con llave (`test:motores`) lo detecta a mano antes que un cliente |
| **Enviar el ADN de un cliente a un tercero que entrena con él** | §4.2: `-contributor` prohibido, en código y en test; y el selector no lo ofrece |
| **Un texto peor con Meta que nadie nota** | §4.7: rúbrica antes de activar, por función; por defecto sigue Anthropic |
| **Perder el ahorro de caché** | El ensayo lo mide **antes** de decidir; si no cachea, Meta se queda fuera de las tareas grandes |
| **Un archivo generado publicado sin que nadie lo vea** | No hay camino automático: el archivo entra por aprobación y por el paso final de programar, como todo |
| **Dependencia de más llaves** | Cada motor es opcional y apagado por defecto: sin llave, el modelo aparece atenuado con cómo activarlo, nada se rompe |

## 7. Decisiones pendientes

Cada una con lo que recomiendo. **Ninguna se implementa hasta que la respondas.**

1. **¿Qué motores?** Recomiendo **Gemini + fal.ai** (una llave que ya tienes y una que da
   Kling, Seedance, Flux, Hailuo y Veo con el mismo contrato). Higgsfield, OpenAI y Grok, sólo si
   los usas.
2. **¿Dónde vive?** Recomiendo **pestaña por cliente + botones dentro de la publicación**; no
   una galería global de toda la agencia (el resto de la app es por cliente).
3. **¿Cómo entra Meta?** Recomiendo **proveedor elegible por el administrador + respaldo
   opcional**, sólo nivel **estándar**, y por defecto **Anthropic** hasta que la rúbrica diga
   otra cosa.
4. **¿Un presupuesto o dos?** Recomiendo **uno solo** (el de IA del espacio, que ya tiene medidor
   y avisos) con la estimación y el segundo toque; un tope propio del Estudio se puede añadir
   si el gasto en video lo pide.
5. **¿Quién avanza los trabajos?** (§3.2) Recomiendo **navegador + cron**; la alarma del Durable
   Object queda para después.
6. **Orden.** Recomiendo el de §5, empezando por B0 —y para eso necesito la llave estándar de Meta.

## 8. Lo que NO se hace

- **Generar imágenes o video con Meta.** Muse Spark es texto aquí.
- **Copiar el Estudio entero** (los 53 modelos de Higgsfield, su esquema, la galería global).
- **Publicar algo generado sin pasar por aprobación.**
- **Llamar a ningún motor desde el navegador.**
- **Aceptar el nivel «contributor»** para datos de clientes.
- **Cambiar el proveedor por defecto** sin la evaluación de §4.7.
- **Traer el sistema de agentes de Agents Office** (aquí el «agente» es Claude por MCP y el
  asistente del chat, que ya existen).
