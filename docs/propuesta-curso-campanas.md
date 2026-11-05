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

**La dirección (revisada, §4):** las campañas se montan en el **Ads Manager**; el calendario planifica, escribe y
vigila. **Orden:** lo que va a pauta nace como anuncio (fase A) → número mágico y 3 Q sobre lo que corre en el Ads
Manager (fase B) → la campaña completa sugerida con su guía de montaje (fase C) → cerrar el ciclo: qué pieza es cada
anuncio y aprender (fase D) → WhatsApp e investigación (fase E).

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

## 4. Dónde se montan las campañas: el Ads Manager las monta, el calendario piensa y vigila

Revisado el 5 de noviembre, tras la pregunta de la agencia: ¿conviene crear las campañas desde el calendario por la API
de Meta, o montarlas en el Ads Manager y que el calendario las analice?

**La recomendación: las campañas se montan en el Ads Manager.** El calendario hace lo de antes (el plan, las piezas y los
textos) y lo de después (leer las cifras con el método del curso y decir qué cambiar). La fase 4 de la primera versión
—crear las 4 campañas con públicos y exclusiones por la API— se quita y la sustituye una **guía de montaje**.

| Qué | Ads Manager | Calendario |
|---|---|---|
| Montar la campaña, los conjuntos y los anuncios | Sí: aquí se monta | Da la guía paso a paso, con todo para copiar |
| Usar una publicación existente, editar cómo sale en historias y reels, mejoras Advantage+, multianunciante, vista previa | Sí | — |
| Qué campañas hacer, cuánto a cada etapa, qué públicos y exclusiones, cuántos anuncios | — | El plan del ciclo (fase C) |
| Qué publicaciones van a ir pautadas y cómo se escriben | — | Sí (fase A) |
| Leer las cifras con el número mágico y las 3 Q | Hay que configurar las columnas y calcular a mano | Sí, solo (fase B) |
| Qué piezas del calendario funcionan como anuncio, para hacer más de esas | No lo relaciona | Sí (fase D) |
| Pausar un anuncio o subir un 20 % el presupuesto | Sí | Sí, con confirmación (ya existe) |

**Por qué:**

- **La API no optimiza peor.** Ads Manager usa la misma API, y una campaña creada por ahí la reparte el mismo algoritmo
  (Andromeda, GEM). El problema no es el resultado.
- **Lo que cuesta es MANTENER la escritura.** Meta cambia la Marketing API cada pocos meses: en la v23 se volvió
  obligatorio `advantage_audience`, y antes `is_adset_budget_sharing_enabled`. Lo más nuevo llega primero, o sólo, al
  Ads Manager: los interruptores de las mejoras Advantage+, editar la pieza por ubicación, la configuración de
  WhatsApp. Un error al escribir deja una campaña a medias en la cuenta del cliente. Y la creación de la app **nunca se
  ha probado contra una cuenta real**: todo lo de anuncios está probado con un `fetch` de mentira.
- **Leer es estable y no rompe nada.** Si falla una lectura, falta una cifra; no queda una campaña mal hecha. El
  diagnóstico de hoy ya lee **todas** las campañas activas de la cuenta, también las montadas en el Ads Manager.
- **Es como trabaja la agencia.** Monta en el Ads Manager con publicaciones que ya existen. Lo que el curso enseña está
  antes (estudio, oferta, textos, artes) y después (métricas, optimización), y ahí es donde el calendario aporta.

**Qué pasa con «Nueva campaña» de la app:** se congela. Ni se amplía ni se quita. Si algún día se prueba bien con una
cuenta real (una campaña de Tráfico de 1 $ en pausa), puede servir para casos sencillos. «Apagar» y «Subir un 20 %» del
diagnóstico se quedan: son cambios pequeños, con confirmación y fáciles de deshacer.

---

## 5. La propuesta, por fases

Tamaño: **S** (un par de días), **M** (una semana), **L** (más). La A no depende de Meta, así que puede empezar ya.

