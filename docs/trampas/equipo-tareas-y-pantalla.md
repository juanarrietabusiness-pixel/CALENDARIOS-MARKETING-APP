# Trampas conocidas · Equipo, tareas e interfaz

**Qué cubre:** Mi día y las tareas, avisos, papeles, el panel lateral, la navegación y las pestañas, componentes (interruptor, desplegables, fechas, horas) y reglas de la interfaz.

**Cuándo leerlo:** Antes de tocar Mi día, la campana, el equipo, la navegación o un componente compartido de la interfaz.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

- **Una hora que el campo no entiende se guarda igual y desaparece.**
  El modelo escribe «9am», «9:00 PM» o «21:30» según le venga. Si eso
  entra tal cual en `publishTime`, el `<input type="time">` —que exige
  «HH:MM»— lo muestra **vacío**: la IA dice que puso la hora, la fila se
  guardó, y la publicación no tiene hora. Lo normaliza
  `normalizarHora()`, y lo que no entiende se RECHAZA con un mensaje en
  vez de escribirse.
- **Interruptor o casilla: una regla, un componente** (`components/Interruptor.jsx`). Interruptor para lo que se enciende,
  se QUEDA y surte efecto al momento (la bandeja, las historias automáticas, «Programar al aprobar», crear sin preguntar,
  las tendencias, el informe automático, «Se va a pautar»…); casilla para escoger de una lista o una opción de un
  formulario que se confirma con un botón (por eso los efectos de «Sonido» siguen en casilla). El `.toggle` de antes
  estaba copiado en siete sitios y apagado era `--border` (~1,3 : 1 contra el fondo: sólo se veía una bolita). Ahora el
  riel apagado lleva borde del color del texto secundario, dice «Sí» / «No» al lado, desactivado se ve desactivado y
  puede decir por qué (`motivo`), y el botón mide `--tap` de alto aunque el riel mida 24 px. No vuelvas a escribir uno a
  mano: `FilaInterruptor` (con su `<label>` del botón) o `Interruptor` con `etiquetadoPor`.
- **Un desplegable anclado a un botón NO es `role="dialog"`.** Ese rol
  le promete a un lector de pantalla foco atrapado y fondo inerte. El
  selector de hora se cierra con Escape y con un clic fuera, y el fondo
  sigue navegable a propósito: es `role="group"`. Poner el rol de
  diálogo «porque flota» obliga después a meter un `useDialogA11y` que
  rompería justo lo que hace que funcione.
- **Sacar a alguien del equipo borra su cuenta, no sólo su pertenencia.**
  Dejar la cuenta viva sin fila en `memberships` es peor: al volver a
  entrar, la resolución de espacio la trata como un administrador sin
  sitio y le funda un espacio propio y vacío. La persona ve una
  aplicación que funciona y no tiene nada dentro, y nadie sabe por qué.
  Al fundador no se le puede sacar: ahí la cascada sí se llevaría los
  clientes y los calendarios, que cuelgan de su id.
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
- **Un chip de alternar con `aria-pressed` no se pintaba.** `.filter-chip`
  sólo tenía estilo para `.active`, así que las redes elegidas en Subir se
  veían IGUAL que las no elegidas: una historia pensada sólo para
  Instagram salió también en Facebook. Ahora `index.css` pinta también
  `[aria-pressed="true"]`, y las redes son tarjetas con casilla
  (`DestinoRedes`) con la frase «Sale en… No sale en…» (`resumenDestino`,
  lib/subir.js), repetida junto al botón de programar.
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
- **La hora se escribe.** El desplegable de flechas se salía de su caja en
  el panel estrecho. `TimePicker` es ahora un campo que entiende «9»,
  «930», «21:30» o «9:30 pm» (`leerHoraEscrita`, lib/horas.js) con a. m. /
  p. m. al lado; lo que no entiende no se guarda: se dice.
- **Cambiar de cliente no cambia de pestaña** (`rutaDeOtroCliente`): en
  Resultados, Estudio, Contenido… se va a la misma pestaña del otro
  cliente; en el calendario, al mismo mes.
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

- **«Primeros pasos» pregunta a una ruta LIGERA, no al semáforo del kit.** El semáforo (Marca) lee GET /api/estudio —la galería
  entera, con comprobaciones en R2— y GET /api/cerebro —todas las notas—: pedirlo cada vez que se abre un cliente sería caro.
  · GET /api/primeros-pasos/<cliente> (worker/rutas/primerosPasos.js) hace la fila del cliente y cuatro lecturas cortas (una fila
    del estudio de mercado, UNA nota de tipo ficha, sus cuentas y los TRES meses más recientes) y devuelve banderas. Un paso nuevo
    se añade en `estadoDePrimerosPasos` y `pasosDelCliente` (src/lib/primerosPasos.js), no leyendo más en la pantalla.
  · «Completo» se recuerda POR NAVEGADOR (`primeros-pasos:<cliente>` = «listo» u «oculto»): desde entonces ni se pide. Si algo
    vuelve a faltar (se borra el logo), la lista NO vuelve: para eso está el semáforo de Marca.
  · Se relee con cada `pulso` (cualquier cambio del espacio): por eso es ligera. El componente va con `key` por cliente.
  · «Escribir el catálogo» / «Hacer el estudio» llevan a Marca → Cerebro con `?mercado=catalogo|estudio`: Marca lo lee al montarse
    y con cada `popstate`, abre el estudio en esa pestaña y limpia la dirección (como `?lote=` en el Estudio).
