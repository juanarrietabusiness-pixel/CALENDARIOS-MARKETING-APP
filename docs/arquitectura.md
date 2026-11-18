# Arquitectura: el árbol archivo por archivo

Lo que hay en cada archivo de `src/`, `worker/`, `container/` y `tests/`. Búscalo con grep antes de crear un archivo
nuevo (casi siempre ya hay uno que hace la mitad) y añade la línea del tuyo al crear uno.

```
src/
  App.jsx                 Enrutado (App) + puerta de acceso (Panel) + estado (Workspace)
  constants.js            Formatos, estados, planes, meses, categorías
  utils.js                Fechas, IDs, compresión de imágenes, escapado, iniciales
  api.js                  Llama a las funciones del servidor (IA y ADN)
  index.css               Sistema de diseño: tokens y clases base
  hooks/useDialogA11y.js  Foco atrapado, Escape y bloqueo de scroll en diálogos
  hooks/useConfigIA.js    El modelo y el razonamiento del espacio, releídos con `pulso`
  hooks/useAnchoAmplio.js ¿Pantalla ancha? (asistente acoplado, panel a dos columnas)
  hooks/useAltoVisible.js Lo que se ve de la pantalla con el teclado abierto (el asistente flotante mide eso)
  hooks/useEquipo.js      Los miembros del espacio (para «Lo lleva», menciones, carga)
  hooks/useTareas.js      Todas las tareas y sus acciones (marcar, pasar a hoy, mover, convertir notas):
                          las comparten Mi día y el panel lateral
  hooks/useLoMejor.js     Leer una ventana de «Lo mejor», releer con los avisos y clasificar sólo lo que se ve sin tipo
  hooks/useRepaso.js      ¿Toca el repaso de la mañana? (una vez al día por persona)
  hooks/useBancoIdeas.js  El banco de ideas único: leerlo entero, añadir, cambiar (agrupado), asignar empresa, quitar
  hooks/useArrastrarOrden.js  Ordenar una lista arrastrando y con flechas (Hoy de Mi día y del panel de tareas)
  hooks/useAjustada.js   La imagen como saldrá en su red (el lienzo de `vistaAjuste`, recordado): la vista previa de cada red y la
                          cuadrícula de «Ver el mes como se verá»
  lib/
    filas.js              Conversores fila ⇄ aplicación
    auth.js               Sesión, inicio y cierre
    db.js                 Llama a /api/*; conserva todas sus firmas
    equipo.js             Miembros, invitaciones y perfil propio
    rutas.js              Slugs, análisis y construcción de direcciones (puro)
    pestanas.js           Las barras de pestañas: el id de cada pestaña y de su panel, y las teclas (puro)
    semaforoKit.js        El SEMÁFORO del kit: qué le falta a un cliente para que el diseño salga bien (logo, fotos del
                          catálogo, plantillas, «Me gusta», ficha técnica, voz), con su arreglo; el aviso de una pieza (puro)
    semaforoKitApi.js     Lo de GET /api/estudio para el semáforo, recordado dos minutos por cliente
    contextoADN.js        Qué del ADN viaja a la IA al escribir (sin la maquetación de Meta AI)
                          y cómo se parte el contexto para la caché de prompt (puro)
    cerebro.js            Cliente de /api/cerebro (notas, buscar, importar, preparar ficha)
    cerebroVista.js       La pestaña Cerebro: tipos, filtros, lo que se lee siempre y los grupos por archivo, frases de
                          resultado, documentos (puro)
    datosCerebro.js       «Datos que no cuadran»: teléfonos y correos de la ficha, las cifras, la ficha del cliente y las
                          memorias que ninguna nota dice (puro; también el Worker)
    markdownSimple.js     Una nota en Markdown partida en bloques para pintarla sin HTML inyectado (puro)
    cerebroCliente.js     La generación con cerebro: texto estable, qué buscar por tanda (puro)
    cerebroGrafo.js       El mapa 3D: modelo, colores por tipo, filtros, búsqueda, vecinas (puro)
    cerebroLayout.js      Dónde queda cada nota dentro del cerebro (lóbulos, hemisferios; puro;
                          portado de layout3D de Agents Office)
    cerebroAprendizaje.js Lo que aprende el cerebro de lo que pasa después de escribir: cuántas
                          señales, qué frase decir tras cada botón (puro)
    camara3d.js           Cámara de órbita y proyección a pantalla (puro; sustituye a OrbitControls)
    estudioCatalogo.js    El Estudio: modelos (Google, fal.ai, Higgsfield), ajustes, costo estimado,
                          validar un pedido, ordenar/filtrar la lista, papelera (puro; también lo
                          importa el Worker)
    sinPreguntar.js       «Crear imágenes sin preguntar»: CONFIRMAR_DESDE (0,50 $), el tope del espacio, ¿se pregunta este
                          pedido? (sólo imágenes, con el modelo del cliente, dentro del tope; otro motor sugerido se
                          pregunta) y sus frases (puro; también el Worker)
    sinPreguntarApi.js    El tope del espacio desde la pantalla (recordado un minuto), el «¿Sigo?» con el ajuste delante y
                          «No volver a preguntar» (lo enciende el administrador)
    estudioHiggsfield.json  Los modelos de Higgsfield (también los que siguen un video), GENERADOS de su esquema: no se edita a mano
                          (`node scripts/estudio/generar-higgsfield.mjs`)
    estudioMercado.js     El estudio de mercado: catálogo (productos y precios), lo general (perfiles con el trabajo que le
                          encargan y cuánto les pesa, deseos de Reiss, nivel de consciencia y, opcional, lo que hay detrás
                          de la compra: problema por fuera y por dentro, cree/necesita, antes y después, cómo la justifica,
                          lo gastado, la competencia indirecta y los anuncios del rubro), las 7 maletas por producto con
                          sus ÁNGULOS DE VENTA (3–5, con ganchos y público frío o tibio), ganchos por nivel, textos de
                          anuncio, referencias de la competencia; pedidos a la IA, notas y documento (puro; también el Worker)
    mercado.js            Cliente de /api/mercado (también el contenido de la competencia y traer un enlace de Instagram)
    lenguajeCliente.js    «Lenguaje del cliente»: el material numerado (lo pegado, la competencia, la Bandeja, la encuesta,
                          la nota de ahora), comprobar que cada frase esté TAL CUAL en él (sin mayúsculas, tildes ni
                          espacios de más; devuelve el trozo original), contar cuántos la dicen, ocultar las marcas de la
                          competencia («otra marca»), la nota del cerebro y lo que leen el estudio y los ángulos (puro)
    competencia.js        El contenido de la competencia en Instagram: el código de un enlace, ordenar por lo que funcionó, el @
                          de la página pública de «insertar» (puro; también lo importa el Worker)
    inspiracion.js        Inspiración: las cuentas fijas de cada cliente (10, competencia o inspiración; lee los @ sueltos de
                          antes), «rinde X× su promedio» (mediana de la cuenta), filtrar el feed, avisos, de una publicación a una
                          idea con REFERENCIA, YouTube por enlace, el resumen «Lo que funciona en tu competencia» (puro; también el Worker)
    inspiracionApi.js     Cliente de /api/inspiracion
    loMejor.js            «Lo mejor del momento»: la clave de una pieza, la señal de cada fuente y su PERCENTIL, la ventana, la cifra
                          de la tarjeta, los tipos (sin limitarse) y cómo se recrea cada uno, la clasificación, el próximo día libre
                          (puro; también el Worker)
    loMejorApi.js         Cliente de /api/lo-mejor (leer, clasificar, recrear con su costo, traer, «Crear con Claude», créditos)
    referenciasPost.js    Los archivos de REFERENCIA de una publicación (`post.referencias`): aparte de `medios`, no se publican
    consciencia.js        Niveles de consciencia (Schwartz) y deseos de Reiss: pequeño, para el bundle principal
    ugc.js                UGC · guion para grabar: tramos «[0–3 s] VOZ: «…» | SE VE: … | TEXTO: …», duración (15–60 s, 2,5
                          palabras/s), ganchos, copiar voz y tomas; transcribir un video y adaptarlo; la «Voz UGC» de cada
                          cliente; «Guiones para grabar» (los UGC sin video y el mensaje de la sesión) (puro; también el Worker)
    formulasUgc.js        Las ESTRUCTURAS DE GUION de la agencia (antes «fórmulas UGC»): para qué sirve cada una (`para`: UGC y/o
                          voz en off), limpiar, repartir en cualquier duración, la línea para la IA, que la IA escoja y diga
                          cuál, sacarla de un video transcrito o de una voz en off que salió bien (puro; también el Worker)
    formulasUgcApi.js     Cliente de /api/formulas-ugc (= /api/estructuras-guion; también «proponer» desde una voz en off)
    videoCorto.js         Guiones de video de 8 s (Veo por fal) o 10 s (Omni): gancho, beneficio y cierre; el pedido
                          al modelo sin texto largo ni logo (puro; también lo importa el Worker)
    videoProducto.js      La receta «Video del producto» (10–15 s): tramos, el guion con la voz en español, las escenas del
                          primer fotograma y del cierre, el prompt corto del video (puro; también el Worker)
    videoEscenas.js       El VIDEO ANIMADO (escenas dibujadas con código): el formato de escenas v1, `validarGuion`, la línea
                          de tiempo anclada a palabras (`lineaDeTiempo`, `tiempoDeCapa`) y el ciclo del proyecto (puro;
                          lo leerán el motor de Canvas, el Worker y el render del Container). Ver docs/formato-escenas-v1.md
    motorVideo.js         El MOTOR del video animado: dibuja el instante t de un guion en un Canvas 2D (paleta del kit,
                          posiciones, entradas, salidas, bucles, transiciones, fondo, grano; y el movimiento gráfico:
                          transiciones que mueven las dos escenas, fondos vivos, cámara, viñeta, letra cinética y
                          resalte; sus pruebas en movimientoGrafico.test.js). Puro y determinista: lo comparten la
                          vista previa y el render del Container
    motorPiezas.js        Las PIEZAS del motor: iconos dibujados, cifra que cuenta, el dibujo libre (formas), los fondos de
                          estrellas y líneas, quitar el fondo liso del logo y su tono (puro: navegador y Container)
    motorComponentes.js   Los componentes del video animado que eran marcador: lista (escalonada), burbuja, reloj, antes y
                          después, teléfono (puro: navegador y Container; el motor le pasa sus ayudantes)
    personajeVideo.js     El PERSONAJE del video animado dibujado con código (bebé, niño, adulto; 5 expresiones, 6 poses) y su
                          aspecto por cliente (`kit.personajeVideo`) (puro: navegador y Container)
    motorTexto.js         El TEXTO CON CARÁCTER del video animado: *énfasis*, el rol «gigante» (cada línea a todo el ancho),
                          palabra por palabra con lo que se dice, y la LETRA DE LA CASA (Anton, `@fontsource/anton`: el mismo
                          archivo en el navegador y en el Container) (puro: mide; lo dibuja motorVideo.js)
    estiloVideo.js        El KIT contado a la IA que escribe el guion de un video animado: la paleta en TOKENS del motor, estilo,
                          letra, nunca, reglas, lo aprendido, logo, música y el ESTILO DEL VIDEO obligatorio (`kit.estiloVideo`) (puro)
    fondosVideo.js        Las IMÁGENES DE FONDO por sección: los fondos por crear (capas imagen con «pide» y sin archivo),
                          ponerlos en el guion, las reglas para la IA y lo que recibe el director (puro; también el Worker)
    estilosVideo.js       Los ESTILOS DE VIDEO guardados de un cliente (`kit.estilosVideo`): sacar las reglas de un video que salió bien
                          (`estiloDeGuion`), contarlas a la persona y a la IA (`resumenDeEstilo`, `lineaDeEstilo`) e imponerlas a otro
                          guion (`aplicarEstilo`) sin tocar lo que se dice ni lo que se lee (puro; también el Worker)
    estilosVideoApi.js    Cliente de /api/videos/<c>/estilos y de «Guardar como estilo» / «Aplicar» de un video
    golpes.js             El RITMO de una canción: el BPM y los golpes por energía (envolvente de ataques, picos, autocorrelación)
                          y el «pulso» de una capa (puro: Container, Worker y pantalla)
    motorVideoNavegador.js  Lo que ese motor necesita en el navegador: las imágenes de la galería, el logo, la letra del kit
                          y la textura del grano (no es puro)
    videosApi.js          Cliente de /api/videos/<cliente>
    videoCancion.js       «Video con tu canción»: la letra (limpiar, líneas, coro), leer la sincronía de ElevenLabs o Gemini y
                          alinearla a la letra, el ajuste fino, las palabras del guion contra la canción (`palabrasParaLinea`),
                          si sigue valiendo, la prueba de sincronía (`guionKaraoke`), `comprobarLetra`, lo que dura un audio
                          (MP3, WAV, M4A) y el costo aproximado (puro: Worker, Container y pantalla)
    cancionApi.js         Cliente de /api/videos/<cliente>/cancion (sincronizar, crear el borrador, ajuste fino, volver a sincronizar)
    subtitulos.js         Los SUBTÍTULOS por palabra: grupos por trozos de frase y parejos, la palabra clave, qué está dicho,
                          diciéndose o falta en cada instante (puro: lo leen el motor, la vista previa y el render)
    renderVideo.js        El RENDER a mp4: los cuadros, la voz en tramos con los silencios insertados (copiando muestras), la
                          ganancia a -14 LUFS, cuándo se puede renderizar (puro: lo leen el Container, el Worker y la pantalla)
    sonidoVideo.js        Lo que suena DEBAJO de la voz (aparte del guion): limpiar el sonido del video, la música con ducking,
                          fundido y repetida (puro: Worker, Container y pantalla)
    conMusica.js          «Publicar con música»: el guion de UNA escena que sale de una foto (a sangre, con su movimiento y su
                          duración, sin habla), de post a reel con la foto de portada y «Volver a la foto», la música por
                          defecto (puro: Worker, render y pantalla)
    cancionesInstagram.js Las canciones de Instagram de cada cliente (`kit.musica.cancionesInstagram`) y la sugerida sin repetir
                          la última usada (puro y sin importaciones: también lo lee el kit)
    conMusicaApi.js       Cliente de POST /api/videos/<c>/con-musica y de seguir su render (lo carga ConMusica.jsx)
    musica.js             La música con SUNO por Kie: modelos V6, el pedido limpio, el cuerpo de createTask, leer las dos
                          pistas, el costo (puro; también el Worker)
    directorMusical.js    El DIRECTOR MUSICAL: lo que el código cuenta del video (BPM por los cortes, silencios, momentos), el
                          pedido a la IA con la música de la marca delante, leer su propuesta (sin artistas) y el respaldo (puro)
    efectosSonido.js      Los efectos del video animado: leerlos (`muestrasDeEfecto`), su pico (`picoDeEfecto`) y el AUDIO POR
                          PISTAS (`armarSonido`: voz, música y efectos; cada efecto nivelado contra la voz y contra la música del
                          segundo de antes, con techo bajo la voz; la música baja antes de un golpe); el whoosh, el impacto
                          (golpe y glitch) y el pop sintetizados son el respaldo (puro: el Container)
    efectosColocados.js   Los EFECTOS COLOCADOS: la lista de efectos anclados a un evento (escena, capa, palabra o segundo), las
                          REGLAS de cada papel medidas por earshot (alinear por arranque o pico, adelanto, dB sobre la música,
                          rachas, bajada de la música) y los automáticos como lista (puro: Worker, Container y pantalla)
    catalogoEfectos.js    El CATÁLOGO DE EFECTOS de la aplicación (283 MP3 en public/efectos/v1: earshot, MIT; uisfx, CC0): buscar
                          por papel o palabras (puro; sus datos pesan 80 kB: sólo Worker, Container y un chunk perezoso)
    catalogoEfectos.datos.js  Los datos del catálogo, GENERADOS por scripts/efectos/armar-catalogo.mjs (no se editan a mano)
    escucharSonido.js     ESCUCHAR SIN OÍDOS: con las pistas sueltas y los tiempos de cada palabra, el informe (cada efecto
                          frente a la voz y la música, qué palabra pisa, lo que se tapa o compite, densidad, huecos, volumen y los
                          5 momentos para una persona) y su texto (puro: el Container en /escuchar)
    bibliotecaSonido.js   La BIBLIOTECA DE SONIDO (música y efectos de cada cliente y de la agencia): la categoría por el modelo,
                          limpiar nombre, etiquetas, BPM y duración, el orden (la música de la marca primero) y qué pista encaja
                          con lo que propone el director musical (`pistasQueEncajan`) (puro: Worker, herramientas y pantalla)
    sonidosApi.js         Cliente de /api/sonidos (subir y medir lo que dura de su dirección, cambiar, quitar, copiar)
    revisionEscenas.js    La revisión antes de renderizar: subtítulos que tapan, texto que se sale o se parte, fuera de la zona
                          segura, capas encimadas; el instante «lleno» de cada escena (puro: mide con el lienzo que le dan)
    videoFormatoIA.js     El formato de escenas v1 contado a una IA (`formato_video`), sacado del mismo vocabulario que valida,
                          con un ejemplo NEUTRO que un test exige que valide (puro)
    voces.js              La VOZ del video animado: ElevenLabs v3 (principal) y v2, directo o por Kie, las voces de serie y las propias
                          del kit, el costo exacto, el texto que se manda y los tiempos de cada palabra en tres capas (del
                          motor, verificados al oírla, estimados sobre la duración del MP3) (puro; también el Worker)
    videoProductoEstudio.js  La receta en el Estudio: qué modelo, los dos fotogramas por el camino de una pieza, el video
    reelPedidos.js        Los PEDIDOS del reel por planos sin pedir nada (fotograma, video, clip, qué modelos): los arman la pantalla
                          y el encargo del servidor igual (puro; lib/reelEstudio.js los re-exporta)
    duracionesVideo.js    Las duraciones del reel POR RUTA con las llaves que hay: «uno» (un video que hace esa duración) o «clips»
                          (un clip por plano y el montaje); ya no hay «sólo Flow» (puro; también el Worker)
    montajeReel.js        «Montarlo aquí»: de los clips (o el video) de un reel al guion de un video animado (el clip a sangre, lo
                          que se dice, el gancho, los subtítulos, el logo y el llamado) y el guion del post por tramos (puro)
    encargoReelPuro.js    El reel como encargo, lo que comparten pantalla y Worker: salidas, fases del montaje, cómo se lee (puro)
    resultadoEnPost.js    Lo que el servidor pone SOLO en una publicación: el video en su sitio, y caption, guion y portada si
                          estaban vacíos (puro)
    guionVideo.js         La base común de todo guion de video: el guion que YA tiene la publicación, el producto, el criterio y
                          la marca, en las mismas líneas (puro)
    temporada.js          Las fechas especiales del cliente que se acercan (sin las delicadas) y cuál merece el aviso del mes (puro)
    modosFoto.js          Los atajos de «¿Qué quieres?»: modos de foto de producto y la versión de temporada (puro)
    portadaClic.js        «Portada que da clic»: 16 conceptos, el titular que se lee a 120 px, la escena por formato (puro)
    revisionVideo.js      «¿Está listo este video?»: los criterios, el pedido al motor que lo ve y el veredicto (puro; también el Worker)
    deconstructor.js      «Desglosar toma por toma»: el pedido para que el motor VEA un video y lo describa sin opinar
                          (ficha técnica, lo que se repite, el mapa de secuencia, el montaje), su lectura (tomas contiguas,
                          la cuenta, el ritmo de los cortes, sin palabras de valor), el texto y el mapa RESUMIDO que sigue un
                          guion (`resumenDeSecuencia`) (puro; también el Worker)
    pedidoVideo.js        Los pedidos a un modelo de video, cortos y en orden fijo (lo fijo, sujeto → acción → luz → cámara →
                          movimiento → sonido) y su recorte al revés si pasan de 1.000 (`armarPedidoVideo`; un storyboard,
                          `limiteDeStoryboard`): el clip, el video con storyboard y el del producto (puro)
    listoAnimar.js        «¿Listo para animar?» del storyboard: los cuatro criterios, el pedido a la IA que mira los fotogramas,
                          el veredicto (lo pone el código) y su frase (puro; también el Worker)
    piezasJuntas.js       «Las piezas juntas»: la rejilla de la hoja del mes, el pedido a la IA y su lectura (puro; también el Worker)
    hojaPiezas.js         La hoja de «Las piezas juntas»: las imágenes del mes numeradas en un JPEG (lienzo)
    revisionVideoApi.js   Cliente de /api/estudio/<c>/revisar-video y /serie (fuera de lib/estudio.js, que arrastra el catálogo)
    portadas.js           Las piezas del perfil por plantilla: estilos de portada, colores del kit, medidas (puro)
    materialTipo.js       Qué busca el cerebro según el TIPO de contenido, qué material falta (testimonios, garantía, equipo,
                          diferenciador, saber del rubro) y el pedido de la nota «Saber del rubro» (puro; también el Worker)
    pilares.js            Los 6 tipos de contenido de la agencia (+ Contenido humano), el ritmo semanal por
                          cliente, las sugerencias de temporada y la matriz (tipo × producto × nivel × deseo × perfil) (puro)
    estrategiaMes.js      La estrategia del mes (objetivos, etapas del embudo, el pedido a la IA y su lectura) y el BALANCE del
                          mes (formatos, tipos, niveles, productos y sus avisos) (puro; también lo importa el Worker)
    plantillasPlan.js     Las plantillas de plan: 3 objetivos × 3 negocios de arranque, juntar con lo guardado, la del
                          cliente, la línea que lee la IA (puro; también lo importa el Worker)
    plantillasApi.js      Cliente de /api/plantillas-plan
    recetas.js            Las RECETAS: el cómo de una pieza como dato (las de la casa, juntar con las de la agencia), el pedido
                          de «Crear con Claude» (handoff), el mensaje «/receta …» y lo que lee Claude (puro; también el Worker)
    recetasApi.js         Cliente de /api/recetas y «Crear con Claude» (guarda el pedido, copia el mensaje, abre claude.ai)
    kitMarca.js           El kit de marca del Estudio: paleta, el bloque de marca (va en toda pieza), un preset
                          por tipo de contenido + los propios, el acabado, componer el pedido, el logo de
                          referencia, pedidos a la IA (puro; también lo importa el Worker)
    aprendizajeVisual.js  Lo que el kit aprende de los «Me gusta» y la papelera del Estudio: el pedido a la IA, las
                          guardas de las reglas, `kit.aprendido` en el bloque de la marca (puro; también lo importa el Worker)
    anclasEstilo.js       Las REFERENCIAS DE ESTILO de la marca (`kit.anclas`, hasta 6): limpiar, el aviso de lo que parece una
                          persona o una marca, las sugerencias de la casa y la línea corta que va en toda pieza (puro)
    kitDesdeImagenes.js   «Preparar desde imágenes» (moodboard): el pedido a la IA que MIRA de 3 a 10 imágenes de la galería, su
                          lectura (sólo lo visual) y `fundirMoodboard` (no toca presets, logo, reglas ni plantillas) (puro)
    variacionesAnuncio.js «Variaciones para anuncios»: de 3 a 5, qué cambia cada una (gancho, ángulo, composición, fondo,
                          detalle, encuadre), el encargo del director con la pieza maestra y el nombre de su carpeta (puro;
                          también el Worker)
    loteAnuncios.js       La producción en lote: las casillas (niveles, matriz deseos × perfiles × niveles, tipos),
                          la forma de cada pieza, el pedido y su lectura, la escena, la publicación y qué
                          composiciones funcionan con cada cliente (puro; también el Worker)
    loteEstudio.js        Cómo se arma cada pieza del lote (`pedidoDeLote`, lo que lee el director) y `ponerTexto` (la
                          compuesta recuerda su cruda: «Otra versión» sobre ella); los carruseles y reels del lote
    mejoraVideo.js        «MEJORAR MI VIDEO», «VARIOS ÁNGULOS» y «NUEVOS GANCHOS»: los modos (color, escalar, look, cambiar,
                          ángulos, alargar, ganchos, entrada y cierre con IA), nuestros LOOKS y ÁNGULOS, qué modelo edita según
                          lo que dura, el costo, los prompts y las VERSIONES de la unión (`planDeMejora`) (puro; Worker y MCP)
    coloresVideo.js       Los COLORES de «Mejorar mi video»: grades con filtros de ffmpeg, sin IA (puro; también el Container)
    plantillasVideo.js    PLANTILLAS de movimiento gráfico: el guion v1 de «Respondo tu comentario», «Búsqueda», «Producto que
                          salta» y «Logo sobre fondos», armado por el código (`guionDePlantilla`) (puro; también el Worker)
    loteServidor.js       El lote que lleva el SERVIDOR: armar cada pieza como paso (`pasoDeLote`, con «{{ESCENA}}») y
                          lanzarlo; un carrusel del lote (`lanzarCarruselDeIdea`)
    encargosApi.js        Los encargos desde el navegador: pedir, seguir (`seguirEncargo`), lanzar un carrusel, terminar lo
                          que necesita lienzo (`terminarPaso`, una vez) y, al abrir la app, lo que quedó (`terminarPendientes`)
    laminaPedido.js       El pedido de UNA lámina completo (`armarLamina`): lo usan la pantalla y el servidor (puro)
    encargos.js           Los encargos del Estudio, lo compartido con el Worker: el hueco de la escena, topes y cómo se
                          cuenta cada pieza en pantalla (puro)
    edicion.js            Editar una imagen ya hecha: el pedido, con qué modelo, la proporción (puro; también el Worker)
    estructurasCarrusel.js  Las estructuras de un carrusel (errores, mitos, paso a paso…): rotar por tipo sin repetir (puro)
    formasGancho.js       Las FORMAS DE GANCHO de la agencia (22, con palabras propias: cómo, niveles, voces, tipo, si piden
                          un dato real, si sirven en pauta, dónde van) y los ganchos visuales del primer segundo de un reel;
                          cuál toca a cada pieza (`formaPara`, `formasParaGanchos` para las 3 de una UGC), lo que se aprende
                          de los resultados del cliente (`aprenderFormas`) y las reglas del gancho: cifra que no está en
                          ningún sitio y frases de miedo (`problemasDelGancho`) (puro, sin importaciones; también el Worker)
    loteMes.js            El lote del MES completo: días por el ritmo y la temporada y su plan (puro; también el Worker)
    ideasEstudio.js       «Dame ideas» del Estudio: el plan (tipo, composición, producto), el pedido y su lectura
                          (puro; también lo importa el Worker)
    ideasFormato.js       «Dame ideas» de carrusel (tema + guion por láminas) y de reel IA (idea central) (puro; también el Worker)
    director.js           El DIRECTOR CREATIVO: su manual (el de la casa y el de Ajustes), la ficha de diseño, asegurar el texto
                          exacto, el pedido por tandas y su lectura, lo que el asistente sabe para diseñar (puro; también el Worker)
    disenoChat.js         Las herramientas de diseño del asistente: el plan y su costo, crear de 3 en 3, las imágenes que vuelven al
                          modelo, corregir, la versión final, lo que funciona (lazy)
    herramientasDiseno.js Las definiciones de esas herramientas (fuera de api.js: el bundle principal está en su tope)
    historiasEstudio.js   Las 3 historias del post por el Estudio: el director escribe su texto, el modelo del cliente, el control
    promptImagen.js       El pedido de la imagen de un post, YA LISTO (`promptImagen` + la huella `promptImagenDe`): lo escribe
                          el motor de ideas y «Crear con IA» / «Crear la imagen aquí» no esperan a «Mejorar idea» (puro)
    ideaPublicacion.js    «Generar» la idea de UNA publicación vacía por el camino del lote (modo «publicacion»): el pedido y
                          `rellenarConIdea` (sólo lo vacío)
    reglasFormato.js      QUÉ LLEVA CADA FORMATO, una sola regla (historia: ni guion, ni caption, ni hashtags; reel: sin texto en
                          la pieza; hashtags siempre aparte): la leen el motor, la completitud y el panel (puro, carga inicial)
    camposTexto.js        Lo que le FALTA a una publicación por el motor (modo «campos»): la casilla, el pedido, su lectura y
                          ponerlo (sólo rellena; el campo de su botón se reescribe); lo que le falta (`camposQueFaltan`,
                          `textosQueFaltan`), los campos de su botón (`camposConSuBoton`) y el concepto de su semana
                          (`conceptoDelDia`) (puro; también el Worker)
    escribirTextos.js     El cliente del modo «campos»: un campo («IA» del panel y del banco), lo que falta del mes
                          («Completar», «Generar con IA» de la lista, «Planificar mes») (en diferido)
    ideaPublicacionPura.js  Lo PURO de la idea de una publicación (ideaPublicacion.js lo reexporta: importa ./db): las casillas
                          sin idea, lo que ya hay en el mes, `rellenarConIdea` y `conIdea` (la idea del motor en su
                          publicación, como el paso de las ideas del asistente del mes) (puro; también el Worker)
    planMes.js            «Planificar mes» sin trampas: semanas = filas de la rejilla, el borrador por cliente y mes, los días
                          ocupados y la publicación que sale del plan con la ficha de diseño ya pagada (puro)
    cicloVentas.js        El CICLO DE VENTAS del curso de campañas: las 4 etapas (presentación, evaluación, conversión, ascensión)
                          con sus alias de antes (`idEtapaCiclo`), tipos de negocio, destinos y cuenta (puro; carga inicial)
    cicloNegocio.js       Qué pieza va en cada etapa según el negocio y el destino (`CICLO_POR_NEGOCIO`, `cicloDe`, `OBJETIVOS_CICLO`):
                          la tabla del curso con palabras propias y lo deducido; se importa de AQUÍ, no de cicloVentas.js (puro)
    tiposArte.js          Los 10 TIPOS DE ARTE (enlazados a COMPOSICIONES, PILARES y etapas) y los 6 SESGOS (con su táctica del
                          gancho); `lineaDeTiposArte` para el director y el motor de ideas (puro; también el Worker)
    maletas.js            El SEMÁFORO de las 7 maletas por producto (verde, ámbar, rojo; «si falta una, no lances»),
                          `maletasQueFaltan` para el plan de campañas, el resumen y la tarea «Pedírselo al cliente» (puro)
    pauta.js              LO QUE VA A PAUTA: `post.pauta` (etapa del ciclo, nivel, cómo se monta, `auto`) y `post.anuncio` (3–5 textos,
                          títulos, descripción, botón), la regla del anuncio que lee la IA (con la tabla del ciclo del negocio), qué
                          se marca solo (tipo «Anuncio» y la oferta del mes) y la revisión de anuncio con sus arreglos (puro; también
                          el Worker)
    tresQ.js              La REVISIÓN 3Q de lo que corre en el Ads Manager: cifras con las métricas del curso, Q1 frente al
                          número mágico (30/14/7 días), Q2 con umbrales, Q3 (qué hacer y a dónde ir), efecto desglose,
                          aprendizaje, cuándo se pausa, la etapa de cada campaña, lo grave del cron (puro; también el Worker)
    umbrales3q.js         Los umbrales de la revisión 3Q (los del Manual de campañas) y su limpieza (puro, pequeño)
    alertas3q.js          LO QUE SE VE DÍA A DÍA en la revisión 3Q, sobre la serie diaria de Meta: el ritmo de gasto frente al
                          plan del mes, el destino que falla (clics sin conversaciones, o menos por clic con el CTR igual), el CPM
                          fuera de lo normal (de fuera o suyo), el anuncio que se cansa y el formato que se lleva casi todo; lo
                          grave para el cron (puro; también el Worker)
    revision3qApi.js      Cliente de /api/anuncios/clientes/<c>/revision, /etapas y /revision/pendientes
    planCiclo.js          El PLAN DE CAMPAÑAS (curso, entrega 6): las campañas del ciclo (presentación y evaluación en una cuenta
                          nueva, las cuatro con historial, y la de TEMPORADA si el mes trae oferta o fecha comercial), su
                          presupuesto (la inversión de los números del negocio × el reparto del Manual; en la campaña o en los
                          conjuntos), los conjuntos con públicos y exclusiones, qué pieza va en cada anuncio (ordenada por lo que
                          se aprendió de sus anuncios), la guía de montaje, las 5 hojas del Excel de estrategia y el texto (puro;
                          también el Worker)
    manualCiclo.js        Lo del Manual que lee el plan: el reparto por etapa (60/20/10/10, que sume 100), el de un cliente a
                          mano (`repartoDelCliente`) y los anuncios por conjunto (3–6) (puro)
    anunciosPlan.js       Los ANUNCIOS del plan de campañas: «¿Qué vas a hacer?» (campañas, productos, lo que se quiere lograr), lo
                          decidido de cada hueco de anuncio (publicación escogida o «anuncio nuevo», cómo se monta, sus textos), el
                          pedido de sus textos a la IA y su lectura, «Cambiar» (cualquier publicación del cliente) (puro)
    textosNivel.js        Cómo se le habla a cada NIVEL de consciencia en un anuncio y la regla de 100 (qué nivel lleva cada anuncio
                          de una campaña; el tipo de lo que se produce para un nivel) (puro; también el Worker)
    xlsx.js               Un .xlsx sin librería: SpreadsheetML mínimo sobre lib/zip.js (puro)
    lotePauta.js          El lote del Estudio abierto por la dirección: ?lote=mes, ?lote=pauta (el plan de campañas) y
                          ?lote=anuncios (la revisión 3Q) (puro)
    planCicloApi.js       Cliente de /api/anuncios/clientes/<c>/ciclo
    enPauta.js            «Cerrar el ciclo» (entrega 7): qué publicación del calendario es cada anuncio (el creativo frente al id
                          que guardó la cola), lo que se guarda en `anuncios_clientes.en_pauta`, «En pauta · etapa · costo», y
                          «Para pautar» (lo orgánico que rindió y no corre) (puro; también el Worker)
    aprenderAnuncios.js   Qué tipo de arte, nivel, composición y etapa salen más baratos para un cliente, con muestra mínima
                          (`preferenciasDeAnuncios`: lo leen el motor de ideas, el director y el plan de campañas) (puro)
    enPautaApi.js         Cliente de /api/anuncios/clientes/<c>/en-pauta y /para-pautar (lo de un cliente, 2 min)
    kitWhatsApp.js        El KIT DE WHATSAPP BUSINESS de un cliente: limpiar (atajos, etapas del ciclo, guiones casados con el
                          catálogo), el pedido a la IA y su lectura, los PRECIOS que pone el código ({precio}, {precios}, {oferta}),
                          los avisos (cifras fuera del catálogo, garantía que el estudio no tiene, «[completar: …]»), volver a
                          proponer sin pisar lo editado y «Copiar todo» (puro; también el Worker y la herramienta kit_whatsapp)
    vozCliente.js         «La voz de tus clientes»: las preguntas (una obligatoria), limpiar lo que manda quien responde (trampa
                          para robots), el resumen, el enlace y los mensajes (puro, sin importaciones: la página pública lo carga)
    vozAlEstudio.js       «Llevar al estudio»: el pedido a la IA, la propuesta comprobada (testimonios sólo con permiso y con sus
                          palabras) y ponerla en el borrador del estudio (puro; aparte porque arrastra el estudio de mercado)
    whatsappApi.js        Cliente de /api/whatsapp y /api/publico-voz
    numerosNegocio.js     Los NÚMEROS DEL NEGOCIO de un cliente (cada dato con su origen) y las tres calculadoras de la agencia,
                          con sus mismas cuentas: objetivo (la Calculadora de presupuesto), equilibrio (deeplook, «todo el
                          negocio» y «sólo la pauta»), el Simulador (5 modos y 3 escenarios), el número mágico con su alarma y
                          lo que propone la IA (puro; también el Worker)
    negocioApi.js         Cliente de /api/anuncios/clientes/<c>/negocio (leer, guardar con `antes`, proponer)
    ventasSemana.js       «Tus ventas de la semana»: el lunes de Panamá, la ventana del cliente (3 semanas) y la de la
                          agencia (8), limpiar lo que llega, la tasa de cierre MEDIDA (cada semana de ventas con las
                          conversaciones de la anterior, 4 semanas), el ROAS real de WhatsApp, «sin medir desde…» y el
                          mensaje de los lunes (puro; también el Worker)
    ventasApi.js          Cliente de /api/ventas y /api/publico-ventas
    embudo.js             Los objetivos del mes, las etapas del ciclo de ventas (las de antes, por alias) y la estrategia guardada (pequeño: lo lee la tarjeta de
                          la campaña; estrategiaMes.js lo reexporta) (puro)
    control.js            El CONTROL DE CALIDAD de una pieza: el pedido a la IA (que la mira), comparar el texto palabra por
                          palabra (con tildes), el veredicto, la corrección quirúrgica del texto (puro; también el Worker)
    controlEstudio.js     Controlar y corregir: la pieza al terminar (lote, carrusel, «Producir el mes», compositor), editar
                          SÓLO el texto mal escrito de la misma imagen y quedarse con la mejor
    muestraFuente.js      La fuente de la marca en el navegador: registrarla para el lienzo y dibujar su muestra
    revisionIdeas.js      La revisión interna de las ideas: cuáles se revisan, cuáles están aprobadas por dentro (puro)
    sistemaCarrusel.js    El sistema de diseño de la portada de un carrusel (titular, zona del texto, márgenes, colores): el
                          pedido a la IA que la mira, su lectura y la línea que va en cada lámina y en el control (puro)
    zip.js                Un ZIP sin comprimir hecho en el navegador («Descargar el carrusel»), con su CRC-32 (puro)
    logoEncima.js         El logo ESTAMPADO: modos, esquinas, `posicionLogo` (puro, también lo lee el kit) y el lienzo
    logoEstudio.js        Estampar el logo y subir la pieza nueva a la galería; `conLogoSiToca` para lote, carrusel y mes
    acabadoLienzo.js      El texto de la plantilla y el logo ENCIMA de una pieza, dibujados en un contexto ya creado (puro: lo
                          comparten la pantalla y el Container, POST /acabado)
    recrear.js            «Recrear un anuncio»: el análisis en pocas líneas, la versión de partida y lo que va al
                          compositor (el anuncio sólo por su forma, las fotos del producto delante) (puro)
    otraVersion.js        «Otra versión» y «Recrear con mi marca» de un medio de la PUBLICACIÓN: se hacen ahí y ocupan
                          su sitio; «Recrear un anuncio» en imagen y «Generar en 4:5 con IA» (todo por el servidor) (lazy)
    piezaServidor.js      UNA pieza (o unas pocas) con las reglas del lote: el pedido listo como encargo del servidor
                          (proporción, control con su corrección, logo estampado), seguirlo y devolver la final
    marcaDeHoy.js         Un pedido de antes con la MARCA DE HOY: cambia el bloque de la marca, el acabado y el logo por los
                          del kit actual y acorta la escena, nunca el final (puro)
    visorEstudio.js       «Otra igual», «Otra versión distinta» y «Editar» del visor, por el servidor (lazy: el chunk del
                          Estudio está en su tope); también el «Crear» del compositor (`pedirDelCompositor`)
    pestanasPanel.js      Las pestañas del panel de una publicación (Idea · Pieza · Publicar) y lo que pedían las de antes (puro)
    ponerPiezas.js        «Poner en una publicación…» desde el Estudio: a qué publicación (de cualquier mes) y el pedido (puro + API)
    piezaChat.js          La imagen o el video que pide el asistente, por el Estudio con el kit del cliente; la imagen, con el
                          director y por el servidor (lazy)
    referencias.js        Qué se toma de cada imagen de referencia (estilo, composición, producto…), la foto
                          REAL del producto (y si es de otra marca), el producto que nombra la idea (puro)
    galeriaPura.js        Lo PURO de la galería que necesitan la pantalla y el Worker: fotos de un producto, piezas de un
                          carrusel en orden, poner piezas en un post, igualar el texto (lib/estudio.js lo re-exporta)
                          y la regla de la PORTADA de un reel al poner piezas (`postConPiezas` con `como`)
    estudio.js            Cliente de /api/estudio y lo puro de la pantalla: filtros (también «Usadas / Sin usar»),
                          trabajos en curso, carruseles y reels agrupados en una tarjeta (`agruparGaleria`),
                          de una publicación al Estudio y del Estudio a una publicación
    vivo.js               WebSocket: reconexión, latido, presencia
    horas.js              «9am» → «09:00» y vuelta; la hora que se TECLEA («930», «21:30») (puro)
    conversaciones.js     Las conversaciones del asistente: título (el de la IA y el provisional), orden, cuándo (puro;
                          también lo importa el Worker)
    conversacionesApi.js  Cliente de /api/chat/conversaciones y la última abierta por navegador (sólo lo carga el chat)
    herramientasChat.js   Las herramientas del navegador que se le declaran al asistente (`getChatTools`; fuera de api.js:
                          la carga inicial está en su tope)
    asistentePost.js      El asistente DENTRO de una publicación: qué herramientas le quedan, la guarda del post_id y lo
                          que sabe del post (puro)
    turnoChat.js          Recuperar una vuelta del asistente que se cortó (teléfono bloqueado, pestaña atrás) (en diferido)
    bancoIdeas.js         El banco de ideas ÚNICO: vistas (de este cliente, generales, todas), referencias (enlace limpio,
                          red, formato sugerido), la idea nueva, filtrar, la fila de D1 (puro; también lo importa el Worker)
    bancoIdeasApi.js      Cliente de /api/banco-ideas y abrir «Guardar referencia» desde cualquier sitio
    dictado.js            El micrófono del asistente: escucha hasta que se vuelve a pulsar, se reenciende si el
                          navegador lo corta, cada frase una vez, lo provisional aparte (SR inyectado)
    idioma.js             La regla del español latino neutro, puesta en toda llamada de texto (puro)
    estadoChip.js         Qué dice el chip del mes: miniatura, icono de estado, idea (puro)
    youtube.js            Cliente de /api/redes/youtube (conectar, enlace, elegir canal, privacidad)
    lote.js               Editar muchas publicaciones de una vez (puro)
    exportarContenido.js  Texto de «Exportar ideas y descripciones» (puro)
    completitud.js        Cuánto le falta a una publicación; qué le falta a una SIN contenido para ir al cliente (puro)
    carrusel.js           El carrusel por láminas: partir el guion, el pedido de cada lámina, sus referencias, los
                          colores y las líneas de la plantilla de texto (puro)
    carruselEstudio.js    Crear las láminas en el Estudio una a una (la anterior y la portada de referencia)
    textoSobreImagen.js   La plantilla: el texto exacto encima de la lámina, con los colores del kit (lienzo)
    produccion.js         «Producir el mes»: qué semanas y qué días, de lunes a domingo o por fecha (puro)
    revisionMes.js        «Revisar el mes»: reglas (precio fuera del catálogo, competencia, fecha delicada, voseo,
                          sin llamado a la acción, hashtags), arreglar el voseo, el pedido de la revisión con IA (puro)
    agenda.js             «Mi día»: hoy, atrasos, periodos de las recurrentes (puro;
                          también lo importa el Worker)
    semanaTareas.js       «Mi día» por semanas: los días fijos de cada empresa, en qué día va cada tarea, qué cambia al
                          soltarla en una empresa (puro)
    foco.js               La empresa en foco de cada persona, por día
    configIA.js           Nombres de modelos y niveles de razonamiento (puro)
    mensajeChat.js        Marcas del chat: piezas, imágenes, videos, contexto (puro)
    medios.js             Fotogramas de video, imagen para la IA, descarga a tamaño
    drive.js              Id de carpeta a partir del enlace, tipo y tamaño; el plan de «Guardar en Drive»: carpetas
                          Mes / Semana, nombres de pieza, qué subir y qué quitar (puro; también lo importa el Worker)
    guardarDrive.js       Guardar una publicación en Drive por tandas (llama al Worker)
    buscar.js             Lo que encuentra el buscador Ctrl+K (puro)
    resumenCliente.js     Por aprobar / con cambios / a medias; mes por defecto (puro)
    publicacion.js        Qué se publica, límites de cada red, qué ve el cliente, a qué
                          hora sale (puro; también lo importa el Worker)
    cola.js               La cola de publicación resumida para la rejilla y el panel, la
                          página Programación y «Programar lo aprobado» (puro)
    vistaMes.js           «Ver el mes como se verá»: qué entra en la cuadrícula del perfil y en qué orden, el feed del mes, qué está
                          LISTO para programar sin la aprobación del cliente (y por qué no lo demás), la confirmación y los detalles
                          de cada publicación (puro; también el enlace del cliente, «Así se verá tu perfil»)
    historiasAuto.js      Historias automáticas: ajustes, qué día toca (Panamá), qué se prepara, cuál sale, la carga
                          de la cola y las frases (puro; también lo importa el Worker)
    vigenciaHistorias.js  ¿Sigue sirviendo una historia automática? Las reglas (felicitaciones, días especiales, promociones, meses
                          y fechas nombradas), lo más restrictivo de reglas e IA, el pedido a la IA que MIRA la historia (puro; también el Worker)
    historiasRepost.js    La historia de un post ya publicado, dibujada: la imagen encajada en 9:16 y su frase (lienzo)
    historiasAutoApi.js   Cliente de /api/historias-auto y preparar lo que falte (también sola, al abrir la aplicación)
    resultados.js         De las filas de métricas a cifras, formatos, horarios (puro)
    colores.js            Colores y logo de la marca a partir del ADN (puro)
    semanas.js            La vista de lista por semanas: agrupar, resumen, cuál se abre (puro)
    campanas.js           La campaña del mes y de cada semana: semanas de la rejilla, el pedido a la IA
                          y su lectura (puro)
    fechasEspeciales.js   Feriados de Panamá, comerciales e internacionales (Pascua y Carnaval
                          calculados) + lo que elige cada cliente; el pedido a la IA (puro)
    subir.js              «Subir»: formato deducido, redes por defecto, rellenar lo vacío con
                          la propuesta de la IA, poner o mover una publicación de día (puro)
    repetir.js            «Post que se repite»: las reglas (semana, n.º día del mes, último, número), qué le toca a un
                          mes y la copia como idea (puro)
    notasSemana.js        La NOTA FIJA de cada día de la semana («los lunes, muebles y camas»): limpiar, la de una fecha, el
                          producto que nombra, ponerla en las casillas del motor de ideas (puro; también el Worker)
    planSemanal.js        El plan semanal ÚNICO de la empresa (formato, tipo, HORA y nota de cada día; `clients.plan_semanal`):
                          leerlo (también lo de antes), la barra de los días, guardarlo con las columnas de antes derivadas,
                          volver al estándar, la hora del plan de una publicación (puro; también el Worker)
    asistenteMes.js       El asistente del mes: los 5 pasos, el paso que le toca a un mes, las casillas del plan semanal,
                          ponerlas en el calendario, las horas en bloque, `opciones.asistente` (puro)
    asistenteMesApi.js    Cliente de /api/estudio/<c>/reel/mes (los reels del mes: costo y lanzar)
    aprobacion.js         Qué aprueba el cliente (idea o pieza final; la «idea» del sistema se va con la pieza, sólo
                          la que escoge una persona se queda), qué cuenta de su respuesta, por programar / por
                          producir, cambios tras aprobar, contar como pieza la idea aprobada que ya tiene archivo
                          (puro; también lo importa el Worker)
    trabajo.js            Equipo: menciones, las 4 etapas que salen solas (`detalleEtapa`, `marcarEnviadas`), qué ve el
                          cliente con revisión interna, historial (qué cambió) y carga (puro; también lo importa el Worker)
    informeRedes.js       Qué redes entran en el informe mensual: limpiar, ¿entra?, describir (puro; también el Worker)
    programarAprobadas.js Preparar imágenes, guardar y programar en lote lo aprobado de un calendario (cada una por su lado)
    prepararRedes.js      Lo que necesita una publicación para salir en cada red, como plan: normalizar (JPEG, medidas) y las
                          copias 4:5 / 9:16 / TikTok 1080p (puro; también el Worker, para prepararla sin pantalla)
    encajarLienzo.js      Encajar o reducir una imagen en un lienzo que se le da (puro: navegador y Container)
    prepararEnvio.js      Al enviar el mes con «Programar al aprobar»: preparar las piezas (JPEG, 4:5) para que el servidor
                          las programe solo (en diferido: la carga inicial está en su tope)
    sesionActual.js       Quién está dentro (papel), para las piezas que no reciben `yo`
    auditoria.js          Auditoría de perfil: cifras, usuario, límites de Instagram (puro;
                          también lo importa el Worker)
    biblioteca.js         Biblioteca de anuncios de Meta: la consulta (topes), los parámetros de
                          /ads_archive, el enlace a la web, la tarjeta sin token y el CSV (puro;
                          también lo importa el Worker)
    bibliotecaApi.js      Cliente de /api/biblioteca (buscar y filtros guardados; también Scrape Creators)
    scrapeCreators.js     La Biblioteca por Scrape Creators: la consulta limpia, la ruta y los parámetros de cada endpoint,
                          cada anuncio como tarjeta, los errores dichos para la persona; y TikTok (los pedidos de una cuenta, una
                          palabra o #hashtag y un video, leer su respuesta «aweme» con tolerancia, las palabras de tendencia,
                          `cifraCorta`) (puro; también el Worker)
    meses.js              Calendario siempre activo: mes virtual (sin cajón), recorrer meses,
                          fusionar lo escrito en un mes vacío, días de los meses vecinos (puro)
    bandeja.js            Cliente de /api/bandeja (comentarios, hilos, interruptor, acciones)
    bandejaVista.js       La Bandeja: ventana de 24 h de los mensajes, filtros, conversaciones,
                          permisos que faltan (puro; también lo importa el Worker)
    anuncios.js           Meta Ads: objetivos ODAX, dinero en unidades menores, validar el asistente,
                          el cuerpo de cada llamada (TODO en PAUSED), resultados por objetivo (puro;
                          también lo importa el Worker)
    estratega.js          El estratega de campañas: las cuentas (costo máximo por resultado, tres escenarios), el
                          manual de la agencia, la nomenclatura, el pedido a la IA, leer el plan, pasarlo a «Nueva
                          campaña» y a texto (puro; también lo importa el Worker)
    diagnostico.js        El diagnóstico de las campañas activas: las reglas (apagar, revisar, renovar, vigilar,
                          escalar, duplicar) sobre 7 días frente a 30 y al costo aceptable (puro; también el Worker)
    informeAnuncios.js    El informe de anuncios: las cifras (4 grandes con el mes anterior, el día a día, los mejores
                          anuncios, las campañas), quitar el costo, el pedido a la IA y su lectura (puro; también el Worker)
    anunciosApi.js        Cliente de /api/anuncios
  components/
    Icon.jsx              Set de iconos SVG monocromos (rejilla 24, trazo 1.75)
    BarraPestanas.jsx     Una barra de pestañas accesible (role="tablist", flechas, Inicio, Fin, foco): las del cliente,
                          sus sub-secciones y Anuncios
    cliente/Crear.jsx     La pestaña Crear: el director («¿Qué quieres crear?») y la galería del Estudio, con el aviso del kit (lazy)
    cliente/Referencias.jsx  La pestaña Referencias: banco de ideas, «Lo mejor» del cliente y la competencia (lazy)
    cliente/Marca.jsx     La pestaña Marca: semáforo del kit, ficha, kit y voz, cerebro, plan semanal, fechas y Drive (lazy)
    cliente/SemaforoKit.jsx  El semáforo del kit en pantalla (plegado; «Subir el logo» ahí mismo) y su aviso corto
    cliente/cliente.css   Los estilos de esas tres pestañas, de las sub-pestañas y del semáforo (van con sus chunks)
    SeccionComoTrabajamos.jsx  Ajustes → «Cómo trabajamos»: recetas, estructuras de guion (UGC y voz en off), la música y los efectos de
                          la agencia, plantillas de plan y manuales
    Drive.css / FichaCliente.css / PestanaContenido.css  Estilos que salieron de index.css (el CSS inicial estaba en su tope)
    Presencia.jsx         Avatares, estado de la conexión, «X está editando»
    Interruptor.jsx       EL interruptor (role="switch") y su fila con etiqueta, descripción y motivo: para los ajustes que se
                          quedan y surten efecto al momento
    SelectorFecha.jsx     Calendario del mes para escoger una fecha (portal)
    SeccionIA.jsx         Ajustes → IA: modelo, nivel al escribir, nivel del asistente
    SinPreguntarAjuste.jsx  Ajustes → IA → «Crear imágenes sin preguntar»: la casilla y el tope por pedido (sólo el administrador)
    SeccionPresupuesto.jsx  Ajustes → presupuesto, qué pasa al llegar, consumo por día/cliente
    SeccionDrive.jsx      Ajustes → Integraciones: conectar Google Drive
    SeccionMeta.jsx       Ajustes → Integraciones: conectar Meta y asignar cuentas
    SeccionTikTok.jsx     Ajustes → Integraciones: TikTok de cada cliente, por PostPeer (conectar, pegar el id)
    SeccionYouTube.jsx    Ajustes → Integraciones: el canal de YouTube de cada cliente y su privacidad
    SeccionInformes.jsx   Resultados → informes mensuales: generar, revisar, compartir
    InformeVista.jsx      El informe como documento (claro, con la marca, imprimible)
    AuditoriaVista.jsx    La auditoría de perfil como documento, con copiar y portadas, referentes, fijados y
                          «Aplicar en el perfil» (guardada: quién y cuándo, «Comprobar en Instagram», «Perfil optimizado»)
    PiezasPerfil.jsx      Portadas de destacados (7 estilos, uno con el logo del kit) y foto de perfil con el logo, dibujadas en un lienzo (lazy)
    Graficas.jsx          Línea y barras en SVG, sin librería
    MedidorIA.jsx         El gasto del mes contra el presupuesto, en la cabecera
    Avisos.jsx            La campana: la bandeja de avisos de cada persona (y las del sistema)
    PorProgramar.jsx      «Aprobadas, por programar» (el paso final) e «Ideas por producir» (con su pieza: «Contarla
                          como aprobada»)
    HistoriasAutomaticas.jsx  «Historias automáticas» en Programación: interruptor, hora, redes, lo preparado (lazy)
    CargaEquipo.jsx       Qué tiene cada persona los próximos 7 días
    PanelTareas.jsx       Las tareas al lado, como Google Tasks: «Hoy» fijo, lo demás plegable (lazy)
    SemanaTareas.jsx      «Mi día» por semanas: lunes a sábado, cada día con sus empresas fijas y sus tareas, «Por agendar»
    RepasoAtrasadas.jsx   El repaso de la mañana: qué se hace con cada atrasada
    ElegirDia.jsx         «¿Cuándo la haces?»: sin día, hoy, mañana u otro día (el `today_date` de una tarea)
    HoyInicio.jsx         «Tus tareas de hoy» en el inicio (sustituye al panel de tareas rápidas)
    calendario/aprobacionCliente.jsx  «¿Qué aprueba el cliente?» y en qué quedó («El cliente vio la pieza: contarla como
                          aprobada» si aprobó la idea y ya tiene su pieza)
    calendario/AvisoKitPieza.jsx  El aviso del kit en la pestaña Pieza: sin logo, o un producto que nombra sin fotos (lazy)
    calendario/cambiosCliente.jsx  Lo que pidió cambiar el cliente y «Rehacer la imagen con lo que pidió» (pestaña Subir)
    calendario/equipoPublicacion.jsx  Lo lleva, etapa, hilo del equipo, tareas de la
                          publicación e historial
    SubirRapido.jsx       «Subir»: cliente → archivo → la IA escribe → cuándo sale (diálogo)
    GuardarReferencia.jsx «Guardar referencia»: pegar el enlace de un video, la empresa (o ninguna: general) y una nota (lazy);
                          también lo que llega por «Compartir» (/compartir) y cómo dejarlo en la hoja de compartir
    calendario/BankPanel.jsx  El banco de ideas (junto al calendario y en la pestaña Ideas): filtros, empresa, enlace
    calendario/cuandoSale.jsx   «¿Cuándo sale?» del panel: Ahora / Programar / La publico yo
    calendario/horaSugerida.jsx La hora con mejores resultados, compartida por los dos
    calendario/destinoRedes.jsx «¿Qué sale y dónde?»: formato y cada red con su casilla y
                          lo que sale en ella; la usan el panel y «Subir»
    calendario/ajusteImagen.jsx La imagen que no cabe: difuminado, color, recorte o
                          GENERADA de nuevo con IA en 4:5/9:16 (Nano Banana); la usan el panel y «Subir»
    calendario/copiaDrive.jsx «Guardar en Drive» al programar (casilla del panel y de «Subir»)
    calendario/botonGuardarDrive.jsx  «Guardar en Drive» de cada publicación (pestaña Subir)
    calendario/GuardarMesDrive.jsx    «Guardar el mes en Drive» (lazy)
    ExploradorDrive.jsx   La carpeta de Drive de un cliente: gestionar o escoger
    BancoSelector.jsx     Escoger de Drive (o del banco anterior); forma única
    PestanaContenido.jsx  Marca → Drive (era la pestaña Contenido): Drive + migrar el banco anterior
    Estudio.jsx           Crear → Galería (era la pestaña Estudio; lo manual, plegado en «Avanzado») y el diálogo «Crear con IA»: pedir imágenes o videos,
                          verlos aparecer, galería, carpetas y papelera (lazy)
    EstudioCompositor.jsx Qué crear: tipo, prompt, modelo (ordenar/filtrar), ajustes, imágenes de apoyo
    EstudioVisor.jsx      La pieza grande (imagen o video) con todo lo que se sabe de ella, «Usar como logo»
                          y «Revisar marca»
    VariacionesAnuncio.jsx  «Variaciones para anuncios» del visor: cuántas (3–5), qué cambia cada una y el costo total con el
                          segundo toque (lazy: el chunk del Estudio está en su tope)
    ContenidoCompetencia.jsx  «Su contenido en Instagram» (pestaña Competencia del estudio de mercado): las publicaciones de
                          un competidor, las mejores primero; analizar como referencia o extraer su guion UGC (lazy)
    Inspiracion.jsx       Referencias → Lo mejor (era la pestaña Inspiración) = «Lo mejor» FILTRADO por el cliente (y el ojo del calendario, donde se arrastra
                          a un día): sus cuentas, «Actualizar» y el resumen al cerebro, con las tarjetas de «Lo mejor» (lazy)
    LoMejorTarjetas.jsx   Las tarjetas de «Lo mejor»: vista previa (el video se reproduce), la cifra de verdad, el tipo, «Recrear
                          para [cliente]», guardar en ideas, extraer guion, fórmula, «Crear con Claude», llevar a un día
    RecrearLoMejor.jsx    «Recrear para [cliente]»: UN recreador (también el del estudio de mercado): camino, producto, el costo
                          y el día antes de crear (lazy)
    SeccionScrapeCreators.jsx  Ajustes → Integraciones: la llave de Scrape Creators, el tope de créditos por semana, lo gastado, lo
                          que espera su lectura (cuentas de TikTok, palabras, anuncios) y el interruptor de las tendencias de TikTok
    TendenciasTikTok.jsx  Las palabras o #hashtags de las tendencias de TikTok de un cliente (en Inspiración → Cuentas)
    CuentasReferencia.jsx Las cuentas fijas de un cliente (red, @, tipo, nota): en Resultados y en Inspiración
    BibliotecaSC.jsx      La Biblioteca por Scrape Creators: empresa o palabra, filtros, cada anuncio con analizar, traer,
                          al banco de ideas y transcribir (lazy)
    calendario/referenciasPost.jsx  «Referencias · no se publican» del panel: recrear con la marca, extraer guion, usar como contenido
    EstudioMercado.jsx    El estudio de mercado en Marca → Cerebro (y su competencia, `CompetenciaDeMercado`, en Referencias): catálogo, «Realizar estudio de mercado» por
                          pasos con revisión, y las referencias de la competencia (lazy)
    EstudioLote.jsx       «Producir en lote»: qué (anuncios, por tipo o el mes; post, historia, carrusel o reel), ideas por
                          tandas («Sólo las ideas al calendario») y crear; cada pieza «Llevar al calendario» (lazy)
    EstudioMuchas.jsx     La tarjeta «Muchas de una vez» de «Avanzado» (el lote y «Recrear con mi marca»), aparte: el chunk del
                          Estudio está en su tope (lazy)
    EstudioRecrear.jsx    «Recrear un anuncio»: el anuncio (subir, galería o Drive), el análisis y la versión editable (lazy)
    EstudioKit.jsx        El kit de marca (Marca → Kit y voz; la voz va en su tarjeta, VozDeMarca): prepararlo con IA desde el cerebro, revisarlo, guardarlo (también las reglas que no se
                          rompen y quién pone el logo)
    VisorGrupo.jsx        Un carrusel o un reel de la galería con sus piezas en orden, «Descargar» en ZIP, «Usar el carrusel
                          en la publicación» y «Mandar el carrusel a la papelera» (lazy)
    FuenteDeMarca.jsx     La fuente de la marca en el kit: subir el archivo, dibujar la muestra, guardar las dos
    GaleriaSelector.jsx   «De la galería» del panel de una publicación: imágenes sueltas o un carrusel entero, en orden (lazy)
                          y, con `una`, UNA imagen: la portada de un reel («Portada del video» → «De la galería»)
    SelectorModelo.jsx    «Con qué modelo (sólo esta vez)»: visor, post; marca los que no hacen la proporción; y el filtro
                          «Modelo» de la galería (`FiltroDeModelo`)
    IdeasDeFormato.jsx    «Dame ideas» en el paso 1 del carrusel y del reel IA
    FlujoVideoProducto.jsx  «Video del producto»: producto, guion, los dos fotogramas y el video (lazy; dentro de FlujoReel)
    ProbarVoz.jsx         «Probar una voz»: voz (las nativas en español primero), modelo y texto propio, el costo antes de
                          pagar, la nota (¿tiempos por palabra?), el audio, «Escuchar gratis» y «Fijar como voz de la marca»
                          (lazy; dentro de VideoAnimado)
    BibliotecaVoces.jsx   «Buscar voces en español»: la biblioteca de ElevenLabs (gratis), escuchar y «Añadir a mis voces»
    MusicaDeMarca.jsx     La música de la marca en el kit (Marca → Kit y voz): cómo suena, lo que nunca suena y las que gustaron (lazy)
    EstiloVideoMarca.jsx  «Estilo de los videos de la marca» en el kit (Marca → Kit y voz): el texto obligatorio y hasta 6 imágenes
                          de la galería de referencia (lazy)
    EstilosVideoGuardados.jsx  Los estilos de video guardados del cliente en Marca → Kit y voz: lo que hace cada uno, nombre, uso y quitar (lazy)
    SelectorEstiloVideo.jsx  «Estilo del video» al crear uno (con canción o con voz en off): el primero que sirva, o ninguno
    GuardarEstiloVideo.jsx  «Estilo del video» de un video abierto: «Guardar como estilo» y «Aplicar un estilo guardado» (lazy)
    CancionesInstagram.jsx  Las canciones de Instagram que le van a un cliente (Marca → Kit y voz, junto a la música de la marca; lazy)
    VideoAnimado.jsx      «Animado con código»: los videos animados del cliente, el guion (errores con su sitio), la vista
                          previa en el lienzo y «Aprobar el guion» (lazy; dentro de FlujoReel)
    CrearVideoAnimado.jsx «Video nuevo»: idea o publicación, duración, formato y la estructura de guion → la IA escribe el guion (lazy)
    SelectorEstructura.jsx  «Estructura del guion» al escribir una voz en off (Video nuevo, el reel por planos): la IA escoge o una
                          de las de la agencia; «Ver las estructuras» (en el reel, lazy: el Estudio precarga el reel)
    GuardarEstructura.jsx «Guardar como estructura» de una voz en off (video animado o reel): la IA la abstrae y se abre en el
                          editor de las estructuras con «Voz en off» marcado (lazy)
    EditorEscenas.jsx     «Editar los textos»: lo que se dice, lo que se lee, tipo, pausa, orden de las escenas (lazy)
    LocucionVideo.jsx     «La voz» del video en su pantalla: ver el costo y generarla (lazy)
    FondosVideo.jsx       «Imágenes de fondo» del video en su pantalla: los fondos por crear, ver el costo y crearlos con el director (lazy)
    CrearConCancion.jsx   «Con tu canción» de «Video nuevo»: la canción (escoger o subir), la letra, sincronizar con su costo, cada
                          línea con su tiempo, el ajuste fino y «Prueba de sincronía» o «Diseñar las escenas con IA» (lazy)
    CancionVideo.jsx      «La canción» en el sitio de «La voz» de un video con canción: la sincronía, el ajuste fino y «Volver a
                          sincronizar» (lazy)
    RenderVideo.jsx       «Renderizar a mp4»: pedirlo, esperarlo (relee cada 4 s), verlo, descargarlo y a qué publicación va
    VideoSonido.jsx       «Sonido» (efectos —los de la aplicación o uno de la biblioteca para cada sitio— y música de la
                          biblioteca del cliente o de la agencia, con su volumen) e «Historial de versiones» del video
                          animado (lazy: el chunk de VideoAnimado está en su tope)
    GenerarMusica.jsx     «Generar la música con IA (Suno)»: en «Sonido» (con el director musical) y en la biblioteca del cliente
                          (sin video); si en la biblioteca ya hay una que encaja, la ofrece antes de pagar
    BibliotecaSonido.jsx  La biblioteca de sonido en pantalla: Marca → «Música y efectos» de un cliente y, sin cliente, la de la
                          agencia en Ajustes → Cómo trabajamos (dos listas, subir, etiquetas, BPM, la estrella, quitar, «Usar de
                          la agencia», «Pasar a la agencia», «Generar con Suno») (lazy)
    ReferenciasGaleria.jsx  Ejemplos de la galería al corregir (y referencias del reel), cada uno con qué se toma
    GuardarRegla.jsx      «Guardar como regla» junto a cada corrección
    Recetas.jsx           Las recetas de la agencia: «Crear aquí» (el director, pestaña Diseño), «Crear con Claude» y el editor (lazy)
    calendario/RevisionMes.jsx  «Revisar el mes» antes de enviarlo: reglas, IA opcional e imágenes contra el kit (lazy)
    calendario/VistaMes.jsx  «Ver el mes como se verá»: Perfil (la cuadrícula 3:4), Feed (una a una, con vistaRed.jsx) y Detalles, y
                          «Programar todo lo listo» (lazy, con VistaMes.css)
    calendario/vistaRed.css  Los estilos de la vista previa de cada red (salieron de publicar.css: la usan el panel, «Subir» y VistaMes)
    calendario/CarruselIA.jsx   «Crear carrusel con IA»: el guion en láminas, el texto por IA o por plantilla, rehacer una (lazy)
    calendario/ProducirMes.jsx  «Diseñar las aprobadas» (paso del asistente del mes; `ponerSolas`): las piezas que faltan en lote, con
                          costo y confirmación (lazy)
    calendario/AsistenteMes.jsx  El botón «Producir el mes»: el ASISTENTE DEL MES (estrategia → plan → ideas → diseñar → revisar y
                          enviar), guardado en el calendario (lazy)
    calendario/envolturaMes.jsx  Las pantallas del mes sueltas (diálogo) o INCRUSTADAS como un paso del asistente
    calendario/RevisarIdeas.jsx  «Revisar las ideas»: la aprobación INTERNA en tarjetas (aprobar, otra con nota, quitar) (lazy)
    calendario/crearConIA.jsx  El Estudio en un diálogo dentro del panel de una publicación y de «Subir»
                          (el hook que lo abre, en hooks/useCrearConIA.jsx)
    DisenoDirector.jsx    «¿Qué quieres crear?» de Crear (era la pestaña Diseño): el asistente incrustado como director creativo, con atajos (lazy)
    PlanDePiezas.jsx      El plan de una tanda del director: las fichas, el costo, «Crear» y cada pieza según sale
    PonerEnPublicacion.jsx  «Poner en una publicación…» del visor, del carrusel y de la galería con varias escogidas (lazy)
                          y «Como portada del video» cuando va UNA imagen a un reel con su video
    GuardarPlantilla.jsx  «Guardar como plantilla» del visor: la IA lee su sistema de diseño y la pieza pasa al kit (lazy)
    calendario/OpcionesCrearAqui.jsx  Tipo, estilo, modelo y plantilla de «Crear la imagen aquí» (lazy)
    Cerebro.jsx           Marca → Cerebro (era la pestaña Cerebro): las notas de un cliente, ficha desactualizada, datos que no cuadran, añadir
                          (qué es), actualizar desde GitHub, filtros, buscar, subir
    LenguajeCliente.jsx   «Lenguaje del cliente» de Marca → Cerebro → Más: pegar reseñas propias o de 1 estrella de la
                          competencia y las marcas a ocultar; la propuesta se abre en el editor de notas (lazy)
    NotaLegible.jsx       Una nota del cerebro formateada para leer (títulos, listas, tablas, [[enlaces]])
    ConversacionesChat.jsx  La lista de conversaciones del asistente: abrir, nueva, renombrar, borrar (segundo toque)
    GuardarEnCerebro.jsx  «¿Lo guardo en el cerebro?»: lo que propone el asistente, corregible, a la espera de un sí
    CerebroAprendizaje.jsx  «Lo que aprende»: señales, aprender del historial y de los resultados,
                          y las reglas que la IA propone para que una persona las acepte
    CerebroGrafo.jsx      «Mapa 3D» de la pestaña: explorar, elegir una nota, ver sus vecinas (lazy)
    InterruptorBandeja.jsx  El interruptor de la bandeja de un cliente: en la ficha y en la Bandeja
    ContadorBandeja.jsx   El número de pendientes sobre «Bandeja» en la navegación
    cerebro3d/escena.js   El lienzo del mapa: dibuja, gira, elige; sin librerías (canvas 2D)
    NavPrincipal.jsx / MenuCuenta.jsx / BarraInferior.jsx / Buscador.jsx
                          Armazón: secciones, cuenta, barra del móvil, Ctrl+K
    ClientModal.jsx       Alta y edición de cliente (5 pestañas)
    EstrategiaMes.jsx     El paso «Estrategia» de «Planificar mes», la etapa de cada semana y el balance (también en «Revisar el mes»)
    PlanWizard.jsx        «Planificar mes»: 6 pasos que escriben en el mes elegido (lo AÑADEN
                          si ya tenía publicaciones)
    calendario/navegadorMes.jsx ‹ Octubre 2026 › Hoy: recorrer el calendario siempre activo
    calendario/GuionUgc.jsx  El guion de un UGC en el panel: columnas, duración, ganchos, copiar, «Extraer guion de un video»
    calendario/ExtraerUgc.jsx  «Extraer guion y adaptar»: el video (de la publicación, la galería o subido), producto,
                          duración; el original transcrito y el adaptado → la publicación o el banco; «Guardar como estructura» (lazy)
    calendario/FormulasUgc.jsx  «Estructuras de guion de la agencia» (antes fórmulas UGC): la lista con su filtro UGC / Voz en off,
                          corregir, quitar, escribir una escogiendo para qué sirve (lazy)
    calendario/GuionesParaGrabar.jsx  «Guiones para grabar»: los UGC del mes sin video, escoger y ordenar, copiar o compartir
                          todo en un mensaje; pasan a «En producción» (lazy)
    calendario/tipoContenido.jsx  «Tipo de contenido» del panel: tipo, producto, nivel, perfil y deseo
    calendario/campanaMes.jsx   La tarjeta de la campaña: nombre del mes, semanas, ofertas, fechas
    calendario/repeticionesMes.jsx  Lo que se repite este mes (añadir, ahora no, no repetir más) y «Se repite» del panel
    calendario/ExportarContenido.jsx  «Exportar ideas y descripciones» (lazy: con su estado, fuera de la carga inicial)
    calendario/PortadaClic.jsx  «Portada que da clic» dentro de «Portada del video»: concepto, titular, formato, la vista a 120 px (lazy)
    calendario/ConMusica.jsx  «Publicar con música» en la pestaña Pieza: la foto → un reel con música (pista con «Escuchar», duración,
                          movimiento) y «Volver a la foto»; el carrusel → a mano con la música de Instagram y su canción (lazy)
    VideoListo.jsx        «¿Está listo este video?»: en la pestaña Subir y en el visor del Estudio (lazy)
    MejorarVideo.jsx      «Mejorar mi video» (color con muestras, escalar, look, cambiar algo, varios ángulos, alargar): el costo
                          antes, el sí, cómo va y «Poner en la publicación»; en la pestaña Pieza y en el visor (lazy, con su CSS)
    NuevosGanchos.jsx     «Nuevos ganchos»: versiones de la entrada (con el momento fuerte, gratis) o entrada y cierre nuevos con
                          IA, los textos escritos con IA; en la pestaña Pieza y en el visor del Estudio (lazy)
    CrearConPlantilla.jsx «Plantillas de moda» del video animado: escoger, escribir y las fotos de la galería (lazy)
    DesgloseVideo.jsx     «Desglosar toma por toma» en el visor de un video del Estudio: el costo, la cuenta, el mapa de
                          secuencia plegado, «Copiar el desglose» y «Desglosar otra vez» (lazy)
    calendario/avisoTemporada.jsx  «Se acerca …»: la fecha comercial del cliente en tres semanas y cómo reutilizar una pieza
    calendario/PlanSemanal.jsx  «Plan semanal de <empresa>»: el editor ÚNICO (`EditorSemana`: formato, tipo, hora y nota de cada día,
                          partir de un plan de la agencia); el diálogo de la barra, el asistente del mes y la ficha lo usan (lazy)
    calendario/fechasEspeciales.jsx  Escoger las fechas de un cliente (importante, ocultar, propias, IA)
    CalendarView.jsx      Vista de lista y de rejilla, filtros, generación, envío
    anuncios/AsistenteCampana.jsx  «Nueva campaña» por API (objetivo, públicos, anuncios): YA NO SE ABRE desde ningún sitio (decisión del 14-nov:
                          las campañas se montan en el Ads Manager); se conserva por si vuelve
    anuncios/DialogoActivar.jsx    Activar: el presupuesto y las fechas, y escribir ACTIVAR
    anuncios/Estratega.jsx         El estratega: para un cliente o alguien de fuera, el plan, ajustarlo, guardarlo y llevarlo
                          a «Nueva campaña» (lazy)
    SeccionManualCampanas.jsx      Ajustes → Manual de campañas de la agencia
    anuncios/Diagnostico.jsx       El diagnóstico: lo que dicen las reglas, «Apagar» y «Subir a…» (con confirmación) (lazy)
    anuncios/InformesAnuncios.jsx  «Informe» en Anuncios: generar, automático el día 1, el costo sí o no, compartir (lazy)
    anuncios/InformeAnunciosVista.jsx  El informe de anuncios como documento (lo usan el diálogo y la página pública)
    SemaforoMaletas.jsx   Las 7 maletas en pantalla: por producto en el estudio de mercado y el resumen en Marca → Cerebro, con
                          «Pedírselo al cliente» (una tarea del cliente con el mensaje listo)
    negocio/NumerosNegocio.jsx  Marca → «Números del negocio»: la ficha, «Proponer lo que falta con IA», el número mágico, cuánto
                          invertir, el equilibrio con su tabla, simular y las ventas de la semana (lazy)
    negocio/VentasSemana.jsx  Las ventas de la semana dentro de Números del negocio: 8 semanas con la pauta y las conversaciones,
                          escribir o corregir, copiar el enlace y el mensaje de los lunes, la tasa medida (`onTasaMedida`) y el ROAS real
    negocio/KitWhatsApp.jsx  Marca → «WhatsApp»: el kit (proponer con IA, editar, guardar, copiar cada bloque y todo), con lo
                          propuesto y no guardado recordado en el navegador (lazy)
    negocio/VozDelCliente.jsx  «La voz de tus clientes» dentro de Marca → WhatsApp: el enlace, el mensaje para el cliente, las
                          respuestas y «Llevar al estudio» con casillas
    ChipsAnalisis.jsx     Las preguntas del curso sobre un anuncio de la competencia en chips (problema, nivel, tipo de arte,
                          sesgo, oferta, llamado): en las referencias del estudio de mercado y en la Biblioteca
    calendario/pautaPublicacion.jsx  «Se va a pautar» (pestaña Idea): etapa, nivel, cómo se monta y los textos del anuncio con «Copiar»
    VersionAnuncio.jsx    «Versión para anuncio» de una ya publicada (Producción → Publicadas y Resultados): el texto de pauta y los
                          textos aparte, para copiar (lazy)
    cliente/ResultadosCliente.jsx  Resultados de un cliente: Redes (pages/Resultados) y Anuncios (la revisión 3Q), sub-secciones
    anuncios/Revision3Q.jsx  La revisión 3Q en pantalla (Resultados → Anuncios y el diálogo de Anuncios → Campañas) (lazy)
    anuncios/RevisarCampanasDia.jsx  Mi día: «Revisar las campañas de <cliente>» cada 6 días
    anuncios/ManualCiclo.jsx  El reparto por etapa y los anuncios por conjunto en Ajustes → Manual de campañas
    anuncios/AnunciosDelPlan.jsx  Los anuncios de cada campaña del plan de campañas: la publicación sugerida o escogida («Cambiar»), cómo
                          se monta en el Ads Manager y sus textos (a mano o «Escribir los textos» con la IA)
    anuncios/ParaPautar.jsx  «Para pautar» en Resultados → Anuncios: lo que rindió, su texto como anuncio, «Marcar Va a pauta» y
                          lo que se aprende de sus anuncios (lazy, dentro de la revisión 3Q)
    calendario/enPautaPublicacion.jsx  «En pauta · Presentación · 0,80 US$ por conversación» en la pestaña Idea (sólo D1)
  pages/
    Login.jsx             Acceso
    Equipo.jsx            Quién entra en el espacio; invitar y sacar
    Invitacion.jsx        Lo que ve quien abre un enlace de invitación
    Aprobar.jsx           Página pública que ve el cliente final
    Tareas.jsx            «Mi día»: la semana (por defecto), la lista Atrasadas/Hoy/Próximas y la vista por empresa (`?empresa=`)
    Resultados.jsx        La pestaña Resultados de un cliente y /resultados (la agencia)
    Programacion.jsx      /produccion («Producción», era /programacion) como Business Suite: Por producir · Publicadas (con cifras) · Programadas · No publicadas, filtros
    Bandeja.jsx           /bandeja: comentarios y mensajes de Facebook e Instagram (lazy)
    Auditorias.jsx        /auditorias: auditar el perfil de un cliente o de un prospecto
    Biblioteca.jsx        /biblioteca (Anuncios → Biblioteca): buscar en la Biblioteca de anuncios de Meta, filtros
                          guardados (la competencia de un cliente), exportar CSV (lazy)
    AuditoriaPublica.jsx  Lo que abre el cliente o el prospecto con el enlace (sin sesión)
    ConectarClaude.jsx    /conectar-claude: el permiso que pide Claude (OAuth)
    PublicarAMano.jsx     /a-mano/…: publicar desde el teléfono (música, stickers…)
    Informe.jsx           Lo que ve el cliente al abrir su informe mensual (sin sesión)
    InformeAnuncios.jsx   Lo que ve el cliente al abrir su informe de anuncios (sin sesión)
    VentasCliente.jsx     Lo que abre el cliente con su enlace de ventas (sin sesión)
    VozCliente.jsx        Lo que abren los clientes del cliente con el enlace de la encuesta (sin sesión)
    Ajustes.jsx           IA, presupuesto y consumo, integraciones, tareas, copia
    LoMejor.jsx           /lo-mejor: «Lo mejor del momento» de todos los clientes (Esta semana · Este mes · Nuevo, filtros) (lazy)
    Campanas.jsx          /campanas («Anuncios»): cuenta publicitaria, cifras, campañas, crear (lazy)
    Anuncios.jsx          «Anuncios»: Campañas, Plan de campañas y Biblioteca de anuncios como pestañas, cada una con su dirección (lazy)
    PlanCampanas.jsx      /plan-campanas (Anuncios → Plan de campañas): el ciclo con sus avisos, «Producir los anuncios que
                          faltan», la temporada, la guía de montaje con casillas, el Excel y el texto (lazy)
worker/
  index.js                Enrutado, sesión y cabeceras de /api/*
  hub.js                  Durable Object: un espacio, sus sockets y su presencia; y la ALARMA que lleva el Estudio sin pantalla
  lib/
    acceso.js             La capa que sustituye a las políticas RLS
    sesion.js             PBKDF2, cookie __Host-, espacio de trabajo e invitaciones
    vivo.js               Difundir un cambio al espacio; la firma de quién lo hizo
    publico.js            El enlace de aprobación, sin sesión
    meses.js              Calendario siempre activo: obtener o crear el mes; mover una
                          publicación a otro mes (todo o nada, con las siete tablas)
    respuesta.js          Cabeceras y errores de la API
    flujoAnthropic.js     El SSE de Anthropic, reconstruido en mensaje (puro)
    anthropic.js          La llamada a Anthropic: streaming, reintento, rechazo con motivo
    configIA.js           Modelo y razonamiento del espacio, Opus de la cuenta, costo,
                          presupuesto (`prepararIA`, `bloqueoPorPresupuesto`)
    google.js             OAuth de Drive, refresh token cifrado, llamadas a Drive,
                          «¿está dentro de la carpeta del cliente?»
    firmas.js             Cifrar y firmar con el secreto de una integración (HKDF)
    meta.js               OAuth de Meta, cliente de la Graph API, cuentas, medios firmados
    publicador.js         La cola: programar, procesar (Instagram/Facebook/TikTok/YouTube), reintentos
    redesServidor.js      Preparar una publicación para sus redes en el Container al aprobarla (JPEG y copias), y guardarla
    historiasAuto.js      Historias automáticas: ajustes, lo que falta preparar, guardar la pieza y el paso del cron
                          que pone en la cola la del día
    avisosAMano.js        El aviso a la hora de lo que se publica A MANO (10 min antes y a la hora): las filas de `avisos_a_mano`
                          al guardar un calendario y el paso del cron (UNA consulta sin nada que avisar)
    postpeer.js           TikTok por PostPeer: perfiles y cuentas, creator-info, el cuerpo de /posts, leer su
                          estado y la firma del webhook
    youtube.js            OAuth de Google por cliente (YouTube), subida reanudable por trozos,
                          portada, cifras del canal (Data API + Analytics)
    metricas.js           La foto diaria de métricas de cada cuenta y de la competencia
    informes.js           Cifras del mes (congeladas) + análisis de la IA; el del día 1
    informeAnuncios.js    El informe de anuncios: leer el mes de Meta, incrustar las imágenes, generar, el del día 1
    auditorias.js         Leer un perfil (cuenta propia o business_discovery) y auditarlo
    biblioteca.js         Una búsqueda en /ads_archive (una llamada, con topes) y sus errores
    scrapeCreators.js     Scrape Creators: la llamada con la llave, un reintento, la caché en D1 y traer un anuncio a la galería;
                          el TOPE semanal de créditos (lo comparten anuncios y TikTok) y TikTok: leer una cuenta, buscar una
                          palabra y traer un video a la galería (sólo de sus dominios, sin la llave, sin pagar dos veces)
    tendencias.js         Las tendencias de TikTok de cada cliente: sus palabras, leer una (los videos con más vistas) y guardarlas
    negocio.js            Los números del negocio: leer y guardar (`anuncios_clientes.negocio`), lo de Meta en 30 días (una
                          llamada), la IA que propone sin guardar, y la ruta (la despacha rutas/anuncios.js)
    ventas.js             El enlace de ventas: el testigo (una vez), guardar una semana, la pauta y las conversaciones de
                          Meta por semana (una llamada) y lo que ven la agencia y el cliente
    revision3q.js         La revisión 3Q: leer la cuenta por nivel (12 llamadas), la revisión de un cliente, las etapas, Mi día,
                          lo grave del cron y lo que ve sólo la agencia en el informe de anuncios
    planCampanas.js       El plan de un cliente y un mes (lo que lee de la base, también lo aprendido de sus anuncios), el progreso
                          de la guía (planes_campana con tipo «ciclo») y plan_de_campanas para el asistente y Claude
    enPauta.js            La lista de anuncios con su creativo (escalera #100), ponerlo al día desde la revisión y el cron,
                          GET …/en-pauta, GET|POST …/para-pautar y `preferenciasDelCliente` (lote, director y plan)
    whatsapp.js           El kit de WhatsApp (leer, guardar con `actualizar`, la IA que propone) y la voz del cliente (el testigo
                          una vez, las respuestas, la encuesta pública, «Llevar al estudio» y aceptar en el borrador)
    anuncios.js           Meta Ads: cuentas publicitarias, campañas e /insights, subir el medio
                          (/adimages, /advideos por file_url), crear en pausa, activar y pausar
    mcp.js                Las herramientas de Claude por MCP (consulta + escritura)
    mcpVista/             La VISTA PREVIA en el chat de Claude (MCP Apps): modelo.js (qué herramientas la llevan, el
                          `structuredContent`, cómo la página lee un resultado; puro), navegador.js (la página del iframe),
                          estilos.css y pagina.generada.js (GENERADA: `node scripts/mcp/generar-vista.mjs`)
    exportarPiezas.js     `exportar_piezas` (MCP): piezas de la galería en un ZIP por un enlace sin sesión de 15 minutos
                          (/api/exportar/<testigo>/<nombre>.zip), armado POR FLUJO desde R2; nada se guarda
    kitDescargable.js     `kit_descargable` (MCP): todo lo de la marca de un cliente en un ZIP (logo, letra, fotos de cada producto,
                          personajes, música, paleta.json con los tokens del motor, kit.json con los precios) por el mismo enlace
                          de 15 minutos que exportar_piezas (/api/exportar/kit/<testigo>/<nombre>.zip)
    medioVista.js         La dirección FIRMADA y de corta vida (12 h) de un audio o video de R2 para esa vista, con el secreto
                          que se crea solo en R2 (`firmas/vista-medios.key`); qué claves se pueden servir
    competencia.js        `business_discovery` de un competidor (sus últimas publicaciones) y «traer» su archivo del CDN de Meta
                          a la galería («Competencia»), también desde un enlace de Instagram SIN @ (memoria, cuentas fijas,
                          página pública) y la miniatura de un reel con música
    inspiracion.js        Inspiración: leer las cuentas de un cliente (Instagram, YouTube y TikTok por Scrape Creators), guardar lo
                          que publican con su «rinde», borrar lo que ya no está, avisar de lo que rinde 3×, el cron y el resumen
    loMejor.js            «Lo mejor»: reunir las cuatro fuentes sin repetir, clasificar (la IA barata, una vez), releer los anuncios de
                          las búsquedas guardadas cada semana con su tope de créditos, traer el original sin pagar dos veces,
                          recrear para un cliente (la publicación en su próximo día libre + el encargo, el guion animado o para
                          grabar) y su paso del cron
    herramientasLoMejor.js  `ver_lo_mejor` y `recrear` para Claude (MCP), con la vista previa del chat
    herramientasTextos.js Los TEXTOS y el MES por MCP: escribir_textos (el motor escribe y guarda), ficha_de_textos (el pedido del
                          motor para que Claude escriba con el método; sólo lee), preparar_mes (el plan semanal en los días libres),
                          estrategia_del_mes (leer, proponer, guardar con confirmación) y revisar_mes (las reglas); y la revisión
                          de lo que guardan crear_publicacion y editar_publicacion (`avisosAlGuardar`)
    herramientasCampanas.js  Campañas y números por MCP: numeros_del_negocio (la ficha con EL número mágico, cada dato con su
                          origen, el equilibrio, cuánto invertir y la tasa medida; con `proponer`, lo que propone la IA SIN
                          guardar), guardar_numeros_negocio (de → a y el número mágico; con confirmado), escribir_textos_anuncios
                          (los textos del plan por el motor, de 8 en 8 con «Quedan N») y ajustar_plan_campanas («¿Qué vas a
                          hacer?», un hueco de anuncio y el reparto a mano, éste con confirmado)
    plantillasPlan.js     Las plantillas de plan del espacio leídas de D1 (la ruta /api/plantillas-plan y preparar_mes)
    mercado.js            El estudio de mercado: catálogo (y su nota de cifras), el estudio por pasos con búsqueda
                          web, aprobar (notas del cerebro + documento en Drive), referencias de la competencia
    estudio/              El Estudio: meta.js (Muse Image: generar y editar, 0,01 $), prompt.js («Mejorar
                          idea»: la ficha del director de arte en una imagen, la mejora corta en un video), fichas.js (el
                          director de arte), plantillas.js (las plantillas del kit), trabajos.js (pedir, avanzar por pasos, cancelar; el permiso de
                          un paso a la vez y el cron), motores.js (prueba y Gemini, mismo contrato;
                          fal.js, higgsfield.js y kie.js son los otros tres), gemini.js (la llamada,
                          compartida con /api/generar-imagen), galeria.js (archivos, carpetas,
                          papelera), archivos.js (claves de R2, tipo por bytes), descarga.js (bajar un
                          resultado a R2 por flujo, con topes), herramientas.js (ver_estudio,
                          crear_en_estudio, estado_trabajo y la papelera —mover_a_papelera,
                          recuperar_de_papelera, borrar_carpeta, vaciar_papelera con su confirmación—:
                          las mismas para el asistente y el MCP),
                          miniaturas.js (la copia reducida que VE Claude, por el Container),
                          herramientasDiseno.js (el DIRECTOR por MCP: guía, diseñar, estado del encargo, corregir, poner en
                          un post), catalogoDiseno.js (el catálogo para quien diseña: chat y MCP),
                          acabado.js (el texto de la plantilla y el logo estampado por el Container, sin pantalla),
                          higgsfield-schemas.json (SU documentación: campos, valores, obligatorios), elevenlabs.js (la voz
                          directo con la llave oficial), ideas.js
                          («Dame ideas»), lote.js (la producción en lote: niveles, matriz, tipos y mes), encargos.js
                          (la cadena del lote que sigue en el servidor), bomba.js (lo avanza sin pantalla) y escuchar.js
                          (escuchar un video animado sin oídos: el mismo pedido que el render a /escuchar del Container)
    cerebro/              El cerebro de un cliente: conocimiento.js (BM25 por pasajes) y
                          memoria.js (grafo, presupuesto, sinapsis) portados de Agents
                          Office; notas.js (tipos, partir un archivo en notas);
                          cerebro.js (índice en R2, buscar, contexto); repositorio.js e
                          importar.js (llenarlo desde GitHub); preparar.js (la IA escribe
                          la ficha y las cifras); ia.js (la llamada a Anthropic que
                          comparten preparar y proponer); senales.js (qué resultado tiene
                          una respuesta, un rendimiento en redes o una corrección; puro);
                          pesos.js (los pesos que se leen en cada búsqueda); aprender.js
                          (lo que TOCA la base: usos, señales, refuerzo, notas automáticas,
                          historial, resultados y correcciones); proponer.js (la IA propone
                          reglas y una persona las decide); rubro.js y vozUgc.js (la IA propone
                          «Saber del rubro» y la «Voz UGC»; se guardan como nota); lenguaje.js (la IA propone
                          «Lenguaje del cliente» con lo pegado, la Bandeja —sólo lo de otros— y la encuesta; el código
                          descarta toda frase que no esté tal cual; no guarda); guardar.js (guardar UNA nota: lo que hacía en
                          línea el PUT de /api/cerebro/<c>/nota —ruta única, derivados, `editada`, fechas e índice—, compartido
                          con Claude; `prepararNota` comprueba sin escribir); herramientasCerebro.js (por MCP: guardar_en_cerebro
                          con su confirmación, proponer_nota_cerebro —lenguaje del cliente, saber del rubro, voz UGC—,
                          ver_estudio_mercado y proponer_angulos al borrador)
    herramientasServidor.js  Lo que el asistente consulta sin el navegador:
                          web, el cerebro (notas cortas enteras), calendarios, tareas, ideas
    equipo.js             Avisos (guardar y anunciar), historial y asignaciones
    ids.js                UUID, testigos, huellas
    estructurasGuion.js   Las estructuras de guion del espacio para quien escribe en el Worker: leerlas por `para`, qué va al
                          pedido de una voz en off (la escogida o la lista para que la IA escoja) y cuál siguió
  videosProyectos.js    Los proyectos de video animado: crear, guardar, editar UNA escena y aprobar (la ruta y las
                          herramientas van por aquí)
    estudio/reelDelMes.js  Los reels de un mes (el asistente del mes): el costo sin crear nada y, con el sí, el encargo de cada uno
    estudio/deconstructor.js  El desglose de un video de la galería (por `verVideo`, guardado en `ajustes.deconstruccion`) y
                          `secuenciaDeVideo`, lo que leen el guion del reel por planos y el del video animado
    estudio/listoAnimar.js  «¿Listo para animar?»: la IA mira las copias de 512 px de todo el storyboard en UNA llamada
    estudio/directorMusical.js  El director musical: lee el video guardado, el kit y al cliente y propone la música de Suno
                          (`proponerMusica`, guardada en R2 para la confirmación, con lo de la biblioteca que encaja); «Me gusta»
                          a la marca (`musicaALaMarca`)
    estudio/sonidos.js    La BIBLIOTECA DE SONIDO: lo de un cliente en estudio_archivos y lo de la agencia en biblioteca_sonidos (R2
                          bajo `biblioteca/<espacio>/`): listar (`musicasDe` suma la de la agencia), subir, cambiar, quitar con
                          aviso si un video la usa, copiar entre las dos, qué puede sonar en un video (`sonidoParaVideo`,
                          `claveDeSonido`) y lo que encaja con el director (`lasQueEncajan`)
    estudio/encargoReel.js  El REEL por planos como encargo (tipo «reel»): el storyboard en orden, se para a revisar y se retoma
                          (`continuarReel`), el video o los clips, el montaje (`montarReel`) y a su publicación
    estudio/montaje.js    El proyecto de video animado del montaje de un reel (`origen`: { tipo: "reel", encargoId })
    estudio/conMusica.js  «Publicar con música»: el video de una foto (crear, aprobar y renderizar, ligado a su publicación; no gasta
                          IA) y el carrusel a mano con la canción sugerida; la herramienta `publicar_con_musica` va por aquí
    estudio/ponerEnPost.js  Cambiar UNA publicación desde el servidor sin pisar a nadie (updated_at como condición, la cola, el aviso)
    estudio/cancion.js    «Video con tu canción»: sincronizar la letra con una canción ya grabada (Forced Alignment de ElevenLabs,
                          la voz aislada, Gemini o estimado; siempre con su confirmación), la sincronía en R2 (`canciones/…`),
                          crear el borrador con la canción de locución, el ajuste fino y volver a sincronizar
    estudio/ponerPiezas.js  «Poner en una publicación…» del Estudio (POST /api/estudio/<c>/poner): lo de la galería a un post
    estudio/mejoraVideo.js  «Mejorar mi video» en el servidor (POST /api/estudio/<c>/mejorar-video y `mejorar_video` del MCP): el
                          video de ESE cliente medido, el 409 con el costo, el encargo «mejora» y la UNIÓN con el audio original
                          (`pasoUnion` la encarga al Durable Object del render; `ejecutarUnion` es su alarma: clips, /unir por
                          versión, R2, galería), los fotogramas del original, la muestra de un color y los textos de los ganchos
    estudio/fondosVideo.js  Crear las IMÁGENES DE FONDO de un video animado con el director (un encargo del servidor, con su costo) y,
                          al cerrarse, ponerlas en el guion guardado (`ponerFondosEnVideo`)
    estudio/estilosVideo.js  Los ESTILOS DE VIDEO guardados: guardar uno de un video, renombrar, quitar y aplicarlo a otro (el kit, sólo
                          por aquí: `guardarKit(…, { conEstilos: true })`)
    estudio/guionVideo.js El contexto común de los guiones de video (`contextoDeGuion`): producto, cerebro, criterio, publicación
    estudio/herramientasReel.js  El video por MCP: crear_reel, estado_reel, continuar_reel, montar_reel, video_listo y
                          extraer_guion_ugc (sólo MCP: desde herramientas.js sería el ciclo de siempre)
    estudio/vistaMedios.js  Los AUDIOS y VIDEOS de la vista previa del chat de Claude: la muestra, la locución, la música, el mp4
                          de un video animado y los de un reel, con su dirección firmada; renovar una que caducó
    bandeja/              La Bandeja: webhook.js (la firma del webhook de Meta y qué dice un aviso;
                          puro), almacen.js (de quién es cada aviso y guardarlo fundiendo lo que
                          había), graph.js (suscribir la página, «Actualizar», responder, ocultar,
                          borrar y el mensaje privado)
  contenedor.js           Los Durable Objects de los CONTAINERS del video animado: el de los cuadros (lo arranca, espera a /salud,
                          lo duerme a los 2 min) y el del RENDER (uno por video, más grande: apunta el encargo y lo hace en su
                          alarma con lib/estudio/render.js)
  rutas/
    datos.js              CRUD: clientes, calendarios, chat, tareas, banco
    equipo.js             Miembros e invitaciones; la ruta pública del enlace
    ia.js                 Generación del calendario (Anthropic)
    iaEspacio.js          Modelos de la cuenta y consumo del mes
    chat.js               El asistente: streaming, bucle de herramientas de
                          servidor y resumen de conversaciones largas
    conversaciones.js     /api/chat/conversaciones: listar, empezar, renombrar, borrar, mensajes y el título con IA
    bancoIdeas.js         /api/banco-ideas: el banco único (listar, guardar, cambiar o asignar empresa, quitar; oEmbed)
    imagen.js             Generación de imágenes (Gemini) y las historias que complementan un post
    trozos.js             /api/media/trozos: subir un archivo grande por partes (multiparte de R2)
    video.js              Análisis de un video del banco (Gemini)
    adn.js                Lectura del ADN de marca con el token del servidor
    drive.js              Google Drive como banco: listar, miniatura, archivo,
                          subir, papelera, a-publicacion, migrar-banco
    iaEspacio.js          Modelos de la cuenta, consumo del mes y el medidor (/ia/gasto)
    redes.js              Conectar Meta, asignar cuentas, la cola (/api/publicar) y el
                          medio público firmado que descarga Meta
    youtube.js            /api/redes/youtube: conectar, la vuelta y el enlace del cliente (sin
                          sesión), elegir canal, privacidad, desconectar
    metricas.js           Resultados de un cliente, de la agencia y la miniatura de Meta
    informes.js           Informes: listar, generar, compartir; el público va en index.js
    auditorias.js         Auditorías: listar, generar, compartir; la pública va en index.js
    biblioteca.js         /api/biblioteca: buscar (GET) y los filtros guardados
    mercado.js            /api/mercado/<cliente>: catálogo, estudio por pasos, borrador, aprobar, referencias, «Proponer
                          ángulos» de un producto (POST …/estudio/angulos: al borrador)
    cerebro.js            /api/cerebro/<cliente>: notas, buscar, contexto, grafo, señales, aprender,
                          propuestas, importar, preparar, rubro, voz UGC y lenguaje del cliente
    estudio.js            /api/estudio/<cliente>: galería, trabajos (pedir, avanzar, cancelar,
                          reintentar), archivos, papelera y carpetas; el kit desde imágenes (POST …/kit/moodboard) y el
                          desglose de un video (POST …/archivos/<id>/deconstruir)
    mcp.js                El servidor MCP (/mcp), su OAuth (/oauth/*, /.well-known/*) y
                          el permiso y las conexiones (/api/mcp/*)
    vistaMedio.js         /api/vista-medio/<testigo>/<nombre>: un audio o video firmado para la vista previa del chat de
                          Claude, sin sesión y por trozos
    avisos.js             /api/avisos: la bandeja de quien pregunta y marcar leídos
    bandeja.js            /api/bandeja (comentarios y mensajes) y el webhook de Meta
                          (/api/webhooks/meta, sin sesión)
    anuncios.js           /api/anuncios: cuentas, campañas, estadísticas, crear, activar (admin + confirmado)
    plantillas.js         /api/plantillas-plan: listar, guardar (cambiar una de arranque o crear) y borrar/restaurar
    recetas.js            /api/recetas: listar, guardar (cambiar una de la casa o crear), borrar/restaurar y el handoff
    formulasUgc.js        /api/formulas-ugc (y /api/estructuras-guion, la misma): las estructuras de guion de la agencia (listar
                          con `?para=`, guardar, corregir, quitar, proponer desde un video transcrito o desde una voz en off)
    inspiracion.js        /api/inspiracion/<cliente>: el feed, actualizar, traer un archivo, el resumen
    loMejor.js            /api/lo-mejor: la ventana, clasificar, recrear (409 «confirmar» con el costo), traer, «Crear con Claude»,
                          el tope de créditos, releer los anuncios y el proxy de los videos del CDN de Meta
    historiasAuto.js      /api/historias-auto/<cliente>: ajustes, pendientes de preparar, piezas
    videos.js             /api/videos/<cliente>: los videos animados (listar, crear, guardar el guion, aprobar, borrar)
    sonidos.js            /api/sonidos/<cliente> y /api/sonidos/agencia: la biblioteca de sonido (listar, subir, cambiar, quitar,
                          «Deshacer», «Usar de la agencia», «Pasar a la agencia» y el audio de la agencia por trozos)
    ventas.js             /api/ventas/<cliente> (8 semanas, escribir, quitar, el enlace) y /api/publico-ventas/<testigo>
    whatsapp.js           /api/whatsapp/<cliente> (kit, proponer, voz, enlace, estudio, aceptar, quitar) y /api/publico-voz/<testigo>
container/                El Container del video animado (Node + @napi-rs/canvas + ffmpeg, Dockerfile): /cuadro, /hoja, /revisar y
                          /render (render.mjs) con el MISMO motor de src/lib; los clips de video (clips.mjs, PUT /clip/<id>);
                          /golpes (golpes.mjs: el ritmo de una canción, con ffmpeg y src/lib/golpes.js); /unir (unir.mjs: la
                          imagen de «Mejorar mi video» con el AUDIO que toca por tramo, el color y el texto del gancho;
                          /muestra-color y /fotograma); efectos.mjs (los efectos del catálogo, que la imagen trae en
                          public/efectos/v1, y los de la biblioteca; el audio por pistas del render y de la escucha);
                          /escuchar (escuchar.mjs: el mismo audio medido y su HOJA en PNG, con el espectrograma de ffmpeg);
                          probar.mjs, probarAudio.mjs, probarClips.mjs y probarUnir.mjs son sus pruebas (job «contenedor»)
migraciones/d1/           Esquema de D1: una migración por cambio, numeradas (`ls migraciones/d1` las lista con su nombre)
scripts/migracion/        Volcado desde Supabase, conversión e importación
scripts/efectos/          El catálogo de efectos: renderizar-earshot.py (el banco de earshot SIN sus modelos, sólo numpy y
                          scipy) y armar-catalogo.mjs (MP3, medidas con el código del render, licencias). Se corre a mano
                          una vez; lo generado se versiona (public/efectos/v1 y src/lib/catalogoEfectos.datos.js)
tests/
  utils/                  Lector de wrangler.jsonc y _headers, fallos e informe
  despliegue/             Plantillas, secretos, migraciones, funciones, acceso,
                          tiempo real, bundle
  migracion/              Conversión, capa de acceso, enlace público, equipo
                          y enrutado (pide las rutas del Worker de verdad)
  vivo/                   Levanta workerd y comprueba que el cambio de una
                          persona LLEGA al socket de la otra
```