### Fase A · Lo que va a pautarse nace como anuncio

El problema que la agencia describe: en el Ads Manager se escoge una publicación ya hecha, y **su texto no se puede
cambiar**. El texto principal del anuncio ES el caption. Si ese caption se escribió para el orgánico («¡Hoy estamos
abiertos!», 12 hashtags, sin llamado claro), el anuncio sale con eso.

**A.1 El mismo vocabulario y los mismos datos que el curso (S-M).** Es la base de todo lo demás:

- **Un solo embudo.** `ETAPAS` de `src/lib/embudo.js` pasa a presentación, evaluación, conversión y ascensión. Los ids
  de antes quedan como alias (atraer, considerar, convertir, fidelizar), igual que `ALIAS_PILAR`. Cada etapa lleva sus
  niveles: presentación, inconsciente, problema y solución; evaluación, solución y producto; conversión, producto;
  ascensión, decisión. Lleva también sus tipos de arte, su público y sus exclusiones. El estratega deja frío, tibio y
  caliente.
- **Las 7 maletas del curso.** `ELEMENTOS_MERCADO` pasa a público, problema, solución, diferenciales, testimonios,
  objeciones y garantía. Los estudios aprobados se leen con alias: cliente → público, dolor → problema, diferenciador
  → diferenciales, confianza → testimonios y garantía. «Deseo» y «alternativas» pasan a lo general del estudio. Hay un
  **semáforo de maletas por producto** («si falta una, no lances») en el estudio, en Marca y como aviso en el plan de
  campañas. Lo que sólo puede dar el cliente (testimonios, garantía) se convierte en tarea suya con un botón.
- **El tipo de negocio y el destino en la ficha.** El tipo es productos, servicios, segunda necesidad, suscripción,
  nicho, producto nuevo o cursos; el destino, WhatsApp o web. De ahí salen el objetivo sugerido (WhatsApp → interacción)
  y qué pieza va en cada etapa (la tabla del módulo 2 como dato propio, `CICLO_POR_NEGOCIO`).
- **Los 10 tipos de arte y los 6 sesgos, como dato.** `TIPOS_ARTE`, enlazados a las composiciones y tipos que ya
  existen; se suman prensa y aspiracional. En el kit, «los tipos de arte de esta marca» (2 a 4). `SESGOS`: el estudio
  propone de 3 a 5 por público, y `TACTICAS` suma reciprocidad, empatía y micro-compromiso.
- **Dónde vive el curso.** No en el cerebro de cada cliente: serían ocho copias, y lo «para texto» acabaría en los
  captions. Lo determinista va como dato en el código, con palabras propias. Lo que la agencia decida distinto
  (umbrales, reparto, anuncios por conjunto, tasa de cierre) va en campos del Manual de Ajustes.

**A.2 La marca «Va a pauta» (S).** En cada publicación, `post.pauta = { etapa, nivel, como }`. `como` es «publicación
existente» o «anuncio nuevo». La ponen:

- el plan de campañas (fase C), cuando escoge qué publicaciones usar;
- el asistente del mes, que propone las del tipo «Anuncio» del plan semanal y las de la oferta del mes (se puede quitar);
- una persona, a mano, en el panel: «Se va a pautar», con la etapa.

En el chip del mes se ve con una marca pequeña. En «Revisar el mes», las que van a pauta salen aparte.

**A.3 El texto de una publicación que va a pauta (M).** Lo escribe el motor de textos de siempre (el modo «campos»),
con una regla más (`REGLA_ANUNCIO`, en palabras propias) cuando la publicación lleva `pauta`:

1. **Manda la etapa.** Presentación: corto, la necesidad o el producto más vendido, para quien no conoce la marca.
   Evaluación: más largo, con detalles, beneficios y una objeción respondida. Conversión: testimonio y garantía, el
   empujón. Ascensión: el segundo producto o el combo, para quien ya compró. Cuál toca a cada etapa depende del tipo de
   negocio y del destino (la tabla del módulo 2, como dato).
