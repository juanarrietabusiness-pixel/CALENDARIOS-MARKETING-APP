# Propuesta: la experiencia de publicar

La aplicación nació para **planificar**, y la publicación se le añadió
encima: funciona, pero se hace desde un panel pensado para escribir ideas.
Este documento recoge qué falla hoy, qué permite de verdad la API de Meta
(y qué no) y un plan por fases.

**Estado:** hecho todo lo propuesto salvo el recorte arrastrando el
encuadre (3.1: se recorta al centro). Imágenes de Flow adaptadas a 4:5 y
9:16 sin tocar el original; historias del post (la misma imagen o tres
variantes de Nano Banana); historias de Facebook; colaboradores; la
página Programación; «Programar lo aprobado»; los fallos en la
navegación y en Mi día; el panel con la pestaña Publicar (vista previa
real, arreglos con un botón, hora sugerida); la publicación asistida
desde el teléfono (3.4); la auditoría de perfil de clientes y
prospectos; y el MCP para Claude (4), con OAuth y conexiones en
Ajustes → Claude.

---

## 1. Diagnóstico

### 1.1 La imagen de Flow: el caso que lo explica todo

En la base de producción hay **una sola** fila en la cola de publicación:
una imagen de Flow de **896 × 1200**, que salió en **Facebook** y no en
Instagram.

- 896 / 1200 = **0,747**: es **3:4**, el formato vertical de Flow.
- La API de Instagram sólo admite en el feed de **4:5 (0,80)** a
  **1.91:1**. La app del teléfono ya acepta 3:4, **la API no**.
- La regla está copiada en `src/lib/publicacion.js` (`PROPORCION_FEED`), así
  que el panel bloquea Instagram con un error y **no ofrece ninguna salida**:
  pide «recórtala» y hay que salir de la aplicación a hacerlo.
- Meta Business Suite la recorta a 4:5 (por eso se «corta»). Metricool la
  **encaja**: añade un margen a los lados hasta llegar a 4:5 y la imagen
  sale completa.

La diferencia entre 3:4 y 4:5 es pequeña: para 896 × 1200 hay que pasar a
**960 × 1200**, o sea **32 px a cada lado** (un 2,7 %). Con un fondo
difuminado de la propia imagen no se nota.

### 1.2 El panel está pensado para planificar

Para programar, el orden de lectura del panel es: formato → aprobación →
hora → categoría → título → idea → guion → descripción → sugerencias del
cliente → **imágenes** → hashtags → primer comentario → texto de Facebook →
**Publicar** → conversación → nota interna.

- Las imágenes van **después** de todo el texto, y el botón de programar
  está al fondo, debajo de campos que al publicar no importan.
- Los errores salen lejos de lo que los causa (el error de proporción sale
  bajo «Publicar», la imagen está diez campos más arriba).
- Ningún error trae **el arreglo**: sólo el texto.
- La vista previa pinta el medio sin el recorte real de cada red, así que no
  enseña lo que Instagram va a cortar.

### 1.3 Se publica de una en una y no hay dónde ver la cola

- No existe «programar todo lo aprobado» de un calendario. La opción
  «Programar al aprobar» vive escondida en un diálogo de opciones.
- **No hay una vista de la cola**: qué sale hoy o esta semana en todos los
  clientes, qué falló, qué espera. Sólo se ve el icono pequeño en cada chip
  del mes, calendario por calendario.
- Si algo falla a las 3 de la mañana, nadie se entera hasta que abre ese
  calendario.

### 1.4 Historias

- **Instagram:** el código para publicar historias existe
  (`media_type: STORIES`), pero en la base **no hay ni un solo intento**:
  lo que falle pasa antes de llegar a la cola, en el panel. Falta saber
  qué se vio (¿un botón desactivado?, ¿un error?).
- Una historia se edita en el mismo panel que un post: pide descripción,
  hashtags y primer comentario, que una historia no lleva, y la vista
  previa no es 9:16.
- **Facebook:** el panel dice «las historias de Facebook no se publican por
  API». **Ya no es cierto**: las páginas tienen `/{page}/photo_stories` y
  `/{page}/video_stories`.

---

## 2. Qué deja hacer la API (y qué no)

| Deseo | ¿Se puede por API? | Cómo |
|---|---|---|
| Imagen de Flow completa en el feed | **Sí, adaptándola** | Encajarla a 4:5 en el navegador antes de programar |
| Historias de Instagram | **Sí** | Ya está escrito; hay que revisarlo y darle su editor |
| Historias de Facebook | **Sí** | `photo_stories` / `video_stories` |
| Colaboración en Instagram | **Sí** | Parámetro `collaborators` (hasta 3 cuentas **públicas**) en post, carrusel y reel. **No** en historias. El invitado acepta desde su app |
| Música de la biblioteca de Instagram | **No** | Ninguna herramienta (Metricool tampoco) puede: sólo desde la app. Sí se puede **nombrar el audio original** de un reel (`audio_name`) |
| Etiquetar personas en la foto | Sí | `user_tags` con posición |
| Texto alternativo | Sí | `alt_text` en imágenes |
| Reels de prueba (sólo a no seguidores) | Sí | `trial_params` |
| Sticker de enlace en historias | No | Sólo desde la app |

