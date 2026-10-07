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
    mercado.js            Cliente de /api/mercado
    consciencia.js        Niveles de consciencia (Schwartz) y deseos de Reiss: pequeño, para el bundle principal
    videoCorto.js         Guiones de video de 8 s (Veo) o 10 s (Kling Omni): gancho, beneficio y cierre; el pedido
                          al modelo sin texto largo ni logo (puro; también lo importa el Worker)
    portadas.js           Las piezas del perfil por plantilla: estilos de portada, colores del kit, medidas (puro)
    pilares.js            Los 6 tipos de contenido de la agencia (+ Viral / alcance y Comunidad), el ritmo semanal por
                          cliente, las sugerencias de temporada y la matriz (tipo × producto × nivel × deseo × perfil) (puro)
    plantillasPlan.js     Las plantillas de plan: 3 objetivos × 3 negocios de arranque, juntar con lo guardado, la del
                          cliente, la línea que lee la IA (puro; también lo importa el Worker)
    plantillasApi.js      Cliente de /api/plantillas-plan
    kitMarca.js           El kit de marca del Estudio: paleta, presets (producto, anuncio, corporativo,
                          creativo), componer el pedido, el logo de referencia, pedidos a la IA (puro;
                          también lo importa el Worker)
    estudio.js            Cliente de /api/estudio y lo puro de la pantalla: filtros, trabajos en curso,
                          de una publicación al Estudio y del Estudio a una publicación
    vivo.js               WebSocket: reconexión, latido, presencia
    horas.js              «9am» → «09:00» y vuelta; la hora que se TECLEA («930», «21:30») (puro)
    idioma.js             La regla del español latino neutro, puesta en toda llamada de texto (puro)
    estadoChip.js         Qué dice el chip del mes: miniatura, icono de estado, idea (puro)
    youtube.js            Cliente de /api/redes/youtube (conectar, enlace, elegir canal, privacidad)
    lote.js               Editar muchas publicaciones de una vez (puro)
    exportarContenido.js  Texto de «Exportar ideas y descripciones» (puro)
    completitud.js        Cuánto le falta a una publicación (puro)
    agenda.js             «Mi día»: hoy, atrasos, periodos de las recurrentes (puro;
                          también lo importa el Worker)
    foco.js               La empresa en foco de cada persona, por día
    configIA.js           Nombres de modelos y niveles de razonamiento (puro)
    mensajeChat.js        Marcas del chat: piezas, imágenes, contexto (puro)
    medios.js             Fotogramas de video, imagen para la IA, descarga a tamaño
    drive.js              Id de carpeta a partir del enlace, tipo y tamaño (puro;
                          también lo importa el Worker)
    buscar.js             Lo que encuentra el buscador Ctrl+K (puro)
    resumenCliente.js     Por aprobar / con cambios / a medias; mes por defecto (puro)
    publicacion.js        Qué se publica, límites de cada red, qué ve el cliente, a qué
                          hora sale (puro; también lo importa el Worker)
    cola.js               La cola de publicación resumida para la rejilla y el panel, la
                          página Programación y «Programar lo aprobado» (puro)
    resultados.js         De las filas de métricas a cifras, formatos, horarios (puro)
    colores.js            Colores y logo de la marca a partir del ADN (puro)
    semanas.js            La vista de lista por semanas: agrupar, resumen, cuál se abre (puro)
    campanas.js           La campaña del mes y de cada semana: semanas de la rejilla, el pedido a la IA
                          y su lectura (puro)
    fechasEspeciales.js   Feriados de Panamá, comerciales e internacionales (Pascua y Carnaval
                          calculados) + lo que elige cada cliente; el pedido a la IA (puro)
    subir.js              «Subir»: formato deducido, redes por defecto, rellenar lo vacío con
                          la propuesta de la IA, poner o mover una publicación de día (puro)
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
    anunciosApi.js        Cliente de /api/anuncios
  components/
    Icon.jsx              Set de iconos SVG monocromos (rejilla 24, trazo 1.75)
    Presencia.jsx         Avatares, estado de la conexión, «X está editando»
    SelectorFecha.jsx     Calendario del mes para escoger una fecha (portal)
    SeccionIA.jsx         Ajustes → IA: modelo, nivel al escribir, nivel del asistente
    SeccionPresupuesto.jsx  Ajustes → presupuesto, qué pasa al llegar, consumo por día/cliente
    SeccionDrive.jsx      Ajustes → Integraciones: conectar Google Drive
    SeccionMeta.jsx       Ajustes → Integraciones: conectar Meta y asignar cuentas
    SeccionTikTok.jsx     Ajustes → Integraciones: TikTok de cada cliente y su modo
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
    CargaEquipo.jsx       Qué tiene cada persona los próximos 7 días
    PanelTareas.jsx       Las tareas al lado, como Google Tasks: «Hoy» fijo, lo demás plegable (lazy)
    RepasoAtrasadas.jsx   El repaso de la mañana: qué se hace con cada atrasada
    calendario/aprobacionCliente.jsx  «¿Qué aprueba el cliente?» y en qué quedó
    calendario/equipoPublicacion.jsx  Lo lleva, etapa, hilo del equipo, tareas de la
                          publicación e historial
    SubirRapido.jsx       «Subir»: cliente → archivo → la IA escribe → cuándo sale (diálogo)
    calendario/cuandoSale.jsx   «¿Cuándo sale?» del panel: Ahora / Programar / La publico yo
    calendario/horaSugerida.jsx La hora con mejores resultados, compartida por los dos
    calendario/destinoRedes.jsx «¿Qué sale y dónde?»: formato y cada red con su casilla y
                          lo que sale en ella; la usan el panel y «Subir»
    calendario/ajusteImagen.jsx La imagen que no cabe: difuminado, color, recorte o
                          GENERADA de nuevo con IA en 4:5/9:16 (Nano Banana); la usan el panel y «Subir»
    calendario/copiaDrive.jsx «Guardar copia en Drive» al programar (panel y «Subir»)
    ExploradorDrive.jsx   La carpeta de Drive de un cliente: gestionar o escoger
    BancoSelector.jsx     Escoger de Drive (o del banco anterior); forma única
    PestanaContenido.jsx  La pestaña Contenido: Drive + migrar el banco anterior
    Estudio.jsx           La pestaña Estudio y el diálogo «Crear con IA»: pedir imágenes o videos,
                          verlos aparecer, galería, carpetas y papelera (lazy)
    EstudioCompositor.jsx Qué crear: tipo, prompt, modelo (ordenar/filtrar), ajustes, imágenes de apoyo
    EstudioVisor.jsx      La pieza grande (imagen o video) con todo lo que se sabe de ella, «Usar como logo»
                          y «Revisar marca»
    EstudioMercado.jsx    El estudio de mercado en la pestaña Cerebro: catálogo, «Realizar estudio de mercado» por
                          pasos con revisión, y las referencias de la competencia (lazy)
    EstudioKit.jsx        El kit de marca: prepararlo con IA desde el cerebro, revisarlo, guardarlo
    calendario/crearConIA.jsx  El Estudio en un diálogo dentro del panel de una publicación y de «Subir»
                          (el hook que lo abre, en hooks/useCrearConIA.jsx)
    Cerebro.jsx           La pestaña Cerebro: las notas de un cliente, filtros, buscar, añadir, subir
    CerebroAprendizaje.jsx  «Lo que aprende»: señales, aprender del historial y de los resultados,
                          y las reglas que la IA propone para que una persona las acepte
    CerebroGrafo.jsx      «Mapa 3D» de la pestaña: explorar, elegir una nota, ver sus vecinas (lazy)
    InterruptorBandeja.jsx  El interruptor de la bandeja de un cliente: en la ficha y en la Bandeja
    ContadorBandeja.jsx   El número de pendientes sobre «Bandeja» en la navegación
    cerebro3d/escena.js   El lienzo del mapa: dibuja, gira, elige; sin librerías (canvas 2D)
    NavPrincipal.jsx / MenuCuenta.jsx / BarraInferior.jsx / Buscador.jsx
                          Armazón: secciones, cuenta, barra del móvil, Ctrl+K
    ClientModal.jsx       Alta y edición de cliente (5 pestañas)
    PlanWizard.jsx        «Planificar mes»: 6 pasos que escriben en el mes elegido (lo AÑADEN
                          si ya tenía publicaciones)
    calendario/navegadorMes.jsx ‹ Octubre 2026 › Hoy: recorrer el calendario siempre activo
    calendario/tipoContenido.jsx  «Tipo de contenido» del panel: tipo, producto, nivel, perfil y deseo
    calendario/campanaMes.jsx   La tarjeta de la campaña: nombre del mes, semanas, ofertas, fechas
    calendario/fechasEspeciales.jsx  Escoger las fechas de un cliente (importante, ocultar, propias, IA)
    CalendarView.jsx      Vista de lista y de rejilla, filtros, generación, envío
    anuncios/AsistenteCampana.jsx  «Nueva campaña»: objetivo, presupuesto, público, anuncio, revisar
    anuncios/DialogoActivar.jsx    Activar: el presupuesto y las fechas, y escribir ACTIVAR
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
    Ajustes.jsx           IA, presupuesto y consumo, integraciones, tareas, copia
    Campanas.jsx          /campanas («Anuncios»): cuenta publicitaria, cifras, campañas, crear (lazy)
