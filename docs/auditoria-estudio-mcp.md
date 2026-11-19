# Auditoría del Estudio por MCP: diseño, video, director y contexto

*2026-11-18, sobre `main` en ad5bb5f (#271); §7–9 añadidas el 2026-11-19. Auditoría de sólo lectura: no se cambió código. Se leyó el código y las
trampas de cada área (para no marcar como fallo lo que es decisión). Se llamaron cinco herramientas de lectura del MCP en
producción para medir tamaños (`listar_clientes`, `ficha_de_textos` de D'CASA 2026-11, `estrategia_del_mes`,
`ver_estudio_mercado`). Nada se probó contra los modelos, ElevenLabs, Kie ni Cloudflare: lo que dependa de cómo se
comporta un servicio real va marcado.*

Los hallazgos marcados con **✔** se comprobaron dos veces: leyendo el código y, en dos casos, ejecutando las funciones
puras.

---

## Revisión del 2026-11-19: lo que es SEGURO

La agencia pidió no tocar nada sin la seguridad de que mejora algo. Se revisó cada hallazgo otra vez, leyendo el código
uno por uno y, donde se pudo, ejecutándolo o mirando el conector desplegado. Quedan tres grupos. **Sólo el primero se
hace.** Lo demás de este documento (incluido lo de los tres repositorios y las entregas 2 a 9 de §8) queda como
referencia: se hará, si se hace, después de medirlo.

### 1. Seguro: fallo comprobado, efecto concreto, arreglo sin contrapartida

| # | Qué | Prueba | Qué mejora |
|---|---|---|---|
| S1 | La revisión del director no corre en las piezas sueltas | Ejecutado: con un pedido real (`pedidoDePieza` + `conEscena`), `fichaDelPedido` devuelve "" también sin kit. Rompe una decisión escrita de la agencia (estudio-e-imagen.md: «El DIRECTOR revisa cada pieza») | Toda pieza de `disenar_piezas`, el lote y «Producir el mes» recibe nota, arreglos y la corrección automática por debajo de 8. **Sube el gasto**: un control algo más largo por pieza y, en las que saquen menos de 8, una edición más (tope: una por pieza) |
| S2 | El MCP escribe el mes sin versión | Leído: `guardarDias` (mcp.js:223) escribe `days` sin condición; `poner_en_publicacion` espera al Container entre leer y escribir. La trampa del 409 dice que así «desaparecía sin aviso» y deja el MCP como pendiente («como siempre») | Dos ediciones a la vez, o Claude y una persona en el mismo mes, ya no se pisan |
| S3 | `efectos_sonido` exige `cliente` sin declararlo | Visto en el conector desplegado: `required: ["cliente"]` sin la propiedad | Deja de obligar a Claude a inventar un parámetro (y un cliente estricto deja de fallar) |
| S4 | `publicar_con_musica` no deja pedir lo que su descripción ofrece para un carrusel | Visto en el conector desplegado: `segundos` sólo admite 7/10/15 y `segundosDeLamina` convierte cualquiera de esos en 3; «alternar» no está en el `enum` | Claude puede pedir 2, 4 o 5 s por lámina |
| S5 | La papelera por MCP no tiene de dónde sacar los IDs | Leído: `ver_estudio` filtra `borrado_at` y no lista carpetas; `recuperar_de_papelera` y `borrar_carpeta` mandan ahí | Recuperar y quitar carpetas funciona sin que la persona pegue IDs |
| S6 | `crear_en_estudio` manda a `generar_imagen`, que no existe en el MCP | Leído: sólo está en el asistente (herramientasChat.js:179) | Claude deja de buscar una herramienta que no tiene |
| S7 | Los reels animados salen sin portada | Leído: el render no pone `portada` ni `portadaMs` salvo que el post tuviera una imagen; el publicador manda `thumb_offset` sólo si existe; el texto del gancho tiene alfa 0 en el cuadro 0 (motorVideo.js:558,598) y nada avisa de un reel sin portada | Con `portadaMs` en el instante en que el gancho ya está entero (sólo si el post no tiene portada), la portada en el perfil enseña el gancho y no sólo el fondo. *Que Instagram usa el primer cuadro sin `thumb_offset` es su documentación, no probado aquí* |
| S8 | Las reglas de estilo del cliente se cortan a 300 caracteres | Leído: `textoDelCliente` (loteAnuncios.js:453); visto en la ficha de D'CASA, que termina a media palabra | Claude recibe enteras las reglas de estilo, locución y hashtags que escribió la agencia |
| S9 | Una pieza sin tipo dice «YA decidido» con el tipo y el nivel vacíos | Leído: `lineaDePieza` imprime «· : » y «nivel: —» (loteAnuncios.js:376-377) bajo una cabecera que dice que está decidido; visto en D'CASA | La ficha dice «sin decidir: escógelo tú» en vez de afirmar algo falso |
| S10 | Fecha imposible aceptada | Leído: `fechaValida` (mcp.js:237) sólo mira el formato; `2026-02-30` pasa | Ya no se crea un día fantasma que no sale en la rejilla |

### 2. Real, pero su efecto no se sabe sin medir

No se toca hasta medirlo con un caso real.

- **Recorte del sonido antes de normalizar** (efectosSonido.js:242,283; sonidoVideo.js:160): el código recorta, pero si
  llega a pasar depende de los niveles reales de la voz y los efectos. Se mide con `escuchar_video` sobre videos ya
  hechos antes de decidir.
- **La ficha de diseño se acorta para caber en 4.000 caracteres**: es a propósito (`ajustarFicha` quita lo
  prescindible y guarda el texto exacto). Si subir el tope mejora la imagen depende de cada modelo: sin probar.
- **El cerebro no aprende de lo que escribe Claude** (`registrarUsos` sólo desde la pantalla): cierto, pero lo
  aprendido mueve el orden de las notas entre ×0,8 y ×1,2. Efecto pequeño; arreglarlo bien pide cuidar que las
  ediciones de Claude no cuenten como correcciones de la persona.
- **Notas internas en `buscar_cerebro` por MCP**: cierto, pero llegan marcadas «INTERNA» y el camino principal
  (`ficha_de_textos`) ya las deja fuera. Añadir `para_publicar` no tiene contrapartida, pero tampoco mucho efecto.
- **El manual de video contradice al animado** (directorVideo.js:27-29): sólo llega cuando la IA de la APP escribe el
  guion (el botón de la pantalla y `recrear` animado) y sólo si la agencia no escribió su propio manual. Por MCP, Claude
  escribe el guion con `formato_video` y no lo recibe. Antes de tocarlo: mirar si el espacio tiene manual propio.
- **El bombeo de la música, el corte en el ataque de la palabra, la escena que sale congelada, los subtítulos fuera
  de la zona**: defectos de código ciertos cuyo efecto es de oído y de vista. Se comparan antes y después en un video
  real antes de decidir.
- **Días pasados en la ficha**: escribir para días que ya pasaron gasta tokens; si la agencia nunca rellena días
  pasados, se quitan. Lo decide la agencia.

### 3. Fuera por ahora

Todo lo que es gusto o diseño de producto sin medir: las reglas de movimiento y de director de los tres repositorios,
los estilos nuevos, el desenfoque de movimiento, las herramientas nuevas (brief, guardar en lote, estado único,
hoja de contactos), reducir o renombrar herramientas, A/B, multiformato, escalar Muse, y la Entrega 9. Pueden ser buenas
ideas; no hay prueba de que mejoren algo.

---

## Resumen: los diez hallazgos que más pesan

1. **✔ La revisión del director de arte nunca corre en las piezas sueltas.** `fichaDelPedido` busca «Pieza:» al
   principio de una línea (`worker/lib/estudio/control.js:51`), pero el pedido compuesto empieza por «Escena: Pieza: …»
   (`src/lib/kitMarca.js:636`). Devuelve "" y el control nunca pone nota de diseño, nunca propone arreglos de diseño y
   nunca corrige solo por debajo de 8. Afecta a todo `disenar_piezas`, al lote, a «Producir el mes» y a
   `crear_en_estudio`. Sólo los carruseles se revisan (`carrusel.js:137` pone «Pieza:» en su propia línea). El test
   (`director.emocion.test.js:86-90`) pasa porque usa una ficha suelta, no un pedido compuesto.
2. **La ficha que escribe Claude llega recortada al modelo de imagen.** `MAX_PROMPT` es 4.000 caracteres para todos
   (`src/lib/estudioCatalogo.js:41`). Con un kit moderado, el pedido ya ocupa ~3.000 sin la escena. Medido: una ficha
   de 1.886 caracteres llega con 1.024 (se pierden Emoción, Fondo, Marca y Evitar). Con un kit rico, llega con 172
   (sólo Pieza y Texto). Kie además corta a ~3.000 (`kie.js:98,103`) y z-image a 1.000 (`:96`), por el final, que es
   donde van la marca y el logo.
3. **✔ Lo que escribe Claude no le enseña nada al cerebro.** `registrarUsos` sólo se llama desde la ruta del navegador
   (`worker/rutas/cerebro.js:198`). Sin `cerebro_usos`, `reforzar` y `registrarCorrecciones` no tienen línea base
   (`worker/lib/cerebro/aprender.js:154-159, 426`). Como ahora casi todo se escribe por el MCP, **el cerebro dejó de
   aprender** de las aprobaciones, las métricas y las correcciones.
4. **✔ El MCP escribe el calendario sin versión.** `guardarDias` (`worker/lib/mcp.js:223-225`) escribe `days` sin
   condición de `updated_at`. Dos `editar_publicacion` en paralelo del mismo mes (lo normal tras `ficha_de_textos`)
   leen lo mismo y la última pisa a la primera, sin aviso. `poner_en_publicacion` espera al Container entre leer y
   escribir, así que ensancha la ventana en la que se pierde lo que guarde una persona. `recrear` (`loMejor.js:607`)
   igual.
5. **✔ `buscar_cerebro` y `leer_nota_cerebro` del MCP no tienen `para_publicar`** (`mcp.js:70-71`, a mano). El
   asistente sí lo tiene (`herramientasServidor.js:117,135`). Claude recibe siempre las notas internas (costos,
   márgenes), también cuando escribe un caption.
6. **Cuando trabaja Claude, el diseño recibe MENOS contexto que con el director de la app.** Al director de imagen no le
   llegan: el estudio de mercado (7 maletas, ángulos, niveles), la estrategia del mes, los campos de la publicación
   (ángulo, forma del gancho, nivel, etapa de pauta, redes), lo que mejor rindió del propio cliente ni los personajes de
   marca. `guia_de_diseno` no lee el post aunque reciba su id.
7. **El sonido se recorta varias veces antes de normalizar** ✔ (`efectosSonido.js:242,283`, `sonidoVideo.js:160`). Y
   la escena empieza justo en el ataque de la primera palabra (`videoEscenas.js:731`): el «whoosh» y el golpe caen
   sobre la primera sílaba, cuando la música todavía no ha bajado (no hay anticipación al bajar la música). La palabra clave queda tapada y,
   si coincide con un pico, distorsiona.
8. **✔ El manual de video contradice al video animado.** `MANUAL_VIDEO_BASE` pide «sin texto dentro del video» y
   «personas reales y luz natural antes que efectos» (`src/lib/directorVideo.js:27-29`), y esas líneas se inyectan en
   el guion animado, cuyo formato entero es letra en pantalla y efectos.
9. **El video no mira ni la estrategia ni los resultados.** `formaGancho`, `angulo`, `pauta`, la red de destino y la
   estrategia del mes no aparecen en ningún archivo de video. Nada de video lee `metricas_publicacion`. Duración (30 s),
   palabras por segundo (2,5) y planos por reel son fijos.
10. **El MCP cuesta 35–45 mil tokens antes de hacer nada y obliga a muchas vueltas.** `tools/list` pesa ~139 KB
    (103 herramientas; video y sonido son el 46 %). Un mes de 20 piezas son 45–60 llamadas y 150–200 mil caracteres
    antes de diseñar; ~70 % de cada `ficha_de_textos` es el mismo bloque fijo reenviado (medido: 21 k caracteres por
    tanda de 5, de los que 15 k son fijos). Cada `editar_publicacion` relee todos los calendarios del espacio.

---

## 1. Errores, por área

### 1.1 Datos y seguridad (MCP)

| # | Qué pasa | Dónde | Caso |
|---|---|---|---|
| D1 ✔ | Escritura del calendario sin versión | `mcp.js:223-225`, `herramientasDiseno.js:540`, `loMejor.js:607` | Dos ediciones en paralelo: se pierde una. Una persona guarda mientras `poner_en_publicacion` espera al Container: se pierde lo suyo |
| D2 ✔ | Sin `para_publicar` en el MCP | `mcp.js:70-71` | Claude escribe un caption con el margen de una nota INTERNA |
| D3 ✔ | El cerebro no aprende de lo que escribe Claude | `rutas/cerebro.js:198` es el único `registrarUsos` | Aprobaciones y métricas no refuerzan ninguna nota |
| D4 | `efectos_sonido` exige `cliente` sin declararlo | `mcp.js:136` (lista de excepciones) | Un cliente MCP que valide el esquema falla; si no, Claude inventa un valor |
| D5 | Fechas imposibles aceptadas | `fechaValida`, `mcp.js:237` | `2026-02-30` crea un día fantasma que no sale en la rejilla |
| D6 | El mes se crea antes de validar la hora | `mcp.js:287` vs `:302` | Hora mal escrita: error, pero el mes ya quedó creado |
| D7 | Herramientas «de lectura» que escriben o gastan | `ver_avisos` con `marcar_leidos` (`herramientasEquipo.js:71,160`), `numeros_del_negocio` con `proponer` | Una persona de sólo lectura escribe / gasta IA |
| D8 | Se ofrecen días pasados para escribir | `seleccionar` (`herramientasTextos.js:341-348`), `casillasSinIdea` (`ideaPublicacionPura.js:44-51`) | El 18-nov la tanda de D'CASA empezó por el 1–8 de noviembre: tokens en días que ya pasaron |
| D9 | Un post sin tipo pierde todo su objetivo | `asignarMatriz` sale pronto sin pilar (`pilares.js:233`); `lineaDePieza` imprime «· : » y «nivel: —» (`loteAnuncios.js:376`) | Medido: las 5 piezas de D'CASA llegaron sin tipo ni nivel, con la cabecera diciendo «YA decidido» |
| D10 | Reglas de estilo del cliente cortadas a 300 caracteres | `textoDelCliente`, `loteAnuncios.js:453,463-465` | El estilo de D'CASA termina a media palabra |

### 1.2 Diseño de imagen

| # | Qué pasa | Dónde |
|---|---|---|
| I1 ✔ | La revisión del director no corre en piezas sueltas (ver resumen 1) | `control.js:51`, `kitMarca.js:636`, `encargos.js:767` |
| I2 | Las piezas 2K en PNG se saltan el control en silencio: >3,6 MB da 413 y el error se traga | `control.js:26,39`, `encargos.js:768` |
| I3 | La ficha de Claude llega recortada (ver resumen 2) | `estudioCatalogo.js:41,947`, `kie.js:96-103`, `carrusel.js:157` |
| I4 | El logo deja de ser la última referencia cuando hay plantilla, pero el pedido sigue diciendo «la ÚLTIMA imagen es el logo» | `encargos.js:75-88`, `meta.js:62-66` |
| I5 | Personajes de marca nunca llegan a las piezas del MCP | `herramientasDiseno.js:118` (sin `personajes`), `:406` (`personajes: []`) |
| I6 | Un `post_id` equivocado se descarta sin avisar: la pieza sólo va a la galería | `herramientasDiseno.js:389` |
| I7 | 16:9 se trata como anuncio y le inyecta lo aprendido de pauta a un banner | `herramientasDiseno.js:62`, `fichas.js:150` |
| I8 | Piezas con problemas graves (precio fuera de catálogo, deformación, sin logo) se ponen igual en el post | `ponerResultados`, `encargos.js:383-436` |
| I9 | «Antes y después» pierde las fotos reales: la receta dice «con las fotos en referencias» y `disenar_piezas` no tiene ese parámetro | `src/lib/recetas.js:136`, `herramientasDiseno.js:84-95` |
| I10 | Probable: en tandas de 3, el director recibe `n` 2 y 3 pero el ejemplo pide `"n":1`; si el modelo no repite el número, la ficha se descarta y se paga otra llamada | `encargos.js:497`, `director.js:457`, `:475` |

### 1.3 Video y sonido

| # | Qué pasa | Dónde |
|---|---|---|
| V1 | La voz se corta justo en el ataque de la palabra, sin pre-roll ni fundido: consonante, 0,8 s de silencio digital, resto de la palabra; clics en el empalme | `videoEscenas.js:731,753`, `renderVideo.js:60-80` |
| V2 | Transición y su sonido caen sobre la primera sílaba de la frase nueva | `efectosColocados.js:316,326` |
| V3 ✔ | Recorte duro a 16 bits por capa antes de la ganancia y el limitador | `efectosSonido.js:242,283`, `sonidoVideo.js:160`, `render.mjs:123` |
| V4 | La música en bucle salta: `i % mm` sin fundido ni compás | `sonidoVideo.js:156` |
| V5 | La música «bombea»: ventanas de 10 ms, sin anticipación ni retención, 11 dB de vaivén entre palabras | `sonidoVideo.js:18,96-129` |
| V6 | El brillo del marcador suena antes de que el marcador aparezca (con revelado por palabra) | `efectosColocados.js:97,351` vs `motorVideo.js:1011-1044` |
| V7 | La subida (riser) de una transición temprana alcanza su pico después del golpe: su inicio se recorta a 0 | `efectosColocados.js:271` |
| V8 | El cuadro 0 sale sin el texto del gancho (alfa 0) y el render no fija portada: TikTok e IG pueden enseñar sólo el fondo | `motorVideo.js:558,598`, `render.js:131,226`, `publicador.js:716` |
| V9 | Una petición de render puede pasar el tope de 40 MB del Container (todo va en base64) y fallar con un mensaje engañoso (sin comprobar en Cloudflare) | `servidor.mjs:67`, `render.js:43-47`, `cuadros.js:28` |
| V10 | La caché de imágenes del Container de vistas no se vacía nunca (~450 MB con 16 fondos 2K en 1 GiB compartido) | `recursos.mjs:55` |
| V11 | Los subtítulos en 9:16 caen donde la revisión dice que el texto no es seguro (71,6–80 % de alto; la zona termina en 76 %) | `motorVideo.js:250-276`, `revisionEscenas.js:55` |
| V12 | La escena que sale se congela durante toda la transición (video, cámara y bucles paran hasta 1 s) | `motorVideo.js:1755,1864` |
| V13 ✔ | El manual de video contradice al formato animado (ver resumen 8) | `directorVideo.js:21-30` → `guionAnimadoIA.js:77` |
| V14 | Sólo se renderiza el primer formato; 4:5 no existe | `render.js:199`, `videoEscenas.js:50` |
| V15 | Más de dos renders a la vez probablemente fallan al arrancar sin reintento (2 instancias; «Producir el mes» lanza hasta 12) — sin comprobar en Cloudflare | `wrangler.jsonc:121`, `contenedor.js:74`, `reelDelMes.js:37` |

Menores: sonido al milisegundo y cortes al cuadro (hasta 33 ms de desfase); ElevenLabs sin `seed` ni
`previous_text`/`next_text` (`elevenlabs.js:102`), así que el timbre cambia entre tomas y no se puede rehacer una sola
frase; fuentes del kit sin ñ/¿/¡ (no comprobado si el canvas cae glifo a glifo).

### 1.4 Desfases del MCP (descripciones que ya no dicen la verdad)

- `crear_en_estudio` manda a `generar_imagen`, que sólo existe en el asistente (`herramientas.js:117`).
- `recuperar_de_papelera` y `borrar_carpeta` (de #271, ayer) dicen que los IDs salen de `ver_estudio`, que no lista la
  papelera ni las carpetas (`herramientas.js:184,195` vs `:616-675`).
- `sonido_video` describe los efectos de antes de #269: «un whoosh en cada transición… y un pop cuando entra un sello»
  (`herramientasVideo.js:265`).
- `publicar_con_musica` ofrece en la descripción «2–5 s por lámina» y «alternar», pero el esquema sólo admite 7/10/15 y
  no tiene «alternar» (`herramientasVideo.js:391-392`); `segundosDeLamina` convierte 7 en 3 sin avisar.
- **Contradicen «PIENSAS Y ESCRIBES TÚ» (16-nov):** `escribir_textos_anuncios` («es MEJOR que escribirlos tú»),
  `proponer_angulos`, `proponer_nota_cerebro`, `crear_publicacion`/`editar_publicacion` (ponen `escribir_textos`
  primero), `comoArreglar` de los avisos (`herramientasTextos.js:234-258`), el cierre de `preparar_mes` (`:566`),
  `revisar_mes` (`:688`), el mensaje de la estrategia (`:639`, `:666`) y el propio `METODO` (`rutas/mcp.js:43-45`).
- Las instrucciones dicen «Instagram, Facebook y TikTok» (falta YouTube); la cabecera de `mcp.js:15` habla de «Publicar
  ya», que no existe; el comentario de `herramientas.js:24` dice 10 s y el límite es 15.
- Las 9 consultas de `mcp.js:66-75` son copias a mano de las del asistente y ya se separaron (así se perdió
  `para_publicar`).

---

## 2. Cuellos de botella

**Del MCP**

- `tools/list` ≈ 139 KB (55 KB descripciones, 68 KB esquemas). Las más pesadas: `guardar_numeros_negocio` 6,4 KB (el
  mismo `anyOf` en cada campo), `ajustar_plan_campanas` 4,9 KB (el hueco dos veces), `mejorar_video` 4,8,
  `crear_en_estudio` 4,4, `disenar_piezas` 4,1, `sonido_video` 4,1.
- `buscar()` (`mcp.js:207`) lee TODOS los calendarios con su `days` en cada edición, movimiento, programación o puesta
  en post; `disenar_piezas` lo llama una vez por pieza, en serie (`herramientasDiseno.js:388`).
  `listar_clientes`, `ver_estudio` (lee todos los archivos para enseñar 22), `ver_cola` (todo el historial) y
  `ver_tareas` sin cliente tampoco tienen límite ni paginación.
- Cuatro maneras de preguntar «¿ya está?» (`estado_trabajo`, `estado_encargo`, `estado_reel`, `ver_video`), ninguna
  espera; `estado_encargo` reconstruye todas las imágenes en cada consulta. El único que espera es
  `programar_lo_aprobado` (`avanzarMientras`, `mcp.js:423`).
- `ficha_de_textos` reenvía el bloque fijo (~15 k) en cada tanda, y el recorte por tamaño reduce las tandas
  (`herramientasTextos.js:466-471`) porque cree que el pedido crece con las piezas.
- Un video animado son 20–30 llamadas: `renderizar_video` devuelve al momento, la voz de ElevenLabs (síncrona) pasa
  igual por la cola, y `editar_escena` devuelve sólo texto (otra `ver_escenas` + `revisar_video` por edición).

**Del diseño**: `PARALELO = 2` y la cadena por pieza es secuencial (generar → recomponer ×2 → control → corregir →
control); `contexto()` lee 300 filas `select *` en el plan y otra vez al confirmar; las miniaturas se piden una a una y
no se guardan; el control manda la imagen entera a Anthropic (dos veces si corrige).

**Del video**: el dibujo corre en un hilo y compite con x264 en 2 vCPU; la maquetación (`repartirEscena`, `medirCapa`)
se recalcula en cada cuadro aunque no depende del tiempo (`motorVideo.js:1585-1621`); el glitch dibuja la escena 10
veces por cuadro; las imágenes se guardan a tamaño original y se escalan en cada cuadro; el audio entero se arma antes
del primer cuadro; el Container duerme a los 30 s (casi todo render arranca en frío y vuelve a subir los clips); cada
`ver_cuadro`/`ver_escenas`/`revisar_video`/`escuchar_video` reconstruye hasta 16 MB de base64 en serie (`escuchar` no
dibuja y aun así recibe las imágenes). Con clips de Kie son tres codificaciones con pérdida; con «mejorar» + montaje,
cuatro.

---

## 3. El director de imagen

**Cómo trabaja hoy (camino de Claude):** `guia_de_diseno` (manual, oficio, kit, catálogo, correcciones recientes, 4
imágenes de plantillas/«Me gusta») → Claude escribe la ficha → `disenar_piezas` compone el pedido (`pieza.js:95-130` →
`kitMarca.js:629`) → encargo → modelo → recomponer si salió en otra proporción → control → acabado en el Container →
galería y post → Claude mira copias de 768 px con `estado_encargo` y corrige con `corregir_pieza`.

**Qué contexto llega a cada decisión**

| Contexto | Director de la app | Claude por MCP | Modelo de imagen |
|---|---|---|---|
| Kit (paleta, estilo, luz, fuente, reglas) | sí | sí | sí |
| Personajes de marca | sólo carrusel | **no** | **no** |
| Cerebro | sí, con una consulta fija (nunca el tema de la pieza) | **no** | — |
| Estudio de mercado (7 maletas, ángulos, niveles, competencia) | **no** (sólo el catálogo) | **no** | — |
| Lo probado en pauta | sólo si va a pauta | **no** | — |
| Lo mejor / lo que rindió del cliente | **no** | **no** (las 4 imágenes son gustos de la agencia, no resultados) | — |
| Estrategia del mes | **no** | **no** | — |
| La publicación (texto, ángulo, gancho, nivel, etapa, redes) | sólo título y brief | **no** (el `post_id` sólo sirve para hallar el calendario) | — |
| Red de destino | **no** | **no** | — |

**Huecos de oficio profesional**

- Zonas seguras (14 % arriba / 20 % abajo) sólo en `MANUAL_DISENO_BASE` (`director.js:50`): si la agencia escribe su
  manual, desaparecen. Nada por red (la columna derecha de TikTok). El logo estampado abajo a la derecha con 4 % de
  margen cae dentro del 20 % inferior de una historia (`logoEncima.js:52-63`), sin variante clara/oscura.
- El color del kit se juzga a ojo por el LLM; no hay comparación numérica ni de contraste del texto.
- Muse da 1024×1280 (4:5) y 1024×1792 (9:16): por debajo de 1080×1350 / 1080×1920, y nada lo escala.
- `crear_en_estudio` con `cantidad` repite el mismo pedido n veces: sólo cambia la semilla, sin eje ni hipótesis.
- Una serie que no es carrusel sólo se une por texto; «Las piezas juntas» (`serie.js`) necesita el navegador.
- `corregir_pieza` no vuelve a pasar el control.

---

## 4. El video

**Lo que hay** — 14 entradas, 4 salidas, 5 bucles; 11 transiciones (6 mueven las dos escenas); 10 fondos (3 vivos);
cámara (acercar, alejar, deriva) con paralaje; viñeta y grano; letra cinética (máscara, cascada, látigo, desenfoque),
revelado por palabra, marcador y subrayado; Ken Burns; buenas curvas de aceleración; 283 efectos con reglas por papel
y familias que rotan; −14 LUFS.

**Lo que se ve amateur**

- La escena que sale se congela en cada transición (V12).
- El tamaño de letra cambia de escena a escena: cada una agranda su contenido hasta ×1,35/×1,55/×1,8 y el ajuste
  encoge en pasos de 6 % (`motorVideo.js:411,688-705`). No hay una escala tipográfica por video.
- La entrada `escala` empieza al 60 % y el llamado a la acción late para siempre (`:562,592`; el montaje lo usa
  siempre): suena a PowerPoint.
- Sin desenfoque de movimiento en las capas: el látigo cruza el 60 % del cuadro en 0,5 s y parpadea a 30 fps.
- Efectos en mono: el whoosh no se mueve con la dirección del empuje.
- El reel por planos no usa nada del vocabulario nuevo: cortes secos, grano 0, placa oscura fija, sin cámara ni gancho
  cinético (`montajeReel.js:167-189`).
- Los ganchos de «mejorar mi video» se encienden y apagan sin animación (`container/unir.mjs:85`).
- Bandas probables en degradados (8 bits, 4:2:0, sin dither cuando el grano es 0) — sin comprobar en un render real.

**Lista de un editor de video corto**

| Qué | Estado |
|---|---|
| Gancho en 1–2 s | parcial: forzado a t=0 pero invisible en el cuadro 0 (V8); nada mide cuándo empieza la voz |
| Cortes al ritmo de la música | sólo en «con tu canción»; con locución no se analizan los golpes de la música elegida |
| Cortes J/L | no: el corte se clava al ataque de la palabra |
| Bajar la música bajo la voz | parcial y con bombeo (V5) |
| −14 LUFS | sí (limitador por muestra, no por true peak) |
| Subtítulos por red y zona segura | un estilo, un perfil 9:16, y fuera de la zona (V11) |
| Interrupciones de patrón / escenas quietas | no |
| B-roll sugerido | no (las capas existen) |
| Rampas de velocidad | no: los clips van siempre a 1× |
| Acercamiento en la palabra de énfasis | no |
| Escala tipográfica constante | rota |
| Kit de marca en el video | sí |
| Varios formatos en un render, 4:5 | no (V14) |
| Tratar la voz (paso alto, compresión, de-esser) | no |
| Música que entra en el drop y cierra en compás | no |

**Cómo decide el director de video:** duración elegida (por defecto 30 s), 2,5 palabras por segundo siempre, número de
escenas a criterio de la IA (o segundos ÷ 4 con estilo), reel por planos de 4–6 planos por costo (~5 s cada uno: lento
para redes), una escena puede hablar hasta 400 caracteres (~26 s) sin regla que lo impida. Usa la idea, el post, el
cerebro, el catálogo, las estructuras y el kit. **Ignora** el gancho y el ángulo del post, la pauta, la red, la
estrategia del mes, los resultados de los reels anteriores y el tempo de la música que de verdad se eligió.

---

## 5. Estrategia y contexto: lo que ve Claude al escribir

**Lo que el MCP no puede pasarle a Claude.** Las piezas del motor que hacen estratégica la escritura se quedaron del
lado de la IA de la app: el planificador del mes (`planificarMes`, el arco), el crítico de 6 puntos (`pedidoDeCritica`,
`motorTextos.js:266-290`) y el arreglo de variedad (`choquesDeVariedad`). Con `ficha_de_textos` Claude escribe en
tandas de 5 sin ver el mes entero, sin rúbrica para revisarse y sin el arco.

**El bucle de aprendizaje está casi cortado**

- Llegan: 3 captions aprobados + 2 que rindieron ≥1,2× (`motorTextos.js:52-112`); `formasQueRinden` sesga en silencio
  la forma del gancho, pero Claude no ve la evidencia.
- Se pierden: los rechazos, los comentarios y las ediciones del cliente (sólo como notas del cerebro si la búsqueda
  acierta); las señales y las reglas propuestas (no hay herramienta); los costos por resultado de pauta;
  `ver_resultados` da el top 5 por interacciones crudas con 100 caracteres, sin id, gancho, ángulo, pilar ni tasa
  sobre alcance: Claude no puede unir resultado con decisión.
- `recrear` y `extraer_guion_ugc` siguen haciendo pensar a la IA de la app y `recrear` deja la pieza «en el próximo día
  libre», sin estrategia, gancho ni ángulo.

**Marcos estratégicos**

- Sí llegan por pieza: pilar, nivel, táctica, forma del gancho, ángulo (si el estudio está aprobado), producto con
  precio, estructura del carrusel, concepto de la semana, fecha especial, etapa de pauta.
- **Claude no puede guardar el objetivo de una pieza**: `editar_publicacion` no acepta `pilar`, `nivel`, `perfil`,
  `deseo`, `producto_id`, `rostro` ni `tactica`/`porque` (los pide la ficha y se pierden).
- Antirepetición: formas de gancho 4 meses, estructuras de carrusel 3; **ideas, títulos y ángulos sólo dentro del mes**.
- Con la estrategia vacía, `estrategia_del_mes` devuelve una línea que empuja a `proponer` (la IA de la app) en lugar
  de darle a Claude el catálogo de objetivos, etapas, semanas y fechas especiales para proponerla él. Las fechas
  especiales no se ven ANTES de escribir la estrategia.
- Conflictos sin señalar (caso real D'CASA): la instrucción del cliente prohíbe «camas desde $49», y el estudio y el
  cerebro lo dicen; un reel sin `rostro` sale como «Reel IA 10 s sin texto» mientras las pautas del cliente piden
  bloques de 30/45 s con texto, y Claude no puede marcar el post como UGC.

---

## 6. Lo que la app hace y el MCP no

103 herramientas visibles. El video animado está casi completo. Lo demás:

| Área | Estado | Qué falta |
|---|---|---|
| Leer una publicación entera | **no** | `ver_calendario` recorta la idea a 300 y caption/guion a 600; no da título, texto de la pieza, hashtags, redes, nota interna, si tiene pieza ni etapa del equipo |
| Editar varias a la vez | **no** | el asistente tiene `editar_publicaciones_lote`; el MCP, una por llamada |
| Campos de la publicación | parcial | `primerComentario`, `colaboradores`, `textoFacebook`, `hashtagsEnComentario`, `altTexto`, `audioNombre`; historia (`historiaTambien`, `historias`, `historiaRetraso`); equipo (`responsableId`, `etapa`, `repetir`); tipo y matriz (`rostro`, `pilar`, `pilarSub`, `producto`, `productoIds`, `nivel`, `deseo`, `perfil`); UGC (`formulaUgc`, `duracionUgc`, `ganchosUgc`, `audioUgc`) |
| Comentarios internos, notas e historial del mes | no | — |
| Resolver los cambios que pidió el cliente | no | sólo se leen |
| Reintentar una publicación que falló | no | `POST /publicar/:id/reintentar` |
| Producción de todo el espacio | no | `GET /publicar/aprobadas` |
| Plan semanal, días fijos y fechas especiales | **no** | se usan pero no se ven ni se cambian |
| Kit: reglas, paleta, presets, plantillas, fuente | parcial | `guardar_regla` existe en el asistente, no en el MCP |
| Estudio de mercado | parcial | no se puede **aprobar el borrador**: los ángulos que propone el MCP nunca se usan |
| Crear en el Estudio | parcial | `ver_estudio` anuncia `resolution`, `imageSize`, `sonido`, `calidad`…, pero `crear_en_estudio` sólo pasa `formato` y `duracion`; faltan 2:3, 3:2, 4:3, 5:4, 21:9; `estilo` no acepta los presets propios del kit; en `disenar_piezas` es una lista fija de 7 |
| Galería | parcial | 12 últimas + 10 videos; sin búsqueda, páginas, papelera, carpetas ni favoritos |
| Cancelar o reintentar trabajos y encargos | **no** | un trabajo atascado no tiene salida |
| Control de calidad a demanda, «Las piezas juntas» | no | — |
| Video animado | casi | borrar un proyecto, voces de la biblioteca, muestra de color |
| Biblioteca de sonido | parcial | favorita, BPM, etiquetas, borrar |
| Cerebro | parcial | borrar nota, aceptar/descartar reglas propuestas, ficha técnica, importar de GitHub |
| Ventas semanales | **no** | `numeros_del_negocio` cita la tasa de ventas, pero no se pueden leer ni apuntar |
| WhatsApp y voz de los clientes | parcial | sólo leer el kit |
| Campañas | parcial | pausar y presupuesto (crear está congelado por decisión) |
| Auditorías de perfil, Biblioteca de anuncios, historias automáticas, Drive | **no** | — |
| Gasto de IA, presupuesto, saldos de Kie y ElevenLabs | **no** | Claude no puede mirar antes de un pedido caro |
| Equipo e invitaciones | no | razonable que se queden fuera |

**Solapamientos que confunden a Claude:** tres «estado_*» y `ver_video`; imagen por tres caminos
(`crear_en_estudio`, `disenar_piezas`, `recrear`); seis maneras de hacer video con nombres que no dicen cuál es cuál
(`crear_video`, `plantilla_video`, `video_con_cancion`, `publicar_con_musica`, `crear_reel`, `montar_reel`); tres de
revisar video; el catálogo en tres sitios; `post_id` en dos herramientas y `publicacion_id` en diecisiete.

---

## 7. Lo que traemos de fuera (tres repositorios, 2026-11-19)

Se leyeron tres repositorios que se recomiendan «para editar video con Claude». Ninguno se ejecutó. **Ninguno se instala
en el calendario**: los tres corren en una máquina con terminal, y la agencia trabaja en claude.ai por el MCP. Se
extraen técnicas y reglas, reescritas con nuestras palabras, y se meten en el motor que ya hay (canvas + ffmpeg + el JSON
de escenas validado).

| | Qué es | Licencia | Qué traemos |
|---|---|---|---|
| **rea-video** (JuneYaooo) | Desarma un video de referencia toma por toma: si es grabado, IA o código, cortes, ritmo, efectos, subtítulos, y un plan para rehacerlo por modelo. Python + OpenCV + ONNX, en local | Apache-2.0 | El «por qué funciona» de cada toma (papel narrativo, gancho, trucos con su segundo), cortes y ritmo medidos antes de preguntar a la IA, efectos y textos con su segundo, juntar tomas en las menos generaciones según el modelo, lectura por capas. No transcribe español ni da informes en español |
| **HyperFrames** (HeyGen) | Motor de video por HTML: Chrome graba cuadro a cuadro, ffmpeg codifica. Maduro (0.9.70, ~2.200 tests, en producción en HeyGen) | Apache-2.0 (GSAP, su librería de animación, no es abierta: no se copia) | Las reglas de movimiento con números (salidas 40–50 % más cortas, solape, curva por papel, títulos quietos), zona segura de 9:16 (texto entre 168 y 1330 px, nada bajo los botones), subtítulos (grupos de 2–3 palabras, nunca a 0 s, placa ajustada), comprobaciones (`dead_stretch`, texto pequeño, cuadro 0 vacío, video mudo), reglas de sonido (pico un cuadro después, rotar tomas), lo que delata un video de IA y las bandas en degradados oscuros |
| **lemo-opuscar** (LemoLab) | 99 estilos de película para Claude Code: cada video es código a medida en Chrome, la mezcla en Python. GPU para lo 3D, sin tests | Código MIT. **Documentos CC BY-NC desde la v2.0 (12-nov)**; hasta `9eb7739` (10-nov) todo era MIT. Lo que se tome sale de `9eb7739`, con nuestras palabras y su aviso MIT. No es asesoría legal | Transición con las dos escenas vivas que empieza 0,1–0,15 s antes del corte, ducking con retención (baja ~150 ms antes de la voz, 8–10 dB), paneo según la dirección, −14 LUFS con pico real y un solo limitador, desenfoque por 5 submuestras sólo en lo rápido, revisión de lectura, hoja de contactos, las reglas del director (gancho en 3 s, una idea y un giro, dos silencios antes del giro, acelerar acortando escenas, no subtitular lo escrito, traducir «más premium» en decisiones) y cuatro estilos (suizo, keynote oscuro, pictograma, noticia con subtítulo) |

**Para el equipo, fuera del calendario (opcional):** HyperFrames como laboratorio en Claude Code
(`claude plugin install hyperframes@hyperframes`, con `HYPERFRAMES_NO_TELEMETRY=1`) para comparar calidad; lemo-opuscar
sólo para una pieza de marca puntual, clonado a mano y fijado en un commit (su instalador se actualiza solo desde `main`
cada vez y Claude sigue lo que diga ese archivo). Ninguno conoce el kit, el cerebro ni el calendario: lo que salga se
sube con `subir_a_galeria`.

---

## 8. El plan completo, por entregas

Cada entrega es un pull request que se despliega sola, en este orden. Las herramientas nuevas son propuestas: su nombre
final se decide al hacerlas. Lo que no se pueda probar contra el servicio real se dice al entregar (regla de oro 15).

| # | Entrega | Tamaño | Qué cambia para quien trabaja |
|---|---|---|---|
| 1 | Arreglos que no se ven | S | Nada que aprender: las piezas salen revisadas, nada se pisa, lo interno no se cuela |
| 2 | Revisión y método del video | S–M | `editar_escena` y `revisar_video` dicen qué está mal y en qué segundo |
| 3 | Menos vueltas y menos tokens | M | Un mes se hace con la mitad de llamadas y sin esperar a mano |
| 4 | El brief estratégico y lo que funcionó | M | Claude escribe y diseña sabiendo para qué es cada pieza y qué le funcionó al cliente |
| 5 | Sonido profesional | M | Los videos suenan mezclados, sin bombeo ni distorsión, sin hacer nada |
| 6 | Movimiento con intención | M–L | Transiciones vivas, letra estable, cuadro 0 con gancho, cuatro estilos nuevos |
| 7 | Diseño de nivel agencia | M | Fichas que llegan enteras, zonas seguras, variantes A/B con hipótesis |
| 8 | Referencias y recrear | M | Desglosar un video de la competencia dice por qué funciona, y recrear lo escribe Claude |
| 9 | Paridad que falta | M | Lo que hoy sólo se hace en la pantalla, también por Claude |

### Entrega 1 — Arreglos que no se ven (S)

1. **La revisión del director corre en todo** (I1): `fichaDelPedido` reconoce «Escena: Pieza:», con un test que use un
   pedido compuesto de verdad. **Control sobre una copia JPEG de 1568 px** (I2) para que las 2K también se revisen.
2. **El MCP escribe con versión** (D1): `guardarDias` con `updated_at` como condición y reintento, también en `recrear`;
   la historia encajada se calcula antes de leer.
3. **`para_publicar` en el MCP** (D2): las consultas del MCP salen de las del asistente, con `true` por defecto al escribir.
4. **El cerebro vuelve a aprender** (D3): `registrarUsos` al guardar por MCP, con las fuentes que dio la ficha.
5. Pequeños: `cliente` en `efectos_sonido` (D4), fecha que exista (D5), hora antes del mes (D6), anotar como escritura
   `ver_avisos`/`numeros_del_negocio` (D7), días pasados fuera (D8), logo siempre la última referencia (I4), avisar del
   `post_id` desconocido (I6), no poner en el post piezas con fallos graves (I8), 16:9 no es anuncio (I7).
6. **Descripciones al día** (§1.4) y alineadas con «PIENSAS Y ESCRIBES TÚ».

### Entrega 2 — Revisión y método del video (S–M)

1. **Revisión de oficio**, pura, en `src/lib/revisionEscenas.js`, devuelta por `editar_escena` y `revisar_video` con el
   formato «t=4,2 s · dónde · problema → cambio exacto», ordenada por gravedad:
   - texto que no se alcanza a leer (calibrado para reel, no para película) o que nunca está entero en cuadro;
   - escena de más de 3 s sin cambio; nada quieto más de 1 s en el gancho;
   - texto por debajo del 2,6 % del lado corto; más de ~5 palabras por línea;
   - cuadro 0 sin el texto del gancho; primera palabra después de 0,3 s; subtítulo a 0 s;
   - misma entrada, transición o fondo seguidos; más de un tercio de cortes secos;
   - escena que habla más de lo que cabe; video de más de 15 s sin sonido.
2. **Hoja de contactos** por MCP (`hoja_de_video`): un cuadro cada 1–2 s en una imagen, más una tira de 0,2 s del
   momento que se pida. El Container ya tiene `/hoja`.
3. **El método del director de video**, en pocas líneas (vigilando tokens): `MANUAL_VIDEO_BASE` partido en común + por
   formato (arregla V13), y en `videoFormatoIA.js`/`guionAnimadoIA.js` las reglas de §7 (lemo `9eb7739` y HyperFrames):
   gancho en 3 s sin logo, una idea y un giro, un movimiento firma, transiciones con causa (3–5 tipos), cada acción con
   su sonido, dos silencios antes del giro, acelerar acortando, no subtitular lo escrito, salir diseñado y no fundido,
   la lista de lo que delata una IA, y la tabla «más premium / más joven / como nuestra marca» → decisiones.

### Entrega 3 — Menos vueltas y menos tokens (M)

1. `ficha_de_textos` con huella del bloque fijo (`ya_tengo`): ~70 % menos por tanda.
2. **`guardar_textos`**: hasta 30 posts en una escritura con versión y una sola revisión, con los campos de objetivo
   (`pilar`, `nivel`, `perfil`, `deseo`, `producto_id`, `rostro`, `tactica`, `porque`) y los de publicar.
3. **`ver_publicacion`** entera.
4. **Un solo `estado`** para cualquier id (trabajo, encargo, reel, render, voz) con `esperar_segundos` hasta ~20;
   `renderizar_video` y la voz de ElevenLabs esperan dentro de la llamada. Se retiran `estado_encargo` y `estado_reel`.
5. `tools/list` a la mitad: tipos compartidos, la letra pequeña del video en `formato_video`/`efectos_sonido`, agrupar
   versiones, estilos y estructuras.
6. `buscar(postId)` sin leer todos los `days`; límites y paginación en galería (con papelera y carpetas), cola, tareas y
   banco.

### Entrega 4 — El brief estratégico y lo que funcionó (M)

1. **`brief_de_pieza`** (por post o por mes), para escribir, diseñar y hacer video: texto, idea, guion, pilar, nivel,
   deseo, perfil, ángulo, forma del gancho, táctica, pauta, redes y formato; productos con sus fotos; objetivo y ofertas
   del mes; ángulos del estudio; los 3–5 posts propios que mejor rindieron con su miniatura; 3 referencias de la
   competencia; y «CONFLICTOS:» en una línea.
2. **«Lo que funcionó y lo que no»**, armado solo: medianas por forma de gancho, ángulo, pilar, formato, horario y nivel
   (normalizadas por alcance), aprobaciones frente a cambios pedidos con las palabras del cliente, señales del equipo,
   costo por resultado de pauta. Diez líneas dentro de la ficha, la guía de diseño y el brief de video.
3. **El mes para Claude**: la ficha con mes devuelve primero todas las casillas y el método del planificador;
   `guardar_plan_mes` guarda el arco y las tandas lo llevan. **`revisar_textos`**: los 6 criterios del crítico y los
   choques de variedad, gratis. **`estrategia_del_mes` con `metodo: true`**.
4. El video recibe `formaGancho`, `angulo`, pauta, red, estrategia y el resumen de los reels anteriores; duración y
   palabras por segundo por red y objetivo, no fijas. Antirepetición contra los 2–3 meses anteriores.

### Entrega 5 — Sonido profesional (M)

1. El corte de escena en el hueco antes de la palabra, silencio a mitad del hueco con fundidos de 5 ms (V1, V2).
2. **Mezcla en coma flotante** con un solo limitador al final, −14 LUFS y pico real ≤ −1 dBTP medido tras el AAC (V3).
3. **Ducking con anticipación y retención**: baja ~150 ms antes de la voz, se queda entre palabras, 8–10 dB (V5).
4. Música que entra en el tiempo fuerte (salta la intro), bucle con fundido en compás, cierre en compás (V4).
5. Efectos: pico un cuadro después de la imagen, rotar 2–3 tomas, paneo según la dirección del movimiento; arreglar V6
   y V7. Cortes J/L: el sonido de la escena siguiente entra 0,2–0,4 s antes.
6. Rejilla de golpes para los videos con locución: `/golpes` sobre la música elegida y cortes al golpe más cercano
   (±120 ms, moviendo sólo silencios).
7. Tratar la voz: paso alto, compresión suave, de-esser.

### Entrega 6 — Movimiento con intención (M–L, por partes)

1. **Transiciones vivas** (V12): la escena que sale se dibuja en su tiempo real y la transición empieza 0,1–0,15 s
   antes del corte; curvas espejadas en la unión; tres transiciones nuevas: «dip cut», «blur swap», inundación de color.
2. **Curvas por papel**: llegada `expo.out`, cámara `power2.inOut`, salida `power3.in`; salidas al 50–60 % de la
   entrada; solape al 30–50 %; escalonado por palabra 60–120 ms. Títulos quietos al llegar: fuera el latido del llamado
   y la entrada desde el 60 %.
3. **Una escala tipográfica por video**: titular al 4–9 % del alto, apoyo al 2,5–4 %, suelo de 28 px; el ajuste encoge
   el video entero, no escena por escena; «cortar palabras, nunca encoger».
4. **Desenfoque de movimiento** por 5 submuestras sólo en látigo, empuje y transiciones con movimiento.
5. **Zona segura y subtítulos de 9:16** (V11): texto entre 168 y 1330 px, nada bajo los botones; subtítulos en grupos
   de 2–3 / 3–5 / 4–6 palabras según la energía, uno a la vez, placa ajustada. **Cuadro 0 con el gancho** ya armado y
   portada fijada (V8).
6. **Cuatro estilos nuevos** en `estilos_video`: suizo, keynote oscuro, pictograma y noticia con subtítulo.
7. Bandas: evitar degradados lineales oscuros a pantalla completa; acento ≥ 15 %; dither cuando el grano es 0.
8. El reel por planos usa transiciones, cámara y gancho cinético del animado. Velocidad del render, audio por `PUT`
   (V9), caché de imágenes con tope (V10), reintento al arrancar (V15), varios formatos y 4:5 (V14).

### Entrega 7 — Diseño de nivel agencia (M)

1. Presupuesto de pedido por modelo, bloque de marca compacto cuando hay ficha, y enseñarle a Claude la ficha **tal como
   llegará** al modelo (I3).
2. Zonas seguras por formato y red en el código; logo estampado fuera de la interfaz de 9:16, con variante clara/oscura.
3. Variantes A/B por eje con hipótesis, etiquetadas en la galería para compararlas con las métricas.
4. La rúbrica y el resultado del control en `estado`; control después de `corregir_pieza`; `rehacer_pieza` (una vez).
5. Personajes de marca y `referencias` en `disenar_piezas` (I5, I9).
6. Paleta numérica contra el kit, contraste del texto, Muse escalado a ≥ 1080.

### Entrega 8 — Referencias y recrear (M)

1. `deconstruir_video` con una **segunda capa «por qué funciona»**, aparte de la descripción objetiva: el papel de cada
   toma (enganchar, contexto, prueba, giro, cierre, llamado), el gancho de los primeros segundos y 2–4 trucos con su
   segundo y su porqué.
2. **Cortes medidos** en el Container (detector de escenas de ffmpeg) antes de preguntar a la IA, y **ritmo medido**
   (`/golpes`: BPM y qué parte de los cortes cae en el golpe). Efectos y textos con su segundo.
3. Lectura por capas: primero el resumen; cada toma, a pedido.
4. `crear_reel` junta tomas seguidas en las menos generaciones que admita cada modelo de Kie.
5. `recrear` y `extraer_guion_ugc` con modo «sólo el brief»: el calendario prepara, Claude escribe.

### Entrega 9 — Paridad que falta (M)

Plan semanal y fechas especiales (ver y guardar), aprobar el estudio de mercado, `guardar_regla_de_marca`, ventas
semanales, cancelar o reintentar trabajos y publicaciones, gasto de IA y saldos, resolver los cambios que pidió el
cliente, comentarios internos del mes.

---

## 9. Cómo se usa después del despliegue

Se sigue trabajando igual: en claude.ai, con el conector del calendario, pidiendo en palabras. Lo que cambia es lo que
Claude recibe y lo que el calendario hace solo.

### Lo que mejora sin hacer nada

- Toda pieza pasa por la revisión del director (nota, arreglos de diseño y una corrección automática por debajo de 8).
- Dos personas, o Claude y una persona, pueden trabajar el mismo mes sin pisarse.
- Los videos que ya están se vuelven a renderizar con la mezcla nueva, las transiciones vivas y la zona segura.
- El cerebro vuelve a aprender de lo que aprueba el cliente y de lo que rinde, también de lo que escribió Claude.

### Hacer un mes («hazme diciembre de D'CASA»)

1. `estrategia_del_mes` con `metodo: true` → Claude propone la estrategia con las fechas especiales, el catálogo y lo
   que funcionó el mes anterior → la persona dice que sí → se guarda.
2. `preparar_mes` → `ficha_de_textos` del mes: la primera vez trae todas las casillas y «lo que funcionó»; Claude planea
   el arco y lo guarda con `guardar_plan_mes`.
3. `ficha_de_textos` por tandas (el bloque fijo, una sola vez) → `guardar_textos` con la tanda entera → los avisos.
4. `revisar_textos` (los 6 criterios, gratis) → Claude corrige → `revisar_mes`.
5. Diseño: `brief_de_pieza` del mes → `guia_de_diseno` → Claude escribe las fichas → `disenar_piezas` → `estado` con
   espera → Claude mira las piezas con la nota del director y rehace una si hace falta.
6. `enlace_del_cliente` para mandarlo a aprobar.

Hoy son 45–60 llamadas y 150–200 mil caracteres antes de diseñar; la meta es la mitad.

### Hacer un video animado («un reel de 20 s del colchón Ortopédico para pauta»)

1. `brief_de_pieza` del post: gancho, ángulo, etapa de pauta, red y lo que les funcionó en reels anteriores.
2. `formato_video` (con las reglas nuevas) y `estilos_video` (con los cuatro nuevos) → Claude escribe el guion →
   `crear_video`.
3. `editar_escena` devuelve la revisión («t=0,0 s · gancho · el cuadro 0 está vacío → que entre ya puesto») → Claude
   corrige → `hoja_de_video` para ver todo el ritmo en una imagen.
4. `sonido_video` (el ducking, el paneo y el volumen final ya son automáticos) → `escuchar_video` mide → la persona
   escucha los momentos que se le indiquen.
5. `aprobar_video` → `renderizar_video` espera hasta tener el mp4 → queda en el post con su portada.

### Recrear algo que funciona («haz algo como este reel de la competencia»)

1. `subir_a_galeria` o `ver_lo_mejor` → `deconstruir_video`: el resumen con el por qué funciona, los cortes y el ritmo
   medidos; las tomas, a pedido.
2. `recrear` en modo brief → Claude escribe la versión del cliente con su estructura y no su contenido →
   `crear_reel` (planos juntados según el modelo) o `crear_video`.

### En la pantalla

Los mismos arreglos se ven en la aplicación: la nota del director en la galería, la revisión de ritmo en el editor del
video, los estilos nuevos en la lista y el sonido nuevo en cada render. Nada de esto pide configurar algo.

---

## 10. Sin comprobar

- El tiempo límite de una herramienta en claude.ai (el riesgo es `proponer_nota_cerebro` con `saber_del_rubro`, que
  busca en la web uno o dos minutos dentro de la petición).
- Cómo responde Cloudflare con el tercer render a la vez (V15) y a un cuerpo de más de 40 MB (V9).
- Si los modelos repiten el `n` de la ficha (I10).
- Las bandas en degradados y el relleno de glifos sin ñ en `@napi-rs/canvas`.
- Los límites reales de longitud de pedido de cada proveedor de imagen (para subir `MAX_PROMPT` por modelo).
