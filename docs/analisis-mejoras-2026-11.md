# Análisis de mejoras · 15 de noviembre de 2026

Cuatro revisiones del código en paralelo y los datos reales de producción (D1, sólo lectura, últimos 30 días). Lo que dice
«comprobado» se vio en el código o en la base; lo que dice «estimado» es una cuenta.

## Lo esencial

1. **El botón escribe con el modelo más pequeño que tienes, y por eso piensa menos que Claude.** En Ajustes → IA, TODOS los
   huecos del texto están en *Muse Spark 1.2 Contributor* de Meta. Eso incluye el asistente y el director de arte, que razonan
   en «medio» o nada (comprobado en `ajustes_espacio`). Cuesta unos **2 $ al mes**, el 10 % de tu gasto en IA. Además, ese modelo
   entrena con lo que recibe, y le llegan los datos de tus clientes. Pasar lo que escribe y diseña a Sonnet 5 cuesta unos
   **20 $ más al mes** (estimado). Es un cambio en Ajustes, sin código, y lo que más mueve la calidad.
2. **Aunque cambies el modelo, el motor está armado para «rellenar casillas».** El código decide por rotación la táctica, el
   gancho, el ángulo, la composición y el nivel. Escribe 6 piezas con unos 9 campos en una sola respuesta, sin ver el mes
   entero, sin ejemplos de lo que ya te aprobaron y sin revisar lo que escribió. Lo que funcionó con las imágenes (el director,
   pieza a pieza) no se hizo con los textos.
3. **La galería esconde piezas.** Sólo carga las 300 más recientes y cuenta también los audios. En Baby Caleb hay hoy **101
   piezas que no se ven ni se encuentran**. Feria del Lente llega al tope en unas dos semanas.
4. **Crear a mano es incómodo por diseño, no por falta de funciones.** «Avanzado» se cierra cada vez, debajo de un chat de
   440 px. El compositor tiene unos 40 controles en una columna y las referencias al final. La galería no tiene buen orden
   ni búsqueda.
5. **El cerebro no se pone al día solo y se ensucia.** Lo que borras o renombras en GitHub se queda para siempre. Una nota que
   borras aquí vuelve en la siguiente actualización. Los conflictos se avisan una vez y se olvidan. Ya hay notas duplicadas
   («-2») en tres clientes, y 57DMC y KMT no se actualizan desde el 30 de septiembre.
6. **Lo de siempre funciona.** Se publicaron 411 piezas y fallaron 2. Los fallos del Estudio son casi todos de saldo (Google,
   ElevenLabs, Kie). Lo frágil es lo que pasa en silencio: no se sabe cuándo se acaba un saldo, la campana no la lee nadie
   (267 de 269 avisos sin leer) y no hay protección ante una pantalla en blanco después de un despliegue.

---

## Foco 3 · ¿Puede el botón ser tan bueno como Claude?

**Sí, casi.** La distancia viene sobre todo del modelo y de cómo está armado el motor. Lo que no se iguala es la conversación
contigo, pero se puede imitar con una pasada que revise y reescriba.

### Por qué sale peor (de más a menos peso)