## Lo nuevo y lo que cambió en noviembre de 2026 (mejoras de los 9 puntos)

Las líneas de cada área tal como las escribió quien la hizo. «(cambia)» o «…» = completa la línea de arriba del mismo archivo.

### Crear a mano

```
  lib/
    piezaEnSuSitio.js     La pieza que se crea DESDE una publicación, en SU sitio: la imagen que se tocó (o al final si el post
                          estaba vacío), sin ponerla dos veces y con la marca `piezaEnCurso` mientras se hace; la misma regla en
                          el panel y en el servidor (`ponerResultados` de encargos.js) (puro)
  components/
    cliente/Crear.jsx     (cambia) Crear tiene tres sub-secciones: «A mano» (el compositor arriba, recordado), «Director» y
                          «Galería»; `/cliente/<slug>/crear/a-mano`
    EstudioCompositor.jsx (cambia) en su chunk (lazy) y en tres bloques: QUÉ (formato post/historia/carrusel/video, idea, texto
                          exacto), CON QUÉ (producto, referencias, personajes, logo) y AJUSTES plegados con su resumen de una línea
                          (con EstudioCompositor.css); `QueCrear` es el selector único de formato y tipo de video
    EstudioElegir.jsx     «De la galería» del compositor: escoger VARIAS referencias en un diálogo («2 de 3», los huecos del
                          modelo) sin que la página salte
    EstudioVisor.jsx      (cambia) barra fija con Poner en…, Corregir, Otra versión, Descargar y «Más»; UNA «Corregir» con sus
                          atajos dentro (no cobran al primer toque); la pieza que llega se abre sola (`enCamino`, `onAbrirNueva`);
                          exporta `Pieza` (la miniatura de una pieza, también para la galería)
```

