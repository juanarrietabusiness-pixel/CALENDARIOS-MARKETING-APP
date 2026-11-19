# Trampas conocidas · El calendario y el motor de textos

**Qué cubre:** El mes, las semanas, el plan semanal, la estrategia del mes, el motor de ideas y de textos (modos plan, campos, publicación), las fechas especiales, UGC y estructuras de guion, repetir, el asistente del mes.

**Cuándo leerlo:** Antes de tocar `worker/lib/estudio/lote.js`, `src/lib/loteAnuncios.js`, `camposTexto.js`, `asistenteMes`, `PlanWizard` o el calendario.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

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
- **Rellenar no es reescribir.** «Generar guiones» sólo escribe donde no
  hay nada: lo que ya tiene texto gana sobre lo que devuelve el modelo.
  Y lo que le falta a una publicación depende de su formato —un post sólo
  lleva caption; un reel, además, guion—, así que un reel que llega del
  asistente con la descripción escrita sigue entrando a por su guion.
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
- **«Producir el mes» es el botón grande del calendario** y abre el ASISTENTE DEL MES (fase 6; ver «El mes en un solo
  flujo», al final). El lote del mes del Estudio (`?lote=mes&mes=AAAA-MM`: Estudio lo lee al montar, abre el lote en «Mes
  completo» con ese mes y quita la búsqueda de la dirección) sigue, desde el paso Plan del asistente («Otras formas de
  planificar»). `ProducirElMes.jsx` (la pregunta «crear o diseñar») se quitó: la hace el asistente.
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
- **La lista va por semanas plegables; el mes del móvil se queda.** La
  lista era los treinta días seguidos: interminable en el teléfono. Ahora
  `agruparPorSemana()` (lib/semanas.js) la parte por la semana del
  calendario (`weekNumber`, la del concepto) —o la natural de lunes a
  domingo si el día no la trae—, con su resumen, y sólo se abre la semana
  de hoy. La rejilla del mes en el móvil NO se quita: la agencia la
  prefiere a la lista.
- **El calendario abre en «Mes», también en el móvil.** La lista por
  semanas sigue a un toque.
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
- **Las ESTRUCTURAS DE GUION también las crea y corrige Claude por MCP** (`guardar_estructura`, `eliminar_estructura` en
  worker/lib/estudio/herramientasVideo.js). No hay otro modelo de datos: van por las MISMAS funciones que la ruta de
  Ajustes → Cómo trabajamos (`guardarEstructura`, `quitarEstructura`, `puedeCambiarEstructuras` en
  worker/lib/estructurasGuion.js; la ruta /api/formulas-ugc las usa también), a la misma tabla `formulas_ugc`, con la misma
  validación (`limpiarFormula`) y el mismo permiso (admin o editor sin clientes; el sólo lectura ni las ve como escritura) y
  el mismo aviso `formulas-ugc` (la pantalla relee). Lo que manda Claude —tramos con nombre, papel, PESO y ejemplo— se pasa
  a la forma de siempre con `estructuraDeTramosConPeso` (src/lib/formulasUgc.js): «Nombre — papel. Ej.: «…»» en `funcion`
  y su tramo en segundos sobre la duración original por su peso. `variantes` es un campo nuevo y OPCIONAL de la estructura
  (sólo se escribe si lo hay: una de antes no cambia), con su casilla en el editor de Ajustes y su línea para la IA.
  `ver_estructuras` da el ID de cada una («(ID …)») para corregirla o pasarla como `estructura_id`. `eliminar_estructura`
  es destructiva y su descripción dice que sólo si la persona lo pidió.
