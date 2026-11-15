# Trampas conocidas · Anuncios, campañas y el negocio

**Qué cubre:** El curso de campañas, el plan de campañas, la revisión 3Q, lo que va a pauta, el número mágico, los números del negocio, las ventas, WhatsApp, el estudio de mercado y el catálogo.

**Cuándo leerlo:** Antes de tocar `src/lib/planCiclo.js`, `tresQ.js`, `numerosNegocio.js`, `estudioMercado.js` o Anuncios.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

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
  La etapa sugerida va por el nivel: el `decision` de la app es «listo para comprar» (conversión; ver la entrada del número
  mágico).
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
- **El plan de campañas es EL sitio de la estrategia, también de los ANUNCIOS y sus textos** (decisión de la agencia del 14
  de noviembre; `src/lib/anunciosPlan.js`, `src/lib/textosNivel.js`, `AnunciosDelPlan.jsx`). Lo que no se ve en la pantalla:
  · **Lo guardado del plan de un mes** (`planes_campana`, `datos`): `ajustes.que` («¿Qué vas a hacer?»: `campanas` —vacía =
  el ciclo de la cuenta—, `productos` «foco» | «varios» | «todos», `productoIds`, `logro`) y `anuncios` ({ "<campaña>:a<n>":
  { pieza: { calendarId, postId } | nuevo: true, como: "publicacion" | "subir", textos: la forma de `post.anuncio`, editado?,
  ia?, por, at } }), fundido hueco a hueco (`fundirAnunciosPlan`: otra publicación borra los textos de la anterior; null
  vuelve a lo sugerido). El id del hueco es el del paso de la guía.
  · **Con campañas escogidas, la inversión se reparte entre ellas** (como la cuenta nueva, 75/25: `repartoDelPlan` con
  `soloIds`), y la temporada va sólo si se escogió (aunque el mes no la traiga: «la pidió la agencia»).
  · **El reparto a mano** es `anuncios_clientes.reparto` (0078), `PUT …/ciclo { reparto }` con `actualizar` y sólo esa
  columna (null: «Volver al estándar»); el servidor no guarda uno que no sume 100.
  · **Qué se sugiere en cada hueco, en orden**: lo escogido a mano manda; luego los anuncios que YA FUNCIONARON
  (`anunciosQueFuncionaron` sobre `en_pauta`: costo de 30 días dentro del número mágico de ese día, o 3 resultados sin
  él), lo publicado que rindió y lo de «Va a pauta». Con productos escogidos, sólo lo de esos productos. Lo escogido y lo
  que funcionó puede ser de CUALQUIER mes: esos calendarios se leen aparte (`soloClaves`) y entra aunque no esté publicado
  ni marcado (`incluir` de `candidatasDelCalendario`). `c.anuncios` sólo trae los huecos llenos, cada uno con su `n`:
  se busca con `anuncioEn(c, n)`, no por índice.
  · **Con la publicación ya subida** (`como: "publicacion"`) el texto principal ES su caption (se enseña y se revisa con
  `problemasDePauta`) y sólo se escriben título y descripción; subiendo la pieza, de 3 a 5 textos, títulos, descripción y
  botón. `POST …/ciclo { escribir, reescribir? }` los pide a la IA (`pedidoDeTextosPlan`, función «ideas de anuncios»)
  con el nivel de cada hueco (`nivelesParaHuecos`: la regla de 100 dentro de su etapa) y su tabla de cómo hablarle, los
  productos con su precio, la publicación escogida, «lo que quieres lograr», la ficha del cliente y el cerebro. Se
  guardan con el plan fijando la pieza del hueco, y en `post.anuncio` SIN pisar lo que tenía (`rellenarAnuncioDelPost`);
  lo que escribió una persona en el plan no se reescribe salvo con `reescribir`. Lo que escribe una persona (`PUT` con
  `textos` y `editado`) sí reemplaza en `post.anuncio`. Las dos escriben una vez por calendario (`updated_at` como
  condición, la cola y `calendario:recargar` sin pestaña) y, si la publicación no iba a pauta, la marcan en su etapa.
  · **Lo que falta de Presentación se pide por niveles** (`?lote=pauta&niveles=inconsciente:2,problema:1`) y en el lote cada
  pieza que va a pauta toma el tipo de su nivel (`tipoParaNivel`: un educativo en los fríos, nunca «Anuncio» con precio).
  · **El Excel es el de la agencia hoja por hoja**: B «Presupuesto de la campaña Advantage+» es un sí/no y la cifra diaria
  va en C (Evaluación, Conversión, Ascensión y la Especial) o en E por conjunto (Presentación), con lo de la campaña y los
  anuncios en celdas combinadas; más una hoja «Textos de los anuncios».
  · **Un plan del mes en curso arranca HOY** (`hoy` en `planDelCiclo`) y el total del mes dice el ciclo y la temporada aparte
  (`plan.total`, `textoDelTotal`).
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
- **UN solo número mágico y nada de crear campañas desde la app** (decisiones del 14-nov). `numeroMagicoDelCliente`
  (src/lib/numerosNegocio.js) es LA cifra de la ficha, la revisión 3Q (también el cron), el informe de anuncios, el plan de
  campañas y el estratega: el menor entre el objetivo y el equilibrio, con el presupuesto escrito (o el que pide la meta;
  lo gastado en Meta sólo se enseña) y SIN ajuste por etapa (`EXIGENCIA_ETAPA` se quitó). Sin costos no hay número: se dice
  qué falta y no se juzga contra una cifra inventada. «Decisión (listo para comprar)» es quien lo sabe todo y sólo le
  falta el EMPUJÓN —la oferta, la garantía, la urgencia real— (el «más consciente» de Schwartz y los prompts de
  investigación del curso; los apuntes decían «ya compró» y se unificó): va en Conversión (con Producto: la regla de 100
  da 2 de Producto por 1 de Decisión) y en Ascensión, donde quien ya compró recibe el mismo empujón para volver. Un
  «Anuncio» en nivel Decisión se sugiere a Conversión. «Nueva campaña» (crear por la API) ya no se abre: la
  página de Anuncios lleva a «Plan de campañas», que da campañas, conjuntos, anuncios (cualquier publicación, o una nueva)
  y sus textos según el nivel de consciencia de su etapa; el estratega de un cliente lleva a su plan.
