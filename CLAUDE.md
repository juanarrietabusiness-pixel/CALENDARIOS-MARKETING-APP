# Notas del proyecto para Claude

Aplicación de la agencia **Juancito Ads** para planificar, generar y aprobar
calendarios de contenido de redes sociales.

## Cómo trabajar aquí

```bash
npm install
npm run dev        # interfaz sola (Vite, puerto 5173)
npm run dev:worker # aplicación + API sobre el runtime real (wrangler)
npm run lint       # oxlint — debe terminar sin errores NI avisos
npm run build      # build de producción a dist/
npm run deploy     # build + wrangler deploy
npm run sembrar    # alta del administrador (ADMIN_EMAIL / ADMIN_PASSWORD)
```

`npm run dev` sirve sólo la interfaz: las llamadas a `/api/*` no van a
ninguna parte. Para trabajar contra la API de verdad, `npm run dev:worker`,
que levanta el Worker con D1 y R2 en local.

**Las operaciones NO se hacen desde una consola.** Desplegar, dar de alta
al administrador, migrar datos y comprobar la infraestructura son
workflows que se lanzan desde la pestaña Actions de GitHub. El
procedimiento completo está en `DEPLOY.md`, y es sólo de navegador.

Y **Cloudflare no se conecta directamente al repositorio**: esa
integración construye y publica en cada push sin pasar por los tests. El
despliegue vive en `.github/workflows/desplegar.yml`, que corre
`npm run verificar` entero y dentro del mismo job antes de publicar
nada, para que no haya forma de saltárselo.

**Un cambio no está terminado hasta que está DESPLEGADO** (decisión de la agencia: dos veces se dio por hecho
algo que sólo estaba en la rama y en el sitio seguía el error). Al acabar: subir la rama, abrir el pull request,
esperar el job `verificar` en verde, unirlo a `main` y seguir el workflow «Desplegar» (`desplegar.yml`, que corre
solo con el push a `main`) hasta que termine bien. Si falla, se arregla y se vuelve a desplegar. Nunca decir
«está en la rama» como si fuera el final.

**Antes de dar por terminado cualquier cambio:**

```bash
npm run verificar
```

Es lint + tests + build + tests de bundle, en ese orden, y es exactamente
lo que ejecuta CI. Si pasa aquí, pasa allí.

**`npm run build` a secas ya vale.** Con Supabase no valía: sin las
`VITE_*`, Vite plegaba `isSupabaseEnabled` a `false`, rollup borraba el
panel entero y el bundle salía a 140 kB en vez de 570 sin que nada
fallara. Esa trampa murió con la migración —la API vive en el mismo
origen y no hay variable de la que dependa qué se compila—, y con ella
`build:verificado` y el canario del bundle.

### Tests

| Comando | Qué comprueba | Necesita |
|---|---|---|
| `npm test` | Lógica y todo lo que se resuelve leyendo el repositorio | Nada |
| `npm run test:bundle` | El `dist/`: peso, caché, minificado | Un build |
| `npm run test:vivo` | Que el cambio de una persona **llega** al socket de la otra | Nada (levanta `wrangler dev`) |
| `npm run test:infra` | El sitio publicado y la cuenta de Cloudflare | Llaves |
| `npm run verificar` | Los cuatro primeros en orden | Nada |

`tests/despliegue/` no comprueba que la aplicación funcione: comprueba
que **lo que se despliega es lo que se cree que se despliega**. La CSP y
las cabeceras —que ahora viven en dos sitios—, el esquema de D1, que
nadie consulte la base por fuera de la capa de acceso, que toda ruta
escrita esté enrutada, el presupuesto de descarga y las trampas de este
archivo. Nada de eso se ve mirando la pantalla: el sitio se ve igual con
la CSP puesta que sin ella.

Cada fallo se imprime con **qué, dónde, por qué importa y el arreglo**, y
CI compone con esos campos un `informe-despliegue.md` que sube como
artefacto y comenta en el pull request. El procedimiento para corregir
está en `.claude/skills/arreglar-despliegue/`.

**`main` está protegida:** sin el job `verificar` en verde no se puede
mergear. El nombre del job está en `ci.yml` y en el ruleset del
repositorio; si se renombra en uno, hay que renombrarlo en el otro.

Los tests de migraciones leen el SQL del repositorio: que pasen significa
que la corrección **está escrita**, no aplicada. Para lo aplicado está
`npm run test:infra`, que además busca lo contrario: Workers desplegados
que no estén en ningún commit. Eso ya pasó dos veces —`ai-chat` y
`image-gen`— y el síntoma nunca se parece a la causa.

## Arquitectura

Aplicación de una sola página en React 19 + Vite, con **direcciones de
verdad** (`/cliente/baby-caleb/agosto-2026`) resueltas por un router
propio de 150 líneas: `src/lib/rutas.js`. Sin dependencias nuevas —un
router de librería son 10 kB comprimidos para cinco direcciones— y sin
`hash`: el respaldo de la SPA de `wrangler.jsonc` sirve `index.html` para
cualquier ruta, así que recargar en cualquier sitio funciona.

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
    estudioMercado.js     El estudio de mercado: catálogo (productos y precios), lo general (perfiles, deseos de
                          Reiss, nivel de consciencia), los 7 elementos por producto, ganchos por nivel, textos de
                          anuncio, referencias de la competencia; pedidos a la IA, notas y documento (puro; también
                          lo importa el Worker)
    mercado.js            Cliente de /api/mercado (también el contenido de la competencia y traer un enlace de Instagram)
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
                          posiciones, entradas, salidas, bucles, transiciones, fondo, grano). Puro y determinista: lo
                          comparten la vista previa y el render del Container
    motorPiezas.js        Las PIEZAS del motor: iconos dibujados, cifra que cuenta, el dibujo libre (formas), los fondos de
                          estrellas y líneas, quitar el fondo liso del logo y su tono (puro: navegador y Container)
    motorComponentes.js   Los componentes del video animado que eran marcador: lista (escalonada), burbuja, reloj, antes y
                          después, teléfono (puro: navegador y Container; el motor le pasa sus ayudantes)
    personajeVideo.js     El PERSONAJE del video animado dibujado con código (bebé, niño, adulto; 5 expresiones, 6 poses) y su
                          aspecto por cliente (`kit.personajeVideo`) (puro: navegador y Container)
    motorVideoNavegador.js  Lo que ese motor necesita en el navegador: las imágenes de la galería, el logo, la letra del kit
                          y la textura del grano (no es puro)
    videosApi.js          Cliente de /api/videos/<cliente>
    subtitulos.js         Los SUBTÍTULOS por palabra: grupos por trozos de frase y parejos, la palabra clave, qué está dicho,
                          diciéndose o falta en cada instante (puro: lo leen el motor, la vista previa y el render)
    renderVideo.js        El RENDER a mp4: los cuadros, la voz en tramos con los silencios insertados (copiando muestras), la
                          ganancia a -14 LUFS, cuándo se puede renderizar (puro: lo leen el Container, el Worker y la pantalla)
    sonidoVideo.js        Lo que suena DEBAJO de la voz (aparte del guion): limpiar el sonido del video, la música con ducking,
                          fundido y repetida (puro: Worker, Container y pantalla)
    musica.js             La música con SUNO por Kie: modelos V6, el pedido limpio, el cuerpo de createTask, leer las dos
                          pistas, el costo (puro; también el Worker)
    directorMusical.js    El DIRECTOR MUSICAL: lo que el código cuenta del video (BPM por los cortes, silencios, momentos), el
                          pedido a la IA con la música de la marca delante, leer su propuesta (sin artistas) y el respaldo (puro)
    efectosSonido.js      Los efectos del video animado: whoosh en las transiciones y pop en sellos y llamados, sintetizados
                          (sin archivos) y mezclados bajitos; o los de la biblioteca (`muestrasDeEfecto`, `propios`) (puro: el Container)
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
    loteAnuncios.js       La producción en lote: las casillas (niveles, matriz deseos × perfiles × niveles, tipos),
                          la forma de cada pieza, el pedido y su lectura, la escena, la publicación y qué
                          composiciones funcionan con cada cliente (puro; también el Worker)
    loteEstudio.js        Cómo se arma cada pieza del lote (`pedidoDeLote`, lo que lee el director) y `ponerTexto` (la
                          compuesta recuerda su cruda: «Otra versión» sobre ella); los carruseles y reels del lote
    loteServidor.js       El lote que lleva el SERVIDOR: armar cada pieza como paso (`pasoDeLote`, con «{{ESCENA}}») y
                          lanzarlo; un carrusel del lote (`lanzarCarruselDeIdea`)
    encargosApi.js        Los encargos desde el navegador: pedir, seguir (`seguirEncargo`), lanzar un carrusel, terminar lo
                          que necesita lienzo (`terminarPaso`, una vez) y, al abrir la app, lo que quedó (`terminarPendientes`)
    laminaPedido.js       El pedido de UNA lámina completo (`armarLamina`): lo usan la pantalla y el servidor (puro)
    encargos.js           Los encargos del Estudio, lo compartido con el Worker: el hueco de la escena, topes y cómo se
                          cuenta cada pieza en pantalla (puro)
    edicion.js            Editar una imagen ya hecha: el pedido, con qué modelo, la proporción (puro; también el Worker)
    estructurasCarrusel.js  Las estructuras de un carrusel (errores, mitos, paso a paso…): rotar por tipo sin repetir (puro)
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
                          ponerlo (sólo rellena; el campo de su botón se reescribe) (puro; también el Worker)
    escribirTextos.js     El cliente del modo «campos»: un campo («IA» del panel y del banco), lo que falta del mes
                          («Completar», «Generar con IA» de la lista, «Planificar mes») (en diferido)
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
    revision3qApi.js      Cliente de /api/anuncios/clientes/<c>/revision, /etapas y /revision/pendientes
    planCiclo.js          El PLAN DE CAMPAÑAS (curso, entrega 6): las campañas del ciclo (presentación y evaluación en una cuenta
                          nueva, las cuatro con historial, y la de TEMPORADA si el mes trae oferta o fecha comercial), su
                          presupuesto (la inversión de los números del negocio × el reparto del Manual; en la campaña o en los
                          conjuntos), los conjuntos con públicos y exclusiones, qué pieza va en cada anuncio (ordenada por lo que
                          se aprendió de sus anuncios), la guía de montaje, las 5 hojas del Excel de estrategia y el texto (puro;
                          también el Worker)
    manualCiclo.js        Lo del Manual que lee el plan: el reparto por etapa (60/20/10/10, que sume 100) y los anuncios por
                          conjunto (4–6) (puro)
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
    VideoAnimado.jsx      «Animado con código»: los videos animados del cliente, el guion (errores con su sitio), la vista
                          previa en el lienzo y «Aprobar el guion» (lazy; dentro de FlujoReel)
    CrearVideoAnimado.jsx «Video nuevo»: idea o publicación, duración, formato y la estructura de guion → la IA escribe el guion (lazy)
    SelectorEstructura.jsx  «Estructura del guion» al escribir una voz en off (Video nuevo, el reel por planos): la IA escoge o una
                          de las de la agencia; «Ver las estructuras» (en el reel, lazy: el Estudio precarga el reel)
    GuardarEstructura.jsx «Guardar como estructura» de una voz en off (video animado o reel): la IA la abstrae y se abre en el
                          editor de las estructuras con «Voz en off» marcado (lazy)
    EditorEscenas.jsx     «Editar los textos»: lo que se dice, lo que se lee, tipo, pausa, orden de las escenas (lazy)
    LocucionVideo.jsx     «La voz» del video en su pantalla: ver el costo y generarla (lazy)
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
    VideoListo.jsx        «¿Está listo este video?»: en la pestaña Subir y en el visor del Estudio (lazy)
    calendario/avisoTemporada.jsx  «Se acerca …»: la fecha comercial del cliente en tres semanas y cómo reutilizar una pieza
    calendario/PlanSemanal.jsx  «Plan semanal de <empresa>»: el editor ÚNICO (`EditorSemana`: formato, tipo, hora y nota de cada día,
                          partir de un plan de la agencia); el diálogo de la barra, el asistente del mes y la ficha lo usan (lazy)
    calendario/fechasEspeciales.jsx  Escoger las fechas de un cliente (importante, ocultar, propias, IA)
    CalendarView.jsx      Vista de lista y de rejilla, filtros, generación, envío
    anuncios/AsistenteCampana.jsx  «Nueva campaña»: objetivo y destino (web o WhatsApp), públicos (1–3), anuncios (1–6, carrusel), revisar
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
                          crear_en_estudio y estado_trabajo: las mismas para el asistente y el MCP),
                          miniaturas.js (la copia reducida que VE Claude, por el Container),
                          herramientasDiseno.js (el DIRECTOR por MCP: guía, diseñar, estado del encargo, corregir, poner en
                          un post), catalogoDiseno.js (el catálogo para quien diseña: chat y MCP),
                          acabado.js (el texto de la plantilla y el logo estampado por el Container, sin pantalla),
                          higgsfield-schemas.json (SU documentación: campos, valores, obligatorios), elevenlabs.js (la voz
                          directo con la llave oficial), ideas.js
                          («Dame ideas»), lote.js (la producción en lote: niveles, matriz, tipos y mes), encargos.js
                          (la cadena del lote que sigue en el servidor) y bomba.js (lo avanza sin pantalla)
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
                          «Saber del rubro» y la «Voz UGC»; se guardan como nota)
    herramientasServidor.js  Lo que el asistente consulta sin el navegador:
                          web, el cerebro (notas cortas enteras), calendarios, tareas, ideas
    equipo.js             Avisos (guardar y anunciar), historial y asignaciones
    ids.js                UUID, testigos, huellas
    estructurasGuion.js   Las estructuras de guion del espacio para quien escribe en el Worker: leerlas por `para`, qué va al
                          pedido de una voz en off (la escogida o la lista para que la IA escoja) y cuál siguió
  videosProyectos.js    Los proyectos de video animado: crear, guardar, editar UNA escena y aprobar (la ruta y las
                          herramientas van por aquí)
    estudio/reelDelMes.js  Los reels de un mes (el asistente del mes): el costo sin crear nada y, con el sí, el encargo de cada uno
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
    estudio/ponerEnPost.js  Cambiar UNA publicación desde el servidor sin pisar a nadie (updated_at como condición, la cola, el aviso)
    estudio/ponerPiezas.js  «Poner en una publicación…» del Estudio (POST /api/estudio/<c>/poner): lo de la galería a un post
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
    mercado.js            /api/mercado/<cliente>: catálogo, estudio por pasos, borrador, aprobar, referencias
    cerebro.js            /api/cerebro/<cliente>: notas, buscar, contexto, grafo, señales, aprender,
                          propuestas, importar, preparar
    estudio.js            /api/estudio/<cliente>: galería, trabajos (pedir, avanzar, cancelar,
                          reintentar), archivos, papelera y carpetas
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
                          probar.mjs, probarAudio.mjs y probarClips.mjs son sus pruebas (job «contenedor»)
migraciones/d1/           Esquema de D1 (0001 base … 0012 aprobación, 0013 redes, 0014 métricas, 0015 informes, 0016 variantes, 0017 auditorías, 0018 mcp, 0019 tipo de aprobación, 0020 equipo, 0021 permisos de Meta, 0022 Haiku, 0023 un mes por cliente, 0024 cerebro, 0025 memoria de decisiones, 0026 estudio, 0027 modelo por función, 0028 youtube, 0029 comentarios y mensajes, 0030 biblioteca de anuncios, 0031 anuncios, 0032 fechas especiales, 0033 kit de marca, 0034 estudio de mercado, 0035 ritmo de contenido, 0036 inventario, 0037 plantillas de plan, 0038 campañas con varios conjuntos y anuncios, 0039 estratega, 0040 historial de anuncios, 0041 informe de anuncios, 0042 galería agrupada y repetidos, 0043 conversaciones del asistente, 0044 banco de ideas único, 0045 fórmulas UGC, 0046 inspiración, 0047 conversaciones de diseño, 0048 historias automáticas, 0049 encargos del Estudio: lote y carrusel, 0050 historias apartadas, 0051 notas fijas de los días, 0052 programar al aprobar por cliente, 0053 qué se le cambió a una nota, 0054 qué redes entran en el informe, 0055 hasta 5 historias automáticas al día, 0056 los días fijos de cada empresa, 0057 la lista aplicada de una auditoría, 0058 la caché de Scrape Creators, 0059 proyectos de video animado, 0060 sonido e historial de los videos, 0061 recetas y «Crear con Claude», 0062 «Lo mejor del momento»)
migraciones/d1/           Esquema de D1 (0001 base … 0012 aprobación, 0013 redes, 0014 métricas, 0015 informes, 0016 variantes, 0017 auditorías, 0018 mcp, 0019 tipo de aprobación, 0020 equipo, 0021 permisos de Meta, 0022 Haiku, 0023 un mes por cliente, 0024 cerebro, 0025 memoria de decisiones, 0026 estudio, 0027 modelo por función, 0028 youtube, 0029 comentarios y mensajes, 0030 biblioteca de anuncios, 0031 anuncios, 0032 fechas especiales, 0033 kit de marca, 0034 estudio de mercado, 0035 ritmo de contenido, 0036 inventario, 0037 plantillas de plan, 0038 campañas con varios conjuntos y anuncios, 0039 estratega, 0040 historial de anuncios, 0041 informe de anuncios, 0042 galería agrupada y repetidos, 0043 conversaciones del asistente, 0044 banco de ideas único, 0045 fórmulas UGC, 0046 inspiración, 0047 conversaciones de diseño, 0048 historias automáticas, 0049 encargos del Estudio: lote y carrusel, 0050 historias apartadas, 0051 notas fijas de los días, 0052 programar al aprobar por cliente, 0053 qué se le cambió a una nota, 0054 qué redes entran en el informe, 0055 hasta 5 historias automáticas al día, 0056 los días fijos de cada empresa, 0057 la lista aplicada de una auditoría, 0058 la caché de Scrape Creators, 0059 proyectos de video animado, 0060 sonido e historial de los videos, 0061 recetas y «Crear con Claude», 0063 de dónde sale un video animado, 0066 el plan semanal único, 0068 TikTok y tendencias por Scrape Creators, 0069 números del negocio, 0070 las ventas de la semana, 0071 la revisión 3Q, 0072 WhatsApp y la voz del cliente, 0073 qué publicación es cada anuncio, 0074 crear imágenes sin preguntar, 0075 la biblioteca de sonido de la agencia)
scripts/migracion/        Volcado desde Supabase, conversión e importación
tests/
  utils/                  Lector de wrangler.jsonc y _headers, fallos e informe
  despliegue/             Plantillas, secretos, migraciones, funciones, acceso,
                          tiempo real, bundle
  migracion/              Conversión, capa de acceso, enlace público, equipo
                          y enrutado (pide las rutas del Worker de verdad)
  vivo/                   Levanta workerd y comprueba que el cambio de una
                          persona LLEGA al socket de la otra
```

### Las direcciones

| Dirección | Qué es |
|---|---|
| `/` | Panel, sin cliente elegido |
| `/cliente/<slug>` | Un cliente |
| `/cliente/<slug>/<mes>-<año>` | Un mes del calendario de ese cliente (`octubre-2026`), exista o no su cajón. Los enlaces viejos con el nombre o el id del calendario siguen abriendo su mes |
| `/cliente/<slug>/crear` · `/crear/director` · `/crear/galeria` | Crear: el director («¿Qué quieres crear?») arriba y la galería del Estudio debajo, con lo manual en «Avanzado» |
| `/cliente/<slug>/referencias` · `/referencias/ideas` · `/inspiracion` · `/competencia` | Referencias: el banco de ideas, «Lo mejor» del cliente (`?pieza=<clave>` la señala) y la competencia del estudio de mercado |
| `/cliente/<slug>/marca` · `/marca/ficha` · `/kit` · `/sonido` · `/negocio` · `/whatsapp` · `/cerebro` · `/plan` · `/fechas` · `/drive` | Marca: ficha, kit y voz, música y efectos (la biblioteca de sonido), números del negocio, el kit de WhatsApp y la voz de los clientes, cerebro (con el estudio de mercado), plan semanal, fechas especiales y la carpeta de Drive, con el semáforo del kit arriba |
| `/cliente/<slug>/resultados` · `/resultados/redes` · `/resultados/anuncios` | Resultados del cliente: redes y la revisión 3Q de sus anuncios |
| `/cliente/<slug>/tareas` | Todas las tareas del cliente (con las que se repiten). Ya no es pestaña: su cabecera lleva a Mi día por empresa |
| `/cliente/<slug>/estudio` · `/diseno` · `/ideas` · `/inspiracion` · `/cerebro` · `/ficha` · `/contenido` | Las pestañas de antes: abren la nueva en su sub-sección (Crear → Galería / Director, Referencias → Ideas / Lo mejor, Marca → Cerebro / Ficha / Drive) sin reescribir la dirección, así `?lote=`, `?receta=` y `?pieza=` siguen |
| `/tareas` | Mi día (`?empresa=<id>`: la vista por empresa con la de ese cliente) |
| `/ajustes` | IA, presupuesto, integraciones, tareas, copia de seguridad |
| `/resultados` | Todos los clientes, últimos 30 días |
| `/produccion` | Producción: lo por producir (aprobado por programar, ideas por producir) y la cola de todos los clientes: lo que falló, lo que sale, lo que salió. `/programacion` (su nombre de antes) también |
| `/tablero` | Ya no existe: un enlace viejo abre Producción |
| `/bandeja` | Comentarios y mensajes de Facebook e Instagram de los clientes con la bandeja encendida |
| `/auditorias` | Auditorías de perfil de clientes y prospectos |
| `/biblioteca` | Anuncios → Biblioteca de anuncios: todos por Scrape Creators (con llave) o los de política por la API de Meta; filtros guardados, CSV |
| `/lo-mejor` | «Lo mejor del momento»: lo que mejor funciona de la competencia, la inspiración, los anuncios y lo propio, para recrearlo (`?pieza=<clave>` la señala) |
| `/campanas` | Anuncios → Campañas de Meta: cifras y crear (en pausa) |
| `/plan-campanas?cliente=<id>&mes=AAAA-MM` | Anuncios → Plan de campañas: el ciclo de un cliente y un mes para montarlo en el Ads Manager |
| `/auditoria?t=<testigo>` | Auditoría compartida (sin sesión) |
| `/conectar-claude?…` | El permiso de Claude (OAuth: `authorization_endpoint`) |
| `/a-mano/<calendario>/<publicación>` | Publicar a mano desde el teléfono |
| `/mcp` | El servidor MCP (del Worker, no de la SPA) |
| `/equipo` | Quién entra en el espacio |
| `/invitacion/<testigo>` | Enlace de invitación (sin sesión) |
| `/aprobar?t=<testigo>` | Página del cliente final (sin sesión) |
| `/informe?t=<testigo>` | Informe mensual del cliente final (sin sesión) |
| `/informe-anuncios?t=<testigo>` | Informe de anuncios del cliente final (sin sesión) |
| `/ventas?t=<testigo>` | «Tus ventas de la semana» del cliente final (sin sesión) |
| `/voz?t=<testigo>` | «Tu opinión»: la encuesta para los clientes del cliente (sin sesión) |

El slug sale del nombre normalizado, y `slugsUnicos()` garantiza que dos
clientes que normalicen igual no compartan dirección. Los nombres de las
pestañas (`PESTANAS_CLIENTE`: las nuevas, «tareas» y las de antes) están reservados: un calendario llamado
«Ideas» no puede quedarse `/ideas`. Un id en crudo
también resuelve, para los enlaces que alguien pegara antes.

### El tiempo real

Un **Durable Object por espacio** (`worker/hub.js`), con hibernación de
WebSocket. Cloudflare garantiza una sola instancia por espacio en todo el
mundo: las dos personas, estén donde estén, se conectan a la misma.

```
navegador ──HTTP──> Worker ──escribe──> D1
                       └──difundir()──> Durable Object ──WS──> los demás navegadores
```

Toda escritura de `worker/rutas/datos.js` lleva su `difundir()` pegado.
El aviso NO se espera: si el objeto tarda o falla, la escritura ya entró
en D1 y la respuesta no debe retrasarse por eso. Lo que se pierda se
repone al reconectar, porque **el socket es un atajo y D1 es la verdad**.

### Dónde viven los datos

Todo en Cloudflare: **D1** (`calendarios-db`) para las filas y **R2**
(`juancito-contenido`) para las imágenes. El navegador no consulta la base:
habla con el Worker, que es quien acota.

- **clients / calendars:** el navegador pide, el Worker acota por
  `owner_id`. D1 **no tiene RLS**: la red es `worker/lib/acceso.js`.
- **memberships / invitaciones:** quién entra en el espacio y con qué
  papel. Tienen dueño como las demás, así que pasan por la misma capa.
- **approvals:** las escribe el cliente final por el enlace público. El
  enlace avisa al espacio en el momento, así que la agencia lo ve sin
  recargar; el sondeo de `subscribeApprovals` sigue ahí, a un minuto,
  como red para cuando el socket esté caído. No hay botón de sincronizar.
- **imágenes:** en R2, y en el JSON va la clave, nunca los bytes.
- **banco de contenido:** la carpeta de **Google Drive** de cada cliente
  (`clients.drive_folder`, el id). La tabla `content_bank` es el banco
  de antes y se vacía con «Pasar todo a Drive».

### Qué significa `owner_id`

**El ESPACIO DE TRABAJO, no quien ha iniciado sesión.** Mientras hubo una
sola cuenta las dos cosas coincidían y el nombre no mentía; con dos
personas en la agencia, sí: los clientes son de la agencia y los ve igual
quien los creó que quien entró ayer.

El espacio se identifica por el id del administrador que lo fundó, así
que **las filas de antes siguen valiendo sin tocar ni una**: el
administrador ya era su propio espacio sin saberlo. La sesión devuelve
las dos identidades por separado:

| Campo | Qué es | Para qué |
|---|---|---|
| `usuario.id` | La persona | Quién firma un cambio, quién sale en la presencia |
| `usuario.ownerId` | El espacio | Qué filas puede tocar: es lo que recibe `crearAcceso` |
| `usuario.rol` | `admin` o `editor` | Sólo `admin` invita y saca gente |

Quien traduce «este usuario → este espacio» es `worker/lib/sesion.js`, no
la capa de acceso: la capa necesita el espacio para construirse, así que
no puede ser quien lo averigüe.

**Ninguna clave vive en el navegador, y ahora tampoco ninguna variable.**
Las de IA, la de GitHub y `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` son
secretos del Worker (`wrangler secret put`).

### Modelo de datos

```
cliente
  └── calendars[]
        └── days[]          un día natural del mes
              └── posts[]   una publicación
```

Una publicación tiene `format` (post/reel/carrusel/historia/live),
`status` (pending/approved/rejected/published), `idea`, `guion`,
`descripcion`, `hashtagsFinales`, `image`, `publishTime`.
El campo `script` es heredado: se conserva para no romper datos antiguos y se
lee como respaldo de `descripcion`.

## Convenciones

**Idioma.** Toda la interfaz está en español, con tildes y signos de apertura
(«¿», «¡»). Los identificadores del código están en inglés. Los comentarios,
en español.

**Estilos.** Hay un sistema de diseño en `index.css` con tokens
(`--fs-*` tipografía, `--sp-*` espaciado, `--tap` objetivos táctiles).
Los estilos en línea son habituales en este código; úsalos referenciando los
tokens (`fontSize: "var(--fs-sm)"`), no números sueltos.

- Nunca bajes de `--fs-3xs` (11px) en texto visible.
- Los campos de formulario van a 16px en móvil: por debajo, iOS Safari hace
  zoom al enfocarlos. Ya está resuelto en la clase `.input`.
- Los controles pulsables miden al menos `--tap` (44px); `--tap-sm` (36px)
  sólo para controles densos bien separados.
- **No concatenes variables CSS con sufijos de opacidad**
  (`"var(--accent)" + "44"`): produce CSS inválido que el navegador descarta
  en silencio. Usa los tokens `--accent-soft`, `--accent-line`, `--alt-soft`…
- **Superficies por elevación:** `--bg` < `--surface` < `--surface-2` <
  `--surface-3`. Sombras sólo en dos niveles: `--elev-1` (tarjeta que se
  despega) y `--elev-2` (capa flotante: menús, diálogos, panel lateral).
- **Tres radios:** `--radius-sm` (8), `--radius` (12), `--radius-lg` (16) y
  `--radius-pill`. Un hijo nunca lleva más radio que su padre.

**Iconos.** Todos salen de `components/Icon.jsx`: `<Icon name="trash" />`.
Son SVG monocromos que heredan `currentColor`, así que dentro de un botón
toman su color sin variantes.

- **No uses emoji como icono de interfaz.** Los dibuja el sistema operativo,
  cambian según la plataforma, traen color propio (el fondo blanco de 📋
  recortaba un rectángulo sobre los fondos azules) y no heredan el color.
- Para añadir uno, mete el `<path>` en el objeto `paths` de `Icon.jsx`
  usando la misma rejilla de 24 y trazo de 1.75.
- El icono de cada formato de publicación está en `FORMATS[x].icon`
  (constants.js), y `FORMAT_ICONS` mapea formato → nombre de icono.

**Marca.** El logo original (2048×2048, 1,3 MB) está fuera del repositorio;
lo que se versiona son los derivados optimizados:

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `src/assets/logo-mark.png` | Monograma, 192px, fondo transparente | Cabecera, diálogo de IA, pie de la página de aprobación |
| `public/logo.png` | Lockup completo con «JUANCITO», 512px | `og:image` |
| `public/favicon-32.png` | Sólo las letras «JA» sobre placa blanca | Pestaña del navegador |
| `public/apple-touch-icon.png` | Igual, 180px a sangre | Pantalla de inicio en iOS |

Dos decisiones a respetar si se regeneran:

- **El favicon lleva sólo las letras, no el monograma completo.** El megáfono
  y la constelación son ilegibles por debajo de 32px, y el azul de marca no
  contrasta contra el fondo oscuro del navegador. La placa blanca resuelve
  ambas cosas y funciona en tema claro y oscuro.
- **Las imágenes de la interfaz se importan** (`import logoMark from
  "./assets/logo-mark.png"`), no se referencian con ruta absoluta: el sitio
  también se publica en GitHub Pages bajo un subdirectorio y `/logo.png` se
  rompería. En `index.html` se usa `%BASE_URL%` por el mismo motivo.

**Layout.** El armazón es `.app-shell` > `.app-body` > `.app-sidebar` +
`.app-main` > `.app-content`. La barra lateral aparece a partir de 1024px;
por debajo, la lista de clientes es un cajón modal (`ClientDrawer`).
`--content-max` (1180px) limita el ancho de lectura: a pantalla completa
las líneas superaban los 150 caracteres.

**Accesibilidad.** Es un requisito, no un extra:

- Todo botón que sólo muestre un emoji necesita `aria-label`.
- Los emojis decorativos van con `aria-hidden="true"`.
- Cada campo lleva `<label htmlFor>` o `aria-label`. Usa `useId()` para los
  identificadores.
- Los diálogos usan `role="dialog"`, `aria-modal` y el hook `useDialogA11y`.
- Los botones de alternancia exponen `aria-pressed`; los desplegables,
  `aria-expanded` + `aria-controls`.
- Nada interactivo debe ser un `<div onClick>`.
- Los mensajes van a una región `role="status"` / `role="alert"`, no a
  `alert()`.

**Fechas.** Usa siempre `fmtDate()` de `utils.js`. No uses `toISOString()`
para obtener una fecha: convierte a UTC y desplaza el día en medio mundo.

**Secretos.** El navegador ya no recibe ninguna variable: la API va en el
mismo origen y no hay nada que configurar desde fuera. Las claves son
secretos del Worker (`wrangler secret put`) y nunca aparecen en
`wrangler.jsonc`, que sí se versiona.

La regla de oro sigue, y ahora es más afilada: el `connect-src` de
`public/_headers` es `'self'` **a secas**. Si alguna vez aparece ahí
`api.anthropic.com`, `api.groq.com`, `api.github.com` —o de nuevo
Supabase—, es la señal de que una clave ha vuelto al front: esas llamadas
son del servidor.

## Trampas conocidas

- `App.jsx` separa el enrutado (`App`), la puerta de acceso (`Panel`) y el
  estado (`Workspace`) a propósito: llamar hooks después de un `return`
  condicional rompe la regla de los hooks, y oxlint lo marca como error.
  `App` sí llama un hook ahora —`useRuta`—, pero antes de su primer
  `return`; la separación es lo que impide que alguien meta el siguiente
  después.
- **D1 no tiene RLS, y con una sola cuenta no se nota.** Supabase tenía
  dieciséis políticas haciendo de segunda red: aunque el código pidiera mal
  los datos, Postgres no devolvía filas de otro dueño. Aquí no hay nada. Una
  consulta a la que se le olvide el `owner_id` **no falla**: devuelve datos
  ajenos, en silencio. La red es `worker/lib/acceso.js`, que recibe el dueño
  **al construirse** —no en cada llamada, que es donde se olvidaría—, y
  `tests/despliegue/acceso.test.js`, que falla si aparece un `prepare()`
  fuera de los tres módulos declarados.
- **Una migración que no se puede reaplicar para el despliegue entero.** El
  esquema de la fase 1 se aplicó a mano sobre la D1 viva, así que
  `d1_migrations` quedó vacía: al desplegar, wrangler no sabía que
  `0001_esquema.sql` ya estaba puesto y lo reaplicó. Murió en la primera
  sentencia —«table users already exists»— y el paso «Desplegar el Worker»
  ni se intentó. El síntoma no se parece a la causa: el SQL era correcto y
  los 263 tests pasaban. Por eso **todo `create` del esquema lleva
  `if not exists`**, y `tests/despliegue/migraciones.test.js` falla si
  aparece uno que no lo lleve.
- **Las filas importadas no pertenecen a quien las tenía en Supabase.**
  El `owner_id` que traen es de un usuario de GoTrue, y en D1 no existe:
  el administrador se siembra aparte, con un UUID nuevo. La primera
  importación real murió en el primer cliente con «FOREIGN KEY constraint
  failed», que no dice ni qué clave ni por qué. Lo resuelve
  `resolverDueno()`, y tampoco casa por correo —aquí la agencia entra con
  uno distinto del que tenía—: con un dueño a cada lado la
  correspondencia es evidente, y con más de uno para en vez de adivinar.
- **Un ensayo que no toca la base no comprueba nada de la base.** El
  ensayo de la migración pasó en verde y la importación real cayó a la
  primera fila. Ahora las LECTURAS sí se hacen en ensayo —la de usuarios,
  que es la que faltaba—; sólo se saltan las escrituras.
- **La clave del banco de contenido lleva prefijo.** En Supabase la ruta
  era `{clientId}/{uuid}.jpg`; en R2 todo cuelga de `clientes/`, y la
  ruta de medios del Worker lo exige para saber de qué cliente es el
  archivo. Una clave sin prefijo no la sirve nadie, y el fallo es mudo:
  la fila está, el objeto está, y la imagen no carga. Lo normaliza
  `claveBanco()`, que usan el volcado y la importación para que la fila
  y el objeto coincidan.
- **D1 corta la fila a 2.000.000 bytes y la sentencia a 100.000.** Las
  imágenes iban en base64 dentro del JSON: el calendario de agosto ocupaba
  501.884 caracteres con 12 de 25 publicaciones ilustradas. Por eso viven en
  R2 y en el JSON va la clave. Si algo vuelve a escribir un `data:` ahí, la
  fila crece hasta que D1 la rechaza, y el límite de sentencia hace que ni
  siquiera se pueda importar con un `INSERT` literal: **siempre parámetros
  ligados**.
- **Sacar una imagen del JSON rompe dos cosas que nadie mira.**
  `export.js` mete `post.image` como `src` del HTML autónomo, que se abre
  como fichero local: una ruta `/api/media/…` no resuelve contra nada. Y
  `CalendarView.jsx` manda la imagen a Anthropic como base64. Los dos
  necesitan rehidratar desde R2.
- Las aprobaciones que llegan del sondeo se vuelcan sobre `days` **sólo en
  el estado** (`onUpdateCalLocal`). Persistirlas dispararía una escritura por
  respuesta. La tabla `approvals` es la fuente de verdad y se relee al cargar.
  `subscribeApprovals` conserva su firma: devuelve con qué pararlo, y sin eso
  cambiar de calendario deja sondeos vivos acumulándose.
- El HTML exportado por `export.js` es autónomo y usa manejadores `onclick`
  en línea. Es correcto: se abre como archivo local, fuera de la CSP del sitio.
- La CSP de `public/_headers` necesita `'unsafe-inline'` en `style-src`
  porque React aplica la prop `style` como atributo en línea. `script-src` no
  lo lleva y no debe llevarlo.
- **El tope de PBKDF2 sólo existe en producción.** workerd rechaza más
  de **100.000 iteraciones por llamada** a `deriveBits`
  —«Pbkdf2 failed: iteration counts above 100000 are not supported»—, y
  ese tope **no lo aplican ni `wrangler dev` ni Node**. Con 210.000 de
  una vez, entrar devolvía «Error interno» en el sitio publicado
  mientras en local funcionaba y los 278 tests seguían verdes. Por eso
  `derivar()` encadena vueltas de 100.000 hasta sumar las 600.000 que
  recomienda OWASP: el coste para quien intente adivinar la contraseña
  es el mismo y ninguna llamada pasa del tope.
  El caso que lo vigila espía lo que se le pide a `crypto.subtle`,
  porque ejecutarlo en cualquier entorno de pruebas pasa igual.
- **El alta y el acceso no pueden tener dos implementaciones del hash.**
  `scripts/sembrar-admin.mjs` reimplementaba PBKDF2 por su cuenta. Dos
  copias del mismo cálculo es una que se queda atrás: el día que una
  cambie un parámetro, el hash guardado deja de cuadrar y nadie entra
  —y el síntoma es «contraseña incorrecta», que no apunta a nada—.
  Ahora el script importa `hashearContrasena` del Worker, y un test
  falla si vuelve a nombrar `deriveBits`.
- **La página salía EN BLANCO y los 278 tests estaban en verde.** `base`
  de `vite.config.js` estaba condicionado a `GITHUB_ACTIONS` —de cuando
  el sitio se publicaba en GitHub Pages bajo un subdirectorio—, así que
  el build de CI, **que es el que se publica**, pedía los recursos en
  `/CALENDARIOS-MARKETING-APP/assets/…`. Esa ruta no existe; el respaldo
  de la SPA devuelve `index.html` con `content-type: text/html`; y el
  navegador se niega —bien— a ejecutar HTML como módulo. Título correcto
  en la pestaña, cero errores en el registro, y nada en pantalla.
  En local funcionaba, porque en local no hay `GITHUB_ACTIONS`.
  Lo peor: **un test exigía la condición** («usa base relativa cuando
  publica en GitHub Pages»), así que la suite defendía el fallo. Ahora
  hay tres guardas: `base` fija, un caso de bundle que comprueba que
  cada ruta de `dist/index.html` exista en `dist/`, y uno en vivo que
  exige que el JavaScript se sirva **como** JavaScript.
- **Las cabeceras de seguridad viven en DOS sitios.** `public/_headers` vale
  para el HTML y los recursos; **no se aplica a lo que genera el Worker**. Lo
  de `/api/*` lo pone `worker/lib/respuesta.js`. Traducir la configuración
  vieja a `_headers` y quedarse ahí deja la API sin `nosniff`, sin
  `Cache-Control` y sin CSP —y el sitio se ve exactamente igual—.
- **En D1 el boolean es 0/1, y `rowToCalendar` hace
  `row.share_enabled !== false`.** Con un `0`, eso da `true`: un enlace
  desactivado se vería activo. Las rutas convierten a booleano antes de
  devolver la fila; si se quita esa conversión, no falla nada, sólo miente.
- **El testigo de compartición se reutiliza, nunca se regenera.** Abrir el
  enlace de un calendario que ya lo tenía devuelve el mismo: generar uno
  nuevo mataría los enlaces que el cliente ya tiene en su correo.
- **Los modelos actuales piensan si no se les dice que no, y ese
  pensamiento se paga del mismo `max_tokens` que el texto.** (Historia:
  hoy el razonamiento va ENCENDIDO a propósito, ver la entrada siguiente.) Sonnet 5 corre
  en modo adaptativo cuando la petición no lleva `thinking`, y su
  presentación viene «omitida»: el bloque llega vacío. Una respuesta puede
  volver con `stop_reason: "max_tokens"` y **sin un solo bloque de texto**.
  Eso se veía como «la respuesta se cortó antes de completar ninguna pieza»,
  y subir el presupuesto o pedir menos publicaciones no lo arreglaba: sólo
  cambiaba cuánto razonaba. Porque escribir las fichas
  del lote es transcribir un calendario ya aprobado, no razonar. Lo fija
  `worker/rutas/ia.js` por nivel (`niveles()`) y en «calidad» lo apagaba.
- **Qué modelo y cuánto razona lo decide el ESPACIO, no el código.**
  Había tres modelos repartidos sin que se vieran: Haiku para casi todo
  el calendario —los guiones profesionales los escribía el más pequeño
  sin que nadie lo hubiera decidido—, Sonnet sin razonar para las fichas
  y Opus 5.5 fijo en el chat. Ahora TODA la IA de texto lee
  `ajustes_espacio.ia_modelo` («sonnet» por defecto, «opus» o «haiku») e
  `ia_razonamiento` («alto» por defecto), que cambia sólo el
  administrador en Equipo → Inteligencia artificial (`worker/lib/configIA.js`).
  El razonamiento va siempre encendido y se le suma su margen
  (`MARGEN_RAZONAMIENTO`) al presupuesto que pide el navegador: sin él
  vuelve la trampa de arriba. El `tier` que manda el navegador ya no
  elige nada. Imágenes y video siguen en Gemini.
- **Un id de modelo fijo es una apuesta sobre la cuenta, y se perdió.**
  Con `claude-opus-5-5` fijo, el primer «Hola» devolvió «El proveedor de
  IA devolvió un error»: la clave no tenía ese modelo y el mensaje
  genérico lo escondía (lo mismo que pasó con Gemini). Tres guardas:
  «opus» se resuelve preguntando a `/v1/models` cuál tiene la cuenta; si
  aun así la cuenta rechaza el modelo, se vuelve a Sonnet 5 y se avisa;
  y cualquier otro rechazo enseña el motivo de Anthropic
  (`mensajeDeRechazo()` en `worker/lib/anthropic.js`). Todo pasa por esa
  librería y en streaming: con razonamiento, una respuesta puede tardar
  minutos, y sin streaming la API rechaza lo que podría pasar de diez.
- **Cada llamada deja su costo en `consumo_ia`.** Es lo que enseña el
  contador del mes en Equipo. `registrarConsumo()` no puede tumbar una
  respuesta: si falla, se pierde un apunte, no el guion.
- **El asistente tiene DOS bucles, y cada herramienta vive en uno.** Las
  de servidor (búsqueda web y lectura de páginas de Anthropic; el cerebro;
  ver_calendario/tareas/ideas) las encadena el Worker sin
  volver al navegador. Las que ESCRIBEN en el calendario abierto siguen en
  el navegador, que sabe no pisar lo que la persona está editando: cuando
  el modelo pide una, el Worker cierra el turno con `resultadosServidor`
  y el navegador junta los suyos en el MISMO mensaje —la API exige todos
  los tool_result de una vuelta juntos—. Y lo que el Worker devuelve en
  `mensajes` se reenvía TAL CUAL: los bloques de razonamiento llevan
  firma, y tocados son un 400. Entre turnos no se reenvían: el historial
  guardado es texto.
- **La fuente del asistente es el CEREBRO, no el repositorio** (`INSTRUCCION_SERVIDOR` en worker/rutas/chat.js,
  `avisoDelCerebro` en api.js). Lo primero que leía era «el contexto trae un RESUMEN; si necesitas el detalle, lee el
  repositorio de GitHub», y esa lista ni nombraba `buscar_cerebro`: lo empujaba a datos de antes de corregirlos en el
  cerebro. Las herramientas del repositorio se QUITARON (el importador de la pestaña Cerebro sigue). Tres cosas más:
  · **Una nota de hasta `NOTA_ENTERA` (4.000) caracteres llega entera** (`buscar(…, { enteras })`); de las largas, dos
  pasajes con su ruta y `leer_nota_cerebro` la trae completa (también por MCP). Con dos pasajes por nota, la estructura
  de un guion llegaba a medias.
  · **`para_publicar: true` es el candado:** busca con `para: "texto"` y lo interno no existe; sin él, es una consulta
  del equipo y lo interno sale marcado.
  · **Con notas y sin ficha técnica, el asistente recibe el ADN de antes, y ahora SABE que hay cerebro** («puede estar
  desactualizado; gana el cerebro»). Sin notas, no se le nombra la herramienta. El asistente general sabe que cada
  cliente tiene el suyo y lo busca con `cliente`.
- **Las PAUTAS PARA ESCRIBIR son un tipo de nota que va SIEMPRE** (`pautas` en `SIEMPRE` de notas.js, como la ficha y
  las cifras): estructuras de guion, reglas de redacción, lo que la IA no hace nunca. `contexto()` las da aparte
  (`pautas`, hasta `MAX_PAUTAS`) y las quita de los pasajes; quien escribe en el Worker usa `textoParaEscribir(c)` (ficha
  + pautas + pasajes) o `bloqueDePautas` (mercado, estratega) y la propuesta del carrusel, que no busca, `pautasDe`. En el
  navegador van en `textoEstableDelCerebro` y, si el cliente aún no usa el cerebro, DELANTE de su ADN (`adnConPautas`):
  detrás, `sinCapaMaquetacion` se las llevaría con el último archivo. **Una pauta no puede ser interna** (`limpiarNota`):
  no llegaría a lo que escribe. Lo visual no las lee: para eso están las reglas del kit.
- **El asistente ya no crea memorias: PROPONE guardar en el cerebro y la persona decide** (`guardar_en_cerebro`,
  herramienta del NAVEGADOR: `pedirGuardarEnCerebro` en ChatPanel enseña `GuardarEnCerebro.jsx` y la promesa de la
  herramienta no se resuelve hasta «Guardar» o «No guardar»; el turno espera). Una regla de escritura va como `pautas`.
  Las memorias de antes se siguen leyendo y se borran por su id (`borrar_memoria`); la agencia las pasa a mano.
- **Lo que reescribe el asistente no cuenta como corrección de la persona** (`POST /api/cerebro/<c>/texto-ia`,
  `marcarTextoDeIA`): antes de aplicar un cambio de texto de `editar_publicacion` o del lote, el chat fecha la fila de
  `cerebro_usos` de esas publicaciones como «se le pidió texto a la IA», y lo que llegue en el guardado es la nueva base.
  Sólo toca las que ya tenían fila (sin ella no hay aprendizaje). Sin esto, «reescríbeme la descripción» restaba a las
  notas que se usaron como si alguien la hubiera corregido entera.
- **Lo que el asistente hace se guarda con su respuesta.** Va plegado como
  `[[contexto: Acciones realizadas]]`: antes sólo se guardaba el texto y
  «¿qué cambiaste ayer?» no tenía respuesta. El historial ya no se corta
  en 50 mensajes: pasado el umbral, lo viejo se pliega en `chat_resumenes`
  y el modelo recibe resumen + recientes enteros.
- **Al leer la respuesta de Anthropic hay que recorrer TODOS los bloques**,
  no `content.find(b => b.type === "text")`: basta un bloque de pensamiento
  por delante para que ese `find` devuelva `undefined` y el texto llegue
  vacío sin ningún error. La función devuelve además `diagnostico`
  (`stopReason`, tokens de entrada y salida, tipos de bloque) para no tener
  que deducir a qué se fue el presupuesto.
- El asistente y los modales se anidan dentro de `.overlay`; el scroll del
  fondo lo bloquea `useDialogA11y`, no hace falta añadir nada.
- **La carpeta del ADN se guarda escapada.** GitHub escribe los espacios
  como `%20` en la barra de direcciones, así que la ficha de un cliente
  acaba con `Baby%20Caleb/01_ADN_y_Memoria`. Las rutas del árbol que
  devuelve la API vienen SIN escapar: la carpeta no coincidía con ninguna,
  la lectura volvía vacía y el cliente parecía desconectado —sólo los
  clientes con un espacio en el nombre, que es lo que lo hacía invisible—.
  Lo deshace `decodeRutaGitHub()` en `lib/parse.js`, y la función lo
  decodifica otra vez por su cuenta para las fichas viejas. Además, una
  carpeta que no existe en el árbol ahora devuelve 404 con el nombre, en
  vez de 200 con todo vacío.
- **El panel lateral guarda al desmontar, no al pulsar cerrar.** El fondo
  oscuro y la tecla Escape llaman a `onClose` a secas: con el guardado
  colgado sólo del botón, todo lo editado —y todo lo que acababa de
  generar la IA— se perdía sin decir nada. Los tres botones que sacan la
  publicación de su sitio (borrar, mover, banco de ideas) levantan
  `yaEscrito` antes de reescribir el calendario ellos mismos: sin esa
  guarda, el guardado del desmonte llega con el calendario de antes y
  deshace lo que acaban de hacer.
- **El chip del mes reserva sitio para la barra de completado.** `.cal-post`
  lleva `position: relative` y 8px de padding inferior, y la barra va
  absoluta pegada al borde de abajo. La regla de móvil vuelve a declarar el
  padding: si se resetea a `3px 2px`, la barra se come el texto. La pista es
  un blanco translúcido y no un token de color porque el fondo del chip es
  un HSL calculado a partir de la categoría.
- **El chip del mes es un BOTÓN, y medía 24px.** Por debajo de `--tap-sm`
  (36) y de `--tap` (44), y encima arrastrable. Metía cinco cosas en una
  sola línea con `nowrap` —punto, icono, etiqueta, hora y barra—, así que
  la etiqueta acababa SIEMPRE en puntos suspensivos: el texto estaba y no
  servía. Ahora son dos filas en rejilla (`grid-template-areas`): arriba
  estado, formato y hora; abajo el texto a todo el ancho, hasta dos
  líneas. La hora en la misma fila le robaba media columna —la celda mide
  ~1/7 de la pantalla— y era la causa real del recorte, no la longitud.
  `--tap-sm` y no `--tap` a propósito: a 44px un mes de cinco semanas con
  cuatro publicaciones por día no entra en ninguna pantalla. Es el caso de
  «control denso» del sistema de diseño, y quien trabaje a dedo tiene la
  vista de lista.
- **En móvil el chip no decía NADA.** La regla de `max-width: 599px`
  ocultaba `.cal-post-label` **y** `.cal-post-time`, y el comentario decía
  «se reduce a icono + hora» —describía algo que el CSS no hacía—. Quedaba
  un punto de color y un icono de formato: en el teléfono no había forma
  de saber qué era ninguna publicación sin abrirla. Ahora la etiqueta va a
  dos líneas partidas por sílabas (`hyphens: auto`, «Carru-sel»); la hora
  sí se cae, que ahí no cabe. Y la rejilla va de borde a borde, sin hueco
  entre celdas: con cajas sueltas y el «+» ocupando media celda, el mes se
  veía pequeño y arrinconado. En el móvil el «+» es el hueco libre del día.
- **Algo puede llamarse «own X» y no acotar nada.** Las tres políticas del
  banco de contenido decían «can read/delete own content-bank» y su única
  condición era `bucket_id = 'content-bank'`: cualquier sesión autenticada
  leía —y borraba— los archivos de todos los clientes. Con una sola cuenta de
  agencia no se nota nada. Esa misma forma de fallo es la que la capa de
  acceso existe para impedir, y por eso sus tests recorren **todas** las
  tablas con dueño en un bucle: añadir una la mete en el test sola.
- **Algo desplegado a mano no está en ningún commit.** `ai-chat` corrió
  semanas con código que no estaba en el repositorio, e `image-gen` corrió
  meses entera sin existir aquí. El síntoma no se parece a la causa: campos
  que faltan, respuestas recortadas, y un diff limpio. `wrangler deploy` sube
  el Worker entero, así que el desajuste de «una carpeta se quedó fuera» ya
  no puede darse; lo que sí puede es una ruta escrita y **no enrutada**, y
  eso lo vigila `tests/despliegue/funciones.test.js`. El test en vivo busca
  lo contrario: Workers desplegados que nadie declara.
- **«No puedo» de la IA casi nunca es del modelo: es que no le diste la
  herramienta.** `publishTime` existe en el modelo de datos desde el
  principio, pero no estaba en el esquema de ninguna de las herramientas
  del asistente, así que a «ponle las 9 de la mañana» contestaba que no
  podía —y era verdad—. Antes de tocar el prompt o cambiar de modelo,
  mira `getChatTools()` (src/lib/herramientasChat.js) y el contexto de `buildChatSystemPrompt()`: lo
  que no está declarado ahí no existe para la IA.
  El mismo fallo al revés: los datos SÍ estaban —descripción y guion van
  en el contexto— y aun así decía que no podía leerlos, porque la lista
  de «QUIÉN ERES» enumeraba sólo crear, editar y eliminar. Un modelo se
  ciñe a lo que le dicen que puede hacer, aunque tenga el dato delante.
- **Un filtro declarado y no implementado no falla: acierta por
  casualidad.** `editar_publicaciones_lote` declaraba `filtro_dia`,
  `filtro_formato` y `filtro_categoria`, y el ejecutor **no los leía**:
  aplicaba los cambios por `post_id` y ya. Como la IA además mandaba los
  ids correctos, el resultado salía bien y nadie lo notó. El día que
  confiara en el filtro habría editado lo que no era. Ahora la lógica
  vive en `lib/lote.js`, que es pura y tiene sus casos.
- **Una hora que el campo no entiende se guarda igual y desaparece.**
  El modelo escribe «9am», «9:00 PM» o «21:30» según le venga. Si eso
  entra tal cual en `publishTime`, el `<input type="time">` —que exige
  «HH:MM»— lo muestra **vacío**: la IA dice que puso la hora, la fila se
  guardó, y la publicación no tiene hora. Lo normaliza
  `normalizarHora()`, y lo que no entiende se RECHAZA con un mensaje en
  vez de escribirse.
- **El asistente global vuelca TODAS las publicaciones en el prompt, y
  eso tiene fecha de caducidad.** Hoy son cuatro clientes y cabe. El
  coste se paga en CADA mensaje, aunque la pregunta sea «hola», y crece
  con la agencia: a partir de cierto punto desplaza la conversación y
  hay que cambiarlo por consultas —que la IA pida lo que necesita en vez
  de recibirlo todo—. La descripción ya se recorta a 120 caracteres para
  que quepa, que es la primera señal.
- **Un fichero de 3.000 líneas hace que las guardas dejen de guardar.**
  `CalendarView.jsx` tenía 3.034 líneas y diecisiete componentes dentro.
  El test que exige `useDialogA11y` en todo fichero con `role="dialog"`
  pasaba en verde **porque la cadena aparecía en algún otro sitio del
  mismo fichero**: bastaba con que uno de los diecisiete lo llamara. Al
  partirlo salió lo que tapaba — el desplegable de la hora se anunciaba
  como diálogo sin foco atrapado—. Con ficheros por componente, la
  granularidad del test es la del componente.
  Al partir también hay que declarar qué usa cada pieza, que es lo que
  el ámbito común no obligaba a hacer: dos de los componentes movidos
  arrastraban importaciones que nunca habían necesitado.
- **Un hook sin importar no lo ve el lint, ni el build: revienta al
  renderizar.** Al meter `useCallback` en `CalendarView.jsx` no se añadió
  al `import` de react. oxlint no lo marca, `vite build` compila, los 425
  tests pasan, y el bundle se publica. Falla al RENDERIZAR, con
  «useCallback is not defined» — y como el fallo está en el árbol de la
  vista CON SESIÓN, abrir el sitio sin entrar no lo reproduce: la
  pantalla de acceso se pinta perfecta. El síntoma es la página en blanco
  con el título correcto en la pestaña, igual que la trampa del `base` de
  Vite, y tampoco apunta a su causa.
  Lo vigila `tests/despliegue/capas.test.js`, que compara los hooks
  LLAMADOS con los importados en cada fichero. Sólo cuenta llamadas y
  descarta comentarios: `rutas.js` nombra `useState` al explicar por qué
  la dirección ya no es estado.
  La lección más general: **una refactorización que mueve código entre
  ficheros hay que probarla en la pantalla que usa ese código**, no sólo
  con `npm run verificar`. La que lo cazó fue cargar la vista autenticada
  en Chromium con una sesión de verdad.
- **Y no eran sólo los hooks: el mismo corte se dejó cuatro
  constantes.** `FORMAT_ICONS`, `fieldHeaderStyle`, `vivo` y
  `CAMPOS_EXPORTABLES` se quedaron sin importar al partir
  `CalendarView.jsx` en seis ficheros. Con ellas quedaron rotos el
  **panel de edición de una publicación** —el centro de la aplicación—,
  el banco de ideas en cuanto tiene algo dentro, el diálogo de «Exportar
  ideas y descripciones» y «Agregar publicación». Los cuatro revientan
  al abrirlos con «FORMAT_ICONS is not defined», y los cuatro estuvieron
  así **en producción** con todo en verde: lint limpio, 426 tests, build,
  bundle y tiempo real.
  Por qué no lo vio el caso de arriba: vigila los HOOKS. La forma del
  fallo no es «un hook sin importar», es **un identificador sin
  importar**, y ahí caben las constantes.
  Lo cubre ahora `no-undef` en `.oxlintrc.json`, que corre en
  `npm run lint` y por tanto en `verificar` y en CI. Lleva `env.browser`
  a propósito: sin declarar el entorno marcaría `document`, `window` y
  `fetch` en cada fichero, y esa avalancha es justo la razón por la que
  alguien acabaría apagando la regla. Que siga encendida —y con su
  entorno— lo vigila `tests/despliegue/capas.test.js`.
  Y la lección de la entrada anterior, otra vez: **lo que caza esto es
  abrir la pantalla**. El panel de edición no se abre desde la lista
  —hay que desplegar el día y pulsar «Editar publicación»—, así que un
  barrido que sólo pulsa lo que se ve a primera vista lo da por bueno.
- **Un desplegable anclado a un botón NO es `role="dialog"`.** Ese rol
  le promete a un lector de pantalla foco atrapado y fondo inerte. El
  selector de hora se cierra con Escape y con un clic fuera, y el fondo
  sigue navegable a propósito: es `role="group"`. Poner el rol de
  diálogo «porque flota» obliga después a meter un `useDialogA11y` que
  rompería justo lo que hace que funcione.
- **Rellenar no es reescribir.** «Generar guiones» sólo escribe donde no
  hay nada: lo que ya tiene texto gana sobre lo que devuelve el modelo.
  Y lo que le falta a una publicación depende de su formato —un post sólo
  lleva caption; un reel, además, guion—, así que un reel que llega del
  asistente con la descripción escrita sigue entrando a por su guion.
- **El acceso ponía la cookie y no cambiaba de pantalla.** `Login.jsx`
  llamaba a `signIn()` y **no hacía nada con lo que devolvía**: el
  comentario decía «no hace falta navegar, onAuthStateChange levanta el
  workspace», y `onAuthStateChange` se fue con Supabase. Aquí no hay
  ningún canal que se dispare solo. El servidor respondía 200, ponía la
  cookie `__Host-`, y la pantalla de acceso se quedaba quieta; al
  recargar sí entrabas, porque el arranque pregunta a `/api/yo`. Ahora
  `useSession` devuelve `setSession` y Login lo llama —igual que
  `Invitacion`—. Lo vigila `tests/despliegue/tiempo-real.test.js`.
  **La regla general: la sesión es de quien la pinta.** Cualquier pantalla
  nueva que abra sesión tiene que propagarla a mano.
- **Qué se está mirando NO es estado: es la dirección.** `selectedClientId`
  y `selectedCalId` eran `useState`, y por eso recargar devolvía al
  principio, el botón de atrás sacaba de la aplicación y no había forma de
  mandarle a nadie «mira esto». Ahora salen de la URL con `porRuta()` y se
  cambian con `navegar()`. Dos cosas que hay que recordar al tocarlo:
  `pushState` **no dispara `popstate`**, así que `navegar()` lo lanza a
  mano o la barra cambia y la pantalla no; y justo después de crear algo,
  el slug hay que calcularlo sobre la lista **que va a haber**, no sobre la
  que hay, o se navega a una dirección que todavía no resuelve.
- **El Durable Object te devuelve tu propio guardado, y te pisa lo que
  estabas escribiendo.** El evento de un cambio va a TODOS los conectados
  —llegó por HTTP, así que el objeto no sabe de qué socket salió—, y eso
  incluye a quien lo hizo. Aplicarse el propio eco parecía inofensivo
  hasta que se ve el síntoma: guardas, sigues tecleando, y a los 300 ms
  el cursor salta y la última palabra desaparece. Lo corta el id de
  **PESTAÑA** (`X-Pestana` en `src/lib/db.js`, que vuelve en `por.tab`).
  Por pestaña y no por persona a propósito: el panel abierto en el
  portátil y en el móvil sí tiene que verse.
- **Un evento que el servidor manda y nadie recoge no falla.** La
  escritura fue bien, la respuesta fue 200, y la otra persona sigue
  viendo lo de antes hasta que recargue. Con una sola sesión abierta
  —que es como se mira siempre— es invisible. Por eso hay un test que
  compara los `tipo: "x"` del Worker con los `case "x"` de `App.jsx`: si
  añades un evento y no lo atiendes, falla al escribirlo, no en
  producción.
- **Que el tiempo real esté ESCRITO no es que llegue.** Los 27 casos de
  `tests/despliegue/tiempo-real.test.js` se resuelven leyendo ficheros:
  comparan los `tipo:` con los `case`, buscan el `difundir()` pegado a
  cada escritura, comprueban que el objeto usa `acceptWebSocket`. Con
  todos en verde, el tiempo real puede estar muerto: entre lo escrito y
  lo que llega están el binding `HUB` —sin él `difundir()` hace `return`
  y no se entera nadie—, la ruta `/api/live`, la cookie que el socket
  lleva o no lleva, y que las dos personas caigan en el **mismo** objeto.
  Las cuatro fallan calladas, con la misma cara: la fila entra en D1, la
  respuesta es 200, y la otra persona sigue viendo lo de antes.
  Lo ejecuta `npm run test:vivo` (`tests/vivo/`), que levanta workerd de
  verdad y mira el socket de la otra persona. Trece segundos, sin llaves,
  y está dentro de `verificar`: un test que sólo se lanza a mano no
  defiende nada.
- **`/api/entrar` no existe: la ruta de acceso es `/api/acceso`.** Pedir
  a una ruta que no está devuelve **401 «No autenticado»**, no un 404,
  porque la comprobación de sesión va antes de que nadie mire el camino.
  Así que un error de nombre se disfraza de «credenciales incorrectas» y
  se puede pasar media tarde depurando el acceso. Un 401 sólo dice algo
  del acceso si el cuerpo es «Usuario o contraseña incorrectos.».
- **Una escritura remota no puede pisar lo que tienes a medias.** Si
  alguien guarda el mismo calendario que estás editando, aplicar su
  versión te borra el buffer sin decir nada. `App.jsx` comprueba
  `pendingSaves`/`saveTimers` antes de aplicar y, si hay algo pendiente,
  **avisa en vez de pisar**: lo tuyo se queda, y se ofrece releer.
- **En los Durable Objects, `new_sqlite_classes` y no `new_classes`.**
  Los de almacenamiento SQLite son los que entran en el plan gratuito;
  con `new_classes` el despliegue pide plan de pago y el error habla de
  facturación, no de que la clase esté mal declarada. Y la clase se
  **reexporta desde `worker/index.js`**, que es el módulo al que apunta
  `main`: exportándola sólo desde `hub.js`, el despliegue muere con
  «class not found».
- **Un aviso que aparece solo cada poco deja de querer decir algo.** El
  sondeo de aprobaciones anunciaba «tu cliente acaba de responder» en
  CADA vuelta, respondiera alguien o no. Ahora compara una huella de lo
  que ya había visto y sólo habla si de verdad cambió algo.
- **Sacar a alguien del equipo borra su cuenta, no sólo su pertenencia.**
  Dejar la cuenta viva sin fila en `memberships` es peor: al volver a
  entrar, la resolución de espacio la trata como un administrador sin
  sitio y le funda un espacio propio y vacío. La persona ve una
  aplicación que funciona y no tiene nada dentro, y nadie sabe por qué.
  Al fundador no se le puede sacar: ahí la cascada sí se llevaría los
  clientes y los calendarios, que cuelgan de su id.
- **La subida de imágenes estaba escrita, desplegada y muerta.** `POST
  /api/media` iba en un `if` posterior al que valida la clave, y a `POST`
  no le llega ninguna clave: `partes` vale `["media"]`, la clave sale
  vacía, y el `if (!m) return noEncontrado("Archivo")` de arriba
  contestaba 404 antes de que nadie mirase el método. Leyendo el fichero
  las dos ramas están ahí y las dos parecen bien. Es la misma forma del
  fallo de `ai-chat` —código en el commit que no se ejecuta nunca—, pero
  DENTRO de `worker/index.js`, donde `funciones.test.js` no llega: ese
  test sólo vigila `worker/rutas/`. Lo cubre ahora
  `tests/migracion/enrutado.test.js`, que **pide las rutas de verdad**
  con un `env` de mentira en vez de leer el fichero. Si añades una rama a
  esta puerta, ponle su caso ahí: leerla no basta para saber si alguien
  llega.
- **`.wrangler/` no se versiona.** Estuvo versionado por descuido hasta
  que se sacó. Es la D1 y el R2 de `wrangler dev`: cada arranque
  reescribe catorce ficheros `.sqlite-shm`/`.sqlite-wal`, y quien levante
  el Worker en local contra datos de verdad acaba con clientes reales
  dentro de un binario que nadie mira antes de hacer commit. Misma
  familia que `scripts/migracion/datos/`. (El que había en el historial
  estaba vacío: no llegó a colarse ningún dato.)
- **El asistente crea imágenes y videos POR EL ESTUDIO y los entrega en el chat** (`generar_imagen` con `tipo`, `estilo`,
  `confirmado`; `src/lib/piezaChat.js`). Con un cliente abierto va por el camino de UNA pieza (kit, logo, fotos del
  producto que nombra, modelo fijado) y el navegador espera el trabajo; desde 0,50 $ devuelve «NO SE CREÓ NADA» con la
  cifra y sólo con el «sí» se repite (salvo «crear imágenes sin preguntar» del espacio: ver «La confirmación de 0,50 $ se
  puede fijar»). Sin cliente, la imagen de Gemini de siempre. El video llega como `[[video: clave]]`.
- **Lo que no es prosa en el chat viaja DENTRO del texto, como marca.**
  `chat_messages.content` es texto, así que las piezas copiables
  (`[[pieza: …]]`), las imágenes generadas (`[[imagen: clave | formato]]`)
  y el análisis de lo adjuntado (`[[contexto: …]]`) se guardan como
  marcas y `partirMensaje()` (`lib/mensajeChat.js`) las convierte en
  bloques al pintar. Las de pieza las escribe el MODELO porque se le pide
  en `INSTRUCCION_PIEZAS`: si un día salen juntas otra vez, mira el prompt
  antes que el pintado. Una clave de imagen que no cuelgue de `clientes/`
  se queda como texto: nunca llega a un `src`.
- **La API de Claude no recibe video.** El video lo ve Gemini
  (`worker/rutas/video.js`, por su Files API para no pasar decenas de
  megas a base64 dentro del Worker) y el análisis escrito se guarda en el
  mensaje del usuario, para que el hilo lo recuerde después. Los
  fotogramas los saca el navegador y sólo viajan en ese turno. Un video
  subido desde el chat se guarda antes en el banco del cliente: el
  análisis lee de R2.
- **`post.image` es una ruta `/api/media/…`, y el cliente final no tiene
  sesión.** La página de aprobación la reescribe a
  `/api/publico/<testigo>/media/…` (`srcPublico()`), y `mediaPermitida`
  acepta la imagen en las dos formas. El HTML exportado las incrusta
  antes de construirse (`conImagenesIncrustadas`), y lo que se manda a la
  IA pasa por `base64DeImagen()`: mandar la ruta como si fuera base64
  hace que Anthropic rechace la petición entera. Las imágenes viejas en
  `data:` siguen valiendo.
- **Las tareas terminadas se borran solas al LEER, no con un cron.**
  `purgarTareas()` corre en cada GET de tareas según
  `ajustes_espacio.purga_tareas`. Una tarea recurrente no se borra nunca
  —ni a mano ni sola—: es la definición de algo que vuelve.
- **Una tarea recurrente se completaba una vez y no volvía nunca.**
  `recurrence` se guardaba y se pintaba, pero nada la reabría: la de los
  lunes, hecha un lunes, seguía cerrada para siempre. Ahora el Worker la
  reabre AL LEER (`reabrirRecurrentes()`, junto a la purga) cuando empieza
  su periodo siguiente. Las fechas las calcula `src/lib/agenda.js`, el
  MISMO módulo que usa «Mi día»: dos copias de «qué semana es» acaban
  discrepando, y entonces la tarea sale atrasada en pantalla y cerrada en
  la base. El «hoy» es el de Panamá (`fechaEnZona`), nunca `toISOString()`.
- **Marcar «Hoy» una atrasada no la sacaba de Atrasadas.** `fechaObjetivo()`
  tomaba la fecha MÁS TEMPRANA entre `today_date`, `due_date` y el periodo,
  así que una tarea que vencía ayer seguía atrasada aunque se pasara a hoy, y
  no había forma de reagendarla. Ahora `today_date` es el día PLANEADO
  («Hoy», «Pasar a hoy», «Mover a…») y manda mientras no haya pasado; dentro
  del plan gana lo más temprano que no haya pasado (vence mañana y la
  planeaste el viernes: es de mañana). Un plan que ya pasó la deja atrasada,
  y el plan de una recurrente sólo vale dentro de su periodo: el «Hoy» de la
  semana pasada no la deja atrasada esta. La fecha límite no se toca al mover.
- **Mi día va por prioridad: Hoy arriba, los avisos de la cola, y luego Atrasadas.** Con lo atrasado delante, lo de
  hoy quedaba debajo de todo. Hoy se ORDENA (arrastrar o flechas, `useArrastrarOrden`, que reescribe `position` sólo
  de las que cambian y mezcla las dos tablas: la posición sólo se compara dentro del bloque). Una tarea nueva va al
  final (`position` = la mayor + 1): con 0 saltaba delante de lo ordenado. Cada aviso de publicaciones se OCULTA
  hasta que cambia (`midia-ocultos:<persona>` en el navegador guarda la huella de lo que decía) y lo que falló se
  descarta ahí mismo. Además los fallos se limpian solos al guardar el calendario (`resincronizarCalendario`): si la
  publicación se quitó, se publicó a mano o pasó a «La publico yo», la fila en error pasa a cancelada con el motivo.
  «Sin fecha» se llama «Por agendar» y va abierto: las tareas rápidas del inicio no tenían día y caían ahí, plegadas,
  donde nadie las veía. Por eso el inicio enseña ahora «Tus tareas de hoy» (las mismas de Mi día) y lo que se apunta
  lleva su día. Al crear una tarea, en Mi día, en el inicio o en una empresa, se escoge el día (`ElegirDia`).
- **El panel de tareas es el asistente con otro contenido:** acoplado desde
  1280 px en el mismo sitio (`.app-shell[data-lateral="acoplado"]`, antes
  `data-chat`) y cajón por debajo. Uno a la vez: abrir uno cierra el otro.
  «Hoy» no se pliega; lo demás sí y se recuerda por navegador, igual que si se
  dejó abierto. «Mías» incluye lo SIN ASIGNAR: en un equipo pequeño eso es de
  todos, y escondido no lo vería nadie. Las acciones viven en `useTareas`, que
  usa también Mi día: dos copias de «pasar a hoy» acabarían discrepando. Tras
  cada cambio propio lanza `tareas:cambio` en `window` para que el contador de
  atrasadas relea: el eco de la propia pestaña se descarta y el `pulso` no sube.
- **«Convertir en tareas»** parte las notas por viñetas (`partirNotas()`): es
  como la agencia apuntaba en Google Tasks («TAREAS JUAN» con cinco cosas
  debajo), cómodo para anotar pero sin poder marcar una sola. Las nuevas
  heredan empresa, persona y fechas; la de origen se queda y se ofrece
  borrarla. «Dcasa: revisar copys» en «Agregar una tarea» la deja en Dcasa
  (`empresaDelPrefijo()`, sólo si es el nombre de una empresa: «Reunión: 9:30»
  sigue siendo un título).
- **Las fechas de las tareas se escogen en un calendario, no se teclean.**
  El `<input type="date">` pedía día, mes y año a mano y cada navegador lo
  pintaba distinto. `SelectorFecha` abre el mes y se toca el día. Va en un
  PORTAL con posición fija y su propio nivel (`--z-sobre-dialogo`): dentro
  del panel de tareas (`overflow: hidden`) o del diálogo de edición, un
  desplegable normal salía recortado o debajo del fondo oscuro. Es un
  desplegable, no un diálogo: rol de grupo, Escape y clic fuera.
- **«Hoy» es una FECHA, no un sí/no.** `today_date` guarda el día en que
  se marcó: si no se hace, al día siguiente queda en el pasado y la tarea
  pasa sola a Atrasadas sin que nadie la desmarque.
- **El saldo de Anthropic se acabó sin que nadie lo viera.** El contador
  existía, al fondo de Equipo, sin tope, y sin contar ni la búsqueda web
  (10 $ por 1.000) ni lo que se paga a Google. Ahora: medidor en la
  cabecera, Ajustes con presupuesto (`presupuesto_usd`, 30 $ por defecto)
  y qué hacer al llegar (`al_limite`: avisar, bajar a Sonnet Bajo o
  detener, 402). TODA llamada de IA pasa por `prepararIA()` (texto) o
  `bloqueoPorPresupuesto()` (Gemini) antes de salir, y por
  `registrarConsumo()`/`registrarConsumoGemini()` al volver. Una ruta de
  IA nueva que se salte cualquiera de las dos gasta sin tope o sin
  apuntarlo. Lo que gaste OTRA aplicación con la misma clave no lo ve
  nadie aquí: sólo la consola de Anthropic.
- **Escribir caché que nadie lee cuesta un 25 % más.** El consumo real
  del asistente enseñó 49.000 tokens escritos en caché y 0 leídos: los
  mensajes llegaban con horas de diferencia y la caché dura cinco
  minutos. El navegador manda `seguido` (menos de 4,5 min desde la
  anterior) y el Worker sólo marca caché entonces o desde la segunda
  vuelta del bucle, que sí la lee.
- **La generación mandaba el ADN entero, sin caché, y con la maquetación
  dentro.** `docs/auditoria-conexion-adn.md` decía que el ADN iba marcado
  con `cache_control`; no iba: `cachedBlock()` existía desde la migración
  y nadie lo llamaba, así que cada tanda de seis publicaciones pagaba el
  contexto entero (~25.000 tokens en Dcasa). Además de la marca, ese ADN
  lleva la capa de MAQUETACIÓN para Meta AI (plantillas, escala, bloque de
  estilo, negativos, contrato del HTML), que escribir un caption no
  necesita: ~40 % del total en los clientes con receta. Ahora
  `buildClientContext` la quita (`sinCapaMaquetacion`) y `callAI` parte el
  contexto en «ADN» —con `cache_control`— y «lo que cambia»
  (`prepararContenidoIA`). Dos cosas para no romperlo: el título «FICHA EN
  LA APLICACIÓN» de `buildClientContext` es donde se parte, y una
  petición cuyo PRIMER bloque es una imagen no se cachea (la caché es por
  prefijo). Las dos fallan abiertas: si no reconocen la forma, mandan
  todo. Ni el asistente ve ya esa capa: el prompt maestro de Meta AI no lo lee ninguna IA (ver más abajo).
- **El Estudio: una imagen es un TRABAJO, y el Worker no puede esperar.** Pedir crea
  una fila (`estudio_trabajos`) y cada `POST …/avanzar` da UN paso —una imagen—, que
  guarda su avance; lo avanza el navegador mientras se mira la pantalla y el cron
  (`avanzarPendientes`, sólo si no hubo nada que publicar, medir ni informar; detrás de él sólo va Inspiración)
  para lo que nadie mira. Cosas que no se ven mirando la pantalla:
  · **Un paso a la vez, y no es un detalle:** dos que avancen el mismo trabajo generan y
  COBRAN la imagen dos veces. El permiso es `bloqueado_hasta`, reservado con el valor que
  se leyó como condición del UPDATE (el segundo no cambia ninguna fila) y soltado al
  terminar; si el Worker muere a medias, caduca solo. `updated_at` NO sirve de permiso:
  se pone al día en cada escritura y dos pasos seguidos parecerían el mismo.
  · **El archivo se guarda en R2 y en la galería ANTES de tocar el trabajo,** y el trabajo
  apunta su id: un paso repetido tras un fallo a medias no cuenta dos veces lo mismo. Un
  fallo pasajero (saturación, red) se reintenta solo `MAX_INTENTOS` veces; un trabajo con
  parte entregada que falla termina `hecho` con la nota «Llegaron 1 de 3: …» y cuesta sólo
  lo entregado. Nada se queda «en marcha»: tiene plazo (30 min) y acaba `fallido` con el motivo.
  · **Lo que llega del motor se reconoce por sus primeros bytes** (`tipoPorBytes`), no por el
  tipo que declare: un HTML disfrazado de PNG se rechaza. La tarjeta de prueba es un SVG
  y sólo la fabrica el propio Worker; `sirveMedia` pone `Content-Security-Policy: sandbox`
  a todo SVG, porque abierto suelto ejecutaría sus scripts con la sesión de la agencia.
  · **Las referencias las manda el navegador y no se creen:** `claveDelCliente()` exige
  `clientes/<este cliente>/` sin `..`, y se comprueba que existan al pedir (no a la mitad).
  · **El costo es una estimación y se rotula así** (`estimado` en el catálogo, «precio
  aproximado» en la pantalla). Un modelo con tarifa por tokens conocida (`PRECIOS_GEMINI`)
  cuenta tokens; el resto, el precio del catálogo. Desde `CONFIRMAR_DESDE` (0,50 $) el
  SERVIDOR exige `confirmado: true` (409 `confirmar`), no sólo la pantalla: un asistente o
  Claude por MCP tampoco se salta el segundo toque (una IMAGEN con el modelo del cliente dentro del tope de «crear sin
  preguntar», si el espacio lo fijó, no lo pide: ver «La confirmación de 0,50 $ se puede fijar»). Con el presupuesto
  agotado y «detener» se rechaza antes de crear, y otra vez antes de cada imagen.
  · **`/api/generar-imagen` sigue con su contrato** (`{ clave, mimeType }`) pero llama a la
  misma `llamarGemini()` y apunta la imagen en la galería (`origen: "app"`). De esas la
  papelera quita la FILA y nunca el objeto de R2: lo puede estar usando una publicación
  sin que el Estudio lo sepa. Sólo se borra de R2 lo que el Estudio creó o lo que se subió.
  Lo que una publicación usa (`usado_en`, `POST …/uso`) no se purga.
  · **Un id de modelo de Google es una apuesta sobre la cuenta.** El único que ya usa la
  aplicación es `gemini-2.5-flash-image` (Nano Banana); los demás salen de la documentación
  de Google y un 404 dice «tu cuenta no tiene el modelo …» en vez de un error genérico.
  · **Los eventos del Estudio los emite `trabajos.js` y `rutas/estudio.js`,** que el test de
  tiempo real lee sólo por sus llamadas a `difundir()`: sus columnas también se llaman `tipo`.
  · **Hay dos formas de motor y las dos las escribe cada proveedor** (contrato en `motores.js`):
  IMAGEN que contesta en el acto (`generar`) y COLA (`enviar` + `sondear`). Van por la cola todo
  video y las imágenes de Higgsfield (`enCola(modelo)`, no `tipo === "video"`: se rompió al meter
  Higgsfield). **Enviar es lo único que no se repite:** el id del motor se guarda antes que nada, y
  con él sus direcciones de seguimiento (`datos`). Un video se cobra al ENTREGARLO, por segundo.
  · **Un video sin ajuste de duración cuesta 0 si nadie lo cubre:** `por: "s"` × 0 s no pide
  confirmar. Lo evitan `segundos` (duración fija) y un test que recorre todo el catálogo.
  · **Las direcciones que devuelve un proveedor no se creen.** `status_url` de fal y de Higgsfield
  reciben la llave, así que sólo se siguen si son de SU origen (`esDeLaCola`, `esDeHiggsfield`);
  si no, se reconstruye la de la documentación. El archivo del resultado se baja SIN la llave.
  · **Higgsfield sale de su esquema, no de la memoria.** `higgsfield-schemas.json` dice, por ruta,
  qué campos hay, qué valores admite y cuáles son obligatorios; de ahí salen el catálogo
  (`scripts/estudio/generar-higgsfield.mjs` → `estudioHiggsfield.json`, que un test regenera y
  compara), la ruta de cada pedido (según las imágenes que lleve) y el cuerpo (sólo campos de esa
  ruta, cada valor uno que acepta). Sólo entran los modelos que se pueden pedir SIN subir un video.
  Cuando Higgsfield cambie su documentación: bajar el nuevo `llms-full.txt`, regenerar el
  esquema como hizo Agents Office (`scripts/higgsfield-schemas.mjs`), copiar el JSON y correr el
  generador. **Nada de fal.ai ni de Higgsfield se ha probado contra el servicio real**: los tests
  usan un `fetch` de mentira que habla como ellos. Lo primero con una llave es un pedido barato
  (Z-Image Turbo, Flux Schnell) y luego uno de video corto.
  · **Kie.ai es un cuarto proveedor, todo por COLA** (`worker/lib/estudio/kie.js`, `KIE_API_KEY`; su documentación, la
  parte que se usa, en `docs/kie/`). Imagen: GPT Image 2 y 2.5, Nano Banana Pro, 2 y 2.1, Ideogram 3, Seedream 5 Pro,
  Imagen 4 Ultra. Video: Gemini Omni Flash (el de Flow: hasta 7 referencias —fotogramas del storyboard, personajes—,
  o imagen inicial y final, o un video para corregir un tramo), Kling 3.0 y 3.0 Omni, Seedance 2.0 y 2.5, Veo 3.1 Fast
  y Quality (también por `createTask`, con `model: "veo-3-1"` y el nivel en `input.model`), Hailuo 2.3 y Wan 2.7. «Pulir
  el acabado» (Topaz, Recraft) se QUITÓ: la agencia no le encontró uso. Sus ids viven en `MODELOS_RETIRADOS` para que
  lo ya pulido siga teniendo nombre.
  Kie contesta casi siempre HTTP 200 y pone el error en `code` (401 llave, 402 créditos, 422 datos, 429/455/5xx
  pasajeros): `datosDe` mira el `code`, no sólo el estado. `resultJson` llega como TEXTO JSON (`urlsDelResultado`).
  Las imágenes y el video de apoyo se suben a su almacén (`file-stream-upload`, `images/estudio` o `videos/estudio`,
  caducan solas) y van por dirección, cada papel en su campo (`refs`, `inicio`, `fin`, `videos`); el resultado se baja
  SIN la llave. Lo que un modelo no mezcla (Omni y Kling Omni: imagen inicial con referencias o video; Veo: referencias
  con imagen inicial) lo rechaza `validarKie` AL PEDIR. El precio depende de la calidad: `costoSegun` en el catálogo
  (`costoUnitario`). GPT Image no tiene 4:5 (sale 3:4 y se adapta al programar). Un test exige que cada modelo de Kie
  del catálogo tenga su pedido en `MODELOS_KIE`, y al revés. **Nada de Kie se ha probado contra el servicio real**: la
  forma sale de su documentación.
  · **La documentación de octubre de 2026 sumó ~35 modelos** (`docs/kie/catalogo-2026-10.md`, el extracto de la agencia:
  por cada `model`, sus campos, los obligatorios con `*` y los valores de cada lista). Imagen: Imagen 4 y Fast, Nano Banana
  2 Lite, Z-Image, Seedream 4.5 y 5 Lite/Flash, Flux 2 Pro/Flex y 3 Klein, Grok Imagine 2, GPT Image 1.5 y 2.5 Flare, Qwen
  2.1 y 3 Pro, Wan 2.7 Image (y Pro) e Ideogram con personaje. Video: Gemini Omni con video, Seedance 2 Fast y Mini, Kling
  3 Turbo y 2.6 (también «copiar el movimiento»: una foto + un video), Veo 3.1 Lite, Wan 3 y Prime, Hailuo 2.3 Standard,
  MiniMax H3, PixVerse 6 (con inicio y final hace la transición), HappyHorse 1.1, Grok Imagine Video y Vidu Q4. Fuera, a
  propósito: lo que exige `callBackUrl`, lo que parte de un `task_id` (extender, ampliar, 4K), máscaras, avatares y labios,
  y las API con su propio endpoint (4o, Flux Kontext, Runway). **Los precios no vienen en la documentación**: todos son
  estimados y lo dicen. `tests/migracion/kie.modelos.test.js` LEE el extracto y comprueba cada forma de pedir cada modelo
  (texto, referencias, inicial, inicial y final, video): `model` que existe, sólo sus campos, todos los obligatorios y los
  valores de las listas. Cazó uno de antes: Seedance 2.0 y Fast recibían `output_format`, que sólo admite 2.5. Si Kie
  cambia su documentación, se reemplaza el extracto y el test dice qué pedido dejó de cuadrar.
  · **El VIDEO de referencia es un cuarto papel de los medios** (`medios.video`, junto a start/end/reference). Sólo
  lo admiten los modelos de Higgsfield marcados `conVideo` en el generador (Kling Omni · sigue un video, Kling 3.0
  · copia el movimiento): `video: 1` y `necesitaVideo` salen del esquema. Va a SU almacén como las imágenes, desde
  R2 y con tope de 50 MB (el Worker lo tiene en memoria al subirlo).
  · **Las imágenes de apoyo de fal van como data URI y las de Higgsfield a su almacén**
  (`/files/generate-upload-url` + PUT, sin la llave). Los formatos de fal por `image_size` son
  sólo los exactos (`FORMATOS_FAL`): con «4:5» la imagen saldría 3:4 aunque la pantalla dijera 4:5.
  · **El asistente y Claude (MCP) piden por la MISMA puerta** (`estudio/herramientas.js`): la
  confirmación de 0,50 $ no la da la herramienta (`confirmado` sólo vale si es el booleano `true`,
  y la descripción le dice al modelo que no lo ponga por su cuenta), topes más cortos que los de
  la pantalla, imágenes de apoyo por id de la GALERÍA de ese cliente (nunca una clave de R2), y un
  ejecutor sin `estudio` no puede gastar. La guía visual de la marca sale del cerebro con
  `para: "imagen"` (sin notas internas) y se le ENSEÑA al modelo; no se pega al prompt, porque
  lo que sale al proveedor tiene que ser lo que quedó escrito en la galería.
  · **`ver_estudio` da el CATÁLOGO con los IDs de la galería de las fotos de cada producto y del logo** (`textoDelCatalogo`):
  sólo enseñaba las 12 piezas más nuevas, y las fotos reales de un producto, subidas hace semanas, no salían nunca —Claude
  pedía el video sin ellas y el modelo se inventaba la caja—. Lee `mercado_clientes` a mano, no con `leerMercado`
  (mercado.js importa este archivo por herramientasServidor.js: sería circular). El logo se da con su regla: en video, una
  imagen de cierre con el logo como `imagen_final`, nunca de referencia.
  · **Claude VE lo que crea** (`worker/lib/estudio/miniaturas.js`): `estado_trabajo`, ya terminado, devuelve las imágenes y
  `ver_pieza` enseña hasta 6 piezas de la galería de ESE cliente con su modelo, su pedido y el resultado del control (las dos
  van como `{ texto, imagenes }`, que el MCP y el asistente ya pasan como bloques de imagen). Va una COPIA de 768 px en JPEG
  que hace el Container (`POST /miniatura`, sin guion): una pieza de 2K en PNG pesa de 4 a 8 MB. Sin Container (en local)
  o si falla, la original sólo si pesa menos de 1,2 MB; si no, el texto lo dice y no falla. Antes, por MCP, Claude creaba
  a ciegas: recibía «Listo» y no podía corregir nada.
  · **Lo creado desde «Subir» apunta su uso al guardar** (`delEstudio` en `SubirRapido`): la
  publicación aún no existe al crear, y sin `usado_en` la papelera podría llevarse el archivo.
- **El lote sigue en el SERVIDOR aunque se cierre la aplicación** (decisión de la agencia: en el teléfono, salir de la
  app paraba lo que se estaba creando; `worker/lib/estudio/encargos.js`, `bomba.js`, 0049; `src/lib/loteServidor.js`).
  Antes el lote lo orquestaba la pestaña con `await`: lo pedido terminaba por el cron, lo demás no se pedía nunca.
  · **Un ENCARGO es la cadena entera como lista de pasos con su avance** (`estudio_encargos`). La pantalla arma cada
  pieza por el MISMO camino de siempre (`pedidoDeLote`) con «{{ESCENA}}» en el hueco (`pasoDeLote`; un test exige que,
  quitado el hueco, el pedido sea idéntico) y el servidor la lleva: el director pieza a pieza (ver «El director piensa CADA pieza»; las vistas de las plantillas y
  los «Me gusta» viajan con el encargo y se borran al terminar el director), la mejora si no hay ficha, el trabajo, la
  proporción (se recompone con el mismo modelo y si no con el relevo, como `esperarArchivos`), el control y UNA
  corrección que se queda sólo si mejoró (`mejoro`, contra la ficha de la ORIGINAL). De dos en dos (`paralelo`).
  · **Quién avanza**: la BOMBA, la alarma del Durable Object del espacio (`hub.js` → `bombear`). `crearTrabajo` y
  `crearEncargo` la despiertan (`despertar`, ESPERADO: sin `await` la petición al objeto podía cortarse). Cada alarma es
  su propia invocación (sus 50 consultas y 50 peticiones): da 3 pasos caros y vuelve en 1,5 s, o cuando toque el video.
  Con eso también un trabajo SUELTO (el compositor, «Crear la imagen aquí») sigue en segundos sin pantalla; antes, uno por
  minuto. El cron sigue de respaldo (`avanzarPendientes`, `encargosDelCron`) y despierta a la bomba si la ve dormida. La
  pantalla sólo LEE cada 3 s y empuja (`/avanzar`) si lleva 20 s quieto: si diera ella los pasos, salir a mitad de una
  llamada a la IA la tiraría (y se pagaría igual).
  · **El permiso** es `bloqueado_hasta` (4 min: el director con razonamiento tarda), reservado con el valor leído como
  condición, como en los trabajos. Los `finales` que pone la pantalla también lo toman (si no, un paso a la vez se
  llevaría lo escrito): ocupado → 409 y la pantalla reintenta.
  · **Lo que necesita lienzo lo hace el CONTAINER** (`acabarPieza` en worker/lib/estudio/acabado.js → POST /acabado, con el
  MISMO dibujo de src/lib/acabadoLienzo.js que la pantalla): el texto de la plantilla y el logo estampado, una pieza por
  paso, subida como la sube la pantalla (`origenId`, su `plantilla`). Un paso así (`porAcabar`) no deja cerrar el encargo
  hasta intentarlo; si no hay Container (en local) o falla, queda `acabadoIntentado` y lo pone la pantalla al volver
  (`terminarPaso`, `finales`), como antes. Con alguna opción terminada, las otras quedan en su cruda (si no, la pantalla
  pondría el texto otra vez). Un encargo cerrado por plazo no espera al Container.
  · **La plantilla que escoge el director** (o la de su tipo) se suma al pedido EN EL SERVIDOR (`conPlantillaDelDirector`
  en encargos.js): su imagen detrás de las que ya iban, con su línea numerada y su sistema escrito, como `pedidoDeLote` en
  la pantalla. Si ya llevaba una, si no cabe en el modelo o si la plantilla ya no está, el pedido no cambia.
  · **Lo que NO hace el servidor**: los REELS (guion, fotogramas, video) y los planes del director en el chat.
  · **El carrusel también es un encargo** (`tipo: "carrusel"`): «Carrusel con IA» (FlujoCarrusel), los carruseles del
  lote y los de «Producir el mes». Va en ORDEN (`paralelo` 1): cada lámina con la anterior y la portada (las CRUDAS) de
  referencia, armada por `armarLamina` (src/lib/laminaPedido.js), el MISMO pedido que `crearLamina` en la pantalla; el
  sistema de la portada se saca UNA vez antes de la segunda (no en plantilla) y va en su pedido y su control. Con
  `propuesta`, el director diseña la serie en el servidor antes de la primera lámina (las `laminas` del guion quedan de
  respaldo). «Primero la portada» son dos encargos: el segundo lleva `previas` (claves de la portada y la anterior) y el
  `sistema`. Al terminar, la carpeta del carrusel queda ORDENADA (la galería lo enseña como una tarjeta).
  · **Lo que necesita lienzo va en `navegador` de cada paso** ({ plantilla: { texto, plantilla }, logo }); sin nada, el
  servidor pone `finales` = lo que salió. Lo pone la pantalla que sigue el encargo y, si nadie lo miraba, la aplicación a
  los 20 s de abrirse (`terminarPendientes`, sólo los encargos de quien los pidió: si no, cada pestaña del equipo pondría el
  mismo texto) desde `/api/encargos/por-terminar` (los de 7 días con piezas sin `finales`). `enCurso` evita hacerlo dos
  veces en la misma pestaña.
  · **«Diseñar las que ya hay»** (ProducirMes) lanza un lote con las imágenes (pedido con `calendarId`/`postId`, la ficha
  lista si la hay, el director si no) y un carrusel por publicación; apunta los encargos en el navegador
  (`producir-mes:<calendario>`, 3 días) y al reabrir enseña lo que salió para ponerlo (`resultadosDeProduccion`,
  lib/produccion.js). Las fichas nuevas del director (`deDirector`) se guardan en su publicación una vez.
  · **Volver**: el borrador del lote guarda los encargos; «Seguir con ellas» abre el paso 3 con lo que salió y sigue lo que
  falte. Cerrar el diálogo ya no se impide por lo que va en el servidor («Cerrar (sigue en el servidor)»), y «Detener»
  lo cancela (lo que ya estaba saliendo se queda en la galería).
  · **Nada de esto se ha probado contra Cloudflare real**: los tests llaman a `bombear` como lo haría la alarma.
- **El kit de marca del Estudio: lo que la agencia hacía en Flow con un texto
  por marca, por cliente y SALIDO DEL CEREBRO** (`clients.kit_marca`, 0033;
  lo puro en `src/lib/kitMarca.js`, lo que toca base/R2/IA en
  `worker/lib/estudio/kit.js`).
  · **«Preparar con IA» PROPONE, no guarda.** Lee el cerebro con `para:
  "imagen"` (nunca lo interno) más la ficha, y la IA escribe paleta (sólo
  colores que aparezcan, con su papel), tipografía, estilo, luz, «nunca» y
  un preset por tipo de contenido (los de Baby Caleb y ROFER van como EJEMPLO
  del tono, no se copian). Una persona lo revisa y guarda; «Corregir antes»
  abre el formulario. Los presets PROPIOS (hasta 6) no los toca la IA.
  · **La marca va en TODA pieza, no dentro del preset** (`bloqueDeMarca`: paleta,
  estilo, luz, tipografía, «nunca»), SIEMPRE que el kit tenga algo (la casilla «Usar el kit
  en esta pieza» se quitó: cambiaba el resultado por navegador). Antes sólo viajaba dentro del preset: con «Sin
  preset» —lo que salía desde un post sin tipo— la imagen no sabía nada de la
  marca, el logo tampoco iba, y «Revisar marca» daba 4 de 10.
  · **Un preset por TIPO DE CONTENIDO** (`TIPOS_PRESET`, mismos ids que
  `PILARES`; las 7 maletas también como `maletas-garantia`… que suman su línea):
  qué clase de pieza es, SIN la paleta. Desde un post sale de su tipo
  (`presetDePilar(pilar, sub)`); sin tipo, ninguno, y lo recordado de la pestaña
  NO se hereda ni se pisa. Los de antes se traducen al leer (`limpiarKit`,
  `presetActual`): producto → servicios; corporativo y creativo → propios.
  · **El pedido:** `componerPedido()` = preset + acabado + «Escena: idea» + bloque
  de marca + la línea del logo (si va) + el movimiento en video;
  `pedidoConMarca()` lo arma con el kit para la pantalla, «Producir el mes» y el
  asistente, y `estiloDeMarca()` (preset + marca en un texto) para el carrusel.
  Lo que sale al motor es lo que queda en la galería; `ideaDelPedido()` recupera
  la escena (empiece o no por ella) para «Pedirla corregida» y para la tarjeta.
  · **El logo va de referencia sólo en imágenes** (`ponerLogo()`): en un video
  la imagen de apoyo es el primer fotograma y el video empezaría en el logo.
  Tiene que ser PNG/JPG/WEBP de ESE cliente (lo comprueba el servidor: un SVG
  no le sirve a ningún motor). `clientToRow` NO lleva `kit_marca`: sólo lo
  escribe el Estudio, así una ficha abierta desde antes no lo pisa.
  · **«Revisar marca» MIRA la imagen** (va como bloque de imagen, ≤ 3,5 MB) con
  el kit delante y devuelve puntaje, qué cumple, qué falla y una sugerencia.
  Funciones «kit de marca» y «revisión de marca» en el hueco «análisis».
  · **El asistente y Claude (MCP) usan el mismo kit:** `crear_en_estudio` pone
  la marca y el logo siempre que haya kit (con `estilo`, además el preset de ese
  tipo); `ver_estudio` dice si el kit está preparado.
- **Una referencia sin más hace que el modelo copie de más** (`src/lib/referencias.js`). Cada imagen de referencia
  dice QUÉ se toma de ella («¿Qué tomo de aquí?»: estilo, composición, producto, persona, fondo, tipografía o todo) y
  un comentario; el pedido lo dice imagen por imagen, numeradas EN EL ORDEN en que se mandan (por eso las líneas van
  en `componerPedido({ referencias })`, detrás de la escena, y el logo del kit va el último con su propia línea).
  `toma` y `nota` viajan en el mismo archivo puesto en `form.medios.reference`; al servidor sólo llega la clave.
  · **Las fotos del catálogo son el producto REAL**, no una referencia de estilo: llevan `producto` (`fotosDelProducto`)
  y su línea dice «cópialo tal cual». Si el producto es de OTRA marca (`marca` en el catálogo: lo revenden), se respeta
  su empaque y no se le pone el logo del cliente. «Producir el mes» manda las mismas líneas.
  · **Si la idea nombra un producto del catálogo con fotos, sus fotos se suman al crear** (`productoNombrado`, sin
  tildes, gana el nombre más largo) y el compositor lo dice ANTES de pedir. Sólo si caben en el modelo.
- **«Otra igual» y «Otra versión distinta» salen ya, sin pasar por el compositor** (visor de la galería). «Otra igual»
  repite el pedido de la pieza con las imágenes de SU trabajo. «Versión distinta» pide a la IA 1–3 escenas nuevas con la
  misma información (`POST /api/estudio/<c>/versiones`, función «prompt de imagen», texto) y `conOtraEscena()` cambia
  SÓLO la escena del pedido: tipo, acabado, referencias, marca y logo se quedan. El costo se enseña en el botón (es la
  confirmación). En la imagen de una publicación (pestaña Subir), «Otra versión» se HACE AHÍ (`src/lib/otraVersion.js`)
  y ocupa el sitio de la anterior, con «Deshacer»: si la imagen salió del Estudio, su pedido con otra escena; si no
  (subida, Drive), el camino de UNA pieza sobre la idea y el texto de la publicación, SIN la imagen vieja de referencia
  (la copiaría). Es para reutilizar un post con otro diseño; «Duplicar a otro día» (`copiaDePublicacion`, lib/subir.js:
  pendiente, sin la aprobación, la etapa ni la copia de Drive de la original) es el otro medio. «Recrear con mi marca»
  hace lo mismo con una REFERENCIA subida al post (imagen: va primera con `TOMA_DE_OTRA_MARCA`; video: como video de
  referencia, con Kling Omni u otro que lo admita). En «Subir», sin publicación todavía, sigue abriendo «Crear con IA».
- **«Post que se repite»** (`src/lib/repetir.js`, `calendario/repeticionesMes.jsx`). En el panel, «Se repite»: cada semana
  (ese día), cada mes el n.º día (el 2.º martes), el último o el número del día; las opciones salen de la FECHA de la
  publicación y la regla vive en ella (`post.repetir`). Nada se crea solo —el cajón de un mes se crea al escribir—: al
  mirar un mes, `repeticionesPendientes` junta las reglas de TODOS los meses del cliente (`client.calendars` + el que se
  mira, que puede ser virtual) y el aviso encima de la rejilla ofrece «Añadirlas al mes» o «Ahora no» (por navegador,
  `repetir-omitidas:<cliente>`); sólo desde hoy (Panamá). La copia (`copiaRepetida`) es una IDEA pendiente sin archivos
  (y sin marca `aprobacion`: ver «La marca «idea» del sistema se iba con la publicación»),
  con `repiteDe` y `repeticion` (la fecha que le tocaba: moverla de día no la vuelve a ofrecer) y SIN regla propia: si la
  llevara, serían dos series de lo mismo. Con «La IA escribe textos nuevos» llega sin descripción, texto de la pieza ni
  qué se ve, y «Escribir sus textos con IA» corre el «Completar los textos que faltan» de siempre (sólo rellena). «No
  repetir más» quita la regla de la original aunque esté en otro mes (`onUpdateOtroCal`: con el mes virtual, `onUpdateCal`
  escribe en ESE mes).
- **La barra de los días encima del mes ES el plan semanal de la empresa** (`src/lib/planSemanal.js`,
  `calendario/PlanSemanal.jsx`). Era texto libre por MES (`cal.dayLabels`) que no leía nadie: el lote seguía con el ritmo
  de la agencia aunque la barra dijera otra cosa. Ahora enseña y edita lo MISMO que leen el lote del Estudio («Mes
  completo» → «Según su plan»), «Planificar mes» y la IA: el ritmo (`ritmo_contenido`) y la copia personalizada de la
  plantilla (`plan_contenido.personalizada`), fijos todos los meses; `cal.dayLabels` se queda en la fila sin usarse.
  Cosas que no se ven:
  · **La primera publicación de cada día va con el tipo VACÍO en el plan y su tipo en el ritmo** (`semanaParaGuardar`),
  la convención de las plantillas de arranque: así la temporada (`cambio` de `casillasConPlantilla`, que sólo se aplica
  sin tipo escrito) sigue ajustándola. Las demás del día llevan su tipo.
  · **Sólo tipos de la agencia** (`PILARES`); nada de nombres libres. Sin plan, la barra enseña el ritmo sin formato
  (lo que hacía el lote sin plan) y al guardar cada día toma el formato escogido («Post» por defecto).
  · **«Volver al estándar de la agencia»** quita la copia y el ritmo propio; la plantilla elegida en la ficha se queda.
  · Se guarda con `guardarPlanCliente` (App.jsx); lo ya creado en el calendario no cambia. En el teléfono la barra no
  cabe: «⋯ → Plan semanal de la empresa». Sólo lectura no la edita.
- **Cada día de la semana puede llevar una NOTA FIJA** (`clients.notas_semana`, 0051; `src/lib/notasSemana.js`): «los
  lunes, muebles y camas». Se escribe en el diálogo del plan semanal y sale debajo del plan en la cabecera del mes. Va en
  SU columna y no dentro de `plan_contenido` a propósito: «Volver al estándar de la agencia» borra el plan y no debe
  llevarse las notas (`guardarPlanCliente` sólo las cambia si vienen). No cambia formato ni tipo: es el TEMA del día para
  el motor de ideas (`notaDia` en cada casilla, `lineaDeNotaDelDia`), y si nombra un producto del plan (palabra entera,
  sin tildes, el nombre más largo) ese día va con él (`conNotasDelDia`) salvo que la casilla ya traiga uno. Se aplica en
  el servidor (modos mes, plan y publicación) y en «Planificar mes», que calcula la matriz en la pantalla.
- **«UGC · guion para grabar» (antes «Video con rostro») es un REEL que graba una persona** (`rostro: true` en la
  publicación del plan, la casilla, la idea y el post; sólo vale en un reel). La IA le escribe un guion para GRABAR,
  tramo a tramo (`src/lib/ugc.js`): `[0–3 s] VOZ: «palabra por palabra» | SE VE: la toma | TEXTO: en pantalla`. Sigue en
  `post.guion` (texto: el enlace del cliente y la exportación no cambian) y `partirGuionUgc` lee también la forma corta
  del lote («dice · se ve · texto»). Al lado, `duracionUgc` (15/30/45/60 s; la voz cabe a 2,5 palabras por segundo y el
  panel avisa si sobra) y `ganchosUgc` (3 alternativos; «Usar este» cambia la voz del primer tramo). El lote no lo crea
  con IA: van al calendario como idea con su guion (`conRostro` en EstudioLote). El servidor sólo acepta el booleano
  (`limpiarCasillas`; también en el modo «publicacion», que ahora lo recibe). En el panel (`GuionUgc.jsx`), la tabla, la
  duración, «Copiar la voz» y «Copiar la lista de tomas» y los ganchos; el texto se edita en su campo de siempre.
  · **El botón «IA» del guion aplica la regla UGC** (en el SERVIDOR: el modo «campos» del motor pone `reglaUgc` en la
  duración de la publicación, pide 3 `ganchos`, la fórmula escogida o las de la agencia y la voz UGC; ver «Un solo motor
  de texto»). Sin idea, primero el motor de ideas (que ya trae el guion para grabar); con idea, el guion sobre ella, y lo
  que la idea cita entre comillas se dice TAL CUAL.
  · **«Extraer guion y adaptar»** (`ExtraerUgc.jsx`, `POST /api/mercado/<c>/ugc`, `extraerUgc` en worker/lib/mercado.js):
  Gemini VE el video (de la galería por `archivoId` o puesto en la publicación por `clave`, siempre de ESE cliente) y lo
  transcribe —voz palabra por palabra y tomas— (`pedidoDeTranscripcion`); la IA de texto lo ADAPTA a la marca con el
  producto del catálogo y el cerebro para escribir, sin copiar frases ni marcas (`pedidoDeAdaptacionUgc`). La
  transcripción queda en `ajustes.transcripcion` de la ficha del video: volver a adaptar no paga otra vez a Gemini. No
  guarda nada: «Usar en la publicación» (guion, ganchos, duración; caption y título sólo si estaban vacíos) o «Guardar en
  el banco de ideas». También desde el visor de un video de la galería («Extraer guion UGC»). Con Meta como motor de
  video va por fotogramas (sin audio: sin voz). **Nada de esto se ha probado contra Gemini real.**
- **La FÓRMULA de un UGC es de la agencia; la VOZ, de cada cliente** (`formulas_ugc`, 0045; `src/lib/formulasUgc.js`,
  `worker/rutas/formulasUgc.js`, `FormulasUgc.jsx`; la voz en `worker/lib/cerebro/vozUgc.js`). Un guion fijo para todos no
  sirve y aprender sólo del cliente tampoco: los videos que funcionan traen formas nuevas.
  · **Una fórmula es la receta sin el contenido**: tramos con lo que HACE cada uno, tipo de gancho, por qué funciona y
  cuándo conviene. «Guardar como fórmula» (en «Extraer guion y adaptar», sólo quien cambia lo de la agencia) le pide a la
  IA que la ABSTRAIGA del video ORIGINAL transcrito (`POST /api/formulas-ugc/proponer`, función «fórmula UGC», no guarda)
  y se abre en el editor; también se escribe a mano. La duración original se lleva a 15/30/45/60 y al usarla los tramos se
  reparten en la del video (`tramosEnDuracion`). Son del ESPACIO (sin `client_id`): las ven todos y las cambian admin y
  editores sin clientes asignados (403, como las plantillas de plan); aviso `formulas-ugc`.
  · **En el panel, «Fórmula»** (`post.formulaUgc`): vacía = «La IA escoge la que encaje» (`bloqueDeFormulas`, que le pide
  empezar con «FÓRMULA: <nombre>»; `formulaUsada` lo pasa a su id y `leerGuionConGanchos`/`partirGuionUgc` quitan esa línea
  del guion) y la publicación recuerda cuál siguió; escogida, la IA la sigue (`lineaDeFormula`) aunque la idea ya trajera
  guion (se reescribe con ella). El lote hace lo mismo con las casillas UGC (`ugc` en `pedidoDeProduccion`, `"formula"` en
  la respuesta → `formulaUgc` por `publicacionDePieza` y `rellenarConIdea`). Con `formulaUgc` en cada publicación sale
  después qué fórmula funciona con cada cliente (aún no se calcula).
  · **La «Voz UGC»** es una nota del cerebro con ruta fija (`RUTA_VOZ_UGC`, o por su título si se escribió a mano): quién
  habla, tú o usted, cómo empieza y cierra, qué no dice nunca. «Voz UGC» en la pestaña Cerebro (`POST
  /api/cerebro/<c>/voz-ugc`, función «voz UGC») la PROPONE leyendo los guiones UGC de sus calendarios (`guionesUgcDe`: los
  aprobados primero) y la nota de ahora; no guarda, como «Saber del rubro». Va en todo guion UGC (`lineaDeVozUgc`: el
  botón «IA» del panel la lee con `GET …/voz-ugc` y el lote con `vozUgcDe`); una nota interna no cuenta.
  · **«Guiones para grabar»** (menú «⋯» del calendario, `GuionesParaGrabar.jsx`): los UGC del mes sin video
  (`ugcParaGrabar`), por fecha; se marcan y ordenan y sale UN mensaje (`textoParaGrabar`: la sesión con el cliente y el
  día, y cada video con «Lo que dices» y «Tomas») para copiar o compartir. Al copiarlo o compartirlo pasan a la etapa
  «En producción» (`etapa: "produccion"`, la del tablero) y no se vuelven a ofrecer salvo con «Enseñar los ya enviados».
  Cerrar la hoja de compartir (AbortError) no marca nada.
  · **Un diálogo que cambia de vista se queda con el foco** (efecto en `FormulasUgc`): al guardar, el botón pulsado
  desaparece y el foco caía al `<body>`; Escape y Tab dejaban de funcionar (los escucha el nodo del diálogo). Lo cazó
  Chromium, no los tests.
- **Las fórmulas UGC son ahora ESTRUCTURAS DE GUION, para UGC y para VOZ EN OFF** (decisión de la agencia: «sólo puedo
  guardar estilos de guiones por cliente»; `src/lib/formulasUgc.js`, `worker/lib/estructurasGuion.js`,
  `SelectorEstructura.jsx`, `GuardarEstructura.jsx`; sin migración). Cosas que no se ven:
  · **`para` va dentro de `datos`** (`["ugc"]`, `["voz"]` o las dos; `paraDe`). Una de antes, sin `para`, vale para las
  DOS (decisión: la forma gancho → problema → demostración → llamado sirve igual a una locución, y así la voz en off no
  arranca vacía). La tabla, la ruta y `post.formulaUgc` conservan su nombre; `/api/estructuras-guion` es la MISMA ruta
  (worker/index.js las manda a las dos a `rutasFormulasUgc`). En la pantalla se llaman «Estructuras de guion» y dicen «de la
  agencia, para todos los clientes», con su filtro UGC / Voz en off (Ajustes → Cómo trabajamos).
  · **El tono del cliente se SUMA, no se sustituye**: la «Voz UGC» del cerebro y el estilo de la locución de su ficha
  siguen; la estructura es la forma.
  · **La voz en off la sigue**: «Video nuevo» del video animado (`POST /api/videos/<c>/escribir` con `estructuraId`) y el
  reel por planos (`POST …/reel/guion`, `guionDeReel`). Escogida, va su línea (`lineaDeFormula(…, { uso: "voz" })`)
  repartida en la duración del video (`tramosEnDuracion` acepta ya cualquiera de 3 a 600 s; a medios segundos si los
  tramos no caben a uno por segundo). Sin escoger, la lista de las de voz (`bloqueDeFormulas(…, { uso: "voz", campo:
  "estructura" })`) y la IA dice cuál en el campo «estructura» de su JSON, que se SACA antes de validar el guion del video
  animado (si no, `validarGuion` lo quitaría con un aviso) y se vuelve id (`usadaEn`). Una escogida que ya no existe es un
  400 sin llamar a la IA (el selector la vuelve a «La IA escoge» en cuanto ve que no está).
  · **Lo escrito recuerda cuál**: el proyecto del video animado en `origen.estructuraId` (`crearProyecto`; la ruta la
  comprueba con `estructuraExistente`: lo que llega no se cree), el guion del reel en `estructuraId`/`estructuraNombre`
  (`limpiarGuionReel` los conserva: viajan al encargo y al montaje) y la publicación en `post.estructuraVoz`, sólo si no
  tenía otra (`rellenarVacios` con `estructura`, al poner el mp4 del render o el video del reel; también lo que crea «Lo
  mejor» por el camino «animado»).
  · **El motor de ideas sólo ofrece las de UGC a un guion UGC** (`bloqueDeFormulas(…, { uso: "ugc" })` en lote.js); la
  escogida a mano en la publicación se busca entre todas: la escogió una persona.
  · **«Guardar como estructura»** (VideoAnimado y el paso «Planos» del reel; sólo quien cambia lo de la agencia):
  `tramosDeEscenas` (con `lineaDeTiempo`: los tiempos de la voz si ya la tiene) o `tramosDeReel` → `POST
  /api/formulas-ugc/proponer` con `voz` (`pedidoDeEstructuraVoz`, función «fórmula UGC», no guarda) → el editor con «Voz en
  off» marcado. Las etiquetas de emoción de v3 («[feliz]») se quitan antes.
  · **Claude**: `ver_estructuras` (para=voz|ugc y segundos; sin cliente: está en la lista de mcp.js que no lo exige) y
  `estructura_id` en `crear_video` (la apunta) y `crear_reel` (la sigue al escribir el guion, o la apunta en un guion dado).
  `formato_video` la nombra al final.
  · **El selector del reel es LAZY dentro de FlujoReel**: el Estudio precarga el reel, y un import fijo sumaba sus archivos
  (el selector y su cliente de la API) a la lista de precarga del chunk del Estudio, que está en su tope. Por lo mismo el
  selector no lleva hoja de estilos propia (estilos en línea con los tokens).
  · **Nada de esto se ha probado contra Anthropic real**: tests/migracion/estructurasGuion.test.js usa un `fetch` de mentira.
- **«Me gusta» (la estrella de antes, `favorito`) y la papelera enseñan al kit** (`src/lib/aprendizajeVisual.js`,
  `worker/lib/estudio/aprender.js`, `POST /api/estudio/<c>/kit/aprender`, en Cerebro → Lo que aprende → «Lo visual»).
  La IA MIRA las imágenes (hasta 8 que gustan y 4 descartadas, función «aprendizaje visual») y PROPONE reglas; nada
  se guarda hasta que una persona pulsa «Añadir al kit», que hace PUT del kit entero con `aprendido`. Las guardas las
  pone el código: dos imágenes de respaldo y al menos una que guste, números que existan, nada que el kit ya diga; lo
  subido a mano no cuenta como descartado (no lo hizo el motor). `kit.aprendido` va en `bloqueDeMarca` —toda pieza— y
  en la revisión de marca, y `fundirKit` lo conserva al volver a preparar el kit con IA: si no, «Volver a preparar» se
  llevaría lo aprendido sin avisar. «Usar mis Me gusta como referencia de estilo» (por cliente, apagado) suma las dos
  últimas que gustan con `toma: ["estilo"]`, en el hueco que dejan el producto y el logo.
- **La PRODUCCIÓN EN LOTE es la versión propia de la agencia de una matriz de producción de anuncios, para TODOS los
  tipos de pieza** (`src/lib/loteAnuncios.js`, `worker/lib/estudio/lote.js`, `EstudioLote.jsx`; inspirada en el método
  de las skills de Felipe Vergara, escrita con palabras propias: su licencia prohíbe copiar o exportar el contenido de
  sus skills, así que nada de ese texto entra al repositorio). Cuatro formas de llenar las casillas, el mismo camino:
  · `celdasMatriz` (anuncios): los 3 DESEOS × los 2 PERFILES del estudio de mercado APROBADO × los niveles marcados,
  hasta 30, en orden de embudo; el servidor sólo acepta deseos y perfiles que estén en el estudio. Sin estudio, por
  niveles (`celdasPorNiveles`). `celdasPorTipos` (cuántas de cada tipo) y el mes (`loteMes.js`) pasan por
  `asignarMatriz`: producto, nivel, deseo, perfil y la maleta que toca, como «Planificar mes».
  · **La forma la decide el CÓDIGO** (`darForma`): lo que no se da resuelto el modelo lo resuelve IGUAL cada vez, y
  salían veinte piezas que sólo cambiaban de foto y de texto. Composición (12, `COMPOSICIONES`; las de `objeto` sólo
  con el producto en cuadro: una «macro de textura» sin objeto se rellena con cualquier cosa), fondo, TÁCTICA del
  gancho (`TACTICAS`; precio, prueba y urgencia sólo con datos reales) y producto (rotan los del plan, primero los que
  tienen fotos). Dos vecinas nunca repiten composición.
  · **El producto SE VE sólo de «consciente de la solución» en adelante** (`seVeElProducto`, `conProducto`): en los
  niveles fríos y en los tipos sin producto no van sus fotos y la escena lo dice; con un producto escogido, la pieza
  fría sabe de qué producto es el problema aunque no salga.
  · La IA escribe por casilla título, BRIEF (qué comunica), titular (40 caracteres y 8 palabras; `limpiarTitular`
  quita el «·», que los motores dibujan como «¿»), apoyo, escena y descripción, sin reseñas, cifras ni urgencias
  inventadas y sin marcas en lo que no es el producto real. `titularesUsados()` le dice lo que ya salió.
  · **Aprende qué composiciones funcionan con cada cliente** (`aprenderComposiciones`): «Me gusta» +2, usada en una
  publicación +1, papelera −1 (lo subido a mano no cuenta), reconocidas por su línea en el pedido — por eso la línea de
  la composición NO pasa por «Mejorar idea». Con 6 señales o más, las que restan no salen y las que suman se
  intercalan (una de cada dos piezas).
  · Al crear (`crearPieza`, loteEstudio.js): la escena se MEJORA sola (apagable), se piden 1–3 imágenes por idea en un
  solo trabajo, se escoge una y la publicación llega al calendario con título, brief (`idea`), texto de la pieza,
  descripción, tipo y matriz, PENDIENTE: lista para revisión.
- **Toda lista de modelos va del más barato al más caro** (`porPrecio`, `costoDePieza` en estudioCatalogo.js; el
  compositor arranca en «Más barato»): se compara lo que cuesta UNA pieza —un video, con su duración por defecto—,
  no el precio por segundo contra el de una imagen; los que no tienen llave y la prueba, al final. El PREDETERMINADO
  no es el primero de la lista: el carrusel y los fotogramas arrancan en `modeloParaCarrusel`, el video del reel en
  `modeloRecomendadoParaReel` (Omni por Kie, el que admite storyboard).
- **Una imagen de la galería no va siempre al primer sitio libre** (`ranurasLibres` en lib/estudio.js): en video
  ese sitio era la imagen inicial y una referencia nunca llegaba a referencias. Con más de un sitio libre se pregunta
  (`EleccionRanura.jsx`), y cada sitio del compositor tiene «De la galería»: la siguiente imagen que se toque va ahí.
- **El modelo se fija POR CLIENTE** (`kit.modelos`, «Fijar … para este cliente» en el compositor; el servidor sólo guarda
  un id del catálogo de ese tipo): lo comparte el equipo y arranca el compositor, la producción en lote y «Producir el
  mes» (`modeloPreferido(activos, tipo, kit.modelos[tipo])`). Sin llave o retirado, el predeterminado.
- **La pieza compuesta (texto de plantilla encima) RECUERDA su cruda** (`origenId` + `plantilla` al subir; el Worker
  copia prompt, modelo y trabajo de la cruda si es de ESE cliente, `herenciaDe` en galeria.js). Sin eso salía «Subida»
  y «Otra versión» no existía para ella. La nueva versión sale cruda y el navegador le pone el MISMO texto en el mismo
  sitio (`conTextoEncima`). Ojo: comparte `trabajo_id` con la cruda; `esperarArchivo` busca la que NO lleva `plantilla`.
- **La ESCENA va primero en el pedido y el tipo de pieza detrás** (`componerPedido`, `PREFIJO_TIPO`). Antes el tipo
  era un párrafo DELANTE que fijaba la composición («el producto al centro, espacio para el titular y el botón»): el
  motor le hacía caso a eso y no a la idea, y las piezas de «Sin tipo» salían mejor. Las bases (`TIPOS_PRESET.base`)
  dicen para qué es la pieza y el tono, no cómo se encuadra, y lo mismo se le pide a la IA del kit. Cada tipo (y
  cada propio) puede llevar hasta dos imágenes de la galería como referencia visual (`kit.referencias`,
  `referenciasDePreset`; sólo claves de ESE cliente y sólo las que siguen en la galería: una borrada rompería el
  pedido). En el lote van sólo por su estilo: la composición la decide el plan.
- **UNA pieza, un solo camino** (`src/lib/pieza.js`): el compositor, el lote, el mes completo y «Producir el mes» arman
  cada pieza con `apoyosDePieza` (fotos REALES del producto, lo puesto a mano, referencias del tipo y del estilo
  propio, «Me gusta»; dejando sitio al logo) y `pedidoDePieza` (escena + tipo + estilo con su acabado + referencias +
  marca + logo, en 2K si el modelo lo tiene; a mano la resolución la escoge la persona). El lote salía peor que la
  pieza a mano por tres cosas que ya no existen: escribía la escena, la mejora no veía el TEXTO y después pegaba
  frases fijas iguales para todo el lote («Composición: …», «Fondo de color pleno…»). Ahora la mejora recibe
  `ideaParaMejorar` (escena, composición SUGERIDA, texto exacto y el brief como contexto) y detrás de la escena sólo
  va «Composición: <nombre>.» (así `aprenderComposiciones` la reconoce) y, con plantilla, la zona libre. El texto lo
  escribe el motor por defecto. «Producir el mes» también mejora cada idea (como «Crear con IA» desde una
  publicación). Un test exige que la misma idea dé el mismo pedido por el lote y a mano.
- **Tipo de pieza (QUÉ comunica) y estilo visual (CÓMO se ve) son dos cosas** (`ESTILOS_VISUALES` en kitMarca.js). En
  el compositor el tipo va ANTES de la idea (cambia «Dame ideas» —de ese tipo, salvo «Variadas»— y «Mejorar idea»,
  que recibe `pieza` como propósito) y el estilo va después, con el kit y las referencias. Cada estilo lleva UNA
  línea de acabado profesional (luz, lente, color, tipografía): párrafos largos empeoran el resultado. El estilo de
  una pieza es el escogido, o el que el cliente fijó para ese tipo (`kit.estiloPorTipo`), o el de la casa
  (`ESTILO_POR_TIPO`): `estiloDeLaPieza`. `pedidoConMarca` lo aplica SOLO, así el lote, «Producir el mes» y el
  asistente piden con acabado sin cambiar nada. Corporativo y Creativo eran presets propios que describían un
  aspecto: `limpiarKit` los pasa a ESTILOS propios (`kit.estilos`, ids `estilo-…`) con sus referencias. Las líneas
  visuales de las 7 maletas son «composición sugerida (si la escena no dice otra)». El `acabado` de antes (mismos
  ids) se sigue aceptando.
- **«Mejorar idea» se lanza SOLA al abrir «Crear con IA» desde una publicación** (siempre: la casilla que la apagaba
  por navegador se quitó; con «¿Qué quieres?» escrito, el director rediseña aunque haya pedido listo): la idea + el texto de la pieza + el contexto llegan juntos y largos; en una imagen la reescribe el
  director de arte como FICHA DE DISEÑO (ver «Mejorar idea ya NO resume», más abajo). El texto entre comillas se conserva EXACTO (lo dice el pedido de la mejora). «Volver a mi idea».
  **Salvo que el post ya traiga su pedido LISTO** (`src/lib/promptImagen.js`): el motor de ideas (lote, «Planificar
  mes», «Completar los textos», «Generar», «Otra») escribe por cada pieza de una imagen el campo `imagen` —la escena
  con su composición y el titular y el apoyo EXACTOS entre comillas, el estilo de la mejora— y `leerProduccion` sólo
  lo acepta si trae el titular y el apoyo tal cual (si los reescribió, el motor escribiría otra cosa). Se guarda en
  `promptImagen` con `promptImagenDe`, la huella de qué se ve (o la idea), el texto de la pieza y el formato: si alguien
  cambia cualquiera, deja de valer y se vuelve a la mejora. `rellenarConIdea` sólo lo pone si la publicación queda
  diciendo lo de la IA (qué se ve escrito por una persona no lo recibe). Una mejora hecha al abrir se GUARDA en el post
  (`onMejorada`): la segunda vez sale lista. Bajo «Qué se ve», «Lista para crear la imagen».
- **«Crear la imagen aquí», «Corregir esta» y «¿Qué quieres?» en la pestaña Subir** (`crearImagenDelPost` en
  lib/otraVersion.js; seccionPublicar.jsx). Un post o una historia SIN archivos se crea ahí, sin abrir el Estudio: el
  pedido listo (o la publicación mejorada una vez, que se queda en el post), el modelo fijado del cliente, su kit, las
  fotos de su producto, su tipo, el control y el logo; confirma desde 0,50 $ como «Otra versión» (salvo dentro del tope de
  «crear sin preguntar») y «Deshacer» la quita.
  «Crear con IA» sigue para revisarlo antes. «¿Qué quieres?» (opcional, no se guarda) lo suman «Crear la imagen aquí»,
  «Otra versión» y «Recrear con mi marca» (`lineaDeIndicacion`: también a la IA que escribe la escena nueva);
  «Corregir esta» lo NECESITA y EDITA la misma imagen (`rehacerConComentario`, como «Rehacer con lo que pidió el
  cliente») en su sitio. Se vacía al salir bien. CalendarView importa el motor de ideas EN DIFERIDO (al pulsar
  «Completar los textos»): con la huella dentro, la carga inicial pasaba de 180 kB.
- **«Otra versión», «Corregir esta» y «Recrear con mi marca» de una imagen del post se hacen EN EL POST, por el director
  y el servidor** (decisión de la agencia del 5 de noviembre: fuera el interruptor «En el Estudio / Aquí, rápido», que se
  recordaba por navegador como `post-acciones-donde`). Lo «a ciegas» de antes ya no lo es: el director MIRA la original
  (papel «original») y la pieza sale revisada (lib/piezaServidor.js); ocupa su sitio con «Deshacer». Al lado de cada
  imagen, «Ver en el Estudio» (`verEnEstudio` en seccionPublicar) pasa la imagen por `archivoEnGaleria` (lib/estudio.js:
  la ficha que ya había por ruta o clave; si se subió directo al post o vino de Drive, la SUBE —la huella evita la copia
  doble—) y abre el visor con `inicial.abrir` (`accion: "ver"`): sus versiones, «Editar» con ejemplos de la galería; lo
  escogido va al SITIO de la imagen tocada (`onReemplazar` de `useCrearConIA`; el botón dice «Poner en la lámina N»). Con
  `inicial.abrir` el diálogo NO lanza «Mejorar idea» (`listo`): se viene a corregir, no a crear. «Animar» se quitó del post.
- **La papelera no borra lo que usa la MARCA** (`clavesDeLaMarca`, `sinClavesPerdidas` en kitMarca.js; `clavesPerdidas` en
  worker/lib/estudio/galeria.js). El logo, la muestra de la tipografía, los personajes, las plantillas, las referencias
  de cada tipo y las fotos del catálogo son archivos de la galería sin `usado_en`: vaciar la papelera (o la purga de 30
  días) los borraba de R2, el kit y el catálogo seguían apuntando a ellos y TODA pieza que los llevaba de referencia
  fallaba con «Una de las imágenes ya no existe» (un carrusel entero del director, lámina a lámina). Ahora la purga y
  «Vaciar» los saltan y «Borrar del todo» contesta 409 diciendo qué es. Lo que una papelera de antes ya borró: GET
  /api/estudio lo quita del kit y de `productos` que devuelve (sin tocar lo guardado; se comprueba en R2 sólo lo que no
  tiene ficha, como mucho 10) y lo dice en `perdidas`, que el kit enseña arriba. `crear_en_estudio` salta un logo
  perdido. Y si aun así llega una referencia perdida que es de la MARCA (`sinLaQueFalta` en trabajos.js: al pedir y
  otra vez al generar, porque los encargos del servidor guardan sus claves y `conPlantillaDelDirector` lee el kit
  GUARDADO), la pieza se crea SIN ella y la nota dice cuál faltó y dónde se arregla (`medios.faltaron`); antes una
  sola tumbaba el carrusel entero. Una que no es de la marca (la imagen que se corrige, la lámina anterior, lo puesto
  a mano) sigue cortando: sin ella sería otro pedido.
- **El modelo se escoge para UNA acción, sin fijarlo** (`SelectorModelo.jsx`; `modeloEscogido` en otraVersion.js,
  `modeloDeEdicion` en edicion.js): en el visor («Editar», «Otra igual», «Otra versión distinta») y en el post
  («Crear la imagen aquí» y las acciones rápidas; ya no está en `OpcionesCrearAqui`). Los que no hacen la proporción
  que tiene que salir se marcan con el que los releva (`relevoDe`): antes se cambiaban en silencio y la galería se
  llenaba de Nano Banana sin que nadie lo escogiera. Lo que sale dice con qué se hizo. La galería filtra por modelo
  (`modelosDeLaGaleria`, por NOMBRE) y el buscador encuentra por él. **Lo de `/api/generar-imagen` se apunta con el id
  del PROVEEDOR** («gemini-2.5-flash-image», «muse-image-1.0»): `nombreDelModelo` lo resuelve por `gid`, o la tarjeta
  decía «gemini-2.5-flash-image».
- **Quién VE los videos se escoge** (Ajustes → IA → «Ver videos», `ia_modelos.video`, `motorDeVideo`): Gemini con la
  llave de siempre, Gemini con `GOOGLE_AI_KEY_GRATIS` (nivel gratuito: se apunta a costo 0; Google puede usar lo que
  recibe y tiene topes, y el 429 lo dice así) o Meta. Meta NO recibe video: `verVideo` contesta 409
  `codigo: "fotogramas"` y el navegador los saca (`conFotogramas` en db.js) y repite el pedido; sin audio, sin
  transcripción. `agregarReferencia` NO guarda la referencia en ese 409 (si no, el reintento la guardaría dos veces).
  **La llave gratuita daba 404 y la de pago no:** Google dejó los 2.5 sólo para los proyectos que ya los usaban, y la
  llave gratuita suele ser de un proyecto nuevo. Con un 404 al analizar, `verVideo` pregunta a `/v1beta/models` qué
  tiene ESA llave (`elegirModeloVideo`: Flash estable más nuevo, sin imagen ni voz) y repite. El video ya subido vale.
- **El lote del MES completo** (Producir en lote → «Mes completo», `POST /api/estudio/<c>/lote/mes`): el mes y los días
  de la semana; cada día toma su tipo del RITMO del cliente con los ajustes de temporada (`sugerenciasDeTemporada`,
  aplicados solos: son conservadores) y la matriz de «Planificar mes» (`asignarMatriz`). Las piezas van al calendario
  cada una en su día, una tras otra (`llevarAlCalendario`: el mismo calendario no se escribe a la vez). Del mes en
  curso, sólo desde hoy (Panamá).
- **El lote va por FASES y por FORMATOS** (`EstudioLote.jsx`). Las ideas se escriben de `TANDA` (6) en 6 con `{ desde,
  tamano }` (el servidor corta el plan a `TANDA_MAX`, 10, y devuelve `total`): el plan es el MISMO en cada tanda porque
  sale de la misma semilla, y cada tanda recibe los titulares que ya salieron. Con 30 en una llamada cada pieza recibía
  muy poca atención. Fase 1: «Sólo las ideas al calendario» las lleva SIN diseñar, cada una en su día, sin archivos (el
  cliente aprueba la idea mientras no tengan pieza; ya SIN marca `aprobacion`: ver «La marca «idea» del sistema se iba
  con la publicación») y con «Qué se ve» (`post.escena`), que es lo primero que leen después «Crear con IA» y «Producir el
  mes» (`promptDePublicacion`). Fase 2: crear las que no se llevaron. Formatos `carrusel` y `reel` (`guiado` en
  `FORMATOS_LOTE`): la IA escribe además su guion y cada idea pasa por el camino de a mano —`crearCarruselDeIdea`
  (propuesta + láminas) y `crearReelDeIdea` (planos + fotogramas + video)—, uno detrás de otro; sin revisión entre
  medias: los tramos y las láminas se corrigen después en el Estudio. Los personajes del kit también van en el lote.
- **«Generar» la idea de un post vacío va por el LOTE** (`src/lib/ideaPublicacion.js`, modo «publicacion» de
  `POST /api/estudio/<c>/lote/ideas`). Antes era una frase genérica («una idea creativa, 2 oraciones») con «publicación de
  post» sin decir qué es un post: salían ideas planas, y para un post a veces un carrusel o un reel. Ahora es UNA casilla
  de `darForma` con lo que ya trae la publicación (tipo, producto, nivel, deseo, perfil, la fecha especial de su día), la
  campaña y la semana como `nota`, y lo que ya hay en el mes en `usados`; el estudio de mercado, el catálogo y el cerebro,
  como el lote. `REGLA_FORMATO` (loteAnuncios.js) dice con todas sus letras qué es cada formato, también en el lote y en
  el modo «campos» (el camino de una idea ya escrita, del banco y de un directo), que pide «mejórala conservando su tema…;
  no la cambies por otra idea ni por otro formato».
  `rellenarConIdea` SÓLO rellena: título, idea (el brief), qué se ve, el texto de la pieza (no en carrusel ni en reel) y
  el guion (sólo carrusel y reel); el producto va con su nombre o no va. Un directo va por el modo «campos».
- **El motor de ideas busca en el cerebro según los TIPOS de la tanda y dice qué material falta** (`src/lib/materialTipo.js`,
  `produccionDeLote` en worker/lib/estudio/lote.js). Antes la consulta era siempre «beneficios objeciones público
  contenido»: un educativo y un testimonio recibían los mismos pasajes. Ahora `consultaDelPlan` junta las palabras de los
  tipos (y las maletas por la suya). Lo que un tipo NECESITA de verdad (`MATERIAL`: testimonios reales, la garantía, el
  equipo o la historia, el diferenciador) se busca aparte con `buscar` (n: 1, sólo si el cerebro tiene notas): si no hay
  nada, va a la IA «no lo inventes» (`lineaDeLoQueFalta`, en las reglas del pedido) y la respuesta trae `faltan`, que el
  lote y «Planificar mes» enseñan (`avisoDeLoQueFalta`). Las palabras de búsqueda de cada material son ESTRECHAS
  («testimonio reseña», no «cliente»): una palabra común encontraría siempre algo y el aviso no saldría nunca.
  · **«Saber del rubro»** (`worker/lib/cerebro/rubro.js`, `POST /api/cerebro/<c>/rubro`, botón en la pestaña Cerebro): la IA
  PROPONE lo que un experto del rubro sabe —consejos, errores comunes, mitos, preguntas frecuentes, datos con fuente— con
  búsqueda web si la cuenta la tiene (función «saber del rubro», hueco «análisis») y lo que se sabe de la marca (sin lo
  interno); si ya había nota, la mejora. No guarda: se abre en el editor de notas de siempre (con su `id` si existía) y la
  persona la guarda. El motor de ideas la lee ENTERA (hasta 4.000 caracteres) cuando la tanda lleva un educativo, por su ruta
  (`saber-del-rubro`) o por su título; sin ella, `faltan: ["rubro"]`.
- **UN solo motor de ideas para el calendario** (modo «plan» de `POST /api/estudio/<c>/lote/ideas`, `limpiarCasillas` en
  worker/lib/estudio/lote.js). «Planificar mes», «Completar los textos que faltan» y «Mes completo» con la plantilla
  escriben por el mismo camino que el lote: antes «Planificar mes» pedía «una idea de 1-2 oraciones» sin decir qué es
  cada formato, sin forma, sin qué se ve ni texto de la pieza, y cada tanda de 7 días no sabía lo que habían escrito
  las otras (se repetían). Ahora la pantalla manda las CASILLAS ya decididas (`casillasDelPlan`, `casillasSinIdea` en
  src/lib/ideaPublicacion.js; `casillasConPlantilla` en loteMes.js): clave «fecha|índice» (o el id de la publicación),
  formato —MEZCLADOS: post, historia, carrusel, reel; un directo no se escribe—, tipo, matriz, el concepto de su
  semana, la fecha especial y la idea que escribió una persona (se desarrolla conservando su intención; la de la IA
  queda AL LADO como `sugerencia`). El servidor completa la matriz sobre el plan ENTERO (`asignarMatriz` respeta lo que
  trae) y le da forma (`darForma`, la plantilla de texto según el formato de CADA casilla), y va por tandas con
  `{ desde, tamano }` y `usados`. Va además la ESTRATEGIA del mes (`estrategia`: campaña, ofertas, código, el concepto de
  cada semana; `textoEstrategiaDelMes`, también en el modo «mes»). Cada idea vuelve con su `clave` y trae, además,
  `hashtags` (`limpiarHashtags`); el guion sólo se lee en carrusel y reel (`leerProduccion(texto, plan, formato)`).
  Sin `composiciones` en el pedido, el servidor las aprende de la galería (`composicionesAprendidas`, una consulta).
- **La FORMA de la idea viaja con la publicación** (`composicion`, `tactica`, `hashtagsFinales`; `publicacionDePieza`,
  `rellenarConIdea`, `handleGenerate` de PlanWizard): al diseñarla después, `promptDePublicacion` pone «Composición
  sugerida: …». Un carrusel no lleva `textoPieza` (va lámina a lámina en el guion).
- **«Mes completo» sigue la plantilla de plan del cliente** («Según su plan», `formato: "plan"` en EstudioLote, que
  arranca así si el cliente tiene plantilla): cada día sus formatos y varias por día. Al crear, primero las de una
  imagen (por formato: cambian la proporción y la plantilla) y luego carruseles y reels uno a uno; las láminas van con
  el modelo escogido si admite referencias (`modeloCarrusel`). El costo se suma por formato.
- **El lote del mes salta los días que ya tienen publicación** (`omitir` en `lote/mes`, `diasConPublicacion` en
  loteMes.js con `client.calendars`): antes «Mes completo» creaba una segunda encima. Todos ocupados: 400 sin llamar a la
  IA. Lo que ya hay se diseña con «Diseñar las que ya hay» (ProducirMes).
- **«Producir el mes» es el botón grande del calendario** y abre el ASISTENTE DEL MES (fase 6; ver «El mes en un solo
  flujo», al final). El lote del mes del Estudio (`?lote=mes&mes=AAAA-MM`: Estudio lo lee al montar, abre el lote en «Mes
  completo» con ese mes y quita la búsqueda de la dirección) sigue, desde el paso Plan del asistente («Otras formas de
  planificar»). `ProducirElMes.jsx` (la pregunta «crear o diseñar») se quitó: la hace el asistente.
- **«De la galería» en una publicación** (`GaleriaSelector.jsx`, botón de `EditorMedios`): un carrusel o un reel es UNA
  tarjeta y tocarla escoge todas sus piezas en su orden; las sueltas, una a una con su número. Con algo ya puesto pregunta
  añadir o reemplazar; con el formato automático, dos o más lo vuelven carrusel (si no, se avisa). Se apunta el uso de
  cada una. Desde «Crear con IA», el visor de un carrusel tiene «Usar el carrusel en la publicación» (`onUsarVarias`, que
  AÑADE; en un reel, sólo el video). Va lazy: `lib/estudio.js` no puede entrar al arranque.
- **«Mandar el carrusel a la papelera»** (VisorGrupo, con segundo toque): se va TODO lo de su carpeta (`todas`), también
  las crudas sin texto y las versiones viejas, y lo dice; avisa de las que usa una publicación (siguen viéndose ahí y la
  papelera no las purga). La carpeta se queda: sin piezas, la galería no la pinta.
- **El texto y el logo los diseña el MOTOR, y el CONTROL DE CALIDAD los vigila** (decisión de la agencia: una maqueta
  fija —foto, bloque de color, texto abajo siempre igual— se ve genérica; Nano Banana integra el texto con la luz y la
  composición y diseña mejor, aunque se equivoque en letras). `POST /api/estudio/<c>/archivos/<id>/control` (función
  «control de calidad», hueco «análisis»; worker/lib/estudio/control.js): la IA MIRA la imagen, transcribe el texto tal
  cual se ve y señala precios fuera del catálogo, el logo ausente o deformado (sólo si se le dio: `LINEA_LOGO` en el
  pedido), deformaciones y las reglas del kit. El veredicto NO es sólo de la IA: `compararTexto` compara palabra por
  palabra el texto esperado con el leído, con tildes y eñes (y dos letras de sitio cuentan un error), porque el modelo
  suele dar por buena «Sofa» donde dice «Sofá». El texto esperado: el que manda la pantalla, el de la plantilla encima o
  el del pedido (`textoDelPedido`: la línea del texto, la de la lámina o lo citado DENTRO de la escena mejorada). Queda
  en `estudio_archivos.ajustes.control` (la galería pinta «✓ Revisada» / «Revisar» con `data-control`, sólo CSS).
  · **Si sólo falla el texto, se corrige EDITANDO la misma imagen** (`corregirTexto`, `correccionDeTexto`: «donde dice X
  debe decir Y; conserva todo lo demás») con el modelo que la hizo si edita, o Nano Banana (`modeloParaCorregir`), se
  controla otra vez y se queda la que tenga menos errores (a igualdad, la original). Pedir otra desde cero perdería el
  diseño que salió bien. Un precio, el logo o una deformación no se corrigen solos: «Revisar», y decide una persona.
  · **Va solo** al terminar cada pieza del lote, cada lámina del carrusel (ANTES de que vaya de referencia a la
  siguiente: si no, el error se copiaría en la serie), «Diseñar las que ya hay» y el compositor (`terminarTrabajo`, que
  también estampa el logo). Va SIEMPRE: la casilla «Revisar cada pieza…» (`controlEncendido`, por navegador) se quitó. Con la plantilla, el
  texto lo pone la aplicación: no se controla. Si el control falla (sin saldo, sin red), la pieza sigue sin él.
  · En el visor, `ControlDeCalidad` (EstudioVisor.jsx): lo leído, lo mal escrito, «Corregir el texto» y «Revisar otra vez».
- **La tipografía REAL de la marca** (`kit.fuente`: { clave, nombre, muestra }; `FuenteDeMarca.jsx`, `POST
  /api/estudio/<c>/kit/fuente`). El archivo (TTF, OTF, WOFF, WOFF2, reconocido por sus bytes, ≤ 3 MB) va a
  `clientes/<c>/fuentes/`; el NAVEGADOR dibuja una muestra con él (`dibujarMuestra`: la marca, el abecedario con tildes
  y eñes, números) que se sube a la galería, y el kit guarda las dos (el servidor comprueba que sean de ESE cliente y
  existan). La muestra va de referencia con `toma: ["tipografia"]` (`referenciaDeTipografia`) en toda pieza donde el
  modelo escribe el texto —compositor, lote, «Producir el mes», láminas—: el motor diseña libre pero con la letra de la
  marca. La plantilla escribe con la fuente real (`cargarFuente` → FontFace desde /api/media, `font-src 'self'`).
  `fundirKit` la conserva.
- **El compositor del Estudio va al límite de su chunk (20 kB):** la lógica de sus referencias vive en
  `apoyosDelCompositor` (pieza.js, compartido), el control en controlEstudio.js y el visor en su chunk. Lo nuevo de la
  pantalla, fuera de Estudio.jsx.
- **Las ideas las aprueba la AGENCIA; el cliente aprueba el calendario ya creado** (decisión de la agencia: no se le
  mandan ideas sueltas). «Revisar las ideas» (menú «⋯» y «Producir el mes»; `RevisarIdeas.jsx`, `revisionIdeas.js`):
  una tarjeta por idea sin contenido con su qué se ve, texto o guion y caption. «Aprobar» la pasa a `etapa:
  "produccion"` —la misma del tablero, sin campo nuevo—; «Otra» la reescribe por el motor de ideas (modo «plan» con
  `antes`, la que había, y `pide`, lo que quiere la agencia: `casillaParaOtra` / `reemplazarConIdea`, que REEMPLAZA lo
  escrito por la IA porque se pidió otra); «Quitar» la saca del mes con un segundo toque. «Diseñar las que ya hay» marca
  de entrada las aprobadas (si hay) y pide DOS versiones de cada imagen por defecto (se escoge en el resultado; la que
  pasa el control se propone primero). El lote del Estudio tiene la misma «Otra» por idea y guarda un BORRADOR por
  cliente en el navegador (`estudio-lote-borrador:<cliente>`, 7 días): cerrar la ventana ya no pierde las ideas pagadas;
  se borra solo cuando todas las escogidas están en el calendario.
- **El calendario va al cliente COMPLETO, y lo que pide cambiar se rehace sobre la misma pieza** (`estadoDelEnvio`,
  `mensajeDeEnvio`, `instruccionDelCliente`, `corregidaTrasCambios` en lib/aprobacion.js; `calendario/cambiosCliente.jsx`).
  «Enviar a cliente» dice cuántas llevan su pieza, cuántas no (el cliente las vería como idea: «Diseñar las que
  faltan»), cuántas no tienen hora (aprobadas, no se podrían programar sin tocarlas), cuántas tienen cambios pedidos sin
  hacer y cuántas ya están corregidas. `conAprobacion` trae el comentario del cliente (`cambiosPedidos`) y cuándo lo dijo
  (`cambiosAt`) —sólo en el estado, como el resto de la respuesta— y `pedirAprobacion` los olvida. En la pestaña Subir,
  «Rehacer la imagen con lo que pidió» EDITA la misma imagen con su comentario (+ lo que añada la agencia) por
  `rehacerConComentario` (controlEstudio.js: `pedidoDeCorreccion`, Nano Banana si hay llave, el control si está
  encendido) y la sustituye en su sitio; la de antes queda en la galería. Al guardar, `marcarActualizada` hace el resto:
  el enlace del cliente la enseña «Actualizada · revísala» con lo de antes, hay un filtro «Actualizadas» y el mensaje de
  WhatsApp, tras su revisión, dice «ya hicimos los cambios… revisa sólo esas». Corregida = `actualizadaAt` posterior a
  `cambiosAt`: sin `cambiosAt` (filas de antes) cualquier cambio cuenta.
- **La estrategia del mes va ANTES de las ideas** (`src/lib/estrategiaMes.js`, `worker/lib/estudio/estrategiaMes.js`,
  `POST /api/estudio/<c>/estrategia`, función «estrategia del mes»; `EstrategiaMes.jsx`). El paso «Estrategia» de
  «Planificar mes» tiene objetivo (`OBJETIVOS_MES`: vender, crecer, lanzar, marca), producto foco y campaña;
  «Proponer la estrategia con IA» trae además el concepto y la ETAPA del embudo de cada semana (`ETAPAS`: atraer,
  considerar, convertir, fidelizar), con el catálogo, el estudio, las fechas especiales y lo que mejor funcionó el mes
  anterior (`mejoresDelPeriodo` sobre `metricas_publicacion`). Propone y no guarda: se aplica entero y se puede
  deshacer. Las semanas son las de «Planificar mes» (bloques de 7 días desde el 1: las manda la pantalla). Se guarda en
  `opciones.estrategia` del calendario (objetivo, foco, etapas; el enlace público sólo lee `fechaLimite` y el mensaje), y
  `estrategiaDelCalendario` la manda al motor de ideas: el objetivo y el foco por su nombre, cada semana «concepto (etapa:
  …)». **El foco pesa la mitad de la rotación** (`ordenDeProductos(…, { foco })`: pesa lo que todos los demás juntos), en
  la matriz de la pantalla y en el modo «plan» del servidor (`estrategia.focoId`).
  · **El balance son REGLAS** (`balanceDelMes`): un tipo de más del 40 %, un producto que no es el foco con más de la
  mitad, el foco con menos de un tercio, ninguna pieza a quien ya conoce el producto (o más del 75 % vendiendo), sin
  reels, el mismo formato cuatro días seguidos y una semana vacía. Sale en el paso Ideas de «Planificar mes» y en «Revisar
  el mes».
- **«Dame ideas»** (`POST /api/estudio/<c>/ideas`): variadas (un tipo de contenido distinto cada una) o del tipo
  escogido, sobre lo escrito si hay algo. «Usar» pone escena + texto exacto, el tipo y las fotos de su producto.
- **Varios productos en una pieza**: `productosNombrados` encuentra TODOS los que nombra la idea («Sofá cama» no cuenta
  también como «Sofá») y `fotosDeVariosProductos` reparte los huecos: una foto de cada uno antes que la segunda de
  ninguno. «Fotos de productos» del compositor suma productos con la misma regla.
- **El kit de marca va en su chunk** (lazy en Estudio.jsx): el del Estudio tiene tope de 20 kB comprimidos
  (`rendimiento.bundle.test.js`) y lo pasó al sumar «Dame ideas» y la referencia por tipo.
- **El lote de anuncios cobra sólo al final** (`EstudioLote.jsx`, `POST /api/estudio/<c>/lote/ideas`, función «ideas de
  anuncios» en el hueco de redacción). La IA escribe titular, apoyo y escena por nivel con el catálogo (precio EXACTO),
  el estudio de mercado aprobado del producto y el cerebro para texto (nunca lo interno): eso es texto. Las ideas se
  revisan y se quitan, y el botón dice el costo total: ESA es la confirmación, así que cada trabajo va con `confirmado:
  true`. Las piezas van a una carpeta «Lote <producto> · <día>», de dos en dos (`crearLote`), con las fotos del producto
  y el logo si caben; en «plantilla» el texto se pone encima con `componerLamina` (en historia, al centro: abajo lo tapan
  los botones de Instagram). «Llevar al calendario» llama a `llevarAlCalendario` de App.jsx (que obtiene o crea el mes y
  mete la publicación por el guardado agrupado, como el asistente) y apunta el uso del archivo: sin `usado_en`, la
  papelera se llevaría la imagen de una publicación.
- **«Recrear un anuncio» no tiene ruta propia: es la referencia de la competencia** (`EstudioRecrear.jsx`, desde la
  pestaña Estudio o «Recrear como anuncio» del visor). Analizar es `POST /api/mercado/<c>/referencias` (Claude mira la
  imagen, Gemini ve el video; queda en el cerebro como nota INTERNA y en las referencias del estudio de mercado, y el
  archivo pasa a la carpeta «Competencia»), y la versión es `…/referencias/<id>/adaptar` con el producto. «Crear con
  mi marca» no crea nada: pone la versión en el compositor (`pedidoParaElCompositor`, src/lib/recrear.js) con las
  fotos del producto delante y el anuncio con `toma: ["composicion", "estilo"]` y la nota de que es de otra marca; el
  costo se ve allí. En video, el anuncio va como video de referencia con Kling Omni y sin texto en pantalla.
- **El video va LIMPIO: a un modelo de video nunca se le pide texto, subtítulos ni logo** (`SIN_TEXTO_VIDEO` en
  `src/lib/videoLimpio.js`, decisión de la agencia: escriben mal y deforman el logo). Una sola frase que usan
  `LINEA_VIDEO` (todo video del compositor), el Reel IA (guion, fotogramas, video, Flow, tramo), el guion corto, el lote
  y el recreador. El guion del reel ya no trae `texto` por plano; uno de antes que lo traiga se lee y se ignora.
- **«Modo de foto» y «De temporada» son atajos de «¿Qué quieres?»** (`src/lib/modosFoto.js`, `temporada.js`,
  `calendario/avisoTemporada.jsx`). Rellenan la indicación que ya usan «Crear la imagen aquí», «Otra versión» y «Recrear»
  (el director la trata como lo que manda): no crean nada solos. Los modos son los de la sesión de fotos de producto de
  Higgsfield que no existían como composición (con manos, una persona lo usa, flotando, salpicadura, Pinterest); NO se
  sumaron a `COMPOSICIONES`, que rota el lote y aprende de la galería. La temporada es la MISMA pieza ambientada en una
  fecha del cliente (`fechasQueVienen`: sin delicadas ni ocultas; las que venden van antes de los feriados al recortar,
  o los cinco feriados patrios de noviembre dejaban fuera al Black Friday), sin inventar ofertas. Todo atajo cabe en los
  300 caracteres del campo (un test lo recorre). El aviso del mes (`fechaParaAvisar`: comercial, propia o escogida en 21
  días) va en `CalendarView`, que es de la carga inicial: por eso los textos viven aparte, en modosFoto.js, que sólo
  carga el panel. «Ahora no» se recuerda por navegador (`temporada-avisada:<cliente>`).
- **La fase 2 de las recetas de Higgsfield: portada, revisión del video y la serie del mes** (método público, MIT,
  `docs/licencias/higgsfield-skills.md`). Cosas que no se ven:
  · **«Portada que da clic»** (`src/lib/portadaClic.js`, `calendario/PortadaClic.jsx` dentro de «Portada del video») no
  tiene ruta propia: es «Crear la imagen aquí» (`crearImagenDelPost`) con la publicación cambiada —su `escena` es la de la
  portada (`escenaDePortada`: el concepto, una idea, el titular enorme, la zona segura del formato), `textoPieza` el titular
  (así el control lo lee letra por letra) y sin el pedido listo— y `opciones.proporcion` (9:16 o 16:9, que el post no
  dice). La vista a 120 px es un `<img>` a ese ancho (en reel, la ventana 3:4 del perfil): si ahí no se lee, no sirve.
  · **«¿Está listo este video?»** (`src/lib/revisionVideo.js`, `worker/lib/estudio/revisionVideo.js`, `POST
  /api/estudio/<c>/revisar-video`, función «revisión de video») va por `verVideo`, como «Extraer guion»: Gemini, o Meta
  por fotogramas (sin audio: la voz queda «sin saber», `porFotogramas`). El VEREDICTO lo pone el código (`veredictoVideo`):
  un no en el gancho, la voz o un defecto lo deja «No está listo» aunque el puntaje sea 9. Queda en
  `ajustes.revisionVideo` de la ficha: un video no cambia (una versión es otro archivo) y la segunda vez no se paga, salvo
  «Revisar otra vez».
  · **«Las piezas juntas»** (`src/lib/piezasJuntas.js`, `lib/hojaPiezas.js`, `worker/lib/estudio/serie.js`, `POST
  /api/estudio/<c>/serie`, función «piezas juntas»; en «Revisar el mes») mira el mes como SERIE, lo que la revisión de cada
  imagen sola no ve. El navegador junta hasta 24 en UNA hoja numerada (encajadas, sin recortar: el recorte escondería el
  logo) y la IA la mira con el kit: cuesta lo de una imagen. El servidor sólo acepta un JPEG de verdad (por sus bytes) y
  `leerSerie` sólo devuelve números que están en la hoja. **Nada de esto se ha probado contra Gemini ni Anthropic reales.**
- **«Video del producto» es una RECETA: termina en la foto real y el logo real porque no los dibuja el modelo de video**
  (`src/lib/videoProducto.js`, `videoProductoEstudio.js`, `FlujoVideoProducto.jsx`, `POST /api/estudio/<c>/video-producto/guion`;
  salió de una prueba con Baby Caleb y MiniMax H3 que la agencia aprobó). Producto del catálogo CON fotos → guion (primer
  fotograma, tres tramos, cámara, locución y música) → el primer fotograma SIN logo y el cierre con las fotos del producto
  y el logo del kit (o estampado), por el camino de una pieza (`pedidoDePieza`) → el video con imagen inicial Y final
  (`sirveParaProducto`; `PREFERIDOS_PRODUCTO` empieza por MiniMax H3). Cosas que no se ven:
  · **La voz va ESCRITA entre comillas en el pedido** (`promptDeVideoProducto`): sin ella, H3 se inventó una locución en
  otro idioma. Seedance y Wan van sin voz (`sinVozEnProducto`). El prompt es CORTO (`MAX_PROMPT_VIDEO_PRODUCTO`) y describe
  el movimiento por segundos, no lo que ya se ve: reglas del método público de Higgsfield (MIT, `docs/licencias/`).
  · **El primer fotograma no lleva logo**: el video lo arrastraría deformado. El cierre lleva el logo el ÚLTIMO (las fotos
  dejan su hueco, `fotosParaFotograma`).
  · **Vive DENTRO de FlujoReel** («Video» → «Guiado» → «Del producto», `FORMAS`): el chunk del Estudio está en su tope y una
  forma nueva en el compositor no cabía. En una publicación de reel o historia, «Video del producto» abre `ReelIA` con
  `forma="producto"`; el caption que escribe sólo RELLENA el del post.
  · **El asistente y Claude (MCP) siguen la misma receta**: `ver_estudio` la explica (`RECETA_VIDEO_PRODUCTO`) cuando el
  catálogo tiene fotos, `crear_en_estudio` acepta `sin_logo` para el primer fotograma y su tope de video es 15 s (lo frena
  la confirmación de 0,50 $). Atajo del director: «Video de un producto».
- **El Reel IA saca dos cosas de los fotogramas** (FlujoReel.jsx): «Un solo video con todo» (el storyboard, listo para
  subir) o «Un clip limpio por fotograma» (`pedidoDeClip`/`crearClips` en lib/reelEstudio.js): cada fotograma es la
  imagen inicial de su clip, SIN texto, voz ni música (`sonido: "no"`), todos a la vez, y se bajan en un ZIP numerado por
  plano para CapCut — el método de la agencia en Flow. 15, 20 y 30 s salen en UN video por API con Seedance 2.5 por Kie
  (`DURACIONES_REEL`; `soloFlow` es sólo 40 s); en 30 s caben 12 planos. Seedance y Wan van SIN voz (`sinVozPropia`:
  la inventan mal en español): el pedido dice «sin voz ni diálogo» y la locución del guion no se les manda.
- **La voz de la marca es del kit** (`kit.voz`, una de `VOCES_OMNI`; el servidor descarta otra). Arranca el Reel IA y el
  compositor al escoger Omni. «Escuchar» (`GET /api/estudio/<c>/voz/<voz>`, worker/lib/estudio/voz.js) pide a Google
  una frase con esa voz por su texto a voz —las voces de Omni son las de Google— con la MISMA `GOOGLE_AI_KEY`, y la
  guarda en R2 bajo `voces/` (no `clientes/`): cada voz se paga una vez para toda la agencia. Google devuelve PCM en
  crudo y se le pone la cabecera WAV (`wavDePcm`). Si la llave no tiene el primer modelo de voz (404), prueba el
  siguiente (`MODELOS_VOZ`). Pasa por `bloqueoPorPresupuesto` y `registrarConsumoGemini`. **No se ha probado contra
  Google real.**
- **El director comercial de los videos** (`src/lib/directorVideo.js`, `worker/lib/estudio/director.js`). TODO guion de
  video (Reel IA, recrear un anuncio) lleva el CRITERIO COMERCIAL de la agencia (`lineaDelDirector`): gancho visual en 2
  s, problema antes que producto, un beneficio, nada inventado, llamado a la acción… Se edita en Ajustes → Manual de
  campañas → «Criterio comercial de los videos» (`manual_campanas.video`: dentro del manual, sin migración); vacío vale
  `MANUAL_VIDEO_BASE`. «Revisar como director comercial» del Reel IA (`POST /api/estudio/<c>/director`, función
  «director comercial») devuelve la idea mejorada y qué cambió y por qué; nada cambia hasta «Usar esta». El criterio se
  lee a mano en director.js y no con `leerManual` de estratega.js: estratega.js importa mercado.js, y mercado.js usa
  director.js (sería circular).
- **Sin llave, el modelo no existe para la pantalla.** El compositor sólo lista los que tienen llave y, si el escogido
  no la tiene (un borrador, una llave quitada, un pedido de fuera), Estudio.jsx lo cambia al preferido. El recreador de
  video fijaba Kling Omni de HIGGSFIELD —sin llave en la cuenta—, y por eso «no se creaba el video».
- **Recrear un video: dos modos y el motor lo propone una REGLA** (`MODOS_RECREAR` en lib/recrear.js,
  `motorParaRecrear` en lib/motorRecrear.js). «Mismo video, con mi producto» edita el original (Omni por Kie, con 5
  fotos del producto como mucho); «Otra versión que transmita lo mismo» hace uno nuevo SIN el original, por tramos, a la
  duración de la referencia (Seedance 2.5 llega a 30 s). La regla recorre una lista de preferencia y se queda con el
  primero CON LLAVE: la IA no escoge, así no puede proponer lo que no hay. Las fotos del producto van también en video
  (antes `video ? [] : …` las vaciaba). «Otra versión» llama a `…/adaptar` con `antes` y `pide`, sin volver a analizar,
  y un anuncio ya analizado (está en las referencias del estudio de mercado por su `archivoId`) no se paga otra vez.
  Seedance y Wan van SIN voz (la inventan mal en español): música y sonido ambiente.
- **La galería tiene una pestaña Drive** (`ExploradorDrive` en modo «escoger»): lo tocado se baja (`archivoDeDrive`), se
  sube a la galería y entra en el pedido. No le pases un `onError` en línea: está en las dependencias de su carga, y una
  función nueva en cada render la relee en bucle (y le llega un `Error`, no un texto).
- **Una ficha de la galería sin su archivo se veía rota.** «Ampliar con IA» pide por
  `/api/generar-imagen`, que apunta la imagen en la galería, y luego descarta la
  intermedia con `/api/feedback-imagen` (`liked: false`), que borraba el archivo de R2
  y dejaba la ficha. Ahora ese descarte quita también la ficha (`olvidarClave`); las
  que ya estaban las detecta la pantalla (la imagen no carga) y «Quitarlas de la
  galería» llama a `POST …/archivos/<id>/perdido`, que sólo borra la ficha si R2 dice
  que el archivo NO está: una imagen que falló por la red no se pierde.
- **«Su contenido en Instagram»: lo que publica la competencia, lo que mejor le funcionó primero**
  (`ContenidoCompetencia.jsx` en la pestaña Competencia del estudio de mercado; `worker/lib/competencia.js`,
  `src/lib/competencia.js`; `GET /api/mercado/<c>/competencia?usuario=`). `business_discovery` desde el Instagram del
  cliente o, si no tiene, cualquiera del espacio (como la auditoría): sólo cuentas de empresa o creador (409 si no). Se
  ordena por interacciones (un comentario pesa el doble) con la tasa por cada 100 seguidores; los chips son los
  `competidores` de la ficha. Las miniaturas pasan por `/api/metricas/miniatura` y la dirección del ARCHIVO no llega al
  navegador. «Analizar como referencia» = `POST …/competencia/traer` (baja el archivo del CDN de Meta —sólo de
  `cdninstagram.com`/`fbcdn.net`, ≤ 50 MB— a la galería, carpeta «Competencia», pidiendo la dirección otra vez porque
  caducan) + la referencia de siempre (`agregarReferencia`, orgánica): desde ella salen «Adaptar», «Recrear con mi marca»
  y «Seguir este video». En un reel, además, «Extraer guion UGC». **Nada se ha probado contra Meta real.**
- **Inspiración: las cuentas que sigue cada cliente y lo que publican** (`src/lib/inspiracion.js`, `worker/lib/inspiracion.js`,
  `Inspiracion.jsx`, 0046). Hasta 10 cuentas por cliente (Instagram, YouTube o TikTok; «Competencia» o «Inspiración») en
  `clients.competidores`, que eran @ sueltos: `cuentasDeReferencia` lee las dos formas sin tocar una fila, y la foto de
  Resultados mide sólo las de Instagram de competencia (`usuariosParaMetricas`). Cosas que no se ven en la pantalla:
  · **El feed se GUARDA** (`inspiracion_cuentas`, `inspiracion_publicaciones`): abrirlo no gasta llamadas. Lo pone al día el
  cron (`inspiracionPendiente`: un cliente por vuelta, cada `CADA_HORAS` (20), el último paso y sólo si la vuelta no hizo nada
  más; hasta 10 llamadas a Meta o 3 por canal de YouTube) y «Actualizar». Una cuenta que falla deja su error Y su fecha (si no,
  el cron la repetiría cada minuto) y no borra lo que ya se había leído de ella; lo de una cuenta leída bien que ya no está entre
  sus últimas, o de una cuenta que se quitó, se borra. La consulta del cron es una lectura sin dueño (`clientesConInspiracionVieja`).
  · **«Rinde X×» es contra la MEDIANA de la propia cuenta** (`conRendimiento`; con menos de 3 publicaciones, null): con la media,
  un viral dejaba a las demás por debajo. Lo nuevo (7 días) que rinde 3× o más AVISA al equipo una vez (`avisado`, tope 3 por lectura).
  · **YouTube por la Data API** con el token de un canal conectado del espacio o `YOUTUBE_API_KEY` (`canalPublicoYouTube`,
  `forHandle`); su video NO se baja (sus condiciones): el guion lo saca Gemini POR EL ENLACE (`verVideo({ youtube })`,
  `extraerUgc({ youtube })`; con Meta como motor de video, 409). **TikTok no deja ver lo de otros por su API**: va por Scrape
  Creators (ver «TikTok y las tendencias por Scrape Creators»); sin la llave, la cuenta queda con su aviso y se abre su perfil.
  · **Un enlace de Instagram sin @** (`traerEnlace`): la API no busca por enlace. Se busca en este orden y se para en el primero:
  el @ del enlace o el escrito, la memoria (`instagram_enlaces`) y el feed guardado, las cuentas fijas del cliente (una llamada
  por cuenta, y esa lectura sirve para bajarlo), la página pública de «insertar» (`/p/<código>/embed/captioned/`,
  `usuarioDelEmbed`: SÓLO el @, decisión de la agencia; el archivo va siempre por `business_discovery`) y, si nada, 409
  `codigo: "usuario"`. Lo resuelto se recuerda en cuanto se encuentra la publicación.
  · **Un reel con música de Instagram no trae `media_url`** (Meta lo omite, incluso del propio): 409 `codigo: "musica"` y se
  ofrece su miniatura (`miniatura: true`) para analizarlo con su texto, o guardarlo desde el teléfono y compartirlo.
  · **Lo de otra cuenta va como REFERENCIA, nunca en `medios`** (`post.referencias`, `referenciasPost.jsx`): lo que está en
  medios se publica. `deIdeaAPublicacion` pasa los `archivos` de una idea del banco a `referencias` —antes iban en un campo que
  la publicación no leía y el video traído se perdía— y `ideaAlCalendario` apunta su uso en la galería. «Usar como contenido»
  lo pasa a medios con una pregunta (sólo si es del cliente o hay permiso). La referencia no va al enlace del cliente.
  · Se lleva a un día ARRASTRANDO desde el panel (`inspiracionId` en el `dataTransfer`, `onDropInspiracion` de MonthGrid →
  `llevarRef` del panel) o con «Llevar a un día»; los dos bajan el archivo (sólo Instagram) y usan `ideaAlCalendario`.
  · «Lo que funciona en tu competencia» (función del mismo nombre, hueco «análisis»): la IA lee las que más rindieron (45 días) y
  escribe PATRONES sin nombrar cuentas ni marcas; NO es interna (para que el motor de ideas la lea) y no se guarda sola: «Guardar
  en el cerebro» con PUT /nota, una por mes (la del mes se reemplaza por su ruta).
  · «Fórmula» abre «Extraer guion» en modo fórmula (`formula`): sólo transcribe (`soloTranscribir`, sin la llamada de texto de
  adaptar) y propone la receta. **Nada de esto se ha probado contra Meta, Google ni Instagram reales.**
- **«Lo mejor del momento»: una galería de lo que MEJOR funciona, de cuatro fuentes, para recrearlo** (`src/lib/loMejor.js`,
  `worker/lib/loMejor.js`, `worker/rutas/loMejor.js`, `LoMejorTarjetas.jsx`, `/lo-mejor`, 0062). La pestaña Inspiración de
  cada cliente (y el ojo del calendario) es ESTA vista filtrada por él; en el teléfono ocupa el sitio de «Enlace» en la barra
  de abajo («Pegar un enlace» va dentro). Cosas que no se ven en la pantalla:
  · **Cuatro fuentes, cada una con su señal, y el orden es el PERCENTIL dentro de su fuente** (`conPercentiles`, calculado
  sobre la ventana: esta semana, este mes): «4,1×» y «63 días» no se comparan. Inspiración: «rinde» CORREGIDO con pocas
  publicaciones (`rindeAjustado`: se acerca a 1× con poca muestra; YouTube, las vistas contra las del canal); anuncios: días
  activo, más si sigue y si tiene versiones (`senalDeAnuncio`); lo propio: interacciones + guardados + compartidos contra la
  mediana de su cuenta; lo guardado por el equipo: el «rinde» que traía o lo reciente. La tarjeta enseña la cifra de verdad
  (`cifraDe`), nunca el percentil.
  · **Una pieza es UNA** (`clave`: «ig:<código>», «yt:<video>», «fb-ad:<anuncio>», «tt:<video>», o «ref:<hash>» del enlace;
  `claveDeEnlace`): la misma seguida por dos clientes y guardada en el banco sale una vez, con los clientes de todas y las
  otras fuentes en `tambien` (`unirRepetidas`). La consulta del cron (`espaciosPorClasificar` en acceso.js) arma la clave
  con la MISMA regla en SQL: si cambia `claveDeInspiracion`, cambia también ahí.
  · **El tipo lo clasifica la IA UNA vez y se guarda** (`lo_mejor_piezas`, función «clasificar lo mejor», hueco «análisis»):
  Haiku sin razonar si hay llave de Anthropic (`llamarIA` acepta ahora `esfuerzo`), mirando la miniatura (del CDN o de R2) y
  el texto, de 6 en 6. Los tipos NO se limitan: lo que no encaja va como «otro» con su nombre (`etiqueta`). La pantalla pide
  clasificar lo que ve sin tipo (una vez por ventana abierta) y el cron, lo de la inspiración y los anuncios. Lo que falla
  queda apuntado con su motivo (sin `clasificada_at`): el cron no lo repite cada minuto y la pantalla lo reintenta pasadas 6 h.
  · **El cron va ÚLTIMO y sólo si nada más hizo algo** (`loMejorPendiente`, detrás de Inspiración): primero UNA tarea de la cola
  de Scrape Creators (los anuncios de un espacio, una cuenta de TikTok o una palabra de tendencia; ver «TikTok y las
  tendencias»); si no, una tanda de clasificación.
  · **Anuncios por Scrape Creators una vez por semana, con TOPE** (`lo_mejor_ajustes.sc_tope_semana`, 10 por defecto, en
  Ajustes → Integraciones; 0 la apaga): se releen las búsquedas guardadas con `fuente: "sc"` (una página por búsqueda, lo
  de la caché no gasta). CADA crédito gastado se apunta en `creditos_sc` (`apuntarCredito` en worker/lib/scrapeCreators.js),
  también lo buscado a mano: el automático se para antes. Sin créditos, el espacio se marca lleno hasta el lunes (`sc_lleno`,
  no se mira cada minuto). Instagram NO gasta créditos: sigue por la API de Meta (la inspiración).
  · **«Recrear para [cliente]» es UN recreador** (`recrear`, `RecrearLoMejor.jsx`; también lo usan las referencias del
  estudio de mercado, cuyo «Seguir este video» fijaba Kling Omni de Higgsfield —sin llave— y cuyo «Recrear con mi marca»
  mandaba la imagen de otra marca al motor). Primero el costo: sin `confirmado: true`, 409 `codigo: "confirmar"` con el
  costo, el próximo día libre (`proximoDiaLibre`, desde mañana) y el camino. Con el sí: la publicación en ese día con el
  original en `referencias` (NUNCA en `medios`) y `recreadoDe`, y según el camino: «imagen» o «carrusel», un ENCARGO del
  servidor con el director (el original va como imagen ESPECIAL `papel: "inspiracion"` en `datos.especiales` del encargo,
  que `fichasDeDiseno` mira y el motor de imagen nunca recibe); «animado», el guion de un video animado unido al post
  (`escribirGuion` + `crearProyecto`); «grabar», `extraerUgc` (paga ANTES de crear nada: si falla, no queda un post
  vacío) con `audioUgc`, qué audio usar al publicarlo (la API no lo pone). El servidor escribe el mes y avisa con
  `calendario:recargar` SIN pestaña: también la que lo pidió relee. La pieza que sale NO se pone sola en el post todavía
  (eso es de la fase 5): queda en la galería con el post apuntado.
  · **No se paga dos veces**: `bajarALaGaleria` devuelve lo ya bajado por su nombre (la cuenta y el id: un video no tiene
  huella); `agregarReferencia` devuelve la referencia ya analizada del mismo archivo o del mismo enlace (`repetida`); la
  transcripción de un video de YouTube se recuerda en `lo_mejor_piezas.datos` (por «yt:<id>»), porque no tiene ficha en la
  galería.
  · **La cifra viaja**: al banco van `cifra`, `rinde`, la miniatura y el archivo como referencia (`ideaDeLoMejor`; también
  desde la Biblioteca); «Guardar en el banco» de «Extraer guion» guarda el enlace y el video.
  · **El video se reproduce por un proxy** (`GET /api/lo-mejor/video?u=`, sólo `cdninstagram.com`/`fbcdn.net` y el CDN de TikTok, pasa el
  `Range`: sin trozos el iPhone no lo reproduce; con `sandbox` y `nosniff`). La dirección del video de un reel la guarda la
  inspiración (`inspiracion_publicaciones.video`, la `media_url` que caduca: el feed se relee cada 20 h).
  · **El aviso «rinde 3×» lleva a la TARJETA** (`/cliente/<id>/inspiracion?pieza=<clave>`): va primero y se señala.
  · **Claude**: `ver_lo_mejor` (las claves, las miniaturas como imágenes y la vista previa) y `recrear` (costo y «sí», como
  las demás); «Crear con Claude» desde una tarjeta guarda en el handoff la pieza (`referencia`: enlace, cuenta, cifra, tipo,
  por qué funciona) y el original de la galería, y `receta` se lo da a Claude.
  · **Nada de esto se ha probado contra Scrape Creators, Meta ni la IA reales**: los tests usan `fetch` de mentira.
- **TikTok y las tendencias por Scrape Creators, dentro del MISMO tope que los anuncios** (decisión de la agencia: Scrape
  Creators sólo para anuncios y para TikTok; `src/lib/scrapeCreators.js`, `worker/lib/scrapeCreators.js`,
  `worker/lib/tendencias.js`, `TendenciasTikTok.jsx`, 0068). Cosas que no se ven en la pantalla:
  · **Una cola, lo más viejo primero, una tarea por vuelta** (`tareasScPendientes` en acceso.js, `loMejorPendiente`): los
  anuncios de las búsquedas guardadas de un espacio (`sc_releido_at`), cada cuenta de TikTok de cada cliente
  (`inspiracion_cuentas.leida_sc_at`) y cada palabra de tendencia (`tendencias_palabras.leida_at`), lo que lleve una semana
  (`DIAS_SC`) o nunca se leyó. Antes de leer se mira el tope de la semana (`creditosDeLaSemana`, lunes a domingo de Panamá):
  si no cabe, el espacio queda `sc_lleno` = ese lunes y la consulta no lo vuelve a ver hasta la semana siguiente (sin eso el
  cron lo miraría cada minuto). Cambiar el tope suelta la marca. Sin la primera búsqueda intentada, los anuncios NO cuentan
  como releídos (van primero el lunes). Va detrás de todo el cron, y la clasificación de lo leído en las vueltas siguientes.
  Lo buscado a mano en la Biblioteca también suma y NO se bloquea: su respuesta trae `semana` ({ total, tope }) y la
  pantalla avisa si se pasó.
  · **Una cuenta de TikTok se lee como mucho una vez por semana** (`tiktokLeToca`). Quién la lee: el cron de «Lo mejor»
  (`tiktok: "auto"`), la primera lectura de una cuenta recién añadida (la pantalla pide las que `faltan`: también «auto», sólo
  si cabe en el tope; si no, espera y se dice) y «Actualizar» a mano (`manual`: cuenta para el tope y NO se bloquea; la
  respuesta trae `avisoSC` si se pasó). El cron de cada 20 h de Inspiración NO la lee (`no`): conserva lo leído, su fecha y
  sus publicaciones (`leidas`: sólo se borra lo de las cuentas leídas ahora). La lectura semanal de una cuenta no mueve su
  `actualizada_at`, que es lo que mira el cron de 20 h (si no, retrasaría el Instagram y el YouTube del cliente).
  · **«rinde» de TikTok va por VISTAS** contra la mediana de su cuenta (`conRendimiento(…, { campo })`,
  `campoDeRendimiento`); la tarjeta dice «rinde 36× en vistas». La clave es «tt:<video>» (`claveDeInspiracion`, igual que su
  enlace y las tendencias): la misma pieza seguida, en tendencia y guardada en el banco es UNA. La consulta del cron que
  clasifica (`espaciosPorClasificar`) arma las claves de TikTok con la misma regla.
  · **Las tendencias** son otra fuente de «Lo mejor» (`fuente: "tendencia"`, percentil por VISTAS dentro de su fuente, «1,2 M
  de vistas» con `cifraCorta`). Su fecha es la de la última búsqueda (como un anuncio: es «del momento» mientras sale en
  ella); se guardan las `POR_PALABRA` (12) con más vistas y lo que lleva 35 días sin aparecer se borra. Un #hashtag va por la
  búsqueda de hashtag; una palabra, por la de palabra clave con `date_posted: this-week` y, si la API no entiende la fecha o
  el orden (400, que no cobra), UNA vez sin ellos. Hasta 5 palabras por cliente, en su tabla (no en la ficha: `clientToRow`
  no las pisa), con `PUT /api/inspiracion/<c>/tendencias`. El interruptor del espacio (`tiktok_tendencias`, encendido) las
  saca de la cola y de «Lo mejor».
  · **El archivo de un video de TikTok** (`traerTikTok`): SIN la llave y sólo de los dominios de TikTok (`HOSTS_TIKTOK`;
  `bajarALaGaleria` acepta ahora `hosts`, `red` y `cabeceras`, y comprueba el dominio también tras una redirección), hasta
  50 MB, y lo ya bajado no se baja ni se paga otra vez (`yaBajado`, por el nombre: la cuenta y el id). Sus direcciones caducan
  en horas: si la guardada ya no vale, el detalle del video (`/v2/tiktok/video`, un crédito a mano) da otra. Si TikTok no lo
  da, 409 `codigo: "sin_archivo"` y la pantalla lo dice: se recrea con IA (el director mira la miniatura) o se guarda desde el
  teléfono. Un video de fotos de TikTok es un carrusel sin archivo. El proxy de videos de la tarjeta acepta TikTok, y si no se
  reproduce la tarjeta vuelve a la miniatura.
  · **Las rutas y la forma de la respuesta salen de la documentación pública** (`/v3/tiktok/profile/videos?handle=`,
  `/v1/tiktok/search/keyword?query=`, `/v1/tiktok/search/hashtag?hashtag=`, `/v2/tiktok/video?url=`; la respuesta «aweme» de
  la app de TikTok) y se leen con TOLERANCIA (`videoTikTok`, `videosDeRespuesta`: `aweme_list` o
  `search_item_list[].aweme_info`, `statistics` o `stats`, `url_list` o la dirección suelta). **Nada de esto se ha probado
  contra Scrape Creators real**: los tests (tests/migracion/tiktok.test.js) usan un `fetch` de mentira. Lo primero con la
  llave: leer UNA cuenta de TikTok desde «Actualizar» y mirar en `biblioteca_cache` qué contestó; si la forma es otra, se
  arregla en `videoTikTok` y nada más.
- **El estudio de mercado: catálogo, estudio y competencia, por cliente** (`mercado_clientes`, 0034; lo puro
  en `src/lib/estudioMercado.js`, lo que toca base/IA/Drive en `worker/lib/mercado.js`). Va en su TABLA y no
  en `clients`: pesa decenas de miles de caracteres y `clients` viaja entero en cada carga y cada aviso.
  · **Un precio sale del CATÁLOGO.** Se guarda además como nota de CIFRAS del cerebro («Productos y
  servicios», `origen: "mercado"`), que la IA lee SIEMPRE que escribe. Con `origen: "ia"` la renovación de
  la ficha técnica la borraría: `prepararFicha` reemplaza las cifras que son suyas.
  · **El estudio va POR PASOS** —lo general y luego un producto por llamada— y cada paso se guarda en el
  BORRADOR: con búsqueda web y razonamiento una llamada tarda minutos, y diez servicios no caben en una.
  Cerrar la pestaña a mitad no pierde nada; «Continuar» sigue. Nada pasa a vigente sin «Aprobar».
  · **La búsqueda web va por `llamarIA(…, { herramientas })`** (worker/lib/cerebro/ia.js): reanuda los
  `pause_turn`, junta el texto de todos los turnos, suma las búsquedas al consumo y, si la cuenta no la tiene
  activada, sigue sin ella con aviso. Cualquier llamada nueva con búsqueda debe ir por ahí.
  · **La competencia es INTERNA** en el cerebro (la nota «competencia» del estudio y cada referencia): la ven
  el equipo y el asistente; un caption que nombre a la competencia sería un error.
  · **Aprobar escribe primero el cerebro y la fila; Drive, después y sin poder tumbar nada** (sin carpeta o sin
  Drive conectado, se aprueba igual y se avisa). El documento es un HTML que Drive convierte en Google Docs.
  · **Las referencias se suben a la galería del Estudio** (carpeta «Competencia») y la IA MIRA la captura. La
  API de Meta no da los anuncios comerciales de Panamá: la pantalla abre la Biblioteca web con la búsqueda.
  · **Una referencia puede ser un VIDEO** (anuncio u orgánico de TikTok o Reels, `medio`/`origen`): la galería
  acepta videos MP4/MOV/WebM hasta 50 MB, y lo ve GEMINI (Claude no recibe video) por `worker/lib/geminiVideo.js`,
  la misma subida a su Files API que usa el análisis del asistente (`worker/rutas/video.js`). Devuelve además la
  ESTRUCTURA tramo a tramo (`limpiarEstructura`, `estructuraATexto`). Descargar de TikTok lo hace la persona: no
  hay API para eso y rastrearlo va contra sus reglas.
  · **De una referencia a algo nuestro:** «Adaptar a la marca» (`POST …/referencias/<id>/adaptar`, no guarda)
  escribe un guion con la misma forma para un producto del catálogo; «Recrear con mi marca» (captura) y «Seguir
  este video con mi marca» abren el Estudio con la referencia puesta y un pedido armado SIN IA
  (`ideaParaRecrear`, `ideaParaSeguirVideo`). En «Planificar mes», un reel o carrusel puede llevar «Estructura del
  guion: como el video de…» (`post.estructuraRef`, el texto; el motor lo lee en los modos «plan» y «campos»).
  · **El Estudio ofrece los ganchos del estudio** con el preset de anuncio (`angulos` en GET /api/estudio):
  la idea pide el gancho y el precio EXACTOS del catálogo. El kit de marca lee el estudio aprobado.
  · **Los siete elementos** son genéricos (`ELEMENTOS_MERCADO`); si la agencia usa otros nombres, se cambian
  ahí. Los marcos (niveles de Schwartz, deseos de Reiss) son públicos.
- **El inventario del catálogo es un interruptor POR CLIENTE, apagado** (`mercado_clientes.inventario`, 0036; los
  campos `stock`, `stockNota`, `ofertaHasta` y `diferenciador` van dentro del JSON del catálogo). Apagado no existe
  para nadie: `productosParaPlan(catalogo, false)` los borra y `catalogoATexto` no los nombra. Encendido: lo agotado
  no entra al plan y la nota de cifras lo nombra APARTE con «no se anuncia» (otra nota del cerebro puede hablar de
  él); la oferta lleva «válida hasta…»; a la IA sólo le llega la escasez («poca», sin cifras) — `stockNota` es de la
  agencia. La rotación de la matriz es `ordenDeProductos()` (pilares.js): reparto ponderado (mucho 3, normal y poco
  2) y lo que tiene POCO sólo en la primera mitad del mes. Con todo sin indicar es la rotación de siempre, en el
  orden del catálogo. El PUT sin `inventario` booleano deja el interruptor como estaba.
- **«Mejorar» no pisa lo que escribió una persona.** En «Planificar mes» el prompt pedía «si ya hay idea, mejórala»
  y el código se quedaba con la de la persona: la mejora se pagaba y se tiraba. Ahora la de la IA queda en
  `sugerencia` al lado («Usar esta» / «Quedarme con la mía»); `sugerencia` no viaja al calendario. «Escribir guiones
  y descripciones» y «Mejorar» van por el modo «campos» del motor (lib/escribirTextos.js) y sólo rellenan.
- **Antes de enviar al cliente: revisar y producir** (`lib/revisionMes.js`, `calendario/RevisionMes.jsx`,
  `calendario/ProducirMes.jsx`). Las REGLAS no cuestan nada y salen al abrir; la IA (función «revisión de textos»)
  y la revisión de las imágenes contra el kit (`POST /api/estudio/<c>/revisar` con `{ clave }`: la imagen de una
  publicación no siempre está en la galería) son opcionales. Nada se cambia solo: el voseo se arregla con un botón.
  La regla de la agencia —lo que va sin contenido lleva texto, guion (o láminas) y una referencia— la dice
  `faltaParaEnviar()` (completitud.js, porque el aviso de «Enviar al cliente» va en el bundle principal), y la
  referencia es `post.referenceLink`, que ahora sí se edita en el panel y está en `CAMPOS_PUBLICOS`. «Producir el
  mes» pide al Estudio lo que falta con el preset del tipo de contenido, la proporción del formato y el logo; las
  piezas se PONEN con un botón, y todas de una vez con una función de cambio (poner una a una con `updatePost`
  partiría cada vez del calendario de antes). Lo de producir vive en su chunk: `lib/estudio.js` arrastra el
  catálogo entero de modelos y no puede entrar en `CalendarView`.
- **El texto en la pieza y las fotos del producto** (`post.textoPieza`, `fotos` de cada producto del catálogo).
  · **`textoPieza` es lo que va ESCRITO encima del diseño, no el caption.** La IA lo escribe con el estudio delante
  (el motor: titular, apoyo y el precio EXACTO del catálogo; `"textoPieza"` en camposTexto.js) junto con guiones y descripciones,
  y tiene su botón en el panel; se escribe a mano igual. Sólo RELLENA, como lo demás. En un carrusel no existe (va
  lámina por lámina en el guion) y a un VIDEO no se le pide (`promptDePublicacion(post, { conTexto: false })`: los
  modelos de video escriben mal). Al motor va entre comillas y «exacto» (`textoDeLaPieza`). El cliente lo ve en su
  enlace mientras no hay contenido (está en `CAMPOS_PUBLICOS`).
  · **Las fotos de un producto son claves de R2 de ESE cliente** (`fotosDeProducto` las limpia; `guardarCatalogo`
  descarta las de otro cliente: la clave la manda el navegador). Se suben a la galería del Estudio al escogerlas. GET
  /api/estudio las devuelve en `productos` (sólo lo activo) y van de referencia, DELANTE del logo, en «Crear con IA»
  desde una publicación con `productoId`, en «Producir el mes» y con «Fotos de un producto» del compositor. La IA del
  catálogo no trae fotos nunca (`leerCatalogo`). Una foto mandada a la papelera rompe el pedido con «no existe»: no
  hay `usado_en` para el catálogo.
  · **«Producir el mes» va por semanas y días, de lunes a domingo** (`lib/produccion.js`): el tipo de contenido va
  por día, así que todos los lunes salen juntos con el mismo estilo. Sólo cuenta lo que se ve con el filtro.
- **El logo del carrusel tiene su hueco** (`referenciasDeLamina`): iba «si cabe», detrás de la anterior, la portada y las
  fotos, y en un modelo de 3 referencias no cabía nunca; un test exigía que se cayera. Ahora es el último y nunca se
  recorta (con 2 referencias o más), y `pedidoDeLamina({ conLogo })` dice dónde ponerlo: la imagen sola no basta.
- **El carrusel se crea lámina a lámina, y EN ORDEN** (`lib/carrusel.js`, `lib/carruselEstudio.js`,
  `calendario/CarruselIA.jsx`; también lo usa «Producir el mes»). Pedir las láminas a la vez salía con cada una de un
  estilo. Cada lámina es un trabajo del Estudio con la ANTERIOR y la PORTADA de referencia (más las fotos del producto
  y el logo si caben: `referenciasDeLamina`, por importancia), así que no se pueden pedir en paralelo.
  · **Dos modos de texto.** «ia»: el modelo lo escribe EXACTO (Nano Banana lo hace bien; puede fallar una letra, por
  eso «Rehacer esta»). «plantilla»: se le pide NO escribir nada y dejar el hueco, y `componerLamina` pone el texto con
  los colores del kit (`coloresPlantilla`: dominante de fondo, texto con contraste) y se sube como imagen nueva. En ese
  modo, lo que va de referencia a la siguiente lámina es la CRUDA, sin texto: con él puesto, el modelo lo copiaría.
  · **El guion se parte con `partirGuion`:** «Portada:/Slide N:/CTA:» (lo que escribe la IA), «---», numeradas o
  párrafos. Se pueden editar, quitar y añadir láminas antes de pedir; hasta 10 (Instagram).
  · **Nada se pone solo:** «Poner las N» (o «Añadir al final» / «Reemplazar lo que hay» si ya tenía) y entonces se
  apunta el uso de cada lámina. Todo queda en la galería, también las crudas.
  · Lo orquesta el NAVEGADOR (cada lámina espera a la anterior): cerrar a la mitad deja hechas las que salieron, en
  la galería. El cron no encadena láminas.
- **El carrusel con IA es un flujo de tres pasos, el mismo en la pestaña Estudio («Carrusel» en «Qué crear») y en
  «Crear carrusel con IA» de la publicación** (`components/FlujoCarrusel.jsx`, lazy). Como en Flow: (1) guion o tema,
  tipo de pieza, estilo visual, producto y PERSONAJES; (2) la CONTRAPROPUESTA del director de arte (`POST
  /api/estudio/<c>/carrusel/propuesta`, `pedidoDePropuesta`/`leerPropuesta` en carrusel.js, texto): por lámina qué se
  ve, el texto EXACTO con su jerarquía y la composición, más el `hilo` que comparten todas; se corrige antes de gastar
  («Usar el guion tal cual» se la salta); (3) las láminas una a una (`crearCarrusel`) en una carpeta propia, con la
  anterior, la portada y los personajes de referencia. «Corregir esta» (`corregirLamina`) EDITA sólo esa lámina con
  una indicación —en plantilla, la cruda, y el texto se vuelve a poner encima—; «Rehacer esta» la pide otra vez.
- **El reel con IA de 10 s es un flujo de cuatro pasos** (`components/FlujoReel.jsx`, lazy; «Reel IA» en «Qué crear» del
  Estudio y «Crear reel con IA» en una publicación de formato reel, `calendario/ReelIA.jsx`). Como en Flow: (1) la idea
  central → guion por planos (`POST /api/estudio/<c>/reel/guion`, `pedidoDeReel`/`leerReel` en src/lib/reel.js: de 4 a
  8 planos con su tiempo, qué se ve, texto corto en pantalla y cámara; hilo, sonido y descripción; los tiempos los
  deja contiguos `repartirTiempos`); (2) los planos se corrigen; (3) un FOTOGRAMA por plano (imagen 9:16, en orden,
  con el anterior, el primero y los personajes de referencia, `crearFotogramas`), que se corrigen o rehacen ANTES de
  pagar el video; (4) el VIDEO con los fotogramas como storyboard (`pedidoDeVideo`: Omni por Kie admite 7, repartidos
  por `fotogramasParaVideo`; un modelo sin referencias recibe el primero como imagen inicial). «Corregir un tramo» manda
  el video hecho como video de referencia con «del segundo X al Y: …» (`corregirTramo`, `promptDeTramo`; sólo con un
  modelo que admita video: Gemini Omni o Kling Omni por Kie) y la versión nueva sale arriba, la anterior se queda.
  Todo va en la carpeta del reel. Los `character_ids` de Omni (personajes registrados) aún no se usan: los personajes
  van como imágenes de referencia en los fotogramas.
- **El Reel IA: 10 s con Omni u 8 s con Veo, y el sonido en el MISMO pedido** (`DURACIONES_REEL`, `ajustarDuracion`,
  `locucionQueCabe` en src/lib/reel.js). Cambiar la duración reparte los planos en el tiempo nuevo (cada uno conserva su
  proporción) sin escribir el guion otra vez; Veo con fotogramas usa 3 de referencia. El guion trae `musica`,
  `locucion` (como mucho 2,5 palabras por segundo) y `efectos` —uno de antes con todo en `sonido` se lee como música— y
  `promptDeReel` los dice por separado: generar el audio aparte y montarlo después no casa la voz con los planos. La
  VOZ de Omni por Kie es un ajuste del modelo (`voz`, `VOCES_OMNI`: 30 voces fijas, el idioma lo da el texto): `enviar`
  la REGISTRA (`/api/v1/omni/audio/create`, gratis) y manda su id en `audio_ids`; con imagen inicial Kie no la admite
  (`validarKie`). Un modelo sin voz pone la suya. La música de tendencia de Instagram no va por API.
- **El video se hace en FLOW: «Copiar para Flow» es lo principal** (`promptParaFlow`, `clipsDelGuion` en src/lib/reel.js;
  FlujoReel). La agencia usa Gemini Omni en Flow y le da el guion entero al agente en UNA instrucción; por API salía caro
  y peor. El prompt lleva todo lo que Flow no sabe: la marca (`bloqueDeMarca`), el estilo, la continuidad (hilo,
  personajes, producto con su precio), cada clip con sus planos, cámara y texto en pantalla exacto, la música, la
  locución y los efectos, y qué imágenes subir como ingredientes (logo, retratos, foto del producto). **20, 30 y 40 s son
  sólo para Flow** (`soloFlow`, `DURACIONES_REEL` con `soloFlow: true`): clips de 10 s (`SEGUNDOS_POR_CLIP`) que el agente
  genera seguidos; el guion pide que ningún plano cruce un múltiplo de 10 s y admite hasta 5 planos por clip
  (`maxPlanos`). «Crear aquí por API» (fotogramas y video) sigue para 8 y 10 s, como opción secundaria. El guion puede
  seguir un ANUNCIO QUE YA FUNCIONA (`referenciaId` en `POST …/reel/guion`: el servidor toma la estructura, el gancho y
  por qué funciona de la referencia analizada del estudio de mercado; su forma, nunca su marca ni su texto). En «Qué
  crear» hay UN chip «Video» y debajo sus dos formas: «Con guion» (el guiado, FlujoReel) y «Clip rápido» (el
  compositor de un prompt). Eran dos chips sueltos y no se entendía cuál era cuál.
- **Corregir con un ejemplo de la galería** (`ReferenciasGaleria.jsx`, `pedidoDeCorreccion` en lib/estudio.js): en el
  visor («Editar»), en cada lámina, en cada fotograma y en el tramo del video. La imagen que se corrige va PRIMERO y los
  ejemplos detrás, sólo los que quepan en el modelo, cada uno con su línea («toma SÓLO…» o «es un EJEMPLO…»); en el
  tramo, como mucho 5 (el video ocupa dos de los 7 huecos de Omni). El reel admite además referencias de la galería
  para todos los fotogramas (`crearFotograma({ referencias })`), detrás del anterior, el primero, los personajes y el
  producto.
- **El carrusel sigue el SISTEMA DE DISEÑO de su portada** (`src/lib/sistemaCarrusel.js`, `POST
  /api/estudio/<c>/archivos/<id>/sistema`, función «sistema de diseño», hueco «análisis»). Una referencia sola dice «algo
  así»: el titular cambiaba de tamaño y el texto saltaba de zona entre láminas. Al salir la portada, la IA la MIRA y
  escribe su sistema en medidas aproximadas (titular: tamaño, peso, mayúsculas, color; zona del texto; márgenes; fondo;
  colores; lo que se repite; el logo), queda en `ajustes.sistema` de la ficha (la segunda vez no se paga) y
  `crearCarrusel` lo pone en el pedido de cada lámina siguiente (`lineaDeSistema`, sólo de la 2 en adelante) y en su
  control: `pedidoDeControl({ sistema })` pide `serie`, lo que se sale de la serie, que deja la lámina en «Revisar»
  pero NO impide corregir sola una letra (`soloTexto` no lo cuenta). Lo usan también el lote y «Producir el mes» (el
  mismo `crearCarrusel`). En «plantilla» no se saca: el texto lo pone la aplicación. Si falla, null: las láminas
  siguen con la portada de referencia, como antes. En `FlujoCarrusel` «Primero la portada» (encendido con más de dos
  láminas) crea sólo la portada; «La portada va: crear las N que faltan» sigue con `crearCarrusel({ desde: 1, previas,
  sistema })`; rehacer o corregir la portada vuelve a sacar el sistema.
- **«Dame ideas» también en el carrusel y el reel IA** (`src/lib/ideasFormato.js`, `worker/lib/estudio/ideasFormato.js`,
  `POST /api/estudio/<c>/carrusel/ideas` y `…/reel/ideas`, `IdeasDeFormato.jsx`): de 3 a 5 con el catálogo (precio
  EXACTO), lo general del estudio de mercado y el cerebro para escribir (nunca lo interno). La de carrusel trae el
  guion «Portada: / Slide N: / CTA:» que lee `partirGuion`; «Usar» lo pone en el paso 1. Pasa `usados` para no repetir.
- **Un carrusel o un reel es UNA tarjeta en la galería** (0042: `estudio_carpetas.tipo` y `orden`; `agruparGaleria`,
  `piezasDeGrupo` en lib/estudio.js; `VisorGrupo.jsx`, lazy). El flujo crea su carpeta con `tipo` («carrusel» |
  «reel», `carpetaDeGrupo`) y guarda en `orden` las láminas FINALES (o los videos y los fotogramas) cada vez que
  cambian: `PUT …/carpetas/<id> { orden }` sólo acepta ids que están EN esa carpeta. Sin orden (se cerró a la mitad),
  la galería lo deduce: las láminas por fecha sin las crudas que ya tienen su versión con texto. Sólo se agrupa en
  «Todas»; en su propio filtro (chip que aparece al abrirla con «Ver sueltas») y en los demás, pieza a pieza. Las
  carpetas con tipo NO cuentan en las 30 de la persona (`MAX_GRUPOS`, 300) ni salen en «Mover a carpeta». En el lote,
  cada carrusel y cada reel van a SU carpeta, no a la del lote. «Descargar el carrusel» baja las piezas y arma un ZIP
  sin comprimir en el navegador (`src/lib/zip.js`: PNG y JPEG no ganan nada comprimidos; sin librería).
- **La galería no guarda dos veces la misma imagen** (`estudio_archivos.huella`, SHA-256 de los bytes, 0042). Sólo en lo
  SUBIDO a mano: una compuesta (con `origenId`) la crea el Estudio y un video no se carga entero. La misma imagen otra
  vez devuelve 200 con la ficha que había y `repetido: true` (si estaba en la papelera, vuelve) y la pantalla dice «Ya
  estaba en la galería». En otro cliente sí entra: cada galería es suya. Ojo en los tests: subir el mismo PNG tres
  veces son UNA ficha (`pngDistinto` en tests/migracion/estudio.test.js). «Usada» en la tarjeta y los filtros «Usadas /
  Sin usar» salen de `usado_en` (lo que una publicación usa). Etiquetas a mano no hay: carpetas, «Me gusta» y «Usada»
  cubren lo que se pidió.
- **Reglas que no se rompen** (`kit.reglas`, hasta 12 frases; `lineaDeReglas` en kitMarca.js): lo que la agencia repetía
  en cada pedido (tamaño del texto, dónde va el logo). Van en `bloqueDeMarca` —TODA pieza— y en la revisión de marca, y
  `fundirKit` las conserva. «Guardar como regla» (`GuardarRegla.jsx`) junto a cada corrección (visor, lámina,
  fotograma) llama a `POST /api/estudio/<c>/kit/reglas`, que suma sobre el kit GUARDADO (no el que tenga abierto la
  pantalla) sin repetir; con 12, 409.
- **El logo: lo pone el modelo o lo estampa la aplicación, a escoger por cliente** (`kit.logoModo` «modelo» |
  «estampado», `kit.logoPosicion` { esquina, tamano, margen }; `src/lib/logoEncima.js`, `logoEstudio.js`). «modelo» es lo
  de siempre (referencia, `ponerLogo`). Con «estampado» `ponerLogo` devuelve false (el modelo NO lo recibe) y el
  navegador pega el original al terminar: en el compositor (al acabar el trabajo, `paraEstampar` en Estudio.jsx), en
  cada lámina del carrusel (la CRUDA sigue sin logo: es la que va de referencia y la que se corrige), en el lote y en
  «Producir el mes». Sale como pieza NUEVA con `origenId` (la original se queda). «Estampar el logo» del visor funciona
  en cualquier modo. Lo que piden el asistente y Claude por MCP va por un encargo del servidor y el logo lo estampa el
  Container (`acabarPieza`); sin Container, la pantalla al abrirse (`terminarPendientes`).
- **Los personajes de la marca** (`kit.personajes`, hasta 4: nombre, descripción, retrato y cuerpo de la galería): el
  bebé de Baby Caleb tiene que ser EL MISMO en cada lámina y cada pieza. Van de referencia con `toma: ["persona"]` y una
  nota de quién son (`referenciasDePersonajes`), en el compositor («Personajes de la marca») y en el carrusel; el
  servidor sólo guarda imágenes de ESE cliente (`guardarKit`), y «Volver a preparar» no se los lleva (`fundirKit`).
- **Las plantillas de plan: las de arranque en el código, lo cambiado en D1, la del cliente en su ficha**
  (`src/lib/plantillasPlan.js`, `plantillas_plan` y `clients.plan_contenido`, 0037). Tres objetivos (Centrado en
  ventas, Ventas y seguidores, Marketing 360) × productos/servicios/marca personal. Por día, cada publicación lleva
  formato y tipo; un tipo vacío es «el del ritmo del cliente ese día», así el ritmo y la temporada siguen mandando y
  la plantilla sólo AÑADE (los reels de «Contenido humano»). Una fila con el id de una de arranque la
  sustituye y borrarla la restaura; `plantilla_id` es único POR ESPACIO (el `id` de la fila es un uuid: dos agencias
  tienen su «ventas-productos»). Las cambian admin y editores, no un colaborador (un editor con `clientes`). La del
  cliente puede ser una copia personalizada entera, y guarda `linea` (`lineaDelPlan`) al guardar la ficha: así
  `buildClientContext` (api.js, bundle principal) dice el objetivo sin pedir la lista. «Planificar mes» abre con
  ella; los formatos del mes se ajustan sin tocar la plantilla. `clientToRow` lleva la columna: sin ella, guardar la
  ficha la borraría.
- **Los tipos de contenido y el ritmo semanal** (`src/lib/pilares.js`, `clients.ritmo_contenido`, 0035). La
  agencia hace un tipo por día (lunes Anuncio, martes Beneficios/Promociones, miércoles Servicios/Productos,
  jueves Educativo, viernes Diferenciador, sábado 7 maletas rotando garantía → testimonio → solución →
  objeciones). El TIPO es la información; el ESTILO, el preset del kit (`presetDePilar`, lo usa «Crear con IA»).
  · **«Viral / alcance» y «Comunidad» ya no existen: los dos son «Contenido humano»** (`humano`). Lo etiquetado con
  ellos (publicaciones, ritmos, plantillas guardadas) se lee por `ALIAS_PILAR` / `idDePilar` sin tocar una fila:
  `pilarDe` resuelve el alias, así que todo lo que pregunta por el tipo ve el de hoy.
  · **La temporada AJUSTA, no reescribe:** `sugerenciasDeTemporada` propone como mucho dos cambios por semana
  (un día delicado deja de vender; una fecha comercial y su víspera pasan a promoción) y una persona los marca
  en «Planificar mes» → «Fechas y ritmo». Es una regla, no una llamada a la IA: no cuesta nada.
  · **La matriz** (`asignarMatriz`) se calcula sobre el MES ENTERO aunque se genere una semana: la rotación de
  productos, niveles, maletas, deseos y perfiles no empieza de cero en cada tanda. Lo que ya trae una
  publicación se respeta. Cada publicación guarda `pilar`, `pilarSub`, `productoId`, `producto` (el nombre),
  `nivel`, `deseo` y `perfil`; el PRECIO no se copia: la IA lo lee del catálogo (nota de cifras), así un cambio
  de precio no deja publicaciones con el viejo.
  · **La IA lo lee en todas partes** por `lineasDeContenido()` (api.js): ideas del mes, guiones, descripciones y
  los botones de IA del panel. `pilares.js` NO importa `estudioMercado.js` —que es grande— porque api.js va en
  el bundle principal: lo que necesita de los marcos está en `consciencia.js`.
- **Videos cortos: una idea en tres tiempos** (`src/lib/videoCorto.js`, `worker/lib/estudio/guionCorto.js`,
  `POST /api/estudio/<cliente>/guion-corto`). Los modelos de la agencia hacen 8 s (Veo por fal.ai) o 10 s (Gemini Omni Flash —el
  «Omni» de Flow, con la llave de Google— o Kling Omni, por Higgsfield, `kling-omni` en el generador): la duración la decide el MODELO (`segundosParaModelo`), y al usar el
  guion se pone su duración en el ajuste. El guion lleva como mucho CUATRO palabras en pantalla —los modelos de
  video escriben mal— y lo demás va en «textoEdicion»; el logo tampoco se le pide al modelo. Desde una
  publicación viajan su tipo y su producto (con el precio del catálogo). Es texto: no gasta en el motor.
- **El perfil: comparar con referentes y piezas por plantilla.** La auditoría lee hasta tres perfiles de
  referencia por `business_discovery` (sólo empresa o creador; el que no se lee, avisa y no tumba nada) y la IA
  dice qué adaptar de ellos; propone además tres publicaciones FIJADAS y un icono por destacado (sólo de
  `ICONOS_DESTACADO`). Las portadas se DIBUJAN (`PiezasPerfil.jsx`): 1080 × 1920 con lo importante dentro del
  círculo central (`RADIO_SEGURO`), siete estilos con la paleta del kit («Con la marca» firma cada una con su logo), y el icono se toma del SVG de `Icon.jsx`
  pintado oculto en el diálogo —renderizar con `createRoot`+`flushSync` dentro de un efecto no pinta nada y la
  imagen sale vacía—. La foto de perfil lleva el logo del kit al 62 % del diámetro. Instagram no deja cambiar
  foto, biografía, destacados ni fijados por la API: «Aplicar en el perfil» deja la lista y la convierte en
  tarea del cliente (una línea por cambio, que «Convertir en tareas» puede partir).
- **El cerebro de un cliente es SUYO: un índice por cliente, nunca uno para
  todos.** El algoritmo viene de Agents Office, que indexa por nombre de
  archivo: los nueve clientes tienen un `01_brand_guidelines.md`, y en un
  índice compartido sobrevive uno y los otros ocho desaparecen en silencio,
  además de mezclarse (regla de oro del orquestador). Aquí cada cliente
  tiene sus notas en `cerebro_notas` (D1, acotadas por dueño y por cliente
  en la capa de acceso) y su índice en R2 bajo `cerebro/<cliente>/`, y
  `conocimiento.js` no sabe qué es un cliente: recibe UN mapa de notas.
  `tests/migracion/cerebro.rutas.test.js` comprueba que un cliente de otro
  espacio, o de otro colaborador, da «no encontrado» en todas las rutas.
- **El índice del cerebro NO va bajo `clientes/`.** `/api/media/*` sirve y
  BORRA cualquier clave `clientes/<id>/…` de un cliente del espacio, y el
  índice lleva también las notas internas. Con el prefijo `cerebro/` esa
  ruta no lo alcanza; hay un test que lo pide por las dos vías.
- **«Interna» es un candado, no una etiqueta.** Una nota interna la ve el
  equipo y el asistente (`para: "chat"`), pero `contexto()` y `buscar()`
  con `para: "texto"` —lo que escribe captions, guiones e ideas— la dejan
  fuera. Las de maquetación (el prompt maestro de Meta AI) no las lee nadie, ni el asistente (`fueraDeUso`). La IA no puede filtrar lo que
  no ve: el ADN de Baby Caleb lleva costos y márgenes «que no se dicen al
  cliente» y antes viajaban en cada prompt. Al importar se marcan solas las
  secciones cuyo TÍTULO habla de economía unitaria, márgenes, proveedores,
  «landed cost», roadmap, inversionistas, «reglas operativas» o lo llama
  «interno»; las que sólo lo mencionan en el cuerpo se devuelven en
  `revisar`, porque un precio de venta puede vivir junto a un costo y
  ocultarla dejaría al modelo sin precio. **La lista de títulos es
  estrecha a propósito:** ocultar de más es un fallo mudo —«Costo de
  envío» u «Horario operativo» son datos públicos, y una IA que no los ve
  no los puede decir—, y la primera versión, con «costo», «operativo» o
  «importación» sueltos, los habría escondido. Un valor de `para`
  inventado se trata como `texto`, el más estricto. `buscar()` SÍ devuelve
  la ficha y las cifras (quien busca no las recibe de ningún otro lado);
  sólo `contexto()` las pone aparte y las quita de los pasajes.
- **«Editada a mano» se sabe por las fechas, y `guardar` las estropea.** Una
  nota que nadie tocó tiene `created_at` = `updated_at`, y es lo que mira
  una nueva importación (`importar.js`) y la pasada de IA (`preparar.js`)
  para no pisar lo corregido. Pero `acceso.guardar()` pone `updated_at` al
  día por su cuenta: una nota importada o escrita por la IA con `guardar`
  nacería «editada». Por eso las importadas se insertan SIN fechas (las
  pone la base, iguales) y la ficha se reemplaza borrando e insertando. Una
  nota nueva escrita a mano entra con `insertar`, que respeta las dos fechas:
  con `guardar`, `updated_at` salía un milisegundo después de `created_at` y una
  prueba fallaba una de cada seis veces —el mismo error, en pequeño—. Y
  el `PUT` de una nota conserva su `origen` y su `fuente`: los tests con el
  ADN real cazaron que editar una nota importada se los borraba y la
  siguiente importación ya no la reconocía. La pasada de IA sólo
  reemplaza notas suyas (`origen: "ia"`): una nota que alguien llamó «Ficha
  técnica» a mano, o una sección importada que se llama igual, tiene la
  misma ruta y no es suya —la ficha nueva toma `ficha-tecnica-2`—.
- **El índice de R2 puede quedarse atrás, y se nota al leerlo.** Cada
  escritura lee el índice, lo parcha y lo escribe entero, y R2 no tiene
  condiciones de escritura: dos ediciones a la vez, o un guardado que se
  cruza con una importación, y la que escribe última se lleva por delante
  lo de la otra. Cada nota lleva en el índice su `updated_at` y su tamaño
  (`meta.u`, `meta.c`); `cargarIndice()` los compara con una lectura ligera
  de D1 (`hayDeriva()`) y reconstruye si no coinciden. D1 es la verdad; el
  índice es un derivado que se cura solo. Y el grafo (las aristas) NO se
  recalcula en cada edición —cuesta 3–9 ms de CPU y sólo lo usa
  `contexto()`—: una edición lo deja en `null` y el primero que lo pide lo
  calcula y lo guarda.
- **La lista del cerebro no lee el texto de las notas.** Una nota lleva
  `resumen` y `caracteres` calculados al escribirla (`derivados()`, en
  `notas.js`); la lista, el estado y las rutas libres salen de
  `acceso.leerColumnas()`, que trae columnas concretas acotadas igual que
  `leer()`. `select *` de 400 notas de 200 000 caracteres no cabe en una
  respuesta de D1. **Todo sitio que escriba una nota tiene que calcularlos**
  (la ruta PUT, la importación, la pasada de IA): una nota sin ellos sale
  con el resumen vacío y «0 car.».
- **Sin cerebro, todo sigue como antes.** `loadADN` pide el contexto al
  Worker y, si el cliente no tiene notas (o falla), vuelve al ADN de su
  ficha; y con notas pero SIN ficha técnica también, mientras el cliente
  tenga un ADN guardado al que volver (`usaElCerebro()`): unos pasajes
  sueltos son peor que el ADN entero hasta que alguien pulse «Preparar
  ficha con IA». El chat NO usa `loadADN` sino `adnParaElChat()`: pregunta
  en cada mensaje, y `loadADN` puede releer GitHub (decenas de peticiones)
  si el cliente no tiene ADN guardado; el chat sólo mira el cerebro, recuerda
  la respuesta un minuto y la pestaña Cerebro la suelta al cambiar algo. Los pasajes de cada TANDA se piden aparte (`pasajesDeLaTanda`) y
  van detrás de la marca de caché: si un pasaje se colara en el bloque
  cacheado, cada tanda escribiría la caché entera y nunca la leería. El
  chat ya NO recibe la capa de maquetación (decisión de la agencia: el prompt maestro de Meta AI son
  instrucciones viejas); `buildClientContext` la quita siempre.
- **El mapa 3D se dibuja en un lienzo 2D, sin three.js, y eso es una
  decisión.** La oficina de agentes usa three.js (144 kB comprimidos, más que
  toda esta aplicación) porque dibuja miles de notas; un cliente de esta
  agencia son decenas o cientos. `cerebro3d/escena.js` proyecta cada nota con
  la cámara de `lib/camara3d.js`, dibuja el brillo sumando luz (`lighter`) y
  guarda la interfaz de `initBrain3D`, así que si algún día hicieran falta
  miles de notas se cambia ese archivo y nada más. Un caso de
  `rendimiento.bundle.test.js` falla si el chunk pasa de 30 kB o si aparece
  `WebGLRenderer` dentro. Cosas que se aprendieron al portarlo:
  · **El lienzo es SIEMPRE oscuro,** con el tema que sea: el brillo es luz que
  se suma y sobre un fondo claro desaparece. Sus colores viven en `--cg-*`
  dentro de `.cg-escenario` y no salen de ahí; los de cada tipo, en
  `COLOR_TIPO`.
  · **Un sitio guardado que no es un número contagiaba a sus vecinas.** En el
  `layout3D` original, una nota nueva «nace junto a una vecina que ya tenga
  sitio» sin comprobar que el sitio fuera un número: con uno roto, la nota
  nacía en NaN y se quedaba fuera del cerebro. `colocar()` lo valida.
  · **Sólo se mueven la nota nueva y las que toca:** el resto conserva su
  sitio, y con `clave` (el cliente) se recuerda entre visitas en
  `localStorage`; si `VERSION_LAYOUT` sube, lo guardado deja de valer.
  · **Los toques se buscan en coordenadas del lienzo** (`clientX − rect.left`),
  con 16 px de tolerancia con ratón y 26 con el dedo; un movimiento de más de
  5 px (10 con el dedo) es un arrastre y gira el cerebro. El lienzo lleva
  `touch-action: none`.
  · **El lienzo no es accesible por sí mismo:** es `aria-hidden`. La lista de
  notas de la izquierda hace lo mismo que tocar un punto, y con el foco en el
  lienzo las flechas giran, +/− acercan y 0 lo devuelve a su sitio.
  · **A lo ancho la nota elegida flota sobre el lienzo** y el cerebro se centra
  en el hueco que queda (`setInsets`); en el teléfono va debajo y no tapa nada.
  · **`prefers-reduced-motion`:** ni gira solo, ni lanza señales, ni vuela
  (el vuelo es un salto).
- **El repositorio ya no manda: el cerebro sí.** El repo Workspace queda
  como copia de seguridad. Lo que hoy lee de él —las sesiones de Claude
  Code que trabajan ese repo, `verificar.mjs`, los tests de recetas de
  `src/lib/componer.test.js`— seguirá viendo lo que allí haya; lo que se
  corrija en el cerebro no vuelve solo al repo.
- **El cerebro aprende de lo que pasa DESPUÉS de escribir, y cada parte de eso
  puede mentir si se toca sin saber por qué está así** (todo en
  `worker/lib/cerebro/aprender.js`, con `senales.js` y `proponer.js`; el porqué
  entero, en `docs/propuesta-cerebro-por-cliente.md`).
  · **Una señal se REEMPLAZA, no se suma.** Su clave es «tipo:publicación»
  (`respuesta:p3`): si el cliente pide cambios y luego aprueba, cuenta una vez, y
  `reinforce()` deshace lo que hizo la anterior antes de aplicar la nueva. Sumar
  haría que quien vuelve a responder pese doble.
  · **El silencio no es un sí.** En Agents Office «usado tal cual» vale 0,75 porque
  lo usa alguien de la casa; aquí muchos clientes no responden nunca, y sin
  respuesta no hay señal.
  · **Lo de antes no puede mover pesos.** De una respuesta vieja no se sabe qué
  notas se usaron para escribirla (`cerebro_usos` no existía): «aprender del
  historial» deja señales y notas, pero `reforzar()` sólo cuenta las
  publicaciones con usos apuntados. Atribuirle el resultado a las notas de HOY
  sería inventar.
  · **Aprender no puede tumbar lo que lo provoca.** `registrarRespuesta`,
  `registrarCorrecciones` y las notas automáticas corren detrás de la respuesta
  del cliente o del guardado del calendario (`ctx.waitUntil` o `despues()`) y
  atrapan sus errores: un fallo aquí es un apunte perdido, no un calendario que
  no se guardó ni una aprobación que el cliente no pudo enviar. Hay un caso que
  rompe D1 a propósito y comprueba que el calendario se guarda igual.
  · **Nada propuesto por la IA entra sin una persona, y el respaldo lo comprueba
  el CÓDIGO.** La IA dice «RESPALDO: R2, R5»; `respaldoSuficiente()` exige dos
  casos, o uno solo si es una orden expresa del cliente con sus palabras. Una
  corrección del equipo o un resultado en redes no son nunca, solos, una orden.
  Si la IA se inventa un número de caso, se descarta; si no hay nada nuevo desde
  la última vez, ni se llama (cuesta dinero); con diez esperando no se piden más.
  · **Las notas automáticas no pisan lo corregido a mano** y tienen tope
  (`MAX_AUTOMATICAS`, 60): se sabe que alguien las tocó porque `updated_at` ya
  no es el de su creación, así que se insertan SIN fechas. La misma trampa que la
  ficha: `guardar()` fecha lo que lleva `updated_at`.
  · **`cerebro_usos.texto` (la línea base de lo que escribió la IA) se escribe
  SIN `updated_at`.** Ese campo de `cerebro_usos` dice cuándo se le pidió texto a
  la IA por última vez; si apuntar la base lo pusiera al día, cada base parecería
  «se le pidió otra vez» y la siguiente corrección se leería como una
  regeneración. `evaluarEdicion()` las compara.
  · **El texto de la IA se reconoce porque llega DE GOLPE** (60 caracteres o más
  en un solo guardado) **y sólo si se pidió con el cerebro** (hay fila en
  `cerebro_usos`). Lo que teclea una persona entra de a poco; el asistente del
  chat y Claude por MCP no pasan por `/contexto` con ids, así que sus textos no
  dejan base ni señal. Si se le pide texto otra vez, la base se cambia: si no, un
  texto regenerado se leería como una corrección enorme del anterior.
  · **Un retoque no enseña nada** (`MIN_CAMBIO`, 0,15) **y los guardados llegan
  con cada pausa al teclear:** la señal sólo se reescribe si cambió al menos
  `SALTO_MINIMO` (0,08); si no, escribir una frase sería un `guardarSenales` y un
  `reforzar` por pausa. Un guardado que no toca el texto no consulta nada del
  cerebro (un caso lo cuenta).
  · **Los resultados en redes se comparan con el MISMO cliente, dentro de su
  formato y sólo cuando maduraron** (`DIAS_DE_MADURACION`, 5: hasta entonces las
  cifras siguen subiendo) y hay `MIN_MEDIDAS` (8) de esa red. Un reel y una foto no
  se miden con la misma vara, y tres publicaciones no son una distribución. Sólo dejan
  señal las que salieron desde la aplicación (`publicaciones_programadas.externo_id`
  las une con `metricas_publicacion`): las demás son parte de cómo rinde esa
  cuenta, no de qué notas se usaron. Se mide como la pantalla de Resultados
  —por interacciones—, y va a pedido: el cron ya está en el límite del plan
  gratuito.
- **Llenar el cerebro cabe en las 50 peticiones del plan gratuito.** Una
  importación es el árbol de GitHub más un archivo por petición: 40 por
  llamada, y lo que no cabe se cuenta en `omitidos` y entra en la
  siguiente, que ya no repite lo hecho (compara el SHA de cada archivo).
  Un archivo que CAMBIÓ en el repositorio no se descarga sin «Actualizar lo
  que cambió»: bajarlo para tirarlo gastaría una de las 50 peticiones. Y al
  borrar lo viejo de varios archivos va una sola tanda, no una consulta por
  archivo. Borrar un cliente borra también su índice de R2, que lleva las
  notas internas.
- **El saldo agotado llega como un 400 cualquiera.** «Your credit balance
  is too low…» se traduce en `mensajeDeRechazo()` a qué hacer.
- **Google Drive: tres trampas.** (1) Con la app de Google «en prueba»,
  el refresh token caduca a los 7 días: tiene que estar «en producción».
  Si Google lo revoca (`invalid_grant`), la fila se borra y la pantalla
  pide reconectar. (2) Una cuenta de servicio NO sirve: no tiene espacio y
  no sube a un Drive personal; entra la cuenta de la agencia por OAuth.
  (3) El Picker de Google carga scripts de Google: rompería la CSP. Todo
  pasa por `/api/drive/*`.
- **Cada id de Drive que llega del navegador se comprueba subiendo por
  sus padres hasta la carpeta del cliente** (`dentroDelCliente`). Sin
  eso, con la sesión de la agencia se leería cualquier archivo suyo.
- **Lo que se sirve desde Drive no puede ejecutarse en este origen.** Un
  `.html` o un `.svg` servido tal cual sería código con la sesión de la
  agencia: sólo imagen (sin SVG) y video van en línea, lo demás como
  descarga, y todo con `sandbox` y `nosniff`. Lo vigila
  `tests/migracion/enrutado.test.js`.
- **La imagen de Drive que va en una publicación se COPIA a R2**
  (`a-publicacion`). La página de aprobación y el HTML exportado no
  pueden leer el Drive de la agencia.
- **La vuelta del OAuth (`/api/drive/callback`) va SIN sesión**: la
  identidad viaja en el `state` firmado con HMAC y atado a la cookie
  `__Host-drive-oauth` de la pestaña que lo pidió. Sin la cookie, un
  enlace de conexión reenviado conectaría el Drive de otra persona al
  espacio de quien lo generó.
- **El micrófono del asistente escucha hasta que se vuelve a pulsar** (`src/lib/dictado.js`). Estaba en
  `continuous: false` sin provisionales: cortaba en la primera pausa (3–4 s) y no enseñaba nada hasta el final. Ahora
  `continuous` + `interimResults`; si el navegador corta solo (Chrome tras un silencio, Safari más a menudo) se vuelve
  a encender mientras siga «escuchando», con tope (`MAX_REENCENDIDOS_VACIOS` cortes seguidos sin oír nada) para no
  quedarse en bucle sin permiso o sin servicio. Cada frase final entra UNA vez: cada sesión trae su lista vacía y los
  índices vistos se apuntan. «Parar» deja entrar la frase que se estaba diciendo; ENVIAR la junta con lo provisional
  y `cortar()` no deja entrar nada más (si no, una frase tardía aparecía sola en la caja vacía). Safari en el iPhone
  no se ha probado: los tests usan un SpeechRecognition de mentira.
- **«Ampliar» pone el asistente a pantalla completa** (`chat-ampliado`, se recuerda en `localStorage`): aunque esté
  acoplado pasa a ser un DIÁLOGO (tapa todo) y Escape primero lo reduce. La caja de escribir crece con el texto —también
  con el dictado, por eso es un efecto sobre `input` y no el `onChange`— hasta `ALTO_MAX_CAJA` (40 %) de la pantalla;
  en el teléfono va arriba a todo el ancho y los botones debajo. Sus estilos, en `ChatPanel.css` (va con el chunk lazy).
- **El asistente va por CONVERSACIONES, una por tema, y las ve todo el equipo** (`chat_conversaciones`, 0043;
  `worker/rutas/conversaciones.js`, `ConversacionesChat.jsx`). Había un hilo por cliente: o se arrastraba todo o se
  borraba todo, y cada mensaje pagaba el historial entero. Cosas que no se ven en la pantalla:
  · **0043 reconstruye `chat_messages` y `chat_resumenes`** (el asistente general no tiene cliente y `client_id` era NOT
  NULL); no tienen hijas. Lo de antes pasa a «Conversación anterior» con id fijo `anterior-<cliente>` y su resumen va
  con ella. Si alguna vez se reaplicara, no se pierde ningún mensaje, pero todos volverían a esa conversación.
  · **El resumen es por conversación** (`chat_resumenes.id` = la conversación; `?conversacion=` en /api/ia/chat/resumen)
  y el asistente sólo recibe el historial de la que está abierta, más el cerebro y las memorias de antes. Lo que deba
  valer en todas se guarda con «Recordar esto» (la misma tarjeta que `guardar_en_cerebro`).
  · **La conversación se crea con el PRIMER mensaje**, con las primeras palabras de título (`tituloProvisional`), y la
  IA le pone el suyo tras la primera respuesta (función «título de conversación», hueco del asistente). La nueva no se
  relee al crearla (`sinRecargar`): lo que está en pantalla ya es lo que hay.
  · **El asistente general guarda las suyas sin cliente.** `client_id = ?` no casa con un vacío, así que su lista se
  filtra en la ruta. Un colaborador no las ve (la capa no le enseña filas sin cliente) y no puede crearlas (403): el
  chat general le funciona igual, sin guardar.
  · **Cada cambio avisa** (`chat:conversaciones`): App.jsx lo pasa como evento de `window` y el panel relee su lista y,
  si es la abierta y no está esperando respuesta, sus mensajes. Así otra persona del equipo puede pedir en la misma
  conversación y se ve. La que tenía abierta cada persona se recuerda por navegador (`chat-ultima:<cliente>`).
  · Las rutas de antes (`/api/clientes/<id>/chat`) se quitaron: un mensaje guardado ahí no tendría conversación.
- **El asistente es diálogo o panel según el ancho.** Desde 1280 px se
  acopla a la derecha (`role="complementary"`, `useDialogA11y(…, {
  activo: false })`): sin foco atrapado ni fondo oscuro. Por debajo,
  diálogo como siempre.
- **La aplicación vive en `calendario.juancitoads.com` Y en workers.dev.** El
  subdominio es un dominio propio del Worker declarado en `wrangler.jsonc`
  (`routes`, `custom_domain: true`): lo crea el despliegue, no el panel. Dos
  trampas: con `routes` puesto, wrangler da `workers_dev` por `false` y APAGA
  workers.dev en el siguiente despliegue —de él cuelgan las vueltas de OAuth
  registradas, el webhook de la Bandeja y el conector de Claude—, así que `workers_dev: true` va
  escrito y `tests/despliegue/plantillas.test.js` lo exige; y el token de
  despliegue necesita *Zone → Workers Routes → Edit* sobre juancitoads.com, o
  falla el despliegue ENTERO. El DNS de la zona está en Cloudflare con todo en
  nube gris salvo este registro: la web sigue en Netlify.
- **`connect-src 'self'` ya cubre el WebSocket.** En una página `https`,
  `'self'` casa con `wss:` del mismo host —lo dice la especificación de
  CSP—. Si alguien ve el socket caer y «lo arregla» metiendo un origen
  ahí, rompe la regla de oro: un tercero en `connect-src` es la señal de
  que una clave ha vuelto al navegador.

- **Instagram no deja programar por API: la hora la cumple el cron.**
  `scheduled` en `worker/index.js`, cada minuto, procesa
  `publicaciones_programadas` (`worker/lib/publicador.js`). Publicar en
  Instagram son varios pasos —contenedor, esperar a que Meta lo procese,
  publicar— y un reel no cabe en una vuelta: cada paso guarda su avance y
  la siguiente sigue. Lo que NUNCA se repite es publicar: el id que
  devuelve Meta se guarda antes que nada, y a partir de ahí un fallo deja
  la fila «publicada con aviso» en vez de reintentar (sería un duplicado
  en el perfil del cliente). Dos vueltas a la vez se evitan reservando la
  fila con su `updated_at` como condición.
- **Lo que caduca a los 60 días es el token de la PERSONA, no el de las
  páginas.** El de usuario (`integracion_meta`) sólo sirve para listar
  páginas («Actualizar cuentas»). Publicar y medir usan el token de cada
  página (`cuentas_sociales.token_cifrado`), que se pide con el de larga
  duración y por eso no vence (salvo que se cambie la contraseña, se
  quite la app o se pierda el rol en la página: entonces, reconectar).
  Decirle a la agencia que «tiene que renovar cada 60 días» es falso y
  ya se dijo una vez; la pantalla lo explica bien ahora.
- **Meta DESCARGA los medios: no se le suben.** Los de R2 están detrás de
  la sesión, así que se le da `/api/medio-publico/<testigo>/<nombre>`,
  firmado con `META_APP_SECRET`, que abre ESE archivo y caduca en tres
  días. Va antes de la sesión en `worker/index.js`, igual que la vuelta
  del OAuth (`/api/redes/meta/callback`, atada a la cookie
  `__Host-meta-oauth`). La cola necesita saber el dominio sin petición
  delante: lo guarda `integracion_meta.origen` al conectar.
- **Instagram sólo publica JPEG, y el Worker no puede convertir.** El
  panel convierte con el lienzo antes de programar
  (`prepararMediosParaMeta` en `lib/medios.js`) y de paso apunta las
  medidas, que es lo que deja comprobar la proporción del feed (4:5 a
  1.91:1) al escribir y no a la hora de salir. «Programar al aprobar»
  corre en el servidor sin navegador: si la imagen no es JPEG, lo avisa
  al equipo en vez de programar.
- **Lo que sale es lo que hay en D1, no lo que hay en pantalla.** Antes de
  programar, el panel guarda el calendario YA (sin esperar al agrupado de
  600 ms), y la cola relee la publicación del calendario antes del primer
  paso. Mover una publicación de día u hora mueve lo programado
  (`resincronizarCalendario`, en el PUT del calendario); quitarla lo
  cancela; que el cliente pida cambios, también.
- **Un campo de archivo se vacía al resetearlo, y su `files` con él.**
  `const fs = e.target.files; e.target.value = ""` dejaba `fs` vacío y la
  subida de imágenes del panel no salía nunca, sin error. Copiar la lista
  ANTES de resetear (`[...e.target.files]`).
- **El cron vive dentro de los límites del plan GRATUITO de Workers:**
  50 peticiones de salida y 50 consultas a D1 por invocación. Por eso la
  cola publica tres por vuelta, la foto de métricas es UNA cuenta por
  vuelta (~30 llamadas a Meta) y sólo si la cola no tenía nada, y
  «Actualizar ahora» en Resultados mide cuenta a cuenta, una petición
  cada una. Las escrituras en serie van en `acceso.guardarVarios`, que
  las manda en un lote. Una tercera tarea periódica que se sume a la
  misma vuelta pasa del límite y falla a medias, sin avisar.
- **Meta sólo guarda unos días de historia: los seguidores de hace un mes
  sólo existen si se apuntaron.** La foto es de AYER (el último día
  completo), desde las 6:00 de Panamá. Cada grupo de métricas se pide por
  su lado: Meta retira y renombra (`impressions` → `views`), y una
  métrica que falla deja su hueco vacío, no la foto entera. Una cuenta
  cuyo token no vale se apunta con `datos.error` para no bloquear a las
  demás, y la pantalla la salta.
- **Las miniaturas de Instagram no se pintan tal cual:** la CSP dice
  `img-src 'self'`. Pasan por `/api/metricas/miniatura`, que sólo sirve
  imágenes de `*.cdninstagram.com` y `*.fbcdn.net`. Ampliar la CSP a esos
  dominios sería abrir la puerta a cualquier imagen de Meta.
- **TikTok se publica por PostPeer, no con una app propia** (`worker/lib/postpeer.js`, `pasoTikTok` en
  `publicador.js`). La app de TikTok de la agencia nunca pasó la auditoría: en Sandbox todo caía en el BORRADOR
  del cliente o salía en «solo yo». PostPeer publica con la suya, auditada. La integración anterior (OAuth propio,
  subida por trozos, carrusel de fotos por `TIKTOK_MEDIOS_BASE`, métricas de TikTok) se QUITÓ. Lo que hay que saber:
  · **La cuenta es una fila más de `cuentas_sociales`** (red «tiktok», `externo_id` = el `accountId` de PostPeer,
  `datos.via: "postpeer"`, SIN token: la llave es una, `POSTPEER_API_KEY`). Así redes por defecto, «¿Qué sale y
  dónde?» y la cola no saben nada de PostPeer. Una fila de la app anterior (sin `via`) NO publica: `planificar()`
  y la cola lo dicen. `datos.origen` guarda el dominio para la dirección firmada del video (la cola no tiene
  petición delante).
  · **La hora la cumple el cron, con `publishNow`**, no `scheduledFor`: mover o cancelar en el calendario ya mueve
  la fila de la cola; programado DENTRO de PostPeer, habría que moverlo también allí o saldría igual.
  · **Mandar es lo único que no se repite** (gasta créditos y saldría dos veces): se apunta `carga.postpeer.enviadoAt`
  ANTES de mandar, y si no llega respuesta (o un 5xx) queda en error SIN reintento automático. Con el id guardado en
  `contenedor_id`, nunca se manda otra. «Reintentar» (una persona) suelta la guarda.
  · **Antes de gastar, `creator-info`:** si la cuenta no admite `PUBLIC_TO_EVERYONE` (privada) o el video pasa de
  `maxVideoPostDurationSec`, falla sin mandar. Por eso el panel mide la duración también para TikTok.
  · **El webhook** (`/api/webhooks/postpeer`, sin sesión) firma «timestamp.cuerpo crudo» con
  `POSTPEER_WEBHOOK_SECRET`; marca de más de 5 min, fuera; un evento repetido se descarta por su id. Sólo ADELANTA
  lo que el cron ve preguntando (`GET /posts/{id}`): sin webhook también funciona. Busca la fila con
  `colaPorPostPeer()`, la única lectura sin dueño que añade, en `acceso.js`.
  · **Lo que llega de PostPeer se lee con tolerancia** (`leerPublicacion`, `datosDe`): la documentación da los
  campos, no siempre el sobre. Si su forma real es otra, se arregla ahí y en nada más.
  · **Un 202 con `success: false` NO es un rechazo** (`rechazoEnElCuerpo`): el carrusel de fotos lo contestaba así
  mientras lo procesaba, y la cola lo daba por fallido con el texto genérico. Sólo cuenta como rechazo un `success:
  false` que no sea 202 y traiga motivo. El id se busca también en `post._id`, `post_id` y el primero de `posts`/`items`,
  y si no aparece, el error dice QUÉ campos llegaron: es lo primero que hay que leer.
  · **Video, o fotos (una o un carrusel).** Las fotos van con `cuerpoFotos`: de 1 a 32 (`fotosTikTok`; con un
  video en la publicación sale sólo el video), todas con la MISMA proporción y entre 1:2,13 y 2,13:1 —lo comprueba
  `revisarPublicacion` con las medidas que apunta `prepararParaRedes` (`medirImagen`)—, el título es la primera
  línea cortada a 90 (`tituloTikTok`) y la descripción el texto de TikTok (4.000), con música automática. Antes de
  gastar un crédito se comprueba que cada foto siga en R2. TikTok NO se marca solo en una publicación de fotos
  (`redAdmite` sigue en video): se elige a mano. Portada de video tampoco va (PostPeer no la recibe). **Nada se ha
  probado contra PostPeer real**; los tests hablan con un `fetch` de mentira.
- **Las cifras del informe NO las escribe la IA.** Las calcula
  `src/lib/resultados.js` —el mismo código que la pestaña Resultados— y
  se CONGELAN en `informes.contenido`; la IA sólo escribe el análisis con
  esas cifras delante y la orden de no inventar ninguna. Si el informe y
  la pantalla dicen números distintos, alguien calculó por su cuenta.
  Regenerar conserva el testigo: el enlace que el cliente ya tiene sigue
  valiendo. El automático sale del día 1 al 5, desde las 9:00, después de
  la cola y de las fotos (ver `scheduled`).
- **El informe lleva los anuncios del mes, TODOS** (`anunciosDelMes` en
  `worker/lib/informes.js`): si el cliente tiene cuenta publicitaria
  asignada, lee el total y las campañas de esa cuenta en el mes —también
  las creadas en el Administrador de anuncios, que la app no conoce—, tres
  llamadas a Meta, sólo lectura. Las cifras salen de Meta
  (`resumenAnunciosDelMes()`, pura) y se congelan como las demás; la IA
  escribe `analisis.anuncios` (resumen y recomendaciones de pauta) y se le
  pide comparar costo por resultado DENTRO del mismo objetivo. Nunca tumba el
  informe: sin cuenta no hay sección; sin `ads_read` o con un error de Meta
  queda `contenido.avisos`, que ve la agencia en la vista previa y NO el
  cliente (`informePorTestigo` sólo devuelve cifras y análisis). El mes en
  curso también se puede generar a mano, para ver cómo van los anuncios.
- **La impresión general oculta todo `<header>` y los `.overlay`**
  (`index.css`, para imprimir un calendario). El informe tiene portada en
  un `<header>` y la vista previa de la agencia vive en un diálogo: sin
  las excepciones de `InformeVista.css`, el PDF salía sin portada, o en
  blanco desde la vista previa.
- **YouTube es una red más, por cliente, y su migración reconstruye CUATRO
  tablas.** `red` tenía `check (red in ('instagram','facebook','tiktok'))`
  en `cuentas_sociales` y en `publicaciones_programadas`, y un CHECK no se
  cambia: hay que reconstruir (0022). Pero `cuentas_sociales` tiene hijas, y
  `drop table` hace un `delete` implícito que DISPARA sus cascadas: soltarla
  tal cual borraba toda `metricas_cuenta` y `metricas_publicacion` y dejaba
  la cola sin cuenta. `defer_foreign_keys` no lo evita (aplaza la
  comprobación, no las acciones). 0028 crea las cuatro en `_v2` con las
  hijas apuntando ya a la madre nueva, suelta las viejas hijas primero y la
  madre después, y renombra (SQLite reescribe las claves ajenas al
  renombrar). `tests/migracion/youtube.test.js` siembra las cuatro, la aplica
  dos veces y comprueba que no se pierde nada y que la cascada sigue viva.
  **Otra red con CHECK nuevo tiene que hacer lo mismo** (o quitar el CHECK).
  Lo demás de YouTube (todo en `worker/lib/youtube.js` y el `pasoYouTube` de
  `publicador.js`):
  · **Mismo proyecto de Google que Drive, otro permiso por cliente.** El
  `state` y el enlace del cliente van firmados con `GOOGLE_CLIENT_SECRET`
  pero con usos propios (un `state` de Drive no abre una vuelta de YouTube),
  y SIN `include_granted_scopes`: si entra la cuenta de la agencia, el token
  del canal no debe arrastrar su Drive. Si llegan varios canales, ninguno se
  asigna solo (`datos.elegirPara`); comparten permiso (`datos.permiso`) y
  desconectar uno no revoca el de los otros.
  · **La sesión de subida se guarda ANTES de mandar un byte** (`contenedor_id`).
  Una sesión sin terminar no crea video, así que reanudarla es seguro y
  abrir otra también; lo peligroso sería abrir otra cuando la primera SÍ
  terminó y se perdió la respuesta. Por eso tras un fallo a medias se
  PREGUNTA a Google (`bytes */total`) en vez de reenviar: si ya tenía todo,
  devuelve el video. Lo que manda es el `Range` del 308, no la cuenta propia.
  · **Un trozo por paso, cuatro por vuelta del cron** (`TROZOS_POR_VUELTA`, 16
  MiB cada uno, múltiplo de 256 KiB como exige Google): cada trozo es una
  petición de salida y el plan gratuito da 50 por invocación para todo.
  · **Short = reel o historia, vertical y de hasta 60 s.** La forma y la
  duración las mide el NAVEGADOR al programar (`medirVideos` en
  `lib/medios.js`, va en `medios[].duracion`); sin medir, un reel cuenta como
  Short. Se le añade `#Shorts` a la descripción si no lo lleva.
  · **Sin auditar, Google deja PRIVADO todo lo subido por la API.** Ajustes lo
  dice siempre, y la fila publicada avisa si la privacidad que devolvió
  YouTube no es la pedida. La portada (`thumbnails.set`) va después del id y
  si falla (canal sin verificar) sólo deja aviso.
  · **«¿Qué sale y dónde?» sólo enseña YouTube si el cliente tiene canal**
  (o ya venía marcada); `resumenDestino` tampoco lo nombra en «No sale en…».
  · **Las métricas:** Analytics tarda dos o tres días en cerrar un día, así
  que un día sin filas queda en blanco (no ceros). Los videos se leen por la
  lista de subidas (`playlistItems` + `videos`), no por `search`, que gasta
  cien veces más cupo. Las miniaturas pasan por el proxy (`ytimg.com`).
  · **Nada de esto se ha probado contra Google:** los tests usan un `fetch`
  de mentira que contesta como su documentación.
- **Historias automáticas: lo ya publicado vuelve como historia, una al día por cliente** (decisión de la agencia: la
  cuenta no se queda callada entre publicaciones; `src/lib/historiasAuto.js`, `worker/lib/historiasAuto.js`, 0048,
  «Historias automáticas» en Programación). Cosas que no se ven:
  · **La imagen la hace el NAVEGADOR** (`historiasRepost.js`: la del post entera sobre ella misma difuminada, y una frase
  corta en una placa, fuera del 14 % de arriba y el 20 % de abajo; JPEG). El Worker no tiene lienzo. Se preparan solas a
  los 20 s de abrir la aplicación (una vez por sesión, `prepararEnSegundoPlano`, módulo en diferido) y con «Preparar
  ahora». El servidor sólo acepta una imagen de ESE cliente que esté en R2 y una fila de la cola PUBLICADA de verdad.
  · **Una pieza por publicación** (`clave_post` = «calendario|publicación»): salió en Instagram y Facebook y es una.
  · **«Que no salga» APARTA, no borra** (`excluida`, 0050): borrada, la publicación volvía a estar «sin historia hecha» y
  la aplicación la preparaba otra vez al abrirse, así que volvía a salir. Apartada no se prepara ni sale; «Que vuelva a
  salir» (`POST …/piezas/<id>/volver`) la devuelve. Volver a subirla conserva `excluida`.
  · **El cron pone UNA al día** (`historiasAutomaticasPendiente`, antes del Estudio: con el Estudio ocupado horas no
  saldría ninguna; sin nada que hacer, una consulta). La de hoy si a su hora le quedan 10 minutos; si no, la de mañana
  (`proximaFecha`, hora de Panamá). Sale la menos usada; a igualdad, la de más interacciones en Instagram
  (`metricas_publicacion` por `externo_id`); nunca lo publicado hace menos de 2 días ni lo que salió hace menos de 4.
  Sin nada que pueda salir, `ultima_fecha` se pone igual y `nota` lo dice: si no, el cliente se leería cada minuto.
  · **Va a la cola de siempre SIN calendario** (`calendar_id` null, `post_id` «repost-<pieza>-<fecha>», variante
  historia, la publicación en la carga con `historiaTambien` y `historias`): la cola no la relee de ningún mes,
  `resincronizarCalendario` no la toca y Programación la enseña sin «Abrir». Se quita como cualquier fila.
  `avisarFallo` toma el título de la carga cuando no hay calendario.
  · **Nada de esto se ha probado contra Meta real**: la cola es la de siempre y los tests hablan con un `fetch` de mentira.
- **Una publicación puede salir DOS veces por red: el post y su
  historia.** Cada salida es una fila de la cola con su `variante`
  (`post` | `historia`); `piezasDe()` dice cuáles tocan y
  `publicacionDeVariante()` convierte el post en la historia (sus medios
  son `post.historias`). Al reprogramar, lo que ya salió o está saliendo
  se SALTA en vez de fallar: si no, añadir la historia a un post ya
  publicado obligaría a borrar la fila publicada.
- **Las historias «con IA» COMPLEMENTAN el post, no lo encogen** (`VARIANTES_HISTORIA`, `construirPromptHistoria`,
  `informacionDelPost` en worker/rutas/imagen.js; `historiasPost.jsx`). Salían tres veces la misma imagen adaptada a
  9:16. Ahora son tres piezas distintas con la MISMA información —una pregunta, un beneficio o detalle y el llamado a la
  acción—: viajan título, producto, texto de la pieza, idea y descripción, el bloque de marca del kit, y la imagen del
  post va «de referencia del producto y del estilo, no de base», con la orden de no inventar precios. «Otras 3 con IA»
  añade una tanda nueva sin borrar las de antes. Los ids viejos (`adaptacion`, `anuncio`, `detalle`) se leen por
  `HISTORIA_ANTIGUA`. «Usar la imagen del post» sigue siendo la del post encajada tal cual. **Ese camino
  (`/api/generar-imagen` con `historiaDe`) quedó de respaldo:** la pantalla las crea ahora por el Estudio
  (`historiasEstudio.js`, ver «Las 3 historias del post salían con faltas», más abajo).
- **Una tanda de historias sale una a una, y nunca se repite una.** El
  avance vive en `carga.tanda` (`i`, `ids`); una tanda que falla a medias
  queda «publicada» con cuántas faltaron. Mismo principio que
  `externo_id`: publicar es lo único que no se reintenta.
- **La imagen de Flow (3:4) no se recorta: se ADAPTA una copia.**
  `post.adaptados["feed|<src>"]` (o `"historia|<src>"`) es la copia 4:5 o
  9:16 que sale en esa red; el original lo siguen viendo Facebook, el
  cliente y la página de aprobación. La hace el NAVEGADOR al programar
  (`prepararParaRedes` en `lib/medios.js`): el Worker no puede tocar
  imágenes, así que el servidor, sin copia, sigue dando error.
  `revisarPublicacion(…, { navegador: true })` convierte ese error en aviso
  para el panel; sin la opción, la regla es la estricta.
- **El panel de una publicación se carga aparte** (`lazy` en
  `CalendarView.jsx`, con su `publicar.css`). El JS principal estaba en
  107,6 kB de un tope de 110 y el CSS inicial en 10,5 de 12: lo que sólo
  usa el panel no va al arranque.
- **Programar una y programar muchas son LA MISMA regla.** `programar()` y
  `programarLote()` (worker/lib/publicador.js) llaman a `planificar()`,
  que no toca la base: se le da leído lo común (cuentas, Meta, la cola del
  calendario) y devuelve qué crear y qué sustituir. Uno a uno, «Programar
  lo aprobado» de un mes de veinte publicaciones pasaba de las 50
  consultas por invocación del plan gratuito; en lote son cuatro lecturas
  y un `guardarVarios`. Un caso lo vigila contando los `prepare()`.
- **Lo que falla en la cola no se puede perder en un aviso.** El cron
  publica sin nadie delante, así que el aviso del momento se va si nadie
  miraba. Lo que no salió se queda en tres sitios hasta que se reintenta o
  se descarta: el número rojo de «Programación» en la navegación
  (`?fallidas=1`, una lectura corta porque se repite con cada `pulso`),
  el bloque de Mi día y el primer bloque de /programacion, con el motivo.
- **El panel de una publicación tiene dos pestañas sobre el MISMO `form`.**
  Contenido planifica; Publicar (`calendario/seccionPublicar.jsx`) va en el
  orden en que se publica: redes, medios (arrastrar, pegar con Ctrl+V,
  reordenar), vista previa, texto, revisión y una barra fija con la hora y
  los botones. Cambiar de pestaña no guarda ni pierde nada: el guardado
  sigue siendo al desmontar el panel.
- **La vista previa pasa cada imagen por el mismo lienzo que el
  programado** (`vistaAjuste`, `calendario/vistaRed.jsx`). Si enseñara el
  original, volvería a mentir sobre lo que Instagram corta: ése era el
  fallo de la vista previa anterior.
- **Cada problema lleva su arreglo, pero la regla sigue siendo una.**
  `revisarPublicacion()` devuelve además `arreglos` (por texto del
  problema: `{ codigo, etiqueta }`) y `aplicarArreglo()` lo aplica; los
  dos son puros y tienen sus casos. Un arreglo sólo toca lo que dice
  —quitar una red, mover los hashtags al comentario, recortar a 30—, y
  «quitar la red» no se ofrece si es la única: no arreglaría nada.
- **La hora sugerida no sale con pocos datos** (`horaSugerida()` en
  `lib/resultados.js`): dos publicaciones ese día de la semana en la
  misma franja, o cuatro en la franja contando toda la semana. Con menos,
  nada: una sugerencia sacada de una publicación es ruido con aspecto de
  consejo.
- **Una auditoría de un PROSPECTO se lee con la cuenta de otro.**
  `business_discovery` pide una cuenta de Instagram conectada del espacio
  desde la que mirar, y sólo lee cuentas de empresa o creador. Una
  personal devuelve un error de Meta que no dice eso («Invalid user id»):
  `leerPerfil()` lo traduce y ofrece las capturas, que es además lo único
  que enseña los destacados (la API no los da nunca). `client_id` puede
  ir vacío: un prospecto no es cliente.
- **La IA juzga la rejilla MIRÁNDOLA.** La foto de perfil y las nueve
  últimas publicaciones van como imágenes (bajadas del CDN de Meta en el
  Worker, nunca como URL en el texto). Las cifras las calcula
  `cifrasPerfil()` y lo propuesto pasa por `limpiarAnalisis()`, que tira
  la biografía que pase de 150 caracteres: una que no entra en Instagram
  no sirve para copiar y pegar. La foto se guarda incrustada porque el
  enlace público no tiene sesión para pasar por el proxy de miniaturas.
- **La Biblioteca de anuncios NO enseña la competencia comercial de
  Panamá, y la pantalla lo dice arriba.** Fuera de la UE y el Reino
  Unido, `/ads_archive` sólo devuelve anuncios de temas sociales,
  elecciones o política; lo comercial sólo sale si se entregó allí. Una
  búsqueda de «zapatos» en PA no falla: vuelve VACÍA, y eso parece «no
  tienen anuncios». Por eso `normalizarConsulta()` cambia «todos» a
  política fuera de la UE (y lo avisa), el aviso es fijo y no se puede
  cerrar, y cada búsqueda lleva el enlace a la web de la Biblioteca con
  lo mismo rellenado (`urlBibliotecaWeb()`, con sus casos). Esos
  parámetros son los de la web, no una API con contrato.
- **`ad_snapshot_url` lleva el token de quien buscó** (`…/render_ad/?id=
  …&access_token=…`), y `paging.next` también. Enseñar cualquiera de los
  dos —o meterlo en el CSV, que se manda por correo— regala el acceso a
  Meta de la agencia. El enlace de la tarjeta es `?id=<anuncio>` de la
  Biblioteca (`enlaceDelAnuncio()`), del cursor sólo viaja `after`, y los
  tests buscan el token en la respuesta entera. El CSV además antepone
  `'` a lo que empieza por `= + - @`: el texto de un anuncio es de un
  tercero y en una hoja de cálculo sería una fórmula.
- **Buscar en la Biblioteca es un GET** (`/api/biblioteca/buscar?c=<json>`):
  no cambia nada, así que quien es de sólo lectura también busca (la
  puerta corta todo lo que no es GET). Cada petición es UNA llamada a
  Meta, `limit` ≤ 50 y como mucho `MAX_PAGINAS` (10) por búsqueda; no hay
  IA ni consumo que apuntar. El error de identidad —(#10) con subcódigo
  2332002— se traduce a «Verifica tu identidad en facebook.com/ID y vuelve
  a intentar»: lo tiene que hacer quien conectó Meta, no quien busca.
- **Guardar un filtro y no verlo en la lista: el eco propio se descarta.**
  El evento `biblioteca` vuelve con la pestaña de quien guardó y App.jsx
  lo ignora (es la guarda contra el eco). La lista de filtros se relee a
  mano tras cada cambio propio; el pulso sólo trae los de los demás. Lo
  cazó abrir la pantalla, no los tests.
- **Nada de la Biblioteca se ha probado contra Meta.** Los tests hablan
  con un `fetch` de mentira que contesta como la documentación. Lo
  primero con una cuenta verificada: una búsqueda de política en PA y una
  comercial en ES (`ad_type=ALL`).
- **La Biblioteca de anuncios va por SCRAPE CREATORS cuando hay llave** (`src/lib/scrapeCreators.js`,
  `worker/lib/scrapeCreators.js`, `BibliotecaSC.jsx`, `/api/biblioteca/sc/*`, 0058). La API de Meta fuera de la UE sólo
  da política; Scrape Creators lee la Biblioteca pública entera. Arriba de /biblioteca se escoge «Todos los anuncios» o
  «API de Meta (política)» (sólo si hay llave). Cosas que no se ven:
  · **La llave vive SÓLO en el Worker** (`SCRAPECREATORS_API_KEY`, secreto), va en `x-api-key` y nunca sale: el
    navegador sólo sabe `sc: true`. `connect-src` sigue en `'self'`.
  · **Cada pedido gasta un crédito, así que hay caché** (`biblioteca_cache`, del ESPACIO: la misma competencia la miran
    varios). La misma búsqueda (ruta + parámetros ordenados, `claveDeCache`) vale `HORAS_CACHE` (12) h; las empresas,
    72 h; el detalle y la transcripción piden además la caché de Scrape Creators (`cache_max_age`). Lo que pasa de 1,5 MB
    no se guarda (D1 corta la fila a 2 MB). Otra página (cursor) es otra búsqueda y otro crédito: «Cargar más» lo dice.
  · **Errores:** 402 sin créditos, 404 sin anuncios, 400 la búsqueda, 403 de Facebook → 409; un 5xx se reintenta UNA
    vez; sin llave, 503 sin llamar a nadie. Lo fallido no entra en la caché.
  · **Las direcciones de fbcdn caducan**: «Traer a la galería» y «Analizar como referencia» bajan el archivo a R2 por
    `bajarALaGaleria` (sólo del CDN de Meta, ≤ 50 MB, carpeta «Competencia»); las miniaturas pasan por el proxy de
    siempre. «Al banco de ideas» guarda la idea con el enlace a la Biblioteca (`?id=`), no el del CDN.
  · La transcripción sólo de un video y nunca la larga (`allow_long_transcription` cobra por minuto).
  · Los filtros guardados llevan `fuente: "sc"` (`consultaSC` los valida) en la misma tabla que los de Meta.
  · **Nada de esto se ha probado contra Scrape Creators real**: los tests hablan con un `fetch` de mentira con la forma
    de su documentación. Lo primero con la llave: buscar una empresa de Panamá y mirar si sus anuncios llegan.
- **El MCP vive FUERA de `/api`, y eso obliga a tocar `run_worker_first`.**
  `/mcp`, `/oauth/*` y `/.well-known/oauth-*` los fija el estándar o se
  pegan en claude.ai; sin estar en `run_worker_first` de wrangler.jsonc,
  el respaldo de la SPA contesta `index.html` con un 200 y Claude dice
  «no se pudo conectar» sin más. La pantalla de permiso, en cambio, SÍ
  es de la SPA (`/conectar-claude`): así se entra con la sesión de
  siempre, y la puerta de acceso sale sola si no la hay.
- **El token del MCP es una sesión: vive en `sesion.js` y se guarda en
  huella.** Queda atado a la persona y a SU espacio (se construye la capa
  de acceso con el `owner_id` del token), el código sirve una vez, PKCE
  S256 es obligatorio y el de renovación se rota en cada uso. Desconectar
  en Ajustes → Claude borra la fila y corta al momento.
- **Claude es el asistente, no llama al asistente.** Las consultas del MCP
  son las MISMAS funciones del asistente (`crearEjecutor`); las escrituras
  hacen lo que el PUT del calendario (resincronizar la cola y avisar al
  espacio con `calendario:recargar`), firmadas «Claude (persona)».
- **Lo marcado «a mano» no sale solo.** `post.asistida` es para lo que la
  API no deja (música de Instagram, stickers, encuestas): `planificar()`
  lo rechaza, así que no se cuela ni por «Programar lo aprobado», ni al
  aprobar, ni desde el MCP. Sale en Mi día y en Programación, y
  `/a-mano/…` da el archivo para guardar o compartir con Instagram y el
  texto para copiar.
- **La lista va por semanas plegables; el mes del móvil se queda.** La
  lista era los treinta días seguidos: interminable en el teléfono. Ahora
  `agruparPorSemana()` (lib/semanas.js) la parte por la semana del
  calendario (`weekNumber`, la del concepto) —o la natural de lunes a
  domingo si el día no la trae—, con su resumen, y sólo se abre la semana
  de hoy. La rejilla del mes en el móvil NO se quita: la agencia la
  prefiere a la lista.
- **Publicar es UNA pregunta: «¿Cuándo sale?».** Programar, publicar ya
  y «la publico yo» eran tres controles que parecían cosas distintas, y
  el día no se podía cambiar desde ahí. `calendario/cuandoSale.jsx` pone
  un solo botón que dice lo que va a pasar («Programar para sáb 10 oct,
  9:00 a. m.»). Programar para OTRO día MUEVE la publicación
  (`moverEnCalendario`, lib/subir.js); a otro mes no, que es otro
  calendario. Una vez en la cola, el selector se cambia por la tarjeta
  «Programada para… · Cambiar · Cancelar»: así no quedan botones que
  inviten a programar dos veces. Las pestañas del panel son «Idea» y
  «Subir».
- **La IA lee el contenido, y sólo RELLENA.** «Escribir a partir del
  contenido» (`escribirDesdeContenido` en api.js) manda las imágenes y,
  de un video, el análisis de Gemini más cuatro fotogramas: la API de
  Claude no recibe video. `rellenarDesdeContenido()` escribe sólo en los
  campos vacíos; lo escrito a mano gana. En el panel el aviso se calcula
  con lo de ahora y el cambio se aplica con `setForm(p => …)`: se pudo
  seguir escribiendo mientras la IA miraba.
- **Lo subido con «Subir» sale DIRECTO: queda aprobado** (`subidaRapida`),
  sin pasar por el cliente —decisión de la agencia—. El diálogo crea la
  publicación en su día y el calendario del mes si no existe, y guarda el
  calendario por su cuenta. Dos cosas que lo hacen funcionar: el eco de la
  propia pestaña se ignora, así que App lo mete en el estado
  (`calendarioGuardado`); y ANTES de guardar suelta el guardado agrupado
  pendiente de ese calendario (`soltarPendiente`): lo pendiente ya va
  dentro —sale del estado—, y si saliera después, borraría la
  publicación nueva.
- **El calendario abre en «Mes», también en el móvil.** La lista por
  semanas sigue a un toque.
- **Un chip de alternar con `aria-pressed` no se pintaba.** `.filter-chip`
  sólo tenía estilo para `.active`, así que las redes elegidas en Subir se
  veían IGUAL que las no elegidas: una historia pensada sólo para
  Instagram salió también en Facebook. Ahora `index.css` pinta también
  `[aria-pressed="true"]`, y las redes son tarjetas con casilla
  (`DestinoRedes`) con la frase «Sale en… No sale en…» (`resumenDestino`,
  lib/subir.js), repetida junto al botón de programar.
- **«Agregar publicación» ya no pide nada: pregunta.** «Subir contenido»
  (aprobada, sale directo, el formato sigue al archivo hasta que se escoja
  uno) o «Agregar idea» (pendiente, para el cliente), y abre el panel en
  esa pestaña. Como se crea vacía, el panel la DESCARTA si se cierra sin
  nada dentro (`publicacionVacia`). El descarte va en diferido y
  comprobando que el panel no se volvió a montar: StrictMode desmonta y
  monta cada efecto en desarrollo, y sin esa guarda la publicación nueva
  desaparecía nada más abrirse.
- **El panel de una publicación es una ventana ancha desde 1024 px.** En
  Subir, configurar a la izquierda y la vista previa a la derecha; en
  Idea, lo que se escribe y lo que se habla con el cliente. La barra de
  «¿Cuándo sale?» sólo es fija a lo ancho: en el teléfono tapaba más de
  media pantalla y va al final.
- **«Programar lo aprobado» prepara CADA publicación por su lado** (`programarAprobadasDe`; `programarLote` en el
  servidor igual): antes, una sola imagen que no se podía leer lanzaba y el lote entero se iba sin programar nada —el
  botón se ponía gris y volvía— mientras una a una, desde su panel, sí salían. La que falla vuelve en `fallidas` con su
  motivo. En Programación el mensaje va ARRIBA, junto al botón: abajo del todo no se veía.
- **«Programar al aprobar» es del CLIENTE** (`clients.programar_al_aprobar`, 0052; el de `calendars.opciones` de antes se
  sigue leyendo). No funcionaba ni encendido: el servidor no puede convertir a JPEG ni hacer la copia 4:5, y las piezas
  del Estudio son PNG. Ahora, al abrir «Enviar al cliente» con el interruptor encendido, el navegador prepara las piezas
  en segundo plano (`prepararEnvioDelMes`, lib/prepararEnvio.js; `conPreparadas` sólo pone lo preparado en las
  publicaciones cuyos archivos no cambiaron mientras tanto). Y si al aprobar no se puede programar, el motivo va a la
  CAMPANA (`avisar`), no sólo al aviso del momento, que se perdía si nadie tenía la aplicación abierta.
  **Si nadie abrió el envío, lo prepara el CONTAINER al aprobar** (`prepararYGuardar` en worker/lib/redesServidor.js,
  desde `programarAlAprobar`): la misma regla como plan (src/lib/prepararRedes.js: normalizar —JPEG a 2160 y medidas— y
  luego las copias 4:5/9:16 de Meta y la 1080p de TikTok) y el MISMO dibujo que el navegador (src/lib/encajarLienzo.js,
  que usa también `encajar` de medios.js) por `POST /imagen-redes`. Lo nuevo va a `clientes/<c>/posts/` y se guarda con
  el `updated_at` del calendario como condición y sólo si los archivos de la publicación no cambiaron mientras se
  preparaba; las pantallas abiertas releen (`calendario:recargar`). Sin Container (en local) o si falla, se programa
  como antes y el aviso de la campana añade «Al prepararla: …». La duración de los videos (Shorts, TikTok) sigue
  midiéndola sólo el navegador: sin medir, la cola hace lo de siempre.
- **Lo aprobado NO sale solo: espera el paso final.** El cliente aprueba
  a veces sólo la IDEA y a veces la PIEZA FINAL; cada publicación dice cuál
  se le pide (`post.aprobacion`, sin elegir: pieza si hay archivo; la «idea»
  con archivo sólo si la escogió una persona, ver la entrada siguiente) y la
  respuesta guarda qué aprobó y con qué texto (`approvals.tipo`, `huella`,
  0019). Idea aprobada = «por producir»: nunca se programa. Pieza aprobada
  = «por programar»: espera en Programación → «Aprobadas, por programar»
  (y en Mi día) a que alguien la revise y pulse Programar. «Programar al
  aprobar» sigue, APAGADO por defecto, y aun encendido sólo con piezas.
  Lo subido con «Subir» sigue saliendo directo.
- **La marca «idea» del sistema se iba con la publicación, y el «sí» del cliente quedaba «por producir» para siempre**
  (Feria del Lente, 5-nov: 12 de 25 aprobadas con `approvals.tipo = "idea"` y su imagen puesta). Nacían como ideas del
  lote («Sólo las ideas al calendario», `publicacionDePieza`) o como copia repetida (`copiaRepetida`) con `aprobacion:
  "idea"`, recibían después su pieza (el servidor, el panel, «Diseñar las aprobadas», el chat) y `tipoAprobacion`
  respetaba la marca: el cliente veía la imagen con «Idea para aprobar», su «sí» se guardaba como idea y nunca se
  programaba. Lo que no se ve:
  · **La regla vive en UN sitio** (`aprobacionQueSePide` en src/lib/publicacion.js; `tipoAprobacion` de
  lib/aprobacion.js es ella, y `publicacionParaCliente` la usa para el enlace sin importar en círculo): «pieza» puesta,
  pieza; «idea» con archivo SÓLO si la escogió una PERSONA (`post.aprobacionElegida`, que ponen `elegirAprobacion` —«¿Qué
  aprueba el cliente?»— y `pedirAprobacion`); si no, pieza si hay archivo e idea si no. Así vale por TODOS los caminos por
  los que llega una pieza (`postConPiezas`, `resultadoEnPost.js`, el panel, ProducirMes, el lote) sin acordarse en cada
  uno. La aprobación (`enviarAprobacion`) y «Programar al aprobar» ya leen «pieza».
  · **El lote y la copia repetida ya no ponen la marca** (sin archivos ya es «idea»), y la copia tampoco hereda lo que se
  escogió para la original. Las publicaciones de antes con la marca y archivo pasan solas a pedir la PIEZA; una «idea»
  escogida a mano antes de esto (sin `aprobacionElegida`) también: no se distinguen, y se aceptó así.
  · **Lo ya respondido no se reescribe solo** (la agencia: «lo arreglo yo a mano»). El aviso del panel (`EstadoAprobacion`,
  `ideaAprobadaConPieza`) y Producción → «Ideas aprobadas, por producir» ofrecen «El cliente vio la pieza: contarla como
  aprobada»: `PATCH /api/calendarios/<id>/aprobaciones/<post>` `{ tipo: "pieza" }` (worker/rutas/datos.js, por la capa)
  reescribe `approvals.tipo`, la `huella` con la publicación de AHORA y `updated_at` (si no, todo archivo puesto tras el
  «sí» saldría como «cambiaste los archivos después de que el cliente la aprobara»), apunta el historial y difunde
  `aprobacion` con `motivo: "pieza"`. Lo comprueba `motivoParaNoContar`: un «sí» vigente, con archivo y sin publicar
  (409 si no). NO programa nada, ni con «Programar al aprobar»: queda «por programar». El eco propio de `aprobacion`
  sube el `pulso` (App.jsx): la pestaña que lo pulsó relee las aprobaciones y el sondeo no lo anuncia luego como «tu
  cliente acaba de responder».
  · En worker/rutas/datos.js el tipo de la fila y de la respuesta va en una constante (`PIEZA`): tests/despliegue/
  tiempo-real.test.js toma cada «tipo» con texto literal de ese archivo por un evento de tiempo real.
- **El `status` de `days` no es la verdad de la aprobación.** Se pone al
  día al abrir ESE calendario (en el estado). Todo lo que mira varios
  calendarios —Programación, Mi día, el tablero— lee las filas de
  `approvals` (`/api/publicar/aprobadas`, `/api/aprobaciones`) y las aplica
  con `conAprobacion()`. Pedir otra vez la aprobación (`pideAprobacionDesde`)
  invalida lo que el cliente respondió antes: si no, al recargar volvería
  a salir aprobada.
- **«Cambiaste … después de que el cliente la aprobara».** El texto se
  compara por huella; los ARCHIVOS no, porque al programar se convierten a
  JPEG y cambian de ruta sin que nadie los toque: para ellos está
  `mediosCambiadosAt`, que sólo escribe el editor de medios del panel.
- **Un colaborador sólo ve sus clientes, y lo acota la CAPA.** Papeles:
  admin, editor, colaborador (`memberships.clientes`, JSON) y sólo lectura
  (`solo_lectura`); sin tocar el `check` de `rol`, que obligaría a
  reconstruir la tabla. `crearAcceso(db, owner, { clientes })` añade
  `client_id in (…)` a toda lectura de `TABLAS_CON_CLIENTE`, acota por
  calendario lo que cuelga de uno y comprueba el cliente de lo que se
  escribe —también en el `on conflict`, o un id ajeno se «movería»—. Un
  test falla si aparece una tabla con `client_id` sin declarar. Sólo
  lectura se corta en `worker/index.js` antes de cualquier ruta. Borrar
  clientes/calendarios y publicar al momento son de admin.
- **`return await` en las rutas con sesión.** Un error lanzado dentro de
  una ruta devuelta sin `await` escapa del `try` de `fetch` y sale como
  500 genérico: así se perdía el 403 de un colaborador.
- **Los avisos se GUARDAN** (`avisos`) y además se anuncian (`tipo:
  "avisos"`) para que la campana se relea: llegan aunque la persona no
  estuviera conectada. Nunca al que lo provocó. Van a quien lleva la
  publicación (`post.responsableId`) o, si nadie, a todo el equipo. El
  hilo interno (`notas_equipo`) y el historial (`historial`) van en sus
  tablas y no en `days`: varias personas escriben a la vez y el
  calendario se guarda entero.
- **Responsable = persona.** `assigned_to` sigue siendo el nombre (para
  quien no tiene cuenta) y `asignado_id` la persona, que el servidor casa
  por nombre al guardar (0020 casó las de antes). «Mías» va por
  `asignado_id`; cambiarse el nombre pone al día el texto.
- **Revisión interna por cliente** (`clients.revision_interna`): el enlace
  del cliente sólo enseña lo que está en «Con el cliente» (o ya
  respondido) — `visibleParaCliente()`. Encenderla esconde todo lo
  pendiente sin etapa: es a propósito.
- **Reconectar Meta no borra el aviso de la última medición.** Los avisos
  de Resultados salen de la FOTO guardada (`metricas_cuenta.datos.avisos`),
  y reconectar no vuelve a medir: sigue saliendo hasta «Actualizar ahora»
  o la foto del día siguiente. Por eso al conectar (y con «Actualizar
  cuentas») se guarda lo que Meta concedió DE VERDAD
  (`integracion_meta.permisos`, `/me/permissions`): Ajustes dice qué falta
  y Resultados distingue «el token ya lo tiene, vuelve a medir» de «sigue
  sin él». Con `META_CONFIG_ID` los permisos salen de la CONFIGURACIÓN del
  inicio de sesión para empresas, no de `PERMISOS_META` ni de lo que se
  active en la app.
- **Un video que no contesta por trozos no se reproduce en el iPhone.**
  Safari pide `Range: bytes=0-1` antes de nada y, si le llega un 200 con
  el archivo entero, pinta el primer fotograma y al darle a reproducir no
  hace nada. En el ordenador funcionaba —Chrome se conforma con el 200—,
  así que sólo se veía en el teléfono, en «Subir» y en el panel.
  `sirveMedia()` (worker/index.js) pasa el `Range` a R2 y contesta 206 con
  `Content-Range` (`rangoServido()` en lib/respuesta.js). Lo vigila
  `tests/migracion/enrutado.test.js`.
- **A Drive, un archivo de más de 90 MB va por R2** (`subirADrive` en db.js, `DRIVE_DE_UNA_VEZ`; ruta `POST
  /api/drive/clientes/<c>/desde-media`): se sube por trozos a `clientes/<c>/subidas/`, el Worker lo pasa a Drive por
  flujo (sin cargarlo entero) y lo borra de R2. De una vez, el cuerpo de una petición no pasa de 100 MB y la pantalla
  decía «el máximo es 100 MB». Lo usan la pestaña Contenido y los videos adjuntos del chat (que, sin Drive, también van
  por trozos). Que la IA VEA un video sigue con su tope de 80 MB: pasado de ahí, el chat y «Subir» trabajan con
  fotogramas.
- **Un reel de 80 MB no subía, y no decía nada.** `POST /api/media` lee el formulario entero dentro del Worker: minutos
  sin señal y, pasado de 100 MB (el tope del cuerpo de una petición en Cloudflare), no llegaba nunca. Lo de más de
  `SUBIDA_DE_UNA_VEZ` (20 MB) va por TROZOS (`worker/rutas/trozos.js`, `subirPorTrozos` en src/lib/db.js): R2 junta las
  partes con su subida multiparte. Los trozos miden `TAMANO_TROZO` (10 MiB): R2 exige al menos 5 MiB y que todos midan
  lo mismo salvo el último. Cada trozo se reintenta solo (un 4xx no), y si la subida muere se abandona (`DELETE`) para no
  dejar partes. La clave la inventa el servidor y cada paso comprueba que sea de un cliente del espacio: el navegador la
  devuelve en cada trozo. La pantalla enseña el tamaño, el porcentaje y una `<progress>` (XHR, por `upload.onprogress`:
  `fetch` no da el avance de la subida). **Nada de la multiparte se ha probado contra el R2 real**: el test usa un doble.
- **Haiku 4.5 no habla el idioma de los modelos 5.** Rechaza con un 400
  `thinking: adaptive`, `output_config.effort` y las herramientas web de
  2026; razona con `budget_tokens` (≥ 1.024 y menor que `max_tokens`) y su
  salida acaba en 64.000. Todas las rutas escriben la petición para los
  modelos 5 y **`adaptarAlModelo()` (worker/lib/anthropic.js) la traduce
  dentro de `abrirFlujo()`**, por donde pasa toda llamada: una ruta nueva no
  tiene que saberlo. En nivel Bajo, Haiku responde sin razonar.
- **Cambiar un CHECK en SQLite es reconstruir la tabla.** `ia_modelo` sólo
  admitía «sonnet»/«opus»: 0022 crea `ajustes_espacio_v2` con todas las
  columnas y checks de hoy, copia, suelta la vieja y renombra. Los tests
  del esquema (`tablasDelEsquema()` en tests/despliegue/acceso.test.js)
  siguen `drop table` y `rename to` en orden: sin eso veían la tabla
  provisional como una tabla nueva con dueño y sin declarar.
- **La imagen generada con IA en 4:5 / 9:16 REEMPLAZA a la original en la publicación** (`reemplazarMedio`, en su
  mismo sitio del carrusel; `ajusteImagen.jsx`). Antes iba aparte, en `post.adaptados`: la lámina seguía enseñando la de
  la medida mala y la agencia no podía dejar el carrusel listo. Y al programar, la conversión a JPEG cambia la ruta de la
  imagen: las copias de `adaptados` (difuminado, color, las de antes hechas con IA) ahora la siguen
  (`renombrarAdaptados` en `prepararParaRedes`); antes se quedaban colgando de la ruta vieja y salía difuminada.
- **La vista previa enseña el ORIGINAL si ya cabe** (`vistaAjuste`): sólo lo que necesita ajuste se dibuja, y a su tamaño
  de salida (1080 de ancho, JPEG 0,9). Antes todo iba a 360 px y calidad 0,75: en retina, Instagram borroso y Facebook
  nítido.
- **«Ampliar con IA» es un ajuste más, pero no se hace solo.** Es el cuarto
  valor de `ajusteIG` («ia»), y su copia va en `post.adaptados` como las
  demás. A diferencia de difuminado/color/recorte, `prepararParaRedes()` NO
  la pide al programar —cuesta dinero—: sin copia, esa imagen sale
  difuminada. Gemini entrega el 4:5 en 896×1152 (0,78), por debajo de lo
  que admite Instagram (0,8): `ampliarConIA()` recorta al tamaño exacto en
  el navegador y borra el bruto de R2. En un carrusel cada imagen que no
  cabe tiene su fila (cómo queda, con qué modelo, «Generar» / «Otra vez»
  sólo para ella): antes se enseñaba la primera y el botón las rehacía
  todas. El motor se escoge para esa vez (`adaptarDe.motor`: «meta» o
  «google»; vacío, el del espacio) y la respuesta trae `modelo`, que queda
  en la copia de `post.adaptados`. Cada copia se pone en cuanto sale: si
  la siguiente falla, la anterior no se pierde.
- **A lo ancho, el panel de «Subir» no desplaza entero.** Cada columna
  desplaza por su cuenta (la izquierda con la barra de «¿Cuándo sale?»
  pegada debajo; la derecha, la vista previa) y el pie del panel se funde
  en esa barra (`acciones` → `inicio` de `CuandoSale`). Con la barra pegada
  al fondo de TODO el panel, tapaba media vista previa; con dos barras
  apiladas, a 800 px de alto quedaba una rendija para configurar.
- **La portada del video se guarda dos veces**: como imagen (`portada`,
  `cover_url` de Instagram y `poster` de la página de aprobación) y como
  milisegundo (`portadaMs`: `thumb_offset` de Instagram si no hay imagen). A
  TikTok no va: PostPeer no recibe portada.
- **Una imagen en un reel es su PORTADA, no un archivo más** (`postConPiezas` en src/lib/galeriaPura.js; `esReelConVideo`,
  `conPortada`, `imagenDelReelAPortada` y `portadaPorConvertir` en src/lib/publicacion.js). Claude diseñó seis portadas 9:16
  y las puso con `poner_en_publicacion`: cada reel quedó con `medios: [video, imagen]` y `portada: null`, salió sin portada
  y uno como un carrusel. Un reel de Instagram es UN video. Cosas que no se ven:
  · **La regla es UNA** (`postConPiezas`, con `como`), y la usan el chat (`poner_en_publicacion` y lo que pone
  `disenar_piezas`/`generar_imagen` con `post_id`), el MCP, «Poner en una publicación…» del Estudio (POST
  /api/estudio/<c>/poner con `como`) y lo que el servidor pone solo (`ponerResultados` de encargos.js). «Sale como reel con
  su video» = formato reel con un video, o un post con UN solo video (Instagram lo publica como reel); un carrusel, una
  historia o un directo, no. A uno así, UNA imagen va a `portada` (sin `portadaMs` ni encuadre), en «añadir» y en
  «reemplazar» (no le quita el video); varias son un error que lo dice (`REEL_SIN_IMAGENES`) y la publicación no cambia (en
  lo que se pone solo, el aviso queda en `puestos`). `como: "portada"` lo pide explícito (una imagen; si el post no la lleva,
  error); `como: "medio"` es lo que escogió una persona (un carrusel mixto en un post con un video), pero un formato «reel»
  nunca se queda con su video y una imagen al lado.
  · **Una historia NO lleva portada** (la API no la admite en las historias): una imagen en una historia con video sale como
  otra historia, como siempre.
  · **El video que llega DESPUÉS** (`conVideoEnPost` en resultadoEnPost.js: el reel del encargo, el render): si el reel
  tenía UNA imagen esperando y no tenía portada, pasa a su portada (la de Claude gana al primer fotograma).
  · **La red de seguridad**: `revisarPublicacion` da ERROR (también en el panel, y por eso no se programa ni sale de la
  cola) si un reel que va a Instagram tiene imágenes además de su video: con una, el arreglo «Usar la imagen como portada»
  (`portada-reel`); con varias, «Publicarlo como carrusel». TikTok, Facebook y YouTube siguen con su aviso de que publican
  sólo el video. Mejor que no salga a que salga mal.
  · **La portada va en JPEG a Instagram** (`cover_url` no lee otra; las piezas del Estudio son PNG o WEBP):
  `portadaPorConvertir` la pide en `prepararParaRedes` (navegador, al programar) y en `normalizacionesDe`/`conNormalizadas`
  (el Container, «Programar al aprobar»); `conPreparadas` y `prepararYGuardar` la escriben (y la cuentan en su huella). Sin
  Container ni pantalla, una portada PNG sigue saliendo como antes (es un aviso, no un error): no se ha probado qué hace
  Meta con ella.
  · **«De la galería» en «Portada del video»** abre `GaleriaSelector` con `una` y pasa el archivo a `onPortada(cambios,
  { archivo })` para apuntar su uso (en «Subir», al guardar). «Corregir» una portada desde el chat la cambia en su sitio.
  **Nada de esto se ha probado contra Meta real**: los tests usan la cola de siempre con un `fetch` de mentira.
- **El calendario es UNO por cliente; el mes, un cajón que no se ve.**
  Las publicaciones siguen guardadas por meses (`calendars`, una fila por
  cliente y mes) porque cada guardado reescribe la fila entera, dos
  personas en meses distintos no deben pisarse y D1 corta a 2 MB. Pero el
  mes ya no se crea ni se nombra: la dirección dice qué mes se mira
  (`mesDeSlug`), un mes sin cajón se enseña con `calendarioVirtual()` y el
  cajón se crea al ESCRIBIR (`POST /api/calendarios/mes`, nunca al mirar).
  Lo escrito sobre el virtual se lleva al cajón con `fusionarEnMes()`, que
  AÑADE: si otra persona lo creó a la vez, lo suyo se queda.
- **Un mes por cliente lo garantiza la base** (0023, índice único). Antes
  «Duplicar calendario» creaba «Octubre 2026 (copia)» del mismo mes. Crear
  con el PUT un mes que ya existe devuelve 409 con el que hay (no un 500 del
  índice); el asistente de planificar lo trata AÑADIENDO a lo que hay.
- **Mover de día lo programado: el servidor reprograma, y la pestaña que lo movió lo tiene que RELEER.**
  `resincronizarCalendario` (en el PUT del calendario) ya cambiaba `programada_para`, pero su aviso
  `publicacion` vuelve con la pestaña de quien movió y el filtro del eco lo descartaba: la tarjeta y el chip seguían
  con la fecha vieja y parecía que no se había movido. El eco propio de `publicacion` sube el `pulso` (sin aviso).
  Arrastrar lo que ya salió o está saliendo no se deja, y a un momento que ya pasó pregunta (saldría en el minuto).
- **Mover a otro mes es del servidor, y todo o nada**
  (`moverDeMes`, worker/lib/meses.js). Siete tablas señalan cada publicación
  por «calendario + publicación» (approvals, comentarios_aprobacion,
  publicaciones_programadas, client_tasks, notas_equipo, historial, videos_proyectos): mover
  sólo el JSON las dejaría apuntando al mes viejo. D1 no aborta un lote por
  una sentencia que no toca filas, así que `trasladarPublicacion()` encadena
  condiciones: el origen se escribe sólo si ni él ni el destino cambiaron,
  el destino sólo si el origen lleva la marca nueva, y las siete tablas sólo
  si el destino la lleva. No se mueve lo publicado, lo que se está
  publicando, ni lo programado a un momento pasado. El navegador guarda YA
  lo pendiente del mes antes de pedirlo (`guardarYa`): un guardado agrupado
  que saliera después devolvería la publicación a su sitio.
- **Una vista de calendario por mes** (`key` por mes en App.jsx): pasar de
  mes no arrastra el panel abierto del anterior, que al cerrarse guardaría
  en el mes equivocado.
- **`tests/utils/d1Memoria.js` es una D1 de verdad** (SQLite de Node con
  todas las migraciones). Para lo que un doble a mano no ve: que las
  consultas de la capa de acceso existen en el esquema. La cola de
  publicación se prueba ahí (`tests/migracion/publicar.test.js`).
- **La Bandeja: lo que llega de Meta sin sesión, y de quién es.**
  (`worker/lib/bandeja/`, `worker/rutas/bandeja.js`, migración 0029.)
  · **El webhook se firma sobre el CUERPO CRUDO.** `X-Hub-Signature-256` es
  el HMAC-SHA256 de los BYTES que llegaron con `META_APP_SECRET`; Meta
  escapa los no ASCII («\u00bf»), así que `JSON.stringify(JSON.parse(…))`
  da otra cadena y otra firma: se lee `arrayBuffer()` y se firma eso. La
  comparación va con `igualSeguro`. Sin firma, con otra o con el cuerpo
  tocado: 403 y no se lee nada. Va ANTES de la sesión en `worker/index.js`.
  · **De quién es un aviso lo dice la CUENTA, no el aviso.** `entry.id`
  (página o Instagram) se busca en `cuentas_sociales` con
  `cuentasPorExterno()` —la única lectura sin dueño, en `acceso.js` como
  `colaPendiente`— y sólo cuentas CON cliente; luego todo va por
  `crearAcceso(db, owner_id)`. La misma página puede estar en dos espacios:
  cada uno recibe su copia, si su cliente tiene la bandeja encendida.
  · **El interruptor es la verdad** (`bandeja_clientes.activa`). Apagado,
  el webhook descarta, «Actualizar» no pregunta a Meta y las listas y el
  número de pendientes no lo enseñan. Lo guardado antes de apagar se queda
  en D1 (no se ve); apagar también da de baja la página en Meta.
  · **Un comentario es UNA fila** (`espacio:red:id de Meta`), llegue por el
  webhook, por «Actualizar» o como «edited»: se funde con lo que había y
  lo de la agencia (atendido, respondido) no lo pisa Meta. Lo propio (la
  página o la cuenta respondiendo) nace atendido. `remove` borra la fila;
  `hide`/`unhide` sólo cambian `oculto`.
  · **La ventana de 24 horas se comprueba en el SERVIDOR**
  (`ventanaMensajes()` de `src/lib/bandejaVista.js`, la misma que pinta la
  pantalla). Cuenta desde `ultimo_usuario_at` —el último mensaje DE LA
  PERSONA—, no desde el último del hilo: una respuesta de la agencia no
  reabre nada. Fuera de plazo, 409 sin llamar a Meta.
  · **Los permisos con revisión de Meta no van en `PERMISOS_META`.**
  `pages_manage_metadata` (sin él no hay `subscribed_apps` ni avisos),
  `pages_manage_engagement`, `pages_messaging` e
  `instagram_manage_messages` se piden aparte con
  `/api/redes/meta/conectar?para=bandeja` (`PERMISOS_EXTRA_META`), que con
  inicio de sesión para empresas usa SU configuración
  (`META_CONFIG_ID_BANDEJA`, con todos los permisos: el token nuevo
  sustituye al anterior). La vuelta del OAuth regresa a `/bandeja`.
  · **«Actualizar» cabe en cuatro llamadas**: las publicaciones traen sus
  comentarios por expansión de campos y las conversaciones sus mensajes;
  una por cuenta y tipo. El webhook completa miniaturas y nombres con tope
  (`TOPE_CONSULTAS_AVISO`) y primero mira lo que ya hay en D1. No está en
  el cron: no le hace falta.
  · **Nada de esto se ha probado contra Meta.** `tests/migracion/bandeja.test.js`
  habla con un `fetch` de mentira con la forma de la documentación (Graph
  v23, webhooks de Page e Instagram). Lo primero con la app de verdad:
  verificar el webhook, encender un cliente y comentar desde otra cuenta.

- **Las redes por defecto son TODAS las del cliente.** Una publicación sin
  `redes` elegidas salía sólo en Instagram (o Instagram y Facebook), y el
  TikTok conectado del cliente se quedaba fuera sin que nadie lo decidiera.
  `redesDe()` / `redesPorDefecto()` (lib/publicacion.js) dan las conectadas
  que pueden llevarla —TikTok y YouTube sólo video, ni historias ni
  directos; las fotos a TikTok se marcan a mano—, y es la MISMA regla en el panel, «Subir», «Programar lo
  aprobado» y `planificar()` del servidor.
- **El banco de ideas es UNO para la agencia** (`banco_ideas`, 0044; `worker/rutas/bancoIdeas.js`, `src/lib/bancoIdeas.js`,
  `useBancoIdeas`, `BankPanel.jsx`, `GuardarReferencia.jsx`). Cada cliente guardaba el suyo dentro de su fila
  (`clients.ideas_bank`) y no había sitio para el video de referencia que se encuentra en el teléfono sin saber aún para
  qué empresa es. Ahora cada idea es una FILA con su cliente o sin él: sin cliente es GENERAL y sale en el banco de
  TODOS hasta que se le asigne uno. Una REFERENCIA es una idea con `referenceLink`. Cosas que no se ven en la pantalla:
  · **0044 pasa las ideas de cada cliente a la tabla con su cliente y VACÍA el JSON**: reaplicarla no resucita lo que
  se borró después. `clientToRow` ya no lleva `ideas_bank` (la columna se queda, con «[]»). La forma de la idea es la
  de siempre (`datos`), así que llevarla al calendario no cambió; `deIdeaAPublicacion` quita lo que es sólo del banco.
  · **Una idea sólo sale del banco si entró en el calendario**: `ideaAlCalendario` (App) devuelve si entró y la vista
  la quita entonces (`banco.quitar`). Antes, llevarla a un mes SIN cajón la borraba sin meterla en ningún sitio.
  · **`client_id = ?` no casa con un vacío**: la lista se lee entera (son decenas o cientos) y se filtra
  (`filtrarBanco`, vistas «De este cliente» = suyas + generales, «Generales», «Todas»). Un colaborador no ve las
  generales ni puede crearlas (403, la capa): «Guardar referencia» le obliga a escoger una de sus empresas.
  · **El enlace se LIMPIA** (`enlaceLimpio`): al compartir desde el teléfono se copia «Mira este video https://…», y
  el formulario va con `noValidate` porque `type="url"` lo rechazaba sin decir por qué (lo cazó el navegador, no los
  tests). La red y el formato salen del enlace (`plataformaDe`, `formatoPorEnlace`; un dominio que sólo se PARECE
  cuenta como «web»). TikTok y YouTube traen título, autor y miniatura por oEmbed (público, sin llave, 4 s de tope;
  si no contesta se guarda igual); la miniatura pasa por `/api/metricas/miniatura` (CSP `img-src 'self'`). Instagram
  pide token para su oEmbed: va sin título.
  · **El eco de la propia pestaña no llega por el socket**: `bancoIdeasApi` lanza `banco-ideas` en `window` tras
  añadir, quitar o asignar, para que el banco del calendario vea lo guardado desde la cabecera. Escribir el texto de
  una idea se guarda agrupado por idea (600 ms) y lo pendiente sale al desmontar.
  · **«Guardar referencia»** se abre desde la cabecera (computadora), «Enlace» en la barra del móvil, el banco y
  `abrirGuardarReferencia()` desde cualquier sitio. El asistente (`agregar_banco_ideas`, con `enlace` y sin cliente =
  general) y Claude por MCP (`anadir_idea`, `ver_banco_ideas`) escriben en la MISMA tabla.
  · **Con el ARCHIVO, desde la galería del teléfono** (Android, la app instalada): el `share_target` es POST multipart
  (`files: archivos`) y lo recibe `public/sw.js` —el ÚNICO service worker, que sólo atiende POST /compartir: sin caché
  de la app ni modo sin conexión—: guarda los archivos en la caché «compartido» y redirige a `/compartir?…&archivos=
  <id>:<n>` (`deLoCompartido`). «Guardar referencia» los lee de ahí, exige escoger la empresa, los SUBE a su galería, la
  idea del banco lleva `archivos` [{ id, src, tipo }] y la caché se vacía. Con un video, «Guardada» ofrece «Extraer guion
  y adaptar». Con un enlace de INSTAGRAM sin archivo, «Traer el video de Instagram» (`POST /api/mercado/<c>/competencia/
  enlace`): el código sale del enlace y la cuenta también si la trae; si no, 409 `codigo: "usuario"` y se pregunta el @
  (la API no busca por enlace: se busca entre las últimas 50 de esa cuenta, sólo empresa o creador). Lo registra
  main.jsx; `/sw.js` va con `max-age=0` en `_headers`. **No se ha probado en un teléfono**: lo comprobado es el POST
  simulado en Chromium.
  · **Desde «Compartir» de Instagram o TikTok, sin abrir la aplicación** (`/compartir`, `deLoCompartido` en
  lib/bancoIdeas.js): App abre «Guardar referencia» relleno y devuelve la dirección a `/` (en un efecto: en el
  inicializador del estado, StrictMode lo haría dos veces). En Android lo pone en la hoja de compartir el
  `share_target` de `public/manifest.webmanifest` (GET con `title`, `text`, `url`; hay que INSTALAR la aplicación desde
  Chrome, y para eso hacen falta los iconos de 192 y 512). En el iPhone Safari no admite `share_target`: un Atajo
  («Codificar URL» + «Abrir URL» con `…/compartir?texto=`), y el diálogo enseña los pasos y la dirección para copiar.
  Sin service worker: Chrome ya no lo exige para instalar. **Ni la instalación ni el Atajo se han probado en un
  teléfono**: lo comprobado es la dirección en Chromium.
- **Español latino neutro, en un sitio.** El modelo imita lo que tiene
  delante: con un ADN o un ejemplo con voseo escribía «vení» y «tenés».
  `REGLA_IDIOMA` (src/lib/idioma.js) va delante del sistema en
  `abrirFlujo()`, por donde pasa TODA llamada a Anthropic, y en el análisis
  de video de Gemini. Delante y fija: la caché es por prefijo. Un test
  falla si alguien llama a `/v1/messages` desde otro sitio.
- **«Ampliar» a 4:5 con Nano Banana hacía zoom.** Pedirle que ampliara la
  imagen la redibujaba más cerca. Ahora se le pide una imagen NUEVA en la
  proporción de destino, con la original de referencia y un plano igual o
  más abierto (`construirPromptAdaptar`, worker/rutas/imagen.js).
- **La hora se escribe.** El desplegable de flechas se salía de su caja en
  el panel estrecho. `TimePicker` es ahora un campo que entiende «9»,
  «930», «21:30» o «9:30 pm» (`leerHoraEscrita`, lib/horas.js) con a. m. /
  p. m. al lado; lo que no entiende no se guarda: se dice.
- **Guardar en Drive, por mes y semana** (`planDrive` en lib/drive.js, `POST /api/drive/clientes/<id>/guardar`):
  `Octubre 2026 / Semana 2 / Martes 6 - Semana 2 - 8 am.jpg`, un carrusel con « - 1», « - 2» y las historias con
  « - historia 1». La semana es la FILA de la rejilla. Tres puertas, la misma regla: el botón de cada publicación
  (pestaña Subir), «Guardar el mes en Drive» (menú del calendario) y la casilla al programar (panel y «Subir»). Lo que
  la sustituyó, «Publicaciones de la app» con `copiasDrive`, ya no existe.
  · **Lo guardado se apunta en la publicación** (`guardadoDrive`: src → { id, ruta }). No se sube dos veces; si la
  pieza cambió de archivo, de día o de hora, se sube la nueva y la copia vieja va a la PAPELERA de Drive sólo si la
  nueva subió (`reemplaza`). Lo de archivos que la publicación ya no tiene, también a la papelera. Lo que vino de
  Drive (`clientes/<id>/drive/…`) SÍ se guarda: el mes ordenado es lo que la agencia quiere tener.
  · **Todo id que llega del navegador se comprueba dentro de la carpeta del cliente** (`dentroDelCliente`) antes de
  mandarlo a la papelera: `guardadoDrive` viaja en el JSON del calendario y lo puede escribir cualquiera del equipo.
  · **Por tandas:** cuatro piezas y tres papeleras por petición (`MAX_GUARDAR_DRIVE`, `MAX_QUITAR_DRIVE`): subir son
  dos llamadas a Google y comprobar + papelera hasta cuatro; con las carpetas y el token caben en las 50.
  · «Guardar el mes» apunta lo guardado en TODAS las publicaciones de una vez al terminar (como «Producir el mes»):
  una a una partiría cada vez del calendario de antes. Por eso no se puede cerrar mientras guarda.
  · **Nada de esto se ha probado contra Google:** los tests usan un `fetch` de mentira.
- **Los tests del presupuesto fallaban el último día de cada mes por la
  noche.** Apuntaban el gasto con `new Date().toISOString().slice(0, 7)` —el
  mes en UTC— y el Worker lo suma con `mesActual()`, el de Panamá: de las
  19:00 del último día en adelante son meses distintos, el gasto «no
  existía» y seis casos daban 201 en vez de 402. Los tests usan ahora
  `mesActual()`. La misma trampa de `toISOString()` de siempre, en los tests.
- **Cambiar de cliente no cambia de pestaña** (`rutaDeOtroCliente`): en
  Resultados, Estudio, Contenido… se va a la misma pestaña del otro
  cliente; en el calendario, al mismo mes.
- **El chip del mes dice qué tiene.** Miniatura si hay contenido subido;
  si no, borde punteado (es una idea) y la barrita de lo que le falta; y UN
  icono de estado (`estadoDelChip`: lo que falló manda, luego publicada,
  programada, cambios, aprobada, idea aprobada). La leyenda sale de
  `ESTADOS_CHIP`. En el teléfono cada semana mide lo mismo y el mes llena
  la altura de la pantalla. **Aprobada va en ROSA con la mano (`thumbsUp`) y
  programada/publicada en VERDE (reloj / ✓)** —también en `STATUSES`—: con el
  verde en «aprobada», la agencia la confundía con lo ya publicado.

- **La campaña del mes se VE, y cada semana tiene la suya.** `campaign` y
  `weekConcepts` existían desde «Planificar mes», pero eran una línea gris y
  un «S1:» diminuto dentro del primer día. Ahora `CampanaMes` las enseña en
  una tarjeta (con «Sugerir con IA», que propone y deja revisar antes de
  guardar) y la rejilla pone una franja con el nombre encima de cada fila.
  **La semana es la FILA de la rejilla** (lunes a domingo, `semanasDelMes()`),
  la misma que `semanaDelMes()` de la lista: al guardar, el nombre se copia
  a los días por su fecha, no por `day.weekNumber`, que en los días añadidos
  a mano valía 1 fuera cual fuera su semana. «Editar el mes» ya sale también
  en un mes sin cajón (`fusionarEnMes` copia la campaña al crearlo).
- **Las fechas especiales: catálogo en el código, decisión en el cliente.**
  Feriados de Panamá, comerciales y días internacionales viven en
  `lib/fechasEspeciales.js` (Pascua, Carnaval, Día del Padre y Black Friday
  se CALCULAN: escribirlos a mano caducaría al año). Lo que decide cada
  cliente (`clients.fechas_especiales`, 0032: importantes, ocultas y propias
  que se repiten cada año) es del cliente y no del mes: se escoge una vez.
  Sin elegir nada se ven feriados y comerciales; los internacionales sólo
  si se eligen. Las fechas DELICADAS (duelo, Semana Santa, cáncer) viajan a
  la IA marcadas «sin promociones». Van a la IA en la generación de textos,
  en el asistente y como valor inicial de «Planificar mes». «Elegir con IA»
  no busca en internet (la búsqueda de Anthropic está apagada en la
  cuenta): escoge ids del catálogo —los que no existen se descartan— y lo
  que propone de su rubro queda `verificar` hasta que alguien lo confirma.
  `clientToRow` lleva la columna: sin ella, guardar la ficha la borraría.
- **Veo 3.1 de Google ya no está: Google lo retiró de la API de Gemini el 22-10-2026** (`veo-3.1`, `-fast`, `-lite`,
  todos `-preview`; su versión final sólo existe en la plataforma empresarial, con otra cuenta). El video de Google por
  defecto es **Gemini Omni Flash** (`predeterminado`); Veo sigue por fal.ai. Los ids viejos viven en `MODELOS_RETIRADOS`:
  la galería y el visor los nombran «(retirado)» (`nombreDelModelo`), `validarPedido` y un pedido que quedó a medias
  dicen por qué y qué usar (`retirado()`), y «Pedir otra igual» cae en el predeterminado de su tipo. Un test falla si
  vuelve un video de Google con id `-preview`. El motor de Google ya no habla `predictLongRunning`.
- **Gemini Omni Flash no es Veo** (`gemini-omni-flash`, `api: "interactions"` en el catálogo; `peticionOmni`,
  `videoDeInteraccion` en worker/lib/estudio/motores.js). Va por `POST /v1beta/interactions` con la MISMA llave de
  Google, pide el video por dirección (`delivery: "uri"`: en línea no cabe uno de más de 4 MB) y puede contestar ya
  con él o seguir en marcha (se mira `GET /interactions/<id>`). La duración NO es un parámetro de la API: va en el
  prompt; si el prompt no la trae (los tiempos del guion de 10 s ya la traen), se le añade «Duración total: N
  segundos». Por REST el video está en `steps[]` → `content[]` de tipo «video» (`output_video` es del SDK). La
  dirección se baja con la llave sólo si es de `*.googleapis.com`. No acepta fotos con personas reconocibles.
  **Nada de Omni se ha probado contra Google**: la forma sale de su documentación y los tests usan un `fetch` de
  mentira.
- **Meta (Muse Spark) entra por la MISMA puerta que Anthropic.** Su API habla
  el formato de mensajes de Anthropic en `api.meta.ai/v1/messages`, así que
  `abrirFlujo()` decide por el id (`muse-*`) a dónde va y con qué llave
  (`META_API_KEY`, o `MODEL_API_KEY`), y `adaptarAlModelo()` le quita lo que
  puede no aceptar: `thinking`, `output_config`, las marcas de caché y las
  herramientas que ejecuta Anthropic (web). Ninguna ruta sabe de Meta.
  `esRechazoDeModelo()` trata un 401/403/404 de Meta como «ese modelo no»: la
  ruta vuelve a Sonnet y avisa —el Contributor no está en todas las regiones—.
  **Nada de Meta se ha probado contra el servicio real.**
- **Un modelo por función, y el de redacción cambia solo al poner la llave.**
  `ajustes_espacio.ia_modelos` (JSON, 0027: no `ia_modelo`, cuyo CHECK
  obligaría a reconstruir la tabla) guarda el de cada hueco —redacción,
  guiones, lectura, asistente, análisis— y el motor de imagen. Cada
  `funcion` del contador cae en un hueco (`FUNCIONES_IA`, `huecoDe()`): una
  ruta nueva tiene que pasar su `funcion` a `prepararIA()` o cae en
  «análisis». Sin elección propia y con llave de Meta, redacción y guiones
  escriben con **Muse Spark 1.2 Contributor**, que entrena con lo que recibe:
  la advertencia de Ajustes no se puede cerrar mientras lo use alguna
  función. Las notas internas no viajan a la redacción; al asistente, sí.

- **«Mejorar idea» ya NO resume: en una imagen diseña el DIRECTOR DE ARTE** (`worker/lib/estudio/fichas.js`, `POST
  /api/estudio/<c>/fichas`; `mejorarIdea` de prompt.js lo llama con una pieza; un VIDEO sigue con la mejora corta de 60
  palabras, porque va limpio). Por qué: las piezas del asistente salían muchísimo mejores que las del Estudio, y el motor
  era el mismo —lo distinto era el PEDIDO—: el asistente escribía una instrucción de diseño gráfico (zonas, placas,
  códigos de color, tamaño del titular) y «Mejorar idea» devolvía dos frases describiendo una foto. Ahora toda pieza de
  imagen lleva una FICHA DE DISEÑO (`FORMATO_FICHA` en `src/lib/director.js`: Pieza, Composición, Fondo, Imagen
  principal, Texto exacto, Marca, Evitar), escrita con el MANUAL DEL DIRECTOR (Ajustes → Manual de la agencia,
  `manual_campanas.diseno`; vacío vale `MANUAL_DISENO_BASE`), el kit, la identidad visual del cerebro, el catálogo y las
  plantillas del cliente. Función «director de arte», hueco «prompts» (en Ajustes se llama «Director de arte»). Cosas que
  no se ven:
  · **Una tanda es una SERIE**: el concepto de la primera pieza pasa a las demás (ver «El director piensa CADA pieza»). Lo
  que ya trae la ficha DEL DIRECTOR no espera; el borrador del motor de ideas, sí.
  · **La ficha va SIN líneas en blanco** (`limpiarFicha`): `ideaDelPedido`/`conOtraEscena` parten el pedido del motor por
  ellas, y una ficha con huecos perdía media escena.
  · **El texto exacto no se pierde**: si la IA lo reescribió, `asegurarTexto` le añade la línea «Texto exacto…» en vez de
  tirar la ficha (antes `leerProduccion` tiraba el pedido listo por una letra cambiada). Lo usan el director, el motor de
  ideas (el campo `imagen`, que ahora ES una ficha, con el kit delante: `identidad` en `pedidoDeProduccion`) y el lote.
  · **Lo que pide la agencia MANDA**: «¿Qué quieres?» del post, la nota de «Otra» del lote y la «Indicación para toda la
  tanda» van al director como `indicacion` y DELANTE del pedido (`lineaDeIndicacion`: «LO QUE PIDE LA AGENCIA (manda…)»).
  Antes iban detrás como «Además, la agencia pide…» y, si chocaban con la escena, el motor se quedaba con la escena.
  · **El pedido listo del post (`promptImagen`) es la ficha**, con su huella: «Crear la imagen aquí» y «Producir el mes»
  la usan sin esperar; un comentario o una plantilla escogida la rediseñan (y esa no se guarda).
- **El OFICIO va en toda pieza, con el manual que sea** (`OFICIO_VISUAL` en src/lib/director.js; `LINEA_OFICIO` en
  kitMarca.js; `LINEA_FOTOS_PRODUCTO` en referencias.js; `aspecto` en control.js). La prueba con Feria del Lente salió
  con el texto bien y TODAS las piezas con la misma plantilla de bandas apiladas (texto, foto, banda) y fotos de banco
  con luz plana: lo pedía el propio formato. Cosas que no se ven:
  · **La ficha tiene una línea «Fotografía»** (luz con dirección, temperatura en K, lente y apertura, superficie y
  sombra) y el oficio prohíbe las palabras vagas («buena luz», «alta calidad», «realista»…), los clichés (hojas para
  natural, destellos para premium, escudos, degradados, dorado con serifa) y pide UN solo gesto expresivo.
  · **El oficio va APARTE del manual**: un manual escrito por la agencia sustituye al de la casa entero (`manualDeDiseno`);
  el oficio no se sustituye. Va en las fichas, el carrusel y lo que sabe el asistente (chat y MCP).
  · **Sin texto en la imagen, una zona TRANQUILA de la escena** (`lineaSinTexto`, `FICHA_SIN_TEXTO`, ahora en
  director.js): «deja libre», «limpio y despejado» y «espacio negativo» hacían que el motor dibujara una franja de color
  plana encima. Ningún estilo de la casa dice «espacio negativo» ni «luz pareja» (un test lo recorre).
  · **El acabado va en toda IMAGEN con el kit puesto** (`oficio` en `componerPedido`, detrás del estilo): sin el kit, la
  idea va tal cual (lo decidió la persona), y en video no (va limpio). No prohíbe la placa o la banda que pida el diseño,
  NO impone una luz (el kit de Feria del Lente pide «luz uniforme, pareja, sin foco dirigido» y «fondo plano en crema»:
  la marca manda; si se quiere otra luz, se cambia el kit) y dice que las medidas no se escriben (Muse escribió un «10%»
  sacado de «logo … 10 % del ancho»).
  · **Una ficha que no cabe se ACORTA, no se corta ni se rechaza** (`ajustarFicha`): el bloque de la marca de un kit
  completo, el tipo, el estilo, el acabado y el logo ocupan ~2.400 de los 4.000 caracteres del pedido (MAX_PROMPT), y una
  ficha con su «Fotografía» pasa de 1.600. Antes el pedido se cortaba por el FINAL (la marca, el logo) o, por
  `crear_en_estudio`, se rechazaba entero. Ahora se quita primero «Marca» (la paleta la dice el kit; el sitio del logo,
  la composición), luego «Evitar» y «Fondo», y después se recorta la línea más larga por una palabra; la pieza y el texto
  exacto nunca. Lo usan `pedidoDePieza`, `conEscena` (encargos) y `crear_en_estudio` (que además lo dice).
  · **Y la ficha del director tampoco se corta por el final al LEERLA** (`limpiarFicha` → `ajustarFicha` a `MAX_FICHA`;
  `asegurarTexto` acorta lo demás para que su línea quepa). Con la línea «Fotografía» las fichas pasan de 1.800: la prueba de
  Feria del Lente (5-nov) llegó al motor con «titular «Tus lentes en 40 mi» y sin marca ni «Evitar», y `asegurarTexto`
  añadía el texto y el tope se lo volvía a quitar. El control «arregló» el texto que faltaba en UNA frase y titular, apoyo y
  botón salieron del mismo tamaño: `correccionDeTexto` dice ahora cada línea en su sitio y con su tamaño.
  · **Las fotos del producto se ENDEREZAN** (una línea, una vez, si va alguna): las del catálogo suelen ser del celular,
  inclinadas o desde arriba, y el motor copiaba ese ángulo y ese fondo; lo impreso, tal cual y sin traducir.
  `crear_en_estudio` (asistente y MCP) ya las nombra como el producto REAL (`refsDelCatalogo`): antes iban sin línea.
  · **El control mira el ACABADO** (`aspecto`: luz plana, plástico, HDR, franja plana, foto de banco, restos sueltos),
  hasta 2 con su arreglo. Solo no cambia el veredicto; si el director deja la pieza floja, va en su corrección DETRÁS
  de los arreglos de diseño, tres como mucho.
- **Las RECETAS: el cómo de una pieza como dato, y «Crear con Claude»** (`src/lib/recetas.js`, `worker/lib/recetas.js`,
  `worker/rutas/recetas.js`, `worker/lib/estudio/herramientasRecetas.js`, `Recetas.jsx`, 0061). Lo que hace Higgsfield con sus
  presets, aquí con los métodos de la AGENCIA (escritos con sus palabras: los de Higgsfield no tienen licencia) y lo del
  cliente dentro. Cosas que no se ven:
  · **Una receta es texto, no código**: el método lo lee quien diseña (el director de la aplicación o Claude por el
  conector) y usa las herramientas que ya existen. Hay 15 de la casa (imagen, carrusel, video con IA, video animado y
  guion); una nueva de la casa es añadir un objeto a `RECETAS_CASA`, sin migración ni pantalla. Las de la casa en el código; una fila de `recetas` con su id la
  sustituye (con `oculta`, la saca) y borrarla la restaura; las propias van detrás. Las cambian admin y editores (403 a un
  colaborador), como las plantillas de plan.
  · **«Crear con Claude» guarda el pedido UN día** (`handoffs`: el cliente, la publicación, las referencias de ESA galería
  y «¿Qué quieres?») y abre `claude.ai/new?q=` con un mensaje corto («/receta foto-heroe · cliente … · HANDOFF: <id>»).
  `?q=` no está documentado: el mensaje además se COPIA y se enseña. La ventana se abre ANTES de esperar al servidor (si no,
  el navegador la bloquea). Lo paga la suscripción de Claude y necesita el conector instalado en claude.ai.
  · **«/receta» se enruta por las instrucciones** (`REGLA_RECETAS`, en las del servidor MCP y en el sistema del asistente):
  se resuelve PRIMERO con `receta` (`ver_recetas` las lista), que devuelve el método y, con el handoff, la publicación con
  su texto exacto, lo pedido y las referencias COMO IMÁGENES. Un handoff caducado o de otro espacio no se canjea.
  · **«Crear aquí»** deja escrito «/receta <id>» en el director de la pestaña Diseño (`borrador` de ChatPanel; desde una
  publicación llega por la dirección, `?receta=&post=&pide=`, que se limpia al leerla); el director la lee con la misma
  herramienta. Desde una publicación: «Con una receta…» en «¿Qué quieres?».
- **El PROMPT MAESTRO de Meta AI no lo lee NINGUNA IA** (decisión de la agencia: instrucciones viejas de otro proyecto).
  `fueraDeUso` (worker/lib/cerebro/cerebro.js) deja fuera de todos los usos —también del asistente— las notas de tipo
  `maquetacion` y las que se titulan «Prompt maestro», «Meta AI» o «Nano Banana vN» (`esDelPromptMaestro`), y
  `buildClientContext` ya no tiene `{ maquetacion }`: el ADN de antes llega siempre sin esa capa. Las notas siguen en la
  pestaña Cerebro para borrarlas. Si vuelve a aparecer «prompt maestro» en un pedido, es una regresión.
- **La VISTA PREVIA en el chat de Claude (MCP Apps): las piezas se ven DENTRO del chat, en la web y en el teléfono, como
  con Higgsfield** (`worker/lib/mcpVista/`, `worker/lib/estudio/vistaEstudio.js` y `vistaTrabajo.js`; especificación de
  MCP Apps 2026-01-26). El conector declara `resources` y sirve UN recurso `ui://juancito-ads/vista-2.html` (`resources/list`,
  `resources/read`, tipo `text/html;profile=mcp-app`); las herramientas que crean o miran piezas (`CON_VISTA`: ver_pieza,
  estado_trabajo, estado_encargo, crear_en_estudio, corregir_pieza, disenar_piezas, ver_cuadro, ver_escenas, el reel) y las
  que SUENAN o se reproducen (previsualizar_voz, generar_locucion, generar_musica, renderizar_video, ver_video) lo nombran en
  `_meta.ui.resourceUri` (y en la clave plana de antes), y claude.ai pinta esa página junto al resultado. Cosas que no se ven:
  · **Las imágenes NO van dos veces:** siguen como bloques de imagen en `content` (las mira Claude) y la vista
  (`structuredContent`, `vistaDe`/`piezaDe`) sólo dice qué pieza es cada una por su índice (`imagen`). **El texto va
  TAMBIÉN dentro de la vista** (`texto`, en `llamar` de worker/lib/mcp.js): según la especificación el modelo no lee el
  `structuredContent`, pero Claude Code se lo da al modelo EN LUGAR del texto (se vio en producción: llegaban la imagen y el
  JSON, sin el modelo, el pedido ni las instrucciones).
  · **Se pone al día sola:** con `seguir`, la página llama cada pocos segundos una herramienta SÓLO SUYA (`vista_encargo`,
  `vista_trabajo`: `_meta.ui.visibility: ["app"]`, claude.ai no se la da al modelo) con `ya` = las que ya enseña, y el
  servidor sólo manda las imágenes nuevas (seis por vuelta como mucho; si quedan, `cada: 1`). Para a las 300 vueltas o a los
  tres fallos («Actualizar»). `me_gusta_pieza` es el «Me gusta» de la galería.
  · **Lo que toca la persona no se salta la confirmación:** «Cambiar» y «Crear» del plan ESCRIBEN en el chat (`ui/message`:
  «En la pieza a2 de …: …», «Sí, créalo (vi el costo: unos …)») y Claude sigue con sus herramientas; «Abrir en el Estudio»
  es `ui/open-link` con la dirección que pone `conEnlace` (rutas/mcp.js) con el origen del conector.
  · **La página va ENTERA dentro del recurso** (el iframe de claude.ai no deja cargar nada de fuera salvo lo que declara
  `_meta.ui.csp`: sólo el origen del conector, para los audios y videos; ver abajo): navegador.js + modelo.js empaquetados
  con esbuild y estilos.css, en `pagina.generada.js`. Un test la regenera y
  compara; si se toca cualquiera de los tres, `node scripts/mcp/generar-vista.mjs`. El protocolo (JSON-RPC por
  `postMessage`: `ui/initialize`, `ui/notifications/tool-result`, `size-changed`…) va escrito a mano, sin el SDK (pesa
  418 kB): se probó contra el `AppBridge` OFICIAL de `@modelcontextprotocol/ext-apps` 2.0.3 en Chromium (el anfitrión que
  usa claude.ai): el saludo, el resultado, la vuelta con `ya`, «Me gusta», «Cambiar», el enlace, el tema oscuro y el
  ancho del teléfono. **No se ha probado en claude.ai de verdad hasta que se despliega.** Si la versión de la página cambia
  de forma, se sube el número de `URI_VISTA` (claude.ai puede guardar la de antes).
  · `herramientas.js` (la comparte el asistente de la aplicación) importa `vistaTrabajo.js` y NO `vistaEstudio.js`:
  éste lee encargos.js, que por fichas.js → mercado.js → herramientasServidor.js vuelve a herramientas.js (el ciclo deja
  `DEFINICIONES_ESTUDIO` sin iniciar). El asistente de la aplicación recibe sólo el texto cuando no hay imágenes.
  · **Los AUDIOS y VIDEOS se oyen y se ven en la vista** (vista-2; decisión de la agencia: «previsualizar las locuciones
  casi como las imágenes»). La muestra de una voz, la locución, las dos versiones de la música de Suno, el mp4 de un video
  animado (y su locución), un video del Estudio y el reel montado van como `audios`/`videos` del `structuredContent`
  (`medioDe`; worker/lib/estudio/vistaMedios.js) y la página los pinta con `<audio controls>` y `<video controls
  playsinline>`. No caben en el resultado como una imagen: van por su DIRECCIÓN FIRMADA, que también va en el texto
  (`lineasDeMedios`) para que Claude se la dé a la persona si su cliente no pinta vistas. El asistente de la aplicación
  sigue recibiendo sólo el texto (`{ texto, imagenes: [], vista }`). Lo que no se ve:
  · **La dirección es `/api/vista-medio/<testigo>/<nombre>`** (worker/rutas/vistaMedio.js, ANTES de la sesión: el iframe no
  la tiene): abre sólo la clave del testigo, sólo audio o video, sólo de `clientes/` o `voces/` (no `voces/pendientes/`), y
  caduca a las 12 h. Contesta por TROZOS (`Range` → 206, con `rangoServido` como `sirveMedia`: sin eso el iPhone no
  reproduce). No es la de Meta (`/api/medio-publico/`): ésa necesita `META_APP_SECRET`, que un espacio sin Meta no tiene, y
  no contestaba por trozos. Se firma con un secreto que SIEMPRE existe porque se crea solo: 32 bytes al azar en R2
  (`firmas/vista-medios.key`, fuera de `clientes/`: ni /api/media ni esta ruta lo sirven), leído una vez por instancia.
  · **El recurso declara el origen del conector, y nada más** (`metaDeVista(origen)` en modelo.js: `csp.resourceDomains`
  = [el origen de la petición a /mcp], `connectDomains` vacío: la página no hace `fetch`). Sin eso el anfitrión pone
  `media-src 'self' data:` y ningún audio carga (la prueba en Chromium lo comprueba: con la CSP de vista-1 sale «Abrir»).
  Por eso subió a vista-2: claude.ai puede guardar la de antes.
  · **`conEnlace` (rutas/mcp.js) pone el origen** en las direcciones (las herramientas las dan relativas: en la aplicación
  valen tal cual) y en el texto. La página sólo acepta http(s) absolutas (`direccionValida`).
  · **Un reproductor se REUTILIZA al repintar** (`reproductores` en navegador.js) y una vuelta no le cambia la dirección
  (`mediosConLosDeAntes`): cada vuelta trae otra firma, y cambiar el `src` cortaba lo que se estaba oyendo.
  · **Lo que se está haciendo se espera solo**: la locución, la muestra y la música, con `vista_trabajo` (el hueco «Se está
  generando la voz…» hasta que suena); un video animado, con `vista_video` (sólo de la vista) mientras renderiza o genera su
  voz; el reel, con `vista_encargo` (`videosDelReel`: el mp4 montado o, si no, el video o los clips).
  · **Una dirección caducada se renueva**: si el reproductor no carga y su `caduca` pasó (o no se sabe), la página llama
  `vista_medios` (sólo de la vista) con su `ref` (`archivo:<id>`, por la capa de acceso; o `muestra:<modelo>:<voz>:<huella>`,
  que tiene que existir) UNA vez; si aun así no carga, «Abrir» (`ui/open-link`) en vez de una caja rota.
  · **Sin `sandbox` en la ruta** (sí `default-src 'none'; media-src 'self'` y `nosniff`): con `sandbox`, Chromium le da al
  documento de medios (un mp4 abierto suelto, que es «Abrir») un origen opaco, su <video> pide el archivo con CORS y se
  queda vacío. Lo cazó la prueba en Chromium, no los tests.
  · Probado en Chromium con el `AppBridge` oficial de `@modelcontextprotocol/ext-apps` 2.0.3, la página servida desde otro
  origen con la CSP que arma el anfitrión según la especificación y la RUTA REAL del Worker (empaquetado con esbuild) en
  un tercer origen: el audio y el video cargan por trozos, repintar no corta lo que suena, la dirección caducada se renueva,
  «Abrir», tema oscuro y ancho del teléfono. **No se ha probado en claude.ai de verdad hasta que se despliega**, ni con un
  mp4 de producción en el iPhone.
- **El DIRECTOR también por MCP: Claude en claude.ai diseña en lote, ve, corrige y pone en el post**
  (`worker/lib/estudio/herramientasDiseno.js`; sólo en el MCP: el asistente de la aplicación tiene las suyas con el mismo
  nombre, en el navegador). `guia_de_diseno` da lo que el chat recibe en su sistema (el manual, la ficha, el kit, el
  catálogo, lo que la agencia corrige; `instruccionDeDiseno(manual, { canal: "mcp" })`, con la confirmación por TEXTO) y,
  como imágenes, sus plantillas y sus «Me gusta». `disenar_piezas`: cada pieza con la ficha de Claude o sólo con su idea
  (la diseña el director de la agencia, `fichasDeDiseno`); la primera llamada devuelve el plan con su costo y NO crea nada
  (salvo con «crear sin preguntar» fijado y dentro de su tope: entonces crea a la primera y lo dice),
  y sólo `confirmado: true` crea un ENCARGO del servidor (encargos.js: trabajo, proporción, control y una corrección). Un
  carrusel, en orden y en su carpeta de tipo carrusel (con tema y sin fichas, `propuesta`). Cada pieza se arma con el
  MISMO `apoyosDePieza` + `pedidoDePieza` que la pantalla, con la escena en «{{ESCENA}}»: por eso `pieza.js` importa de
  `galeriaPura.js` y no de `estudio.js` (el cliente HTTP no puede entrar al Worker). `estado_encargo` enseña lo listo como
  imagen; `corregir_pieza` edita la misma imagen (o la iguala a otra con `igual_a`); `poner_en_publicacion` pone lo de la
  galería en un post de cualquier mes y apunta su uso. Un logo «estampado» queda puesto cuando alguien abre el Estudio
  (necesita lienzo).
- **El asistente es el DIRECTOR CREATIVO del cliente** (`src/lib/director.js`, `src/lib/disenoChat.js`,
  `src/lib/herramientasDiseno.js`, `PlanDePiezas.jsx`). Con un cliente, el Worker le pone en el sistema el manual, la
  ficha, sus herramientas y lo que exige su kit (o que NO tiene kit: lo dice y ofrece prepararlo) —`instruccionDeDiseno`,
  `resumenDelKit` en worker/rutas/chat.js—. Cosas que no se ven:
  · **`disenar_piezas` (1–12 fichas) espera un BOTÓN**: la herramienta enseña el plan con su costo y su promesa no se
  resuelve hasta «Crear» o «Cambiar algo» (como `guardar_en_cerebro`); con «crear sin preguntar» fijado y dentro del tope,
  la tarjeta llega ya creando, sin botón. El botón es la confirmación del costo, como en el
  lote; «Con qué modelo» escoge entre el del cliente y otra opción (`MODELOS_FINALES`). NO son «borrador» y «final»
  (decisión de la agencia: lo de Muse casi siempre ES la pieza que se usa); el asistente no ofrece `version_final` por
  su cuenta, sólo si la persona pide otro modelo. Se crea de 3 en 3 (`crearPlan`) con el control
  y el logo estampado; las de una publicación se ponen en ella con su ficha como pedido listo.
  · **El modelo VE lo que crea**: cada imagen vuelve en el `tool_result` como bloque de imagen (`paraElModelo`, copia de
  768 px en JPEG; el resultado lleva texto + imágenes). Antes recibía «Imagen creada» y diseñaba a ciegas.
  · **Las vueltas de diseño no gastan del tope** (`HERRAMIENTAS_DE_DISENO` en ChatPanel: crear, corregir, mirar, la regla
  y `crear_publicacion`): doce piezas eran doce vueltas y salía «Me quedé sin vueltas». Tope normal 10, total 40.
  · `corregir_pieza` edita la misma imagen y la nueva sustituye a la anterior en el mensaje y en la publicación; acepta el
  id o la CLAVE (el botón «Pedir un cambio» de una imagen del chat deja «En la imagen clientes/…:» en la caja).
  `guardar_regla` suma al kit (sólo con el sí de la persona). Las definiciones viven en `herramientasDiseno.js` y NO en
  api.js: api.js va en el bundle principal, y con ellas la carga inicial pasaba de 180 kB.
- **Las versiones de una pieza son UNA tarjeta en la galería** (`apilarVersiones` en lib/estudio.js; `deArchivo` en
  `ajustes`, que ponen `paso` en trabajos.js para toda edición y `herenciaDe` en galeria.js para lo compuesto o estampado).
  Cada pieza dejaba de 2 a 4 archivos casi iguales (la cruda y la del texto, la corrección del control, la recompuesta a
  4:5, la del logo estampado, lo corregido desde el chat). En «Todas» se ve una por pieza —la que usa una publicación; si
  no, la que gusta; si no, la que pasó el control; si no, la más nueva— con «N versiones», y el visor enseña las demás
  (`anteriores`). En los demás filtros, todas sueltas; lo de un carrusel o un reel no se apila (su carpeta ya lo agrupa).
  Las ediciones de antes, sin `deArchivo`, se reconocen por su trabajo (sólo los 40 últimos que lee la galería).
- **La cola de publicación también la lleva la bomba del espacio** (`colaDelEspacio` en acceso.js, `bombear` en
  worker/lib/estudio/bomba.js, `despertar` en `procesarPublicacion`). Con sólo el cron (una vuelta por minuto, tres filas),
  cada espera de Meta (el contenedor de un reel o de un carrusel, 20 s) costaba un minuto entero y una publicación con
  feed, historias y TikTok tardaba varios: parecía colgada y se volvía a publicar a mano. Ahora, tras una espera corta
  (≤ 5 min), `procesarPublicacion` despierta a la bomba, que mira la cola PRIMERO (cuenta como paso caro) y se queda
  despierta hasta la hora de lo que sale pronto (`COLA_DESPIERTA_MS`). La reserva de cada fila (su `updated_at`) evita que
  el cron y la bomba den el mismo paso. Lo de más lejos lo sigue llevando el cron.
- **Las fotos de TikTok salen por su copia de 1080p** (`src/lib/fotosTikTok.js`, `adaptados["tiktok|<src>"]`, la cola la
  manda en `pasoTikTok`). Un carrusel de D'CASA falló con `picture_size_check_failed`: lo más probable, las fotos en 2K del
  Estudio (TikTok también lee sólo JPEG o WebP). El navegador hace la copia al programar, como la de Instagram; va en
  diferido porque medios.js está en la carga inicial y ésta está en su tope (180 kB): por eso `capturaReducida` se fue a
  `lib/capturas.js`. **No se ha probado contra TikTok real**: el límite de 1080p es el de su documentación de fotos.
- **`ver_cola` (asistente y MCP) enseña lo que FALLÓ y después se canceló** (reprogramado, quitado del calendario,
  publicado por otro camino), con su motivo, de la última semana. El motivo siempre se guardaba, pero nada lo enseñaba: «tuve
  que publicarla dos veces» no tenía explicación.
- **«Vaciar la papelera» no vaciaba, por tres cosas** (`vaciarPapelera`, `usosVivos`, `leerGaleria` en
  worker/lib/estudio/galeria.js; `NULO`/`NO_NULO` en acceso.js; `vaciarDelTodo`, `textoDeVaciar` en lib/estudio.js):
  · **`usado_en` se apunta al poner un archivo en una publicación y NUNCA se quita**: una imagen cambiada por otra, o de una
  publicación borrada, quedaba «en uso» para siempre. Ahora cuenta sólo el uso VIVO: la publicación sigue en su calendario
  y sigue llevando ESA clave (en cualquier sitio de su JSON). Una lectura de `calendars` y sólo si alguna fila tiene usos.
  · **20 por clic**, y **la papelera iba dentro de los 300 más recientes**: con una galería grande, lo viejo de la papelera
  ni se veía. La galería y la papelera se leen aparte (`borrado_at: NULO` / `NO_NULO`, el «is null» que la capa no tenía:
  un `null` a secas sigue siendo `= ?`); vaciar borra hasta `MAX_PAPELERA` (500) por llamada, R2 por lotes (una
  petición) y la pantalla repite mientras `mas`.
  · **No decía por qué se quedaba algo**: devuelve `quedan` con el motivo (la usa la publicación del día X, es el logo…),
  y cada tarjeta de la papelera lo dice.
- **Lo de la marca no va a la papelera** (`enviarAPapelera(…, { protegidas })`, 409 `de_la_marca`; `deLaMarca` en cada
  archivo de GET /api/estudio). El logo, las fotos del catálogo, las plantillas, la muestra de la letra y los personajes
  llevan «Marca» con un candado y sin botón de papelera; seleccionadas en grupo, se saltan y se dice (`sinLasDeLaMarca`).
  Para quitarlas hay que cambiarlas primero en el kit o en el catálogo.
- **«Falta una imagen de la marca» ya se puede quitar** (`POST /api/estudio/<c>/kit/perdidas`, botón del aviso del kit):
  sale del kit y del catálogo GUARDADOS lo que ya no existe en R2. Hasta ahora sólo se escondía al leer y el aviso no se iba.
- **El logo: las dos formas siguen, y ninguna se lo inventa** (`LINEA_LOGO`, `lineaSinLogo`, `pideLogoDeReferencia` en
  kitMarca.js; `escaleraMuse`/`pedidoDelPaso` en worker/lib/estudio/meta.js; `tocaEstampar` en logoEstudio.js). La agencia
  quiere poder escoger: «lo integra la IA» (el logo va de referencia) o «lo estampa la aplicación» (el original encima). Se
  escoge en el kit y, para una tanda del director, en la tarjeta del plan («El logo»; `conModoDeLogo`). El logo salía
  inventado por cuatro cosas:
  · **Muse descartaba las referencias por el final, y el logo va el último:** era lo PRIMERO que se caía, y el pedido seguía
  diciendo que había logo. Ahora la escalera recorta lo de delante y deja el logo hasta el final; con menos referencias, el
  pedido dice cuáles van («OJO: sólo van…»). Si al final sale sin ninguna, la línea del logo se cambia por «no dibujes
  ningún logo» (`LINEA_LOGO_FUERA`) y el archivo queda con `ajustes.logoFuera`: todo camino que estampa (`conLogoSiToca`,
  `terminarTrabajo`, el carrusel, los encargos del servidor con `navegador.logo` y `forzar`) le pega el original. Una
  EDICIÓN de esa pieza (la corrección del control, la recompuesta) hereda la marca (`editaUnaSinLogo` en trabajos.js); la
  ya estampada no (`herenciaDe` la quita con la plantilla «logo»: si no, corregirla lo estamparía dos veces).
  · **«Una de las imágenes… si aparece» no decía cuál**, entre fotos del producto, plantillas y la muestra de la letra. Ahora
  dice que es la ÚLTIMA y que es la firma. La de antes (`LINEA_LOGO_ANTERIOR`, en los pedidos guardados) se sigue
  reconociendo.
  · **Sin logo de referencia no se decía nada**, y la ficha («Marca: el logo arriba») o la guía del cerebro («toda pieza
  lleva logo») hacían que el motor dibujara uno. Ahora va `lineaSinLogo` (también SIN kit: D'CASA no lo tenía preparado) y
  los logos de la foto REAL de un producto de otra marca se respetan.
  · **El director no sabía que el kit no tenía logo:** `kitVacio` no mira el logo (un kit con sólo el logo contaba como
  vacío) y «Logo: el kit no tiene logo» no le decía qué hacer. Ahora lo dice a la persona y no lo pide en la ficha
  (`SIN_LOGO_EN_LA_FICHA`, también en `pedidoDeFichas` y `pedidoDeCarrusel` con `conLogo`).
- **Lo diseñado se PONE en el post sin volver a crearlo** (`poner_en_publicacion`; `piezasParaPoner`, `postConPiezas` en
  src/lib/disenoChat.js; `cambiarPublicacion` en App.jsx). El asistente sólo podía poner una pieza AL CREARLA (`post_id` de
  cada pieza), y en un carrusel eso iba lámina por lámina: si no lo ponía en todas, no se ponía ninguna, sólo en el mes
  abierto, añadiendo a lo que había y sin cambiar el formato. Al pedirle «ponlo en el post» no tenía herramienta y lo
  volvía a diseñar (y a cobrar). Ahora `disenar_piezas` con `carrusel: true` lleva UN `post_id` para todo el carrusel y
  devuelve `carrusel_id`, y `poner_en_publicacion` pone un carrusel entero (en el orden de la galería) o sueltas, en un post
  de CUALQUIER mes (`onCambiarPublicacion` parte de lo pendiente de ese mes), reemplazando o añadiendo; con dos imágenes o
  más el post pasa a carrusel, y se apunta el uso de cada pieza.
- **La pestaña «Diseño»** (`/cliente/<slug>/diseno`, `DisenoDirector.jsx`): el MISMO ChatPanel, `incrustado` (en la
  página, `role="region"`, sin foco atrapado) y `tema="diseno"`. Sus conversaciones llevan `chat_conversaciones.tema =
  'diseno'` (0047): las ve todo el equipo, también desde el chat (con la etiqueta «Diseño»), y la última abierta se
  recuerda aparte (`chat-ultima:<cliente>:diseno`). Es pestaña y no un modo del Estudio porque el chunk del Estudio está en
  su tope de 20 kB (por eso también `EleccionRanura` y «Guardar como plantilla» van lazy).
- **Las PLANTILLAS del kit** (`kit.plantillas`, hasta 12: id `plantilla-…`, nombre, uso post|historia|portada|lamina,
  clave, sistema; `worker/lib/estudio/plantillas.js`, `POST|DELETE /api/estudio/<c>/kit/plantillas`). «Guardar como
  plantilla» del visor hace que la IA mire la pieza UNA vez (`sistemaDePortada(…, { para: "plantilla" })`, queda en
  `ajustes.sistema`) y la pase al kit. Al usarla, su imagen va de referencia sólo por su diseño (`referenciaDePlantilla`:
  composición, estilo y tipografía; nunca su contenido) y su sistema escrito detrás de la escena
  (`lineaDePlantillaEnPedido`). Se escoge en el compositor, en el lote («Plantilla» para toda la tanda), en «Crear la
  imagen aquí»; el director la elige solo cuando encaja (`plantilla` en su respuesta) y el lote y las historias ponen su
  imagen. `fundirKit` las conserva; el servidor sólo acepta claves de ESE cliente. plantillas.js va aparte de kit.js a
  propósito: control.js lee mercado.js, que lee kit.js (sería circular).
- **Las 3 historias del post salían con faltas porque el motor de imagen INVENTABA el texto** (y siempre con el primer
  Nano Banana). Ahora van por el Estudio (`src/lib/historiasEstudio.js`): el director escribe las tres fichas con su texto
  exacto, cada una con el modelo del cliente (si admite referencias), su kit, las fotos del producto y la imagen del post
  de referencia (`toma: producto, estilo`, «no la repitas»), las zonas seguras de historia y el control que corrige la
  letra mal escrita. Lo que no se escoge va a la papelera del Estudio. **La encajada, siempre; las 3 con IA, sólo con su
  botón** (decisión de la agencia: un post que no gusta no paga tres historias; apagable por navegador `historias-solas`):
  cuando el post RECIBE su primera imagen —no al abrir uno que ya la tenía— se prepara la encajada (la misma imagen en
  9:16, gratis) y se marca «Publicar también como historia». Recuerda de qué imagen salió (`post.encajadaDe` { de, src }):
  si la imagen del post cambia (otra versión, corregida) y la encajada sigue puesta, se REHACE en su sitio
  (`queHacerConLaEncajada`, publicacion.js); quitada a mano, ya no. El modelo de las 3 se escoge en el panel («Modelo de
  las 3 con IA») y se guarda en el kit (`kit.modelos.historias`, una imagen que admita referencias; lo comparte el
  equipo); vacío, el del cliente si admite referencias o el mejor que sí (`modeloDeHistorias`).
  La ruta vieja (`historiaDe` en /api/generar-imagen) sigue, pero ya no la llama la pantalla.
- **«Crear la imagen aquí» escoge tipo, estilo, modelo y plantilla** (`OpcionesCrearAqui.jsx`, lazy: arrastra el
  catálogo; sólo para esa publicación: recordado por navegador en `crear-aqui:<cliente>`, la siguiente salía con la
  plantilla o el estilo de otra sin que nadie lo viera). Vacío es lo de siempre: el tipo del post, el estilo de ese tipo, el
  modelo fijado y ninguna plantilla (o la que escoja el director, que ahora también llega al motor).
- **El texto bien colocado** (donde más se equivoca el diseño no es la ortografía: es dónde va el texto y de qué tamaño).
  · **La ficha lleva medidas:** `FORMATO_FICHA` pide la composición y el tamaño del texto en % de la pieza («titular entre
  el 8 y el 22 % de la altura, 80 % del ancho») y el manual de la casa lo exige («arriba» o «grande» no le dicen nada al
  generador).
  · **Ajustes de un toque** (`AJUSTES_DE_TEXTO` en lib/estudio.js: más arriba, más abajo, más pequeño, más grande,
  centrar): cada uno es una EDICIÓN precisa de la misma imagen. En el visor (`AjustarTexto`, sale una nueva), en cada
  lámina de «Carrusel con IA» y en «¿Qué quieres?» del post (rellenan la indicación de «Corregir esta»).
  · **«Igualar el texto a…»** (`IGUALAR_TEXTO`, `ejemploParaIgualar`): la lámina que se salió de la serie se edita con la
  buena de referencia, sólo por su composición y su letra. En el visor (las otras imágenes de su carpeta de carrusel), en
  «Carrusel con IA» («Igualar el texto a la portada») y en el chat (`corregir_pieza` con `igual_a`).
- **UN solo director para todo** (decisión de la agencia: el chat daba un 8 y el lote menos, y era porque iban por
  caminos distintos). Tres cosas lo igualan:
  · **El mismo modelo:** la función «director de arte» (fichas del lote, «Producir el mes», el post, las historias, los
  carruseles) cae en el hueco «asistente» (`FUNCIONES_IA`), no en «prompts»: diseña con el modelo del chat. En Ajustes el
  hueco se llama «Asistente y director creativo»; «prompts» quedó en «Escenas de imagen» (otra versión distinta, video).
  · **Ve lo mismo:** `vistasDelCliente` (lib/estudio.js) manda hasta 4 copias de 512 px de las plantillas del kit y los «Me
  gusta» con `fichasDeDiseno`, `mejorarIdea` (imagen) y `proponerCarrusel`; el Worker las limpia (`limpiarVistas`: sólo
  imagen en base64, tope de tamaño) y las pone DELANTE del pedido (`conVistas`, `lineaDeVistas`). Se recuerdan 10 minutos.
  · **Sabe lo que la agencia corrige:** `correccionesDelCliente` (worker/lib/estudio/fichas.js) lee los últimos pedidos de
  EDICIÓN del Estudio del cliente y `correccionesRecientes` (director.js) saca la indicación («el titular más arriba»),
  sin las que hace sola la aplicación (la letra del control, «donde dice…»; la recomposición). Van al director de arte,
  al carrusel y al sistema del chat (`lineaDeCorrecciones`). `leerColumnas` admite ahora un `limite`.
  · **El carrusel lo diseña el director** (`pedidoDeCarrusel`, `leerCarrusel` en director.js; worker/lib/estudio/carrusel.js):
  la «contrapropuesta» de antes (qué se ve y composición en una frase, sin manual, kit ni plantillas) se quitó. Ahora
  devuelve el SISTEMA de la serie con medidas (`REGLA_SERIE`: el titular en la misma zona y del mismo tamaño en todas) como
  `hilo` y una FICHA por lámina con su texto exacto; `pedidoDeLamina` la sigue («FICHA DE DISEÑO DE ESTA LÁMINA») y
  asegura el texto de la lámina aunque se cambiara después (en plantilla quita la línea del texto). Lo usan «Carrusel con
  IA» (paso 2: el texto y la ficha plegada, editable), el lote, «Producir el mes» (con «Que el director diseñe»
  encendido) y el asistente: `disenar_piezas` con `carrusel: true` va por `crearCarrusel` (en orden, con la anterior y la
  portada de referencia, el sistema de la portada y el control), no pieza a pieza.
- **El director piensa CADA pieza, como en el chat** (decisión de la agencia: lo diseñado en el chat salía «infinitamente
  mejor» que el lote y que «Carrusel con IA»; `fichasDeDiseno` en worker/lib/estudio/fichas.js). Había cuatro diferencias:
  · **El motor de ideas se saltaba al director.** Su campo `imagen` (un borrador de ficha que escribe el REDACTOR junto con
  títulos, captions y hashtags, de seis en seis) iba directo al motor de imagen en el lote (`conFichas`, `pasoDeLote`),
  «Producir el mes» y «Crear la imagen aquí». Ahora sólo se salta al director su PROPIA ficha: `promptListo(post)` exige
  `promptImagenPor: "director"` (lo pone `conPromptListo`; `camposDePromptListo`, el del motor de ideas, lo deja vacío) y
  el borrador queda de respaldo (`{ cualquiera: true }`, «Mejorar» apagado o el director caído). Las fichas guardadas antes
  de esto no llevan la marca: se rediseñan una vez. `promptImagen` conserva sus líneas (antes `limpio` las juntaba en una y
  `fichaDelPedido` no la reconocía para la revisión del director).
  · **Una llamada por pieza.** La primera va sola y fija el concepto; las demás, de 3 en 3 a la vez (`A_LA_VEZ`; más, y la
  cuenta da 429), con el concepto y las ya diseñadas (`previas`, las dos últimas) para no repetir composición. En el
  servidor, `TANDA_FICHAS` (3) por paso y la primera sola; mientras haya una pieza lista y sitio, se CREA antes de seguir
  diseñando (`listaParaCrear`), y una que aún espera al director no se pide sin él. El contexto (kit, catálogo, cerebro,
  manual, correcciones) se lee UNA vez por tanda (`contextoDelDirector`).
  · **Razona con el nivel del ASISTENTE.** Todo lo que cae en el hueco «asistente» (`huecoDe`, el director de arte) usa
  `ia_razonamiento_chat` si el espacio puso uno (`prepararIA`); antes, el de redacción.
  · **Sabe lo que el chat sabe:** la ficha técnica del cerebro (`sobreLaMarca`, con `contexto(…, { para: "imagen" })`, que
  también da la identidad visual), el CATÁLOGO entero (`catalogo`, con `REGLA_PRODUCTOS`: nada inventado) y el proceso
  de diseño dicho como en una conversación (`RAZONA_COMO_DIRECTOR`). El carrusel (`propuestaDeCarrusel`) lee lo mismo y
  sigue en UNA llamada: es una serie con narrativa.
- **«Otra versión» es la MISMA pieza con otra composición, y el director la MIRA** (`encargoDeVersion` en
  worker/lib/estudio/prompt.js; `ideaDeOtraVersion` en src/lib/otraVersion.js). Salía rara y a veces sin texto por dos
  cosas: «Otra versión distinta» del visor reescribía la FICHA entera en una frase de 60 palabras (`pedidoDeVersiones`) y
  `conOtraEscena` la ponía en lugar del diseño; y la del post le pedía al director «DISTINTA, otra escena» sin enseñarle la
  imagen. Ahora, si la escena es una ficha (`esFicha`), cada versión la escribe el director con el MISMO texto (el de la
  publicación o `textoDeLaFicha`), una variación moderada (con varias, cada una por su eje: `EJES_DE_VERSION`) y la
  original delante como imagen especial (`especiales: [{ papel: "original" }]`, ver `PAPELES` en director.js). La
  pantalla manda la ruta (`original` / `src`) y `estudio.js` la convierte en una copia de 768 px.
- **«Recrear con mi marca» ya no copia** (decisión de la agencia: la otra marca la habría reconocido). Con la referencia
  delante, aunque se dijera «sólo la composición», el motor la calcaba. Ahora el DIRECTOR la mira (`papel: "inspiracion"`:
  la idea, el gancho y el tipo de composición, en una versión propia ligeramente distinta) y escribe la ficha con el
  catálogo; la imagen de otra marca NO va al motor de imagen. Si la publicación no dice qué producto, el director escoge
  del catálogo y van las fotos de los que nombra (`fotosDeLaPieza`). Sin director (sin saldo, caído) NO se recrea y se
  dice por qué: la referencia ya no va al motor ni de respaldo. Lo mismo en «Recrear un anuncio» del Estudio en imagen
  (`recrearAnuncioConLaMarca`); en video sigue el camino de video (`motorParaRecrear`, sólo modelos con llave).
- **Una publicación puede llevar VARIOS productos** (`post.productoIds`; `productosDelPost`, `conProductos` en pilares.js;
  `fotosDelPost` en estudio.js). `productoId` sigue siendo el principal —el primero que se escoge; lo usa la matriz— y
  `producto` junta los nombres («Sofá cama + Mesa»), que es lo que lee la IA al escribir. En «Tipo de contenido» se
  escogen como chips (`tipoContenido.jsx`) y en «Carrusel con IA» igual. Llegan al director (una línea por producto,
  «salen JUNTOS») y sus fotos van una de cada uno antes que la segunda de ninguno: «Crear la imagen aquí», «Otra versión»,
  «Recrear», las historias, «Crear con IA», «Producir el mes» y los carruseles.
- **El asistente diseña con el CATÁLOGO** (`catalogoParaDisenar` en worker/rutas/chat.js, en su sistema cuando hay
  cliente): cada producto con su id, su precio y si tiene fotos. `disenar_piezas` recibe `productos` (ids, de la tanda o de
  cada pieza) y sus fotos REALES van de referencia también en un carrusel (`fotosDeLaPiezaDelChat`); antes sólo se
  buscaban por el nombre en la ficha y, si no lo nombraba igual, el motor se inventaba el producto y la marca. Si no sabe
  de qué producto va, se le pide que PREGUNTE (con las opciones del catálogo); sin catálogo, que pregunte cuál y cómo es.
- **Toda pieza NUEVA de imagen de un cliente pasa por las mismas reglas que el lote** (fase 1 de
  docs/propuesta-lo-mejor-y-creacion.md; en producción, 151 de 430 piezas salían sin control). Lo que va por el servidor
  (lote, «Producir el mes», carrusel, `disenar_piezas`) ya lo hacía; ahora también el visor, «Otra versión», «Crear la
  imagen aquí», «Corregir esta», «Recrear con mi marca», «Recrear un anuncio», las historias con IA, «Generar en 4:5 con
  IA», `generar_imagen` del asistente y `crear_en_estudio`. Cosas que no se ven:
  · **El pedido listo va como un ENCARGO de una pieza** (`pasoListo`/`crearUnaEnServidor` en src/lib/piezaServidor.js,
  `mejorar: false`, la escena ya dentro, sin «{{ESCENA}}»): la proporción (se recompone si no casa), el control con UNA
  corrección (con el `texto` que debe decir) y el logo estampado si el kit lo pide (`navegador.logo`), aunque se cierre la
  pantalla. Lo que necesita lienzo lo pone la pantalla SÓLO con el encargo ya cerrado (`esperarEnServidor`): si hay
  Container, el servidor no lo cierra sin intentarlo, y así no se estampa dos veces. Una EDICIÓN (corregir, editar,
  recomponer) no se estampa otra vez (`estampar: false`, o si la pieza ya lleva `plantilla: "logo"`).
  · **La versión de una pieza va con la MARCA DE HOY** (src/lib/marcaDeHoy.js): «Otra igual» y «Otra versión»
  repetían el bloque de la marca, el logo y el acabado del día de la original (con el logo pasado a «estampado», salían
  dos) y cortaban el pedido con `slice(0, MAX_PROMPT)`, que se llevaba la marca y el logo. `conMarcaDeHoy` parte el
  pedido por sus trozos (los separa una línea en blanco), quita el logo de antes (la última referencia), las líneas de las
  referencias que ya no caben y pone el kit actual; si no cabe, `ajustarFicha` acorta la escena.
  · **«Versión distinta» la diseña el director también sin ficha** (`versionesDeIdea` en worker/lib/estudio/prompt.js: en
  imagen siempre por `encargoDeVersion`, «LA ESCENA DE LA PIEZA ORIGINAL»; sólo un video o el director caído van por las
  escenas cortas). El texto que se manda: el de la ficha, el del control o el del pedido (`textoDePieza` en
  lib/visorEstudio.js). Tras «Editar», el control compara el texto que debe QUEDAR (`textoTrasEditar`: con «X» → «Y», el
  cambio; si no se sabe, el del pedido).
  · **`crear_en_estudio` de una imagen es un encargo** (`imagenPorEncargo` en worker/lib/estudio/herramientas.js) con el
  modelo FIJADO del cliente si no se pide otro (y su relevo si no hace el formato con las referencias), el director si no
  llega una ficha, el control y el logo estampado. La confirmación de 0,50 $ y el presupuesto se miran ANTES de crear. El
  ID que devuelve es del encargo: `estado_trabajo` lo acepta (y `ver_estudio` lo enseña en marcha); su `origen`
  («asistente», «claude») llega a cada trabajo (`datos.origen` en encargos.js). encargos.js y vistaEstudio.js se importan
  en el momento (`import()`): estáticos cerrarían el ciclo con herramientasServidor.js. Un video, sin cambios.
  · **Las historias con IA enseñan el costo y piden el sí** (`costoDeHistorias`, `modelosParaHistorias` → `costos`; el
  botón dice «· unos X $» y un segundo toque las crea, salvo dentro del tope de «crear sin preguntar») y van en UN encargo de tres piezas. «¿Qué quieres?» del post les
  llega, y también al diálogo «Crear con IA» (que entonces no usa el pedido listo) y al director del carrusel
  (`indicacion` en `pedidoDeCarrusel`). «Crear con IA» lleva los productos secundarios (`inicial.post.productoIds`) y la
  plantilla que escoge el director va al motor (compositor, «Crear la imagen aquí», «Otra versión», «Recrear»).
  · **«Generar en 4:5 con IA»** (ajusteImagen.jsx) ya no va por /api/generar-imagen: `recomponerEnProporcion`
  (pedidoDeRecomponer, el modelo del cliente si edita y hace la proporción, si no el relevo) por el servidor con el
  control; el navegador sigue recortando a la medida exacta (Instagram no admite 896×1152).
  · **Fuera las preferencias por navegador que cambiaban el resultado** (decisión de la agencia): el control
  (`controlEncendido`, `estudio-control`), «Usar el kit en esta pieza» (`estudio-usar-kit:<cliente>`), «Diseñarla sola
  al abrir» (`estudio-mejorar-solo`), «En el Estudio / Aquí, rápido» (`post-acciones-donde`) y las opciones recordadas
  de «Crear la imagen aquí» (`crear-aqui:<cliente>`). Las claves viejas se quedan en los navegadores sin que nadie las
  lea. Las comodidades (pestaña, plegados, `historias-solas`) siguen.
  · **El visor del Estudio no espera**: manda el encargo, cierra y avisa si una pieza no salió (`alFallo`); la galería la
  enseña al llegar el aviso del encargo. La lógica vive en lib/visorEstudio.js (lazy): el chunk del Estudio estaba en
  20,3 de 20 kB y quedó en 19,7.
  · **Nada de esto se ha probado contra los servicios reales**: los tests hablan con dobles del servidor y de los motores.
- **Dos carruseles no se parecen: la ESTRUCTURA la pone el código** (`src/lib/estructurasCarrusel.js`). Todas las ideas
  salían «Portada / Slide 1…5 / CTA», y las de un mismo tipo, casi iguales. Hay 14 estructuras propias (errores comunes,
  mito o realidad, paso a paso, antes y después, comparación, lista, señales, preguntas, caso real, qué incluye, guía para
  escoger, detrás de cámaras, historia, un dato), cada una con su número de láminas y los tipos con los que encaja.
  `estructuraPara` rota dentro del tipo SIN las dos últimas que el cliente usó en ese tipo (`estructurasRecientes` en
  worker/lib/estudio/lote.js lee sus tres últimos meses: una consulta, sólo si el lote puede llevar carruseles). La pone
  `darForma` (lote, «Planificar mes», «Mes completo», «Generar»), va en la línea de cada pieza y en el guion
  (`GUION_DE_FORMATO.carrusel`), y la publicación la guarda (`post.estructura`) para que la siguiente no la repita. «Dame
  ideas» del carrusel da una distinta por idea (`estructurasDistintas`) y el director, con sólo un tema, sigue la de la
  publicación o una nueva (`estructura` en /carrusel/propuesta). Con un guion escrito, manda el guion.
- **Cada tipo de contenido se diseña a su manera** (`DISENO_POR_TIPO` en director.js: un anuncio con el producto
  protagonista y el precio; un educativo tipográfico y sin botón de compra; contenido humano con foto real y poco texto…).
  Va en las fichas del director (sólo los tipos de la tanda, `bloqueDeDisenoPorTipo`), en la ficha `imagen` del motor de
  ideas (`identidadParaFichas`), en el carrusel y en el sistema del asistente. La agencia lo cambia tipo a tipo en Ajustes
  → Manual → «Cómo se diseña cada tipo» (`manual_campanas.disenoTipos`, `limpiarDisenoTipos`); vacío, el de la casa. El
  tipo llega por su NOMBRE («Educativo / Informativo»): `tipoDeDiseno` lo reconoce (también los alias y las maletas).
  · **Una plantilla del kit puede ser LA de un tipo** (`plantilla.tipos`, chips en el kit): `fichasDeDiseno` la pone sola
  en las piezas de ese tipo y uso (post, historia, portada de carrusel; `plantillaParaTipo`) si nadie escogió otra y la
  pieza lleva su texto, y la línea de la plantilla dice «ES LA DE: …» para el asistente y el motor de ideas.
- **El DIRECTOR revisa cada pieza en la MISMA llamada del control** (`pedidoDeControl({ ficha })`, `leerControl` en
  src/lib/control.js; `fichaDelPedido` en worker/lib/estudio/control.js). Con la ficha del pedido delante (del «Pieza:» a
  la primera línea en blanco), compara dónde está el texto y de qué tamaño, la jerarquía y los márgenes, pone nota
  (`puntajeDiseno`) y da hasta 3 arreglos con números. Por debajo de `NOTA_MINIMA` (8) la pieza queda «Revisar» y es
  `corregible`: `controlarYCorregir` (todos los caminos: lote, carrusel, «Producir el mes», compositor, el post, las
  historias, el asistente) hace UNA edición con letras y arreglos juntos (`correccionDelDirector`), la vuelve a controlar
  con la ficha de la ORIGINAL (`ficha` en el POST: la edición no la lleva) y se queda la que `mejoro()`. Una edición como
  mucho por pieza: el costo tiene techo. Un precio, el logo o una deformación siguen sin tocarse solos. Las ediciones
  automáticas empiezan por `PREFIJO_AJUSTE` («Ajuste del director:») y `correccionesRecientes` las descarta: no son de la
  agencia. Sin ficha (una pieza a mano, una edición sin la original) no hay revisión del director. En el visor, su nota
  y «Aplicar los arreglos del director».
- **El asistente flotante tiene dos pestañas: «Asistente» y «Director (diseño)»** (ChatPanel, con un cliente;
  `cambiarPestana`). Antes era un interruptor «Modo director» con un filtro «Todas / Diseño» en la lista, y no se sabía
  en cuál se estaba. Cada pestaña enseña SÓLO sus conversaciones (las del director, `tema: "diseno"`, son las mismas de la
  pestaña Diseño) y recuerda su última abierta aparte (`chat-ultima:<cliente>:diseno`). Se guardan todas en `todasConv` y
  `conversaciones` es la vista de la pestaña: la lista no se vuelve a pedir al cambiar. El sistema del asistente ya sabía
  diseñar con cliente: la pestaña cambia dónde se guarda y lo que se ve (título, encargos), no lo que sabe.
- **El asistente flotante mide lo que SE VE** (`useAltoVisible`, `visualViewport`): en el teléfono el teclado no encoge
  `innerHeight` ni un `fixed; inset: 0`, así que la caja de escribir crecía hasta el 40 % de la pantalla entera y el
  botón de enviar quedaba bajo el teclado. Ahora el panel mide el alto visible, la caja crece hasta el 30 % de eso (220 px
  como mucho) y los encargos del director se esconden mientras hay texto.
- **El asistente DENTRO de un post sólo cambia ESE post** (botón «Asistente» en la cabecera del panel; `ChatPanel` con
  `publicacionFija` y `lateral`; `src/lib/asistentePost.js`). La regla no la pone el prompt —un modelo se equivoca de
  id— sino el código: `herramientasDelPost` quita todo lo que crea, borra, mueve o edita en lote (y tareas, banco,
  memorias), y `guardaDelPost` rechaza la herramienta que nombre otra publicación y pone el `post_id` a la que lo omite.
  El calendario que ve (`calDelAsistente` en PostSidePanel) lleva el `form` abierto, y sus cambios entran en el `form`
  (`desdeElAsistente`) con «Deshacer»: si escribiera en el calendario, el guardado al desmontar el panel lo pisaría. A lo
  ancho va al lado (el panel se corre: `.con-asistente`); en el teléfono, encima. La conversación es POR PUBLICACIÓN
  (`chat-ultima:<cliente>:post-<id>`, título «Post <fecha>: …») y no se borra al salir: «Borrar conversación» (segundo
  toque). `editar_publicacion` admite además `titulo`, `hashtags` y `escena`.
- **Una vuelta del asistente que se corta se RECUPERA al volver** (teléfono bloqueado, otra pestaña: el sistema corta la
  conexión). El navegador manda `turnoId`; el Worker, que sigue hasta acabar su vuelta, guarda el final en R2
  (`turnos/<espacio>/<turno>.json`, nunca bajo `clientes/`) y `GET /api/ia/chat/turno/<id>` lo da UNA vez (lo borra al
  leerlo). `conversarIA` lo pide en diferido (`turnoChat.js`) cuando la pestaña vuelve a verse, cada 4 s, y el chat sigue:
  con herramientas del navegador, las ejecuta; si el servidor ya guardó la respuesta (`guardado`), relee la conversación.
  `esperarArchivos` (carruselEstudio.js) tampoco se rinde por un corte: espera a que la pestaña se vea (hasta 40). Lo que
  NO hace todavía: seguir con las herramientas del navegador con la aplicación cerrada (eso sería otro paso).
- **La proporción pedida es la que sale, y Muse se queda** (`respetaProporcion`, `modeloQueRespeta`, `relevoPara`,
  `fueraDeProporcion` en estudioCatalogo.js; `escaleraMuse` en worker/lib/estudio/meta.js). Muse Image es el modelo de la
  agencia (barato y se ve bien), y una serie con piezas de Muse y de Nano Banana se nota: NO se cambia de motor por la
  proporción. Si Meta rechaza la vía de medidas exactas (1024×1280 en 4:5) con las referencias, el Worker reintenta por
  ELLA con las 2 primeras, con la primera y, si no es una edición, sin ninguna; sólo después va a la de Responses (que da
  1:1, 2:3 o 3:2). Lo que dejó fuera queda en la NOTA del trabajo (`aviso`): si una pieza salió sin logo o sin la foto
  del producto, ahí está el porqué y lo que contestó Meta. La primera versión daba a Muse por incapaz de 4:5 con
  referencias (`conReferencias`) y la cambiaba sola a Nano Banana: la agencia ya no podía escogerla. `conReferencias`
  sigue en el catálogo para un modelo que de verdad lo necesite. GPT Image, Seedream e Imagen no tienen 4:5. Dos capas:
  · **Antes de crear:** `pedidoDePieza({ …, proporcion, activos })` cambia el modelo por el primero de `RELEVO_PROPORCION`
  con llave (Nano Banana 2 por Kie, luego el de Google…) si el escogido no la respeta con esas referencias; quien llama
  lee el modelo usado en `pedido.modelo` (para el costo y el nombre). Lo usan el director del chat, `generar_imagen`, el
  lote, «Producir el mes», «Crear la imagen aquí», «Otra versión», las historias, las láminas del carrusel
  (`crearLamina`, `corregirLamina`: un carrusel es 4:5 SIEMPRE), las correcciones (`modeloParaCorregir(…, aspecto)`) y la
  versión final. El compositor respeta lo que escoge la persona.
  · **Después, la red de seguridad** (`esperarArchivos` en carruselEstudio.js, por donde esperan todos): una imagen cuyas
  medidas no casan con el `aspectRatio` de su trabajo (4 % de margen: el 896×1152 de Nano Banana vale) se RECOMPONE en
  esa proporción (`pedidoDeRecomponer`: la misma pieza, sin recortar ni acercar; el texto no se encoge) con el MISMO
  modelo que la hizo y, sólo si vuelve a salir de otra medida, con el relevo; la nueva ocupa su sitio. Decisión de la agencia: NADA de recortar ni de «zona segura» (el texto quedaba pequeño).
- **«Agrupar como carrusel» en la galería** (`agruparComoCarrusel`, `desagrupar`, `moverEnOrden` en lib/estudio.js): con
  «Seleccionar», las imágenes tocadas pasan a una carpeta de carrusel EN EL ORDEN en que se tocaron y la galería las
  enseña como una tarjeta; en `VisorGrupo`, flechas para cambiar el orden (se guarda con `ordenarCarpeta`) y «Desagrupar»
  (borra la carpeta: el servidor devuelve sus piezas a la galería). Los carruseles del director (`disenar_piezas` con
  `carrusel: true`, todas 4:5) van solos a su carpeta y quedan en el orden del plan.
- **Lo que crea el director se guarda en la conversación EN CUANTO SALE** (ChatPanel, en el bucle de herramientas): antes
  iba sólo en la respuesta final, y si se cerraba el chat o se bloqueaba el teléfono a mitad del turno, las piezas
  estaban en la galería y no en el chat. Por eso el historial puede tener dos mensajes seguidos del asistente: al
  mandarlo a la IA se juntan en uno. Un plan que esperaba «Crear» cuando se cerró el chat queda como «Plan sin crear» en
  la conversación, y el director sabe que «créalo» basta. «De la galería» en el chat adjunta piezas del Estudio con su
  `archivo_id` (el asistente las puede usar de referencia, corregir o poner en un post sin volver a subirlas).
- **El chat no mueve la página** (ChatPanel): bajar al último mensaje era `scrollIntoView`, que desplaza TODOS los
  contenedores, también la página: en la pestaña Diseño el chat se subía y la caja de escribir quedaba fuera de su sitio
  hasta cambiar de pestaña. Ahora se desplaza sólo la lista (`scrollTo` de `.chat-mensajes`) y todo `focus()` del chat va
  con `preventScroll`. El formulario inicial del compositor vive en lib/estudio.js (`formularioInicial`): la pestaña
  Estudio estaba en su tope de 20 kB.
- **Editar una imagen no la toca: hace otra.** Es un trabajo con la imagen de
  referencia y `promptDeEdicion()` (la indicación + «conserva todo lo
  demás»), con Muse Image si hay llave de Meta y si no Nano Banana
  (`modeloParaEditar`). De qué original sale se sabe por su trabajo
  (`originalDe`): no hizo falta ninguna columna.
- **Muse Image: dos vías, y el error dice lo que contestó Meta en cada una.**
  Con la llave puesta, Meta contestaba 400 y la pantalla decía «Meta rechazó
  el pedido.» sin motivo: sólo se leía `error.message`. Ahora
  `llamarMuseImage()` (worker/lib/estudio/meta.js) pide primero por la API de
  imágenes con el tamaño EXACTO de la proporción (1024x1280 para 4:5; ya sin
  `response_format`, que las API compatibles con OpenAI rechazan para los
  modelos nuevos) y, si Meta la RECHAZA (400/404/405/415/422), por la API de
  Responses del recetario oficial (github.com/meta-models/meta-model-cookbook,
  `05_muse_image`: referencias como `input_image` dentro de un mensaje de
  usuario; `size` sólo 1024x1024, 1024x1536 o 1536x1024). Si las dos fallan,
  el error lleva «ruta → código: lo que dijo» de cada una (`motivoDe()`, sea
  JSON o texto) y queda en `estudio_trabajos.error`: es lo primero que hay que
  leer. Las proporciones del Estudio NO se recortan a las tres de Responses:
  la agencia ya genera con Muse en otros tamaños.
- **Con el calendario siempre activo, «el día no existe» casi nunca es verdad.**
  `days` sólo trae los días con algo dentro y un mes sin nada es virtual. El
  asistente contestaba «Falló: No existe el día 2026-10-04 en este calendario»
  y el banco de ideas sólo ofrecía llevar una idea a días ya ocupados. Ahora
  `crear_publicacion` (ChatPanel.jsx) mete con `ponerEnDia()`, una fecha de
  OTRO mes va a su cajón (`crearEnOtroMes` en App.jsx) y el «Mover al
  calendario» del banco lista todos los días del mes. El prompt del asistente
  lleva además HOY y los días del mes por día de la semana
  (`diasPorSemanaDelMes`): sin eso, el modelo calculaba el día de la semana y
  decía que el domingo 4 de octubre de 2026 no existía.
- **El micrófono del asistente necesita `microphone=(self)` en
  `Permissions-Policy`** (`public/_headers`). Con `microphone=()` Chrome ni
  siquiera pregunta y el dictado falla en la web; en el iPhone funcionaba
  porque Safari no aplica esa cabecera. Cámara y geolocalización siguen
  cerradas, y `tests/despliegue/plantillas.test.js` lo vigila.
- **Leer un video en el navegador tiene plazo** (`esperar` en lib/medios.js, 12 s). Safari en el iPhone no carga un
  video que no está en pantalla, así que `loadeddata` no llegaba nunca: «Subir» esperaba a la IA, que esperaba a los
  fotogramas, y «Publicar ahora» se quedaba gris para siempre sin decir por qué. Ahora el botón dice su motivo al lado
  y hay «No esperar a la IA».
- **La espera de TikTok tiene plazo** (`PLAZO_TIKTOK_MS`, 30 min en
  `seguirPostPeer`): sin él, un estado que no terminaba dejaba la fila en
  «Publicando…» para siempre. Al vencer queda en error con el último estado y
  NO se reintenta (ya se mandó: otra serían dos publicaciones y dos créditos).
  El aviso viaja con el evento: si TikTok la dejó con otra privacidad, lo dice.
- **El cuadro del perfil de un reel NO se elige por la API**: Instagram saca
  siempre la ventana 3:4 del CENTRO de la portada. «Encuadre en el perfil»
  (PortadaVideo) mueve la imagen dentro de la portada para que lo elegido
  quede en el centro y rellena el hueco desenfocado (`ventanaCuadricula`,
  `encuadrarParaCuadricula` en lib/medios.js); el hueco sólo se ve en la
  pestaña de reels.
- **Lo que llega de Drive se mide** (`medirImagen`): entraba sin ancho ni alto
  y entonces no salía el aviso de «no cabe en el feed» ni la opción de 4:5 —la
  misma imagen avisaba subida desde el PC y no desde Drive—. Las de antes se
  miden al abrir el panel. Y tocar una imagen o un video de la carpeta abre
  `VisorDrive` (anterior/siguiente con flechas, teclado o deslizando); antes
  se abría en otra pestaña y el video no se reproducía.
- **Anuncios de Meta: nada nace activo, y activar es del SERVIDOR.** Los
  cuerpos de campaña, conjunto y anuncio salen de `src/lib/anuncios.js` y
  fijan `status: PAUSED` sin aceptar otro valor (`ESTADO_AL_CREAR`); activar
  exige papel de administrador (403, comprobado ANTES de leer nada) y
  `confirmado: true` —el booleano— (409 con el presupuesto y las fechas, que
  es lo que enseña el diálogo). Un asistente o una petición a mano no se lo
  saltan. Activar enciende anuncio y conjunto creados desde la app y la
  campaña la ÚLTIMA (es el interruptor); pausar sólo toca la campaña. Cosas
  que no se ven en la pantalla:
  · **Los permisos de anuncios (`ads_read`, `ads_management`) tienen App
  Review y NO van en `PERMISOS_META`:** romperían «Conectar Meta» si Meta no
  los aprueba. Se piden con `?para=anuncios` en el mismo OAuth
  (`PERMISOS_EXTRA_META` (meta.js)), que vuelve a /campanas; con el inicio de sesión para
  empresas hace falta su propia configuración, `META_CONFIG_ID_ANUNCIOS`.
  · **El presupuesto va en unidades MENORES de la moneda de la cuenta**, y
  las monedas sin decimales (COP, CLP, JPY…) no se multiplican por cien:
  `aMenores()`. El gasto de /insights, en cambio, ya llega en unidades mayores.
  · **Obligatorios de la API actual:** `special_ad_categories` (vacío si no
  se declara), `is_adset_budget_sharing_enabled: false` (el presupuesto va en
  el conjunto; sin el campo, 100/4834011), `bid_strategy` en el conjunto y
  `targeting_automation.advantage_audience: 0` (desde la v23; con 0 el público
  es exactamente el escogido). El creativo usa `instagram_user_id`, no
  `instagram_actor_id`. Con categoría especial, Meta exige todas las edades,
  los dos sexos y radios de 25 km o más: lo valida `validarBorrador()`, la
  MISMA función en el asistente y antes de crear.
  · **El medio se sube al ESCOGERLO, no al crear:** imagen a /adimages por
  partes desde R2 (hash); video a /advideos con `file_url`, la dirección
  firmada de siempre, así Meta lo descarga y el Worker no lo carga ni lo
  trocea. Meta lo procesa después: el asistente pregunta cada 4 s y no deja
  crear hasta que esté listo, y el servidor lo comprueba otra vez (409).
  · **Si la creación falla a medias se borra la campaña** (con sus hijos):
  en pausa no gasta, pero una campaña huérfana en la cuenta del cliente
  confunde. Si el Worker muere entre medias, queda en pausa —lo seguro—.
  · **Una campaña sólo se lee o se toca si es de la cuenta del cliente**
  (`account_id`): el id lo manda el navegador.
  · **Las cifras del total no son la suma de los días:** el alcance no se
  suma, así que /insights se pide dos veces (total y `time_increment=1`).
  · **Una campaña son hasta 3 CONJUNTOS (públicos) y hasta 6 ANUNCIOS, que van en todos** (`normalizarBorrador`,
  `MAX_CONJUNTOS`, `MAX_ANUNCIOS`): la receta de la agencia para ventas es intereses + Advantage+ + similares, con
  4 a 6 piezas. Cada conjunto lleva su presupuesto; las fechas son de la campaña. Se crea UN creativo por anuncio y se
  REUSA en cada conjunto (conjuntos × anuncios = anuncios de Meta, hasta 18; 28 llamadas en el peor caso, dentro de
  las 50). Todos los ids van en `campanas_anuncios.ids` (0038): activar enciende todos los anuncios, todos los
  conjuntos y la campaña la ÚLTIMA. Un borrador con la forma de antes (`presupuesto`, `publico`, `anuncio`) se lee
  como un conjunto y un anuncio: lo guardado y los tests de antes siguen valiendo.
  · **A WhatsApp** (`destino: "whatsapp"`, sólo con Ventas, Interacción o Tráfico): el conjunto va con
  `destination_type: WHATSAPP` y `optimization_goal: CONVERSATIONS` (tráfico: `LINK_CLICKS`) y `promoted_object:
  { page_id }` —el número es el que la página tiene conectado, eso se hace UNA vez en el Administrador—; el creativo,
  con el botón `WHATSAPP_MESSAGE` y `ENLACE_WHATSAPP`. Sin píxel. El resultado en /insights es
  `ACCION_MENSAJE` (conversación empezada), que cuenta en Interacción y en Ventas (detrás de las compras).
  · **Los públicos:** intereses → `flexible_spec` (buscados en `/search?type=adinterest`); Advantage+ →
  `advantage_audience: 1`, edad mínima ≤ 25 y máxima 65, los intereses como sugerencia; similares →
  `custom_audiences` (de `/act/customaudiences`; «Crear similar» hace un LOOKALIKE del 1 % de un público de la cuenta,
  que no gasta nada). Con categoría especial, nada de similares.
  · **El carrusel** es `link_data.child_attachments`: de 2 a 10 tarjetas, SÓLO imágenes, cada una con su título y
  descripción (y su enlace en la web; si no, el del anuncio).
  · **Nada de esto se ha probado contra la Marketing API real** (sin cuenta
  publicitaria de pruebas): los tests hablan con un `fetch` de mentira que
  contesta como la documentación. Lo primero con una cuenta real es una
  campaña de Tráfico de 1 $ al día, mirada en el Administrador de anuncios
  antes de activarla; luego una de Ventas a WhatsApp con dos públicos.

- **El estratega de campañas** (`src/lib/estratega.js`, `worker/lib/estratega.js`, `/api/anuncios/estratega`,
  `anuncios/Estratega.jsx`). Lo que hacía el bot de Felipe, con lo que la aplicación ya sabe: el cerebro del cliente
  CON lo interno (`para: "chat"`: los márgenes sirven para las cuentas y esto sólo lo ve la agencia), el catálogo, el
  estudio de mercado (los 7 elementos del producto, si están) y las campañas ya creadas. Para un producto que no está
  en el catálogo o alguien que no es cliente, con lo que se escriba, y saca las 7 maletas (los 7 elementos del estudio).
  · **Las CUENTAS las hace el código, no la IA** (`economia`, `escenarios`): con precio, margen y cuántos de cada 100
  compran sale el costo máximo por resultado (punto de equilibrio) y el que deja ganar (la mitad); la IA sólo estima
  cuánto cuesta un resultado en ese rubro (conservador, esperado, optimista). Un número del plan no contradice a otro.
  · **El manual de la agencia va DELANTE de todo** en el pedido (`ajustes_espacio.manual_campanas`, 0039): reglas,
  nomenclatura (`{cliente} · {objetivo} · …`, la rellena `nombreConPlantilla` y quita lo vacío con su separador) y
  la tasa de cierre por defecto. Lo cambian admin y editores sin clientes asignados; un colaborador no arma planes de
  fuera.
  · **Del plan a «Nueva campaña»:** `planABorrador` da la forma de varios conjuntos y anuncios SIN medios; los
  intereses llegan como palabras (`sugeridos`) y se buscan en Meta desde el asistente («Buscar todos en Meta»: el
  primero que encuentre de cada uno; los que no existen, se dicen). La pieza sugerida se ve en cada anuncio.
  · **«Pegar el plan de otro bot»** lo pasa a esta forma conservando sus decisiones. Los planes se guardan en
  `planes_campana` (0039; `client_id` vacío para alguien de fuera, como las auditorías).
  · No toca Meta: no hace falta cuenta publicitaria para planear. Lo de fuera se puede «Guardar como cliente» (con su
  producto en el catálogo) o copiar como texto.

- **El diagnóstico de las campañas activas son REGLAS, no la IA** (`src/lib/diagnostico.js`, `POST
  /api/anuncios/clientes/<c>/diagnostico`). Últimos 7 días frente a 30 y al costo aceptable por resultado (el del
  estratega; vacío, el promedio del mes de cada campaña): apagar (el doble de lo aceptable gastado sin resultados, o
  cada resultado a más de 1,5 veces), revisar (activo sin gastar), renovar (un anuncio con frecuencia ≥ 3 o el CTR
  un 30 % abajo), vigilar (el costo sube un 30 %), escalar (≤ 70 % de lo aceptable: +20 %, más reinicia el
  aprendizaje) y duplicar (funciona pero la frecuencia pasa de 2,5: otro público). La IA sólo lo explica si se marca
  (función «diagnóstico de campañas»), con la orden de no inventar cifras; si falla, las reglas siguen.
  · **Leer cuesta 2 + 4 llamadas por campaña activa** (hasta seis): Meta no da dos rangos en un mismo campo, así que
  conjuntos y anuncios se piden con 30 días y otra vez sólo con el id y 7 días. Pide `frequency` (`CAMPOS_DIAGNOSTICO`).
  · **Nada cambia solo:** «Apagar» pausa ESE conjunto o anuncio (cualquiera que escriba); «Subir a…» cambia el
  `daily_budget` de un conjunto y es como activar: administrador (403 antes de leer nada) y `confirmado: true` (409
  con «De X a Y al día»). Un conjunto sin presupuesto propio (lo lleva la campaña) no se toca desde aquí. Todo id se
  comprueba de la cuenta del cliente (`objetoDeLaCuenta`). Se apunta en el historial: 0040 reconstruye
  `historial_anuncios` para admitir «presupuesto» y «publico» (el CHECK no se cambia en SQLite).

- **El informe de anuncios va APARTE del de redes** (`src/lib/informeAnuncios.js`, `worker/lib/informeAnuncios.js`,
  `informes_anuncios` y `anuncios_clientes`, 0041). El de redes conserva su resumen de la pauta; éste es el que se le
  manda al cliente de su publicidad: cuatro cifras grandes con el mes anterior, «Lo que logramos», el día a día, los
  tres mejores anuncios con su imagen, cada campaña —también las del Administrador de anuncios— y lo del mes que viene.
  · **Las cifras las calcula el código y se congelan;** la IA (función «informe de anuncios») sólo escribe con ellas
  delante. Si falla, el informe sale igual con `avisos` (los ve la agencia, nunca el cliente).
  · **Los resultados grandes son los del objetivo que más invirtió** (`otrosObjetivos` lo dice): sumar conversaciones
  de WhatsApp con clics bajo una sola etiqueta sería mentir. Un test lo cazó: la primera versión sumaba todo.
  · **«Enseñar el costo por resultado»:** por cliente (el valor de partida) y por informe (el que vale). Apagado,
  `informeAnunciosPorTestigo` lo QUITA con `sinCosto()`: esconderlo en la pantalla dejaría la cifra en el JSON del
  enlace. A la IA se le pide no nombrarlo; si se apaga DESPUÉS de generar, el diálogo avisa de que el texto pudo
  nombrarlo (`costoEnAnalisis`) y conviene regenerar.
  · **Las imágenes de los mejores se incrustan** (data:, ≤ 250 kB cada una, sólo de `fbcdn.net`/`cdninstagram.com`):
  el enlace del cliente no tiene sesión para el proxy de miniaturas y lo del CDN de Meta caduca.
  · **Nueve llamadas a Meta como mucho**, sólo lectura: cabe en una vuelta del cron.
  · **El automático** (interruptor por cliente, apagado) sale del día 1 al 5 desde las 9:00, uno por vuelta, detrás del
  informe de redes, y como BORRADOR: no se comparte solo. La fila se escribe ANTES de nada que pueda fallar: un fallo
  sin fila (Meta desconectado) lo reintentaría cada minuto cinco días seguidos.
  · **Imprimir desde un diálogo:** el `backdrop-filter` del `.overlay` lo convierte en el bloque contenedor del
  informe absoluto, y el PDF empezaba debajo de toda la página. `InformeVista.css` lo quita al imprimir (también
  arregla el informe de redes, que tenía lo mismo).
  · **Nada de esto se ha probado contra Meta:** los tests hablan con un `fetch` de mentira.

- **ROFER siguió escribiendo su WhatsApp viejo aunque GitHub y el cerebro ya tenían el nuevo, por TRES cosas** (todo en
  la pestaña Cerebro):
  · **La ficha técnica y las cifras no se renovaban al actualizar.** Son lo que la IA lee SIEMPRE, y las escribe la IA a
  partir de las notas: las notas tenían 6086-6581 y la ficha seguía con 61562010. Ahora «Actualizar desde GitHub» la
  renueva sola si trajo algo (sin pisar la editada a mano: eso es «Renovar de todas formas»), y `estado.fichaVieja`
  (`fichaDesactualizada` en preparar.js) avisa arriba cuando alguna nota de las que la alimentan cambió después.
  · **«Editada a mano» era cualquier guardado.** Marcar una nota interna o cambiarle el tipo la congelaba con el texto del
  repositorio para siempre. Ahora va en la columna `editada` (0053, dos bits: `EDITADA_TEXTO` congela; `EDITADA_AJUSTE`
  sólo conserva tipo y candado al reimportar) con `textoEditado()` en notas.js; las filas de antes valen como antes (por
  las fechas). Lo que no se actualizó por estar corregido aquí vuelve en `sinActualizar` y «Usar la versión de GitHub»
  manda `pisar` con sus ids (se baja el archivo aunque no haya cambiado).
  · **El dato vive en varios sitios.** `GET /api/cerebro/<c>/datos` (`datosQueNoCuadran`, src/lib/datosCerebro.js) compara
  sin IA los teléfonos y correos de la ficha, las cifras, la ficha del cliente y las memorias del asistente con lo que
  dicen las notas, y lo que va DESPUÉS de «anterior», «reemplaza»… en una línea no cuenta. Las notas internas no entran.
- **La etiqueta del modelo mentía: decía «Sonnet 5» a una agencia que escribía con Muse.** `etiquetaIA` leía sólo el
  modelo general, y el general sólo admitía Anthropic (CHECK de `ia_modelo`). Ahora `modeloDeFuncion` (src/lib/configIA.js)
  aplica la MISMA regla que `modeloParaHueco` del servidor con `meta` (si hay llave de Meta, que manda GET /api/ajustes), y
  un general de Meta va en `ia_modelos.general`, que manda sobre la columna en `leerConfigIA`. «Bajar» al llegar al
  presupuesto se queda en Meta si el general es de Meta. Y faltar la llave de Anthropic ya no contesta 503 si hay la de
  Meta (`sinIADeTexto`).
- **La contraseña se cambia desde «Equipo y perfil → Tu contraseña»** (`PUT /api/equipo/yo/contrasena`, `cambiarContrasena`
  en sesion.js): pide la actual, 12 caracteres como mínimo y cierra las OTRAS sesiones de la persona. Va por `equipo/yo`,
  así que quien es de sólo lectura también la cambia. El administrador pone una TEMPORAL a quien la olvidó (`POST
  /api/equipo/miembro/<id>/contrasena`, se enseña una vez y cierra sus sesiones): la aplicación no manda correos. Nunca al
  fundador ni a alguien de otro espacio.
- **El Tablero se quitó** (decisión de la agencia: no le encontraba sentido). `/tablero` abre Programación.
- **Las etapas salen SOLAS, en cuatro pasos** (`detalleEtapa` en src/lib/trabajo.js; decisión de la agencia: a mano nadie
  las marcaba): idea (sin archivos) → producción (con archivos) → cliente (se le mandó, o ya respondió: con el cliente,
  aprobada, pidió cambios, corregida) → programada, que dice «Publicada» al salir. «Mandado» es `post.enviadoAt`, que pone
  `marcarEnviadas` al COPIAR el enlace o el mensaje de «Enviar a cliente» (copiar es mandarlo), sólo en lo que el cliente
  ve y está pendiente. El mes apunta `opciones.enviadoAt`: los meses mandados antes no lo tienen y ahí sigue el respaldo
  de «con enlace = con el cliente». `post.etapa` se queda SÓLO para lo interno: «aprobada por dentro» (revisión interna:
  `cliente`; «Revisar las ideas»: `produccion`) y «enviada a grabar» (UGC); ya no se enseña ni se elige.
- **El informe mensual lleva las redes que se escojan** (`clients.informe_redes`, 0054; src/lib/informeRedes.js). Sin
  nada guardado, todas, como antes. Al generar se escogen (y «Anuncios»); con «Recordar» se guarda en el cliente y lo usa
  el automático del día 1. Lo de las demás redes no entra en NINGUNA cifra (`cifrasDelMes(…, seleccion)` filtra cuentas,
  fotos y publicaciones), y sin anuncios ni se pregunta a Meta. La selección va en `contenido.seleccion`, NO dentro de
  `cifras` (eso lo lee la IA). La columna no la escribe `clientToRow`: una ficha abierta desde antes no la pisa.
- **Programación es como Meta Business Suite** (`pestanasProgramacion` en src/lib/cola.js): tres pestañas —Publicadas,
  Programadas, No publicadas— con filtros de texto, cliente, red, formato y días (7/30/90 de lo publicado; lo programado y
  lo fallido, entero). Lo publicado lleva alcance, visualizaciones e interacciones: `GET /api/publicar?todo=1&dias=` (hasta
  90) las une de `metricas_publicacion` por red + `externo_id`; lo que no se midió va con «—». Al entrar, si algo falló se
  abre «No publicadas» (ahí van también «Aprobadas, por programar» y lo de a mano). En Programadas: «Publicar ahora» (sólo
  admin: el servidor da 403) y quitar de la cola, también varias marcadas. Lo publicado en Instagram NO se borra por API.
  La tabla es tabla desde 720 px; por debajo, tarjetas con la etiqueta de cada celda (`data-etiqueta`).
- **«Mi día» va por SEMANAS** (`src/lib/semanaTareas.js`, `SemanaTareas.jsx`; `clients.dias_trabajo`, 0056). Lunes a sábado,
  el día de hoy sombreado (sale de la fecha, nada que mantener) y en cada día una tarjeta por empresa FIJA ese día
  (`dias_trabajo`, 1 = lunes … 6 = sábado: del EQUIPO, se repite cada semana hasta que alguien la quite; se cambia con
  «+ Fijar empresa» y el marcador de cada tarjeta, `PUT /api/clientes/<id>/dias`, que `clientToRow` no lleva). Cosas que
  no se ven:
  · **Cada tarea va en su día por `fechaObjetivo`**, la misma regla de la lista y del contador. Una planeada el lunes que
  no se hizo SE QUEDA en el lunes, atrasada (no salta a hoy); sin ningún día no está atrasada nunca: va a «Sin día» de
  su empresa (plegado, en cada día en que esté fija) y a «Por agendar». Una empresa con tareas un día que no es suyo
  sale igual ese día (borde punteado). Lo atrasado de semanas anteriores sale aparte arriba, sólo en la semana de hoy.
  · **Se arrastra** a la tarjeta de una empresa en un día, desde «Por agendar» o desde el PANEL LATERAL de tareas (sus
  filas llevan la clave en `TIPO_ARRASTRE`); como el arrastre de HTML no va con el dedo ni con el teclado, «Agendar»
  hace lo mismo con dos selectores. Lo que cambia lo decide `cambioAlSoltar`: el día planeado (`today_date`) y la
  empresa. Una RÁPIDA soltada en una empresa cambia de tabla (`soltar` en useTareas: se crea en la empresa con sus
  notas, persona y fecha límite y se borra la rápida); una de empresa no se queda sin empresa.
  · La vista que se abre se recuerda por navegador (`midia-vista`); la lista y «Por empresa» siguen como estaban.
- **«Aplicar en el perfil» se guarda en la AUDITORÍA, no en el navegador** (`auditorias.aplicado` y `optimizado_at`, 0057;
  `itemsParaAplicar`, `limpiarAplicado`, `progresoAplicado`, `comprobarEnPerfil` en src/lib/auditoria.js). Antes iba en
  `localStorage` de cada uno: lo que marcaba una persona no lo veía otra. Cada cambio guarda quién y cuándo (`PATCH
  /api/auditorias/<id>/aplicado`, sólo claves que la auditoría pide). «Comprobar en Instagram» (`POST …/comprobar`) relee
  el perfil con `leerPerfil` y marca SOLO el nombre y la biografía si ya son lo propuesto (sin mayúsculas ni espacios de
  más) y el enlace si cambió; nunca desmarca. La foto no se puede comparar (su dirección del CDN cambia en cada lectura) y
  destacados y fijados la API no los da: se marcan a mano. «Marcar perfil optimizado» (`POST …/optimizado`) se ve en la
  lista y en el enlace del cliente (`optimizado`, sin la lista interna). Las portadas tienen un séptimo estilo, «Con la
  marca»: el icono y el logo del kit debajo, dentro del círculo seguro.
- **Historias automáticas: de 1 a 5 al día** (`historias_auto.por_dia`, 0055; `horasDelDia`, `elegirPiezas` en
  src/lib/historiasAuto.js): la primera a su hora y las demás cada 2 horas; si la última pasaría de las 22:00 se juntan (no
  menos de 30 min). Cada una es una publicación DISTINTA con la misma regla de siempre; si no hay bastantes, pone las que
  hay y la nota dice cuántas faltaron. Cambiar «cuántas al día» no reinicia `ultima_fecha` (pondría otra tanda hoy).

- **El video animado: un guion de ESCENAS en JSON, anclado a PALABRAS** (`src/lib/videoEscenas.js`, `videos_proyectos`,
  0059; el formato con su ejemplo, en `docs/formato-escenas-v1.md`). Fase 1: formato, validador y tabla; el motor de
  Canvas 2D, la voz (ElevenLabs v3 por KIE, v2 de respaldo) y la pantalla vienen después. Cosas que no se ven:
  · **El habla de todas las escenas, en orden, ES la locución** (una toma). La escena empieza en su primera palabra y una
  capa entra «en la palabra n» de su escena: cambiar de voz vuelve a cuadrar todo. `palabrasDe` cuenta las palabras igual
  que la alineación (sin las `[emociones]` de v3 ni los signos sueltos); si los tiempos de la toma no cuadran con esa
  cuenta, `lineaDeTiempo` estima (2,5 palabras/s) y lo dice (`estimado`).
  · **Una `pausa` es un silencio que el render INSERTA en el audio** (`silencios`, en tiempo del audio): con una sola
  toma, una escena muda no existe de otra forma. Una escena de menos de `MIN_ESCENA` también se alarga con silencio.
  · **`validarGuion` no arregla en silencio**: un texto largo, un color que no es token ni #RRGGBB o una palabra que la
  escena no dice son errores con `donde`; lo que no es del formato se quita con aviso. Un test valida el ejemplo del
  documento: si cambia el formato y no el documento, falla.
  · **El CHECK de `estado` es `ESTADOS_VIDEO`, con los de la fase 2 ya dentro** (cambiar un CHECK es reconstruir la
  tabla). La locución sólo se genera con `version` = `aprobada_version` (`puedeGenerarVoz`): editar después de aprobar
  vuelve a borrador.
  · **`videos_proyectos` señala la publicación por «calendario + publicación»**, así que viaja con ella al moverla de mes
  (`trasladarPublicacion`, ya son siete tablas).
  · **El MOTOR es uno para la vista previa y el render** (`src/lib/motorVideo.js`, paso 2). No crea lienzos, no carga
  nada y no lee la hora: lo de cada entorno entra por `recursos` (imágenes ya cargadas, logo, textura del grano) y
  `fuentes` (familias ya registradas); en el navegador lo prepara `motorVideoNavegador.js`. Es DETERMINISTA —lo
  aleatorio sale de `semilla`, y el grano cambia por FOTOGRAMA, no por reloj— y dibuja en las medidas del formato (1080
  × 1920): quien llama escala el contexto. Un test con un lienzo de mentira lo vigila, y otro busca `document.`,
  `Math.random` o `Date` en el archivo: con ellos el render del Container no daría lo mismo que la pantalla. Lo que aún
  no dibuja (teléfono, burbuja, personaje, icono, cifra, lista, reloj, antes y después: paso 7) sale como MARCADOR con
  su nombre (`COMPONENTES_LISTOS`), así un guion válido nunca rompe la vista previa.
  · **La paleta sale del KIT por PUNTAJE, no por la primera palabra que case** (`paletaDelKit`, `PISTAS`). La primera
  versión buscaba «texto» en el papel y, con el kit REAL de Baby Caleb, el texto salía BEIGE («Fondo principal alterno —
  base limpia para texto») y el acento SAGE («acento natural suave» le ganaba a «…CTA»). Ahora lo que el papel dice
  antes de la primera raya o barra pesa el triple, un CTA gana a un «acento» a secas y el texto TIENE que leerse sobre
  el fondo (4,5 a 1). Un test lleva los 7 papeles reales tal cual. Lo que fija el guion manda encima (`paletaDelGuion`),
  y un texto sobre su placa que no llegue a 3 a 1 usa el claro u oscuro que más contraste (`colorLegible`).
  · **El MOTOR reparte por zonas; el guion no pone coordenadas** (`repartirEscena`, `areaSegura`, `bandaDeSubtitulos`).
  Con puntos fijos por nombre, la placa del texto tapaba la foto del producto y el tercio de abajo quedaba vacío. La
  zona de una capa dice su ORDEN; el motor la mide con el MISMO código que la dibuja (`medirCapa` pasa `dibujarCapa`
  por un lienzo que sólo mide: no pueden discrepar) y reparte el alto del área segura (9:16: 12 % arriba y 20 % abajo
  libres) menos la franja de subtítulos. Una `forma` va detrás de la capa que la sigue; dos que no se ven a la vez
  comparten sitio; en 16:9 (el LIENZO, no la caja: en 1:1 la caja sin subtítulos es más ancha que alta) lo visual va en
  su columna. `cajasDeEscena` da las cajas para los tests, que exigen sin encimarse, dentro del área y usando el tercio
  de abajo en los tres formatos. En la primera escena algo entra antes de 0,3 s (`tiemposDeEscena`). La vista previa
  tiene «Zonas seguras» (lo pinta ENCIMA, no va en el video). Medido en Chromium (sin GPU): ~5,5 ms por fotograma a
  1080 × 1920.
  · **Lo que ve primero quien abre el video, y cómo se leen las placas** (ajustes del paso 2). En el gancho entra
  PRIMERO su texto principal (`textoPrincipal`, `tiemposDeEscena`: lo demás, `DESPUES_DEL_GANCHO` después): entraba el
  marcador del personaje y el titular a los dos segundos. Una escena sin texto, sello ni llamado dibuja su `pantalla`
  como titular (`capasDe`): la del problema enseñaba sólo un icono y una lista. Las líneas se reparten parejas y cortan
  en «·», comas y puntos (`partirEquilibrado`, recargo por cortar fuera de un separador): «Sin alcohol · sin / perfume»
  cortaba mal. Las imágenes se cargan SIN su borde transparente (`cajaOpaca` en el motor, puro; el recorte lo hace
  `motorVideoNavegador.js` y lo hará el gemelo del Container) y el logo del cierre mide al menos `MIN_LOGO_CIERRE` (la
  mitad del lado corto): un logo con mucho aire se veía diminuto.
  · **El guion se valida también en el SERVIDOR** (`worker/rutas/videos.js`): lo que llega del navegador o de Claude no
  se cree, y con errores no se guarda (400 con cada error y su sitio). Guardar y aprobar llevan la `version` que se
  leyó: si otra persona guardó entremedias, 409 (`actualizar` con la versión como condición). Aprobar fija
  `aprobada_version`. Evento `videos` → `window`.
  · **La pantalla vive DENTRO de FlujoReel** («Video» → «Guiado» → «Animado con código»), en su chunk: el del Estudio
  está en su tope. `rendimiento.bundle.test.js` le pone 25 kB y prohíbe Remotion, Lottie y PixiJS: una librería del
  navegador aquí rompería el render, no sólo el peso. La vista previa es GRATIS: tiempos estimados hasta que haya voz,
  sin sonido ni subtítulos todavía (pasos 3 y 4).
  · **La voz (paso 3) es un TRABAJO del Estudio de `tipo: "audio"`** (`worker/lib/estudio/locucion.js`, `src/lib/voces.js`;
  rutas `/api/videos/<c>/voces`, `…/voces/muestra` y `…/<id>/locucion`; herramientas `listar_voces`, `previsualizar_voz` y
  `generar_locucion` para el asistente y el MCP). Va por la MISMA cola de Kie que un video (createTask → recordInfo →
  bajar), la avanza la bomba y se cobra al entregarla. `estudio_trabajos.tipo` no tiene CHECK: no hizo falta migración.
  Cosas que no se ven:
  · **SIEMPRE se confirma** (decisión de la agencia), aunque cueste centavos: la locución y la muestra contestan 409
  `confirmar` con el costo y los créditos hasta `confirmado: true` (el booleano). En el asistente vuelve como texto «NO SE
  CREÓ NADA…» con la cifra, como `crear_en_estudio`. Un segundo pedido mientras va el primero: 409 `en_curso`.
  · **Sólo del guion aprobado** (`puedeGenerarVoz`) y con la versión aprobada en el trabajo: si el guion cambia mientras
  se genera, la toma se guarda con `desfasada` y el video NO pasa a «Con voz».
  · **Los tiempos, en tres capas** (`tiemposDeLocucion`): los que traiga Kie (`palabrasDelResultado` lee listas de
  palabras y la alineación POR CARÁCTER de ElevenLabs; v2 se pide con `timestamps: true`); si no trae, Gemini OYE la toma
  y la transcribe con tiempos (`verVideo` acepta audio; se ALINEA con el guion por distancia de edición, y por debajo del
  85 % de coincidencia queda `revisar`); si no, se estiman sobre la duración REAL del MP3 (`duracionMp3`). Siempre UNA
  por palabra de `palabrasDe(textoDeLocucion(guion))`: con eso `lineaDeTiempo` deja de estimar.
  · **La muestra de una voz se paga UNA vez para toda la agencia** (`voces/elevenlabs/<v3|v2>/<id>.mp3`, fuera de
  `clientes/`): la segunda vez sale gratis y `listar_voces` dice cuáles ya están hechas.
  · **La muestra puede decir un texto PROPIO** (`texto`, hasta `MAX_TEXTO_MUESTRA` 500; `textoDeMuestra`): queda aparte de la
  frase fija con la huella del texto (`…/<voz>-<huella>.mp3`, `huellaDeMuestra`; el GET la pide con `huella`), y el mismo
  texto otra vez sale gratis. Toda toma —muestra y locución— apunta en la nota del trabajo si Kie devolvió el tiempo de cada
  palabra (`tiemposQueLlegaron`) y en `ajustes.tiempos` y `ajustes.crudo` (un extracto de lo que contestó Kie): es como se
  sabe la forma real de su respuesta sin adivinarla. «Probar una voz» (`ProbarVoz.jsx`, lazy, en «Animado con código»)
  escoge voz, modelo y texto, enseña el costo (el 409) y sólo con «Generar» la paga; luego la nota y el audio.
  · **El audio va a `estudio_archivos` con tipo «audio»** y la galería NO lo enseña (`leerGaleria`). `tipoPorBytes`
  reconoce MP3 (ID3 o cuadro) y WAV. La voz de la marca vive en `kit.locucion` (voz, modelo, hasta 12 voces propias por
  su id de ElevenLabs) y `fundirKit` la conserva.
  · **Kie sólo acepta las voces de SU lista** (66, por su id de ElevenLabs; `VOCES_DE_SERIE` lleva las comprobadas en su
  formulario). La primera prueba real con Matilda —de serie en ElevenLabs— volvió «Invalid voice parameter». La voz va por
  el ID en v3 y en v2 (`vozParaKie`); v3 lleva `language_code: "es"` (con «auto», una voz de acento inglés lee el español
  como extranjera) y v2 no (según Kie, sólo Turbo y Flash lo admiten). Una voz propia del kit tiene que estar en esa lista.
  · **Con la llave oficial (`ELEVENLABS_API_KEY`) la voz sale DIRECTO por ElevenLabs y Kie queda de respaldo**
  (`viaDeVoz` en locucion.js, worker/lib/estudio/elevenlabs.js): Kie dejó las tomas de v3 en espera hasta cortarlas («The
  upstream API service timed out»). La vía la decide el servidor por sus llaves y queda en el trabajo (`motor: "elevenlabs"`,
  `modelo: "elevenlabs-v3"`; por Kie, `elevenlabs-v3-kie`). Cosas que no se ven:
  · **ElevenLabs contesta en el acto, pero va por el contrato de COLA** para no tocar la cola: `enviar` genera la toma
  (`/v1/text-to-speech/<voz>/with-timestamps`) y la deja en R2 bajo `voces/pendientes/` (fuera de `clientes/`) con su
  alineación por carácter; `sondear` la entrega y `terminarAudio` la guarda (de los bytes, sin bajarla) y borra lo pendiente.
  · **Las voces son las de la CUENTA** (`/v1/voices`, `vozDeLaCuenta`): también las de la biblioteca añadidas a «My Voices».
  Si la llave no deja leerlas, las de serie (`VOCES_ELEVENLABS`). Oír una muestra hecha sólo pide un id con forma de
  ElevenLabs (`esIdDeVoz`): preguntar la lista en cada audio sería una llamada más.
  · **El costo es un crédito de ElevenLabs por carácter**, en dólares aproximado con el plan Creator
  (`USD_POR_CARACTER_ELEVENLABS`), y la confirmación lo dice. Sigue confirmándose SIEMPRE.
  · **Lo que no se puede comprobar sin gastar se pide con tolerancia** (`generarToma`): si rechaza `language_code: "es"` en
  v3, otra vez sin él; si rechaza los tiempos, el audio solo (los tiempos los pone la verificación o la estimación). Un
  rechazo no cobra. Sin créditos ElevenLabs contesta 401 `quota_exceeded`: se mira antes que la llave.
  · **Nada de ElevenLabs directo se ha probado contra el servicio real**: los tests hablan con un `fetch` de mentira.
  (Las primeras muestras reales de v3 con la llave oficial sí salieron, con el tiempo de cada palabra.)
  · **Eleven v4 (`eleven_v4`) es el modelo de partida, SÓLO por la vía directa** (`MODELOS_VOZ.v4`, `kie: null`). Si la
  cuenta lo tiene lo dice `/v1/models` (gratis, `modelosDeLaCuenta`, recordado 10 min por instancia; también da el
  factor de costo por carácter, `character_cost_multiplier`, que entra en la confirmación). `modeloParaVia` lo baja a v3
  por Kie o si la cuenta no lo tiene; si `/v1/models` no contesta, se intenta (un rechazo no cobra). Lleva
  `language_code: "es"` como v3, con el mismo reintento sin él. Su id salió de la documentación (octubre de 2026): la
  primera muestra real lo confirma.
  · **Las voces, en ESPAÑOL** (`vozDeLaCuenta`): ElevenLabs las describe en inglés («Roger - Laid-Back, Casual»); se quita
  el lema del nombre y se traduce con un diccionario (`TRADUCCION`, frases antes que palabras). Lo que no está en él se
  QUITA —salvo en una voz nativa en español, cuya descripción ya viene en español—: así no sale una mezcla de idiomas.
  Si una voz nueva sale sin nota, falta su palabra en el diccionario. Nativa = etiqueta de idioma «es», o que su ÚNICO
  idioma verificado sea el español (las de serie traen varios). Van primero (`enEspanolPrimero`).
  · **La biblioteca en español** (`/api/videos/<c>/voces/biblioteca`, `buscarEnBiblioteca`): `/v1/shared-voices` con
  `language=es` e `include_custom_rates=false` (una voz con tarifa propia costaría más de lo que dice la confirmación).
  «Añadir a mis voces» (`/v1/voices/add/<publico>/<voz>`) ocupa un hueco de la cuenta: sólo admin. Desde entonces sale en
  `/v1/voices` sola. Buscar, escuchar y añadir son gratis.
  · **«Escuchar gratis»** es la `preview_url` que publica ElevenLabs, servida por el Worker (`previaGratis`: la CSP no deja
  oír audio de otro origen) y sólo de `storage.googleapis.com` / `elevenlabs.io` por https (`previaDeVoz`), sin la llave.
  Las de serie suelen estar en inglés: para oírlas en español, la muestra pagada de siempre.
  · **La voz de la marca se fija desde «Probar una voz»** (`PUT …/voces/marca`, `fijarVozDeMarca`): sobre el kit GUARDADO,
  sólo `kit.locucion` (voz y modelo). No confundir con `kit.voz`, la voz de Google de los reels de Omni (VozDeMarca.jsx).
  · **Una voz que Kie deja «en espera» se da por fallida a los 12 minutos** (`PLAZO_AUDIO_MS`; el resto de trabajos, 30):
  la primera prueba real de v3 se quedó en `waiting` (en su panel, `running` y cobrada) y la pantalla cargaba media hora.
  El error dice en qué estado se quedó. Un 408 (sin resultado en 10 min) o un 501 (falló la generación) de Kie, en
  cualquier modelo, terminan el trabajo con su motivo y ya no se reintentan (`errorDeKie`).
  · **Claude trabaja el video por MCP** (`worker/lib/estudio/herramientasVideo.js`, también en el asistente):
  `formato_video`, `listar_videos`, `ver_video`, `crear_video` (con `publicacion_id`), `guardar_video`, `editar_escena`
  (cambia, mueve, añade o quita una escena; con `id` + `cambiar`, sólo unos campos sin mandarla entera; con `cambios`,
  hasta 20 en UNA versión, en orden y todos o ninguno: el error dice «Cambio n») y `aprobar_video`. Van por `worker/lib/videosProyectos.js`, el MISMO camino
  que la pantalla: el guion se valida en el servidor, la `version` leída evita pisar, editar devuelve a borrador.
  Aprobar es de la persona: la descripción le dice a Claude que sólo con su sí. Con eso `generar_locucion` ya tiene un
  video aprobado que nombrar. Ninguna gasta.
  · **«Ver un cuadro» es el CONTAINER, no el Worker** (el Worker no tiene lienzo; `container/`, `worker/contenedor.js`,
  `worker/lib/estudio/cuadros.js`). Dibuja con el MISMO motor (la imagen copia `src/lib` desde la raíz, así no se queda
  atrás de la vista previa) y lo que no se puede leer desde dentro —imágenes de la galería, logo, letra del kit— va en el
  pedido, leído de R2 y sólo de ESE cliente. Herramientas `ver_cuadro` (una escena ya «llena» o un segundo), `ver_escenas`
  (una hoja con todas) y `revisar_video` (`revisarEscenas`, con las fuentes reales); devuelven `{ texto, imagenes }` y el
  MCP y el asistente las pasan como bloques de imagen. Rutas GET `/api/videos/<c>/<id>/cuadro|hoja|revision`. La misma
  revisión sale GRATIS debajo de la vista previa (navegador). Cosas que no se ven:
  · **Sin `@cloudflare/containers`**: importa `cloudflare:workers` y las pruebas cargan el Worker en Node. Se usa la API
  nativa (`ctx.container.start`, `getTcpPort`, `setInactivityTimeout`); el cuerpo se pasa como bytes (como flujo pide
  `duplex` fuera de Workers).
  · **En local no hay Container** (`dev.enable_containers: false`): `wrangler dev` y `test:vivo` no necesitan Docker, y
  la ruta contesta 503 diciéndolo. La imagen se prueba de verdad en CI (job «contenedor») y en «Desplegar» ANTES de
  publicar: se construye, se arranca y `container/probar.mjs` le pide un cuadro, la hoja y la revisión.
  · **La imagen no usa Docker Hub**: la base sale del espejo oficial en ECR (Docker Hub limita las descargas anónimas),
  la letra de respaldo (Roboto, la que nombra `FUENTE_RESPALDO`) llega por npm y se registra al arrancar, y ffmpeg sale
  de los repositorios de DEBIAN (`apt`, sin los recomendados): un binario suelto de npm o de GitHub sería de un tercero.
  · **`basic` (¼ vCPU, 1 GiB) y se duerme a los 2 min**: la memoria se paga despierta, la CPU sólo al dibujar; una
  sesión de cuadros son ~120 GiB-s, unas 750 al mes dentro de lo que trae Workers Paid.
  · **`wrangler deploy` publica el Worker ANTES de subir la imagen**: sin el permiso `Containers: Edit` en el token, el
  Worker queda publicado y sólo el cuadro falla (503). Migraciones de Durable Objects `v2` (`ContenedorVideo`) y `v3`
  (`RenderVideo`), no de D1.
  · **El RENDER a mp4 es OTRO Container, con la misma imagen** (`RenderVideo` en worker/contenedor.js, binding `RENDER`,
  a medida: 2 vCPU, 6 GiB —el mínimo de memoria para 2 vCPU—, 6 GB; se duerme a los 30 s). Uno por video
  (`idFromName(<id>)`). `POST /api/videos/<c>/<id>/render` (y `renderizar_video` para Claude y el asistente) sólo con
  el guion aprobado y SU locución (`puedeRenderizar`, src/lib/renderVideo.js); deja el video «Renderizando» con un
  `intento` y el objeto contesta ya: lo hace en su ALARMA (hasta 15 min, sigue aunque se cierre la pantalla), con
  `ejecutarRender` (worker/lib/estudio/render.js). Cosas que no se ven:
  · **En el Container** (container/render.mjs): primero el AUDIO —la toma DECODIFICADA sola a PCM estéreo de 48 kHz
  (una cadena simple), cortada en el segundo del AUDIO de cada silencio de las escenas, con silencio metido y rellenada
  hasta el último cuadro COPIANDO MUESTRAS en JS (`tramosDeAudio`, `armarPcm`); loudnorm sólo MIDE (`FILTRO_MEDIR`), la
  segunda pasada es una GANANCIA fija con un limitador a -2 dB si el pico se pasaría (`gananciaDe`, `filtroDeNormalizar`)
  y una tercera mide lo que quedó; y a AAC—. **Nunca la segunda pasada de loudnorm (`measured_*`):** cuando no puede ir
  en lineal pasa a su modo dinámico, y el ffmpeg 5.1 de la imagen muere ahí con «Error reinitializing filters! | Failed
  to inject frame into filter network: Invalid argument». Una voz de verdad (picos altos) casi nunca va en lineal; el tono
  de la prueba de humo y Feria, sí: por eso pasaban. El ffmpeg 6.1 de Ubuntu no falla: en local todo pasaba.
  `container/probarAudio.mjs` lo prueba DENTRO de la imagen (CI y «Desplegar»): MP3 mono a 44,1 kHz con y sin pausas,
  una después del final del archivo, una voz con picos (limitador) y una toma que cambia de muestreo; mira el volumen,
  el pico y que el silencio caiga en su sitio; luego cada cuadro con el MISMO
  `dibujarFrame` y sus píxeles EN CRUDO por una tubería a ffmpeg (H.264 crf 20, BT.709 dicho en el archivo,
  `+faststart`). Mandar cada cuadro como JPEG costaba un 40 % más de CPU: codificar un JPEG de 1080 × 1920 con grano
  (30 ms) es más caro que dibujar el cuadro (1,3 ms). Medido aquí con la toma de Feria del Lente (31,8 s): 20 s de
  reloj, el silencio de 0,8 s exacto en 3,04 s y -14,0 LUFS medido aparte con ebur128.
  · **El costo**: un video de ~30 s despierta el Container ~1 min y usa ~50 vCPU-s: unos 360 GiB-s de memoria. Lo
  incluido en Workers Paid (25 GiB-h, 375 vCPU-min) da para ~200 renders al mes; pasado eso, ~0,3 céntimos de dólar por
  video (precios de la documentación de Cloudflare, octubre de 2026). No gasta IA: no pide confirmación de costo.
  · **El encargo se BORRA antes de empezar**: si el objeto muere a la mitad, la alarma no repite el render; el video se
  queda «Renderizando» y al leerlo pasado `PLAZO_RENDER_MS` (15 min) pasa a «Falló el render» (`renderAlDia`). Un
  encargo con otro `intento` no toca nada: el proyecto ya espera otro.
  · **El mp4 va a R2, a la galería** (`estudio_archivos`, tipo «video», modelo `video-animado` «Animado con código»,
  costo 0) **y a su PUBLICACIÓN** si el video va ligado a una: primero en sus medios, o en el sitio del render anterior
  de ESTE video (`videoAnimado` en el medio), con `mediosCambiadosAt` y `usado_en`. El calendario se escribe con su
  `updated_at` como condición (si otra persona guardaba a la vez, se relee una vez; si no, queda en la galería y se
  dice) y luego `resincronizarCalendario` + `calendario:recargar`, como el MCP. Una publicación ya PUBLICADA no se toca.
  · **La voz se manda dentro del pedido** (base64, ≤ 20 MB): el Container no tiene llaves ni internet.
  · **A qué publicación va se escoge cuando se quiera** (`ligarAPublicacion` en render.js; `POST
  /api/videos/<c>/<id>/publicacion`, `ligar_video` y `publicacion_id` en `renderizar_video`; «Va en la publicación» del
  panel del mp4, con `publicacionesParaVideo`: desde una semana atrás, primero reels e historias). Antes sólo se ligaba al
  CREAR el video y sólo Claude podía. Con el mp4 ya hecho se pone en el post al momento, sin otro render (y apunta su
  `usado_en`); sin mp4, al terminar. Desligar NO saca el mp4 del post de antes. No se cambia mientras renderiza (409).
  · **Lo probado**: el render de verdad en este equipo con el ffmpeg del sistema (Ubuntu 6.1) y en CI con la imagen
  (ffmpeg de Debian 5.1, `probar.mjs` pide un render con una voz sintética y exige el mp4, sus dos pistas, los cuadros y
  -14 LUFS ±1). El Durable Object y la alarma, con dobles: el primer render en Cloudflare es la prueba de verdad.
  · **El render acepta VIDEO: la capa `video`** (un clip de la galería del cliente: lo que grabó, uno de Kie, uno de
  Drive). `encuadre` «completo» lo pone a sangre detrás de todo (fuera del reparto, con `oscurecer`, un velo para leer
  el texto; en el gancho NO se retrasa: es el fondo del primer cuadro) y «caja», en su zona como una imagen (con la
  forma del clip, de `recursos.videoInfo`). Empieza en su `desde` al entrar la capa y va a velocidad normal
  (`segundoDelClip`); con `hasta`, la escena dura al menos ese tramo (`duracionMinimaDeEscena`: lo que falte se inserta
  como silencio, igual que una `pausa`), así una escena SIN habla dura lo que su clip. Un guion sin habla en ninguna
  escena (`tieneHabla`) no necesita locución (`puedeRenderizar` → `sinVoz`): un montaje de lo que grabó el cliente sale
  sin pagar voz, con el sonido de sus clips (`sonido`, `volumen`; la música baja también cuando habla un clip). Receta
  «Montar el video que grabó el cliente». Cosas que no se ven:
  · **El clip NO va en el pedido JSON**: pesa decenas de MB y el Worker (y el Durable Object) tiene 128. Se SUBE antes al
  Container por flujo desde R2 (`subirClips` en cuadros.js: `HEAD /clip/<id>` y, si no está, `PUT` con el cuerpo de R2 y
  `duplex: "half"`), y el pedido sólo lo nombra (`videos`). El Container lo guarda en disco con su medida de ffprobe
  (container/clips.mjs; hasta 2 GB, borra lo menos usado) y lo reutiliza mientras está despierto. `ContenedorVideo`
  pasa el PUT tal cual (flujo); lo demás, como bytes. Un clip que no sube sale con el «Video» de espera y se dice.
  · **El motor no espera nada**: pide el cuadro con `recursos.video({ id: escena/capa, archivo }, segundo)`. Quien dibuja
  lo pone ANTES: el render con un `Decodificador` por USO (ffmpeg saca los cuadros RGBA seguidos a 30 fps y se leen a
  medida que se piden, nunca el clip entero en memoria; se cierra cuando el uso deja de verse), /cuadro y /hoja con un
  ffmpeg por cuadro (`cuadrosParaUnInstante`). Qué pide cada instante lo dice `videosEnInstante` (la MISMA cuenta que el
  motor, también la escena anterior durante la transición, quieta en su último cuadro).
  · **Se decodifica a su medida, no a la del lienzo** (`medidaDeDecodificar`: sin pasar de 1920 de lado ni agrandar), y
  un clip grabado de lado se mide GIRADO (`leerSonda`: la rotación de ffprobe; ffmpeg lo endereza al decodificar).
  · **En la vista previa es un `<video>`** (`proveedorDeVideos` en motorVideoNavegador.js): mientras se reproduce corre
  solo y sólo se corrige un desfase de más de 0,35 s; al mover la barra se busca el cuadro y `alCambiar` repinta al
  llegar. Suena si su capa lleva `sonido` (si el navegador no deja sin un toque, sigue mudo). Su `width`/`height` se
  igualan a lo que mide el clip: en un `<video>` son los atributos (0) y el motor mide con ellos.
  · Medido aquí: un clip a sangre cuesta ~50 ms por cuadro (escalar a 1080 × 1920 en Skia), ~1,5 s de render por
  segundo de video. `container/probarClips.mjs` lo prueba DENTRO de la imagen (CI y «Desplegar»): sube un clip y uno
  girado, mira los colores del cuadro y renderiza un montaje sin voz con el sonido del clip en -14 LUFS. Los
  subtítulos de lo que dice la persona del clip NO salen solos (necesitarían transcribir el clip con tiempos): queda
  pendiente.
  · **Los subtítulos los dibuja el MOTOR** (`dibujarSubtitulos` en motorVideo.js; los grupos y la clave, en
  `src/lib/subtitulos.js`), así salen iguales en la vista previa, en `ver_cuadro` y en el render. Van con los tiempos de
  la línea de tiempo, que ya son del VIDEO (con los silencios insertados): en un silencio no se ve ninguno (el último se
  apaga a los `COLA_GRUPO` segundos). Un grupo nunca cruza una coma ni un punto: «de Panamá y La | Chorrera» salía
  cortando por letras. Borde oscuro y el claro de la paleta, para leerse sobre cualquier fondo.
  · **La voz suena en la vista previa** (VideoAnimado, `tramoDeAudio` en videoEscenas.js): mientras se habla manda el
  reloj del AUDIO (si se atasca cargando, la animación lo espera); en un silencio insertado el audio se calla y manda el
  del navegador. Así suena como sonará el mp4. Sólo con la locución de ESTE guion (si sus tiempos no cuadran, la línea
  es estimada y no suena). El audio arranca dentro del toque de «Reproducir»: Safari en el iPhone no deja sonar lo que
  no empieza con un gesto. Probado en Chromium con un audio de la duración real; en un iPhone, no.
  · **La voz puede comerse el final** (`palabrasMudas`): ElevenLabs v3 cortó «tu cita por WhatsApp» en Feria del Lente y
  la alineación dejó esas palabras sin duración, pegadas al último instante. La vista previa y `ver_video` lo dicen con
  las palabras: no se pueden subtitular ni se arreglan solas (otra toma, o acortar el cierre).
  · **Sólo se aprueba un BORRADOR** (`aprobarProyecto`, y el botón): «aprobar» otra vez un video con locución lo
  devolvía a «Guion aprobado» y parecía sin voz. Uno que quedó así con la voz de su versión no la pide otra vez
  (`siguientePaso`).
  · **Las piezas del paso 3** (`src/lib/motorPiezas.js`, puro: lo comparten la vista previa y el Container): la CIFRA
  gigante (cuenta hasta su valor en `DURACION_CUENTA`, con el ancho del valor final para no bailar; coma decimal y punto
  de miles), el ANILLO (un porcentaje que se llena), 22 ICONOS dibujados con primitivas (un test exige uno por cada
  nombre de `ICONOS_VIDEO`; con `fondo`, en un círculo) y el DIBUJO, el lienzo libre: hasta 24 formas en fracciones de su
  caja, cada una con su `retraso` y su `entrada` (`dibuja` traza las líneas; lo relleno se descubre con un recorte puesto
  ANTES de trazarlo, o rellenaría el recorte). Fondos `estrellas` (titilan con t) y `lineas`, sembrados. Sin `Path2D`:
  no existe en el Container.
  · **El PERSONAJE se dibuja de verdad** (`src/lib/personajeVideo.js`, decisión de la agencia: el bebé de Baby Caleb en
  todos sus videos): una figura plana de la casa —bebé, niño o adulto— con 5 expresiones (`expresion`: neutral, feliz,
  triste, preocupado, dormido; «auto» la saca de la pose) y 6 poses, animada con `vida` (parpadeo, la lágrima, las «Z»,
  el saludo). El ASPECTO (piel, pelo, ropa —un token de la marca o #RRGGBB—, accesorio: chupete, lazo, gorro) es del
  CLIENTE: `kit.personajeVideo`, que fija `personaje_video` (asistente y MCP) y que `conPersonajeDelKit` pone en el guion
  en la vista previa y en el servidor (`pedidoDelVideo`) si el guion no trae su `estilo.personaje`. `fundirKit` lo
  conserva. Sólo arc, bezier y líneas: ni Path2D ni ellipse (el lienzo del Container no los garantiza). El kit de
  Baby Caleb aún no lo tiene: sale con el aspecto de partida hasta que alguien lo fije.
  · **El logo se recorta de su fondo liso** (`quitarFondoLiso`): si las cuatro esquinas son opacas y del mismo color,
  ese color se borra DESDE EL BORDE (el blanco dentro de una «O» se queda), sólo si es entre el 5 y el 97 % de la
  imagen. Y lleva PLACA (clara sobre oscuro, oscura sobre claro) cuando más del 20 % de lo que se ve de él no llega a 2 a
  1 con el fondo de la escena (`logoNecesitaPlaca` sobre los cuantiles de su luz, `tonoDeImagen`): con la media, un logo
  rojo con letras azul marino «contrastaba» con un fondo azul y las letras desaparecían. Lo prepara quien carga
  (`prepararLogo` en el navegador, `cargarLogo` en el Container): el motor sólo lee `recursos.logoTono`.
  · **El reparto llena el cuadro** (el video de Feria salía con el texto pequeño y media pantalla vacía): los textos
  piden un ancho mínimo de su columna (`ANCHO_TEXTO`) y, si la escena ocupa menos del `LLENADO` (68 %) de su alto,
  todo crece hasta `CRECER_MAX` (×1,35) sin pasar del ancho. Los tamaños por rol subieron (titular 0,105 del lado).
  · **1:1 y 16:9 crecen más que 9:16** (`CRECER_POR_FORMATO`: 1,35 · 1,55 · 1,8): con el mismo lado corto hay sitio
  alrededor, y el contenido se quedaba pequeño en medio. En 16:9 van en DOS columnas no sólo la imagen o el personaje,
  también el icono, el anillo, el dibujo, la lista, el reloj y el logo (`IZQUIERDA_APAISADO`; el texto, a la derecha y
  un poco más ancha), lo visual llega al 82 % del alto (`altoUtil`) y una columna sola no pasa del 68 % del ancho
  (`ANCHO_COLUMNA_APAISADO`): a todo el ancho, un titular salía en una línea larguísima y pequeña.
  · **La revisión también mira el DISEÑO** en el instante «lleno» de cada escena (que espera a que una cifra o un anillo
  terminen de contar): `texto_pequeno` (menos del 3,5 % del lado, ~38 px), `espacio_vacio` (lo que se ve ocupa menos
  del 12 % del cuadro, o cabe en una franja de menos del 35 % del alto) y `desequilibrio` (el centro de lo que OCUPA la
  escena —no pesado por área: un titular ancho abajo y una cifra arriba no están «abajo»— se va más del 15 % del alto o
  del 12 % del ancho). Son avisos, no graves.
  · **El SONIDO va aparte del guion** (`videos_proyectos.sonido`, 0060; `src/lib/sonidoVideo.js`, `efectosSonido.js`,
  `VideoSonido.jsx`; `PUT /api/videos/<c>/<id>/sonido`, herramientas `sonido_video` y `musicas`): cambiarlo NO sube la
  versión ni devuelve a borrador, así que no obliga a pagar otra voz; se oye al volver a renderizar (gratis). Los EFECTOS
  (encendidos por defecto) son un whoosh en cada transición que no es un corte y un pop al entrar un sello o un llamado,
  SINTETIZADOS (ruido filtrado con semilla, un tono que cae: sin archivos ni licencias) y mezclados 12 dB por debajo del
  nivel de la voz. La MÚSICA es un audio de la galería del cliente (`subirArchivo(…, { musica: true })`, tipo «audio»,
  modelo `musica-subida`; las locuciones también son audio y no salen en `musicasDe`): se mezcla en JS por debajo de la
  voz con DUCKING (9 dB bajo la voz en los huecos, 20 mientras se habla; baja en 80 ms y sube en 450), fundido de 0,4 s al
  entrar y 2 s al salir, repetida si es corta, ±12 dB a mano. Todo antes de la ganancia, así guarda su distancia con la voz
  sea cual sea la toma. Una música que ya no está no tumba el render: sale sin ella y lo dice en `render.aviso`.
  · **La música con SUNO por Kie** (`src/lib/musica.js`, `worker/lib/estudio/musica.js`, `docs/kie/suno.md`;
  `POST /api/videos/<c>/musicas/generar`, herramienta `generar_musica`, «Generar la música con IA (Suno)» en «Sonido»):
  un trabajo del Estudio de `tipo: "audio"` por la MISMA cola de Kie que la voz (`MODELOS_MUSICA_KIE` en kie.js,
  `terminarMusica` en trabajos.js). Siempre MODO PERSONALIZADO (es el único que admite `duration` y `title`): la
  descripción va en `style`, la letra en `lyrics` y NUNCA en `prompt` (se cantaría tal cual); una instrumental lleva las
  voces en `negative_tags`. Suno da DOS versiones: las dos van a la galería (`modelo: "musica-suno"`) y, con `videoId`,
  la primera queda en el SONIDO del video (sin subir la versión; no pisa otra música escogida DESPUÉS del pedido ni a un
  video renderizando). Con video, la duración es la del video y el estilo lo escribe el director musical (abajo).
  **El precio no viene en la documentación**: se cotiza `CREDITOS_SUNO` como aproximado y al entregar se apunta
  `creditsConsumed` si llega. Se confirma SIEMPRE (409 `confirmar`), como la voz. El render usa además la música del
  GUION por su clave si «Sonido» no tiene otra (`dbDeVolumenGuion`). **Nada de Suno se ha probado contra Kie real.**
  · **La música la pide el DIRECTOR MUSICAL, no el `guion.musica.estilo`** (decisión de la agencia: con la voz los videos
  quedaban perfectos y la música no casaba; `src/lib/directorMusical.js`, `worker/lib/estudio/directorMusical.js`;
  `POST /api/videos/<c>/<id>/musica`, «Proponer la música para este video» en «Sonido»). Ese estilo lo escribía la IA
  del guion en una línea («corporativa alegre») sin saber nada del video. Ahora una IA de texto (función «director
  musical», hueco «guiones»; barata, sin confirmación) LEE el guion GUARDADO con su línea de tiempo —la de la locución
  si está lista; si no, estimada y lo dice—, la ficha del cliente, el cerebro para escribir, el kit y el tipo de
  contenido de su publicación, y escribe el pedido para Suno. Cosas que no se ven:
  · **Lo que se puede contar lo cuenta el CÓDIGO** (`analisisDelVideo`): segundos por escena, cortes por minuto, el BPM
  que casa con los cortes (`bpmPorCortes`: un compás de cuatro tiempos por escena llevado por octavas al rango del
  `estilo.ritmo` del guion), los silencios (lo que queda de cada escena tras su última palabra) y dónde entran el
  gancho, el beneficio y el llamado. La IA recibe eso y escoge género y subgénero, instrumentos y cómo sube la energía.
  · **La MÚSICA DE LA MARCA manda** (`kit.musica`: { estilo, evitar, referencias }; `limpiarMusicaDeMarca` en kitMarca.js,
  `fundirKit` la conserva; se edita en Marca → Kit y voz, `MusicaDeMarca.jsx`). «Me gusta: que sea la música de la
  marca» en «Sonido» (`POST /api/videos/<c>/musicas/marca`, sobre el kit GUARDADO) pasa una música GENERADA a sus
  referencias con lo que se le mandó a Suno (`ajustes.pedido.estilo`; `musicasDe` lo devuelve como `estilo`); una subida a
  mano no lo sabe: 409. Como mucho tres, la más nueva primero; la siguiente propuesta las lee.
  · **El estilo va en INGLÉS y siempre con su BPM** (`leerPropuestaMusical`): se le quitan los artistas («in the style
  of…», «like» + nombre propio: Suno los rechaza y sería copiar) y las voces del «evitar» (lo de la marca va primero).
  `cuerpoSuno` pone ahora las voces DELANTE en `negative_tags`: con un «evitar» largo, lo que no puede caerse en una
  instrumental es «sin voces».
  · **Por defecto, siempre**: `generar_musica` y la pantalla, para un video SIN estilo dicho, piden lo del director
  (`pedirMusica`); con estilo dicho manda la persona (ni se le pregunta). Sin video ni estilo, la música de la marca.
  **La cotización y la confirmación piden LO MISMO**: la propuesta se guarda en R2 (`musica-director/<espacio>/<video>.json`,
  fuera de `clientes/`) con la huella de lo que la decide (`huellaMusical`: lo que se dice, la voz, la música de la marca)
  y la confirmación la reusa 6 h sin pagar otra vez al director; si el guion cambió, se piensa de nuevo. La respuesta de
  `generar_musica` (también al cotizar) dice qué pidió y por qué. Sin IA (sin llave, sin presupuesto, caída) sale el
  RESPALDO (`propuestaDeRespaldo`: la música de la marca o la pista del guion con el tempo de los cortes) y el aviso.
  · No toca el video: proponer no guarda nada en `videos_proyectos` (lo que se paga a Suno sigue su camino de siempre).
  **Nada de esto se ha probado contra Anthropic ni Kie reales**: los tests (tests/migracion/musica.director.test.js)
  usan un `fetch` de mentira.
  · **El HISTORIAL** (`videos_versiones`, 0060; `versionesDe`, `volverAVersion` en videosProyectos.js; `GET|POST
  /api/videos/<c>/<id>/versiones`, `versiones_video`, `volver_a_version`): cada cambio del guion guarda el de ANTES (hasta
  `MAX_VERSIONES`, 30). Volver crea una versión NUEVA con ese guion, en borrador; nunca se reescribe la historia.
  · **Si lo que se DICE no cambió, la voz sigue valiendo** (`vozQueSigueValiendo`): al aprobar, si la locución está lista y
  `textoParaVoz(guion)` es exactamente el `prompt` de su trabajo, pasa a la versión nueva (`deVersion` dice de cuál era) y
  el video queda «Con voz». Cambiar capas, fondos o pausas ya no obliga a pagar otra locución.
  · **Un sello que se parte en dos líneas avisa** (`sello_partido` en revisionEscenas.js): un sello se lee de un vistazo
  en UNA línea.
  · **El ejemplo de `formato_video` sólo usa componentes que el motor ya dibuja** (un test lo exige): uno con marcadores
  enseñaba a Claude justo lo que hay que evitar.
  · **El PASO 4: crear un video sin Claude** (`CrearVideoAnimado.jsx`, `EditorEscenas.jsx`, `LocucionVideo.jsx`, lazy los tres:
  el chunk de VideoAnimado está cerca de su tope). «Video nuevo» pide la idea (o la publicación del calendario), la
  duración (15–60 s) y el formato, y `POST /api/videos/<c>/escribir` (`worker/lib/estudio/guionAnimado.js`, lo puro en
  `src/lib/guionAnimadoIA.js`) le pide el guion a la IA de texto con el MISMO `formatoParaLaIA` que lee Claude, el cerebro
  para escribir, el catálogo con los IDs de la galería de sus fotos y el personaje del kit. Se VALIDA; con errores, UNA
  vuelta de corrección y si no, 502. NO guarda: se abre como borrador sin guardar (y ligado a la publicación si salió de
  una). «Editar los textos» cambia lo que se dice y se lee sin tocar el JSON. «La voz» pide la locución con el 409 de
  siempre (ver el costo → «Generar por …»). En el panel de un reel o una historia, «Video animado» abre todo esto
  (`ReelIA` con `forma="animado"`). Función «guion de video»: texto, sin confirmación, como «Dame ideas».
  · **Todo componente del formato se dibuja** (`motorComponentes.js`): lista con sus ítems ESCALONADOS (`cada`), burbuja,
  reloj (esfera, contador, cuenta atrás), antes y después (lado, deslizador, secuencia) y teléfono (chat con los mensajes
  uno tras otro, imagen, color, notificación). El «instante lleno» de la revisión y de la hoja espera a que entren todos
  (`tardaEnLlenarse`). Una capa anclada a una palabra entra `ANTICIPO` (0,12 s) antes. La cifra puede ir `abreviada`
  («412K», «3,2M»). En 9:16 la revisión avisa del texto esencial fuera de la zona estricta (`ZONA_ESTRICTA_916`: del 13,5
  al 76 % del alto y del 5,5 al 91 % del ancho).
  · **Nada de esto se ha probado contra Kie real** (los tests hablan con un `fetch` de mentira): los nombres de los campos
  de v3 y v2, si la voz va por id o por nombre (`vozParaKie`), si devuelven tiempos y en qué forma, y el redondeo real de
  los créditos salen de la documentación pública y se comprueban con la primera toma de verdad.
- **El video se hace en el SERVIDOR y sale TERMINADO: el reel por planos es un ENCARGO** (decisión de la agencia: dejar Flow
  y CapCut; `worker/lib/estudio/encargoReel.js`, `montaje.js`, `src/lib/montajeReel.js`, `duracionesVideo.js`, 0063).
  Antes FlujoReel orquestaba con `await` y cerrar la pestaña paraba el storyboard o el video a medias. Cosas que no se ven:
  · **Tipo «reel» en `estudio_encargos`** (sin migración: `tipo` no tiene CHECK). Los pasos son los FOTOGRAMAS (uno por
  plano, `paralelo` 1, en orden: cada uno con el FINAL del anterior y del primero de referencia, `pedidoDeFotogramaReel`,
  el mismo pedido que a mano) y reusan lo de siempre del encargo: el trabajo, la proporción (`revisar`) y `finales`. Lo que
  la pantalla corrige o rehace a mano se dice con `POST …/final` y MANDA: el video y los clips salen de ahí.
  · **Después, `pasoReel`**: «uno» (un video con el storyboard, `pedidoDeVideo`) o «clips» (un clip limpio por plano, de
  uno en uno por paso pero todos a la vez en la cola; `p.clip`). Con `revisar` se para tras el storyboard (`video.fase`
  «espera», el encargo queda «hecho») y `POST …/continuar` lo vuelve a poner en marcha; un 409 si el storyboard va a medias.
  · **El MONTAJE** (`POST …/montar`, «Montarlo aquí»; o pedido al lanzar): un proyecto de video animado con una escena
  por plano —el clip a sangre (`video`, «completo», con velo), lo que se dice en ese plano (`dice`, o la locución
  repartida por planos cortando en un signo), el GANCHO escrito en la primera, lo que se lee en las del medio, y el LOGO y
  el LLAMADO en el cierre (con `pausa` 1)—, los subtítulos y la música del guion. El texto lo escribe el código: sin
  faltas. Con un solo video, cada escena es SU tramo del mismo archivo. En automático: aprobar, la VOZ —que SIEMPRE se
  confirma: sin `confirmadoVoz` el montaje se queda en «confirmar» con su costo (el 409 `confirmar` de `pedirLocucion`)
  y «Sí, generar la voz» lo sigue— y el render; sin Container (en local) se queda en «espera» y se dice.
  · **Con montaje, el video del modelo va SIN voz** (`pedidoDeVideo({ sinVoz })`): la voz la pone ElevenLabs, y el
  sonido del clip (música, ambiente) se oye debajo, bajito. Los clips van sin sonido (`sonido: "no"`).
  · **Todo resultado se pone SOLO en su publicación** (`ponerEnPost.js`: el calendario con su `updated_at` como
  condición, dos vueltas, `resincronizarCalendario` y `calendario:recargar`): el video (con `deReel`, para volver a su
  sitio), y si están VACÍOS el caption, el guion por tramos («[0–3 s] SE VE: … | VOZ: «…» | TEXTO: …») y la portada
  (el primer fotograma). Con montaje, el mp4 lo pone el render en el sitio del video crudo (`videos_proyectos.origen`).
  El panel de la publicación abierto recibe lo mismo (`onPoner` con `quedarse`): si no, su guardado al cerrar lo pisaría.
  Las piezas que pide Claude con `post_id` (`disenar_piezas`) también se ponen solas al terminar (`datos.poner`,
  `ponerResultados`; un carrusel entero en su orden); el lote de la pantalla NO (escoge entre versiones).
  · **Las duraciones salen de las llaves** (`duracionesDeReel`): «uno» sólo con un modelo que hace ESA duración exacta
  (el servidor lo comprueba: 400), y lo que pasa de ahí, por clips y montaje. Ya no hay «sólo para Flow»: el prompt para
  Flow sigue en un desplegable. El ZIP de clips para CapCut se QUEDA («Descargar los clips para CapCut»).
  · **Un solo generador de guion de video en lo común** (`contextoDeGuion` + `src/lib/guionVideo.js`): el reel, el corto,
  el del producto y el animado juntan igual el producto con su precio, el cerebro, el criterio comercial y la
  publicación. El reel SIGUE el guion que ya tiene la publicación (`guionPost`) en vez de inventar otro.
  · **Una sola voz de la marca** en el kit: la de ElevenLabs (`kit.locucion`, «Probar una voz» la fija). `kit.voz` (Google,
  Omni) queda plegada, sólo para un video de Omni con su propia voz sin montaje.
  · **«¿Está listo?» sobre el mp4 montado** (`acabadoDelGuion`, `conAcabado`): lo que lleva encima lo puso el código, así
  que no cuenta como texto mal escrito y da por cumplidos «sin sonido» (subtítulos), «marca» (logo) y «cierre» (llamado).
  · **Por MCP** (`herramientasReel.js`, sólo MCP: herramientas.js no puede llegar a encargos.js ni a mercado.js sin el
  ciclo que deja `DEFINICIONES_ESTUDIO` sin iniciar): `crear_reel` (sin `confirmado`, el guion y el plan con su costo;
  NO SE CREÓ NADA), `estado_reel` (con el storyboard en la vista previa del chat), `continuar_reel`, `montar_reel`
  (`confirmado_voz`), `video_listo` y `extraer_guion_ugc`. El lote del Estudio también hace sus reels por el encargo.
  · **Nada de esto se ha probado contra Kie, ElevenLabs ni el Container reales**: los tests usan los motores de prueba.

- **UN solo motor de texto: todo texto de una publicación va por el motor del servidor** (decisión de la agencia, fase 2
  de docs/propuesta-lo-mejor-y-creacion.md). Había siete caminos y no todos pasaban por el mismo motor: los botones «IA»
  de cada campo del panel y del banco, «Completar los textos que faltan», «Generar con IA» de la vista Lista y «Escribir
  guiones y descripciones» / «Mejorar» de «Planificar mes» usaban pedidos propios de api.js (`buildScriptPrompt`,
  `buildDescripcionesPrompt`, `generateSinglePost`, `generateFieldForPost`, `instruccionIdea`), con OTRAS reglas: el
  guion del reel en «Hook → Desarrollo → CTA», los hashtags dentro del caption, un caption a la historia. Se QUITARON.
  Ahora van por el modo «campos» de `POST /api/estudio/<c>/lote/ideas` (src/lib/camposTexto.js, worker/lib/estudio/lote.js;
  el cliente, src/lib/escribirTextos.js, en diferido). Cosas que no se ven:
  · **Cada publicación viaja con lo que YA tiene escrito** (`escrito`: manda; lo nuevo encaja con eso) y los `campos` que
  se le piden (sólo los que su formato lleva). Un campo pedido que ya tenía texto va en `antes` («escribe una versión
  mejor que conserve su intención»): es el botón «IA» de ese campo (y «Completar» de la idea escrita). La respuesta es
  `{ textos: [{ clave, campos, ganchos?, formulaUgc? }] }`; `aplicarCampos` sólo RELLENA lo vacío salvo el campo del botón.
  · **Pasa por todo lo del motor**: el catálogo (precio exacto), el estudio de mercado, el cerebro por tipo, «Saber del
  rubro», las fechas especiales, la nota fija del día, la matriz (lo que la publicación no trae lo pone `asignarMatriz`,
  sólo para el pedido), la estructura del carrusel y la forma que ya tiene (composición, gancho), la estructura de un
  video de la competencia (`estructuraRef`) y, en una UGC, su duración, la fórmula ESCOGIDA (`formulaLinea`) o las de la
  agencia para que escoja, la voz UGC y 3 ganchos. El botón de un caption sin hashtags pide también los hashtags.
  · **La ficha del cliente va en TODOS los modos** (`textoDelCliente` en loteAnuncios.js: instrucciones obligatorias —
  mandan—, estilo de los textos y de la locución, hashtags de la marca, WhatsApp, Instagram, teléfono y sucursales). El
  motor bueno no los leía y los caminos viejos sí.
  · **La estrategia del mes también en todos**: la que manda la pantalla («Planificar mes» la tiene sin guardar) o, si no
  la manda (el lote del Estudio, una publicación suelta), la GUARDADA en el calendario de ese mes (`estrategiaGuardada`, una
  consulta sin los días; `estrategiaDelCalendario` vive ahora en estrategiaMes.js para que la lea el Worker).
  · «Generar con IA» de la lista con un archivo subido primero lo MIRA (`escribirDesdeContenido`: el motor no ve
  imágenes) y luego el motor completa lo que siga vacío. «Reintentar» lo incompleto es «Completar» otra vez.
  · La carga inicial bajó de 180,5 a ~175 kB al salir esos pedidos de api.js: lo nuevo va EN DIFERIDO. Nada de esto se ha
  probado contra Anthropic real (los tests usan un `fetch` de mentira).
- **Qué lleva cada formato es UNA regla** (`src/lib/reglasFormato.js`, en la carga inicial y sin dependencias): post
  (caption, texto en la pieza, hashtags), carrusel (guion por láminas, caption, hashtags), reel (guion por planos —una
  sola forma—, caption, hashtags; SIN texto en la pieza), historia (sólo el texto en la pieza: ni guion, ni caption, ni
  hashtags) y directo (temas, caption, hashtags). La leen el motor (pedido y lectura: `captionYHashtags`), la completitud
  (`camposDe`, `faltaParaEnviar`: ya no se le exige guion ni caption a una historia), «Completar» (`camposQueFaltan`),
  `rellenarConIdea` y el panel (un campo que el formato no lleva no se enseña ni tiene botón «IA», salvo que ya tenga
  texto: no se esconde lo escrito). **Los hashtags van SIEMPRE aparte** (`hashtagsFinales`): los que la IA deja al final
  del caption se pasan a su campo (`separarHashtags`; también en `publicacionDeUgc`), porque `textoPara` los junta al
  publicar y salían dos veces. Los hashtags de antes, dentro de un caption, cuentan como puestos (`tieneHashtags`).
- **La semana es UNA: la FILA de la rejilla** (lunes a domingo, `semanaDelMes`/`semanasDelMes`). «Planificar mes»
  numeraba bloques de siete días desde el 1 (`getWeekNumber`): en noviembre de 2026 su «Semana 1» tenía siete días y la
  de la rejilla, uno, y el concepto de la semana caía en otros días. Ahora la usan el asistente de planificar (un concepto
  por fila: 5 o 6), la lista por semanas (`agruparPorSemana` ya no lee `weekNumber`), el filtro de semana del calendario,
  `conceptoDeSemana`, `casillasSinIdea`, `ponerEnDia`, el calendario que lee el asistente y `editar_publicaciones_lote`
  (lib/lote.js), que tienen que coincidir. Lo guardado de antes se sigue leyendo: el `weekNumber` de los días se ignora y
  `weekConcepts` se lee por fila.
- **«Planificar mes» sin trampas** (PlanWizard.jsx, src/lib/planMes.js):
  · **Las Ofertas van ANTES de la Estrategia** (pasos Plan · Fechas y ritmo · Ofertas · Estrategia · Conceptos · Ideas,
  `PASO`): «Proponer la estrategia con IA» las lee y antes le llegaban vacías.
  · **Borrador por cliente y mes** (`plan-mes-borrador:<cliente>:<AAAA-MM>`, 7 días, como el del lote): lo escrito y las
  ideas ya PAGADAS se guardan en cada cambio y se recuperan al abrir («Seguimos donde lo dejaste» · «Empezar de cero»).
  Al cambiar de mes se recupera el de ese mes, y el guardado espera a pintarlo (`restaurando`): si no, guardaría lo del
  otro mes con su clave. Se borra sólo si el calendario se creó (`handleWizardGenerate` devuelve true/false).
  · **No se pone encima**: los días del mes que ya tienen publicaciones (`diasOcupados` sobre `client.calendars`) no
  reciben nuevas, salvo «Añadir también en los días que ya tienen publicaciones».
  · **La ficha de diseño ya pagada llega al calendario** (`publicacionDelPlan`: `promptImagen`, su huella y quién la
  escribió, más la fórmula UGC): antes `handleGenerate` la tiraba y «Crear la imagen aquí» la volvía a pagar.
- **La estrategia del mes se ve y se edita después** (la tarjeta de la campaña: «Estrategia: Vender · foco: …» y la etapa
  de cada semana; «Editar el mes» → Estrategia, `EditorEstrategia` en EstrategiaMes.jsx, en su chunk). Se guarda en
  `opciones.estrategia` como la de «Planificar mes», y el motor la lee. La tarjeta lee `embudo.js` (pequeño) y no
  estrategiaMes.js, que arrastra pilares: va en la carga inicial.

- **El control contaba el titular dos veces y daba por buena la pieza con el titular REPETIDO** (prueba real de Feria del
  Lente por `crear_en_estudio`, 5-nov). Sin texto dicho, el que debía decir la pieza salía de TODO lo citado en la escena
  (`textoDelPedido`), y la ficha del director nombra el titular en «Composición» y otra vez en «Texto exacto»: el control
  esperaba tres líneas, la corrección pidió «EXACTAMENTE así, en 3 líneas» y el motor dibujó el titular dos veces, que
  entonces sí casaba. Tres guardas: `textoDelPedido` cuenta cada texto UNA vez y, en una ficha, manda su línea «Texto
  exacto»; el encargo pone `p.texto` con `textoDeLaFicha` en cuanto el director escribe la ficha (si nadie dijo el
  texto); y `compararTexto` marca una LÍNEA esperada que sale en dos renglones (`repetido`; lo que sobra suelto, como el
  logo, sigue sin contar) y la corrección pide quitar la copia.
- **Fase 4: menos puertas y nombres claros** (docs/propuesta-lo-mejor-y-creacion.md). Lo que no se ve en la pantalla:
  · **El panel de una publicación tiene TRES pestañas: Idea · Pieza · Publicar** (`src/lib/pestanasPanel.js`). La de
  antes, «Subir», mezclaba el archivo con la salida (unos 25 controles de IA en una columna). PIEZA: «Diseñar con el
  director» (según el formato: «Crear la imagen aquí» en un post o una historia sin archivo, «Carrusel con IA» en un
  carrusel, el reel por planos en un reel), «Subir archivo» y «De la galería», «¿Qué quieres?» y lo demás plegado en «Más
  formas» (Drive, video del producto, video animado, «Crear en el Estudio (avanzado)», recetas, el modelo de esta vez,
  tipo/estilo/plantilla, los atajos de foto y de temporada). Las acciones de cada imagen (Otra versión, Corregir, Recrear
  con mi marca, Ver en el Estudio) siguen junto a ella. PUBLICAR: redes, texto, vista previa, lo de cada red, revisión y
  «¿Cuándo sale?». Es UN componente (`PestanaPublicar` con `seccion`), así que lo que está en marcha (una versión, el
  diálogo del Estudio) no se pierde al pasar de Pieza a Publicar. Las claves internas son `idea`, `pieza` y `salida`; lo
  que se pedía antes sigue valiendo (`pestanaDelPanel`): «contenido» abre Idea y «publicar» (la «Subir» de antes, la de
  «Agregar publicación» → «Subir contenido») abre Pieza. Donde este archivo dice «la pestaña Subir», ahora es Pieza (el
  archivo) o Publicar (la salida). EditorMedios acepta `botones` (sustituye su fila) y `abrirBancoRef` («De Drive» desde
  fuera); «Subir» (el diálogo) sigue con la fila de siempre. Flechas, Inicio y Fin mueven entre pestañas.
  · **El glosario**, en lo que se ve: *Diseñar* (crear con el director) · *Otra versión* (misma información, otra
  composición) · *Corregir* (editar la misma imagen; era «Corregir esta», «Editar», «Editar con IA») · *Recrear con mi
  marca* (sólo para lo de OTRA cuenta; era también «Recrear como anuncio» y «Recrear un anuncio») · *Poner en una
  publicación* · *Guardar referencia*. Fuera a la vista «prompt», «lote» («Producir varias piezas», «Muchas de una vez»),
  «secreto del Worker» y «Crear con IA» (el diálogo es «Crear en el Estudio»). Queda «/receta <id>» en la caja del
  director: es lo que él lee (REGLA_RECETAS).
  · **«Poner en una publicación…» desde el Estudio** (visor de una pieza, visor de un carrusel o un reel, y la galería con
  varias escogidas; `PonerEnPublicacion.jsx`, lazy): `POST /api/estudio/<c>/poner` (worker/lib/estudio/ponerPiezas.js)
  con { postId, calendarId, carpetaId | archivoIds, modo }. Lo mismo que `poner_en_publicacion` de Claude
  (`postConPiezas`: un carrusel en su orden o sueltas, reemplazar o añadir, dos imágenes o más = carrusel, su historia
  encajada si recibe su primera imagen) por el camino de la fase 5 (`cambiarPublicacion`: el `updated_at` como
  condición, la cola y `calendario:recargar`), y apunta el uso de cada pieza. La lista de publicaciones sale de
  `client.calendars` (de una semana atrás en adelante, sin lo publicado; buscando, también lo pasado). No crea ni cobra.
  · **La campana avisa cuando el Estudio TERMINA o FALLA algo, a quien lo pidió** (`avisoDeEncargo`, `avisarEncargo`,
  `avisoDeRender`, `avisarRender` en worker/lib/equipo.js; tipos «encargo», «encargo-fallo», «render», «render-fallo»).
  Un lote, un carrusel, un reel (también el storyboard que espera revisión y el montaje que espera el sí de la voz), lo
  de «Recrear para…» y un render, guardados en `avisos` como los demás: llegan aunque se lanzaran desde el teléfono y se
  cerrara la aplicación. `avanzarEncargo` avisa al pasar de «en marcha» a «hecho» o «fallido» (cancelar no avisa: lo hizo
  la persona); un reel retomado avisa otra vez al cerrarse. Los firma el sistema (`POR_ESTUDIO`): firmados por la persona,
  `avisar` no se los mandaría a ella. Lo que la pantalla SIGUE de cerca (`seguido: true`, lo pone `lanzarEnServidor` de
  piezaServidor.js: el panel, el visor, las historias, el asistente) sólo avisa si falla o si tardó más de
  `AVISO_SEGUIDO_MS` (3 min: ya no se estaba mirando). El render guarda quién lo pidió (`render.porId`); el de un MONTAJE
  no avisa por su cuenta (lo dice el reel al cerrarse). El enlace lleva a la publicación si la hay; si no, al Estudio.
  · **El «Crear» del compositor del Estudio va por el SERVIDOR** (`pedirDelCompositor` en lib/visorEstudio.js): un
  encargo de una pieza con el control, la proporción y el logo estampado aunque se cierre la pantalla. Antes se revisaba
  en el navegador (`terminarTrabajo`) y sólo si la pantalla seguía abierta. Un video sigue como antes (sin control).
  · **El asistente de la aplicación tiene las herramientas del reel del servidor** (crear_reel, estado_reel,
  continuar_reel, montar_reel, video_listo, extraer_guion_ugc: las mismas del MCP). Las importa worker/rutas/chat.js y no
  herramientasServidor.js (cerraría el ciclo que deja `DEFINICIONES_ESTUDIO` sin iniciar): `crearEjecutor` recibe `mas({
  resolverCliente, buscarPublicacion })` y las suma. Sólo con quien firma (gastan).
  · **«Recrear para…» de «Lo mejor» se pone SOLO en su publicación** (`poner: true` en sus dos encargos; `ponerResultados`
  de encargos.js, como lo de Claude con `post_id`).
  · **Los guiones de video corto, del producto y la adaptación del estudio de mercado piden los hashtags APARTE**
  (`captionYHashtags` en videoCorto.js; `leerAdaptacion`): los que se cuelen al final del caption pasan a `hashtags`, y
  «Poner en la publicación» los rellena en `hashtagsFinales` si estaba vacío.
  · **El Estudio, reordenado**: «¿Qué quieres crear?», «Muchas de una vez» (el lote y recrear) y la galería arriba; el kit
  de marca al final. El estilo de la tarjeta del lote vivía en EstudioLote.css (sólo se cargaba al abrir el lote): ahora
  en Estudio.css. **En el teléfono, el banco y «Lo mejor» del calendario son una hoja inferior** (`.bank-panel` fijo
  encima de la barra de abajo, por debajo de 1024 px; la pestaña Ideas/Inspiración, `bank-panel-pagina`, no) y los
  botones de la barra del mes llevan texto (Seleccionar, Lo mejor, Ideas). **Topes al límite**: el CSS inicial quedó en
  ~12,48 de 12 kB (redondea a 12) y el chunk del Estudio en ~19,98 de 20: lo siguiente que se sume ahí tiene que sacar
  algo antes.
- **El mes en un solo flujo: el ASISTENTE DEL MES** (fase 6; `calendario/AsistenteMes.jsx`, lazy; lo puro en
  `src/lib/asistenteMes.js`). El botón «Producir el mes» (y «Planificar mes» de la cabecera del cliente y «Nuevo calendario»
  del buscador, que navegan con `?asistente=1`: CalendarView lo abre al llegar o, ya en ese mes, al oír el `popstate`) abre
  cinco pasos en una pantalla con su avance: Estrategia → Plan → Ideas → Diseñar → Revisar y enviar. Antes eran cinco
  puertas del menú «⋯» (Revisar las ideas, Diseñar las que ya hay, Guiones para grabar, Completar los textos, Revisar el mes),
  que ya no están en el menú: viven dentro. «Planificar a mano» (PlanWizard, día por día y con plantillas propias) sigue,
  desde el paso Plan (`onPlanificar` de App). Cosas que no se ven en la pantalla:
  · **Se GUARDA EN EL CALENDARIO, no en el navegador**: la estrategia en sus campos de siempre (`campaign`, `offers`,
  `promoCode`, `weekConcepts`, `opciones.estrategia`), el plan como PUBLICACIONES (casillas sin idea, `delPlan: true`, con su
  formato, tipo, hora y la matriz), las ideas al llegar cada tanda (lo pagado no se pierde aunque se cierre a la mitad), la
  aprobación interna en cada publicación (`etapa`) y lo del asistente en `opciones.asistente` (el paso al que se llegó, los
  ajustes de temporada aceptados, quién). Así lo retoma otra persona del equipo o la misma en el teléfono: se abre en
  `pasoQueToca` (lo que le falta al mes, o el paso guardado si es anterior). Un mes con publicaciones entra donde le toca y
  el plan sólo llena los días LIBRES (salvo «Añadir también en los días que ya tienen»).
  · **Todo lo escribe `escribirMes(cambiar)`** (CalendarView): parte del calendario MÁS NUEVO (`calVivo`, que también guarda
  lo que acaba de escribir antes de volver a pintarse), así dos escrituras seguidas no se pisan, y va por `onUpdateCal`: el
  guardado agrupado y sus avisos de tiempo real de siempre. En un mes sin cajón crea el cajón (`fusionarEnMes` lleva ahora
  también las `opciones` que el cajón no tenga).
  · **Las casillas no llevan `aprobacion: "idea"`**: con ella el cliente aprobaría sólo la idea y lo aprobado nunca se
  programaría. Sin ella, lo de siempre (pieza si la tiene). (Hoy la marca del sistema ya no sobreviviría a la pieza —ver
  «La marca «idea» del sistema se iba con la publicación»—, pero tampoco hace falta ponerla.)
  · **Diseñar NO escribe el calendario desde la pantalla**: «Diseñar las aprobadas» es `ProducirMes` con `ponerSolas` (el
  encargo con `poner: true`, también el carrusel: `lanzarCarrusel({ poner })`) y lo pone el SERVIDOR al terminar
  (`ponerResultados`). Por eso en ese modo no se guardan las fichas desde la pantalla ni hay «Poner»: un guardado del mes
  entero pisaría lo que el servidor acaba de poner. Por lo mismo el asistente sólo apunta su paso en los hitos (estrategia
  guardada, plan puesto), no al moverse entre pasos.
  · **Los REELS ahora se diseñan** (`worker/lib/estudio/reelDelMes.js`, `POST /api/estudio/<c>/reel/mes`): sin `confirmado`,
  el costo aproximado de cada reel aprobado (un guion de muestra de la duración por defecto: NO se escribe nada ni se paga);
  con el sí, UNA publicación por llamada (escribir el guion tarda): el guion SIGUE el de la publicación (`guionDeReel` con su
  `postId`), el plan (`planDeReel`, importado en el momento desde herramientasReel.js por el ciclo de siempre) y el encargo
  del reel por planos ligado a su publicación (se pone solo). La voz del montaje se confirma APARTE cuando llega a
  «confirmar» (el asistente lo ofrece con su costo). Un UGC no va por aquí: «Guiones para grabar», dentro del mismo paso.
  · **Las HORAS EN BLOQUE** (`horasEnBloque`): a lo que no tiene hora, la del plan semanal para su día y su formato
  (`horaDelPlan`) o la hora por defecto que se escoja; lo que ya tiene hora o se publicó no se toca.
  · **UNA sola IA en la estrategia**: «Proponer la estrategia con IA» trae objetivo, foco, campaña, el concepto y la etapa de
  cada semana (las ofertas se escriben ANTES: la IA las lee). Precargada del mes, o del anterior (objetivo y foco).
  · **Revisar las ideas, Diseñar y Revisar el mes viven DOS veces** (`envolturaMes.jsx`): sueltas son el diálogo de siempre e
  incrustadas no atrapan el foco ni llevan su «Cerrar». «Revisar» y «Diseñar» del envío al cliente abren el asistente en ese
  paso (`pasoInicial`). El editor del plan semanal y «Guiones para grabar» se abren ANIDADOS dentro del diálogo del asistente.
  · **Nada de esto se ha probado contra los servicios reales**: los tests usan los motores de prueba.
- **El plan semanal ÚNICO de cada empresa** (fase 6; `clients.plan_semanal`, 0066; `src/lib/planSemanal.js`;
  `calendario/PlanSemanal.jsx`). Formato, tipo, HORA y nota de cada día en un solo sitio y un solo editor (`EditorSemana`: la
  barra de los días, el asistente del mes y la pestaña Semanal de la ficha, que ya no tiene el ritmo, la plantilla ni la
  estructura semanal de antes). Cosas que no se ven:
  · **Lo de antes se sigue leyendo, sin migrar nada**: `semanaDelCliente`, `notasDelCliente`, `ritmoDelCliente` y
  `plantillaDeLaSemana` miran primero `planSemanal` y, sin él, la plantilla (`plan_contenido`), el ritmo (`ritmo_contenido`) y
  las notas (`notas_semana`). El Worker lee la fila con `planSemanalDeFila` (el lote del mes: ritmo y notas). Lo leen el
  lote del Estudio, «Planificar mes», la barra, las notas de la rejilla y la línea de la IA (`lineaDelPlanDe` en api.js).
  · **Al guardar, el formato nuevo Y las columnas de antes DERIVADAS** (`planSemanalParaGuardar`): la copia con la primera de
  cada día «del ritmo» (así la temporada la sigue ajustando), el ritmo, las notas y la línea de la IA. Lo escribe SÓLO
  `PUT /api/clientes/<id>/plan-semanal` (limpia cada parte): `clientToRow` no lleva `plan_semanal`, así una ficha abierta desde
  antes no lo pisa. La ficha, al guardar el plan desde su pestaña, mete lo guardado en su formulario: si no, «Guardar» de la
  ficha escribiría el plan de antes en las columnas derivadas.
  · **«Volver al estándar»** deja `dias: null` (la plantilla `base` con el ritmo de la agencia) y CONSERVA las notas.
  · **La HORA** va en cada publicación del plan (`hora`, «HH:MM»; también en la copia de `plan_contenido`, `limpiarHueco` la
  conserva) y viaja a `configDeFormatos`, `casillasConPlantilla` («Mes completo» del lote), «Planificar mes» (`publishTime` de
  cada formato) y las casillas del asistente. `PlanDelCliente.jsx` se quitó: su «Personalizar para este cliente» es el editor.

- **Fase 7: un cliente con CINCO pestañas y la navegación global agrupada** (decisión de la agencia: le gusta agrupar;
  docs/propuesta-lo-mejor-y-creacion.md). Eran diez pestañas por cliente que en el teléfono desplazaban de lado. NINGUNA
  función se quitó: se agruparon. Lo que no se ve en la pantalla:
  · **Calendario · Crear · Referencias · Marca · Resultados** (`PESTANAS_DEL_CLIENTE` en src/lib/rutas.js), cada una con sus
  sub-secciones detrás (`SECCIONES_DEL_CLIENTE`: `/cliente/x/marca/kit`). Crear = el director («¿Qué quieres crear?», el
  mismo ChatPanel incrustado de la pestaña Diseño, `tema="diseno"`, con atajos y recetas) arriba y la galería del Estudio
  debajo; lo manual (compositor de imagen y video, carrusel y reel guiados, «Muchas de una vez», recrear) va plegado en
  «Avanzado» DENTRO del Estudio (`avanzado`, un `hidden` que no desmonta: `enfocarPrompt` lo abre antes de enfocar, y el
  lote y el recreador van FUERA, así `?lote=mes` abre su diálogo aunque esté plegado). Referencias = banco de ideas, «Lo mejor»
  del cliente (Inspiracion.jsx) y la competencia del estudio de mercado EN LA PÁGINA (`CompetenciaDeMercado`, el mismo
  `PanelCompetencia` del diálogo). Marca = ficha, kit y voz, cerebro (con su estudio de mercado), plan semanal (el MISMO
  `EditorSemana`), fechas especiales (el diálogo de siempre, mes a mes) y Drive (PestanaContenido).
  · **Las direcciones de antes NO se reescriben** (`PESTANAS_VIEJAS`): `/estudio` es Crear → Galería, `/diseno` Crear →
  Director, `/ideas` e `/inspiracion` Referencias, `/cerebro`, `/ficha` y `/contenido` Marca. Lo que traen detrás lo lee la
  pantalla AL MONTARSE (`?lote=` el Estudio, `?receta=` el director, `?pieza=` Inspiración): si se redirigiera, se perdería.
  Los avisos del servidor siguen apuntando a `/estudio`, `/tareas` o `/inspiracion?pieza=` y llegan. `construirRuta` con un
  nombre de antes da la dirección nueva. Todos los nombres (nuevos, «tareas» y los de antes) quedan reservados
  (`PESTANAS_CLIENTE`). «Cambiar de cliente no cambia de pestaña» sigue, también la sub-sección; y al volver a una pestaña
  se vuelve a la última sub-sección que se miró (`ultimaSeccion` en App.jsx, por sesión).
  · **Los avisos de la campana perdían lo que va detrás de la dirección** (`navegar(u.pathname)` en Avisos.jsx): el «rinde 3×»
  llegaba a Inspiración sin su `?pieza=`. Ahora `u.pathname + u.search`.
  · **Las pestañas son pestañas de verdad** (BarraPestanas.jsx, lib/pestanas.js): `role="tablist"`, `aria-selected`,
  `aria-controls` a un `tabpanel` con `aria-labelledby`, foco sólo en la escogida, flechas, Inicio y Fin. Activación MANUAL
  (Intro o Espacio): cada pestaña es una dirección y una pantalla que se descarga. Antes eran `aria-current="page"`. En el
  teléfono caben las cinco (icono encima del nombre, `--fs-3xs`).
  · **Las tareas del cliente ya no son pestaña**: su botón en la cabecera (y «tareas atrasadas» del resumen) lleva a Mi día,
  por empresa, con las suyas (`/tareas?empresa=<id>`, lo lee Tareas.jsx al montarse; no se recuerda como vista del
  navegador). `/cliente/x/tareas` sigue con su lista entera (TaskPanel: repetir, plantillas), y Mi día enlaza a ella.
  · **El kit de marca salió del Estudio a Marca → Kit y voz**: EstudioKit importa ahora Estudio.css (vivía de los estilos del
  Estudio), ProbarVoz importa VideoAnimado.css (lo mismo) y la voz (VozDeMarca) va en su tarjeta, también con el kit vacío.
  Con eso el chunk del Estudio quedó por debajo de su tope pese al «Avanzado».
  · **El SEMÁFORO del kit** (lib/semaforoKit.js, cliente/SemaforoKit.jsx): kit, logo, imágenes de la marca perdidas, fotos del
  catálogo, plantillas, «Me gusta» (3), ficha técnica del cerebro (sólo en Marca, con el estado de GET /api/cerebro) y voz,
  en verde, ámbar o rojo con su arreglo: ir a donde se arregla o, el logo, SUBIRLO ahí mismo (a la galería y al kit). Sale de
  lo que ya devuelve GET /api/estudio, que ahora trae además `sinFotos` (los productos activos sin fotos o con todas perdidas).
  Plegado arriba de Marca; en Crear, sólo lo crítico (los rojos sin la ficha), con lo que leyó el Estudio (`onDatos`, sin
  pedirlo otra vez); en la pestaña Pieza de una publicación (AvisoKitPieza, lazy), sin logo o un producto que NOMBRA sin
  fotos. La lectura se recuerda dos minutos por cliente (lib/semaforoKitApi.js): abrir paneles no la pide cada vez.
  · **Navegación global**: Inicio · Mi día · Lo mejor · Producción · Bandeja · Resultados · Anuncios · Auditorías, y aparte
  Equipo y Ajustes. «Producción» es Programación con «Por producir» (lo aprobado por programar y las ideas por producir;
  antes era un bloque de «No publicadas») como primera pestaña: `/produccion`, y `/programacion` sigue (también `/tablero`).
  PorProgramar va siempre montado (`hidden`) para que su cifra salga en la pestaña. «Anuncios» (pages/Anuncios.jsx) lleva la
  Biblioteca como pestaña; `/campanas` y `/biblioteca` siguen siendo sus direcciones.
  · **Ajustes → «Cómo trabajamos»**: recetas y fórmulas UGC (su diálogo de siempre, que antes sólo se abría desde la pestaña
  Diseño, una publicación o el guion de un UGC), plantillas de plan y «Manuales de la agencia» (campañas, video, director y
  cómo se diseña cada tipo).
  · **El «⋯» del calendario ya no lleva el plan semanal ni las fechas especiales**: viven en Marca. En el calendario quedan sus
  accesos directos (la barra de los días y «Elegir fechas» de la tarjeta de la campaña); en el teléfono la barra no se ve, así
  que el plan semanal es Marca → Plan semanal.
  · **El CSS inicial estaba en su tope (12,48 de 12,5 kB)**: lo de Drive, el banco anterior y la ficha salió de index.css a
  Drive.css, PestanaContenido.css y FichaCliente.css, importados por sus componentes (todos en diferido). Lo nuevo va en
  cliente/cliente.css, con sus chunks.
- **El curso de campañas cambió tres vocabularios, y ninguna fila se reescribió** (`src/lib/cicloVentas.js`, `embudo.js`,
  `estudioMercado.js`, `estratega.js`). Lo guardado sigue con los ids de antes y se ENTIENDE al leerlo:
  · **Las etapas.** `opciones.estrategia.etapas` de los calendarios (atraer, considerar, convertir, fidelizar) y el `embudo`
  de `planes_campana` (frío, tibio, caliente) pasan por `idEtapaCiclo`, en `limpiarEstrategia`, `semanasConEtapa`,
  `EtapaSemana` y `leerPlan`. El estratega abre un plan guardado pasándolo por `leerPlan`. Si alguien vuelve a indexar con
  `ETAPAS[x].nombre` sin el alias, un borrador viejo del navegador revienta «Planificar mes».
  · **Las maletas.** Un estudio aprobado con cliente, dolor, deseo, alternativas, diferenciador y confianza se lee con
  `elementosConAlias`: «confianza» se parte por frases entre testimonios y garantía, y si no nombra garantía, la garantía queda
  vacía y el semáforo la pone en rojo, a propósito. «Deseo» y «alternativas» no son maletas: quedan en `extra` del producto,
  se ven y van en su nota del cerebro.
  · **Las tácticas.** Las tres nuevas (reciprocidad, empatía, micro-compromiso) van AL FINAL de `TACTICAS`, para que lo
  guardado en `post.tactica` siga valiendo.
  · **La tabla del ciclo por negocio no se importa de `cicloVentas.js`, sino de `cicloNegocio.js`.** `cicloVentas.js` va en la
  carga inicial y rollup reparte por MÓDULO: reexportada, la primera pantalla diferida que la usara metía unos 3 kB
  comprimidos en el arranque, sin que saltara ningún tope. Lo vigila `rendimiento.bundle.test.js`. Por eso lo deducido es DATO
  y se arma al pedirlo (`baseDe`).
  · **Los tipos de arte (`kit.tiposArte`) NO van en `bloqueDeMarca`.** Ése llega en cada pieza al motor de imagen; esto es para
  quien diseña: va como parámetro aparte del director (`pedidoDeFichas`, `pedidoDeCarrusel`) y del motor de ideas.
  · **«Pedírselo al cliente» usa `aria-disabled`, no `disabled`.** Un botón que se desactiva con el foco encima lo suelta al
  `<body>`, y en el diálogo del estudio Escape dejaba de cerrar. Lo cazó Chromium, no los tests.
- **Los números del negocio usan las cuentas de la agencia, no unas propias, y los tests lo exigen celda a celda**
  (`src/lib/numerosNegocio.js`; Marca → «Números del negocio»; `anuncios_clientes.negocio`, 0069). Los ejemplos de los Excel
  del curso y los valores de deeplook tienen que dar lo mismo. Dos diferencias, a propósito: el % a invertir siempre es
  porcentaje y los clientes potenciales en la web se cuentan sobre las visitas. Cosas que no se ven en la pantalla:
  · **Cada dato guarda su origen** (cliente, agencia, estimado, meta, medida). La IA (`POST …/negocio/proponer`) propone
  ticket, costos, devoluciones y % a invertir siempre como «estimado» y no guarda nada; con todo confirmado ni se la llama.
  · **La fila es la misma que la del informe de anuncios:** el número se escribe con `actualizar` y no con `guardar`, que
  pisaría las otras columnas. Un PUT con `antes` contesta 409 si otra persona guardó entremedias.
  · **Con los fijos dentro, el equilibrio depende del presupuesto:** sin presupuesto escrito se usa lo gastado en Meta en 30
  días (origen «meta») y, si no, la inversión que pide la meta. «Sólo la pauta» con fijos y sin ventas de otros canales
  AVISA (`cargaTodosLosFijos`) y no cambia la cifra.
  · **El simulador se prellena con el CTR único sobre las impresiones** (clics únicos ÷ impresiones), no con el de Meta, que
  va sobre el alcance: si no, el «esperado» duplicaría los clics de verdad.
  · **El diagnóstico usa el número mágico guardado** si nadie teclea otro (`origenCosto`), y el estratega toma de ahí el
  margen efectivo y la tasa de cierre (`deNumeros`).
  · **Lo de Meta es UNA llamada de sólo lectura** (dos si Meta rechaza un campo con #100), y sin cuenta, sin permisos o con
  un error la ficha se abre igual con `avisoMeta`. Nada de esto se ha probado contra Meta ni contra la IA reales.
- **Meta no ve las ventas que se cierran por WhatsApp: las apunta el cliente por su enlace** (`/ventas?t=…`;
  `src/lib/ventasSemana.js`, `worker/lib/ventas.js`, 0070). Cosas que no se ven:
  · **El testigo vive en `anuncios_clientes.testigo_ventas` y se crea UNA vez** (`crearEnlaceDeVentas`, que sólo escribe
  si seguía vacío): regenerarlo mataría el enlace que el cliente guardó en su WhatsApp. La única lectura sin dueño es
  `clienteDeVentasPorTestigo` (publico.js); todo lo demás va por `crearAcceso` del espacio de ese cliente.
  · **Una semana es su LUNES en Panamá** y su fila tiene id fijo (`vs:<cliente>:<lunes>`): guardar dos veces es la misma
  fila. El cliente sólo escribe la semana actual y las dos anteriores; la agencia, ocho. De lunes a miércoles se le
  pregunta por la que acaba de terminar.
  · **La tasa de cierre cruza cada semana de ventas con las conversaciones de la ANTERIOR** (quien escribe el jueves
  compra el lunes), sobre las últimas 4 semanas apuntadas. Por eso la agencia lee de Meta NUEVE semanas para enseñar
  ocho. Con el dato del cliente, cuentan las ventas «de los anuncios»; con más de la mitad cerradas, avisa. Sólo sustituye
  al 5 % con 2 semanas y 20 conversaciones (`tasaParaUsar`).
  · **Una semana sin apuntar NO es cero ventas** (no entra en la tasa), y lo opcional vacío es null («no lo sé»), no 0.
  Las semanas sin pauta sí salen en 0 (`agruparPorSemana` las rellena).
  · **El cliente nunca ve un costo**: su respuesta no lleva gasto, espacio ni quién del equipo escribió (un test busca
  esas palabras). La pauta es la de toda la cuenta publicitaria.
  · **Meta falla callado aquí**: sin cuenta, sin permisos o con un error, las ventas salen igual y `meta.estado` dice por
  qué. **Nada se ha probado contra Meta real.**
- **`TASA_CIERRE_POR_DEFECTO` pasó de 20 a 5** (decisión del curso), pero el Manual de campañas guardaba SIEMPRE la tasa de
  entonces (`limpiarManual` la escribía aunque nadie la escogiera). Un 20 sin la marca `tasaCierreV: 2` se lee como el de
  ahora; lo que se guarda desde entonces lleva la marca, así que un 20 escogido después se respeta.
- **Lo que va a pauta nace escrito como anuncio, porque en el Ads Manager su texto ya no se cambia** (`src/lib/pauta.js`;
  decisiones 8, 9 y 10 de docs/propuesta-curso-campanas.md). El texto principal de un anuncio montado con la publicación
  ES su caption. Cosas que no se ven en la pantalla:
  · **`post.pauta` = { etapa, nivel?, como, auto?, motivo? }** con la etapa del ciclo (`idEtapaCiclo`: «atraer» o «tibio»
  se leen); `como` "" = de las dos formas. **Quitarla deja `pauta: false`**, no la borra: así el asistente del mes no la
  vuelve a proponer. El chip del mes mira `enPauta` (lib/estadoChip.js), la MISMA regla en una línea (un test las compara):
  pauta.js arrastra el estudio de mercado y no puede ir a la carga inicial.
  · **Toda la que va a pauta lleva además `post.anuncio`** (3–5 textos de hasta 600, títulos de 40 cortados en palabra,
  descripción de 30, botón por su id de Meta) para montarla subiendo la pieza. Es un campo más del motor de textos,
  «anuncio», que sólo se pide si va a pauta (`pideCampo` en camposTexto.js: nunca un directo; una historia sí, sin caption).
  «Completar» y el botón del caption lo piden si falta (`camposQueFaltan` de escribirTextos.js, no el de reglasFormato.js).
  · **El motor la escribe con `REGLA_ANUNCIO`** en los modos «campos», «plan» y «publicacion» (worker/lib/estudio/lote.js):
  la etapa en la línea de cada pieza (`lineaPauta` en `lineaDePieza`) y el tipo de negocio y el DESTINO del cliente leídos
  en el servidor de `anuncios_clientes.negocio` (`leerNegocio`, una lectura y sólo si alguna va a pauta; sin números,
  WhatsApp). Los hashtags se recortan a 3 en el servidor aunque la IA traiga más. En «plan», el «anuncio» viene dentro de
  cada idea y se lee aparte (`anunciosDeRespuesta`): `leerProduccion` no lo conoce.
  · **Qué se marca solo** (`sugerirPauta`): las del tipo «Anuncio» y las de la oferta del mes (`offers`/`promoCode`: el tipo
  «Beneficios», el código, una cifra o dos palabras de la oferta). Al poner el plan del asistente del mes salen marcadas con
  `auto` y se dice cuántas; lo que YA estaba en el calendario sólo se propone (con su casilla), nunca se marca sin verse.
  La etapa sugerida va por el nivel: el `decision` de la app es «listo para comprar» (conversión), no el «ya compró» del curso.
  · **La revisión de anuncio son REGLAS** (lo que caduca, la primera línea, el llamado a WhatsApp o a la web, más de 3
  hashtags, lo que dice de quien lee, «casi igual a otra de su etapa» por la primera línea o el 60 % de las palabras). Los
  bordes de palabra van con `\p{L}` y no con `\b`: `\b` sólo entiende ASCII y «acné» o «últimas» no casaban. Lo que no se
  arregla solo lo reescribe el motor (`reescribirComoAnuncio`) y se pone sobre la publicación de AHORA.
  · **Nada de esto se ha probado contra la IA real**: los tests usan un `fetch` de mentira.
- **La revisión 3Q LEE el Ads Manager, y por NIVEL, no campaña a campaña** (`src/lib/tresQ.js`, `worker/lib/revision3q.js`,
  0071; Resultados → Anuncios). El diagnóstico de antes eran 2 + 4 llamadas por campaña activa; con tres ventanas pasaba de
  40. Ahora son tres listas de lo encendido y `/act_…/insights` con `level` (campaña, conjunto, anuncio) × `last_30d`/
  `last_14d`/`last_7d`: 12 llamadas, las tenga la cuenta que tenga. El `POST /diagnostico` de antes ES esta revisión con la
  forma de entonces (`comoDiagnostico`), y el botón de Anuncios → Campañas abre la misma pantalla en un diálogo. Cosas que
  no se ven:
  · **Los campos nuevos** (clics únicos y su CTR y costo, tiempo de reproducción, ThruPlays, los rankings,
  `learning_stage_info`) se piden. Si Meta rechaza alguno (#100), se baja de escalón una vez por nivel y se dice
  (`leidoCon`). Las reproducciones de 3 s van en `actions` (`video_view`). Lo que no llegó es `null` («no se sabe»), nunca 0.
  · **El efecto desglose:** con el conjunto (o la campaña con presupuesto de campaña) dentro del número mágico, sus hijos
  salen «Sano: no se toca», aunque uno se vea peor. Presupuesto de campaña quiere decir que la campaña lo tiene y sus
  conjuntos no tienen el suyo.
  · **La fase de aprendizaje:** espera lo que está en `LEARNING`, lo creado o cambiado hace menos de `diasCambio` días (por
  el `updated_time` de Meta o por `historial_anuncios`) y el conjunto al que se le sumó un anuncio.
  · **Lo que aguanta cada etapa** (`EXIGENCIA_ETAPA`): presentación 1,3 veces el número mágico, sin pasar del equilibrio;
  conversión y ascensión 0,8. La etapa sale del nombre (palabras enteras: «Conversiones» no cuenta, y los nombres del curso
  ganan a los alias) o de `anuncios_clientes.etapas`.
  · **Pausar** (decisión 7) exige `gastoParaApagar` veces el número mágico gastado, y que cueste más de `apagar` veces lo
  que aguanta su etapa o que pase del equilibrio. Las reglas de antes (`evaluar`) son la base, ahora con los umbrales del
  Manual (`manual_campanas.umbrales3q`).
  · **Abrirla marca `revisada_at`**, salvo a quien sólo mira, y eso quita «Revisar las campañas de…» de Mi día durante 6
  días. La pantalla no relee con cada aviso del espacio: cada lectura son 12 llamadas.
  · **El cron** va el último y sólo si la vuelta no hizo nada más: un cliente al día, desde las 7:00, con 3 llamadas. A la
  campana sólo lo grave (no gastó ayer, un anuncio rechazado, el doble del número mágico sin una conversación) y sólo lo
  que no se avisó la vez anterior (`alertas.claves`). Si falla, se apunta igual: si no, lo miraría cada minuto.
  · **El informe de anuncios** guarda `contenido.agencia` (% de mensajes, CTR único, número mágico frente al real) APARTE de
  `cifras`. El enlace del cliente no lo lleva (`informeAnunciosPorTestigo` sólo da cifras y análisis).
  · **«Mejorar los ganchos» y «Anuncios nuevos»** abren el lote del Estudio por la dirección (`?lote=anuncios&niveles=…&pide=…`).
  · **Nada de esto se ha probado contra Meta real.** Lo primero: abrir la revisión de un cliente con campañas activas y
  comparar cada cifra con el Ads Manager.
- **El kit de WhatsApp y la voz del cliente: la IA propone, el código pone los precios y una persona guarda**
  (`src/lib/kitWhatsApp.js`, `vozCliente.js`, `vozAlEstudio.js`, `worker/lib/whatsapp.js`, 0072). Cosas que no se ven:
  · **La IA no escribe ni una cifra de precio**: escribe `{precio}` (cierre del guion), `{precios}` (la respuesta rápida) y
  `{oferta}`, y `ponerPrecios` pone los del catálogo, exactos; sin precio en el catálogo queda «[completar: el precio de …]».
  Si aun así aparece dinero que no está en el catálogo, o una garantía que el estudio aprobado no tiene, `avisosDelKit` lo
  dice. Un «100 % algodón» no cuenta como dinero; un «20 % de descuento», sí.
  · **Proponer no guarda; «Guardar» sí, con `antes`** (409 si otra persona guardó). Cada bloque tocado a mano lleva
  `editado: true`, y «Volver a proponer» pregunta si conservarlo (`fundirKitWhatsApp`). Lo propuesto sin guardar se recuerda
  en el navegador (`kit-whatsapp-borrador:<cliente>`, 7 días): es una comodidad, lo que vale es lo guardado.
  · **`anuncios_clientes` tiene muchos dueños** (el informe, los números, las ventas, la revisión 3Q, el kit, la voz y lo que
  está en pauta): se escribe con `actualizar` y su columna, nunca con `guardar`. Un test lo comprueba.
  · **La encuesta va SIN sesión por `testigo_voz`**, creado una vez (`crearEnlaceDeVoz`, sólo escribe si seguía vacío); la
  única lectura sin dueño es `clienteDeVozPorTestigo` (publico.js). Tope de 500 respuestas por cliente y un campo trampa
  (`sitio`): un robot recibe «ok» y no se guarda nada. La página pública no carga el estudio de mercado: por eso «Llevar al
  estudio» vive en `vozAlEstudio.js`.
  · **«Llevar al estudio» propone; «Aceptar» va al BORRADOR** (se crea desde el aprobado, sin `aprobadoAt`), que se aprueba
  como siempre. La propuesta la manda el navegador, así que se vuelve a comprobar: un testimonio sólo entra si su respuesta
  dio permiso con nombre, con el nombre de la fila y una cita que sean sus palabras. Las leídas quedan `llevada_at` y la
  siguiente vez sólo se leen las nuevas.
  · **El semáforo de Marca pide revisar el estudio cada mes** (`puntoDelEstudio`, `DIAS_REVISAR_ESTUDIO`): GET /api/estudio
  trae `estudioMercado`; sin esa clave el punto no sale. Es ámbar, así que el aviso corto de Crear no lo enseña.
  · **El análisis de una referencia trae las preguntas del curso** (problema, `tipoArte`, `sesgo`, oferta, llamado) sólo si
  vienen y con ids que existen; uno de antes se lee igual. **Nada de esto se ha probado contra la IA real.**
- **El plan de campañas no crea nada: se monta en el Ads Manager** (entrega 6; `src/lib/planCiclo.js`, `worker/lib/planCampanas.js`,
  Anuncios → Plan de campañas). Lo arma el Worker con las MISMAS cuentas puras que el Excel y Claude (`plan_de_campanas`), y
  no toca Meta ni pide cuenta publicitaria. Cosas que no se ven:
  · **Los nombres llevan `{etapa}`** («Dcasa · Presentación · …»): por ella la revisión de lo que corre reconoce cada
  campaña. Un Manual guardado de antes, sin `{etapa}`, la recibe detrás del cliente (`plantillaConEtapa`); el estratega de una
  campaña suelta no la sabe y la quita con su separador.
  · **La guía se guarda en `planes_campana` con `datos.tipo = "ciclo"`** y el id fijo `ciclo-<cliente>-<mes>`. El estratega no
  la enseña entre sus planes (`listarPlanes` la filtra). `marcar` se FUNDE con lo guardado: dos personas que marcan pasos
  distintos no se pisan (si marcan a la vez el mismo instante, la última escritura gana: no hay condición). Los ids de los
  pasos son estables («publico:<id>», «<campaña>:campana», «<campaña>:c1», «<campaña>:a2»); si el plan cambia, lo marcado de
  un paso que ya no existe no cuenta.
  · **Qué pieza va en cada anuncio:** primero lo publicado que rindió (la MISMA cuenta de «Lo mejor», `rindesDePropias`) si
  su texto sirve para pauta (`problemasDePauta` sin caption que caduca, ni llamado ausente, ni atributo personal); luego lo de
  «Va a pauta» en su etapa. Dos con el mismo tipo de arte y la misma composición son UNO para Meta: la segunda no se pone y
  se avisa. Lo que falta abre el lote con `?lote=pauta` (lib/lotePauta.js) y las piezas llegan marcadas «Va a pauta»
  (`publicacionDePieza` copia `pauta` y `anuncio`).
  · **Lo aprendido de sus anuncios ORDENA, no decide** (`conPiezas(…, { aprendido })`, con `preferenciasDelCliente`): el tipo
  de arte más barato va primero en lo que falta y el más caro detrás; los tipos de cada etapa no cambian. Sin muestra, nada
  cambia y no hay aviso.
  · **El tipo de arte de una pieza es UNA regla** (`tipoArteDePost` en lib/tiposArte.js, que reexportan planCiclo.js y
  aprenderAnuncios.js): con dos, la misma pieza contaba como un tipo en el plan y como otro al aprender.
  · **El lote abierto por la dirección es UNO** (`loteDeLaDireccion`): `?lote=mes`, `?lote=pauta` y `?lote=anuncios` (la
  revisión 3Q, que manda su etapa: también sus piezas llegan marcadas «Va a pauta»). Sin `lote`, no lee nada más.
  · **El Excel se hace en el navegador**: `crearXlsx` sobre `crearZip(…, { rutas: true })` (sin `rutas`, las barras de
  «xl/worksheets/…» se volvían guiones y Excel no lo abría). Columnas y orden, los del Excel de estrategia de la agencia
  (Presentación pone «App de mensajes» antes del presupuesto diario). Una cuenta nueva deja sus hojas de conversión y
  ascensión con el motivo.
  · **La pantalla trae sus propios estilos** (PlanCampanas.css): los de /campanas viven en el chunk de Campañas y no se cargan
  si se entra directo a /plan-campanas.
- **«En pauta» sale del creativo de cada anuncio, leído en la MISMA llamada de la revisión 3Q** (entrega 7; `worker/lib/enPauta.js`,
  `src/lib/enPauta.js`, `src/lib/aprenderAnuncios.js`, `anuncios_clientes.en_pauta`, 0073). Cosas que no se ven:
  · **Se casa por el id que guardó la cola al publicar** (`publicaciones_programadas.externo_id`; en Instagram también el
  código del enlace). Un anuncio montado subiendo la pieza no casa con nada: es «anuncio nuevo». Uno con una publicación que
  no salió desde la aplicación tampoco: «otra». La historia de un post no cuenta.
  · **El creativo baja por escalones si Meta rechaza un campo (#100)**: todos los ids, luego los de la publicación que corre,
  luego lo de antes. Si no deja leer ningún id, `en_pauta` NO se toca: si no, todo parecería salir de pauta de golpe.
  · **Se escribe con `actualizar` en la misma sentencia que `revisada_at` (al abrir) o `alertas` (el cron)**. El cron hace
  ahora 5 llamadas a Meta (2 son de esto).
  · **Lo que deja de correr no se borra**: queda `activo: false` con sus últimas cifras (sus perdedores son lo que más enseña)
  y se olvida a los 120 días. Sus ids de Meta quedan en `externos` para que «Para pautar» no los sugiera otra vez.
  · **GET …/en-pauta no pregunta a Meta**: es lo que lee el panel de cada publicación, que se abre mucho. Dice lo de la última
  revisión o del cron. El chip del mes no distingue «va a pauta» de «en pauta»: pedirlo desde la vista del mes sumaría a la
  carga inicial, que está en su tope.
  · **Lo que se aprende va por PIEZA (publicación), no por anuncio**: la misma publicación en tres conjuntos contaría triple.
  Hacen falta 3 piezas con gasto suficiente (el doble del número mágico y un cuarto de la típica) por valor, y dos valores:
  con menos, `linea` vacía y `motivo` dice qué falta. Llega al motor y al director sólo en lo que va a pauta, y al plan de
  campañas.
  · **«Marcar Va a pauta» escribe también en una publicación YA publicada** (`cambiarPublicacion(…, { publicadas: true })`,
  `como: "publicacion"`). Avisa sin pestaña: la pantalla que lo pidió relee y su guardado no lo pisa.
  · **La tasa de cierre medida por el enlace de ventas la aplica la PANTALLA** (Números del negocio, `onTasaMedida`): la
  revisión 3Q y el plan leen la guardada. Calcularla en el servidor pediría a Meta las conversaciones por semana en cada
  lectura.
  · **Nada se ha probado contra Meta real.** Lo primero con una cuenta: abrir la revisión y mirar en `en_pauta` qué ids trajo
  cada creativo.
- **La confirmación de 0,50 $ se puede fijar: «Crear imágenes sin preguntar»** (decisión de la agencia: «que no me
  pregunten cada vez»; `ajustes_espacio.sin_preguntar_usd`, 0074; la regla, `decidirConfirmacion` en
  `src/lib/sinPreguntar.js`, la misma en el Worker y en la pantalla; Ajustes → IA, `SinPreguntarAjuste.jsx`). Nulo o 0 =
  apagado, como siempre. Encendido es un TOPE por pedido: una IMAGEN (pieza suelta, tanda del director, carrusel, las
  historias, otra versión, corregir, recrear, el lote) con el modelo del cliente que no pase del tope se crea sin el
  segundo «sí». Cosas que no se ven:
  · **El SERVIDOR decide, no la pantalla** (Claude por MCP no pasa por ella): `crearTrabajo` (el 409 `confirmar` lleva
  ahora `motivo`: «tope», «otro_motor»…), `crear_en_estudio` (`imagenPorEncargo`) y `disenar_piezas` por MCP leen el
  ajuste con `topeSinPreguntar` (una lectura, y sólo cuando el pedido preguntaría) y, si crean sin preguntar, la respuesta
  lo dice (`textoSinPreguntar`: «Se creó sin preguntar: la agencia lo tiene fijado en Ajustes → IA…»). La primera llamada
  de `disenar_piezas` por MCP ya crea; un carrusel con tema se compara con lo MÁS que puede costar (8 láminas).
  · **«El modelo del cliente»** es el fijado de su kit (`kit.modelos.imagen`) o, sin él, el predeterminado, más su relevo
  automático de proporción (cambiar al que hace la proporción no es escoger). En `crearTrabajo` lo dice
  `esModeloDelCliente` (estudioCatalogo.js: también el fijado para las historias y los de `RELEVO_PROPORCION`). En las
  herramientas, «otro motor» es sólo el que pidió el ASISTENTE (`modelo` distinto del del cliente): con el ajuste
  encendido se pregunta SIEMPRE, aunque sea barato, con «El asistente sugiere usar X en vez de Y (porque …)»
  (`textoSugerencia`, el porqué en `motivo_modelo`, que aceptan `disenar_piezas` —chat y MCP—, `generar_imagen` y
  `crear_en_estudio`). Si la persona se queda con el suyo, el asistente repite SIN modelo y sale directo. Con el ajuste
  apagado, otro motor barato sale como siempre (lo decide el costo). Lo que escoge una PERSONA para esta vez («Con qué
  modelo», el compositor) no es «otro motor»: ya lo decidió ella.
  · **Video, voz y música preguntan siempre** (`tipo` distinto de «imagen» no entra; locucion.js y musica.js ni miran el
  ajuste, y un test lo vigila). El presupuesto del mes («detener») se mira después, como siempre: sin presupuesto no se crea.
  · **En la pantalla**: el «¿Sigo?» del panel (`sigue` en otraVersion.js), el segundo toque de las historias, «Diseñar las
  aprobadas» (un video entre las piezas pregunta), «Carrusel con IA» y el compositor (GET /api/estudio trae `sinPreguntar`)
  leen el tope con `src/lib/sinPreguntarApi.js`, recordado UN minuto (si no se puede leer, se pregunta). En el chat, la
  tarjeta del plan (`PlanDePiezas`) llega ya «creando» sin botón; si pregunta, la casilla «No volver a preguntar» la ve
  sólo el administrador (`fijarSinPreguntar`: el doble del pedido redondeado, o 3 $) y a los demás se les dice dónde.
  Encenderlo o cambiarlo lo hace PUT /api/ajustes, sólo el administrador (403 a los demás), con el mismo CHECK que la base
  (0 a 1000). Las «Recrear para…» de «Lo mejor» siguen preguntando: crean además una publicación en un día.
- **La BIBLIOTECA DE SONIDO: la música y los efectos de cada cliente y de la AGENCIA, para no pagar a Suno dos veces**
  (decisión de la agencia: «quiero ahorrar créditos… reutilizar música ya generada y subir la mía»; `src/lib/bibliotecaSonido.js`,
  `worker/lib/estudio/sonidos.js`, `worker/rutas/sonidos.js`, `BibliotecaSonido.jsx`; 0075). Cosas que no se ven en la pantalla:
  · **Lo de un cliente sigue en `estudio_archivos`, SIN migrar nada**: la categoría sale del `modelo` (`categoriaDeModelo`:
  musica-suno, musica-subida y musica-agencia son música; efecto-subido y efecto-agencia, efectos), el nombre es el `prompt`, la
  favorita el `favorito` y las etiquetas, el BPM y la duración van en `ajustes.biblioteca`. Las 8 músicas de Suno de Feria del
  Lente y las 4 de Juancito Ads salen solas (con el BPM leído de su estilo). La LOCUCIÓN también es audio y no es de la
  biblioteca (su modelo no empieza por «musica» ni por «efecto»). `vistasDelCliente` (herramientasDiseno.js) ahora pide sólo
  imágenes favoritas: con el tope de 8, una favorita de audio le quitaba sitio a las de diseño.
  · **Lo de la agencia va en `biblioteca_sonidos` y su archivo en R2 bajo `biblioteca/<espacio>/`**, que /api/media NO sirve (sólo
  `clientes/`): lo sirve GET /api/sonidos/agencia/<id>/audio con la sesión del espacio y por TROZOS (`rangoServido`; sin 206 el iPhone
  no lo reproduce). La cambian admin y editores sin clientes (`puedeCambiarAgencia`, 403 a un colaborador, como las estructuras de
  guion); la ven y la usan todos.
  · **`musicasDe` (y GET /api/videos/<c>/musicas) devuelve también lo de la agencia, marcado `de: "agencia"`**, con la forma de
  siempre (id, nombre, src, bytes, modelo, fecha, estilo) y campos AÑADIDOS (categoria, de, origen, favorita, etiquetas, bpm,
  duracion); la ruta suma `efectos`. Orden: la favorita del cliente, lo del cliente, la favorita de la agencia, lo de la agencia
  (`ordenarPistas`). galeria.js la reexporta desde sonidos.js. Quien la use (otro agente hizo «Publicar con música») sólo debe
  AÑADIR campos, nunca cambiarla.
  · **La favorita de la MÚSICA es UNA por biblioteca (la música de la marca)**: marcar otra desmarca la de antes. Un video NUEVO
  nace con ella en su sonido (`sonidoInicial` en videosProyectos.js), salvo que el guion traiga su música por su clave o el sonido
  de sus clips (un montaje que suena solo). Un video de antes no cambia. La favorita de los efectos sólo los pone primero.
  · **El sonido del video puede llevar lo de la AGENCIA**: `limpiarSonido` acepta claves `biblioteca/…` (con `de: "agencia"`) y
  `guardarSonido` busca la pista en las dos (`sonidoParaVideo`; una música del cliente sigue aceptando cualquier audio suyo, como
  antes). El render la lee de R2 sólo si es de ESE cliente o de ESTE espacio (`claveDeSonido`).
  · **Los EFECTOS de la biblioteca** van en `sonido.efectosPropios` ({ transicion, sello }; SÓLO si hay alguno: así el sonido de
  antes sigue siendo `{ efectos, musica }` igual que siempre): con los efectos encendidos, el render manda sus bytes en base64
  (`efectosPropios: { whoosh, pop }`, ≤ 2 MB cada uno) y el Container los DECODIFICA a PCM como la voz y suenan en los mismos
  instantes que los sintetizados (`muestrasDeEfecto`: mono, sin el silencio de delante ni de detrás, hasta 4 s, pico en 1) y al
  MISMO nivel (12 dB bajo la voz, por el RMS de lo que SUENA: con el del archivo entero, un efecto con silencio detrás saldría
  más fuerte). Un whoosh largo se centra en el cambio sin arrancar más de 0,5 s antes. Uno que ya no está o no se puede leer no
  tumba nada: suena el sintetizado (y el render lo dice en su aviso). Un PUT del sonido SIN `efectosPropios` (una pantalla de
  antes) conserva los que había. `container/probarAudio.mjs` lo prueba dentro de la imagen con un MP3 y un WAV subidos.
  · **Quitar una pista que usa un video lo dice**: 409 `en_uso` con cuáles (`videosQueUsan` mira el sonido de los videos del
  cliente, o de todo el espacio si es de la agencia) y sólo con `?forzar=1` se quita. La del cliente va a la PAPELERA de su
  galería (su archivo sigue 30 días: un render no se rompe; «Deshacer» la recupera); la de la agencia se borra.
  · **Copiar entre las dos no repite**: «Usar de la agencia» copia el archivo al cliente (modelo `*-agencia`, con su estilo de
  Suno en `ajustes.pedido.estilo`: así «Me gusta» la sabe repetir) y «Pasar a la agencia» al revés (para reutilizar una de Suno
  con todos los clientes); las dos por la huella SHA-256 de los bytes. Lo subido también se compara por huella.
  · **M4A se reconoce por su marca** (`tipoPorBytes`: «ftyp» con «M4A »/«M4B » es `audio/mp4`; cualquier otro, video como
  siempre). Topes: 15 MB la música, 2 MB un efecto.
  · **La duración la mide el navegador DESPUÉS de subir, de su dirección** (`conDuracion` en sonidosApi.js, y PATCH con `duracion`):
  medir el archivo antes, con un `blob:`, lo bloquea la CSP (`media-src` cae en `default-src 'self'`). Lo cazó Chromium.
  · **El director musical mira la biblioteca antes de pagar** (`lasQueEncajan` → `pistasQueEncajan`): POST …/<id>/musica y la
  cotización de Suno (el 409) traen `biblioteca`, las pistas que encajan con lo propuesto por sus etiquetas (en español, con sus
  sinónimos en inglés: el director escribe para Suno en inglés), su estilo de Suno y su BPM (también al doble o a la mitad); con el
  BPM solo no basta. «Sonido» las ofrece con «Usar esta (gratis)» y `generar_musica` dice «ANTES DE PAGAR…» para que el asistente
  las ofrezca primero. Es código, no IA: no cuesta nada. `musicas` (Claude y el asistente) lista las dos bibliotecas y
  `sonido_video` acepta `efecto_transicion_id` y `efecto_sello_id`.
  · **El tiempo real**: cada cambio avisa `sonidos` (App.jsx lo pasa como evento de `window`); la biblioteca y «Sonido» releen.
  · Lo probado: las rutas con una D1 de verdad (tests/migracion/sonidos.test.js), el audio con efectos subidos con el ffmpeg del
  sistema y la pantalla en Chromium (subir, etiquetas, la estrella, «Pasar a la agencia», «Usar de la agencia», el teléfono). Ni
  el render en Cloudflare con efectos de la agencia ni el reproductor en un iPhone.

- **«Ver el mes como se verá»: revisar MIRANDO y programar lo listo sin la aprobación del cliente** (decisión de la agencia:
  «hay clientes que no me piden revisión… y cuando reviso no le pongo "revisado"»; `src/lib/vistaMes.js`,
  `calendario/VistaMes.jsx`, lazy). Botón «Ver el mes» en la barra del calendario, «Ver y programar lo listo» en la barra de
  publicar y su bloque en «Revisar y enviar» del asistente del mes. Cosas que no se ven:
  · **«Listo» no es «aprobado»** (`estadoParaProgramar`): pieza, hora (`publishTime` escrita: sin ella la cola pondría las
  9:00 sin que nadie lo decidiera), texto si su formato lo lleva (una historia no), alguna red conectada y sin errores de
  `revisarPublicacion` para ESAS redes con `navegador: true` (el JPEG y la copia 4:5 los hace el navegador al programar). No
  cuenta lo publicado, lo que ya está en la cola (`programada`/`procesando`/`publicada`; lo que FALLÓ sí se puede volver a
  meter), «La publico yo» (`asistida`) ni los directos: van aparte, contados, no como «no listo». Lo que el cliente pidió
  cambiar (`rejected`) NO está listo. Lo pendiente con el cliente sí: si luego pide cambios, sale solo de la cola
  (`cancelarPendientes` en la aprobación pública) y la confirmación lo dice.
  · **El servidor no exigía aprobación**: `planificar()`/`programarLote` nunca miraron `status`, así que no hizo falta otra
  puerta: el botón va por `programarAprobadasDe` (prepara cada una por su lado, guarda y `POST /api/publicar/lote`) igual que
  «Programar lo aprobado». Sólo lectura lo corta `worker/index.js` (403) y la pantalla no enseña el botón. Dos casos en
  tests/migracion/publicar.test.js lo vigilan.
  · **La cuadrícula es la de HOY del perfil: 3:4 del centro** (lo que saca Instagram; `ventanaCuadricula`), con lo del mes
  arriba (lo más nuevo primero), sólo lo que sale en el FEED de Instagram (`entraEnLaCuadricula`) y debajo lo ya publicado
  ANTES del mes (`yaPublicadasEnInstagram`, de las métricas del cron, por `/api/metricas/miniatura`: la CSP no deja pintar el
  CDN). Lo publicado DURANTE el mes por fuera de la aplicación no sale: no se distingue de una del mes publicada a mano. De
  un reel, su portada (ya encuadrada) o el video en `portadaMs`; de una imagen, la copia del feed si la hay, y si no cabe en
  el feed, el MISMO ajuste del lienzo (`useAjustada`, que salió de vistaRed.jsx a hooks/useAjustada.js: un .jsx que exporta
  algo más que su componente da un aviso de oxlint). La foto de perfil es la de la cuenta conectada (por el proxy; si no
  carga, el logo).
  · **Tocar un aviso y volver**: `abrirDesdeLista(postId, volver)` de CalendarView guarda `volver` (vista, filtro,
  publicación) en el `sidePanel`, y `cerrarPanel` (el fondo y el botón de cerrar del panel) reabre la vista con eso. Quitar o
  mover la publicación desde el panel no vuelve (el `sidePanel` se va con su `volver`).
  · **En el feed las flechas pasan de publicación** salvo dentro de lo que las usa (campos, video, la barra de pestañas), y
  deslizar pasa de publicación salvo DENTRO de un carrusel (`[data-carrusel]`), que ahora se desliza con el dedo en
  vistaRed.jsx (también en el panel). El texto de Instagram abre entero con «más».
  · **El enlace del cliente** («Tu perfil» → «Así se verá tu perfil», pages/Aprobar.jsx) usa la MISMA `cuadriculaDelMes`
  sobre lo que el servidor ya le deja ver (`visibleParaCliente`), con `srcPublico`; sin lo ya publicado (su proxy pide
  sesión). Antes eran 4:5, con las historias fuera pero con lo que iba sólo a otras redes dentro, y el video en vez de la
  portada de los reels.
  · **Los estilos de la vista previa de cada red salieron de publicar.css a vistaRed.css** (con su componente): la vista del
  mes no carga los 36 kB del panel.

## Documentos relacionados

- `docs/propuesta-estudio-y-meta.md` — el Estudio de Agents Office —imagen y video por trabajos,
  por cliente— y Meta (Muse Spark) como proveedor de la IA de texto. Implementado: el Estudio
  entero (imágenes y video por Google, fal.ai y Higgsfield; «Crear con IA» y «Animar» en el panel
  de la publicación y en «Subir»; las herramientas del asistente y del MCP; el cerebro para imagen;
  la lista de modelos ordenable). Pendiente: toda la parte de Meta como proveedor de texto, y
  probar fal.ai y Higgsfield con una llave real.
- `DEPLOY.md` — puesta en producción en Cloudflare: Worker, D1, R2 y el corte.
- `docs/auditoria-ux-ui.md` — auditoría de UX, UI, responsive y accesibilidad,
  con lo corregido y lo pendiente.
- `docs/migracion-cloudflare.md` — plan para mover la aplicación de Supabase +
  Netlify a Cloudflare (D1, R2, Workers). Escrito sobre la base viva, no sobre
  el repositorio: incluye dónde los dos no coinciden.
- `docs/propuesta-publicacion.md` — propuesta para la experiencia de publicar
  (Flow a 4:5, historias, colaboradores, página de programación, MCP).
- `docs/propuesta-idea-programada.md` — aprobar la idea o la pieza final, y el
  paso final antes de programar lo aprobado. Implementada (sin que salga sola).
- `docs/propuesta-equipo.md` — trabajar en equipo en tres fases (responsables,
  avisos, hilo, etapas, revisión interna, tablero, historial, papeles, carga).
  Implementada.
- `docs/propuesta-calendario-continuo.md` — un calendario siempre activo (sin crear
  uno por mes), capas de planificación, fuera categorías; qué limpiar; el móvil.
  Fase 1 y la limpieza, implementadas; fases 2 a 4, pendientes.
- `docs/hub-cloudflare.md` — plan del hub donde este calendario pasa a ser una
  herramienta más, junto al bot y la tienda que ya están en Cloudflare.
- `docs/propuesta-higgsfield-con-claude.md` — lo que el MCP de Higgsfield hace «con Claude» (recetas, flujos,
  galerías, modelos), qué es exclusivo suyo, qué ya tiene el calendario y la estructura para hacerlo aquí: recetas como
  dato, «Crear con Claude» con handoff, el director y el lote por MCP con imágenes en el resultado, terminar en el
  Container lo que hoy necesita la pantalla y que el render acepte video. Investigación hecha (sólo lectura, sin gastar
  créditos). Hecho: el video animado (render, música, subtítulos, ver un cuadro por MCP). Lo que falta, por fases A–H
  y comparado con `main` del 2026-11-05, en su §10.
- `docs/propuesta-lo-mejor-y-creacion.md` — «Lo mejor del momento» (una galería de lo que mejor funciona, de la
  competencia, la inspiración, los anuncios y lo propio, para recrearlo con un clic) y la auditoría de toda la creación
  de contenido: caminos que no aplican las mismas reglas, puertas y nombres de más, motor de textos, video y navegación,
  con el plan por fases. Propuesta; nada implementado.
- `docs/propuesta-curso-campanas.md` — el curso de campañas de Meta Ads de la agencia (Parte 1: interacción a
  WhatsApp) cruzado con la app: qué está y qué falta. La dirección: las campañas se MONTAN en el Ads Manager y el
  calendario planifica, escribe y vigila (la creación por API, congelada). Fases: lo que va a pauta nace como anuncio
  (`post.pauta`, textos de anuncio), número mágico y 3 Q sobre lo que corre en el Ads Manager, la campaña completa
  sugerida con su guía de montaje, qué pieza es cada anuncio, WhatsApp. Las cuentas son las de la agencia (los Excel
  del curso y la calculadora de deeplook), con sus fórmulas confirmadas. El PLAN FINAL (§5: cómo queda cada pantalla,
  los datos y 8 entregas en orden) está aprobado y las ocho entregas, implementadas (sin probar contra Meta ni la IA reales). Se amplía con cada parte del curso.
- `docs/propuesta-cerebro-por-cliente.md` — un cerebro por cliente (notas en D1, índice
  en R2, ficha técnica y cifras, búsqueda por pasajes) en lugar de volcar el ADN entero
  en cada llamada. Fases 0 y 1 implementadas; memoria de decisiones, visualización,
  PDF/Word/Excel, Estudio, Meta y el puente con Agents Office, pendientes.