| # | Causa | Evidencia |
|---|---|---|
| 1 | Escribe Muse Spark Contributor y no razona: `adaptarAMeta` le quita el razonamiento | `ajustes_espacio.ia_modelos` (todo «muse-contribuidor»); `anthropic.js:111-113`; 14,5 M de tokens de entrada al mes en Muse |
| 2 | La estrategia de cada pieza la pone el código por aritmética (táctica, fondo, nivel, deseo, perfil, composición, gancho, ángulo) y el pedido dice «YA decidido… respétalos». La IA no busca la mejor idea | `loteAnuncios.js:280-281, 455-456`; `pilares.js:239, 255` |
| 3 | Demasiado por llamada: 6 piezas × unos 9 campos. La ficha «imagen», que después se tira porque la rehace el director, se come la mitad de la salida | `AsistenteMes.jsx:480`; `lote.js:562`; «lote del mes»: 6.083 tokens de entrada y 6.839 de salida |
| 4 | Nadie piensa el mes entero: las casillas salen del plan semanal y la estrategia llega como 160 caracteres por semana | `asistenteMes.js:158-186` |
| 5 | Ningún ejemplo del propio cliente (lo aprobado o lo que rindió), aunque ya se leen 4 calendarios para contar formas | `lote.js:214-221` |
| 6 | El contexto se corta a 6.000 caracteres después de juntar ficha, pautas, pasajes y rubro: lo último (pasajes y rubro) puede no llegar | `loteAnuncios.js:494`; `camposTexto.js:219` |
| 7 | Una sola pasada, sin crítica | `lote.js:572` |