### La galería

```
  hooks/useBusquedaGaleria.js  Buscar en el SERVIDOR lo que la galería aún no cargó (mientras quede una página): lo
                          que vuelve se suma a lo que se ve (galería y «De la galería»)
    galeriaVistas.js      La galería vista y buscada, lo PURO que comparten la pantalla y el Worker: buscar (escena o ficha,
                          título, texto puesto, producto, la publicación donde se usa, modelo y fecha; sin tildes), la forma
                          (vertical, 4:5, cuadrada, horizontal), la fecha (semanas de lunes a domingo y meses de Panamá), el
                          producto, las carpetas de la aplicación (`esCarpetaAutomatica`, `esCarpetaCompetencia`) y por semanas
    escenaDelPedido.js    `ideaDelPedido`, sola (kitMarca.js la reexporta): la galería la usa sin cargar el kit entero
    estudio.js            (cambia) … filtros y VISTAS de la galería (`filtrarArchivos`, `contarVistas`, `VISTAS_GALERIA`),
                          `conPagina` («Cargar más»), `idsDeLaSeleccion`, `insigniasDe` (como mucho 3), `fechaDeTarjeta`…
    EstudioGaleria.jsx    La GALERÍA del Estudio, en su chunk (lazy): vistas («Lo último», «Carruseles y reels», «Me gusta»,
                          «Marca», «Competencia», «Sin carpeta»), carpetas (las de la aplicación en un desplegable), buscar y
                          filtrar, por semanas, «Cargar más», seleccionar en grupo (Me gusta, mover, agrupar, poner, papelera),
                          la papelera y Drive
    FiltrosGaleria.jsx    El buscador, el panel «Filtros» (tipo, formato, producto, uso, modelo, fecha) y los chips de las
                          vistas: los mismos en la galería y en «De la galería» (con EstudioGaleria.css)
    GaleriaSelector.jsx   (cambia) «De la galería» del panel de una publicación (y del chat): con la barra de la galería,
                          las versiones apiladas, por semanas, «Sin usar» de partida y «Cargar más»
    Estudio.jsx           (cambia) … la galería ya no está aquí: la pinta EstudioGaleria.jsx
worker/lib/estudio/galeria.js  (cambia) … la galería POR PÁGINAS (`archivosVivos`, `paginaDeGaleria`), buscar en toda
                          la galería (`buscarEnGaleria`), los usos de verdad también para la galería
worker/rutas/estudio.js   (cambia) … GET /api/estudio/<c>?hasta= y GET /api/estudio/<c>/galeria?antes= | ?q=
```

