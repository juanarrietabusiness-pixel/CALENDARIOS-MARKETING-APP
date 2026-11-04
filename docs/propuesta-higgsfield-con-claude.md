# Propuesta: lo que Higgsfield hace «con Claude», dentro del calendario

Estado a 2026-11-04: **investigación hecha, nada implementado.** Se leyó el MCP de Higgsfield entero en modo sólo
lectura: herramientas, sus 15 flujos (cada uno un SKILL.md con sus archivos de referencia), 80 recetas, sus
galerías, su única app y unos 130 modelos. **No se gastó ningún crédito.** La cuenta de Higgsfield tiene 5,28
créditos en plan gratuito, y ninguna herramienta que genere, suba, cree o publique se llamó. Esta propuesta dice qué
de eso puede hacer el calendario con lo que ya tiene, qué no, y en qué orden construirlo.

La conclusión en tres líneas:

1. **«Crear con Claude» de Higgsfield es texto + herramientas.** El botón abre claude.ai con un comando; Claude lee
   una RECETA (instrucciones escritas) y llama a las herramientas de generación. Casi todo el valor está en el método
   escrito y en modelos que **son de terceros y ya están en Kie** (GPT Image 2/2.5, Nano Banana Pro, Seedream, Seedance,
   Kling, Veo, Omni, MiniMax H3, ElevenLabs).
2. **El calendario sabe más del cliente que Higgsfield.** Kit de marca, catálogo con precios y fotos, cerebro, estudio
   de mercado, resultados reales. Una receta del calendario puede ser mejor que la suya con los mismos modelos.
3. **Lo que falta es la ESTRUCTURA**, no los motores: recetas como dato, el botón que las lleva a Claude (en la
   aplicación o en claude.ai), y que Claude VEA por MCP lo que crea. Y para el video, el render con ffmpeg en el
   Container, del que dependen casi todas las mejoras de video.

---

## 1. Cómo funciona «Crear con Claude» en Higgsfield

Lo deducido de las herramientas (la descripción de `get_preset_instructions` lo dice casi entero) y de su ayuda
pública:

1. En higgsfield.ai se escoge un preset y se suben los archivos **a su almacén**: cada uno queda con un `media_id`.
2. El botón abre una pestaña de **claude.ai con un mensaje prellenado**: el comando de la receta (`/hero-shot`,
   `/katana/<slug>`, `/shorts/<slug>`…), el pedido en texto y un bloque `MEDIA` con líneas
   `<image|video> media_id=<uuid>`.
3. Si el mensaje no cabe en la dirección, Higgsfield **guarda el pedido en su servidor** y el mensaje sólo dice
   `HANDOFF: handoff_id=<uuid>`. Claude lo canjea con `get_preset_instructions({ handoff_id })`.
4. Claude tiene el **conector MCP de Higgsfield** instalado en la cuenta de la persona (`https://mcp.higgsfield.ai/mcp`).
   Las `instructions` del servidor le dicen que todo `/comando` se resuelve con `get_preset_instructions` antes de
   nada. Así carga la receta o el SKILL.md y la sigue con `generate_image`, `generate_video`, `jobs_wait`…
5. Los resultados vuelven a la conversación en **widgets** (MCP Apps: galerías, formularios con «Recreate», progreso)
   y Claude los mira para corregir.