- **La FORMA del gancho la escoge el CÓDIGO, no la IA; los ángulos y el lenguaje del cliente llegan al motor de ideas**
  (`src/lib/formasGancho.js`, `darForma` y `lineaDePieza` en loteAnuncios.js, `formasQueRinden` y `recientesDelCliente` en
  worker/lib/estudio/lote.js; sin migración). Dejada a la IA, todos los ganchos salían con la misma pregunta. Lo que no se ve:
  · **Una forma por casilla**, como la composición o la estructura del carrusel: no la de la vecina, que encaje con el nivel
  (si no queda ninguna, se relaja primero la voz y luego el nivel), en pauta sólo las que sirven (`pauta: false` fuera), las
  que piden un dato real (`requiereDato`) sólo si el estudio o el catálogo traen pruebas o cifras (`hayDatosReales`) y,
  entre las que quedan, la menos usada en los últimos 3 meses del cliente (la MISMA lectura que las estructuras del
  carrusel). Una casilla que ya trae una forma válida la conserva. La línea de la pieza dice «forma del gancho: «X» — cómo;
  va en el caption / la portada / el primer segundo» y la táctica (`TACTICAS`) sigue al lado: la táctica es QUÉ empuja, la
  forma CÓMO se dice. La idea vuelve con `porque` (≤ 160, se enseña en el lote) y la publicación guarda `post.formaGancho`
  (`publicacionDePieza`, `rellenarConIdea`, `publicacionDelPlan`; `reemplazarConIdea` la cambia con «Otra»). En «campos»
  la forma sólo se guarda si se escribió un campo donde va el gancho (`CAMPOS_GANCHO`) y la publicación no tenía.
  · **Aprender sólo con muestra**: `formasQueRinden` mira primero si hay al menos `MIN_SENALES_FORMA` (6) publicaciones con
  forma y maduras (5 días); sin eso no lee nada más (cero consultas extra). Con eso, la cola (lo publicado como post) y las
  métricas orgánicas, y el «rinde» de cada una es el de «Lo mejor» (`rindesDePropias`: contra la mediana de su cuenta).
  Una forma con 3 piezas o más que rinde ≥ 1,2× es buena (va en una de cada dos casillas) y ≤ 0,75×, mala (no sale si
  quedan otras dos). Las publicaciones de antes no tienen forma: hasta que se acumulen, nada cambia.
  · **Los ángulos de venta** del estudio APROBADO (`angulosDeProducto`, del agente del estudio de mercado) se leen en el
  servidor y pasan a `darForma`: «frío» en los niveles fríos, «tibio» en los demás, sin repetir el de la vecina; su línea
  (`lineaDeAngulo`) se arma en el Worker para que loteAnuncios.js no arrastre el estudio de mercado. La publicación guarda
  `post.angulo`. Sin ángulos (un estudio de antes), nada.
  · **El lenguaje del cliente** es la nota del cerebro por su ruta (`RUTA_LENGUAJE`; o por su título si se escribió a mano),
  hasta `MAX_LENGUAJE`, en TODOS los modos (niveles, matriz, tipos, mes, plan, publicación, campos), con la regla «usa SUS
  palabras; no inventes citas ni testimonios». Una nota interna no cuenta.
  · **Las reglas del gancho son código y sólo avisan** (`problemasDelGancho`, en «Revisar el mes»): una cifra del gancho
  (%, dinero, «3×», «500 clientes») que no está en el catálogo, el estudio ni la idea, y frases de miedo de una lista
  ESTRECHA (una lista ancha avisaría de todo y se dejaría de leer). Sin catálogo ni estudio cargados la cifra NO se mira
  (todas serían «inventadas»); los años y los teléfonos no son cifras; lo que ya avisó la regla del precio no se repite. Lo
  personal sigue en `pauta.js`. El pedido las prohíbe en una línea (`REGLA_GANCHO`): no se reescribe ni se bloquea nada.
  · **UGC: tres ganchos con tres formas distintas** (`formasParaGanchos`, la primera es la de la pieza); viajan en la
  casilla (`formasGanchos`) sólo para el pedido y no vuelven en la respuesta. Pedir sólo los hashtags no lleva ni forma ni
  ganchos.
  · **El reel por planos** recibe UNA sugerencia de gancho visual para el primer plano (`ganchoVisualPara`, por la semilla
  de la idea; los que piden el producto sólo si lo hay), salvo que siga una estructura o el guion de la publicación.
  · **Nada de esto se ha probado contra Anthropic real**: tests/migracion/formasGancho.test.js usa un `fetch` de mentira y
  una D1 de verdad.