### El motor de textos

Línea NUEVA, junto a `camposTexto.js` / `escribirTextos.js`:

```
    motorTextos.js        El motor de textos como lo haría Claude: los EJEMPLOS del propio cliente (lo aprobado y lo que más
                          rindió, para el tono), el PLANIFICADOR del mes (mira todas las casillas y decide idea, gancho, ángulo y
                          porqué con un arco; lo decidido se guarda en R2 por casilla con su firma), la VARIEDAD (vecinas que
                          escogieron lo mismo) y el REVISOR (reescribe sólo lo flojo) (puro; lo usa el Worker)
```

Líneas CAMBIADAS:

```
    loteAnuncios.js       … (añadir al final:) el contexto por BLOQUES con su tope (`repartirContexto`, TOPES_CONTEXTO, ~15.000
                          caracteres), el papel del redactor, el pedido en dos partes (`partesDeProduccion`: lo FIJO, igual en toda
                          la tanda y en caché, y lo de cada llamada) y las OPCIONES de cada casilla (2–3 tácticas, formas del gancho
                          y ángulos válidos: la IA escoge, `escogidoDe`)
    camposTexto.js        … (añadir:) el pedido en dos partes (`partesDeCampos`) y las opciones de forma y ángulo
    control.js            … (añadir:) quita lo que el revisor ANOTA dentro de lo leído («(no debía aparecer)»: `limpiarLeido`) y pide
                          un JSON compacto
```