La dirección de claude.ai que prellena un mensaje es `https://claude.ai/new?q=<texto codificado>`. **No está
documentada por Anthropic**: la usa la comunidad, y un issue (anthropics/claude-code#8827) cuenta que el envío
automático dejó de funcionar en algún momento. No se pudo confirmar la dirección exacta que usa Higgsfield: la red de
esta sesión no llega a higgsfield.ai.

Por qué le gusta a la agencia, aunque no se diga: **el razonamiento lo paga la suscripción de Claude**, no la llave de
la API. Lo único que se cobra aparte es la generación.

Fuentes: [Higgsfield: conectar con Claude](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-claude),
[higgsfield.ai/mcp](https://higgsfield.ai/mcp), [higgsfield.ai/skills](https://higgsfield.ai/skills),
[guía de Creatify sobre el MCP](https://creatify.ai/blog/what-is-higgsfield-mcp-what-it-does-what-it-costs-and-how-to-use-it),
[el endpoint /new de claude.ai](https://whtwnd.com/austegard.com/3mfcl4fnb4n2o).

---

## 2. Qué hay en el MCP de Higgsfield

| Familia | Qué permite | ¿Exclusivo de Higgsfield? |
|---|---|---|
| **Generación** (`generate_image/video/audio/3d`, sus `*_batch` de 1 a 12, `jobs_wait`) | Cualquier modelo del catálogo, con medios por papel (inicial, final, referencias de imagen, video y audio). `get_cost: true` cotiza sin generar | No: la mayoría de modelos son de terceros |
| **Edición** (`upscale_*`, `outpaint_image`, `reframe`, `remove_background`, `motion_control`, `dubbing`, `voice_change`) | Retocar una pieza hecha | No: Topaz, Kling Motion Control, ElevenLabs (doblaje, cambio de voz) |
| **Recetas** (`get_preset_instructions`) | 80: 45 de imagen de producto, 18 de movimiento de cámara sobre producto, 17 efectos de Halloween | El texto es suyo; los modelos, no |
| **Flujos** (`get_workflow_instructions`, `get_workflow_bundle_file`) | 15 SKILL.md: ads-studio, product-photoshoot, brand-asset-creation, thumbnail-generation, character-sheet, ugc-video, faceless-video, narration, ad-multiplier, katana, video-editing, video-montage, reel-effects, shorts-studio, website-builder-flow | El método es texto legible; los scripts corren en su sandbox |
| **Sandbox** (`sandbox_exec`) | Linux remoto con ffmpeg, ImageMagick, Playwright, Whisper y sus scripts (montaje, subtítulos, medir la voz) | Sí, como infraestructura; el equivalente propio es el Container |
| **Galerías** (`get_presets`) | Marketing Studio (649: 418 fotos de producto y 231 de motion), Viral (87 cadenas de efectos), Genjutsu (miles de movimientos y 20 estilos que redibujan un video), Soul (33 estilos), Katana (ediciones de referencia), What If (unos 60 estilos de shorts explicativos), Shorts Studio (unos 28), Explainers (22, cada uno con su prompt para Claude) | Sí: la curaduría es suya |
| **Ads Studio** (`ads_studio_*`) | Investiga una marca desde su web, lee páginas de producto y saca anuncios estáticos con su texto. Sin 4:5 | Sí: caja negra de su servidor |
| **Personajes** (Soul ID, AI Influencer, «elementos») | Una persona entrenada con 5–20 fotos; hojas de personaje por rasgos | Soul y AI Influencer, sí. Los elementos equivalen a los personajes del kit |
| **Voces y audio** | ElevenLabs v4 (también diálogo de hasta 10 voces), ElevenLabs Music, Seed Audio, clonar | No: ElevenLabs directo con la llave de la agencia |
| **TikTok** | Música comercial de tendencia (Commercial Music Library) y publicar | Sí: va por su app auditada; la de la agencia nunca pasó la auditoría |
| **Análisis** (`virality_predictor`, `video_analysis_*`) | Un panel de «potencial viral» y un análisis escena por escena (también de YouTube) | El predictor, sí (y no da datos con los que trabajar). El análisis se hace con Gemini |
| **App del marketplace** | Una sola: «Match Cut + Tracelab», 27 modos de motion determinista (productcut, logocut, typewriter, wordstack…; admite 4:5) | Sí, pero es motion por código: el motor Canvas puede hacerlo |
| Sitios web, juegos, 3D (Blender remoto) | | No aplica a la agencia |

**Modelos exclusivos de Higgsfield:** Soul (2, Cinema, Cast, Location), Cinema Studio (imagen y video), Marketing
Studio (`marketing_studio_*`: product_link, ad_reference, app_video, UGC), Genjutsu (`hf_mult_*`), Ad Multiplier y
Recreate, Intone (diálogo con labios de una o dos personas), `/polish`. **Todo lo demás es de terceros** y la mayoría
ya está en Kie: GPT Image 2 y 2.5, Nano Banana Pro y 2, Seedream 4.5 y 5, FLUX 2, Ideogram, Seedance 2 y 2.5, Kling
3 y Omni, Veo 3.1, Gemini Omni, Wan, Hailuo, MiniMax H3, ElevenLabs. **A comprobar en Kie o fal:** Recraft V4.1 (logos
en SVG), Kling 4.0, Sync Lipsync, la variante «sunburst» de GPT Image 2.5 (Kie lista «Flare»).

---

## 3. Lo que el calendario ya hace de todo esto

Antes de proponer nada, lo que ya existe (y por qué no hay que repetirlo):

| En Higgsfield | En el calendario |
|---|---|
| Recetas de foto de producto (hero-shot, in-hand, flatlay, salpicadura, flotando, unboxing, before-after) | `COMPOSICIONES` del lote (`loteAnuncios.js`) y los modos de foto (`modosFoto.js`) |
| Restyle por temporada | «De temporada» (`temporada.js`) |
| swipe-opener, myth-fact, quick-steps, how-it-works, product-match, whats-inside | La portada del carrusel con su sistema (`sistemaCarrusel.js`) y las 14 estructuras (`estructurasCarrusel.js`) |
| reel-cover, thumbnail-generation | «Portada que da clic» (`portadaClic.js`, 16 conceptos propios) |
| La mejora del prompt de una foto | El director de arte y su ficha (`director.js`, `FORMATO_FICHA`) |
| Revisar la pieza mirándola y corregir | El control de calidad (`control.js`) y la revisión del director |
| Brand lock | El kit de marca (`kitMarca.js`): paleta por papeles, letra real, logo estampado, reglas, plantillas, personajes |
| Pack de anuncios por ángulos | La producción en lote con la matriz deseos × perfiles × niveles y las tácticas (`loteAnuncios.js`) |
| Guion UGC, fórmulas | `ugc.js`, `formulasUgc.js`, «Extraer guion y adaptar» |
| Video de producto con fotograma inicial y final | «Video del producto» (`videoProducto.js`) |
| Reel con fotogramas, storyboard | Reel IA (`reel.js`, `FlujoReel.jsx`) |
| Ad Multiplier «Recrear» | «Recrear un video» con sus dos modos (`recrear.js`, `motorRecrear.js`) |
| video-review, brand-consistency | «¿Está listo este video?» (`revisionVideo.js`) y «Las piezas juntas» (`piezasJuntas.js`) |
| /content-factory, motion graphics | El video animado: formato de escenas v1, motor Canvas 2D, voz de ElevenLabs con tiempos por palabra y herramientas MCP (`videoEscenas.js`, `motorVideo.js`, `voces.js`, `herramientasVideo.js`). Falta el render |
| Personaje consistente | Los personajes del kit como referencia |
| Análisis escena por escena | Gemini en `verVideo` |

Las cinco recetas adaptadas del repositorio público de Higgsfield (MIT) están en `docs/licencias/higgsfield-skills.md`.

---

## 4. La estructura: recetas con Claude, en el calendario

Es lo que pide la agencia: que cualquier referencia, preset o pieza tenga **«Crear con Claude»** y que Claude diseñe
todo en una sesión, pero con el kit, el catálogo y el cerebro del cliente, y generando por los motores de la agencia.

### 4.1 La receta es un DATO

Como las plantillas de plan (`plantillasPlan.js`): las de la casa viven en el código, las que cambia o crea la
agencia en D1, y una fila con el id de una de la casa la sustituye.

```
receta {
  id, titulo, descripcion, salida: imagen | carrusel | video | animado | texto
  tipos?            los tipos de contenido con los que encaja (PILARES)
  entradas: [{ campo, papel: producto | referencia | persona | video | texto, obligatoria, max }]
  preguntas         las que se hacen si falta algo (como mucho 3, en un mensaje)
  instrucciones     el MÉTODO, en markdown, escrito por la agencia (no copiado de Higgsfield)
  modelo            el preferido; si no hay llave, el relevo
  proporciones      por destino (feed 4:5, historia 9:16, portada…)
  controles         qué se comprueba antes de entregar (texto exacto, nada inventado, zonas…)
  ejemplos          ids de la galería que la enseñan (de clientes reales: el «antes de pulsar»)
}
```

Una receta NO es código nuevo cada vez: es texto que Claude lee y una lista de herramientas que ya existen
(`ver_estudio`, `crear_en_estudio`, `estado_trabajo`, `crear_video`, `generar_locucion`…). Por eso la agencia
puede escribir las suyas sin tocar el repositorio.

### 4.2 Un motor de recetas, tres puertas

La misma receta se abre desde tres sitios:

1. **«Crear aquí»** (la principal): el asistente de la aplicación, en la pestaña Director, carga la receta. No tiene
   límite de dirección, ve las imágenes que crea (ya lo hace: `paraElModelo`) y la confirmación del costo es el
   botón de siempre. Lo paga la llave de la API.
2. **«Crear con Claude»**: abre `claude.ai/new?q=` con un mensaje corto:
   `/receta hero-shot · cliente Baby Caleb · HANDOFF: <id>`. El pedido entero (la publicación, las referencias por su
   id de la galería, lo que se escribió en «¿Qué quieres?») se guarda antes en una fila de `handoffs` (D1, caduca en un
   día, del espacio de quien lo pidió). En claude.ai, con el conector del calendario ya instalado, Claude lo canjea y
   sigue la receta. Lo paga la suscripción de Claude. Como `?q=` no está documentado, el botón además COPIA el mensaje:
   si la dirección deja de prellenar, se pega.
3. **Dentro de otras pantallas**: «¿Qué quieres?» del post, el lote, la galería («Hacer otra con esta receta»),
   Inspiración y la Biblioteca de anuncios («Recrear con mi marca» de una referencia ajena).

`MEDIA` de Higgsfield equivale a los **ids de la galería** del Estudio: las referencias ya viven en R2 por cliente.

### 4.3 Lo que le falta al MCP del calendario

Hoy (`worker/rutas/mcp.js`, `worker/lib/mcp.js`) sólo expone herramientas y **sólo devuelve texto**. Para que
«Crear con Claude» funcione como el de Higgsfield:

| Cambio | Por qué |
|---|---|
| `ver_recetas` y `receta` (con `handoff_id`) | El equivalente de `get_preset_instructions`. Sin ellas Claude no sabe la receta |
| `INSTRUCCIONES` del servidor: «un mensaje que empieza por `/receta` o trae `HANDOFF:` se resuelve con `receta` antes de nada» | Es como Higgsfield enruta sus comandos: con las instrucciones del servidor, sin `prompts` de MCP |
| **Devolver la imagen** en `estado_trabajo` y una `ver_pieza` nueva (contenido `image` de MCP, base64) | Hoy Claude en claude.ai crea a ciegas: pide la pieza y recibe «hecho». Sin verla no puede corregir, que es el corazón de «diseña todo en la misma sesión». El Worker ya manda imágenes de hasta 3,5 MB a la IA en «Revisar marca»; para las más grandes, una copia reducida con la API de imágenes de Cloudflare (**a comprobar su costo en el plan**) o desde el Container |
| `crear_en_estudio` con `receta` y `publicacion_id` | Que la pieza quede en su publicación y apunte su uso, como hace el director en la aplicación |
| `poner_en_publicacion` también por MCP | Hoy sólo existe en el asistente de la aplicación |
| Más adelante: widgets de MCP Apps (la galería del cliente, el plan con su costo y «Crear») | Es lo que en Higgsfield se ve dentro de claude.ai. No es imprescindible: con imágenes en el resultado, Claude ya ve |

---

## 5. Mejoras que no necesitan receta (prompt; cuestan cero)

Van en el director, en `pedidoDePieza` (`src/lib/pieza.js`) y en el control. Afectan a TODA pieza:

1. **La ficha fotográfica obligatoria** (de product-photoshoot): luz con dirección Y calidad (45° izquierda, softbox
   grande; contraluz, estrobo duro), temperatura en Kelvin, lente en mm y apertura con su profundidad de campo,
   superficie y cómo cae la sombra. Palabras vagas prohibidas («buena luz», «alta calidad», «realista», «moderno»).
   Hoy `FORMATO_FICHA` pide composición y texto con medidas, pero no la fotografía.
2. **Bloques «Evitar» por caso**: uno universal (artefactos, plástico, HDR, aspecto de foto de banco, franjas de color
   planas) y uno por situación: caras y manos, etiquetas, anuncios, cambio de estilo y texto añadido después.
3. **La regla del texto en tres casos.** (a) Hay texto exacto: va integrado en la escena, con estilo, sitio y
   contraste dichos. (b) Lo pone la aplicación después (modo plantilla): se pide «una zona de tono uniforme DENTRO de
   la escena» (cielo, fondo desenfocado, una superficie), **nunca «espacio negativo» ni «hueco»**, que dibuja franjas
   planas. (c) No hay texto: no se nombra. El caso (b) cambia lo que hoy pide el modo plantilla.
4. **Dos frases cuando van fotos del producto**: «si la foto está inclinada o tomada desde arriba, endereza el
   producto, no copies ese punto de vista» y «reproduce cada elemento impreso tal cual, sin traducirlo; lo que no se
   lee, como forma fiel».
5. **Refinamiento por categoría visual**, no sólo de texto: luz plana, superficie plástica, brillo de IA, deriva de
   la paleta, franja plana, aspecto de foto de banco, anatomía, composición. Un defecto por vez, **visto en los
   píxeles**, como mucho dos ediciones por pieza, y en una serie primero la coherencia y sólo se rehace la que se sale.
   Encaja en `controlarYCorregir` y en la revisión del director.
6. **Anti-clichés en el director** (de brand-asset-creation): hojas = orgánico, destellos = premium, escudo =
   confianza, degradado = moderno, dorado con serifa = lujo. Y «un solo gesto expresivo» por pieza.
7. **La compuerta de verdad** (de ugc-video y de las recetas «informativas»): en anuncios y tarjetas, sólo
   afirmaciones de una lista cerrada que sale del catálogo y del cerebro; ningún testimonio, compra, resultado ni
   «antes y después» inventado; sin cifras, avales ni certificaciones que no estén escritas. Protege frente a las
   políticas de Meta. El lote ya dice «no inventes» (`faltan`); esto lo vuelve una lista que el control comprueba.

---

## 6. El catálogo de recetas propuesto

Por valor para una agencia de pymes en Panamá (orgánico + anuncios de Meta). Cada una dice con qué se hace.

### Alto valor

| Receta | Qué hace | Con qué |
|---|---|---|
| **Movimientos de producto** (18) | Giro de 360°, revelado vertical, barrido de luz, macro, recorrido de detalles, partículas congeladas, líquido envolvente, push-in, pull-back, whip-pan… Tomas de apoyo de 5–6 s para reels, historias y anuncios | Dos pasos baratos: (1) foto del producto aislado, 60–70 % del cuadro, fondo de UN color sacado del producto, con sombra y sin texto; (2) Seedance por Kie con esa imagen inicial, el movimiento en 2–3 frases, sin sonido. En 9:16 o 4:5, no 3:4. Si falla el paso 1, el video no se pide |
| **Tarjetas informativas de una imagen** | Beneficios (hasta 4 etiquetas con verbo e icono), tres razones, ficha técnica, consejo para guardar, mito o realidad, tres pasos, guía para escoger, qué trae | Hoy sólo existen como carrusel. Aquí, mejores que en Higgsfield: los datos salen del catálogo y del cerebro (no sólo de lo que se lee en la foto) y el control revisa el texto letra a letra |
| **Pack de anuncios con sistema visual fijo** | 5 variantes por defecto con ángulos de gancho distintos (aspiración, zoom a una característica, transformación, prueba social, curiosidad…), una proporción por ubicación (4:5 feed, 9:16 historia, 1:1) y UN sistema visual copiado igual en todas | El lote ya tiene la matriz; falta el sistema fijo y el **esquema de una línea por variante que se confirma antes de gastar** |
| **Texto de anuncio por creativo** | Titular, texto principal, CTA y destino de cada pieza del pack, que pasan a «Nueva campaña» | Texto: `anuncios.js` y el asistente de campaña ya existen |
| **Ficha de producto desde un enlace** | Leer la página de un producto (o la web o el Instagram de una marca) y PROPONER su ficha de catálogo: fotos, precio, puntos de venta, diferenciador; y del kit, paleta y letra | Es lo único de Ads Studio que vale la pena. Con la regla suya: no se generan anuncios de un producto sin puntos de venta |
| **«Otro gancho»** de un anuncio ganador | Cambiar SÓLO los primeros 3–5 s de un video que ya funciona, para una prueba A/B en Meta | Gemini dice dónde termina el gancho; un clip nuevo con un fotograma del original como imagen inicial; se une. **Necesita el render con ffmpeg** (§7) |

### Valor medio

| Receta | Qué hace | Con qué |
|---|---|---|
| **UGC con presentador IA** | Un reel de reseña o tutorial con un personaje del kit hablando, con aviso de contenido patrocinado | Por clip, un **tablero de 8 viñetas en una sola imagen 21:9** (más barato que un fotograma por plano) con la regla «anti-fusión»: dos viñetas vecinas cambian a la vez de punto de vista, distancia y acción, si no el modelo las funde en vez de cortar. Densidad: hasta 10 s, 12–20 palabras; 11–12 s, 20–28; 13–15 s, 28–35. Primera palabra = gancho, antes de 0,4 s. **Antes, probar la voz en español** (CLAUDE.md: Seedance la inventa mal): voz nativa de Seedance 2.5, voz de Omni, o clip mudo + ElevenLabs + sincronía de labios |
| **Portadas con texto encima** | El titular de la portada NO lo escribe el modelo: se pinta en el lienzo, en 5 estilos (blanco con trazo negro, degradado, neón, píldora de vidrio, marcador), 2–4 palabras, mayúsculas del 12–18 % del alto | `textoSobreImagen.js` ya pinta texto; se suman los estilos a «Portada que da clic», más marcos nuevos (Día N, reseña genérica, repetición, contraste de tamaño, un fotograma real del video) y retoques de «sólo el fondo» o «sólo la emoción» |
| **Restyle por estética** | La misma pieza en otra estética (lujo silencioso, japandi, cottagecore…) además de la temporada | Atajo de «¿Qué quieres?», como «De temporada» |
| **Conceptual** | Producto levitando, entorno imposible, pedestal, cromo… comprometido del todo con lo surreal (un elemento principal, 2–4 de apoyo) | Atajo de «¿Qué quieres?»; no para marcas rústicas o económicas |
| **Hoja del personaje** | Para el kit: UNA imagen 16:9 con cuerpo entero y primer plano (o vuelta de 4 vistas, o expresiones) y una descripción por partes | Mejor referencia que dos fotos sueltas. Sólo personajes originales |
| **Mockups de marca** | Empaque, bolsa, camiseta, letrero con el logo | Dos etapas: Seedream hace la escena con la superficie EN BLANCO y después se estampa el logo (la aplicación ya estampa) o GPT Image 2 lo aplica sin tocar nada más |
| **Banner y cabecera de correo** | 16:9, 21:9, 3:1 para clientes con web o newsletter | Una proporción más del Estudio |

### Valor bajo

Logos y paletas nuevas para prospectos (Recraft V4.1 en SVG, si está en Kie o fal), brandbook en PDF, modelo virtual
con la prenda (sólo clientes de moda), efectos de Halloween sobre un retrato del cliente (temporada de octubre),
doblaje de referencias en inglés y cambio de voz (ElevenLabs directo), «copiar el movimiento» (Kling ya está), remezcla
de ediciones tipo Katana.

---

## 7. El video animado (motion graphics): lo que conviene llevarse

El calendario ya está por delante en lo esencial: un motor puro y determinista, escenas ancladas a palabras y voz con
tiempos por palabra. Higgsfield usa tres motores (Higgsedit, un CLI privado; un motor HTML con Chrome sin pantalla; y
páginas de efectos fijas) y de ellos se puede aprender:

**Para el formato v1 y el motor (`videoEscenas.js`, `motorVideo.js`):**

1. **Anticipar las anclas:** una entrada anclada a una palabra arranca 0,10–0,15 s antes de ella.
2. **Salidas ancladas al FINAL de la escena** (no a un tiempo) y un **escalonado** con «cada».
3. **Ayudas de movimiento deterministas:** llegada con rebote y desenfoque que se despeja, muelle que se asienta,
   sacudida por tabla fija con la escala justa para no enseñar el borde, flotación sembrada distinta por capa, escala
   lenta en las pausas, revelado y trazo. Todas leen sólo `t`.
4. **`cifra` que entienda «412K» o «$3.2M»** (prefijo, sufijo, decimales) y **`lista` con cada ítem anclado a su
   palabra**.
5. **«Texto detrás del producto»** con las fotos del catálogo en PNG con alfa: el texto entre el fondo y el producto,
   sin pagar un recorte.
6. **Zonas más estrictas para el texto esencial en 9:16:** al menos 32 px, entre el 13,5 y el 76 % del alto y el 5,5 y
   el 91 % del ancho (el margen derecho es mayor por los botones de la red), medido sobre la caja ya rotada.
7. **Subtítulos:** N palabras por línea configurable (3 por defecto), partir en fin de oración o en pausas de más de
   0,6 s, nunca cruzar una escena, al menos 0,25 s en pantalla, sostener en huecos cortos, unir la palabra suelta, un
   solo tamaño en todo el video (al menos el 2 % del alto) y la palabra que se está diciendo resaltada.
8. **Validaciones nuevas:** una imagen a pantalla completa que por desplazamiento o sacudida deja ver el borde;
   escenas QUIETAS (diferencia de luma entre fotogramas a baja resolución: gratis, porque el motor es puro); la misma
   entrada repetida en todo el video.
9. **Reglas de diseño en `formato_video`** (lo que Claude lee): cuentan como defecto un fondo con texto y nada que
   mirar sin sonido, todo centrado a un solo tamaño, la misma entrada en todas las capas y la tipografía genérica.
10. **Efectos de sonido con punto de sincronía:** un catálogo propio (categoría, uso, duración, punto de sincronía,
    volumen; CC0) del que salen eventos solos por tipo de capa: un «whoosh» al entrar, un golpe en un sello, un tic
    por paso de una cifra, clics en el texto que se escribe. Rotan dentro de su categoría y quedan bajo la voz.

**Para la voz (`voces.js`, la locución):**

- **Se mide el HABLA, no el archivo:** con los tiempos por palabra, duración del habla, como mucho 2,9 palabras por
  segundo y ninguna pausa interna de 0,8 s o más.
- **Si no cabe, se reescribe el texto; nunca se acelera.** Como mucho 3 intentos, y una toma aprobada no se toca.
- **Una sola toma** para todo el guion, con la dirección entre corchetes al principio y sólo donde cambia; una frase
  de dirección fija para que el timbre no cambie; mayúsculas en una palabra por oración como mucho; números en letras;
  nunca pedir «lento» (alarga la toma un 20 %).
- **Si cambian 1–2 frases, se regeneran sólo esas** y se empalman (crossfade de 10 ms, la pausa de ~0,25 s); con 3 o
  más, la toma entera. ElevenLabs deja un clic al final del archivo que hay que recortar.

**Para el render del Container (lo pendiente, y de lo que depende casi todo el video):**

- Fotograma a fotograma desde `t`, en **trozos de al menos 2 s en paralelo** que se unen sin recodificar; el audio se
  mezcla UNA vez.
- H.264, CRF 18 **con techo de bitrate** (el grano por fotograma dispara el tamaño), BT.709 de rango limitado.
- **Audio:** voz a −14 LUFS, pico real ≤ −1 dBTP; música 16 LU por debajo, entrada de 0,1 s y salida de 1,5 s, y el
  último sonido de la canción en el final del video (se pierde la intro, no el cierre). Música instrumental con
  ElevenLabs Music (**a comprobar** que el plan de la agencia la incluye y su licencia comercial).
- **Comprobación final:** duración dentro de 2 fotogramas, flujos, decodificación completa, sonoridad.
- **Una hoja de contacto** (inicio, pico y final de cada escena) que vuelve a Claude por `ver_video` como imagen: es
  como Higgsfield deja que Claude revise lo que hizo.
- Con ffmpeg ahí, salen también: unir clips de más de 15 s, el «Otro gancho», subtítulos quemados sobre un video
  generado y el modo «imágenes narradas» (una imagen generada por frase, con movimiento de cámara, cronometrada por la
  voz).

**No conviene:** Higgsedit (privado; sus efectos GLSL piden GPU), cambiar el lienzo por DOM y Chrome (rompería el
contrato puro y probado del motor; sólo vale su técnica de render), After Effects y Blender (de escritorio), el grano a
pantalla completa por defecto (Higgsfield lo trata como defecto salvo que el estilo lo pida) y los recortes de persona
pagados.

---

## 8. Analizar antes de publicar

`virality_predictor` de Higgsfield es un panel cerrado (no devuelve datos con los que trabajar) y de pago. La versión
del calendario puede ser mejor porque tiene **las métricas reales de cada cliente** (`metricas_publicacion`):

- Ampliar «¿Está listo este video?» con: en qué segundo entran la primera palabra, la cara, el producto y el llamado;
  una nota por segundo de los 3 primeros; cortes por segundo (comparando fotogramas en el navegador); y los riesgos de
  abandono.
- Calibrarlo con los reels de ese cliente: qué tenían los que retuvieron. **Es una heurística, no un modelo
  predictivo**, y se dice así en pantalla hasta que se valide contra los históricos.

---

## 9. Lo que sólo existe en Higgsfield

No se puede reproducir con Kie, fal, Google ni ElevenLabs:

- **Soul ID** (una persona entrenada con 5–20 fotos) y sus 33 estilos; Cinema Studio.
- **Marketing Studio**: 649 plantillas curadas y sus modelos propios.
- **La curaduría**: 87 efectos Viral, miles de movimientos de Genjutsu, Katana, What If, Shorts Studio, 22 estilos de
  explainer. Los motores de debajo son de terceros; lo que se paga es la selección y los prompts.
- **Ads Studio** como servicio (la investigación de la marca), **Intone**, **Ad Multiplier Recreate**,
  **Virality Predictor**, el sandbox con sus scripts.
- **La música comercial de tendencia de TikTok**, que va por su app auditada.

Si algún día la agencia necesita una de estas, la vía es el propio MCP de Higgsfield con créditos (desde claude.ai), no
reconstruirla.

---

## 10. Orden de trabajo

Cada fase deja algo usable y no gasta créditos de Higgsfield.

| Fase | Qué | Depende de | Costo de construir |
|---|---|---|---|
| **0** | §5 entero: ficha fotográfica, bloques «Evitar», regla del texto en tres casos, las dos frases del producto, anti-clichés, refinamiento por categoría, compuerta de verdad | Nada | Sólo prompt y tests |
| **1** | Recetas como dato (código + D1 + editor), «Crear aquí» con el director, las 4–5 primeras recetas (movimientos de producto, tarjetas informativas, pack de anuncios) | Nada | Medio |
| **2** | MCP: `ver_recetas`, `receta`, `handoffs`, imágenes en el resultado (`ver_pieza`), `poner_en_publicacion`; el botón «Crear con Claude» | Fase 1 | Medio. Comprobar `?q=` en claude.ai el primer día |
| **3** | Render del video animado en el Container con ffmpeg (§7) y las mejoras del formato v1 | Lo que ya está en marcha | Alto: es el cuello de botella |
| **4** | Lo que cuelga del render: «Otro gancho», unir clips, subtítulos quemados, imágenes narradas, música | Fase 3 | Medio |
| **5** | Ficha de producto desde un enlace, texto de anuncio por creativo, UGC con presentador IA (tras probar la voz), retención calibrada | Fases 1 y 3 | Medio |
| **6** | Widgets de MCP Apps en claude.ai, hojas de personaje, mockups, estéticas | Fase 2 | Bajo–medio |

---

## 11. Licencias y cuidado

- El repositorio público de skills de Higgsfield es **MIT** (lo adaptado está en `docs/licencias/higgsfield-skills.md`).
  **Lo que sirve su MCP no declara licencia**: los SKILL.md de este servidor pueden ser una versión distinta, las
  recetas y los catálogos viven en su servidor, y el código de su sandbox (el motor de /shorts, los efectos) no dice
  nada. Se toma el MÉTODO y se escribe con palabras propias, como hasta ahora; ningún archivo suyo entra al repositorio.
- Los nombres de fotógrafos que usan sus recetas como «llave de estilo» no van a ningún prompt (ellos tampoco los
  ponen).
- Los efectos de sonido que usan son CC0 y las fuentes OFL: si se usan, se bajan de su origen, no del sandbox.

## 12. Sin comprobar

- La dirección exacta que abre «Crear con Claude» y si `claude.ai/new?q=` sigue prellenando.
- Qué devuelve claude.ai si un resultado de MCP lleva una imagen grande (tope de tamaño).
- Si están en Kie o fal: Recraft V4.1, Kling 4.0, Sync Lipsync, la variante «sunburst» de GPT Image 2.5.
- La voz nativa de Seedance 2.5 en español.
- El costo de la API de imágenes de Cloudflare en el plan de la cuenta, y si ElevenLabs Music entra en el plan de la
  agencia con uso comercial.
- Los precios de las recetas de Higgsfield: no se cotizó nada.