- **Por el conector, los textos van por el MOTOR o con su MÉTODO, nunca a pelo** (`worker/lib/herramientasTextos.js`). Claude
  escribía los textos él mismo y los guardaba con crear_publicacion/editar_publicacion: el calendario los guardaba tal cual y se
  saltaba el estudio de mercado, el precio exacto, los ángulos, la forma del gancho, el lenguaje del cliente y la regla del
  anuncio. Cosas que no se ven:
  · **`produccionDeLote` está partido en dos** (worker/lib/estudio/lote.js): `pedidoDelLote` ARMA el pedido (lecturas, darForma,
  el texto) sin llamar a la IA ni escribir, y `produccionDeLote` lo manda y lee la respuesta. El comportamiento de la ruta no
  cambió (un test lo compara). escribir_textos usa las dos; **ficha_de_textos sólo la primera** y devuelve el pedido ENTERO
  (con su JSON del final, que es para la IA del calendario: la ficha le dice a Claude que guarde cada campo con
  editar_publicacion). Si pasa de `MAX_FICHA` (25.000 caracteres), la tanda baja una vez.
  · **Qué se escribe es UNA selección** (`seleccionar`): con una publicación y `campos`, el botón «IA» (`camposConSuBoton`: con el
  caption, los hashtags y los textos de anuncio si faltan; esos campos se REESCRIBEN y la respuesta trae lo que había); vacía
  (sin idea), el modo «plan» entero, como el paso de las ideas del asistente del mes (`casillasSinIdea` + `conIdea`); si no,
  `textosQueFaltan` por el modo «campos». Con un mes, primero las vacías del plan y luego lo que les falta a las demás, una
  tanda de 6 por llamada y «Quedan N» (cuenta también los textos de anuncio de lo que va a pauta). Lo publicado no se toca.
  La semilla es estable por mes (la misma forma en cada tanda) y la estrategia viaja como en la pantalla (`estrategiaDe`).
  · **Se escribe sin pisar a nadie** con `cambiarCalendario` (ponerEnPost.js): el `updated_at` leído como condición, dos vueltas
  releyendo, sólo las columnas que cambiaron, `resincronizarCalendario` y `calendario:recargar`. Sobre lo releído: una vacía
  que otra persona escribió mientras la IA pensaba ya no se rellena. Si no se puede escribir, la tanda ya se cobró (se dice).
  · **preparar_mes NO pide confirmación** (como crear_publicacion): sólo pone casillas vacías en días LIBRES; los ajustes de
  temporada se aplican por defecto (como el lote del mes); con `llenar_ocupados` no pone dos veces lo que el plan ya puso
  (días con `delPlan`). Lo que va a pauta solo sale con `auto` y se quita con editar_publicacion (`pauta: false`).
  `planDelAsistente`/`matrizDelPlan`/`pautaDelPlan`/`publicacionesDelPlan` (lib/asistenteMes.js) son lo que antes vivía dentro
  de PasoPlan de AsistenteMes.jsx: la pantalla y el conector los llaman igual. El paso del asistente que se guarda no
  retrocede (`Math.max`): guardar la estrategia en un mes ya escrito no lo devuelve al «Plan».
  · **estrategia_del_mes guarda SÓLO con `confirmado: true`** («NO SE GUARDÓ NADA» y lo que se guardaría); lo que no se pasa se
  queda como estaba. Proponer es `estrategiaDelMes` (la misma de POST /api/estudio/<c>/estrategia) y no guarda nada.
  · **La revisión al guardar es la de «Revisar el mes»** (`contextoDeRevision` + `revisionDelMes`: una regla, un sitio, también
  para revisar_mes): crear_publicacion y editar_publicacion, si cambió algún texto (o la pauta o el anuncio), devuelven «AVISOS
  DEL CALENDARIO» con cómo arreglarlo o «Revisado: sin avisos». Sin lo que falta para enviar sin contenido (eso es de
  revisar_mes). Lee el catálogo y el estudio una vez, y los números del negocio sólo si va a pauta; si falla, una línea.
  · **«Revisar el mes» avisa ahora de los hashtags al FINAL del caption** (lib/revisionMes.js, código «hashtags»): salían dos veces
  al publicar. En lo que va a pauta lo dice su revisión de anuncio (no se repite).
  · **El motor escribía «la que había y NO sirvió: «[object Object]»» en TODO pedido del modo «campos»**: el `antes` de
  casillaDeCampos es un objeto (lo que tiene cada campo) y lineaDePieza lo leía como el texto de «Otra». pedidoDeCampos lo
  pasa vacío; un test lo vigila.
  · **editar_publicacion acepta `forma_gancho` y `angulo`** (validados: `formaDe`, id corto), `escena` y `anuncio`
  (`limpiarAnuncio`): son los ids que da ficha_de_textos y, sin ellos, el aprendizaje de qué forma le rinde a cada cliente no
  tendría con qué contar lo que escribió Claude.
  · **En el navegador, ideaPublicacionPura.js sólo lo importa ideaPublicacion.js** (las pantallas siguen importando de
  ideaPublicacion.js, que lo reexporta): con un segundo importador, rollup lo saca a un chunk propio que entra en la lista de
  precarga del chunk del Estudio, y eso solo (unos 25 bytes) lo pasaba de su tope de 20 kB (está en 20,49). El Worker sí
  lo importa directo.
  · **Nada de esto se ha probado contra Anthropic real**: tests/migracion/textos.mcp.test.js usa un `fetch` de mentira y la D1 de
  verdad.