En el párrafo de `worker/lib/estudio/` (lote.js): «lote.js (la producción en lote: niveles, matriz, tipos y mes; escribe de dos en
dos con lo fijo en caché, el planificador del mes y el revisor)».

### El cerebro y GitHub

```
  lib/
    cerebroVista.js       La pestaña Cerebro: tipos, filtros, lo que se lee siempre y los grupos por archivo, frases de
                          resultado (también lo que hizo una sincronización con GitHub), documentos (puro)
    cerebroGitHub.js      La pestaña Cerebro y GitHub: varias vueltas de una importación sumadas, «Revisado en GitHub hoy a
                          las…», lo que de la carpeta no entra (PDF, Word, enormes, hondos) y la diferencia «La tuya / La de
                          GitHub» línea a línea (puro; aparte de cerebroVista.js, que carga también el asistente)
    datosCerebro.js       «Datos que no cuadran»: teléfonos y correos de la ficha, las cifras, la ficha del cliente y las
                          memorias que ninguna nota dice, y los PRECIOS que no son los del catálogo (puro; también el Worker)
  components/
    CerebroGitHub.jsx     Marca → Cerebro: cómo va con GitHub (última revisión, lo que no entra), los conflictos con la
                          diferencia y «Quedarme con la mía» / «Usar la de GitHub» nota por nota (o «Quitar sus N notas» de un
                          archivo que se fue), y «No se traen de GitHub» con «Volver a traer»
worker/
  lib/
    cerebro/              … importar.js (la sincronización SECCIÓN A SECCIÓN con GitHub: lo nuevo, lo que cambió, lo que ya no
                          está, lo que se borró aquí, conflictos), repositorio.js (el árbol en una petición —`leerArbol`, con
                          su huella y lo que no entra— y `descargar`; «Editar en GitHub»), estadoSync.js (la fila de
                          `cerebro_sync` de cada cliente y el permiso de una sincronización a la vez), sincronizar.js (la
                          sincronización con su aviso a la campana, resolver conflictos, «no traer» y `cerebroPendiente`, el
                          paso del cron) …
migraciones/d1/           … 0079 el cerebro sincronizado con GitHub (`seccion_hash`, `cerebro_sync`, `cerebro_conflictos`,
                          `cerebro_no_traer`)
```