**El control de calidad, en el mismo modelo, también falla:** marca «Revisar» el 60 % de las imágenes (426 de 712) y les da
una nota media de diseño de 6,5. Algunas son falsas alarmas del propio revisor, que escribe «(no debía aparecer)» dentro del
texto que leyó y lo cuenta como error (D'CASA, 14 de noviembre). Muchas piezas «Revisar» ni son malas: el revisor es débil.

### Qué hacer, en orden

| Paso | Qué | Esfuerzo | Costo extra al mes (estimado) |
|---|---|---|---|
| **0** | En Ajustes → IA: redacción, guiones, prompts, asistente y director de arte en **Sonnet 5**, razonamiento «alto»; lectura y análisis en Haiku 4.5. Sin código. Sube el presupuesto de 10 $ a unos 45 $ (ya gastas 18 $ en lo que va de noviembre, así que el medidor está siempre en rojo y deja de servir) | Ninguno | +20–30 $ |
| 1 | Topes por bloque en vez de cortar todo junto (que la ficha, las pautas, los pasajes y el rubro lleguen siempre); 3–5 piezas reales del cliente como referencia de tono (las aprobadas y las que más rindieron) | S | <2 $ |
| 2 | Quitar la ficha «imagen» del motor de textos (la rehace el director) y pasar a 2–3 piezas por llamada, 3 a la vez, con caché del bloque fijo | M | +2–4 $ |
| 3 | El código da 2–3 opciones válidas por casilla (táctica, forma del gancho, ángulo), la IA escoge y dice por qué, y el código comprueba la variedad al final | M | ~0 |
| 4 | **El mes en dos pasadas:** primero un planificador (Opus) ve las 30 casillas, la estrategia, lo que rindió, el catálogo y el estudio, y decide por casilla la idea, el ángulo y el gancho, con un arco del mes. Después el redactor (Sonnet) escribe de 3 en 3 | M | +5 $ |
| 5 | **Pasada de crítica:** un revisor con una guía («¿podría ser de cualquier marca?», fuerza del gancho, si encaja con el nivel, repeticiones, llamado a la acción) reescribe el 30–50 % más flojo | M | +5 $ |
| 6 | «Crear el mes con Claude»: un botón que deja el mes listo para Claude con la receta (estrategia → plan → ficha_de_textos → guardar). Para el cliente que más importa | S–M | 0 $ de API (usa tu suscripción) |

Hasta el paso 5, la calidad debería acercarse mucho a la de Claude, por unos 2–3 $ por cliente al mes. Comprobación: 10 piezas
del botón frente a 10 de Claude, en el mismo mes y del mismo cliente.

**Lo que no cambiaría:** las guardas del código (precio exacto del catálogo, no inventar testimonios, fechas delicadas,
`reglasFormato`, hashtags aparte, guardar cada tanda al llegar, las confirmaciones), el esqueleto del mes desde el plan
semanal y un solo motor para todos los caminos. Tampoco usaría Opus en todo, ni empezaría por un agente con herramientas en
el servidor.

---

## Foco 1 · Crear a mano y la galería

Hoy, el 95 % de las imágenes las pide una persona desde la app: 1.104 frente a 81 de Claude y 8 del asistente.

### Cómo se siente hoy

- **La imagen de un post:**
  - Pieza → «Diseñar con el director»: 3 toques, pero no ves la ficha antes y el costo se pregunta con una ventana nativa.
  - Para controlarla: «Crear en el Estudio (avanzado)», unos 40 controles.
  - Desde la pestaña Crear: unos 10 toques y 12 decisiones.
- **Un carrusel:** tres pasos con la propuesta editable. Es el mejor de todos.
- **Un video:** dos selectores seguidos (Guiado / Clip rápido y luego 4 formas) antes de escribir nada.
- **Encontrar una pieza de hace dos semanas:** «De la galería» del post es una rejilla sin búsqueda, sin filtros, sin fechas
  y con todas las versiones sueltas.
- **Corregir:** hay cinco entradas distintas. El visor se cierra al terminar y la pieza nueva queda escondida en la pila.

### Hallazgos, de mayor a menor

| # | Qué pasa | Evidencia | Arreglo | Esf. |
|---|---|---|---|---|
| G1 | **La galería sólo carga las 300 más recientes**, sin «cargar más», y la búsqueda también se limita a esas. Los audios cuentan para el tope | `galeria.js:26, 128`; Baby Caleb: 401 vivas → **101 invisibles** | Paginación por fecha y búsqueda en el servidor | M |
| G2 | «Avanzado» arranca cerrado en cada visita, debajo de un chat de 440 px | `Estudio.jsx:169`; `cliente.css:43` | Una sección propia `/crear/a-mano` que se recuerde, con el chat plegado | S |
| G3 | El compositor pone unos 40 controles en una columna y lo que más se toca (formato, producto, referencias) va debajo del modelo | `EstudioCompositor.jsx:487-600` | Tres bloques: **Qué** (formato, idea, texto exacto) · **Con qué** (producto y referencias) · **Ajustes** plegados con un resumen («Kit · Nano Banana 2 · 4:5 · 0,04 $»). Cargarlo en diferido libera el tope del Estudio | M |
| G4 | Escoger referencias de la galería hace saltar la página arriba y abajo, una por una | `Estudio.jsx:283, 536-541` | Una tira fija «2 de 3» o un selector en un diálogo | S |
| G5 | El selector «De la galería» del post no tiene búsqueda, filtros ni versiones apiladas | `GaleriaSelector.jsx:33-35` | Reutilizar los filtros de la galería, encabezados por semana y «Sin usar» por defecto | S |
| G6 | «Usada / Sin usar» miente: una imagen que se cambió por otra sigue «Usada», y la pila la prefiere sobre la corregida | `galeria.js:138`; `estudio.js:402` | Calcular los usos reales también para la galería (ya existe para la papelera) | S/M |
| G7 | La búsqueda mira el pedido entero, con el bloque de la marca: una palabra de la paleta casa con todo. La tarjeta es cuadrada (los 9:16 se ven diminutos) y sus etiquetas se pisan | `estudio.js:327-340`; `Estudio.css:145-148, 357, 405-411` | Buscar en la escena, el producto, el post y la fecha; como mucho tres etiquetas por tarjeta | S/M |
| G8 | Ordenar va pieza a pieza: con varias seleccionadas no hay «Mover» ni «Me gusta». Las carpetas automáticas (lote, variaciones) gastan el tope de 30 y la competencia aparece en «Todas» | `Estudio.jsx:1105-1117`; `galeria.js:30` | Mover y «Me gusta» en grupo; carpetas automáticas aparte; competencia fuera de «Todas» | M |
| G9 | **Fallo:** «Todas las que se ven» selecciona también lo que NO se ve (versiones apiladas, láminas), y «Mandar a la papelera» se lo lleva | `Estudio.jsx:1108` (usa `visibles` y no `vista`) | Seleccionar sobre lo que se ve | S |
| G10 | El visor tiene unos 25 controles. En el teléfono es el 40 % de la pantalla. «Corregir» está al fondo y su formulario se abre arriba. Los atajos cobran al primer toque | `EstudioVisor.jsx:146-152, 269-372`; `Estudio.css:171` | Una barra fija (Poner en…, Corregir, Otra versión, Descargar, Más). La pieza nueva se abre sola al llegar | M |
| G11 | En el post, «Corregir» exige un campo que está más abajo, y si cierras el panel mientras se crea, la imagen no se pone en el post | `seccionPublicar.jsx:319-326, 623-649`; `otraVersion.js:131-137` | Campo en línea junto a la imagen y `poner: true` en el encargo | S |

Una de cada cuatro imágenes del Estudio acaba en la papelera (284 de 1.040). En Rofer, más de la mitad (116 de 199). Parte es
quedarse con la mejor versión, pero también es una medida de cuánto se paga por piezas que no sirven.

### Cómo debería sentirse

1. Crear → **A mano** (se recuerda).
2. Escoger el formato: post 4:5, historia, carrusel o video. Eso fija la proporción y el flujo.
3. Escribir la idea y el texto exacto. Los chips de producto ponen sus fotos solos.
4. Añadir referencias desde una tira de la galería, sin saltos; cada chip con «¿Qué tomo?».
5. Si quieres, «Ver la ficha del director». Los ajustes van plegados, con su resumen.
6. «Crear · 0,04 $». El resultado aparece ahí mismo, con Corregir, Otra versión y Ajustar texto.
7. «Poner en la publicación», con la de esta semana sugerida.

**La galería:**
- Por defecto, «Lo último», con encabezados por semana y una tarjeta por pieza.
- Vistas: Por publicación · Carruseles y reels · Me gusta · Marca (logo, productos, plantillas, fuera de la mezcla) ·
  Competencia (fuera de «Todas»).
- Filtros: tipo, formato, producto, sin usar (de verdad), modelo y fecha.
- Acciones en grupo y «Cargar más».

**Lo que no tocaría:**
- La pestaña Pieza con sus tres botones grandes y «Deshacer».
- El encargo en el servidor (control, proporción, logo).
- El carrusel en tres pasos.
- Los carruseles y reels como una sola tarjeta.
- «¿Qué tomo de aquí?».
- «Poner en una publicación» y las protecciones de la papelera.

---

## Foco 2 · El cerebro y GitHub

**Cómo funciona hoy.** Cada cliente tiene su repositorio y su carpeta. «Actualizar desde GitHub» lee la rama principal,
compara la versión (SHA) de cada archivo .md, .txt, .json o .yml y vuelve a crear las notas de lo que cambió, salvo las que
corregiste aquí. Baja como mucho 40 archivos por pulsación. Si trajo algo, renueva la ficha técnica con IA. **No hay nada
automático** (ni cron ni webhook), y nada vuelve a GitHub.

### Hallazgos

| # | Qué pasa | Gravedad | Evidencia |
|---|---|---|---|
| C1 | **Lo que borras, renombras o mueves en GitHub se queda en el cerebro para siempre.** La IA lee la versión vieja y la nueva | Grave | `importar.js:65` sólo recorre lo que existe; en producción, notas «-2» en Baby Caleb, D'CASA y Feria del Lente |
| C2 | **Una nota que borras en el cerebro vuelve sola** en la siguiente actualización, y además paga otra vez la ficha | Grave | `importar.js:37-46`; el borrado no deja marca de «no traer» |
| C3 | **Los conflictos se avisan una sola vez:** viven en la pantalla. Si recargas, o si otra persona pulsó el botón, la diferencia con GitHub queda oculta para siempre | Grave | `Cerebro.jsx:60`; `importar.js:43-46` |
| C4 | «Usar la versión de GitHub en todas» puede deshacer correcciones de secciones que no cambiaron, y no enseña las diferencias | Media-alta | `importar.js:79-83` |
| C5 | El aviso de «ficha desactualizada» sale casi siempre: cada respuesta del cliente crea una nota «decisión» que lo enciende. Con tantos avisos falsos, nadie los lee | Media | `aprender.js:190`; `preparar.js:81-82` |
| C6 | Las secciones del prompt maestro de Meta AI llegan a la IA que escribe la ficha, contra la regla de que ninguna IA las lee | Media | `preparar.js:57` sin `fueraDeUso` |
| C7 | Hay dos listas de precios («Cifras vigentes» de GitHub y el catálogo) que pueden contradecirse, y no hay regla de cuál manda | Media | `cerebro.js:311`; `mercado.js:192` |
| C8 | Lo que no entra no se dice: árbol cortado, archivos de más de 400 KB, PDF o Word, otra rama. Y el aviso nombra un botón que ya no se llama así | Media | `repositorio.js:52, 71-74`; `cerebroVista.js:133` |
| C9 | No se sabe cuándo fue la última actualización, ni si GitHub tiene cambios sin traer | Media | — |
| C10 | Lo que escriben Claude y la app (lenguaje del cliente, rubro, voz UGC, decisiones) no llega a GitHub | Diseño | — |

En producción, la última importación desde el repositorio fue: 57DMC y KMT el 30 de septiembre, Feria del Lente el 15 de
octubre, D'CASA el 16 de octubre, Rofer el 27 de octubre, Comunidad el 2 de noviembre, Juancito el 4 de noviembre y Baby
Caleb el 13 de noviembre.

### Recomendación

**Que cada parte tenga su fuente de verdad:**
- **GitHub manda en el canon de la marca:** las notas que vienen del repositorio. En esas notas, un botón «Editar en GitHub».
  Corregir aquí sigue siendo posible, pero queda marcado como «corrección local» y se vigila.
- **El cerebro manda en todo lo demás:** ficha y cifras (se recalculan), decisiones, estudio de mercado, lenguaje del cliente,
  rubro, voz UGC, pautas y lo que guarda Claude.
- **El catálogo manda en los precios.**

**Sincronización: automática, diaria y al abrir el cerebro.** Arreglar C1–C9 y añadir una revisión automática: una consulta
a GitHub al día por cliente desde el cron, y otra al abrir Marca → Cerebro.
- Lo que no choca se aplica solo y renueva la ficha.
- Los conflictos («Mía / GitHub», con la diferencia) y los archivos borrados («Quitar sus N notas») van a la campana y quedan
  guardados.
- No hay que configurar nada en GitHub. El webhook al hacer push queda para después, si hace falta.
- Fase 2, opcional: copiar a una carpeta `99_Cerebro_app/` del repositorio lo que sólo existe en el cerebro, como respaldo.
  Necesita un token con permiso de escritura.

Esfuerzo: M para la revisión automática con los arreglos; M para el respaldo.

### Tu forma de trabajar mientras tanto

1. Cambia el canon en GitHub, nunca en el cerebro.
2. Pulsa «Actualizar desde GitHub» hasta que deje de decir «quedaron para la siguiente vuelta».
3. Si dice «N notas no se actualizaron», **no pulses «en todas» sin mirar**. Pasa tu corrección a GitHub y después usa la
   versión de GitHub.
4. Si borraste o renombraste un archivo en GitHub, borra a mano en el cerebro las notas de ese archivo.
5. No borres en el cerebro una nota cuyo archivo sigue en GitHub, porque vuelve. Quítala en GitHub.
6. Los precios, en el catálogo del estudio de mercado.

---

## Los 9 puntos

### 1 · Flujos de punta a punta
- Para llenar un mes hay **varias puertas y tres pantallas**: el asistente del mes, «Planificar a mano» (PlanWizard, 1.446
  líneas) y el lote «Mes completo». Además, «producir» significa tres cosas distintas. *Un nombre y un asistente, con «a mano»
  como modo* (M).
- Para programar hay **seis puertas con dos criterios** («aprobado» y «listo»). *Un ajuste por cliente, «¿aprueba antes?»,
  que lean todas* (S–M).
- «Programar lo aprobado» prepara las imágenes en el navegador, una tras otra, y guarda al final: si se cierra la pestaña, no
  queda nada (`programarAprobadas.js:26-47`). El Container ya lo sabe hacer. *Que sea un encargo del servidor* (M).

### 2 · Que funcione siempre
- **Pantalla en blanco después de un despliegue:** hay 152 cargas diferidas y ninguna barrera de errores ni manejo de
  `preloadError` (comprobado: el grep sale vacío). Una pestaña abierta durante un despliegue puede quedarse en blanco al entrar
  en una pantalla nueva. *Barrera de errores y recarga sola* (S).
- **El cron va en cascada:** si un paso falla siempre, cuenta como «tuvo trabajo» y salta todo lo de abajo, para siempre
  (`worker/index.js:577-610`, comprobado). Hoy llega hasta el final («Lo mejor» se clasificó hoy), pero nada avisaría si dejara
  de hacerlo. Los errores sólo van a la consola. *Una tabla de salud por tarea, un aviso al administrador y un caso en la
  revisión diaria de infraestructura* (M).
- **Los saldos se acaban sin aviso:** son la mayoría de los fallos del mes (Google 402, ElevenLabs sin cuota, Kie sin
  créditos). *En Ajustes, el saldo de cada proveedor y un aviso cuando un pedido falla por saldo* (S–M).
- Errores que se tragan y dejan datos incoherentes:
  - Si falla la resincronización de la cola al guardar un mes, la publicación cambia de día y la cola sale a la hora vieja
    (`datos.js:556`).
  - Un render muerto sólo se da por fallido cuando alguien lo lee (`render.js:358-366`).
  - *Avisar en los dos casos* (S).
- 48 integraciones dicen en CLAUDE.md «no se ha probado contra el servicio real». *Una prueba de humo semanal con lecturas
  gratis y, en Ajustes, el último éxito de cada integración* (M).

### 3 · Calidad de lo que sale
Ver el foco 3. Además:
- El control de calidad corre en el mismo modelo débil, marca «Revisar» el 60 % de las piezas y tiene falsas alarmas. *Haiku o
  Sonnet para el control* y medir de nuevo cuántas pasan.
- La papelera se lleva el 27 % de lo creado: es la métrica que hay que bajar.

### 4 · Velocidad y fluidez
- Los topes de peso están al límite y ya dictan la arquitectura: JS inicial 165,8 de 170 kB, CSS 11,7 de 12, Estudio 20,49 de
  20,5.
- **Abrir una publicación, la acción más frecuente, descarga 134 kB comprimidos más.** Un caso concreto: `pauta.js:26` importa
  una sola constante de `estudioMercado.js` y arrastra 16,5 kB. *Mover la constante* (S) y *poner un tope de peso por acción*
  (M).
- **Al arrancar se carga el espacio entero:** todos los clientes y todos los meses. Cada «recargar calendario» (lo emiten 12
  sitios: encargos, Claude, «Lo mejor»…) relee todo en cada pestaña (`datos.js:292-299`; `App.jsx:447-560`). Crece cada mes.
  *Cargar el mes que se mira más un resumen, y recargar sólo ese calendario* (M–L).
- **Las miniaturas son los archivos originales:** el chip del mes y la página del cliente pintan piezas 2K de 4 a 8 MB. Un mes
  en el teléfono puede pasar de 100 MB (estimado). *Una copia reducida al crear* (M).

### 5 · Claridad
- Hay 8 secciones arriba, 5 pestañas por cliente con 16 sub-secciones (Marca sola tiene 9), unos 74 botones en el panel de una
  publicación, «Lo mejor» en tres sitios y 27 ventanas `window.confirm` (algunas para confirmar costos).
- Quedan restos internos a la vista: «Ver diagnóstico» en el menú de todos, y «el lote del Estudio» en las ayudas.
- **No hay recorrido inicial ni ayuda.** *Una lista de «Primeros pasos» por cliente, construida sobre el semáforo del kit, y
  un glosario de una página* (S–M).

### 6 · Costo
- Gastaste 23 $ en octubre y 18,5 $ en lo que va de noviembre, con un presupuesto puesto en 10 $: el medidor está siempre en
  rojo y deja de avisar de nada.
- El texto es el 10 % del gasto y es lo que más decide la calidad (foco 3).
- Las imágenes de Muse (11 $ en 30 días, 1.120 piezas) son baratas, pero una de cada cuatro va a la papelera.
- El control de calidad escribe 3.342 tokens de salida por revisión: es mucho para un veredicto; *una respuesta más corta* (S).

### 7 · Trabajo en equipo
- **La campana no se usa:** 267 de 269 avisos en 30 días sin leer. El 40 % son «aprobada»: cada aprobación suelta es un aviso,
  y «Aprobar todas» con 25 publicaciones son 25 avisos. *Agrupar, quitar lo de poco valor y mandar lo importante al teléfono
  (Web Push) o a Mi día* (S→M).
- **«Enviar mi revisión» del cliente no se guarda:** si nadie estaba conectado, se pierde (`worker/index.js:242-251`,
  comprobado). *Guardarlo en la campana* (S).
- Sacar a alguien del equipo deja su trabajo sin dueño, y las respuestas del cliente en lo que llevaba no le llegan a nadie
  (`sesion.js:453-464`; `equipo.js:145, 160`). *Reasignar al sacarlo y avisar a todos si el responsable ya no existe* (S).
- **Gana la última escritura:** el mes se guarda entero sin condición (`datos.js:513-540`). *Comprobar `updated_at` (409) y
  fusionar por publicación, como ya hace `ponerEnPost`* (M).

### 8 · El cliente final
- La página de aprobación está bien pensada, pero **descarga la aplicación de la agencia entera: 177 kB antes de pintar**.
  *Una entrada aparte para lo público, de unos 70 kB* (M).
- «Aprobar todas» hace una petición por publicación y dice «Aprobamos todas» aunque falle una (`Aprobar.jsx:224-230`). *Una
  ruta en lote* (S).
- No sabes si el cliente abrió el enlace. La fecha límite no avisa al vencer. Para enviar sólo hay «Copiar»: falta «Abrir en
  WhatsApp» con el número del cliente (S).
- Aprobaron 50 y pidieron cambios en 17 (el 25 %, todos con comentario). Es un buen dato para medir la calidad mes a mes.

### 9 · Teléfono y Claude
- **Claude no puede programar las piezas del Estudio:** son PNG e Instagram las rechaza; la herramienta dice «programa desde el
  panel» (`publicador.js:227-228`). El Container ya lo resuelve al aprobar. *Usarlo también por Claude* (S).
- **Claude, el Inicio y el informe leen el estado viejo de la aprobación** (`days.status`), no lo que respondió el cliente
  (`herramientasServidor.js:244`, comprobado). En producción está desfasado en 2 de 63 casos, pero así Claude puede decir «no
  hay nada aprobado». *Aplicar las aprobaciones en el servidor* (S–M).
- En el teléfono, el contador rojo de fallos de publicación vive dentro de «Más». Y share target, el Atajo del iPhone y el
  audio de la vista previa nunca se probaron en un iPhone.
- Claude no puede sacar el enlace o el mensaje para el cliente, ni leer la Bandeja, los informes o su campana.

### Salud del código
- **CLAUDE.md pesa 649 kB** (unos 160.000 tokens), se carga entero en cada sesión y se contradice: el panel tiene «dos
  pestañas» y «TRES», Mi día va «por prioridad» y «por semanas», y la línea de migraciones está tres veces. *Dejarlo en unos 40
  kB (cómo trabajar, arquitectura, reglas de oro) y pasar las trampas a `docs/trampas/<área>.md`* (S–M). Cada sesión de trabajo
  sería más rápida y más barata.
- Archivos de más de 1.500 líneas: ChatPanel (2.413), App (1.919), CalendarView (1.786), motorVideo y PlanWizard.
  `AsistenteCampana.jsx` (798 líneas) no lo importa nadie.
- **Ningún test abre la aplicación en un navegador**, aunque CLAUDE.md repite «lo cazó Chromium, no los tests». *Una prueba de
  humo en CI: entrar, abrir un cliente y una publicación, y /aprobar* (M).

---

## Orden de trabajo propuesto

**Hoy, sin código (tú, en Ajustes → IA):**
- Redacción, guiones, prompts, asistente y director de arte en Sonnet 5, con razonamiento alto.
- Lectura y análisis en Haiku 4.5.
- Presupuesto a 45 $ y «avisar».
- Después, comparamos un mes del botón con uno de Claude.

**Entrega 1 · lo roto y lo que se pierde (S, una sola entrega):**
- G1: la galería con «Cargar más».
- G9: «Todas las que se ven».
- Barrera de errores y recarga tras un despliegue.
- «Enviar mi revisión» en la campana y los avisos agrupados.
- Claude programa con la preparación del Container y lee las aprobaciones reales.
- `pauta` sin `estudioMercado` (−16,5 kB al abrir un post).
- C6: el prompt maestro fuera de la ficha.
- C5: el aviso falso de ficha desactualizada.

**Entrega 2 · el motor de textos al nivel de Claude (M):**
- Topes por bloque y ejemplos del cliente.
- Sin la ficha «imagen» y 2–3 piezas por llamada.
- Opciones que la IA escoge.
- El mes en dos pasadas y la pasada de crítica.
- El control de calidad en un modelo mejor y con respuesta corta.

**Entrega 3 · crear a mano y la galería (M):**
- «A mano» como sección propia.
- El compositor en tres bloques.
- Referencias sin saltos.
- El selector del post con búsqueda y semanas.
- Usos reales.
- Acciones en grupo.
- Vistas de la galería.
- El visor con barra fija.

**Entrega 4 · el cerebro sincronizado (M):**
- Quitar lo borrado en GitHub y marca de «no traer».
- Los conflictos guardados, con la diferencia.
- Revisión diaria automática y al abrir.
- «Última actualización» y lo que no entró.
- Cuál manda en los precios.

**Entrega 5 · que no falle en silencio (M):**
- La salud del cron y de cada integración.
- Los saldos de los proveedores.
- La resincronización y los renders muertos con aviso.
- Web Push para lo importante.

**Entrega 6 · velocidad y orden (M–L):**
- Miniaturas reducidas.
- Cargar el mes que se mira.
- Guardar con condición.
- La página del cliente ligera, «Aprobar todas» en lote y «Abrir en WhatsApp».

**Entrega 7 · claridad (S–M):**
- Un nombre para planificar y producir.
- «Primeros pasos».
- CLAUDE.md partido.
- Prueba de humo en el navegador.

## Lo que no se comprobó

- Nada se probó en un iPhone.
- Los costos de cambiar de modelo son estimados con los precios de la tabla de la app (`configIA.js`), sin caché ni la
  salida extra del razonamiento.
- El tamaño real de la ficha y las pautas de cada cliente (cuánto se corta hoy).
- El comportamiento de GitHub con un repositorio grande, y el de Muse frente a Sonnet en tus clientes. Para esto último hace
  falta la prueba de 10 contra 10.