2. **La primera línea es el gancho y se entiende sola.** Es lo que se ve antes de «más» (unos 125 caracteres), con el
   nivel de consciencia de su etapa.
3. **Un llamado específico a escribir por WhatsApp,** con su incentivo si existe (algo gratis, un regalo). El curso
   pide un llamado más claro cuando la tasa de mensajes baja del 50-60 %.
4. **Nada que caduque.** Nada de «hoy», «mañana», «este viernes» ni el horario de un día: un anuncio corre semanas. Una
   fecha sólo si la campaña termina ese día.
5. **Sin hashtags, o casi ninguno.** En un anuncio son puertas de salida. Va en sus hashtags aparte, así se decide al
   publicar.
6. **Lo de las maletas, real.** El precio exacto del catálogo, la garantía y el diferencial que están escritos; nada
   inventado.
7. **La política de anuncios de Meta.** No afirmar nada sobre la persona que lee («¿tienes sobrepeso?», «¿estás
   endeudado?»), sin promesas exageradas y sin antes y después de salud. Un anuncio rechazado se para.
8. **Una idea por anuncio y distinta de las otras de su etapa.** Si dos anuncios se parecen, Meta los trata como uno
   (ID de identidad). Las 12 piezas casi iguales de D'CASA serían un solo anuncio.

Un caption que cumple esto también sirve en orgánico, así que la publicación sale igual en su día y luego se pauta sin
tocarla.

**A.4 Si va como «anuncio nuevo»: sus textos aparte (S-M).** Cuando el anuncio se monta subiendo la pieza (no la
publicación), el Ads Manager deja escribir hasta 5 textos principales y 5 títulos, y Meta prueba combinaciones. El
calendario los escribe en `post.anuncio`: de 3 a 5 textos principales, cada uno por un ángulo o nivel distinto; títulos
de hasta 40 caracteres; descripción de hasta 30 (`LIMITES_ANUNCIO`, que ya existe); y el botón. Todo con botón de
copiar. El estudio de mercado ya escribe un «anuncio» por producto: se parte de ahí.

**A.5 La revisión de anuncio (S).** «Revisar el mes» ya tiene reglas gratuitas (precio fuera del catálogo, voseo, sin
llamado…). A las que van a pauta se les suman: lo que caduca, la primera línea, el llamado a WhatsApp, los hashtags,
los atributos personales y «casi igual a otra de su etapa». Cada aviso con su arreglo, como siempre.

**A.6 Una ya publicada que se quiere pautar (S).** «Versión para anuncio» en Producción → Publicadas y en Resultados:
escribe el texto de pauta para esa pieza. Sirve para montarla como anuncio nuevo, o para pegarlo a mano en Instagram
(«Editar» la publicación) antes de pautarla.

### Fase B · El número mágico y el seguimiento de lo que corre en el Ads Manager

**B.1 El número mágico, por cliente (M).** Ticket, costos variables (producto, envío, devoluciones,
comisiones como Tafi, otros), ITBMS para separar bruto y neto, costos fijos opcionales y la tasa de cierre medida. Con
eso salen el ROAS y el CPA de equilibrio y el costo máximo por conversación. Se guarda en `anuncios_clientes` y lo leen
el diagnóstico, el informe y el estratega sin teclearlo. La calculadora de presupuesto (meta de ventas → inversión →
reparto por etapas) va aquí.

**B.2 Las métricas que faltan (S).** Clics únicos en el enlace, CTR único y su costo, reproducciones de 3 s, tiempo
promedio de reproducción y los rankings de calidad. Con ellos, el **% de mensajes** = conversaciones ÷ clics únicos.
Son campos de la misma llamada: no suman peticiones.

**B.3 Las 3 Q sobre las campañas del Ads Manager (M).**