Rutas nuevas de `worker/rutas/cerebro.js` (para su cabecera ya están escritas): `POST /importar` admite `auto`;
`GET /conflictos/<id>`, `POST /conflictos { ids, usar }`, `DELETE /no-traer/<id>`. El `GET /<cliente>` trae además
`conflictos`, `noTraer` y `estado.sync`, `estado.repoWeb`, `estado.delRepositorio`; `GET /nota/<id>` trae `github` (el
enlace «Editar en GitHub») si la nota viene del repositorio.

### Publicar y el cliente final

```
  lib/
    enviarCliente.js      «Enviar a cliente»: el número de WhatsApp de la ficha (8 cifras = Panamá, +507), el enlace
                          wa.me con el mensaje y «Lo abrió el martes a las 9:12» (hora de Panamá) (puro; sólo lo carga el diálogo)
    limitesAnuncio.js     Los topes de un anuncio (título 40, texto 600, descripción 30), solos: los lee lib/pauta.js (el panel
                          de cada publicación) sin arrastrar el estudio de mercado; estudioMercado.js los reexporta (puro)
    programarAprobadas.js «Programar lo aprobado» de UN calendario: guarda el mes YA, el SERVIDOR crea el lote (Container +
                          cola) y la pantalla lo SIGUE; sin Container (409 `sin_container`), el camino de antes (en diferido)
    aprobacion.js         (+) `respuestasDeFilas` / `diasConRespuestas`: las filas de `approvals` aplicadas a los días, como la
                          pantalla (Claude, el informe, el Inicio); `listaSinAprobar` (cliente que no aprueba antes)
    pilares.js            (+) las COMPOSICIONES de una pieza y `composicionDe` (salieron de loteAnuncios.js, que las reexporta)
  components/
    calendario/EnviarCliente.jsx  «Enviar a cliente» (salió de dialogos.jsx, en diferido): enlace, mensaje, «Abrir en WhatsApp»,
                          «Compartir…», cuándo lo abrió el cliente, «¿Este cliente aprueba antes de publicar?»
worker/
  lib/
    programarServidor.js  Programar desde el SERVIDOR: `prepararYProgramar` (una publicación: Container + cola; Claude), el
                          LOTE (`programar_lotes`: un paso = una publicación, la bomba del espacio, el cron de respaldo y la
                          pantalla que lo sigue), su aviso al cerrarse, «Programar al aprobar» de varias, /api/publicar/lotes
    aprobarTodas.js       «Aprobar todas» del enlace del cliente en UNA petición: todas o ninguna, un aviso, el lote si el
                          cliente tiene «Programar al aprobar», el cerebro
    equipo.js             (+) avisos agrupados de lo que responde el cliente (`avisarRespuestaCliente`, `textoDeRespuestas`),
                          «Enviar mi revisión» en la campana (`avisarRevisionCliente`), `destinatariosDe` (quien la lleva si
                          sigue en el equipo; si no, todos) y `reasignarTrabajoDe` (al sacar a alguien)
migraciones/d1/           (+) 0081 programar desde el servidor, cuándo abrió el cliente su enlace y si aprueba antes de publicar
```