---

## 3. La propuesta

### 3.1 Adaptar las imágenes de Flow (lo primero)

Cuando una imagen del feed esté fuera de 4:5 – 1.91:1, en vez de un error
que bloquea, **un selector con la vista previa real** y tres opciones:

1. **Completa, con fondo difuminado** *(recomendada, por defecto)*: la
   imagen entera en el centro y los 32 px de cada lado rellenos con la
   misma imagen ampliada y difuminada. Es lo que hace Metricool.
2. **Completa, con color**: el relleno con el color del borde o el de la
   marca (sale del ADN, `lib/colores.js`).
3. **Recortar**: a 4:5, arrastrando el encuadre, para cuando el margen no
   convenga.

Detalles:

- Se hace en el navegador, donde ya se convierte a JPEG
  (`prepararMediosParaMeta`): el Worker no puede tocar imágenes.
- **El original no se toca.** La copia adaptada es sólo la de Instagram;
  Facebook, la página de aprobación y el cliente ven la imagen de Flow tal
  cual.
- Se puede fijar **por cliente** («siempre fondo difuminado») para no
  elegir en cada publicación.
- Lo mismo para historias: una imagen que no sea 9:16 se encaja en
  1080 × 1920 con fondo difuminado, en vez de dejar que Instagram la amplíe
  y corte.

### 3.2 Un panel que separa planificar de publicar

El panel de una publicación pasa a tener **dos pestañas**:

- **Contenido** — lo de siempre: formato, idea, guion, descripción,
  aprobación, nota interna, conversación con el cliente.
- **Publicar** — pensado como el compositor de Metricool:
  - **Medios arriba**, con arrastrar y soltar desde el escritorio, pegar
    con Ctrl+V y reordenar arrastrando.
  - A la derecha (o debajo en el móvil), **la vista previa real** de cada
    red con su recorte: feed de Instagram, historia 9:16, Facebook, TikTok.
  - Texto con contadores, hashtags, primer comentario, texto de Facebook,
    **colaboradores**, nombre del audio del reel, texto alternativo.
  - **Barra fija abajo**, siempre visible: el estado en cada red, fecha y
    hora (con el calendario, no con un campo de fecha del sistema) y los
    botones **Programar** / **Publicar ahora**.
- **Cada error trae su arreglo** en un botón: «Ajustar a 4:5», «Convertir
  en historia», «Quitar Facebook», «Mover los hashtags al comentario»…
- **Hora sugerida**: `lib/resultados.js` ya calcula a qué hora responde
  mejor cada cuenta; se ofrece como chip junto a la hora.

### 3.3 Historias con su propio editor

Cuando el formato es **Historia**, la pestaña Publicar cambia:

- Vista previa 9:16 con las **zonas seguras** marcadas (lo que tapan el
  nombre de la cuenta arriba y la respuesta abajo).
- Sin descripción ni hashtags ni primer comentario (una historia no los
  muestra).
- **Varias historias seguidas**: una publicación «historia» con cinco
  medios publica cinco historias, en orden. Hoy sólo sale la primera.
- **Facebook también**, con `photo_stories` / `video_stories`, en vez de
  publicarla como post normal.
- Un aviso honesto: el sticker de enlace, la música y las encuestas sólo
  se ponen desde la app.

### 3.4 Música: publicación asistida

La API no deja poner música de Instagram, y ninguna herramienta puede.
Lo que sí se puede es que la aplicación **ayude a hacerlo a mano sin
fricción**, como hacen Metricool o Later con «recordármelo»:

- Marcar la publicación como **«Publicar desde el teléfono»** (con la nota
  «poner canción X»).
- A su hora, aviso a la persona responsable; al abrirlo en el teléfono, una
  pantalla con **la imagen o el video listos para guardar**, **el texto
  listo para copiar** con un toque y un botón que abre Instagram.
- Al volver: «Ya la publiqué», y queda registrada como publicada.

Sirve también para todo lo que la API no da (stickers, encuestas, música
en historias).

### 3.5 La página «Programación»

Una sección nueva, `/programacion`, para todos los clientes:

- **Línea de tiempo** de hoy y los próximos 7 / 30 días: qué sale, a qué
  hora, en qué red, con la miniatura.
- **Arriba, lo que falló**, con el motivo en claro y «Reintentar».
- Filtros por cliente, red y estado.
- Acciones: reintentar, cancelar, cambiar la hora, abrir la publicación.

Y en cada calendario:

- **«Programar todo lo aprobado»**, con una revisión previa que lista qué
  está listo, qué está bloqueado y por qué, y un **«Arreglar todo»** para
  los casos automáticos (proporciones de Flow, conversión a JPEG).
- «Programar al aprobar» visible en la cabecera del calendario, no en un
  diálogo.

### 3.6 Avisos

- Un **fallo** de publicación sale en la cabecera (como el medidor de IA) y
  como tarea en **Mi día** para quien la programó.
- Un resumen diario opcional: «hoy salen 6 publicaciones de 3 clientes».

---

## 4. Controlar el calendario desde cualquier chat de Claude (MCP)

### La idea

Un **servidor MCP remoto dentro del mismo Worker**, en `/mcp`. Se añade una
vez en claude.ai → Ajustes → Conectores → «Añadir conector personalizado»
con la dirección de la aplicación, y a partir de ahí funciona en Claude web,
escritorio, **móvil** y Claude Code.

### No es «llamar al asistente»: es darle a Claude sus herramientas

Reenviar mensajes al asistente de la aplicación sería **pagar dos veces**
(Claude en el chat y, además, la API de Anthropic de la aplicación) y
perder calidad. Lo correcto es que el Claude del chat **sea** el asistente:
el MCP expone las mismas herramientas que ya usa el asistente del
calendario, y Claude las usa directamente.

Herramientas propuestas:

| Leer | Escribir |
|---|---|
| `listar_clientes`, `ver_cliente` (ficha y ADN) | `crear_publicacion`, `editar_publicacion`, `editar_publicaciones_lote` |
| `listar_calendarios`, `ver_calendario` | `mover_publicacion`, `eliminar_publicaciones` |
| `ver_cola` (qué está programado y qué falló) | `programar_publicacion`, `cancelar_programacion` |
| `ver_tareas`, `ver_banco_ideas` | `crear_tarea`, `completar_tarea`, `anadir_idea` |
| `ver_resultados` | `crear_calendario` |

Ejemplos: «¿qué sale mañana de Baby Caleb?», «muéveme el reel del jueves
a las 7 de la tarde», «programa todo lo aprobado de octubre», «¿qué falló
esta semana?».

### Seguridad

- **OAuth**: al conectar, Claude abre la pantalla de acceso de la propia
  aplicación; se entra con el usuario de siempre y el permiso queda atado a
  **esa persona y ese espacio**. Se puede revocar desde Ajustes.
- Cada llamada pasa por `crearAcceso(ownerId)`, la misma red que el resto
  de la API: no hay un camino nuevo a la base.
- Toda escritura hace `difundir()`: quien tenga la aplicación abierta ve el
  cambio al momento, firmado como «Claude (MCP)».
- «Publicar ahora» y eliminar se declaran como acciones destructivas, para
  que Claude pida confirmación antes.
- Nada cambia en la CSP: el MCP es del servidor.

### Límites a saber

- Adjuntar una imagen **desde** el chat de Claude a una publicación es
  torpe por MCP; lo natural es indicar un archivo de la carpeta de Drive del
  cliente, que la aplicación ya sabe traer.
- Hace falta un plan de Claude que admita conectores personalizados.

---

## 5. Orden propuesto

| Fase | Qué | Por qué primero |
|---|---|---|
| **1** | Adaptar imágenes de Flow (4:5 y 9:16) · colaboradores · historias revisadas en Instagram + historias de Facebook | Es lo que hoy impide publicar |
| **2** | Panel con pestaña Publicar, vista previa real, barra fija y errores con arreglo | La experiencia diaria |
| **3** | Página Programación · programar todo lo aprobado · avisos de fallo · hora sugerida | Pasar de una en una a trabajar por lotes |
| **4** | MCP para Claude | Independiente de lo demás; puede ir en paralelo |
| **5** | Publicación asistida (música, stickers) · etiquetas de personas · texto alternativo · reels de prueba | Complementos |

## 6. Preguntas abiertas

1. **Relleno por defecto para Flow**: ¿fondo difuminado, color de marca o
   recorte?
2. **Historias**: al intentarlo, ¿qué pasó exactamente? (¿botón gris, un
   error, no aparecía la opción?)
3. **MCP**: ¿sólo tú, o cada persona del equipo con su cuenta?
4. ¿Estás de acuerdo con el orden de las fases?

## Fuentes

- [Publicar contenido — Instagram Platform](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [IG User Media (parámetros: `collaborators`, `audio_name`, `user_tags`…)](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/)
- [Colaboradores — Instagram Platform](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/collaborators/)
- [Stories de páginas de Facebook](https://developers.facebook.com/docs/page-stories-api/)
- [Adobe Community: el programador no acepta el nuevo 3:4](https://community.adobe.com/questions-329/content-scheduler-wont-let-me-post-to-instagram-with-new-3-4-image-ratio-1223579)
