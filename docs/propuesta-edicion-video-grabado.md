# Propuesta · El EDITOR DE VIDEO GRABADO del calendario

**Fase 0 (análisis), aprobada el 2026-11-20** sobre `main` en `b422bdc`. Las decisiones de la agencia están en §11 y
mandan sobre lo que diga el resto del documento. **Fase 1 (el manual del editor): implementada** —`src/lib/manualEditor.js`,
`src/lib/oficioEdicion.js`, `/api/manual-editor` y Ajustes → Manuales de la agencia → «Editor de video»—. **Fase 2a (el
kit: corte y sonido): implementada** —`kit-edicion/`, `src/lib/{corteEdicion,musicaEdicion,planEdicion}.js`, `kit_edicion`—;
ver §13. Lo demás, pendiente.

**La meta:** un chat NUEVO de claude.ai, con el conector del calendario y sin historial, recibe los clips de una persona
hablando a cámara y «edita este video de Rofer», y entrega un reel igual o mejor que Rofer · reel de Alex v2 y
Comunidad v3. El calendario guarda el cerebro (el oficio, la marca, el estilo de cada cliente y lo aprendido) y entrega
las herramientas (el kit de piezas); el trabajo pesado lo hace Claude en el chat.

---

## 1. Resumen en diez líneas

1. **Tres capas, cada una en un solo sitio:** el OFICIO (manual del editor: base en código + edición de la agencia con
   versiones, en D1), la MARCA (lo que ya existe: kit, identidad de video, léxico, cerebro + un «estilo de edición»
   corto dentro del kit) y las HERRAMIENTAS (el kit de piezas, código en el repo con versión, zip en R2).
2. **Cuatro herramientas MCP nuevas** (`guia_de_edicion`, `kit_edicion`, `estilo_de_edicion`, `acta_de_edicion`) y una
   receta (`editar-video-grabado`). Suman unos 1.400 tokens a la lista de herramientas (hoy 109, ~40.000).
3. **Las DECISIONES del montaje en JavaScript puro de `src/lib/`** (dónde cortar, mapa de tiempos, grupos de
   subtítulos, zonas, revisión de oficio) y **lo PESADO en Python** (transcribir, recortar, medir, mezclar). Lo puro se
   prueba en CI con vitest y el empaquetador lo copia al zip: el calendario y el chat usan el mismo código.
4. **Los números del oficio en un único módulo** (`src/lib/oficioEdicion.js`): silencios, cámara, zonas seguras,
   subtítulos, niveles de música, LUFS. Las Entregas 5 y 6 del video animado los tomarán de ahí (§7).
5. **Recortar a la persona SÓLO donde hace falta** (los tramos con texto detrás) y seguir la cabeza con un detector de
   caras rápido: es lo que más tiempo ahorra (de ~15 min a, estimado, 4–6 para 37 s; sin medir).
6. **Segmentación:** recomiendo medir en la Fase 2 RVM contra SAM 2.1 (Apache-2.0) y MediaPipe (Apache-2.0) sobre los
   clips de Rofer y quedarse con la mejor licencia que dé la calidad de v2. RVM (GPL-3.0) puede usarse internamente,
   pero mejor que el kit no lo lleve dentro (§6).
7. **Todo reanudable** por pasos de menos de 8 minutos, con su estado en disco; el render, por tramos que se juntan sin
   recodificar.
8. **Aprender = proponer:** el acta de cada edición deja propuestas GENERALES (→ manual) o DE LA MARCA (→ estilo), con la
   cita de la persona; nada se aplica sin «sí» (en el chat con `confirmado` o en la pantalla).
9. **Seis fases** (más esta), un pull request cada una; la 2 es la grande y propongo partirla en dos (2a sonido y corte,
   2b piezas de Remotion).
10. **Lo que no se ha medido se dice:** el tamaño máximo de un adjunto en claude.ai, que Remotion arranque con el
    Chromium del chat y el permiso de R2 del token de despliegue (§8).

---

## 2. Lo que el calendario ya tiene (confirmado sobre `b422bdc`)

| Qué | Dónde | Cómo se usa aquí |
|---|---|---|
| Manual de la agencia editable: `manual.video` sobre `MANUAL_VIDEO_BASE`, tope 4.000 | `src/lib/directorVideo.js`; se guarda en `ajustes_espacio.manual_campanas` (JSON, `limpiarManual` en `src/lib/estratega.js`, tope por campo 6.000); se edita en `SeccionManualCampanas.jsx` | **El patrón se copia, el sitio no.** El manual del editor es más largo (~12.000), va por partes y necesita versiones: no cabe en una columna JSON compartida con el de campañas. Va a su tabla (§4.1). Ojo: `MANUAL_VIDEO_BASE` dice «sin texto dentro del video»; vale para el modelo de video con IA, no para la edición. El manual del editor no lo hereda |
| Identidad de video por cliente | `kit.identidadVideo`; `src/lib/identidadVideo.js`, `worker/lib/estudio/identidadVideo.js`, `identidad_video` | **Se reúsa entera** para subtítulos (estilo, posición, palabras por grupo, acento, mayúsculas), músicas y efectos por momento. Rofer ya la tiene: subtítulos en placa abajo en mayúsculas, 5 músicas, efectos para 5 momentos. El estilo de edición NO duplica nada de esto |
| Estilos de video (hasta 8) | `kit.estilosVideo`, `src/lib/estilosVideo.js`, `guardar_estilo_video` | **Va aparte** (§4.2): su vocabulario es el del motor animado (entradas, fondos, tokens del canvas) y `aplicarEstilo` lo impone por código sobre un guion de escenas. Meter ahí la edición de un grabado mezclaría dos contratos |
| Recetas como dato (≤ 5.000) con HANDOFF | `src/lib/recetas.js`, `herramientasRecetas.js` | Receta nueva `editar-video-grabado`. **`montaje-ugc` se queda** como «montaje rápido en el calendario» (motor animado, sin recorte ni cámara, sale en minutos y sin chat); su descripción pasará a mandar al editor cuando se quiera calidad |
| Aprender con aprobación | `worker/lib/cerebro/{aprender,senales,proponer}.js`, `cerebro_propuestas`; `aprendizajeVisual.js` (`kit.aprendido`) | **Se copian las guardas de `proponer.js`**: no se propone lo que ya está ni lo descartado, tope de pendientes, respaldo obligatorio. La tabla no se reúsa: `cerebro_propuestas` exige cliente y su destino es una nota |
| Subir desde Claude | `subidaClaude.js` (`subir_a_galeria`, `confirmar_subida`), topes 95 MB video | El final de la receta, tal cual |
| Kit de marca en ZIP | `worker/lib/kitDescargable.js` (`kit_descargable`, enlace firmado de 15 min, ZIP por flujo desde R2) | **Es el molde de `kit_edicion`**: mismo firmado, misma ruta sin sesión. Y su `planDelKit` se amplía para que el ZIP de la marca lleve las músicas de la identidad y el estilo de edición (hoy sólo la música favorita) |
| Biblioteca de sonido | `src/lib/catalogoEfectos.datos.js` (283 efectos con `dur` y `pico`), archivos en `public/efectos/v1/` | **Los efectos ya se pueden bajar en el chat** sin enlace firmado: son públicos en el dominio del calendario, que la red del chat permite. La música de la biblioteca necesita su enlace firmado (va en el ZIP de la marca) |
| Revisión | `video_listo`, `revisar_video`, `escuchar_video`, `/hoja` y `/golpes` del Container | Sirven para los videos del calendario. El editor hace su hoja y su medida EN el chat (el video no está en el calendario hasta el final); al subirlo, `video_listo` puede revisarlo como uno más |
| Plan de mejoras del video | `docs/auditoria-estudio-mcp.md` §8, Entregas 2, 5 y 6 | **No están hechas** (sólo S1–S10 del 19-11). Coordinación en §7 |

