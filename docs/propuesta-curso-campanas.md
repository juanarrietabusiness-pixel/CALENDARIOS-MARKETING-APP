# Propuesta: el curso de campañas en el calendario

5 de noviembre de 2026. **Parte 1** del curso (módulos 1 a 6.2: campañas de **interacción a WhatsApp**), cruzada con el
código de `main` (a367485) y con un calendario real (D'CASA, noviembre de 2026). Sólo lectura: nada de esto está
implementado todavía. Este documento se actualiza con cada parte nueva de los apuntes (web, ventas, clientes
potenciales, reconocimiento, módulos 7 a 9).

> **Ojo con la licencia.** El método del curso (las 7 maletas, las 3 Q, el número mágico) es el mismo de las skills de
> Felipe Vergara, cuya licencia prohíbe copiar o exportar su contenido. Como ya se hizo con el lote de anuncios, aquí
> se implementan las IDEAS y los NÚMEROS (umbrales, repartos) con palabras propias; el texto de los apuntes no entra ni
> al repositorio ni a los prompts.

## Resumen

- **La parte creativa del curso ya está casi entera.** Niveles de consciencia (con el ángulo de dolor o ganancia),
  la matriz deseos × perfiles × niveles (la «diversificación creativa» del 5.7), el estudio de mercado por producto
  con objeciones, respuestas y ganchos por nivel, 12 composiciones que nunca se repiten entre vecinas, el estratega con
  el costo máximo por resultado y la receta de 3 conjuntos (intereses, Advantage+, similares), campañas a WhatsApp
  creadas en pausa, el diagnóstico por reglas, la nomenclatura y el informe de anuncios.
- **Lo que falta son cuatro huecos, y los cuatro están en la parte de anuncios:**
  1. **El ciclo de 4 etapas como ESTRUCTURA de campañas.** Hoy se arma UNA campaña; no hay públicos personalizados de
     interacción, ni lista de clientes, ni exclusiones, ni presupuesto a nivel campaña. El reparto 60/20/10/10 no existe.
  2. **Las métricas del curso.** La app sólo lee gasto, impresiones, alcance, CPM, CPC, CTR, clics, acciones y
     frecuencia. No lee clics únicos en el enlace ni su CTR, ni reproducciones de 3 s, ni tiempo de reproducción, ni los
     rankings de calidad, así que no puede calcular el **% de mensajes** ni hacer la Q2.
  3. **El número mágico no se guarda.** El estratega lo calcula, pero el diagnóstico lo pide tecleado cada vez y el
     informe no lo usa. Y la tasa de cierre por defecto es **20 %**, cuando el curso sugiere **5 %**: con 20 % el costo
     máximo por conversación sale cuatro veces más alto y el diagnóstico da por buenas campañas que no lo son.
  4. **No hay puente entre el calendario y los anuncios.** El curso pide usar las publicaciones orgánicas que
     funcionaron y duplicar los anuncios ganadores «con su identificador»: la app siempre crea un creativo nuevo.
- **Tres vocabularios para lo mismo.** El mes usa Atraer / Considerar / Convertir / Fidelizar; el estratega, Frío /
  Tibio / Caliente; el curso, Presentación / Evaluación / Conversión / Ascensión. Y las «7 maletas» de la app
  (cliente, dolor, deseo, objeciones, alternativas, diferenciador, confianza) no son las del curso (público, problema,
  solución, diferenciales, testimonios, objeciones, garantía).

**Orden propuesto:** fundamentos y número mágico (fase 1) → métricas y 3 Q (fase 2) → del calendario a los anuncios
(fase 3) → las 4 campañas con sus públicos y exclusiones (fase 4) → WhatsApp e investigación (fase 5). Las dos
primeras sirven desde el día siguiente para las campañas de interacción que la agencia ya lleva.

---

## 1. Lo que pide el curso, módulo a módulo (resumido con palabras propias)

| Módulo | La idea que importa para la app |
|---|---|
| 1 · Trafficker profesional | Un sistema repetible, dejar aprender al algoritmo, no editar cada 1-2 días, no dejar de probar. |
| 2 · Ciclo de ventas | Cuatro etapas: presentación, evaluación, conversión, ascensión. Qué pieza va en cada una depende del **tipo de negocio y del destino** (productos o servicios, WhatsApp o web, suscripción, nicho, producto nuevo, cursos). Seis sesgos psicológicos. |
| 3 · Estudio de mercado | El 80 % del anuncio se decide antes. Lo psicográfico pesa más que lo demográfico. Las 7 maletas; si falta una, no se lanza. Herramientas para investigar, revisadas al menos una vez al mes. |
| 4 · Triángulo | Oferta (valor 5×, gratis, garantía, pago fácil), audiencia (seis formas de segmentar), textos por nivel de consciencia (y la «regla de 100»), y diez tipos de arte, de los que cada marca usa de 2 a 4. |
| 5 · Campañas a WhatsApp | Campaña / conjunto / anuncio. Objetivo según el negocio (WhatsApp → interacción). Presupuesto con números, no a ojo. Cuatro campañas, una por etapa, con su público, sus exclusiones, sus artes y sus textos; reparto 60/20/10/10. Configuración: sin pruebas A/B, maximizar conversaciones, puja automática, multianunciante. |
| 5.7 · La IA de Meta | Diversificación creativa de verdad (ID de identidad frente a ID creativo), datos de calidad (píxel, CRM, etiquetas de WhatsApp) y una estructura según si la cuenta es nueva o tiene historial. |
| 6 · Optimizar | Revisar a diario, cambiar cada 5-7 días. El **número mágico** (costo máximo por conversación) y la línea de equilibrio (ROAS y CPA) con todos los costos; bruto frente a neto; tres palancas: margen, costos fijos, valor del cliente. |
| 6.1 · Métricas | Las columnas de interacción (19) y de ventas (36). Atribución: en mensajes, 7 días clic y no se edita. |
| 6.2 · Optimizar interacción | Las 3 Q: qué pasó (gasto, conversaciones, costo por conversación), por qué (seis métricas con umbral), qué hacer. Comparar 30, 14 y 7 días. El efecto desglose: se juzga el conjunto, no el anuncio suelto. La fase de aprendizaje. Optimizar el destino (WhatsApp). |

---

## 2. Qué ya está y qué falta

**Está** · **A medias** · **Falta** · **Fuera** (no es de la app).

### Módulo 2 · Ciclo de ventas

| Del curso | En la app | Estado |
|---|---|---|
| 4 etapas del ciclo | `ETAPAS` de `src/lib/embudo.js` (atraer, considerar, convertir, fidelizar) por SEMANA del mes; `ETAPAS_EMBUDO` del estratega (frío, tibio, caliente) | A medias: otros nombres, tres vocabularios y niveles por etapa que no son los del curso |
| Qué pieza va en cada etapa según el negocio y el destino | `NEGOCIOS_PLAN` (productos, servicios, marca personal) sólo decide el formato de cada día de la plantilla | Falta: ni el destino (WhatsApp o web) ni los subtipos (suscripción, nicho, segunda necesidad, producto nuevo, cursos) existen |
| Seis sesgos psicológicos | `TACTICAS` del lote: curiosidad, pregunta, identidad, comparación, precio, autoridad, prueba, urgencia | A medias: faltan reciprocidad, empatía y micro-compromiso, y nadie decide cuáles le funcionan a cada público |
| El voz a voz y la ascensión | La maleta «testimonio» y «Contenido humano»; nada para la recompra | A medias |

### Módulo 3 · Estudio de mercado

| Del curso | En la app | Estado |
|---|---|---|
| Las 7 maletas | `ELEMENTOS_MERCADO` (`src/lib/estudioMercado.js`): cliente, dolor, deseo, objeciones, alternativas, diferenciador, confianza | A medias: falta «solución» como maleta; testimonios y garantía van juntos en «confianza» |
| «Si falta una, no lances» | `faltan` del estudio y del motor de ideas (`materialTipo.js`); el semáforo del kit sólo mira lo visual | Falta un semáforo de maletas por producto antes de anunciar |
| Público psicográfico | Dos perfiles con dolor y aspiración; tres deseos de Reiss; nivel dominante | Está |
| Hablar con 5-10 clientes | — | Falta |
| Calificaciones y comentarios | Los comentarios de Facebook e Instagram ya se guardan en la Bandeja, pero nadie los lee como investigación | A medias |
| Biblioteca de anuncios, TikTok, influencers | Biblioteca por Scrape Creators, «Lo mejor del momento», Inspiración, tendencias de TikTok, análisis de referencias | Está (mejor que lo que pide el curso) |
| Google, Ubersuggest, Analytics, MyIP.ms | El estudio de mercado busca en la web | A medias / Fuera |
| Revisarlo una vez al mes | — | Falta el recordatorio |

### Módulo 4 · Triángulo del marketing

| Del curso | En la app | Estado |
|---|---|---|
| Mejorar la oferta: gratis, garantía, pago fácil | `TIPOS_OFERTA` del estratega (con urgencia y bono) como sugerencia | Está; falta «verificar la oferta» del cliente (¿tiene garantía, algo gratis, cuotas?) |
| Segmentación detallada Advantage (intereses) | Conjunto «intereses» buscado en Meta | Está |
| Públicos personalizados (retargeting) | Sólo si ya existen en la cuenta: salen en la lista de «similares» | Falta crearlos (interacción 30/90 días, video, mensajes, lista de clientes) |
| Públicos similares | «Crear similar» al 1 % | Está |
| Segmentación abierta, Advantage+ | Conjuntos «abierto» y «advantage» | Está |
| Exclusiones | Ninguna (`excluded_custom_audiences` no aparece en el código) | Falta |
| Etiquetas de público | — | Fuera por ahora (necesita CRM o la API de WhatsApp) |
| Textos por nivel de consciencia | Niveles, ganchos por nivel, matriz del lote | Está |
| Regla de 100 | `celdasPorNiveles` pide cuántas por nivel a mano | A medias: no propone el reparto |
| 10 tipos de arte | 12 `COMPOSICIONES` + 7 `PILARES`: producto (héroe), demostración (en uso, el oficio), pantalla dividida (antes y después), beneficios, promoción, educativo, humano, testimonio (maleta) | A medias: faltan **prensa** y **aspiracional**, y no se escogen «2 a 4 por marca» |
| Probar 2-3 por tipo y quedarse con lo que funciona | `aprenderComposiciones` aprende de «Me gusta», uso y papelera | A medias: no aprende de los RESULTADOS de los anuncios |
| Tamaños 1080×1080 y 1080×1920 | La app publica el feed en 4:5 (1080×1350) | Se queda 4:5: es lo que recomienda Meta hoy (el propio apunte lo marca como dato que caduca) |

### Módulo 5 · Campañas a WhatsApp

| Del curso | En la app | Estado |
|---|---|---|
| Objetivo según el negocio | Se escoge a mano en el estratega o en «Nueva campaña» | A medias: sale de la ficha cuando haya tipo de negocio |
| Interacción optimizada a conversaciones | `optimizacionDe` → `CONVERSATIONS` con destino WhatsApp | Está |
| Presupuesto con análisis financiero | `economia()` y `escenarios()` del estratega: precio, margen y tasa de cierre | A medias: falta de la META de ventas al presupuesto, y los costos variables uno a uno |
| 4 campañas, una por etapa, 60/20/10/10 | Una campaña por vez; el «embudo» del plan es texto | Falta |
| Presentación: 3 conjuntos, 4 anuncios cada uno | Hasta 3 conjuntos (la misma receta) y de 4 a 6 anuncios que van en todos | Está |
| Evaluación y ascensión con presupuesto de campaña | Sólo presupuesto por conjunto (`is_adset_budget_sharing_enabled: false`) | Falta |
| Duplicar anuncios ganadores «con el identificador» | Cada anuncio crea su creativo nuevo (`/adcreatives`) | Falta |
| Usar publicaciones orgánicas que funcionaron | — | Falta |
| Ubicaciones Advantage+, puja automática, sin fecha fin | Sí (sin `publisher_platforms`, `LOWEST_COST_WITHOUT_CAP`, fin opcional) | Está |
| Multianunciante, revisar las mejoras Advantage+ del creativo | No se envían | Falta (pequeño) |
| Nomenclatura | Manual de campañas (Ajustes) | Está |
| Plantillas de mensaje con las objeciones | Las objeciones con su respuesta ya están en el estudio por producto | A medias: falta sacarlas para WhatsApp Business |

### Módulos 5.7, 6, 6.1 y 6.2 · Optimización

| Del curso | En la app | Estado |
|---|---|---|
| Diversificación creativa (ID de identidad) | El lote nunca repite composición entre vecinas | A medias: «Nueva campaña» no avisa si dos anuncios son casi iguales |
| Cuenta nueva o con historial | — | Falta (cambia la estructura recomendada) |
| Píxel y API de conversiones, CRM, etiquetas | `pixelId` en el borrador | A medias / Fuera |
| Revisar a diario, cambiar cada 5-7 días | El diagnóstico compara 7 días con 30 | A medias: nada frena un cambio a los 2 días |
| Número mágico por tipo de campaña | `costoMaxResultado` del estratega; el diagnóstico lo pide tecleado | A medias: no se guarda por cliente |
| ROAS y CPA de equilibrio con todos los costos, bruto y neto | Un solo «margen» | A medias |
| Columnas de interacción (19) | `CAMPOS_INSIGHTS` + `frequency` | A medias: faltan clics únicos, CTR único, costo por clic único, % de mensajes, 3 s, tiempo de reproducción, rankings |
| Las 3 Q | Reglas: apagar, revisar, renovar, vigilar, escalar, duplicar (`src/lib/diagnostico.js`) | A medias: la Q1 está; de la Q2 sólo frecuencia y caída del CTR; falta la Q3 por métrica |
| Comparar 30, 14 y 7 días | 7 y 30 | A medias |
| Efecto desglose | Cada anuncio se juzga solo | Falta: con el conjunto sano, sus anuncios no se tocan |
| Fase de aprendizaje | — | Falta |
| Optimizar la conversación (servicio, CRM, guiones) | — | Fuera, salvo lo que la app puede escribir (guiones, respuestas) |

---

## 3. Lo que enseña un calendario real

Noviembre de 2026 de D'CASA (unas 75 publicaciones; una sola muestra, pero representativa del ritmo de la agencia):

- **El ritmo es alto y fijo:** cada día un carrusel de camas a las 8:00 y un reel a las 11:00, más los posts de la
  campaña del mes. Unos 20 carruseles dicen sólo «cama» y unos 20 reels están vacíos: son huecos de producción.
- **Casi todo es conversión.** La campaña «Envío Gratis Todo Noviembre» ocupa unas 16 piezas: 12 posts «Semana X ·
  Post Y» casi idénticos (la misma lista de dos condiciones con otra primera línea) y 4 reels sobre lo mismo. Producto
  con precio y llamado a WhatsApp en casi todo.
- **Poca evaluación y la ascensión escondida.** No hay fotos reales de clientes, ni «cliente satisfecho», ni garantía
  (lo que el curso pone en evaluación y conversión para productos por WhatsApp). El combo con colchón —la ascensión del
  curso— va como una línea dentro de otros posts.
- **Lo bueno ya sale solo:** la presentadora en tienda, el UGC de la cama con luces, el «Queen Black o King Beige»
  (pantalla dividida), el llamado a WhatsApp con el número. Son tipos de arte del curso, aunque nadie los nombró así.

Con el curso delante: si esas 12 piezas casi iguales se pautan, para Meta son **el mismo anuncio** (comparten el ID de
identidad) y no diversifican nada; y el mes no alimenta las etapas que el curso pide para un negocio de productos por
WhatsApp. Las fases 1.3 y 3.4 atacan justo eso.

---

## 4. Propuesta por fases

Tamaño: **S** (un par de días), **M** (una semana), **L** (más).

### Fase 1 · Fundamentos: un solo vocabulario y el número mágico

**1.1 Las 4 etapas del curso como el único embudo (S).** `ETAPAS` de `src/lib/embudo.js` pasa a presentación,
evaluación, conversión y ascensión, con los ids de antes como alias (atraer → presentación, considerar → evaluación,
convertir → conversión, fidelizar → ascensión), igual que `ALIAS_PILAR`: ninguna fila se toca. Cada etapa lleva lo que
el curso le pone: niveles (presentación: inconsciente, problema y solución; evaluación: solución y producto;
conversión: producto; ascensión: decisión), tipos de arte, público y exclusiones. El estratega deja frío / tibio /
caliente y usa las mismas cuatro (`src/lib/estratega.js`). Lo leen la tarjeta de la campaña, el asistente del mes, el
motor de ideas y el estratega.

**1.2 Las 7 maletas del curso (S-M).** `ELEMENTOS_MERCADO` pasa a público, problema, solución, diferenciales,
testimonios, objeciones y garantía. Los estudios ya aprobados se leen con alias (cliente → público, dolor → problema,
diferenciador → diferenciales, confianza → testimonios y garantía hasta que se reescriba); «deseo» y «alternativas» no
se pierden: pasan a lo general del estudio (deseos de Reiss y competencia), donde ya hay sitio. Con eso:

- **Semáforo de maletas por producto** («si falta una, no lances»): en el estudio de mercado, en Marca (junto al
  semáforo del kit) y como aviso —no bloqueo— en «Nueva campaña» y en el estratega. Lo que sólo puede dar el cliente
  (testimonios, garantía) se convierte en tarea suya con un botón.
- Los subtipos de la maleta del sábado ya son garantía, testimonio, solución y objeciones: no cambian.

**1.3 Tipo de negocio y destino en la ficha (M).** Un campo nuevo del cliente: tipo (productos, servicios, servicio
de segunda necesidad, suscripción, público nicho, producto nuevo, cursos) y destino (WhatsApp o web; tienda física
como marca aparte). De ahí salen solos:

- el **objetivo sugerido** de campaña (WhatsApp → interacción, e-commerce → ventas, servicio de precio alto → clientes
  potenciales, tienda física → reconocimiento);
- **qué pieza va en cada etapa** (la tabla del módulo 2 como dato propio, `CICLO_POR_NEGOCIO`), que leen el motor de
  ideas (según la etapa de la semana), el director y el estratega;
- la plantilla de plan de arranque que le toca.

**1.4 El número mágico, guardado por cliente (M).** En `anuncios_clientes` (o una tabla `economia_clientes`):

| Dato | Para qué |
|---|---|
| Ticket promedio | El valor de una venta |
| Costos variables en %: producto, envío, devoluciones, comisiones (Tafi, pasarelas), otros | El margen real, no uno a ojo |
| Impuesto (ITBMS 7 %) | Separar bruto y neto: Meta reporta en bruto |
| Costos fijos (opcional) | El equilibrio de verdad cuando la pauta carga con el negocio |
| Tasa de cierre: de cada 100 conversaciones, cuántas compran; con su fecha y de dónde sale | El dato que más mueve el número |

`economia()` devuelve además el ROAS y el CPA de equilibrio y el **costo máximo por conversación** con su objetivo, y
eso lo leen sin teclearlo el diagnóstico, el informe (un semáforo contra el número), el estratega y la Q1. Encima, la
**calculadora de presupuesto** del módulo 5: meta de ventas del mes → ventas necesarias → conversaciones (÷ tasa) →
inversión al costo objetivo → reparto por etapas. Si el número no da, las tres palancas (margen, costos fijos, valor del
cliente) como consejo.

**1.5 Los tipos de arte y los sesgos como dato (S).** `TIPOS_ARTE` (los diez del curso) enlazados a las composiciones
y los tipos de contenido que ya existen; se suman **prensa** y **aspiracional** a `COMPOSICIONES`. En el kit, «los
tipos de arte de esta marca» (2 a 4, propuestos por el estudio). `SESGOS` (los seis): el estudio de mercado propone de 3
a 5 para el público, y `TACTICAS` suma reciprocidad, empatía y micro-compromiso.

**1.6 Dónde vive el curso.** No en el cerebro de cada cliente: serían ocho copias, y lo que va «para texto» terminaría
en los captions. Lo determinista (etapas, maletas, umbrales, repartos, objetivos, tipos de arte) va como **dato en el
código**, con palabras propias; lo que la agencia decida distinto, en el Manual de Ajustes. El Manual tiene hoy 6.000
caracteres de texto libre: se le añaden campos —umbrales de la Q2, reparto por etapas, anuncios por conjunto, tasa de
cierre por defecto— en vez de agrandar el texto.

### Fase 2 · Las métricas del curso y las 3 Q

**2.1 Leer lo que falta (S).** Añadir a lo que se pide a `/insights`: clics únicos en el enlace y su CTR y su costo
(`unique_inline_link_clicks`, `unique_inline_link_click_ctr`, `cost_per_unique_inline_link_click`), reproducciones de
3 s (acción `video_view`), tiempo promedio de reproducción (`video_avg_time_watched_actions`) y los rankings de calidad
(`quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking`). Calcular el **% de mensajes** = conversaciones
÷ clics únicos en el enlace. Son campos, no llamadas: no suma peticiones (`src/lib/anuncios.js`, `worker/lib/anuncios.js`).

**2.2 El diagnóstico como 3 Q (M).** `src/lib/diagnostico.js` y `anuncios/Diagnostico.jsx`:

- **Q1 · ¿Qué pasó?** Gasto, conversaciones y costo por conversación frente al número mágico: el cliente está sano o no.
- **Q2 · ¿Por qué?** Las seis métricas con semáforo y su umbral (editables en el Manual):

  | Métrica | Alerta |
  |---|---|
  | % de mensajes | por debajo de 50-60 % |
  | CTR único (enlace) | por debajo de 2 % |
  | Reproducciones de 3 s ÷ impresiones | por debajo de 20-25 % |
  | Tiempo promedio de reproducción | por debajo de 5-7 s |
  | Frecuencia (7 días) | por encima de 3-5 |
  | CPM | sin umbral fijo: contra el propio historial |

- **Q3 · ¿Qué hacemos?** Una acción por métrica: un llamado a chatear más claro (logo de WhatsApp, «escríbenos»,
  incentivo), mejores anuncios, mejores ganchos, mejor guion y edición, anuncios nuevos, públicos más grandes.
- **30, 14 y 7 días** lado a lado. El de 14 se saca del desglose diario que ya se pide (`time_increment=1`), sin otra
  llamada: el cron y las rutas viven con 50 peticiones por invocación.

**2.3 El efecto desglose (S).** Se juzga primero el conjunto: si está sano, sus anuncios no reciben «apagar» (como
mucho, la fatiga como información). Un anuncio sólo se apaga si está fuera del número mágico con gasto suficiente (la
regla actual de «el doble de lo aceptable gastado» sirve de criterio, que el curso no da).

**2.4 Paciencia (S).** Leer la fase de aprendizaje del conjunto y cruzarla con `historial_anuncios`: «este conjunto se
cambió hace 2 días: espera a los 5-7», y nada de «escalar» mientras aprende.

**2.5 De la Q3 a la creación (M).** «Mejorar los ganchos» abre el lote con ganchos nuevos para el nivel y el ángulo de
ese anuncio; «Agregar anuncios nuevos» produce 2 o 3 de tipos de arte que la campaña no tiene; «Llamado más claro»
reescribe el texto del anuncio. Todo por el camino que ya existe (encargos del servidor, director, control).

**2.6 El informe de anuncios (S).** Las métricas nuevas en la vista de la agencia; al cliente, lo de siempre.

### Fase 3 · Del calendario a los anuncios

**3.1 «Anunciar esta publicación» (M).** En Producción → Publicadas y en Resultados: la publicación orgánica que rindió
(«Lo mejor» ya mide lo propio contra la mediana de la cuenta) se usa como anuncio **conservando sus me gusta y
comentarios**: la API admite el post de Facebook (`object_story_id`) y la publicación de Instagram por su id. Es la
forma más barata de cumplir «usar publicaciones orgánicas con buenos resultados».

**3.2 «Reusar un anuncio ganador» (S-M).** Una lista de los anuncios de la cuenta por costo por conversación; el
escogido se duplica en otra campaña o conjunto con **el mismo creativo** (`creative_id`), que es lo que el curso llama
duplicar con el identificador.

**3.3 «Producir los anuncios de la campaña» (M).** El plan del estratega ya trae por anuncio el ángulo y la «pieza»;
se le suma la etapa, el tipo de arte y el nivel, y un botón lo manda al lote / director (encargo del servidor, en 4:5 y
en 9:16 para historias y reels) y pone cada pieza en su anuncio del borrador. Antes de crear, un aviso de diversidad:
dos anuncios con el mismo tipo de arte y la misma composición son el mismo para Meta.

**3.4 El mes por etapas (M).** El asistente del mes ya pone una etapa por semana; con el tipo de negocio (1.3) reparte
el orgánico por las cuatro según el ciclo, y `balanceDelMes` suma dos reglas: «este mes no tiene nada de evaluación (o
de ascensión)» y **«piezas casi iguales»** (textos casi idénticos, como los 12 de D'CASA).

**3.5 Aprender de los resultados de los anuncios (M).** Hoy el lote aprende qué composiciones gustan; con las cifras de
cada anuncio se aprende qué tipo de arte, nivel y composición dio el menor costo por conversación de cada cliente, y el
lote y el director lo prefieren. Es «probar 2-3 por tipo y quedarse con lo que funciona» hecho solo.

### Fase 4 · Las 4 campañas del ciclo

**4.1 Públicos personalizados desde la app (M-L).** Crear por la API (`/customaudiences`, subtipo de interacción con su
regla): interactuaron con Instagram o Facebook en 30 y 90 días, vieron un video, escribieron por mensaje en 30 días; y
la **lista de clientes**, subida con la huella SHA-256 hecha antes de mandarla (nunca se guarda en claro). Un similar
avisa si el público origen no llega a 1.500 personas. La forma exacta de cada regla se confirma con la documentación al
implementarlo; como todo lo de anuncios, sin probar contra la API real hasta la primera cuenta.

**4.2 Exclusiones automáticas por etapa (S, con 4.1).** `excluded_custom_audiences` según la tabla del curso:
presentación excluye a quien ya interactuó y a los clientes; evaluación, a los clientes; conversión, a los compradores
recientes.

**4.3 Presupuesto a nivel campaña (S).** Para evaluación y ascensión; presentación sigue por conjunto.

**4.4 El plan de cuenta (L).** El estratega arma las 4 campañas (o presentación + evaluación si la cuenta es nueva) con
el reparto, sus conjuntos, cuántos anuncios lleva cada una (4 / máx. 4 / sin plantilla / máx. 3), los tipos de arte y
los niveles. «Nueva campaña» gana un selector de **etapa** que rellena público, exclusiones, presupuesto y textos.
La cuenta guarda si es nueva o tiene historial.

**4.5 Configuración (S).** Multianunciante activado y las mejoras Advantage+ del creativo explícitas (no las que Meta
ponga por defecto).

### Fase 5 · El destino (WhatsApp) y la investigación

**5.1 Para WhatsApp Business, copiar y pegar (S).** Por cliente: mensaje de bienvenida, respuestas rápidas con las
objeciones del estudio (ya están escritas con su respuesta), etiquetas sugeridas (nuevo pedido, pago pendiente,
pagado, finalizado) y un **guion de ventas por producto** (el «personalizar los guiones» de los casos de éxito).

**5.2 La tasa de cierre medida (S).** Un registro semanal por cliente —conversaciones que llegaron, ventas— que
recalcula el número mágico. Es el paso previo a un CRM, sin integrar nada.

**5.3 Voz del cliente (M).** Una encuesta por enlace público (como `/aprobar`) con las preguntas del módulo 3 —por qué
compraste, por qué a nosotros, qué extrañarías— que termina en una nota del cerebro y en las maletas de testimonios y
objeciones. Y las objeciones que repiten los comentarios de la Bandeja, propuestas al estudio.

**5.4 El estudio, una vez al mes (S).** Una tarea recurrente por cliente para revisarlo, con lo que cambió desde la
última vez.

**5.5 La Biblioteca con las preguntas del curso (S).** El análisis de referencias responde además «qué se repite en
todos» y «qué no está diciendo nadie que esta marca sí puede decir».

**5.6 Más adelante.** CRM sincronizado, etiquetas de WhatsApp como público y la API de conversiones para mensajes:
necesitan la plataforma de WhatsApp Business y un CRM (Kommo, el que cita el curso). Fuera de esta parte.

---

## 5. Decisiones antes de implementar

Las tres primeras son las contradicciones que los propios apuntes marcan como de prioridad alta.

| # | Decisión | Propuesta |
|---|---|---|
| 1 | Reparto del presupuesto: 60/20/10/10 (lámina) o 60-80 / 30 / 5-10 / 5-10 (nota) | 60/20/10/10 por defecto, editable en el Manual |
| 2 | Advantage+ en cuentas nuevas: «no» o «úsalo si no hay similares» | En cuenta nueva, sólo como conjunto de prueba en presentación; nunca en evaluación ni ascensión |
| 3 | Estructura de una cuenta nueva: 4 campañas (100 % a presentación) o presentación + evaluación | Nueva = presentación + evaluación (+ conversión si hay web); con historial = las 4 |
| 4 | Tasa de cierre por defecto: 20 % (hoy) o 5 % (curso) | 5 % hasta que se mida la del cliente (5.2); cambia todos los números mágicos |
| 5 | Nombres de las etapas en toda la app | Los del curso: Presentación, Evaluación, Conversión, Ascensión |
| 6 | Nombres de las 7 maletas | Los del curso, con alias para lo ya escrito |
| 7 | Tamaño del feed: 1080×1080 (curso) o 4:5 (hoy) | Se queda 4:5 |
| 8 | Cuándo se pausa un anuncio (el curso no da plazo ni gasto mínimo) | Fuera del número mágico con el doble de ese número gastado, y nunca si el conjunto está sano |

---

## 6. Lo que queda para la Parte 2

- Optimización de campañas de ventas, clientes potenciales y reconocimiento; los destinos e-commerce, formularios y
  negocio local; las columnas de esos objetivos (6.1).
- Los módulos 5.1 a 5.6 y del 7 en adelante (el 6.2 cita el 9: potenciar con IA).
- Los documentos que el curso cita y no están en los apuntes: el Excel de presupuesto, el del número mágico (ROAS y CPA
  de equilibrio), el de costo por conversación, el simulador y la plantilla de preguntas para clientes. Con ellos, la
  fase 1.4 replica las fórmulas exactas en vez de reconstruirlas.