- **El estudio de mercado más profundo, los ángulos de venta y el «Lenguaje del cliente»: lo que dice el cliente lo
  comprueba el CÓDIGO** (investigación del curso; `src/lib/estudioMercado.js`, `src/lib/lenguajeCliente.js`,
  `worker/lib/mercado.js`, `worker/lib/cerebro/lenguaje.js`; sin migración). Lo que no se ve en la pantalla:
  · **Todo lo nuevo es OPCIONAL y sólo se escribe si trae algo** (`profundoDeGeneral`, `limpiarPerfil`, los ángulos): un
  estudio aprobado de antes se lee y se vuelve a limpiar IGUAL, sin claves nuevas (un test lo exige), y su resumen sale como
  antes. Lo profundo de lo general (problema por fuera y por dentro, cree/necesita, antes y después, cómo justifica la
  compra, lo gastado, la competencia indirecta y los anuncios del rubro) sólo llega con «Rehacer todo» o escribiéndolo a
  mano en el borrador: no hay un botón barato para un estudio ya aprobado.
  · **`resumenGeneral` es lo que viaja a otras llamadas** (el motor de ideas, el kit, los ángulos): lo nuevo va en SIETE
  líneas, cada una con su tope (`breve`), y sin nombres de la competencia (`quitarMarcas` con los competidores del estudio).
  Si alguien suma un bloque, que sume una línea corta, no el bloque entero. La nota del cerebro sí lo lleva entero (sin
  marcas). La respuesta de la IA del estudio subió a 9.000 de salida (lo general venía de 7.000 y cada producto de 6.000): con lo nuevo y los ángulos, se cortaba.
  · **Los ángulos (`productos[id].angulos`, 3–5) van en la nota de cada producto por defecto** (`notaDeProducto(…, {
  angulos: true })`), y así los lee también el lote (worker/lib/estudio/lote.js). El pedido de los ángulos pasa
  `{ angulos: false }` para no leer los de antes.
  · **Una garantía o prueba en un ángulo sólo es real si el estudio del producto tiene alguna** (maleta de garantía o de
  testimonios, u objeciones/pruebas): si no, `sinGarantiaInventada` la quita y suma «Una garantía o una prueba real…» a
  `faltan`. Sólo en el camino de la IA (`leerDeProducto`, `leerAngulos`): lo que escribe una persona en el borrador no se
  toca.
  · **«Proponer ángulos» escribe en el BORRADOR, nunca en lo aprobado** (`estudioConAngulos` quita `aprobadoAt`; si no hay
  borrador se crea desde el aprobado, como «Llevar al estudio» de WhatsApp). Es barato: sin búsqueda web, con lo que ya
  dice el estudio. Relee la fila antes de escribir: si en medio otra persona guardó el borrador, se escribe sobre lo suyo.
  · **Una frase del «Lenguaje del cliente» que no esté TAL CUAL en el material se DESCARTA** (`leerLenguaje`,
  `fraseEnTexto`): se compara sin mayúsculas, tildes, comillas ni espacios de más, por palabras enteras, y se guarda el
  trozo ORIGINAL (así se ve como lo escribió el cliente). La IA no cuenta: `veces` es cuántos comentarios la dicen; una
  frase que ya estaba en la nota se cuenta con su peso de entonces, sin sumarla dos veces. Lo que sólo dicen clientes de
  la competencia va a «Lo que odian de otras opciones», nunca como elogio, y las marcas pasan a «otra marca».
  · **De la Bandeja sólo lo de OTROS** (`propio: 0`, los 150 más recientes) y de la encuesta las respuestas con su
  pregunta. Sin nada que leer (sólo la nota de ahora no cuenta), 409 sin llamar a la IA; con ninguna frase comprobada,
  502. No guarda: se abre en el editor con el id de la nota si ya existía, y NO es interna (la lee quien escribe).
  · **Nada de esto se ha probado contra la IA real**: los tests (tests/migracion/mercado.angulos.test.js) usan un `fetch`
  de mentira.
