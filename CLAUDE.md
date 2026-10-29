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
  hooks/useEquipo.js      Los miembros del espacio (para «Lo lleva», menciones, carga)
  hooks/useTareas.js      Todas las tareas y sus acciones (marcar, pasar a hoy, mover, convertir notas):
                          las comparten Mi día y el panel lateral
  hooks/useRepaso.js      ¿Toca el repaso de la mañana? (una vez al día por persona)
  hooks/useBancoIdeas.js  El banco de ideas único: leerlo entero, añadir, cambiar (agrupado), asignar empresa, quitar
  hooks/useArrastrarOrden.js  Ordenar una lista arrastrando y con flechas (Hoy de Mi día y del panel de tareas)
  lib/
    filas.js              Conversores fila ⇄ aplicación
    auth.js               Sesión, inicio y cierre
    db.js                 Llama a /api/*; conserva todas sus firmas
    equipo.js             Miembros, invitaciones y perfil propio
    rutas.js              Slugs, análisis y construcción de direcciones (puro)
    contextoADN.js        Qué del ADN viaja a la IA al escribir (sin la maquetación de Meta AI)
                          y cómo se parte el contexto para la caché de prompt (puro)
    cerebro.js            Cliente de /api/cerebro (notas, buscar, importar, preparar ficha)
    cerebroVista.js       La pestaña Cerebro: tipos, filtros, frases de resultado, documentos (puro)
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
    referenciasPost.js    Los archivos de REFERENCIA de una publicación (`post.referencias`): aparte de `medios`, no se publican
    consciencia.js        Niveles de consciencia (Schwartz) y deseos de Reiss: pequeño, para el bundle principal
    ugc.js                UGC · guion para grabar: tramos «[0–3 s] VOZ: «…» | SE VE: … | TEXTO: …», duración (15–60 s, 2,5
                          palabras/s), ganchos, copiar voz y tomas; transcribir un video y adaptarlo; la «Voz UGC» de cada
                          cliente; «Guiones para grabar» (los UGC sin video y el mensaje de la sesión) (puro; también el Worker)
    formulasUgc.js        Las fórmulas UGC de la agencia: limpiar, repartir en otra duración, la línea para la IA, que la IA
                          escoja y diga cuál, sacarla de un video transcrito (puro; también el Worker)
    formulasUgcApi.js     Cliente de /api/formulas-ugc
    videoCorto.js         Guiones de video de 8 s (Veo por fal) o 10 s (Omni): gancho, beneficio y cierre; el pedido
                          al modelo sin texto largo ni logo (puro; también lo importa el Worker)
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
    recrear.js            «Recrear un anuncio»: el análisis en pocas líneas, la versión de partida y lo que va al
                          compositor (el anuncio sólo por su forma, las fotos del producto delante) (puro)
    otraVersion.js        «Otra versión» y «Recrear con mi marca» de un medio de la PUBLICACIÓN: se hacen ahí y ocupan
                          su sitio (lazy)
    piezaChat.js          La imagen o el video que pide el asistente, por el Estudio con el kit del cliente (lazy)
    referencias.js        Qué se toma de cada imagen de referencia (estilo, composición, producto…), la foto
                          REAL del producto (y si es de otra marca), el producto que nombra la idea (puro)
    estudio.js            Cliente de /api/estudio y lo puro de la pantalla: filtros (también «Usadas / Sin usar»),
                          trabajos en curso, carruseles y reels agrupados en una tarjeta (`agruparGaleria`),
                          de una publicación al Estudio y del Estudio a una publicación
    vivo.js               WebSocket: reconexión, latido, presencia
    horas.js              «9am» → «09:00» y vuelta; la hora que se TECLEA («930», «21:30») (puro)
    conversaciones.js     Las conversaciones del asistente: título (el de la IA y el provisional), orden, cuándo (puro;
                          también lo importa el Worker)
    conversacionesApi.js  Cliente de /api/chat/conversaciones y la última abierta por navegador (sólo lo carga el chat)
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
    planSemanal.js        La barra de los días del calendario: el plan semanal de la empresa (tipo y formato de cada
                          publicación de cada día, «Video con rostro (UGC)»), guardar y volver al estándar (puro)
    aprobacion.js         Qué aprueba el cliente (idea o pieza final), qué cuenta de su respuesta,
                          por programar / por producir, cambios tras aprobar (puro; también
                          lo importa el Worker)
    trabajo.js            Equipo: menciones, etapas, qué ve el cliente con revisión interna,
                          historial (qué cambió) y carga (puro; también lo importa el Worker)
    programarAprobadas.js Preparar imágenes, guardar y programar en lote lo aprobado de un calendario
    sesionActual.js       Quién está dentro (papel), para las piezas que no reciben `yo`
    auditoria.js          Auditoría de perfil: cifras, usuario, límites de Instagram (puro;
                          también lo importa el Worker)
    biblioteca.js         Biblioteca de anuncios de Meta: la consulta (topes), los parámetros de
                          /ads_archive, el enlace a la web, la tarjeta sin token y el CSV (puro;
                          también lo importa el Worker)
    bibliotecaApi.js      Cliente de /api/biblioteca (buscar y filtros guardados)
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
    Presencia.jsx         Avatares, estado de la conexión, «X está editando»
    SelectorFecha.jsx     Calendario del mes para escoger una fecha (portal)
    SeccionIA.jsx         Ajustes → IA: modelo, nivel al escribir, nivel del asistente
    SeccionPresupuesto.jsx  Ajustes → presupuesto, qué pasa al llegar, consumo por día/cliente
    SeccionDrive.jsx      Ajustes → Integraciones: conectar Google Drive
    SeccionMeta.jsx       Ajustes → Integraciones: conectar Meta y asignar cuentas
    SeccionTikTok.jsx     Ajustes → Integraciones: TikTok de cada cliente, por PostPeer (conectar, pegar el id)
    SeccionYouTube.jsx    Ajustes → Integraciones: el canal de YouTube de cada cliente y su privacidad
    SeccionInformes.jsx   Resultados → informes mensuales: generar, revisar, compartir
    InformeVista.jsx      El informe como documento (claro, con la marca, imprimible)
    AuditoriaVista.jsx    La auditoría de perfil como documento, con copiar y portadas, referentes, fijados y
                          «Aplicar en el perfil» (lista que se vuelve tarea)
    PiezasPerfil.jsx      Portadas de destacados (6 estilos) y foto de perfil con el logo, dibujadas en un lienzo (lazy)
    Graficas.jsx          Línea y barras en SVG, sin librería
    MedidorIA.jsx         El gasto del mes contra el presupuesto, en la cabecera
    Avisos.jsx            La campana: la bandeja de avisos de cada persona (y las del sistema)
    PorProgramar.jsx      «Aprobadas, por programar» (el paso final) e «Ideas por producir»
    HistoriasAutomaticas.jsx  «Historias automáticas» en Programación: interruptor, hora, redes, lo preparado (lazy)
    CargaEquipo.jsx       Qué tiene cada persona los próximos 7 días
    PanelTareas.jsx       Las tareas al lado, como Google Tasks: «Hoy» fijo, lo demás plegable (lazy)
    RepasoAtrasadas.jsx   El repaso de la mañana: qué se hace con cada atrasada
    ElegirDia.jsx         «¿Cuándo la haces?»: sin día, hoy, mañana u otro día (el `today_date` de una tarea)
    HoyInicio.jsx         «Tus tareas de hoy» en el inicio (sustituye al panel de tareas rápidas)
    calendario/aprobacionCliente.jsx  «¿Qué aprueba el cliente?» y en qué quedó
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
    PestanaContenido.jsx  La pestaña Contenido: Drive + migrar el banco anterior
    Estudio.jsx           La pestaña Estudio y el diálogo «Crear con IA»: pedir imágenes o videos,
                          verlos aparecer, galería, carpetas y papelera (lazy)
    EstudioCompositor.jsx Qué crear: tipo, prompt, modelo (ordenar/filtrar), ajustes, imágenes de apoyo
    EstudioVisor.jsx      La pieza grande (imagen o video) con todo lo que se sabe de ella, «Usar como logo»
                          y «Revisar marca»
    ContenidoCompetencia.jsx  «Su contenido en Instagram» (pestaña Competencia del estudio de mercado): las publicaciones de
                          un competidor, las mejores primero; analizar como referencia o extraer su guion UGC (lazy)
    Inspiracion.jsx       Inspiración: lo que publican las cuentas del cliente, junto al calendario (se arrastra a un día) y como
                          pestaña; llevar a un día, banco, analizar, guion, fórmula, recrear, el resumen al cerebro (lazy)
    CuentasReferencia.jsx Las cuentas fijas de un cliente (red, @, tipo, nota): en Resultados y en Inspiración
    calendario/referenciasPost.jsx  «Referencias · no se publican» del panel: recrear con la marca, extraer guion, usar como contenido
    EstudioMercado.jsx    El estudio de mercado en la pestaña Cerebro: catálogo, «Realizar estudio de mercado» por
                          pasos con revisión, y las referencias de la competencia (lazy)
    EstudioLote.jsx       «Producir en lote»: qué (anuncios, por tipo o el mes; post, historia, carrusel o reel), ideas por
                          tandas («Sólo las ideas al calendario») y crear; cada pieza «Llevar al calendario» (lazy)
    EstudioRecrear.jsx    «Recrear un anuncio»: el anuncio (subir, galería o Drive), el análisis y la versión editable (lazy)
    EstudioKit.jsx        El kit de marca: prepararlo con IA desde el cerebro, revisarlo, guardarlo (también las reglas que no se
                          rompen y quién pone el logo)
    VisorGrupo.jsx        Un carrusel o un reel de la galería con sus piezas en orden, «Descargar» en ZIP, «Usar el carrusel
                          en la publicación» y «Mandar el carrusel a la papelera» (lazy)
    FuenteDeMarca.jsx     La fuente de la marca en el kit: subir el archivo, dibujar la muestra, guardar las dos
    GaleriaSelector.jsx   «De la galería» del panel de una publicación: imágenes sueltas o un carrusel entero, en orden (lazy)
    SelectorModelo.jsx    «Con qué modelo (sólo esta vez)»: visor, post; marca los que no hacen la proporción; y el filtro
                          «Modelo» de la galería (`FiltroDeModelo`)
    IdeasDeFormato.jsx    «Dame ideas» en el paso 1 del carrusel y del reel IA
    ReferenciasGaleria.jsx  Ejemplos de la galería al corregir (y referencias del reel), cada uno con qué se toma
    GuardarRegla.jsx      «Guardar como regla» junto a cada corrección
    calendario/RevisionMes.jsx  «Revisar el mes» antes de enviarlo: reglas, IA opcional e imágenes contra el kit (lazy)
    calendario/CarruselIA.jsx   «Crear carrusel con IA»: el guion en láminas, el texto por IA o por plantilla, rehacer una (lazy)
    calendario/ProducirMes.jsx  «Diseñar las que ya hay»: las piezas que faltan en lote, con costo y confirmación (lazy)
    calendario/ProducirElMes.jsx  El botón «Producir el mes»: crear lo que falta (lote del Estudio), revisar las ideas o diseñar
                          lo que hay (lazy)
    calendario/RevisarIdeas.jsx  «Revisar las ideas»: la aprobación INTERNA en tarjetas (aprobar, otra con nota, quitar) (lazy)
    calendario/crearConIA.jsx  El Estudio en un diálogo dentro del panel de una publicación y de «Subir»
                          (el hook que lo abre, en hooks/useCrearConIA.jsx)
    DisenoDirector.jsx    La pestaña Diseño: el asistente incrustado como director creativo, con atajos (lazy)
    PlanDePiezas.jsx      El plan de una tanda del director: las fichas, el costo, «Crear» y cada pieza según sale
    GuardarPlantilla.jsx  «Guardar como plantilla» del visor: la IA lee su sistema de diseño y la pieza pasa al kit (lazy)
    calendario/OpcionesCrearAqui.jsx  Tipo, estilo, modelo y plantilla de «Crear la imagen aquí» (lazy)
    Cerebro.jsx           La pestaña Cerebro: las notas de un cliente, filtros, buscar, añadir, subir
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
                          duración; el original transcrito y el adaptado → la publicación o el banco; «Guardar como fórmula» (lazy)
    calendario/FormulasUgc.jsx  Las fórmulas UGC de la agencia: la lista, corregir, quitar, escribir una (lazy)
    calendario/GuionesParaGrabar.jsx  «Guiones para grabar»: los UGC del mes sin video, escoger y ordenar, copiar o compartir
                          todo en un mensaje; pasan a «En producción» (lazy)
    calendario/tipoContenido.jsx  «Tipo de contenido» del panel: tipo, producto, nivel, perfil y deseo
    calendario/campanaMes.jsx   La tarjeta de la campaña: nombre del mes, semanas, ofertas, fechas
    calendario/repeticionesMes.jsx  Lo que se repite este mes (añadir, ahora no, no repetir más) y «Se repite» del panel
    calendario/PlanSemanal.jsx  «Plan semanal de <empresa>»: editar lo que sale cada día, fijo todos los meses (lazy)
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
  pages/
    Login.jsx             Acceso
    Equipo.jsx            Quién entra en el espacio; invitar y sacar
    Invitacion.jsx        Lo que ve quien abre un enlace de invitación
    Aprobar.jsx           Página pública que ve el cliente final
    Tareas.jsx            «Mi día»: Atrasadas, Hoy, Próximas; y la vista por empresa
    Resultados.jsx        La pestaña Resultados de un cliente y /resultados (la agencia)
    Programacion.jsx      /programacion: lo aprobado por programar, lo que falló y lo que sale
    Tablero.jsx           /tablero: las publicaciones de todos los clientes por etapa
    Bandeja.jsx           /bandeja: comentarios y mensajes de Facebook e Instagram (lazy)
    Auditorias.jsx        /auditorias: auditar el perfil de un cliente o de un prospecto
    Biblioteca.jsx        /biblioteca: buscar en la Biblioteca de anuncios de Meta, filtros
                          guardados (la competencia de un cliente), exportar CSV (lazy)
    AuditoriaPublica.jsx  Lo que abre el cliente o el prospecto con el enlace (sin sesión)
    ConectarClaude.jsx    /conectar-claude: el permiso que pide Claude (OAuth)
    PublicarAMano.jsx     /a-mano/…: publicar desde el teléfono (música, stickers…)
    Informe.jsx           Lo que ve el cliente al abrir su informe mensual (sin sesión)
    InformeAnuncios.jsx   Lo que ve el cliente al abrir su informe de anuncios (sin sesión)
    Ajustes.jsx           IA, presupuesto y consumo, integraciones, tareas, copia
    Campanas.jsx          /campanas («Anuncios»): cuenta publicitaria, cifras, campañas, crear (lazy)
worker/
  index.js                Enrutado, sesión y cabeceras de /api/*
  hub.js                  Durable Object: un espacio, sus sockets y su presencia; y la ALARMA que lleva el Estudio sin pantalla
  lib/
    acceso.js             La capa que sustituye a las políticas RLS
    sesion.js             PBKDF2, cookie __Host-, espacio de trabajo e invitaciones
    vivo.js               Difundir un cambio al espacio; la firma de quién lo hizo
    publico.js            El enlace de aprobación, sin sesión
    meses.js              Calendario siempre activo: obtener o crear el mes; mover una
                          publicación a otro mes (todo o nada, con las seis tablas)
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
    anuncios.js           Meta Ads: cuentas publicitarias, campañas e /insights, subir el medio
                          (/adimages, /advideos por file_url), crear en pausa, activar y pausar
    mcp.js                Las herramientas de Claude por MCP (consulta + escritura)
    competencia.js        `business_discovery` de un competidor (sus últimas publicaciones) y «traer» su archivo del CDN de Meta
                          a la galería («Competencia»), también desde un enlace de Instagram SIN @ (memoria, cuentas fijas,
                          página pública) y la miniatura de un reel con música
    inspiracion.js        Inspiración: leer las cuentas de un cliente (Instagram y YouTube), guardar lo que publican con su
                          «rinde», borrar lo que ya no está, avisar de lo que rinde 3×, el cron y el resumen con IA
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
                          higgsfield-schemas.json (SU documentación: campos, valores, obligatorios), ideas.js
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
    bandeja/              La Bandeja: webhook.js (la firma del webhook de Meta y qué dice un aviso;
                          puro), almacen.js (de quién es cada aviso y guardarlo fundiendo lo que
                          había), graph.js (suscribir la página, «Actualizar», responder, ocultar,
                          borrar y el mensaje privado)
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
    avisos.js             /api/avisos: la bandeja de quien pregunta y marcar leídos
    bandeja.js            /api/bandeja (comentarios y mensajes) y el webhook de Meta
                          (/api/webhooks/meta, sin sesión)
    anuncios.js           /api/anuncios: cuentas, campañas, estadísticas, crear, activar (admin + confirmado)
    plantillas.js         /api/plantillas-plan: listar, guardar (cambiar una de arranque o crear) y borrar/restaurar
    formulasUgc.js        /api/formulas-ugc: las fórmulas UGC de la agencia (listar, guardar, corregir, quitar, proponer)
    inspiracion.js        /api/inspiracion/<cliente>: el feed, actualizar, traer un archivo, el resumen
    historiasAuto.js      /api/historias-auto/<cliente>: ajustes, pendientes de preparar, piezas
migraciones/d1/           Esquema de D1 (0001 base … 0012 aprobación, 0013 redes, 0014 métricas, 0015 informes, 0016 variantes, 0017 auditorías, 0018 mcp, 0019 tipo de aprobación, 0020 equipo, 0021 permisos de Meta, 0022 Haiku, 0023 un mes por cliente, 0024 cerebro, 0025 memoria de decisiones, 0026 estudio, 0027 modelo por función, 0028 youtube, 0029 comentarios y mensajes, 0030 biblioteca de anuncios, 0031 anuncios, 0032 fechas especiales, 0033 kit de marca, 0034 estudio de mercado, 0035 ritmo de contenido, 0036 inventario, 0037 plantillas de plan, 0038 campañas con varios conjuntos y anuncios, 0039 estratega, 0040 historial de anuncios, 0041 informe de anuncios, 0042 galería agrupada y repetidos, 0043 conversaciones del asistente, 0044 banco de ideas único, 0045 fórmulas UGC, 0046 inspiración, 0047 conversaciones de diseño, 0048 historias automáticas, 0049 encargos del Estudio: lote y carrusel, 0050 historias apartadas)
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
| `/cliente/<slug>/tareas` · `/contenido` · `/ideas` · `/inspiracion` · `/resultados` · `/estudio` · `/diseno` · `/cerebro` · `/ficha` | Las otras pestañas del cliente (`/diseno`: el director creativo) |
| `/tareas` | Mi día |
| `/ajustes` | IA, presupuesto, integraciones, tareas, copia de seguridad |
| `/resultados` | Todos los clientes, últimos 30 días |
| `/programacion` | Lo aprobado por programar y la cola de todos los clientes: lo que falló, lo que sale, lo que salió |
| `/tablero` | Las publicaciones de todos los clientes por etapa (Idea → Publicada) |
| `/bandeja` | Comentarios y mensajes de Facebook e Instagram de los clientes con la bandeja encendida |
| `/auditorias` | Auditorías de perfil de clientes y prospectos |
| `/biblioteca` | Biblioteca de anuncios de Meta: buscar, filtros guardados, CSV |
| `/campanas` | Anuncios de Meta: campañas, cifras y crear (en pausa) |
| `/auditoria?t=<testigo>` | Auditoría compartida (sin sesión) |
| `/conectar-claude?…` | El permiso de Claude (OAuth: `authorization_endpoint`) |
| `/a-mano/<calendario>/<publicación>` | Publicar a mano desde el teléfono |
| `/mcp` | El servidor MCP (del Worker, no de la SPA) |
| `/equipo` | Quién entra en el espacio |
| `/invitacion/<testigo>` | Enlace de invitación (sin sesión) |
| `/aprobar?t=<testigo>` | Página del cliente final (sin sesión) |
| `/informe?t=<testigo>` | Informe mensual del cliente final (sin sesión) |
| `/informe-anuncios?t=<testigo>` | Informe de anuncios del cliente final (sin sesión) |

El slug sale del nombre normalizado, y `slugsUnicos()` garantiza que dos
clientes que normalicen igual no compartan dirección. Los nombres de las
pestañas (`PESTANAS_CLIENTE`) están reservados: un calendario llamado
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
  mira `getChatTools()` y el contexto de `buildChatSystemPrompt()`: lo
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
  cifra y sólo con el «sí» se repite. Sin cliente, la imagen de Gemini de siempre. El video llega como `[[video: clave]]`.
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
  Claude por MCP tampoco se salta el segundo toque. Con el presupuesto agotado y «detener»
  se rechaza antes de crear, y otra vez antes de cada imagen.
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
  · **Lo que necesita lienzo lo hace la pantalla al volver**: el texto de la plantilla y el logo estampado
  (`terminarPieza`, una vez por pieza; `finales`). Mientras, la pieza se ve cruda.
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
  estilo, luz, tipografía, «nunca»), mientras el kit tenga algo y no se apague
  «Usar el kit en esta pieza». Antes sólo viajaba dentro del preset: con «Sin
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
  `repetir-omitidas:<cliente>`); sólo desde hoy (Panamá). La copia (`copiaRepetida`) es una IDEA pendiente sin archivos,
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
- **«UGC · guion para grabar» (antes «Video con rostro») es un REEL que graba una persona** (`rostro: true` en la
  publicación del plan, la casilla, la idea y el post; sólo vale en un reel). La IA le escribe un guion para GRABAR,
  tramo a tramo (`src/lib/ugc.js`): `[0–3 s] VOZ: «palabra por palabra» | SE VE: la toma | TEXTO: en pantalla`. Sigue en
  `post.guion` (texto: el enlace del cliente y la exportación no cambian) y `partirGuionUgc` lee también la forma corta
  del lote («dice · se ve · texto»). Al lado, `duracionUgc` (15/30/45/60 s; la voz cabe a 2,5 palabras por segundo y el
  panel avisa si sobra) y `ganchosUgc` (3 alternativos; «Usar este» cambia la voz del primer tramo). El lote no lo crea
  con IA: van al calendario como idea con su guion (`conRostro` en EstudioLote). El servidor sólo acepta el booleano
  (`limpiarCasillas`; también en el modo «publicacion», que ahora lo recibe). En el panel (`GuionUgc.jsx`), la tabla, la
  duración, «Copiar la voz» y «Copiar la lista de tomas» y los ganchos; el texto se edita en su campo de siempre.
  · **El botón «IA» del guion aplica la regla UGC** (`reglaUgc` + `LINEA_GANCHOS` por `generateFieldForPost(…, {
  reglaGuion })`: ugc.js NO va al arranque, la regla la pasa el panel). Sin idea, primero el motor de ideas (que ya trae
  el guion para grabar); con idea, el guion sobre ella, y lo que la idea cita entre comillas se dice TAL CUAL.
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
- **«Mejorar idea» se lanza SOLA al abrir «Crear con IA» desde una publicación** (apagable, se recuerda por
  navegador): la idea + el texto de la pieza + el contexto llegan juntos y largos; en una imagen la reescribe el
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
  fotos de su producto, su tipo, el control y el logo; confirma desde 0,50 $ como «Otra versión» y «Deshacer» la quita.
  «Crear con IA» sigue para revisarlo antes. «¿Qué quieres?» (opcional, no se guarda) lo suman «Crear la imagen aquí»,
  «Otra versión» y «Recrear con mi marca» (`lineaDeIndicacion`: también a la IA que escribe la escena nueva);
  «Corregir esta» lo NECESITA y EDITA la misma imagen (`rehacerConComentario`, como «Rehacer con lo que pidió el
  cliente») en su sitio. Se vacía al salir bien. CalendarView importa el motor de ideas EN DIFERIDO (al pulsar
  «Completar los textos»): con la huella dentro, la carga inicial pasaba de 180 kB.
- **«Otra versión», «Corregir esta» y «Recrear con mi marca» de una imagen del post se hacen EN EL ESTUDIO por defecto**
  (decisión de la agencia: lo hecho a ciegas en el post, sobre todo una lámina suelta de un carrusel, salía peor que en
  la galería). `abrirEnEstudio` (seccionPublicar) pasa la imagen por `archivoEnGaleria` (lib/estudio.js: la ficha que
  ya había por ruta o clave; si se subió directo al post o vino de Drive, la SUBE —la huella evita la copia doble—) y
  abre el diálogo del Estudio con `inicial.abrir`: el visor (sus versiones; «Editar» ya abierto con lo escrito en «¿Qué
  quieres?») o el recreador. Lo escogido —esa pieza o cualquiera de la galería— va al SITIO de la imagen tocada
  (`onReemplazar` de `useCrearConIA`; el botón dice «Poner en la lámina N»), no al final. «Otra versión» de una imagen
  que no salió del Estudio (subida: no hay pedido que repetir) abre el compositor con ella de referencia. Con
  `inicial.abrir` el diálogo NO lanza «Mejorar idea» (`listo`): se viene a corregir, no a crear. «Aquí, rápido» (se
  recuerda por navegador, `post-acciones-donde`) es el camino de antes. «Animar» se quitó del post.
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
  muy poca atención. Fase 1: «Sólo las ideas al calendario» las lleva SIN diseñar, cada una en su día, con
  `aprobacion: "idea"` y «Qué se ve» (`post.escena`), que es lo primero que leen después «Crear con IA» y «Producir el
  mes» (`promptDePublicacion`). Fase 2: crear las que no se llevaron. Formatos `carrusel` y `reel` (`guiado` en
  `FORMATOS_LOTE`): la IA escribe además su guion y cada idea pasa por el camino de a mano —`crearCarruselDeIdea`
  (propuesta + láminas) y `crearReelDeIdea` (planos + fotogramas + video)—, uno detrás de otro; sin revisión entre
  medias: los tramos y las láminas se corrigen después en el Estudio. Los personajes del kit también van en el lote.
- **«Generar» la idea de un post vacío va por el LOTE** (`src/lib/ideaPublicacion.js`, modo «publicacion» de
  `POST /api/estudio/<c>/lote/ideas`). Antes era una frase genérica («una idea creativa, 2 oraciones») con «publicación de
  post» sin decir qué es un post: salían ideas planas, y para un post a veces un carrusel o un reel. Ahora es UNA casilla
  de `darForma` con lo que ya trae la publicación (tipo, producto, nivel, deseo, perfil, la fecha especial de su día), la
  campaña y la semana como `nota`, y lo que ya hay en el mes en `usados`; el estudio de mercado, el catálogo y el cerebro,
  como el lote. `REGLA_FORMATO` (loteAnuncios.js) dice con todas sus letras qué es cada formato, también en el lote, y
  `instruccionIdea` (api.js, el camino de una idea ya escrita y del banco) nombra el formato y prohíbe cambiarlo.
  `rellenarConIdea` SÓLO rellena: título, idea (el brief), qué se ve, el texto de la pieza (no en carrusel ni en reel) y
  el guion (sólo carrusel y reel); el producto va con su nombre o no va. Un directo sigue por el camino de siempre.
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
- **«Producir el mes» es el botón grande del calendario** (antes «Generar contenido», que sólo escribía textos). Sin
  publicaciones va directo al Estudio con `?lote=mes&mes=AAAA-MM` (Estudio lo lee al montar, abre el lote en «Mes completo»
  con ese mes —también uno de más de dos meses adelante— y quita la búsqueda de la dirección); con publicaciones pregunta
  (`ProducirElMes.jsx`): crear lo que falta o diseñar lo que hay. «Completar los textos que faltan» (el `generateScripts`
  de siempre) quedó en el menú «⋯».
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
  también estampa el logo). Se apaga por navegador («Revisar cada pieza…», `controlEncendido`). Con la plantilla, el
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
  `extraerUgc({ youtube })`; con Meta como motor de video, 409). **TikTok no deja ver lo de otros**: la cuenta queda con su
  error y se abre su perfil.
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
  guion: como el video de…» (`post.estructuraRef`, el texto; `buildScriptPrompt` lo lee).
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
  y descripciones» manda reel, carrusel, historia y directo sin guion por `buildScriptPrompt` y lo demás por
  `buildDescripcionesPrompt`, y sólo rellena.
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
  (`REGLA_TEXTO_PIEZA` en api.js: titular, apoyo y el precio EXACTO del catálogo) junto con guiones y descripciones,
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
  en cualquier modo. El asistente y Claude por MCP no pueden estampar (no hay lienzo en el Worker): con «estampado»
  piden sin logo.
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
  círculo central (`RADIO_SEGURO`), seis estilos con la paleta del kit, y el icono se toma del SVG de `Icon.jsx`
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
- **Lo aprobado NO sale solo: espera el paso final.** El cliente aprueba
  a veces sólo la IDEA y a veces la PIEZA FINAL; cada publicación dice cuál
  se le pide (`post.aprobacion`, sin elegir: pieza si hay archivo) y la
  respuesta guarda qué aprobó y con qué texto (`approvals.tipo`, `huella`,
  0019). Idea aprobada = «por producir»: nunca se programa. Pieza aprobada
  = «por programar»: espera en Programación → «Aprobadas, por programar»
  (y en Mi día) a que alguien la revise y pulse Programar. «Programar al
  aprobar» sigue, APAGADO por defecto, y aun encendido sólo con piezas.
  Lo subido con «Subir» sigue saliendo directo.
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
  (`moverDeMes`, worker/lib/meses.js). Seis tablas señalan cada publicación
  por «calendario + publicación» (approvals, comentarios_aprobacion,
  publicaciones_programadas, client_tasks, notas_equipo, historial): mover
  sólo el JSON las dejaría apuntando al mes viejo. D1 no aborta un lote por
  una sentencia que no toca filas, así que `trasladarPublicacion()` encadena
  condiciones: el origen se escribe sólo si ni él ni el destino cambiaron,
  el destino sólo si el origen lleva la marca nueva, y las seis tablas sólo
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
- **El PROMPT MAESTRO de Meta AI no lo lee NINGUNA IA** (decisión de la agencia: instrucciones viejas de otro proyecto).
  `fueraDeUso` (worker/lib/cerebro/cerebro.js) deja fuera de todos los usos —también del asistente— las notas de tipo
  `maquetacion` y las que se titulan «Prompt maestro», «Meta AI» o «Nano Banana vN» (`esDelPromptMaestro`), y
  `buildClientContext` ya no tiene `{ maquetacion }`: el ADN de antes llega siempre sin esa capa. Las notas siguen en la
  pestaña Cerebro para borrarlas. Si vuelve a aparecer «prompt maestro» en un pedido, es una regresión.
- **El asistente es el DIRECTOR CREATIVO del cliente** (`src/lib/director.js`, `src/lib/disenoChat.js`,
  `src/lib/herramientasDiseno.js`, `PlanDePiezas.jsx`). Con un cliente, el Worker le pone en el sistema el manual, la
  ficha, sus herramientas y lo que exige su kit (o que NO tiene kit: lo dice y ofrece prepararlo) —`instruccionDeDiseno`,
  `resumenDelKit` en worker/rutas/chat.js—. Cosas que no se ven:
  · **`disenar_piezas` (1–12 fichas) espera un BOTÓN**: la herramienta enseña el plan con su costo y su promesa no se
  resuelve hasta «Crear» o «Cambiar algo» (como `guardar_en_cerebro`). El botón es la confirmación del costo, como en el
  lote; «Final» rehace con el mejor modelo con llave (`MODELOS_FINALES`). Se crea de 3 en 3 (`crearPlan`) con el control
  y el logo estampado; las de una publicación se ponen en ella con su ficha como pedido listo.
  · **El modelo VE lo que crea**: cada imagen vuelve en el `tool_result` como bloque de imagen (`paraElModelo`, copia de
  768 px en JPEG; el resultado lleva texto + imágenes). Antes recibía «Imagen creada» y diseñaba a ciegas.
  · **Las vueltas de diseño no gastan del tope** (`HERRAMIENTAS_DE_DISENO` en ChatPanel: crear, corregir, mirar, la regla
  y `crear_publicacion`): doce piezas eran doce vueltas y salía «Me quedé sin vueltas». Tope normal 10, total 40.
  · `corregir_pieza` edita la misma imagen y la nueva sustituye a la anterior en el mensaje y en la publicación; acepta el
  id o la CLAVE (el botón «Pedir un cambio» de una imagen del chat deja «En la imagen clientes/…:» en la caja).
  `guardar_regla` suma al kit (sólo con el sí de la persona). Las definiciones viven en `herramientasDiseno.js` y NO en
  api.js: api.js va en el bundle principal, y con ellas la carga inicial pasaba de 180 kB.
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
  catálogo; se recuerda por cliente en `crear-aqui:<cliente>`). Vacío es lo de siempre: el tipo del post, el estilo de ese
  tipo, el modelo fijado y ninguna plantilla.
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
  del catálogo y van las fotos de los que nombra (`fotosDeLaPieza`). Sin director (sin saldo), la de antes, con
  `NOTA_OTRA_MARCA` («ligeramente distinta… que no se reconozca como copia»).
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
- **«Modo director» en el asistente flotante** (ChatPanel, con un cliente): las conversaciones nuevas son de diseño
  (`tema: "diseno"`, las mismas que la pestaña Diseño), cambia el título y salen los encargos (`ATAJOS_DIRECTOR` en
  director.js, compartidos con la pestaña). Abrir una conversación de diseño lo enciende y una de las otras lo apaga; la
  lista tiene «Todas / Diseño» cuando hay de las dos. El sistema del asistente ya sabía diseñar con cliente: el modo cambia
  dónde se guarda y lo que se ve, no lo que sabe.
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
- `docs/propuesta-cerebro-por-cliente.md` — un cerebro por cliente (notas en D1, índice
  en R2, ficha técnica y cifras, búsqueda por pasajes) en lugar de volcar el ADN entero
  en cada llamada. Fases 0 y 1 implementadas; memoria de decisiones, visualización,
  PDF/Word/Excel, Estudio, Meta y el puente con Agents Office, pendientes.