- **El glosario va en un PORTAL.** El menú de la cuenta vive en la cabecera, que es `sticky` con su propio z-index: un `.overlay`
  dentro quedaría por debajo de lo demás. Al cerrarlo, el foco vuelve al avatar a mano (el botón que lo abrió ya no existe: el menú
  se cerró). Un nombre de botón que cambie tiene que cambiar en src/lib/glosario.js: su test lo compara con la pantalla.
- **El número rojo de «sin publicar» está DOS veces montado** (la barra lateral y la barra de abajo del teléfono, las dos siempre
  en el DOM): ContadorFallidas comparte la petición por `pulso` (3 s) para no pedir dos veces lo mismo.
- **«Ver diagnóstico» del menú «⋯» del calendario es sólo del administrador** (era un resto interno a la vista de todos).
- **`hashtagsDe` vive en completitud.js, no en exportarContenido.js.** completitud.js va en la carga inicial (el chip del mes) e
  importarla de exportarContenido.js metía ese módulo entero —que sólo usa el diálogo de exportar— en el arranque (~700 B
  comprimidos). exportarContenido.js la reexporta: lo de antes sigue importándola de allí.
- **La prueba de humo en el navegador necesita el dist/ y Playwright, que NO son dependencias del proyecto.**
  · En CI y al desplegar los instala el paso «Chromium para la prueba de humo» (`npm install --no-save playwright@1.63.0` +
    `npx playwright install --with-deps chromium`), antes de `test:vivo`. Si cambia la versión de Playwright, cambia en los dos
    workflows.
  · Con `CI=true` la prueba FALLA si no puede correr (sin Playwright, sin Chromium o sin dist/). En local, lo dice y se salta.
  · Lo carga con `createRequire` (CommonJS), no con `import()`: en local Playwright está en NODE_PATH, que ESM no mira.
  · La única queja de consola que se perdona es el 401 de /api/yo antes de entrar. /aprobar pide primero el nombre de quien
    revisa: la prueba lo escribe. La idea de una publicación NO sale en el enlace del cliente (sí el texto).
- **El conector de Claude (herramientasEquipo.js) sólo lee, salvo marcar los avisos propios.**
  · `enlace_del_cliente` nunca crea ni regenera el testigo: si el mes no se compartió, lo dice (se crea con «Enviar al cliente»). El
    mensaje es `mensajeDeEnvio` con las respuestas del cliente APLICADAS (`conAprobacion` sobre `approvals`), no el `status` de los
    días. No marca nada como enviado: eso pasa al copiar en la aplicación.
  · Las direcciones van con el origen del conector: `crearHerramientasMCP` recibe ahora `origen` (worker/rutas/mcp.js le pasa
    `origenDe(req)`). Sin él (tests), en relativo.
  · `ver_avisos` está anotada de sólo lectura aunque `marcar_leidos` escribe: sólo toca los avisos de QUIEN CONECTA (como la
    campana, que también deja a quien es de sólo lectura).
- **La vista previa se salía de la pantalla (25-nov-2026).** En «Ver el mes» → Feed y en el panel → Publicar («Así se va
  a ver»), la imagen iba siempre al ancho del teléfono de la vista previa (320–380 px): un 4:5 medía 475 px de alto, un
  reel 675, y con la cabecera y la navegación se salía por abajo en el celular y en una laptop; había que achicar el
  navegador (en el teléfono, imposible). Ahora `vistaRed.jsx` mide el alto visible del contenedor que se desplaza, resta lo
  que va encima de la imagen desde el bloque que tiene que caber (`encajar`: `.vm-feed` con su navegación, `.pp-vista` con
  su título; por defecto, la propia vista previa) y deja el teléfono tan ancho como permita la imagen ENTERA con su forma
  (la de la imagen o el video cargados; 9:16 en las verticales), nunca por debajo de 200 px. El tope de cada sitio va en
  `--vr-tope`, no en `max-width` (pisaría el cálculo). Y en el Feed, la miniatura escogida de la tira se centraba con
  `scrollIntoView`, que también desplazaba la pantalla hasta la tira: al pasar de publicación, la nueva quedaba cortada por
  arriba. Ahora la tira se mueve sólo de lado y la publicación nueva se ve desde arriba. Probado en Chromium a 390 px,
  1366×768 y 1920×1080 (tests/vivo/navegador.test.js lo comprueba).
