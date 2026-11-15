# Trampas conocidas · El cerebro de cada cliente

**Qué cubre:** Notas en D1 e índice en R2, lo interno, la ficha técnica y las cifras, importar desde GitHub, lo que aprende, el mapa 3D, guardar desde Claude.

**Cuándo leerlo:** Antes de tocar `worker/lib/cerebro/` o la pestaña Marca → Cerebro.

Cada entrada es algo que ya pasó o que no se ve leyendo el código. Van en el orden en que se escribieron: si dos se
contradicen, manda la de más abajo (la más nueva). Una trampa nueva de esta área va AL FINAL de este archivo.

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
- **Por el conector, Claude guarda en el cerebro y lee el estudio de mercado con las MISMAS funciones que la pantalla**
  (`worker/lib/cerebro/herramientasCerebro.js`, `worker/lib/cerebro/guardar.js`). Antes no podía guardar nada en el cerebro,
  ni ver el catálogo con sus precios, las 7 maletas o los ángulos: escribía con lo que encontraba buscando. Cosas que no se ven:
  · **Guardar una nota salió de la ruta** (`guardarNota` en guardar.js): el PUT de `/api/cerebro/<c>/nota` y
  `guardar_en_cerebro` escriben igual —la ruta única, los derivados, `editada` (lo de Claude es «editado a mano» como lo de
  la pantalla), una nota nueva con `insertar` y fechas iguales, una edición estrictamente después de su creación, el índice—.
  La ruta responde exactamente igual que antes (404 «Nota no encontrado», 400, 409 del tope). `prepararNota` hace todas las
  comprobaciones SIN escribir: lo que la vista previa dice que se guardaría es lo que se guarda.
  · **`guardar_en_cerebro` confirma siempre** (sin `confirmado: true`, «NO SE GUARDÓ NADA.» con el texto entero y, si
  reemplaza, qué nota, cuántos caracteres tenía y cómo empieza). Con `nota` (ruta exacta, título exacto, o UNA sola que lo
  contenga; varias es error) la REEMPLAZA y conserva su ruta, su tipo y su candado si no se dicen; sin `nota` crea otra (y
  avisa si ya hay una con ese título: saldría «-2» y el motor no la leería por su ruta). Los tipos son los del asistente
  (`TIPOS_PROPONIBLES`); una pauta nunca es interna (`limpiarNota`). Avisa si la nota la escribe el estudio de mercado (se
  reescribe al guardar el catálogo o aprobar), si viene del repositorio o de «Preparar ficha» (queda corregida a mano), y
  tras guardar, si la ficha técnica quedó atrás (`fichaDesactualizada`): NO la renueva (sería otra llamada de IA).
  · **`proponer_nota_cerebro` no guarda**: `proponerLenguaje`, `proponerRubro` o `proponerVozUgc`, y dice el título y la
  ruta con que guardarla (`RUTA_LENGUAJE`, `RUTA_RUBRO`, `RUTA_VOZ_UGC`: el motor las lee por ella). El lenguaje del cliente
  sigue comprobando frase a frase en el código.
  · **`ver_estudio_mercado` sólo lee** (`leerMercado`): el catálogo con `lineaDeProducto` y su id, `resumenGeneral`, el
  semáforo de `semaforoMaletas` y los ángulos con `lineaDeAngulo`; lo que trae el borrador frente a lo aprobado (también un
  producto que, aprobado así, se quitaría). Pasado `MAX_RESUMEN` los ángulos de los demás productos van sólo por su nombre.
  · **`proponer_angulos` escribe en el BORRADOR, sin confirmación** (es lo que hace el botón), y lo dice. **Aprobar el
  estudio NO se hace por el conector**, a propósito: aprobarlo reescribe las notas del estudio en el cerebro y deja el
  documento en Drive, y la persona tiene que revisarlo entero en la pantalla.
  · Nada de esto se ha probado contra Anthropic real: `tests/migracion/cerebro.mcp.test.js` usa un `fetch` de mentira.