- Q1: gasto, conversaciones y costo por conversación frente al número mágico.
- Q2: las seis métricas con sus umbrales, editables en el Manual:

  | Métrica | Alerta |
  |---|---|
  | % de mensajes | por debajo de 50-60 % |
  | CTR único | por debajo de 2 % |
  | Reproducciones de 3 s | por debajo de 20-25 % |
  | Tiempo de reproducción | por debajo de 5-7 s |
  | Frecuencia | por encima de 3-5 |
  | CPM | contra su propio historial |

- Q3: una acción por métrica.
- Las ventanas de 30, 14 y 7 días, lado a lado.
- El efecto desglose: si el conjunto está sano, sus anuncios no se tocan.
- La fase de aprendizaje y la paciencia: «se cambió hace 2 días, espera a los 5-7».

**B.4 La etapa de cada campaña (S).** Para aplicar el método hay que saber si una campaña es de presentación o de
conversión. Sale de su **nombre**: la nomenclatura del Manual lleva `{etapa}`, la guía de montaje (C.3) la escribe y
así vuelve sola al leer. Una campaña con otro nombre se clasifica una vez a mano y se recuerda.

**B.5 Cuándo avisa (S).** El curso pide revisar a diario y cambiar cada 5-7 días. Así que **una tarea «Revisar
campañas» por cliente cada 5-7 días** en Mi día, con el diagnóstico listo. Cada día, sólo lo grave: no gasta, anuncio
rechazado, o el doble del número mágico gastado sin una conversación.

**B.6 Cada acción lleva a donde se hace (S-M).** «Abrir en el Ads Manager» lleva a esa campaña. Lo seguro se hace en la
app (pausar, +20 %). Lo creativo lleva a producir: «mejorar los ganchos» abre el lote con ganchos nuevos para ese
nivel; «anuncios nuevos» produce 2 o 3 de tipos de arte que la campaña no tiene, ya marcados «Va a pauta».

**B.7 El informe de anuncios (S).** Las métricas nuevas en la vista de la agencia; al cliente, lo de siempre.

### Fase C · La campaña completa sugerida: el plan del ciclo y la guía de montaje

**C.1 El plan de cuenta (M).** El estratega pasa de una campaña a el ciclo:

- las 4 campañas (o presentación + evaluación si la cuenta es nueva), con el reparto (60/20/10/10 por defecto);
- los conjuntos con sus públicos y exclusiones;
- cuántos anuncios lleva cada una (4 / hasta 4 / sin plantilla / hasta 3);
- los tipos de arte y los niveles de cada etapa.

El presupuesto sale del número mágico (B.1). Si la cuenta es nueva o tiene historial se apunta una vez en el cliente.

**C.2 Qué pieza va en cada anuncio (M).** El plan escoge del calendario. Primero, lo publicado que mejor funcionó en
orgánico («Lo mejor» ya mide lo propio contra la mediana de la cuenta), si su texto sirve para pauta. Después, lo que
viene marcado «Va a pauta». Lo que falte se pide con «Producir los anuncios que faltan», por el lote y el director, cada
pieza con su etapa, su nivel y su tipo de arte y ya marcada. Antes de crear, el aviso de diversidad: dos anuncios con el
mismo tipo de arte y la misma composición son uno para Meta.

**C.3 La guía de montaje (M).** Sigue el orden del Ads Manager: Campaña → Conjunto → Anuncio, con casillas para ir
marcando y todo para copiar:

- los nombres según la nomenclatura, con la etapa;
- la configuración: sin prueba A/B, maximizar conversaciones, puja automática, presupuesto en el conjunto o en la
  campaña según la etapa;
- los públicos y las exclusiones a crear o escoger;
- en cada anuncio, el enlace a la publicación que se usa (o la pieza para bajar) y, si es nuevo, sus textos.

Se guarda por cliente y mes, y lo marcado lo ve todo el equipo.

**C.4 Más adelante, si hace falta: importar en bloque.** El Ads Manager acepta crear anuncios en bloque desde una hoja.
El calendario podría generar ese archivo. Queda por investigar: su formato cambia y una hoja mal hecha se rechaza.

### Fase D · Cerrar el ciclo