---

## 3. Cómo queda una edición, de punta a punta

```
claude.ai (chat nuevo)                                      calendario (Worker + D1 + R2)
───────────────────────────────────────────────────────     ─────────────────────────────────
«edita este video de Rofer» + clips
  ├─ receta editar-video-grabado ───────────────────────►  el método (≤ 5.000)
  ├─ guia_de_edicion(cliente, tipo) ────────────────────►  manual común + del tipo + marca + estilo + control + versión del kit
  ├─ buscar_cerebro / lexico_de_marca (datos verificados)
  ├─ kit_edicion(cliente) ──────────────────────────────►  2 enlaces firmados: kit de piezas vX + ZIP de la marca
  ├─ UN comando: instalar (≈3 min, idempotente)
  ├─ diagnóstico: hoja de contactos de los clips + tipo de video
  ├─ transcribir → cortar (puro) → PROPUESTA CORTA a la persona, con 2–3 CUADROS DE MUESTRA  ← la persona dice sí o corrige
  ├─ plan de escenas (JSON) → revisión de oficio (pura) → cuadros fijos de los momentos cargados
  ├─ recorte (sólo tramos con texto detrás) → cámara → render por tramos → mezcla → hoja + medida del audio
  ├─ subir_a_galeria (+ confirmar_subida a su publicación) ──►  galería del cliente
  └─ acta_de_edicion (acta + correcciones clasificadas) ───►  propuestas pendientes ── «sí» ──► manual v+1 / estilo
```

**Reconocer el tipo es el primer paso y decide las técnicas.** Cuatro tipos, con su parte del manual:

| Tipo | Ejemplo | En esta entrega |
|---|---|---|
| `persona-a-camara` (en un lugar real) | Rofer · Alex en obra | Completo |
| `persona-y-pantalla` | Comunidad v3 (modo celular) | Lo aprendido de Comunidad, marcado «en prueba» |
| `sin-persona` (tomas + texto + locución) | — | Vacío y marcado: el chat lo dice y pide permiso para seguir con el oficio común |
| `solo-idea` | — | No es edición: manda a la receta `video-animado` |

---

## 4. Modelo de datos

### 4.1 El manual del editor (con versiones)

- **Base en código**, pura: `src/lib/manualEditor.js`. Partes con id estable:
  `comun.{diagnostico, corte, gancho, imagen, textos, subtitulos, sonido, llamado, revision}` y
  `tipos.{persona-a-camara, persona-y-pantalla, sin-persona, solo-idea}`. Cada parte, una lista corta de reglas con las
  palabras de la agencia (la fuente es la §7 del pedido). Topes: 1.500 por parte común, 3.000 por tipo.
- **La edición de la agencia, por partes, en D1** (tabla nueva, migración `0082_editor_video.sql`):

  ```sql
  create table if not exists manual_editor_versiones (
    id          text primary key,
    owner_id    text not null references users(id) on delete cascade,
    version     integer not null check (version >= 1),
    partes      text not null default '{}' check (json_valid(partes)),  -- sólo las partes que la agencia cambió
    base        text not null default '',     -- huella de la base en código cuando se guardó
    motivo      text not null default '',     -- «a mano», «propuesta <id>», «volver a la v3»
    por         text,                         -- quién
    created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  create unique index if not exists manual_editor_version on manual_editor_versiones(owner_id, version);
  ```

  Vale la última versión; una parte que no está en `partes`, la de la casa. **Volver atrás crea una versión nueva** con
  las partes de la vieja (nunca se borra historia). Guardar va con la versión leída como condición: si otra persona
  guardó, 409, como el mes (regla de oro 16).
- **La huella de la base** sirve para algo que hoy no tiene el manual de video: si la base en código mejora después de
  que la agencia editó una parte, la pantalla dice «la versión de la casa cambió desde tu edición» y enseña las dos.
- **Lo que se entrega por MCP, compacto:** común + el tipo pedido, sin títulos largos ni ejemplos repetidos, con la
  versión (`manual v7`). Objetivo: ≤ 2.500 tokens.

### 4.2 El estilo de edición por cliente

Dentro del kit (`kit.estilosEdicion`, hasta 6 por cliente), con el mismo blindaje que `estilosVideo` e `identidadVideo`:
sólo lo escribe su ruta (`guardarKit(…, { conEdicion: true })`) y el PUT del kit lo conserva. **Sin migración y viaja
solo en el ZIP de la marca.** Son REGLAS, no contenido:

```json
{
  "id": "ee-3f9c1a2b", "nombre": "Alex en obra", "tipo": "persona-a-camara",
  "piezas": {
    "textoDetras": "gancho, datos fuertes y la pregunta del llamado; en el cielo, con aire sobre el casco",
    "sello": "datos verificados (FLOTA PROPIA · 14 EQUIPOS)", "cinta": "lo negativo (EQUIPO EQUIVOCADO)",
    "fichas": "pares (TIEMPO / DINERO)", "placasNumeradas": true, "lista": "sólo arriba, nunca a la altura de la cara"
  },
  "camara": { "abierto": 1.13, "medio": 1.47, "seguir": 0.55, "golpeAlEntrar": true, "maxAcercar": 2.0 },
  "transiciones": { "entreClips": "barrido-diagonal", "saltoMismoClip": "destello-obturador" },
  "gancho": "afirmación de dolor gigante detrás de la persona, completa en el cuadro 0",
  "cierre": { "segundos": 3, "boton": "ESCRÍBANOS AL WHATSAPP", "numero": true, "usuario": true },
  "musica": { "bajoVoz": -9.5, "llamado": -15, "cierre": -6 },
  "ritmo": "acercamiento alterno en cada corte; pausas a 0,10 s",
  "notas": "Alex tutea: se deja. Lo escrito por la marca, de usted."
}
```