- **El motor de textos escribe de DOS en DOS, con lo fijo en la caché, y la primera llamada va sola** (`escribirTanda` en
  worker/lib/estudio/lote.js; `partesDeProduccion`/`partesDeCampos`). Antes, 6 piezas con 9 campos en UNA respuesta: cada
  pieza recibía muy poca atención. Cosas que no se ven:
  · **Lo FIJO (papel, ficha, estrategia, contexto, campos y reglas) sale de la TANDA entera (`planTodo`), no de las piezas de
    la llamada:** si saliera de cada grupo, cambiaría entre llamadas y la caché no se leería nunca. Lo de cada llamada (el
    encabezado «Escribe N…», las piezas, lo ya usado y el JSON) va DETRÁS de la marca de caché. El revisor usa el MISMO
    bloque fijo, con el mismo arco (`armar(plan, { planTodo, arco })`): si se arma con otro `planTodo`, deja de leer la caché.
  · **La primera llamada va sola** (escribe la caché y sus titulares van a las demás como «ya salieron»); las demás, de
    LLAMADAS_A_LA_VEZ (3) en 3. Con todas a la vez ninguna leería la caché.
  · **Una sola pieza (el botón «IA» de un campo) va como antes:** un texto, sin caché y sin revisor. La caché sólo se marca
    si el bloque se va a reusar (escribir la caché cuesta un 25 % más).
  · **Cada llamada sólo aporta las piezas de SU grupo** (aunque la IA devuelva otros números).
  · Sin presupuesto (402) se dice a la primera: las demás llamadas no se intentan. Si una llamada falla por otra cosa, la tanda
    sale con lo que llegó (las que no salieron siguen sin idea y se escriben la próxima vez).
  · El conector de Claude (`ficha_de_textos`) sigue recibiendo el pedido ENTERO en un texto (`pedido.prompt` = fijo + piezas).
- **La ficha de diseño «imagen» ya NO la escribe el motor de textos** (por defecto; `conFicha: true` la pide). Se comía la
  mitad de la salida y el director de arte la rehace al diseñar. Lo que se pierde: el respaldo `promptListo(post, { cualquiera:
  true })` (ProducirMes, `delRedactor` de loteServidor) cae en `ideaSinMejorar` (escena + texto exacto) cuando el director
  falla o «Mejorar» está apagado. Las publicaciones de antes conservan su borrador.
- **El gancho y el ángulo son OPCIONES, no una orden** (`darForma` → `opciones: { tacticas, formas, angulos }`). La sugerida
  del código va primero y lleva su id entre corchetes; las otras 1–2 cumplen las mismas reglas (su nivel, la pauta, los datos
  reales, ni la de la vecina ni las que no le rinden). La IA dice cuál usó en "tactica", "forma" y "angulo"; sólo vale una de
  SUS opciones (`escogidoDe`), si no, la sugerida. Lo que ya trae la casilla (forma o ángulo puestos) y una UGC (sus 3 ganchos
  dependen de su forma) van FIJOS. En el modo «campos» no se ofrecen tácticas (no vuelven). Las líneas «forma del gancho: «X» —
  …» siguen igual (los tests las cuentan): las otras van en «otras formas que también valen aquí».
- **La VARIEDAD se corrige con el revisor, no sólo con la etiqueta** (`choquesDeVariedad`): si dos vecinas escogieron lo
  mismo, el código le da a la segunda otra de SUS opciones y el revisor reescribe su gancho con ella; la etiqueta nueva SÓLO
  se pone si el revisor la reescribió. Cambiar la etiqueta sin el texto mentiría a lo que aprende qué forma rinde.