**D.1 Qué publicación es cada anuncio (S-M).** El creativo de cada anuncio dice qué publicación de Instagram o
Facebook usa. Se casa con la del calendario por el id que guarda la cola al publicar. Es una lectura más en el
diagnóstico.

**D.2 En el calendario (S).** La publicación dice que está en pauta, en qué etapa y su costo por conversación: «En
pauta · Presentación · 1,20 $ por conversación».

**D.3 Aprender de los anuncios (M).** Por cliente: qué tipo de arte, nivel, composición y etapa dan el menor costo por
conversación. El lote, el director y el plan lo prefieren. Es «probar 2-3 por tipo y quedarse con lo que funciona»,
hecho solo.

**D.4 Sugerir qué pautar (S).** Lo orgánico que rindió y no se ha pautado, con su texto ya revisado (A.5): «Esta rindió
3,4×: pautala en Evaluación».

### Fase E · El destino (WhatsApp) y la investigación

Sin cambios respecto a la primera versión. Para WhatsApp Business, listo para copiar: bienvenida, respuestas rápidas
con las objeciones del estudio, etiquetas y un guion de ventas por producto. Además: la tasa de cierre medida cada
semana, la encuesta «Voz del cliente» por enlace, la revisión mensual del estudio y las preguntas del curso en el
análisis de la Biblioteca. El CRM y las etiquetas de WhatsApp como público quedan para más adelante.

### Orden

**A → B → C → D → E.** La A empieza ya, porque no depende de Meta, y resuelve el texto de lo que se pauta desde el
siguiente mes. La B da valor desde el primer día sobre lo que ya corre en el Ads Manager. La C junta las dos en la
campaña completa sugerida. La D necesita A y B funcionando un tiempo para tener qué aprender.

---

## 6. Decisiones antes de implementar

| # | Decisión | Propuesta |
|---|---|---|
| 0 | ¿Montar en el Ads Manager con el calendario como plan, guía y seguimiento? | Sí; «Nueva campaña» de la app, congelada |
| 1 | Reparto: 60/20/10/10 (lámina) o 60-80 / 30 / 5-10 / 5-10 (nota) | 60/20/10/10 por defecto, editable en el Manual |
| 2 | Advantage+ en cuentas nuevas | Sólo como conjunto de prueba en presentación; nunca en evaluación ni ascensión |
| 3 | Cuenta nueva: 4 campañas o presentación + evaluación | Nueva = presentación + evaluación; con historial = las 4 |
| 4 | Tasa de cierre por defecto: 20 % (hoy) o 5 % (curso) | 5 % hasta medir la del cliente; cambia todos los números mágicos |
| 5 | Nombres de etapas y maletas | Los del curso, con alias para lo ya escrito |
| 6 | Tamaño del feed | Se queda 4:5 |
| 7 | Cuándo se pausa un anuncio | Fuera del número mágico con el doble gastado, y nunca si el conjunto está sano |
| 8 | ¿Lo normal es pautar la publicación existente o montar un anuncio nuevo? | Publicación existente por defecto (A.3); «anuncio nuevo» cuando se pida (A.4) |
| 9 | ¿Qué publicaciones se marcan «Va a pauta» solas? | Las del tipo «Anuncio» del plan semanal y las de la oferta del mes, quitables |
| 10 | ¿Hashtags en lo que va a pauta? | Ninguno o casi |

---

## 7. Lo que queda para la Parte 2

- Optimización de campañas de ventas, clientes potenciales y reconocimiento; los destinos e-commerce, formularios y
  negocio local; las columnas de esos objetivos (6.1).
- Los módulos 5.1 a 5.6 y del 7 en adelante (el 6.2 cita el 9: potenciar con IA).
- Los documentos que el curso cita y no están en los apuntes: el Excel de presupuesto, el del número mágico (ROAS y CPA
  de equilibrio), el de costo por conversación, el simulador y la plantilla de preguntas para clientes. Con ellos, la
  fase B.1 replica las fórmulas exactas en vez de reconstruirlas.