### Que nada falle en silencio

En `src/lib/`:
```
    saludApi.js           Cliente de /api/salud (la salud del sistema y los saldos que se leen gratis) y de los avisos en el
                          teléfono (/api/avisos/push: permiso, `pushManager.subscribe` con la llave VAPID, quitar, prueba);
                          sólo lo carga Ajustes → Salud y avisos
```
En `src/components/`:
```
    SeccionSalud.jsx      Ajustes → «Salud y avisos» (lazy, con SeccionSalud.css): «Recibir avisos en este dispositivo» (todos;
                          el aviso del iPhone sin instalar) y, para el administrador, la salud del sistema: cada tarea del cron,
                          cada proveedor con su saldo y cada integración del espacio, plegadas si van bien
```
En `worker/lib/`:
```
    salud.js              Que nada falle en silencio: la cascada del cron con la salud de cada tarea (`correrCron`: un fallo se
                          cuenta y a los 3 seguidos la tarea se salta un rato; a la media hora avisa al administrador), la salud
                          de los proveedores apuntada en memoria donde ya se llaman (`anotar`, `seguido`) y volcada a D1 sólo al
                          cambiar (`volcarSalud`), el aviso del saldo agotado una vez por proveedor y día, la fecha límite del
                          cliente vencida (`limitesVencidosPendiente`), lo que enseña Ajustes → Salud (`estadoDeSalud`) y los
                          saldos que se leen gratis (Kie, ElevenLabs)
    push.js               Web Push sin librerías: las llaves VAPID (creadas solas en R2, `firmas/push-vapid.json`), el JWT ES256
                          (RFC 8292), el cuerpo aes128gcm (RFC 8291), qué avisos van al teléfono y `pushDeAvisos` (lo llama
                          `avisar()`; borra las suscripciones que contestan 404/410)
```
En `worker/rutas/`:
```
    salud.js              /api/salud (sólo el administrador): el estado del cron, los proveedores y las integraciones; /saldos
    push.js               /api/avisos/push: la llave pública, suscribir este dispositivo, quitar y el aviso de prueba
```
En `worker/lib/estudio/render.js` (línea existente), añadir: «… y `barrerRendersVencidos` (el cron, cada 5 minutos)».
En `public/sw.js` (si figura): «el ÚNICO service worker: POST /compartir y las notificaciones (push, notificationclick)».
`tests/despliegue/infra.live.test.js` (test:infra) suma «el cron corre y ninguna tarea lleva horas fallando» (por la API de D1,
sólo lectura; sin la tabla `salud`, no mide nada).
Migraciones: `0080 la salud del sistema, los avisos que se dan una vez y los dispositivos con avisos (Web Push)`.