- **El plan de campañas ya no reparte por «lo que mejor funcionó va a presentación», y la revisión 3Q mira también la
  serie DIARIA** (`src/lib/planCiclo.js`, `src/lib/alertas3q.js`, `worker/lib/revision3q.js`). El Excel del plan salía
  con «18-65+» en todos los conjuntos, nombres cortados a media palabra, anuncios nombrados unos por tipo de arte y otros
  por título, todo lo que rindió en presentación (conversión, ascensión y temporada vacías), públicos que competían y
  campañas de 1 $ al día sin decir nada. Lo que no se ve en la pantalla:
  · **La edad** sale del texto del perfil del estudio o, si no la dice, de la maleta «Público» del producto
  (`edadDeTexto`: «de 30 a 45», «entre 25 y 38», «mayores de 40»; «de 30 a 45 minutos» no es una edad); sólo la llevan los
  conjuntos de intereses. Los demás van sin edad en el nombre y «Edad: abierta» en la guía (un público de quien ya
  interactuó no se recorta).
  · **Todo dato del nombre va ya cortado en una palabra** (`enPalabra`): `nombreConPlantilla` corta cada dato a 60 a
  media palabra. El nombre del anuncio es UNA regla: el ángulo de venta; si no, el título de la pieza; un nuevo, su nivel.
  · **Cada pieza a la etapa donde mejor encaja** (`encajeEnEtapa`: lo que habla de precio u oferta suma mucho en
  conversión y resta en presentación; su tipo de arte, en las campañas que lo piden; su nivel, en la etapa de ese nivel;
  un nivel frío fuera de presentación resta). Primero cada una a su mejor etapa; lo que sobra, a la siguiente que le
  sirva. Un aviso de «parecida» sólo sale si esa pieza no entró en ninguna otra campaña.
  · **Evaluación: el conjunto de 90 días excluye al de 30** (si no, pujan por la misma persona). La temporada NO excluye
  (es la misma gente a propósito): se avisa (`temporada-compite`) y se dice que no se suba evaluación esos días.
  · **Presupuesto bajo** = menos de `MIN_DIARIO` por unidad, o con número mágico menos de 7 resultados a la semana, o sin
  él menos de `DIARIO_POCO` (3) al día; con la semana calculada del mensual (no del diario redondeado). Un solo aviso
  `presupuesto-juntar` propone con los números del plan: menos conjuntos en presentación, evaluación en uno, sólo
  presentación y evaluación (con el 75/25) o cuánto subir. `conversion-chica` se quitó (lo cubre esto).
  · **Los ángulos de venta salen SÓLO del estudio APROBADO** (`estudioAprobado`: el Worker pasa `mercado.estudio`, nunca
  el borrador). Presentación prueba los fríos y las demás los tibios (y los que no dicen); los menos usados por las otras
  campañas primero. Lo escogido se guarda en `anuncios[hueco].angulo` ({ productoId, id, nombre }, o `false` = «sin
  ángulo»; `angulo: null` en el PUT vuelve al sugerido; cambiar de publicación no lo toca) y lo de antes, sin `angulo`,
  vale igual. Con la pieza de otro producto, el sugerido se cambia por uno de ESE producto. «Escribir los textos» fija en
  el hueco el ángulo con el que escribió (si mañana se sugiere otro, los textos no cuadrarían). `anunciosPlan.js` no
  importa el estudio de mercado: el Worker le pasa la línea ya hecha (`lineaDeAngulo`).
  · **Qué ángulo gana** es un rasgo más de `preferenciasDeAnuncios` con la misma muestra mínima: el de la publicación
  (`post.angulo`, objeto o texto: `anguloDePost`, que también recuerda `fotoDePublicacion`) o el del hueco del plan
  donde corrió (`angulosDeLosPlanes`, una lectura de los últimos 12 planes, en `preferenciasDelCliente` y en «Para
  pautar»; el GET de «En pauta» del panel no la hace: se abre mucho).
  · **La serie diaria son 2 llamadas más en la revisión (14) y 1 en el cron (6)**: por campaña desde el 1 del mes o 14
  días atrás (`desdeDeLaSerie`) y por anuncio 14 días, con `time_increment=1` y `time_range`, SIN los campos nuevos (no
  pueden tumbar la serie con un #100). Si falla, null: la revisión sale igual y `avisoDia` lo dice. Hoy no cuenta (va a
  medias): todo es hasta AYER.
  · **El ritmo se mide contra el MISMO presupuesto que pone el plan** (`presupuestoDelMes`, que llama a `planDelCiclo`
  sin catálogo ni estudio: la inversión de los números o la escrita en el plan del mes, más la temporada con las fechas
  especiales del cliente y el calendario del mes). Dos lecturas de D1 (`planes_campana` y `calendars`). Sin números,
  «sin datos» y dónde se completan.
  · **Al cron sólo van el destino roto y el gasto más de un 30 % adelantado** (`alertasGravesDiarias`, con su clave en
  `alertas.claves`: no se repite al día siguiente). El CPM, el cansancio y el formato son de la pantalla.
  · **«7 días antes» es 14 menos 7** (`semanaAnterior`); y con menos de `POCOS_RESULTADOS` (50) en 30 días, el semáforo de
  lo que pide un cambio fuerte (apagar, subir, duplicar, cambiar) lleva `ojo` («tómalo como una pista») y el resumen,
  `avisoPocos`.
  · **Nada de esto se ha probado contra Meta real**: los tests usan un `fetch` de mentira (la forma de la serie es la de
  la documentación de /insights con `time_increment`).