- Lo que ya dice la identidad de video (subtítulos, músicas, efectos) **no se repite**: el estilo sólo lo pisa si lo
  dice expresamente. Los números que faltan salen de `oficioEdicion.js`.
- Topes: `notas` 600, cada texto de pieza 160, el estilo entero ~2.000. Se valida con `limpiarEstiloEdicion` (puro).
- Se guarda sólo con el «sí» (`estilo_de_edicion` con `confirmado`, o la pantalla). Sin versiones propias: cada cambio
  que viene del aprendizaje queda en el acta y en la propuesta que lo aplicó. Si la agencia quiere volver atrás un
  estilo, se añade después (es poco).
- **Siembra:** «Alex en obra» (Rofer) y «Comunidad · persona y pantalla» (COMUNIDAD), escritos desde el código de v2/v3
  y guardados por el MCP tras el despliegue de la Fase 3, con el «sí» de la agencia.

### 4.3 Actas y propuestas de aprendizaje

```sql
create table if not exists edicion_actas (
  id            text primary key,
  owner_id      text not null references users(id) on delete cascade,
  client_id     text not null references clients(id) on delete cascade,
  archivo_id    text,                          -- el video en la galería (si se subió)
  tipo          text not null,                 -- persona-a-camara…
  estilo_id     text not null default '',
  kit_version   text not null default '',
  manual_version integer,
  resumen       text not null default '{}' check (json_valid(resumen)),  -- duración, escenas, música, medidas (LUFS, voz−música por tramo)
  correcciones  text not null default '[]' check (json_valid(correcciones)), -- lo que dijo la persona, tal cual
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create table if not exists edicion_propuestas (
  id          text primary key,
  owner_id    text not null references users(id) on delete cascade,
  client_id   text references clients(id) on delete cascade,   -- null: GENERAL (va al manual)
  acta_id     text not null references edicion_actas(id) on delete cascade,
  destino     text not null check (destino in ('manual','estilo')),
  parte       text not null,          -- comun.textos, tipos.persona-a-camara… o el id del estilo
  operacion   text not null check (operacion in ('anadir','cambiar','quitar')),
  antes       text not null default '',  -- el texto exacto que cambia o se quita
  texto       text not null default '',
  cita        text not null,          -- las palabras de la persona que la respaldan
  estado      text not null default 'pendiente',
  resuelta_por text, resuelta_at text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

Las dos con dueño se declaran en `worker/lib/acceso.js` (regla de oro 1); `client_id` nulo en una general se comprueba
ahí también (hoy la capa acota por `client_id` a los colaboradores: una propuesta general sólo la ve y la decide un
`admin`). Las guardas, en `src/lib/aprendizajeEdicion.js` (puro):

1. **Sin cita no hay propuesta.** El respaldo son las palabras de la persona en ESTA edición.
2. **Una GENERAL necesita una orden** («nunca…», «siempre…», «eso pasa en todos») o haberse repetido en actas de dos
   clientes distintos; si no, se ofrece como DE LA MARCA.
3. **No se propone dos veces** lo que ya dice el manual o el estilo, lo descartado o lo pendiente.
4. **Tope de 10 pendientes** por destino.
5. **Aplicar es una operación de texto exacta** (`antes` → `texto`): si la parte cambió y `antes` ya no está, la
   propuesta caduca y se dice; nunca se reescribe a ciegas.

### 4.4 La versión del kit

`kit-edicion/VERSION` (semver) + una **huella** de sus archivos guardada en `kit-edicion/HUELLA`. Un test compara la
huella con los archivos: si el kit cambió y la versión no, falla diciendo «sube la versión del kit». El acta guarda la
versión con que se hizo cada video; `guia_de_edicion` dice cuál es la vigente para que un chat con un kit viejo instalado
lo note.

---

## 5. Las herramientas MCP nuevas

| Herramienta | Qué hace | Lee / escribe | En la lista (aprox.) | Lo que devuelve (aprox.) |
|---|---|---|---|---|
| `guia_de_edicion` | En UNA llamada: manual común + del tipo, resumen de la marca (identidad de video en frases, léxico, letra y colores, @usuario y WhatsApp), los estilos de edición del cliente (o el pedido, entero), la lista de control y la versión vigente del kit. **El contacto NO sale del resumen** (la Ficha técnica) ni del campo de la ficha del cliente: sale de la nota «Datos del negocio» del cerebro, y si no coinciden lo dice (decisión 10) | Sólo lee | ~350 tokens | ≤ 3.500 tokens |
| `kit_edicion` | Dos enlaces firmados de 15 min (el kit vX y el ZIP de la marca) y el comando de instalación ya armado | Sólo lee | ~250 | ~250 |
| `estilo_de_edicion` | Sin `guardar`: los estilos del cliente. Con `guardar` + `confirmado`: crea o cambia uno (lo que se enseñó a la persona). `quitar`, `nombre` | Escribe en el kit | ~400 | ~400 |
| `acta_de_edicion` | Con `acta` (+ `correcciones` clasificadas en general / de la marca): guarda el acta y devuelve las propuestas con su id y el texto exacto para enseñarlas. Con `aplicar: [ids]` + `confirmado`: las aplica (manual v+1 o estilo). `descartar: [ids]` | Escribe | ~450 | ~300 |

**Total en `tools/list`: unos 1.450 tokens** (hoy 109 herramientas, 141.200 caracteres: ~3,5 % más). Descripciones
propuestas (se afinan al hacerlas):

- `guia_de_edicion` — «Lo que hay que saber ANTES de editar un video GRABADO de un cliente (clips de una persona hablando
  a cámara, persona y pantalla…), en una sola llamada: el manual del editor de la agencia (lo común y lo del tipo de
  video), la marca resumida, sus estilos de edición y la lista de control antes de entregar. Primero reconoce el tipo de
  video. Sólo lee.»
- `kit_edicion` — «El kit de piezas del editor (Python + Remotion) y la marca del cliente, para instalarlos en tu
  máquina con UN comando. Dos enlaces de 15 minutos sin sesión. Si ya tienes instalada la misma versión, no hace falta
  repetir. Sólo lee.»
- `estilo_de_edicion` — «Los ESTILOS DE EDICIÓN de un cliente: las reglas de cómo se editan sus videos grabados (piezas y
  cuándo, cámara, transiciones, gancho, cierre, música), no su contenido. Guardar sólo tras el sí de la persona, con
  confirmado.»
- `acta_de_edicion` — «Al terminar una edición: el acta (qué se hizo y con qué) y las correcciones de la persona, cada
  una GENERAL (para todo cliente: va al manual) o DE LA MARCA (va a su estilo). Quedan como PROPUESTAS; enséñaselas y
  aplícalas con confirmado sólo con su sí.»

**Instrucciones del servidor** (`worker/rutas/mcp.js`, ~200 caracteres más): «EDITAR UN VIDEO GRABADO (clips de una
persona: "edita este video de…") va por la receta editar-video-grabado: no lo montes con crear_video.»

**Clips de entrada**, dos caminos:
- **Adjuntos al chat**: lo más cómodo. El tope de tamaño por adjunto en claude.ai **no lo he medido** (los de Rofer
  entraron); un clip 4K de teléfono pasa con facilidad de 100 MB. Se mide en la Fase 4.
- **De la galería del cliente**, con `exportar_piezas` (enlace firmado, dominio permitido en el chat). Hoy la galería
  admite videos de hasta **50 MB** (`MAX_SUBIDA_VIDEO`). Si la medida dice que hace falta, la Fase 4 añade un enlace de
  subida de CRUDOS por partes a R2 (hasta 5 GB), que es otra pieza: no la meto sin medir.

---

## 6. Licencias

| Pieza | Licencia | Cómo se usa | Veredicto |
|---|---|---|---|
| **Remotion** | Remotion License: gratis para personas y empresas de hasta **3 empleados**; desde el 4.º, licencia de empresa de pago | Se instala en el chat por npm (versión fijada) | Vale hoy (somos 2). **Al contratar a la 4.ª persona hay que pagarla o cambiar de motor**: lo dejo escrito en `docs/licencias/` y el kit lo dice en su LEEME. Por eso las piezas se describen con un plan JSON independiente de Remotion (§9.3) |
| **RobustVideoMatting** (código y pesos) | GPL-3.0 | Inferencia con su ONNX | Usarlo dentro de la agencia no es «distribuir» y la GPL lo permite (incluso en una máquina de terceros que trabaja para nosotros). Pero si el kit **incluyera** código de RVM, el kit entero pasaría a GPL. Si se queda, el kit no lo lleva: el instalador lo baja de su origen (GitHub) y lo llama como un modelo más |
| **SAM 2.1** (Meta) | Apache-2.0, código y pesos | Máscara en el primer cuadro y propagación por el clip (memoria temporal: menos parpadeo que segmentar cuadro a cuadro) | **Alternativa recomendada a medir.** En CPU es lento con los modelos grandes; el `tiny`/`small`, sin medir |
| **MediaPipe** (selfie/segmentador multiclase, detector de caras) | Apache-2.0 | Segmentación muy rápida en CPU; detector de caras en milisegundos | **El detector de caras, seguro** (para la cámara virtual). Su segmentación, bordes más bastos: candidata para los tramos cortos o como respaldo |
| **MODNet** | Apache-2.0 | Matting de retrato sin trimap | Peor con cuerpo entero (Alex en obra se ve de medio cuerpo para abajo). Tercera opción |
| **BiRefNet** / rembg | MIT | Calidad alta por imagen | Sin coherencia entre cuadros (parpadea en video) y pesado. Descartado para video |
| **MatAnyone** y similares | Licencias no comerciales | — | Descartados |
| **faster-whisper** + CTranslate2 | MIT | Transcripción por palabra | Sin problema. El modelo `large-v3-turbo` (pesos de OpenAI) es MIT; se baja de Hugging Face |
| **Modelos de rnnoise** para `arnndn` | El repositorio GregorR/rnnoise-models declara que los modelos no son obra creativa y no tienen derechos de autor; RNNoise es BSD-3 | Un `.rnnn` en el kit | Sin problema. Respaldo sin modelo: `afftdn` de ffmpeg |
| librosa (ISC), pyloudnorm (MIT), onnxruntime (MIT), numpy/scipy (BSD) | Permisivas | Ritmo y compás, sonoridad, inferencia | Sin problema |
| ffmpeg | LGPL/GPL según cómo se compiló | El del chat, no lo distribuimos | Sin problema |
| Letras | Las del kit del cliente (suyas); de respaldo, OFL (Anton, Bebas Neue, Montserrat) dentro del zip | OFL permite redistribuirlas | Sin problema |
| Efectos | earshot (MIT) y uisfx (CC0), ya en el catálogo | Públicos en `/efectos/v1/` | Sin problema |
| Música | Biblioteca del cliente o Suno (por Kie) | — | Ya en uso. Ojo, que no es de esta propuesta: lo que Suno permite comercialmente depende del plan con que se generó; lo dejo anotado para revisarlo aparte |
| Código de Rofer v2 / Comunidad v3 | De la agencia (escrito en sus chats) | Referencia | Se reescribe, no se copia tal cual |
| Kit de Shoes Panamá | De otra marca | Sólo el MÉTODO (Remotion + recorte) | No se sube; nada de su marca en el repo |

**Decidido (2026-11-20):** se hace la prueba; gana la de licencia permisiva SÓLO si los bordes (casco, manos, pelo) con
el texto gigante detrás se ven como en Rofer v2; si no, RVM bajado de su origen. **Recomendación de entonces:** en la Fase 2, una prueba de 30 minutos sobre dos clips de Rofer (Alex cerca y Alex
lejos) con RVM, SAM 2.1 tiny/small y MediaPipe: segundos por cuadro en 2 CPU y una hoja de contactos de los bordes (casco,
manos, pelo) con el texto gigante detrás. **Gana la de licencia permisiva si su borde se ve como el de v2**; si sólo RVM
lo da, se usa RVM bajado de su origen y se apunta en `docs/licencias/`. Y en los dos casos, la cabeza para la cámara
sale del detector de caras de MediaPipe, no de la máscara. No es asesoría legal.

---

## 7. Coordinación con las Entregas 2, 5 y 6 (una sola fuente)

Los números del oficio viven en `src/lib/oficioEdicion.js` (puro). El kit los recibe al empaquetarse (el módulo JS tal
cual para Node y un `oficio.json` generado para Python), y el motor del video animado los importará cuando se hagan las
Entregas 5 y 6. **Hay cuatro choques entre el plan de la auditoría y lo medido en Rofer**; propongo que mande lo medido,
porque salió de un video real que la agencia aprobó:

| Qué | Auditoría §8 | Rofer v2 (pedido §7) | Propuesta |
|---|---|---|---|
| Ducking | 8–10 dB, baja ~150 ms ANTES de la voz, se queda entre palabras | 9–10 dB bajo la voz; ataque 30 ms, liberación 0,4 s; llamado −15, cierre −6 | Los niveles de Rofer + la anticipación de 150 ms de la auditoría (no se contradicen: una dice cuánto, la otra cuándo empieza) |
| Pico | ≤ −1 dBTP tras el AAC | −1,2 dB | −1,2 dBTP medido DESPUÉS del AAC (cumple los dos) |
| Zona segura 9:16 | Texto entre 168 y 1330 px (deja libre el 31 % de abajo) | 14 % arriba y 20 % abajo | **Decidido: 20 % abajo para el editor** |
| Subtítulos | Grupos de 2–3 / 3–5 / 4–6 según la energía | ≤ 4 palabras, una línea, ajustados al ancho medido | ≤ 4 y una línea; el «según la energía» queda como regla del manual, no como número |
| Cortes | En el hueco antes de la palabra, silencio a mitad del hueco, fundidos de 5 ms | En el punto más silencioso cercano a la palabra; pausas > 0,16 s bajo (voz − 18 dB) → 0,10 s | Las dos juntas en una función pura (`planificarCortes`), con fundidos de 5 ms |

La revisión de oficio de la Entrega 2 (`revisionEscenas.js`) y la del editor comparten las comprobaciones que no
dependen del motor (texto que no se alcanza a leer, cuadro 0 sin gancho, subtítulo que repite un gráfico, gráfico a la
altura de la cara): se escriben una vez.

---

## 8. Riesgos

| Riesgo | Qué pasa | Qué se hace |
|---|---|---|
| **Los procesos mueren al responder el chat** | Un render de 10 min se pierde | Todo paso escribe su estado en `trabajo/estado.json` y se salta lo hecho; `kit siguiente` hace el próximo paso con un presupuesto de 8 min y sale limpio. El render, por tramos de cuadros (`frameRange`) que se juntan con `ffmpeg -c copy` |
| **Remotion no baja su navegador** | No renderiza | Busca el Chromium que haya (`/opt/pw-browsers/…` y otros) y lo pasa como `browserExecutable`. **Sin probar con la versión fijada**: lo primero de la Fase 2b |
| **Tiempo total en el chat** | Hoy ~15 min de recorte + ~10 de render para 37–40 s | Recorte sólo en los tramos con texto detrás; render por tramos; medir en la Fase 2 y apuntar los tiempos reales en las trampas |
| **Adjuntos grandes** | Un clip no entra en el chat ni en la galería (50 MB) | Medir en la Fase 4; si hace falta, subida de crudos por partes |
| **El token de despliegue sin permiso de R2** | El workflow no puede subir el zip | `test:infra` lo comprueba antes; respaldo: el zip como recurso estático con un nombre imposible de adivinar (es código, sin datos de clientes) |
| **Un chat con un kit viejo** | Edita con reglas de antes | `guia_de_edicion` dice la versión vigente; el kit compara la suya al arrancar y avisa |
| **Que el aprendizaje ensucie el manual** | Una corrección de un video se vuelve regla de todos | Las guardas de §4.3; el «sí» siempre; versiones para volver atrás |
| **Que «persona-y-pantalla» se use sin estar madura** | Sale peor que Comunidad v3 | Marcado «en prueba» en el manual; el acta lo señala |
| **Datos inventados en los textos** | Una cifra sin confirmar en un sello | El manual lo prohíbe y la guía trae sólo los datos verificados del cerebro (ficha y cifras); la revisión de oficio marca toda cifra de un gráfico que no esté en esa lista |
| **Remotion al crecer el equipo** | La licencia deja de ser gratis | Escrito en `docs/licencias/`; el plan JSON no depende de Remotion |

---

## 9. Lo que haría distinto (mi opinión, con su porqué)

1. **Las decisiones en JS puro del repo, no en Python.** Dónde cortar, el mapa de tiempos, los grupos de subtítulos,
   las zonas y la revisión de oficio son lógica sin modelos: en `src/lib/` se prueban en CI con vitest (la regla del
   repo), Node está en el chat y el empaquetador las copia al zip. Python queda para lo que necesita modelos o audio
   (transcribir, recortar, medir, mezclar). Así «una sola fuente» es literal: el mismo archivo en el calendario y en el
   chat.
2. **El PLAN DE ESCENAS como contrato** (`src/lib/planEdicion.js`, validado como `validarEscena`): un JSON con los
   tramos, la cámara de cada uno, las piezas con la palabra que las dispara y la música por compases. Se valida y se
   revisa ANTES de renderizar (gráfico a la altura de la cara, subtítulo que repite un gráfico, texto fuera de zona,
   solapes) y es lo que se le enseña a la persona en la propuesta corta y lo que guarda el acta. Si un día Remotion deja
   de servir, se cambia el pintor, no el plan.
3. **Recortar sólo donde hace falta.** La máscara sólo sirve para el texto detrás de la persona; la cámara sólo necesita
   la cabeza. Detector de caras para todo el clip (milisegundos por cuadro) + máscara sólo en los tramos con texto
   detrás, con medio segundo de margen. Es el mayor ahorro de tiempo y vuelve casi irrelevante la velocidad del modelo
   de segmentación.
4. **Capas en vez de un render entero, a medir.** Python arma la base (cortes, cámara, etalonado) y Remotion pinta
   sólo las capas de gráficos con transparencia donde hay piezas; ffmpeg compone base → texto detrás → persona → gráficos.
   Si mide mejor que el render completo de Remotion, también hace trivial «renderizar sólo ese tramo y montarlo encima».
   Si no, se queda el render completo por tramos. No lo prometo sin medir.
5. **Textos en espacio de pantalla por construcción**: el componente `Camara` envuelve sólo el video; las piezas son
   hermanas suyas y un test del kit falla si alguna queda dentro (fue la corrección de Comunidad).
6. **Las músicas de la identidad dentro del ZIP de la marca** (no sólo la favorita) y los efectos por su ruta pública:
   el chat no tiene que pedir un enlace por archivo.
7. **El estilo de edición dentro del kit, no en una tabla**, como la identidad: datos en un sitio, viaja solo al chat y
   no necesita migración.
8. **Partir la Fase 2 en dos pull requests** (2a: instalador, transcripción, corte, voz, música, mezcla, medida, hoja;
   2b: recorte, cámara y las piezas de Remotion). Cada mitad se puede probar sola con un video real y el riesgo de
   Remotion queda aislado.
9. **La Fase 6 con un cliente que no se parezca a Rofer.** KMT también es obra; para comprobar que el estilo no es una
   plantilla, mejor Feria del Lente o Baby Caleb (otro lugar, otra persona, otro tono).

---

## 10. El plan por fases

| Fase | Qué | Archivos principales | Tamaño | Se puede probar |
|---|---|---|---|---|
| **1. Manual del editor** | Base en código (común + 4 tipos, dos completos y dos vacíos marcados), versiones en D1, `oficioEdicion.js`, la parte compacta para MCP, Ajustes → Manual de la agencia → «Editor de video» (editar por partes, versiones, volver atrás) | `src/lib/manualEditor.js`, `src/lib/oficioEdicion.js`, `migraciones/d1/0082_editor_video.sql` (sólo la tabla del manual), `worker/rutas/manualEditor.js`, `src/components/SeccionManualEditor.jsx` (lazy), tests | M | Leer y editar el manual en Ajustes; ver la versión y volver atrás |
| **2a. Kit: corte y sonido** | `kit-edicion/` con instalador idempotente, `estado.json`, transcribir, cortar (puro), voz, música al compás, mezcla, medida y hoja; empaquetador, versión y huella; subida del zip a R2 en `desplegar.yml`; `kit_edicion` | `kit-edicion/`, `scripts/kit-edicion/empaquetar.mjs`, `src/lib/{corteEdicion,planEdicion}.js`, `worker/lib/kitEdicion.js` | L | En un chat: instalar, cortar los clips de Rofer y sacar el audio mezclado a −14 LUFS |
| **2b. Kit: imagen y piezas** | Prueba de segmentación, recorte por tramos, cabeza y cámara, etalonado; Remotion con las piezas parametrizadas por la marca (texto detrás, titular del cuadro 0, tachado, subtítulos en placa, sello, lista, fichas, cinta, botón de WhatsApp con toque, barrido, destello, cierre, modo celular); render por tramos | `kit-edicion/remotion/`, `kit-edicion/python/` | L | Rehacer Rofer v2 desde los clips y compararlo lado a lado |
| **3. Estilo de edición** | `kit.estilosEdicion`, `estilo_de_edicion`, ZIP de la marca con estilos y músicas de la identidad, siembra de Rofer y Comunidad | `src/lib/estilosEdicion.js`, `worker/lib/estudio/estilosEdicion.js` | S–M | Ver y guardar estilos por MCP |
| **4. Receta y herramientas** | `editar-video-grabado`, `guia_de_edicion`, `acta_de_edicion` (tablas de actas y propuestas), instrucciones del servidor, medida de adjuntos | `src/lib/recetas.js`, `src/lib/aprendizajeEdicion.js`, `worker/lib/estudio/herramientasEdicion.js`, migración `0083` | M | Un chat nuevo sigue la receta entera |
| **5. Pantalla** | Estilos de edición en Marca → Kit y voz; propuestas pendientes en el manual (las generales) y en los estilos (las de la marca), con su aviso en la campana | componentes lazy | M | Aceptar y rechazar propuestas |
| **6. Prueba de punta a punta** | Un chat nuevo, sin historial, con los clips de un tercer cliente; lo que falle, a `docs/trampas/video-y-sonido.md` y al manual (por propuesta) | — | Depende | El reel |

Cada fase: un pull request, `npm run verificar` en verde, a `main` y el workflow «Desplegar» terminado bien; su línea
en `docs/arquitectura.md` por archivo nuevo y sus trampas. **Cuándo necesito el zip:** al empezar la 2a (el código de
Rofer v2 y Comunidad v3, las hojas y la transcripción por palabra). La Fase 1 sale de la §7 del pedido.

---

## 11. Decisiones de la agencia (2026-11-20)

Valen para todas las fases y mandan sobre lo que diga el resto del documento.

1. **Segmentación:** prueba RVM / SAM 2.1 / MediaPipe en la 2b. Gana la de licencia permisiva sólo si los bordes (casco,
   manos, pelo) con el texto gigante detrás se ven como en Rofer v2; si no, RVM bajado de su origen.
2. **Zona segura de abajo:** 20 % para el editor (`OFICIO.zonas`).
3. **Choques con la auditoría:** mandan los números medidos en Rofer, con la anticipación de ~150 ms del ducking de la
   auditoría (`OFICIO.ducking.anticipacion`).
4. **El estilo de edición va dentro del kit del cliente**, sin tabla propia.
5. **`montaje-ugc` se queda** como el montaje RÁPIDO en la aplicación; `editar-video-grabado` es el PREMIUM. Sus
   descripciones lo dicen claro y las instrucciones del servidor mandan «editar un video grabado» al premium (Fase 4).
6. **La Fase 2 en dos pull requests** (2a y 2b).
7. **El tercer cliente de la Fase 6: Baby Caleb.**
8. **Muestras antes de editar:** la propuesta corta de la receta enseña 2 o 3 CUADROS DE MUESTRA con la marca (el gancho
   en el cuadro 0, un gráfico detrás de la persona y los subtítulos), no sólo texto: en Rofer, aprobar esos bocetos antes
   de editar fue clave. Ya está en el manual («La propuesta corta») y va en la receta (Fase 4); el kit (2b) tiene que poder
   sacar esos cuadros sueltos sin renderizar el video.
9. **La calidad manda sobre la velocidad.** El criterio de la 2b es rehacer Rofer v2 desde los clips y compararlos lado a
   lado: si un ahorro (máscara sólo por tramos, render por capas) se ve peor, se descarta. «Textos con aire sobre la cabeza»
   necesita el tope REAL de la cabeza o del casco (de la máscara), no sólo la caja de la cara: el detector de caras sirve
   para la cámara, no para eso.
10. **Datos verificados:** la Ficha técnica del cerebro de Rofer y el campo de contacto de su ficha siguen con el WhatsApp
    viejo (61562010) aunque la nota «Brand guidelines — Datos del negocio» ya tiene el correcto (6086-6581).
    `guia_de_edicion` no se fía del resumen: toma el contacto de la nota de datos del negocio y avisa si no coinciden.
    Apuntado como trampa en `docs/trampas/cerebro.md` (el resumen no se regenera al corregir una nota) y ya en el manual.
11. **El zip `edicion-video.zip`** lo pasa la agencia al empezar la 2a.

## 12. Sin comprobar (regla de oro 15)

- El tope de un adjunto de video en claude.ai y si el chat puede bajar de la galería un clip grande a tiempo.
- Que Remotion (la versión que se fije) arranque con el Chromium que haya en el chat.
- Los tiempos de SAM 2.1 y MediaPipe en 2 CPU; el ahorro del recorte por tramos y de las capas.
- Que el token del workflow de despliegue tenga permiso para escribir en R2.
- Los tiempos de la §5 del pedido (RVM 0,9 s/cuadro, render 10 min, whisper) los tomo como medidos por la agencia; se
  vuelven a medir en la Fase 2.

---

## 13. Fase 2a hecha (2026-11-21): lo que cambió respecto de la propuesta

- **El ZIP va en el despliegue (`dist/api/_kit/`), no en R2.** /api/* pasa antes por el Worker, que sólo lo entrega con un
  enlace firmado; así la versión y el ZIP salen del mismo despliegue y no hace falta que el token pueda escribir en R2
  (el riesgo de §8 desaparece).
- **La versión y la huella viven en `src/lib/kitEdicionVersion.js`** (no en `kit-edicion/VERSION` + `HUELLA`): el Worker la
  importa para decir la versión, y el build y un test fallan si el kit cambia sin subirla.
- **La energía del corte se mide sobre la voz limpia** y un corte que quita menos de 0,07 s no se hace: con eso el corte
  del kit salió igual que el de Rofer v2 (§`docs/trampas/video-y-sonido.md`).
- **El máster deja 0,5 dB de margen para el AAC** (el pico subía de −1,2 a −1,0 al codificar).
- **El corte en crudo** (`crudo`): el montaje sin cámara ni gráficos, con la mezcla, para que la persona apruebe el corte y
  el sonido antes de lo largo. No estaba en la propuesta.
- **Lo que queda para la 2b:** recorte de la persona, cabeza y cámara virtual, etalonado, las piezas de Remotion, los
  cuadros de muestra de la propuesta corta y el render por tramos. Y para la 3: que el ZIP de la marca lleve las músicas
  de la identidad (hoy la canción se baja con `exportar_piezas`).

## 14. Fase 2b hecha (2026-11-21): la imagen, y Rofer v2 rehecho lado a lado

**La prueba de segmentación** (decisión 1), en dos cuadros de Rofer con el texto gigante detrás del casco, cerca (clip
1434) y lejos (1450), compuestos igual que en v2 y mirados a tamaño real:

| Modelo | Licencia | s/cuadro (4 CPU) | El borde con el texto detrás |
|---|---|---|---|
| RVM resnet50 | GPL-3.0 (se baja de su origen) | 0,95–0,99 | Limpio en el casco y las manos, cerca y lejos: como v2 |
| RVM mobilenetv3 | GPL-3.0 | 0,40 | Casi igual, con el borde del casco algo más blando |
| MediaPipe selfie | Apache-2.0 | 0,12–0,13 | Borde borroso: el texto se funde con el casco (halo), peor lejos |
| SAM 2.1 tiny | Apache-2.0 | 2,2–2,3 | Halo blando en el casco (el texto se cuela) y el más lento |

Ganó **RVM resnet50**, bajado por `instalar.sh` de su origen (GitHub) y comprobado por sha256: el kit no lo lleva dentro.
(El parpadeo medido del borde favorecía a MediaPipe, pero porque su borde es una mancha fija: no parpadea porque no
sigue el contorno.)

**Rofer v2 rehecho desde sus 5 clips** con el kit v0.2.0 y comparado lado a lado con el de la galería (en la galería de
Juancito Ads, «PRUEBA interna — no publicar»): mismo corte, mismas piezas en los mismos segundos (el titular del cuadro
0, EQUIPO EQUIVOCADO tachado, +20 AÑOS detrás, las fichas, la lista, ALQUILER, 3 PREGUNTAS, el sello, ¿UNA OBRA?, el
botón de WhatsApp y el cierre), los mismos 13 subtítulos ocultos donde un gráfico ya lo dice, 40,1 s, −14,0 LUFS y
−1,4 dBTP. El trío lleva, como v2, la excavadora del logo de Rofer en blanco (`"imagen": "logo"`: el kit la saca sola del
logo).

**El ahorro** (decisión 9: sólo si no se ve peor). El recorte bueno es lo más lento (en Rofer, 1.101 cuadros a ~1 s). Se
probó hacerlo sólo donde hay un texto DETRÁS de la persona (530 cuadros) y, para la cámara, la geometría del resto con RVM
a 1/4 de resolución: 646 s frente a 1.068 (−40 %). Comparado con el recorte completo, cuadro a cuadro: PSNR mediana
43,3 dB donde hay texto detrás (lo que importa: el borde) y 35,2 dB donde no (la persona sin la sombra suave que le da la
capa recortada, y la cámara con la cabeza medida a 1/4). Lado a lado, en los peores cuadros, no se distingue. Queda **por
defecto**; `persona.completa: true` en el plan vuelve al recorte de todo.

**Lo que cambió respecto de la propuesta:**

- **Revisión de oficio antes del render** (`revisarEscena`): el cuadro 0 sin gancho, una pieza de delante que tapa la cara,
  la cabeza tapando más del 35 % de un texto detrás, lo que se sale de la franja segura (con el contorno real de las
  letras) y el subtítulo encima de un gráfico. Lo grave para el render hasta que el plan diga `revision: "aceptada"`.
- **Cada paso depende sólo de su parte del plan** (`trabajo/plan/*.json`): tocar las piezas ya no rehace la voz ni la música.
- **La cámara acerca a la persona lejos** hasta que mida 1.000 px (abierto) o 1.300 (medio), hasta 2×, y la sigue al 55 %.
- **El logo se recorta** de su margen transparente antes de ponerlo (con margen salía pequeño en su tarjeta).
- **El kit usa los núcleos que le dejan, no los de la máquina** (`hilos()` mira la afinidad; `KIT_HILOS` lo fija): el
  chat de claude.ai da 2.
- **Remotion enlaza la carpeta de los cuadros en vez de copiarla** (`symlinkPublicDir`) y borra su paquete al acabar: cada
  tramo copiaba 600 MB a /tmp sin borrarlos y el render de Rofer llenó el disco a la cuarta vuelta.
- **`kit.mjs` sale con código 3 cuando un paso queda a medias** (como los de Python), para encadenarlo en un bucle.
- **El trío sin imagen, con las tres palabras del mismo tamaño**, y la imagen que crece del DIBUJO del logo en blanco
  (`"imagen": "logo"`) o de una imagen de la marca. Y la revisión con **anchos medidos** con la letra de verdad
  (`letras.py`): que ningún texto se monte sobre otro ni se salga del cuadro, en todas las piezas. Lo encontró Juan al
  mirar el video del kit contra v2 (segundo 21): sin las siluetas, «MEDIANOS» se montaba sobre «GRANDES» y «GRANDES» se
  salía por la derecha, y la revisión de antes, con anchos estimados, no lo vio.

**Tiempos** (Rofer, 40 s de video, 1.101 cuadros):

| Paso | 4 núcleos (aquí) | 2 núcleos (como el chat; `taskset`) |
|---|---|---|
| Geometría a 1/4 (todo el montaje) | 230 s | 389 s |
| Recorte RVM (530 cuadros con texto detrás) | 416 s | 724 s (dos llamadas de 7 min) |
| Cuadros etalonados y persona en WebP | 81 s | 160 s |
| Escena y revisión de oficio | < 1 s | < 1 s |
| Render por tramos de 5 s (9 tramos) | 225 s | 358 s |
| Final (juntar, mezcla, medir, hoja) | 16 s | 20 s |
| **Total de la imagen** | **≈ 16 min** | **≈ 27,5 min (unas 5 llamadas con el presupuesto de 420 s)** |

Antes, con el recorte de todo y los cuadros en serie, la imagen tardaba ≈ 33 min con 4 núcleos. Lo de 2a (transcribir,
cortar, voz, música, mezcla) va aparte: en el chat tardó unos 2 min.

**Sin probar en el chat de claude.ai**: la instalación de Remotion y su Chromium allí (aquí, el de la máquina), y que el
render quepa en la memoria del chat.

## 15. Fase 3 hecha (2026-11-21): los estilos de edición por cliente

- **`kit.estilosEdicion`** (hasta 6), sin migración (decisión 4), con el mismo blindaje que la identidad de video: sólo
  los escribe su ruta (`guardarKit(…, { conEdicion: true })`) y el PUT del kit los conserva. La forma, la de §4.2; lo que
  no se entiende (una pieza o una transición que el kit no pinta, un número fuera de rango) se DICE y no se guarda nada.
- **`estilo_de_edicion`** (MCP): sin nada, los estilos del cliente en frases; con `estilo`, uno entero en JSON (para
  cambiarlo se guarda ENTERO con su id); con `guardar` crea o, con su id o el mismo nombre, reemplaza; `quitar`. Guardar y
  quitar, sólo con `confirmado` tras el sí: la primera llamada enseña lo que se haría.
- **El ZIP de la marca** (`kit_descargable`) lleva `estilos-edicion.json` y, en `musica/identidad/`, las músicas de su
  identidad de video con su archivo (y `musicasIdentidad` en kit.json): quien edita escoge una de ésas, nunca compone otra.
- **La siembra** (`docs/estilos-edicion/`): «Alex en obra» (Rofer, de v2 y de lo que corrigió Juan) y «Comunidad · persona
  y pantalla» (de Comunidad v3: zoom 1 / 1,08, destello, cierre «ÚNETE GRATIS» con la web y el Instagram). Escritos, NO
  guardados: entran en el calendario por `estilo_de_edicion` con el sí de la agencia.
- **Lo que cambió de §4.2**: la música del estilo va en los mismos dB que los números del oficio (`OFICIO.musica`), no en
  «dB bajo la voz», para que no haya dos escalas; y el plano medio sólo tiene que acercar más que el abierto (Comunidad
  usa 1,08, por debajo del 1,2 que se pensó como mínimo).

## 16. Fase 4 hecha (2026-11-21): la receta, la guía, el acta y lo que aprende

- **La receta `editar-video-grabado`** (la PREMIUM, decisión 5): guía sin tipo → reconocer el tipo → guía con él → kit y
  marca → preparar y `siguiente` → música de su identidad, su biblioteca o Suno (nunca compuesta) → la PROPUESTA CORTA con
  el corte en crudo y 2 o 3 cuadros de muestra (decisión 8) → escena, recorte, render y final → mirar la hoja y la lista
  de control → subir a la galería → el acta. `montaje-ugc` se queda como la RÁPIDA y su descripción manda a la premium;
  las instrucciones del servidor mandan «edita este video de…» a la premium.
- **`guia_de_edicion`** (sólo lee; por debajo de 16.000 caracteres, un test lo comprueba): el manual de la versión
  vigente del espacio, la marca (identidad de video, colores, letra, logo, reglas, léxico), el CONTACTO de la nota «Datos
  del negocio» con lo que no coincide en la Ficha técnica y en la ficha del cliente (decisión 10: en Rofer dice que la
  ficha tiene 61562010 y la nota 6086-6581), los estilos de edición, lo que dijo la persona las últimas veces, lo que espera
  el sí, la lista de control con los números del oficio y la versión vigente del kit.
- **`acta_de_edicion`** y la migración `0083` (`edicion_actas`, `edicion_propuestas`), con las guardas de §4.3 en
  `src/lib/aprendizajeEdicion.js`: sin cita no hay propuesta; una general necesita una orden («nunca…», «siempre…», «en
  todos los videos») o haberse repetido con otro cliente; nada dos veces; tope de 10 pendientes; aplicar es exacto (si el
  texto ya no está, caduca y se dice). Aplicar una general es una VERSIÓN NUEVA del manual (con la versión leída como
  condición, como la pantalla; sólo admin o editor de toda la agencia); una de la marca cambia un campo de texto de su
  estilo, y si el cliente no tiene estilo para ese tipo, se crea con ella. Un colaborador no propone ni aplica lo general.
- **Sin comprobar** (regla de oro 15): un chat NUEVO de claude.ai siguiendo la receta entera con clips de verdad (la prueba
  que hará Juan antes de la Fase 5); el tope de tamaño de un adjunto de video en claude.ai, que no se puede medir desde
  aquí (los de Rofer entraron).

## 17. La prueba en un chat nuevo (2026-11-21) y el kit v0.2.1

Juan probó la receta entera en un chat nuevo de claude.ai con dos videos reales de Rofer: «excelente a la primera», con
un error. En un video, «Y tres, la pregunta que casi nadie se hace…» quedó 3 s sin voz: la pieza de ese clip empezaba
0,02 s antes del archivo y voz.py la leía con un índice negativo (la trampa, en video-y-sonido.md). El chat lo encontró y
lo arregló en su copia; en el kit del calendario, v0.2.1:

- El corte nunca empieza antes de 0 ni acaba después del final del clip (dos redes: `piezasDeToma` y `lineaDeTiempo`).
- El Python lee los tramos con `tramo()`: silencio fuera del archivo, nunca un índice negativo (voz.py y musica.py).
- **`huecos.py`**: la voz montada, palabra a palabra contra la transcripción. Un hueco mudo de 0,25 s o más PARA el kit en
  `voz`, `crudo` y `final`, con su segundo y su texto. Lo debió detectar el kit solo, y ahora lo hace.

Rofer v2 rehecho con el kit nuevo: el mismo corte, pieza a pieza, y ningún hueco en sus 128 palabras.

## 18. Fase 5: la pantalla (un pull request por cosa)

1. **Ajustes → «Editor de video»**, una sección propia en el índice de Ajustes (antes, el manual iba escondido dentro del
   manual de campañas): la versión vigente del kit y cómo se usa, las **últimas ediciones** (las actas: cliente, tipo,
   kit y manual con que se hizo, duración, LUFS y cuántas correcciones de la persona) y el manual del editor con sus
   versiones. Probado abriéndolo en Chromium (tests/vivo/navegador.test.js), también a 390 px.