### Velocidad y carga

```
publico.html              La entrada de las páginas del CLIENTE FINAL; `vite.publico.config.js` la construye en el mismo
                          dist/ y la copia a aprobar.html, informe.html, informe-anuncios.html, ventas.html, voz.html y
                          auditoria.html (Cloudflare contesta /aprobar con aprobar.html antes del respaldo de la SPA)
vite.publico.config.js    El SEGUNDO build (`npm run build` hace los dos): sólo publico.html, `emptyOutDir: false`, sin public/
src/
  main.jsx                La entrada de la agencia: la barrera de errores del armazón y `vigilarDespliegue()`
  publico.js              La entrada del cliente final: decide la página por la dirección ANTES de cargar nada y la
                          descarga con React y los estilos base, todo a la vez (sin el armazón de la agencia)
  publicoMontar.js        Monta esa página (React, index.css, la barrera de errores); sin JSX a propósito
  components/
    BarreraErrores.jsx    La barrera de errores: «Algo falló en esta pantalla · Volver a cargar»; en el armazón (completa),
                          alrededor de cada pantalla (se rearma con `llave`) y del asistente, las tareas y los diálogos
                          (flotante); un trozo que no llegó tras un despliegue recarga una vez
  lib/
    recargaDespliegue.js  La pantalla en blanco tras un despliegue: reconocer un trozo que no se pudo descargar, recargar
                          UNA vez (marca en sessionStorage, 30 s) y `vite:preloadError` (puro salvo `vigilarDespliegue`)
    fusionMes.js          Juntar lo mío con lo que otra persona guardó en el mismo mes (el 409 de la versión): por campo de
                          cada publicación, lo del mes y cada clave de `opciones`; base, mío y suyo (puro)
    reducida.js           La copia reducida de una imagen de R2 (`?mini=1`): la pintan el chip del mes, la cuadrícula del
                          perfil y la página del cliente (puro, sin importaciones)
worker/
  lib/estudio/miniaturas.js  (sumar:) la COPIA REDUCIDA de 480 px de las imágenes de publicación (`reducidas/<clave>.jpg`):
                          `sirveReducida` (`?mini=1`, con el permiso del original) y `crearReducida` (al subir y la
                          primera vez que se pide, con el Container)
```

Y en las líneas que ya existen:
- `src/lib/db.js`: «Llama a /api/*; conserva todas sus firmas; `saveCalendar` con `base` guarda con la versión leída y,
  si otra persona guardó entremedias (409), junta y vuelve a guardar; `leerCalendario` relee UN mes».
- `worker/rutas/datos.js`: «CRUD: clientes, calendarios (GET de un mes, el PUT con `X-Calendario-Version`), chat, tareas, banco».

### Claridad, guía y Claude

```
  lib/
    primerosPasos.js      «Primeros pasos» de un cliente: de las filas a banderas (`estadoDePrimerosPasos`, lo usa el Worker)
                          y de las banderas a los 8 pasos con su arreglo (`pasosDelCliente`) (puro, sin importaciones)
    glosario.js           «¿Qué es cada cosa?»: cada nombre de la aplicación con lo que hace y dónde está, y su filtro (puro)
    completitud.js        (cambia) ahora también `hashtagsDe` (exportarContenido.js la reexporta)
  components/
    PrimerosPasos.jsx     La lista «Primeros pasos» bajo el resumen del cliente: plegable, desaparece al completarse, «No mostrar
                          más» (lazy, la carga ResumenCliente; con PrimerosPasos.css)
    Glosario.jsx          «¿Qué es cada cosa?» del menú de la cuenta: el glosario en un diálogo con buscador, en un portal (lazy)
worker/
  lib/
    herramientasEquipo.js Lo del equipo por MCP: enlace_del_cliente (el enlace y el mensaje de «Enviar al cliente»), ver_avisos
                          (la campana de quien conecta; marcar leídos), ver_bandeja y ver_informes (sólo leen)
  rutas/
    primerosPasos.js      GET /api/primeros-pasos/<cliente>: lo que le falta para arrancar, en cinco lecturas cortas
tests/
  vivo/navegador.test.js  La prueba de humo EN CHROMIUM: entrar, un cliente, el panel de una publicación y /aprobar, sin errores
                          en la consola (Playwright: en CI lo instala el paso «Chromium para la prueba de humo»)
```

Nombres que cambian en lo que se ve (las direcciones y los ids internos NO cambian):

- El asistente del mes: **«Preparar el mes»** (era «Planificar mes» en la cabecera del cliente y «Producir el mes» en la barra del
  calendario; su diálogo, «Preparar noviembre 2026»). En la pestaña Calendario el botón de la cabecera no sale: está en la barra.
- El lote del Estudio: **«Muchas piezas de una vez»** (era «Producir varias piezas»). La tarjeta que lo contiene sigue «Muchas de una vez».
- **«Producción»** se queda para la cola (/produccion). El encargo de «Diseñar las aprobadas» se titula «Diseñar el mes» (sale en la campana).
- La acción del buscador «Nuevo calendario de X» → «Preparar el mes de X (nuevo calendario, planificar, producir)».

Frase para la nota de las instrucciones del servidor MCP (worker/rutas/mcp.js, junto al MÉTODO):

> Para mandarle el mes al cliente, `enlace_del_cliente` da el enlace de aprobación y el mismo mensaje de «Enviar al cliente» (nunca
> crea ni cambia el enlace); `ver_avisos` es la campana de quien conecta, `ver_bandeja` lo que espera respuesta en la Bandeja de un
> cliente y `ver_informes` sus informes con su enlace. Responder, generar o compartir se hace en la aplicación.