worker/
  index.js                Enrutado, sesión y cabeceras de /api/*
  hub.js                  Durable Object: un espacio, sus sockets y su presencia
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
    publicador.js         La cola: programar, procesar (Instagram/Facebook/TikTok), reintentos
    tiktok.js             OAuth de TikTok por cliente, tokens que se renuevan, subida en trozos
    youtube.js            OAuth de Google por cliente (YouTube), subida reanudable por trozos,
                          portada, cifras del canal (Data API + Analytics)
    metricas.js           La foto diaria de métricas de cada cuenta y de la competencia
    informes.js           Cifras del mes (congeladas) + análisis de la IA; el del día 1
    auditorias.js         Leer un perfil (cuenta propia o business_discovery) y auditarlo
    biblioteca.js         Una búsqueda en /ads_archive (una llamada, con topes) y sus errores
    anuncios.js           Meta Ads: cuentas publicitarias, campañas e /insights, subir el medio
                          (/adimages, /advideos por file_url), crear en pausa, activar y pausar
    mcp.js                Las herramientas de Claude por MCP (consulta + escritura)
    mercado.js            El estudio de mercado: catálogo (y su nota de cifras), el estudio por pasos con búsqueda
                          web, aprobar (notas del cerebro + documento en Drive), referencias de la competencia
    estudio/              El Estudio: meta.js (Muse Image: generar y editar, 0,01 $), prompt.js («Mejorar
                          idea»: la idea más clara, en una o dos frases), trabajos.js (pedir, avanzar por pasos, cancelar; el permiso de
                          un paso a la vez y el cron), motores.js (prueba y Gemini, mismo contrato;
                          fal.js y higgsfield.js son los otros dos), gemini.js (la llamada,
                          compartida con /api/generar-imagen), galeria.js (archivos, carpetas,
                          papelera), archivos.js (claves de R2, tipo por bytes), descarga.js (bajar un
                          resultado a R2 por flujo, con topes), herramientas.js (ver_estudio,
                          crear_en_estudio y estado_trabajo: las mismas para el asistente y el MCP),
                          higgsfield-schemas.json (SU documentación: campos, valores, obligatorios)
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
                          reglas y una persona las decide)
    herramientasServidor.js  Lo que el asistente consulta sin el navegador:
                          web, repositorio de GitHub, calendarios, tareas, ideas
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
    imagen.js             Generación de imágenes (Gemini)
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
migraciones/d1/           Esquema de D1 (0001 base … 0012 aprobación, 0013 redes, 0014 métricas, 0015 informes, 0016 variantes, 0017 auditorías, 0018 mcp, 0019 tipo de aprobación, 0020 equipo, 0021 permisos de Meta, 0022 Haiku, 0023 un mes por cliente, 0024 cerebro, 0025 memoria de decisiones, 0026 estudio, 0027 modelo por función, 0028 youtube, 0029 comentarios y mensajes, 0030 biblioteca de anuncios, 0031 anuncios, 0032 fechas especiales, 0033 kit de marca, 0034 estudio de mercado, 0035 ritmo de contenido, 0036 inventario, 0037 plantillas de plan)
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
| `/cliente/<slug>/tareas` · `/contenido` · `/ideas` · `/resultados` · `/estudio` · `/cerebro` · `/ficha` | Las otras pestañas del cliente |
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
  de servidor (búsqueda web y lectura de páginas de Anthropic; repositorio
  de GitHub; ver_calendario/tareas/ideas) las encadena el Worker sin
  volver al navegador. Las que ESCRIBEN en el calendario abierto siguen en
  el navegador, que sabe no pisar lo que la persona está editando: cuando
  el modelo pide una, el Worker cierra el turno con `resultadosServidor`
  y el navegador junta los suyos en el MISMO mensaje —la API exige todos
  los tool_result de una vuelta juntos—. Y lo que el Worker devuelve en
  `mensajes` se reenvía TAL CUAL: los bloques de razonamiento llevan
  firma, y tocados son un 400. Entre turnos no se reenvían: el historial
  guardado es texto.
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
  todo. El asistente pide `{ maquetacion: true }` y sigue viendo el ADN íntegro.
- **El Estudio: una imagen es un TRABAJO, y el Worker no puede esperar.** Pedir crea
  una fila (`estudio_trabajos`) y cada `POST …/avanzar` da UN paso —una imagen—, que
  guarda su avance; lo avanza el navegador mientras se mira la pantalla y el cron
  (`avanzarPendientes`, el último paso de la vuelta, sólo si no hubo nada que publicar,
  medir ni informar) para lo que nadie mira. Cosas que no se ven mirando la pantalla:
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
- **El kit de marca del Estudio: lo que la agencia hacía en Flow con un texto
  por marca, por cliente y SALIDO DEL CEREBRO** (`clients.kit_marca`, 0033;
  lo puro en `src/lib/kitMarca.js`, lo que toca base/R2/IA en
  `worker/lib/estudio/kit.js`).
  · **«Preparar con IA» PROPONE, no guarda.** Lee el cerebro con `para:
  "imagen"` (nunca lo interno) más la ficha, y la IA escribe paleta (sólo
  colores que aparezcan, con su papel), tipografía, estilo, luz, «nunca» y
  los cuatro presets en el tono de los de la agencia (los de Baby Caleb y
  ROFER van como EJEMPLO del tono, no se copian). Una persona lo revisa y
  guarda; «Corregir antes» abre el formulario.
  · **El pedido es corto:** `componerPedido()` = preset + «Escena: idea» (+ la
  línea de movimiento en video). Lo que sale al motor es lo que queda en la
  galería; `ideaDelPedido()` recupera la escena para «Pedirla corregida».
  · **El logo va de referencia sólo en imágenes** (`ponerLogo()`): en un video
  la imagen de apoyo es el primer fotograma y el video empezaría en el logo.
  Tiene que ser PNG/JPG/WEBP de ESE cliente (lo comprueba el servidor: un SVG
  no le sirve a ningún motor). `clientToRow` NO lleva `kit_marca`: sólo lo
  escribe el Estudio, así una ficha abierta desde antes no lo pisa.
  · **«Revisar marca» MIRA la imagen** (va como bloque de imagen, ≤ 3,5 MB) con
  el kit delante y devuelve puntaje, qué cumple, qué falla y una sugerencia.
  Funciones «kit de marca» y «revisión de marca» en el hueco «análisis».
  · **El asistente y Claude (MCP) usan el mismo kit:** `crear_en_estudio` con
  `estilo` compone igual que la pantalla y pone el logo; `ver_estudio` dice si
  el kit está preparado.
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
- **Las plantillas de plan: las de arranque en el código, lo cambiado en D1, la del cliente en su ficha**
  (`src/lib/plantillasPlan.js`, `plantillas_plan` y `clients.plan_contenido`, 0037). Tres objetivos (Centrado en
  ventas, Ventas y seguidores, Marketing 360) × productos/servicios/marca personal. Por día, cada publicación lleva
  formato y tipo; un tipo vacío es «el del ritmo del cliente ese día», así el ritmo y la temporada siguen mandando y
  la plantilla sólo AÑADE (los reels «Viral / alcance», la «Comunidad»). Una fila con el id de una de arranque la
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
  `POST /api/estudio/<cliente>/guion-corto`). Los modelos de la agencia hacen 8 s (Veo) o 10 s (Kling Omni, por
  Higgsfield, `kling-omni` en el generador): la duración la decide el MODELO (`segundosParaModelo`), y al usar el
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
  fuera, y también las notas de maquetación. La IA no puede filtrar lo que
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
  chat usa `{ maquetacion: true }` porque alguien puede pedirle el prompt
  para Meta AI; en la Fase 0 se le quitó sin querer (`buildChatSystemPrompt`
  también pasa por `buildClientContext`) y este mismo archivo decía que no.
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
- **El asistente es diálogo o panel según el ancho.** Desde 1280 px se
  acopla a la derecha (`role="complementary"`, `useDialogA11y(…, {
  activo: false })`): sin foco atrapado ni fondo oscuro. Por debajo,
  diálogo como siempre.
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
- **TikTok no es Meta: una conexión POR CLIENTE.** No hay un usuario de
  agencia que vea todas las cuentas; cada una se conecta entrando con
  ella. Por eso existe el enlace firmado para el cliente
  (`/api/redes/tiktok/inicio/<firmado>`, sin sesión, una semana), que
  abre el permiso en SU teléfono y deja la cuenta en SU ficha. El token
  de acceso dura 24 horas: `tokenTikTok()` lo renueva y GUARDA el nuevo
  (TikTok puede cambiar también el de renovación; perderlo obliga a
  reconectar). Sin auditar, la publicación directa sale en privado: el
  modo por defecto es Borrador, que llega a la bandeja del cliente.
- **A TikTok el video se le SUBE, en trozos, desde R2.** Que lo descargue
  de una URL exige verificar el dominio, y en workers.dev no se puede.
  Cada trozo es un rango de R2 que pasa tal cual (sin cargarlo en
  memoria). El `publish_id` se guarda sólo cuando la subida terminó: a
  partir de ahí nunca se abre otra, que sería un segundo video.
- **Las FOTOS de TikTok no se suben: TikTok las descarga, y sólo de un
  dominio verificado.** Un carrusel de fotos (sin video) va por
  `/v2/post/publish/content/init/` con `PULL_FROM_URL`, `media_type: PHOTO`
  y `post_mode` DIRECT_POST o MEDIA_UPLOAD (Borrador). Como `workers.dev` no
  se puede verificar en TikTok, las direcciones son
  `TIKTOK_MEDIOS_BASE/<testigo>/<nombre>` —`juancitoads.com/calendario-medios`,
  que Netlify reenvía con un 200 a `/api/medio-publico/` de este Worker—, la
  MISMA firma que descarga Meta (`rutaMedioPublico()`). Sin la variable, la
  cola falla diciendo qué falta: el navegador no lo sabe, así que
  `revisarPublicacion()` sólo avisa. Sólo JPG o WEBP (el panel convierte a
  JPEG también cuando la única red de fotos es TikTok), hasta 35. TikTok NO
  entra por defecto en una publicación de fotos (`redAdmite` sigue siendo
  «sólo video»): se elige a mano. **No se ha probado contra TikTok real.**
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
- **Una publicación puede salir DOS veces por red: el post y su
  historia.** Cada salida es una fila de la cola con su `variante`
  (`post` | `historia`); `piezasDe()` dice cuáles tocan y
  `publicacionDeVariante()` convierte el post en la historia (sus medios
  son `post.historias`). Al reprogramar, lo que ya salió o está saliendo
  se SALTA en vez de fallar: si no, añadir la historia a un post ya
  publicado obligaría a borrar la fila publicada.
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
  el navegador y borra el bruto de R2.
- **A lo ancho, el panel de «Subir» no desplaza entero.** Cada columna
  desplaza por su cuenta (la izquierda con la barra de «¿Cuándo sale?»
  pegada debajo; la derecha, la vista previa) y el pie del panel se funde
  en esa barra (`acciones` → `inicio` de `CuandoSale`). Con la barra pegada
  al fondo de TODO el panel, tapaba media vista previa; con dos barras
  apiladas, a 800 px de alto quedaba una rendija para configurar.
- **La portada del video se guarda dos veces**: como imagen (`portada`,
  `cover_url` de Instagram y `poster` de la página de aprobación) y como
  milisegundo (`portadaMs`: `thumb_offset` de Instagram si no hay imagen y
  `video_cover_timestamp_ms` de TikTok, que no acepta imagen).
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
  directos—, y es la MISMA regla en el panel, «Subir», «Programar lo
  aprobado» y `planificar()` del servidor.
- **El banco de ideas no se guardaba.** Añadir, editar o borrar una idea
  sólo cambiaba el estado (`onUpdateClient` era un `setClients`), y al
  recargar volvía lo de antes. Peor: llevar una idea a un día de un mes SIN
  cajón la borraba del banco y no la metía en ningún sitio —el día no
  existía en `days`—. Ahora `alCambiarBanco` guarda agrupado (sólo
  `ideasBank`: pasar el cliente entero pisaría los calendarios recién
  cambiados) e `ideaAlCalendario` crea el mes, la mete con `ponerEnDia` y
  SÓLO entonces la saca del banco. Lo vigila `regresiones.test.js`.
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
- **Copia en Drive al programar.** La copia la hace el Worker de R2 a Drive
  en flujo (`/api/drive/clientes/<id>/desde-publicacion`, carpeta
  «Publicaciones de la app»), salta lo que vino de Drive y lo ya copiado
  (`post.copiasDrive`), y nunca tumba lo programado: si falla, se dice.
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

- **«Mejorar idea», no «Escribir el prompt».** Lo que había (memoria de la
  marca, apego a las referencias, carruseles) escribía párrafos de dirección
  de arte y el motor, con tanto texto, sacaba cualquier cosa; la agencia lo
  quitó. Ahora `mejorarIdea()` (worker/lib/estudio/prompt.js, `POST
  /api/estudio/<cliente>/mejorar`) devuelve la idea en una o dos frases
  sencillas (`MAX_PALABRAS`, 60), sin JSON, sin listas y sin meter la marca
  por detrás, en el MISMO campo; «Volver a mi idea» la deshace. Es texto (función
  «prompt de imagen», con su modelo en Ajustes): no gasta en el motor.
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
- **La espera de TikTok tiene plazo** (`PLAZO_TIKTOK_MS`, 30 min en
  `pasoTikTok`): sin él, un estado que TikTok no terminaba dejaba la fila en
  «Publicando…» para siempre. Al vencer queda en error con el último estado y
  NO se reintenta (el video ya subió: otra subida serían dos en la bandeja).
  En modo Borrador, «publicada» quiere decir «en la bandeja de TikTok del
  cliente», y el aviso viaja ahora con el evento para que el mensaje lo diga.
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
  · **Nada de esto se ha probado contra la Marketing API real** (sin cuenta
  publicitaria de pruebas): los tests hablan con un `fetch` de mentira que
  contesta como la documentación. Lo primero con una cuenta real es una
  campaña de Tráfico de 1 $ al día, mirada en el Administrador de anuncios
  antes de activarla.

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