- **El PLANIFICADOR del mes** (`planificarMes`, función «planificador del mes», hueco del ASISTENTE: el modelo del chat y su
  nivel de razonamiento). Corre en el modo «mes» y en «plan» con `planificar: true` (el asistente del mes, «Mes completo» con
  plantilla y `escribir_textos` de un mes por el conector), con 4 casillas o más. Cosas que no se ven:
  · **Se guarda en R2** (`planificador/<espacio>/<cliente>/<AAAA-MM>.json`, fuera de `clientes/`), por clave de casilla y con
    su FIRMA (formato, tipo, producto, nivel, fecha): las tandas siguientes lo reusan sin pagarlo; vale HORAS_PLAN (12 h). Una
    casilla con la misma clave pero otra firma (otra sesión de «Planificar mes») no lo hereda.
  · **Planifica hasta 40 casillas por llamada** desde la tanda que pide; lo que no entra se planifica en la tanda que llega a
    ello, con lo ya planificado delante («YA PLANIFICADAS») para seguir el arco.
  · `pedidoDelLote` (también `ficha_de_textos`) APLICA lo guardado sin llamar a ninguna IA; sólo `produccionDeLote` planifica.
  · **Las casillas del modo «mes» no traen clave**: se guardan por `claveDeCasilla` («fecha|n», el número en el plan ENTERO,
    que no cambia entre tandas porque el plan sale igual con la misma semilla). Con `r.clave` a secas todas iban a «undefined».
  · Si falla, se escribe sin él (el redactor escoge entre las opciones).
- **El REVISOR** (`revisarTanda`, función «crítica de textos», hueco de redacción) va en toda tanda de 2 piezas o más y
  reescribe SÓLO lo que no pasa su guía (de cualquier marca, gancho débil, nivel, repeticiones, llamado a la acción, regla del
  anuncio). Sólo puede tocar los campos de escritura (nunca la forma, el ángulo ni la táctica); en «campos», sólo los que se
  pidieron. Lo reescrito pasa por el MISMO lector (`leerIdeas`/`leerCamposDe`: precio, hashtags aparte, 3 hashtags en pauta).
  Si falla, la tanda sale igual. La respuesta trae `revisadas` (cuántas reescribió).
- **El contexto por BLOQUES** (`repartirContexto`): ficha, pautas, estudio, lenguaje, pasajes, rubro y ejemplos, cada uno con
  su tope; lo que un bloque no usa pasa a los que se cortaron, en ese orden. Antes se juntaba todo y se cortaba a 6.000: los
  pasajes y el rubro (lo último) a veces no llegaban. Quien llama con el `contexto` de antes (un texto) sigue igual.
- **Los EJEMPLOS del cliente** (`ejemplosDelCliente`): 3 aprobadas (por `approvals` de sus 4 últimos meses o por su estado) y
  2 que rindieron ≥ 1,2× la mediana de su cuenta (`metricas_publicacion.texto`, últimos 180 días), sólo con texto. Dos lecturas
  en cada tanda. Van como TONO, «no copies».
- **El control de calidad ya no cuenta las anotaciones del propio revisor** (`limpiarLeido` en src/lib/control.js): «Sofá cama
  (no debía aparecer)», «OFERTA [sobra]», «… — repetido» se quitan de lo leído y de los errores de la IA (sólo lo que va entre
  paréntesis, corchetes o tras una raya y DICE algo del revisor: «(507) 6000-0000» se queda). Con texto pedido, lo que la IA
  dice que SOBRA no cuenta (como el código: el logo y la etiqueta del producto también traen letras; un precio inventado lo
  dice «precios»). Sin texto pedido, el texto inventado sí cuenta.
- **El control razona poco a propósito** (`esfuerzo` en worker/lib/estudio/control.js: «low» sin ficha, «medium» con la ficha
  del director) y pide un JSON compacto: con el nivel «alto» del espacio cada revisión escribía ~3.300 tokens (casi todo
  razonamiento) para un veredicto. Una clave omitida se lee como vacía (el contrato con quien lo usa no cambió).
- **Las reglas de estilo del cliente van enteras** (`textoDelCliente`, src/lib/loteAnuncios.js): estilo de textos y de
  locución hasta `MAX_ESTILO_CLIENTE` (1.500), hashtags hasta 600. A 300 se cortaban a media palabra (la de D'CASA terminaba
  en «emocional/familias (I»).
- **Una pieza sin tipo no está «decidida»**: `lineaDePieza` imprimía «· : » y «nivel: —» bajo una cabecera que decía «YA
  decidido». Ahora dice «tipo de contenido: SIN DECIDIR (escógelo tú…)» y la cabecera avisa de que lo «SIN DECIDIR» lo escoge
  quien escribe. Por qué hay piezas sin tipo (las crea `crear_publicacion` sin él) no se tocó.
- **La ficha (y escribir_textos) no ofrecen los días que ya pasaron** (decisión de la agencia, 19-11-2026, `seleccionar` en
  worker/lib/herramientasTextos.js, con el «hoy» de Panamá): lo que no salió su día ya no sale y escribirlo gastaba la tanda.
  Una publicación concreta (`publicacion_id`) sí se escribe. Si un día la agencia quiere rellenar el pasado, es esa línea.