- **Las campañas y los números por MCP usan LAS MISMAS cuentas y el MISMO plan que la pantalla** (`worker/lib/herramientasCampanas.js`;
  sin migración). Antes, por el conector, Claude calculaba el presupuesto con las calculadoras de otros skills y escribía los textos
  de los anuncios a mano: se saltaba el número mágico, los niveles de cada hueco y la regla del anuncio. Lo que no se ve:
  · **`numeros_del_negocio` es la ficha de la pantalla** (`fichaDeNegocio`, lo que era el GET de la ruta, sacado a función): el
  número mágico es `numeroMagicoDelCliente` con lo GUARDADO. La tasa de cierre MEDIDA por el enlace de ventas (`ventasDelCliente`,
  sólo si el cliente apuntó alguna semana: una llamada más a Meta) se dice como «sería X», no se aplica: la revisión 3Q y el plan
  leen la guardada, y la pantalla la mete en el formulario hasta «Guardar». Lo de Meta nunca tumba la ficha. Con `proponer`, la
  propuesta de la IA (`proponerNegocio`) se devuelve con el pedido listo para `guardar_numeros_negocio` y NO se guarda; quien es de
  sólo lectura no la pide (la herramienta es de lectura, así que el MCP no la corta: lo hace ella).
  · **`guardar_numeros_negocio` sólo cambia lo que se nombra** (null lo quita, los costos reemplazan la lista). Un valor que no se
  entiende es un ERROR: `limpiarNegocio` lo quitaría en silencio y el dato de antes desaparecería. Sin `confirmado: true` devuelve
  «NO SE GUARDÓ NADA.», cada cambio de → a, el número mágico antes y después y el `antes` (el `actualizado` leído; "" si no había
  nada), que con el sí se compara en `guardarNegocioSinPisar` (la misma función del PUT de la pantalla): si otra persona guardó, no
  se pisa. Firma «Claude (persona)» en `negocio.por` y avisa `anuncios`.
  · **`escribir_textos_anuncios` es `escribirTextosDelPlan`** (una llamada de IA, hasta `MAX_TEXTOS_POR_LLAMADA` = 8). Sin hueco,
  escribe lo que FALTA (`faltanTextos`) sin los de una persona, y dice «Quedan N»: converge porque lo escrito ya no falta. Por eso
  `reescribir` sólo vale con hueco o con campaña (como mucho 6 anuncios): sin eso, «vuelve a llamar con lo mismo» reescribiría
  siempre los mismos 8. Lo que la IA no devolvió se dice aparte.
  · **`ajustar_plan_campanas` guarda `que` y los huecos al momento (`guardarCiclo`) y el reparto sólo con `confirmado`**: con un
  reparto sin confirmar NO se guarda nada de la llamada (tampoco el `que` que viniera con él). `que` se funde campo a campo sobre
  lo guardado (la pantalla manda el objeto entero); `producto_ids` acepta el id o el nombre del catálogo. Cambiar sólo `como` fija
  la pieza que tiene el hueco (como la pantalla); un `como: "publicacion"` que el plan no puede usar (la publicación no salió ni
  tiene día) se avisa. El reparto se valida con `errorDeReparto`, que ahora usa también la ruta (PUT …/ciclo).
  · **`plan_de_campanas` dice el HUECO de cada anuncio, el ID de su publicación y la clave de cada ángulo**
  (`planATextoCiclo(plan, { ids: true })` en `textoDelPlan`): es lo que nombran las dos herramientas que lo cambian. «Copiar el
  plan» de la pantalla va SIN ids (`planATextoCiclo(plan)`): un test lo vigila.
  · **Los módulos del Worker se importan en el momento** (negocio.js, planCampanas.js, ventas.js, anuncios.js): llegan a mercado.js,
  que importa herramientasServidor.js (el ciclo de siempre si mcp.js los cargara de una vez). Nada toca Meta ni crea campañas.
  · **Nada de esto se ha probado contra la IA ni Meta reales**: tests/migracion/campanas.mcp.test.js usa una D1 de verdad y `fetch`
  de mentira.
