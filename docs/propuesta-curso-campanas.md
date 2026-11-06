# Propuesta: el curso de campañas en el calendario

5 de noviembre de 2026. **Parte 1** del curso (módulos 1 a 6.2: campañas de **interacción a WhatsApp**), cruzada con el
código de `main` (a367485) y con un calendario real (D'CASA, noviembre de 2026). **El plan final está en §5** (6 de
noviembre); nada está implementado todavía. Este documento se actualiza con cada parte nueva de los apuntes (web, ventas, clientes
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

**La dirección (§4) y el plan final (§5):** las campañas se montan en el **Ads Manager**; el calendario planifica, escribe
y vigila, con las mismas cuentas que la agencia (los Excel del curso y la calculadora de deeplook). **Orden:** lo que va a pauta nace como anuncio (fase A) → número mágico y 3 Q sobre lo que corre en el Ads
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

## 5. El plan final (6 de noviembre)

Todas las decisiones están tomadas (§7). Lo que no se confirmó expresamente va con la propuesta y se cambia en el Manual
de campañas sin tocar código.

### 5.1 La idea en una línea

**El Ads Manager monta; el calendario prepara y vigila.** Antes de montar: lo que se va a pautar nace escrito como
anuncio, con los números del negocio y la campaña completa sugerida (con su guía y su Excel). Después de montar: lee lo
que corre, lo compara con el número mágico y dice qué hacer con el método de las 3 Q.

### 5.2 Las cuentas, el mismo sistema que la agencia

Sin fórmulas propias: las mismas que la agencia ya usa, escritas con palabras propias.

| Número | De dónde sale |
|---|---|
| Objetivo: costo por compra, costo por conversación, inversión del mes y ROAS objetivo | La «Calculadora de presupuesto» del curso |
| Límite: margen efectivo, piso, ROAS, CAC y costo por conversación de equilibrio, utilidad a un ROAS dado | La calculadora de deeplook, en sus dos modos («todo el negocio» y «sólo la plataforma») |
| Qué resultados da un presupuesto | El «Simulador de campañas» (5 modos), con los datos reales del cliente |
| Qué campañas montar | El Excel de estrategia (5 hojas), entregado lleno |

Dos excepciones, y las dos arreglan un error de la copia de la agencia: el % que se invierte siempre es un porcentaje
(en la hoja de interacción estaba «16» y no «16 %»), y los clientes potenciales en la web se cuentan sobre las visitas.

Qué se compara según el destino (decisión 13):

- **WhatsApp:** el costo por conversación frente al objetivo y al de equilibrio. El equilibrio va en «todo el negocio»:
  las ventas del mes (del enlace de ventas) ÷ la pauta frente al ROAS de equilibrio.
- **Web (e-commerce):** el ROAS que registra Meta frente al de equilibrio en «sólo la plataforma». Las ventas de otros
  canales, si el cliente las da, lo bajan.
- **Costos fijos sin las ventas de otros canales:** la cuenta es la misma, pero la pauta carga todos los fijos. La app
  lo avisa al lado del resultado («así sale el caso más exigente: añade las ventas de tienda o deja los fijos en 0 para
  ver el piso»). No cambia ninguna cifra por su cuenta.

### 5.3 Cómo queda la aplicación

Ninguna pestaña nueva en el cliente: lo nuevo entra en las que ya existen.

| Dónde | Hoy | Después |
|---|---|---|
| **Calendario** · una publicación | Caption orgánico | «Va a pauta» con su etapa; el caption escrito como anuncio y, aparte, de 3 a 5 textos principales, títulos, descripción y botón para copiar. Un sello pequeño en el chip del mes |
| **Calendario** · asistente del mes | Estrategia con Atraer/Considerar/Convertir/Fidelizar | Las 4 etapas del curso. En el plan, marca solas las del tipo «Anuncio» y las de la oferta del mes |
| **Calendario** · Revisar el mes | Reglas del orgánico | Además, la revisión de anuncio para lo que va a pauta |
| **Marca** · nueva sub-sección **Números del negocio** | — | Tipo de negocio, destino, cuenta nueva o con historial, ticket, costos, ITBMS, devoluciones, fijos, meta y % a invertir, tasa de cierre. Las tres calculadoras (objetivo, equilibrio, simulador) con su ayuda y la IA que propone lo «estimado». El enlace de ventas del cliente |
| **Marca** · Cerebro → estudio de mercado | 7 elementos propios | Las 7 maletas del curso, con su semáforo por producto («si falta una, no lances») y tareas para el cliente |
| **Marca** · Kit y voz | — | «Los tipos de arte de esta marca» (2 a 4) |
| **Resultados** · nueva sub-sección **Anuncios** (al lado de Redes) | Nada de anuncios por cliente | Lo que corre en su cuenta con las 3 Q: número mágico frente a lo real, 30/14/7 días, la etapa de cada campaña, las ventas de la semana, qué publicaciones están en pauta y a cuánto |
| **Anuncios** (global) · Campañas | Cifras, «Nueva campaña», estratega, diagnóstico, informe | Cifras de todas las cuentas y la revisión 3Q de cada cliente. «Nueva campaña» se congela (sale del botón principal, queda en «Más») |
| **Anuncios** · nueva pestaña **Plan de campañas** | El estratega (una campaña) | El ciclo completo (4 etapas + temporada) con presupuesto, públicos, exclusiones, anuncios y piezas; la guía de montaje con casillas; descarga en el formato del Excel de estrategia. También para alguien de fuera |
| **Anuncios** · Biblioteca | — | Sin cambios |
| **Producción → Publicadas** | — | «Versión para anuncio» de una ya publicada |
| **Mi día** | — | «Revisar campañas de <cliente>» cada 5-7 días, con la revisión lista; lo grave (no gasta, rechazado, el doble del número mágico sin una conversación) en la campana |
| **Ajustes → Cómo trabajamos → Manual de campañas** | Reglas, nomenclatura, tasa 20 % | Además: reparto por etapa, anuncios por conjunto (4-6), umbrales de las 3 Q, tasa de cierre por defecto 5 %, nomenclatura con `{etapa}` |
| **Página pública** `/ventas?t=…` | — | «Tus ventas de la semana» para el cliente, sin sesión |
| **Asistente y Claude (MCP)** | Diagnóstico y estratega de una campaña | Las mismas piezas: leer los números del negocio, la revisión 3Q y el plan del ciclo; escribir el caption de anuncio |

Lo que se va de la pantalla: Frío/Tibio/Caliente y Atraer/Considerar/Convertir/Fidelizar (se leen como alias de las
etapas del curso), el costo máximo tecleado en el diagnóstico (sale del número mágico), la tasa de cierre del 20 % por
defecto (pasa a 5 %) y «Nueva campaña» como botón principal.

### 5.4 Los datos

| Qué | Dónde | Migración |
|---|---|---|
| Números del negocio, la etapa de cada campaña que no sigue la nomenclatura, el testigo del enlace de ventas | `anuncios_clientes`: columnas `negocio` (JSON, cada dato con su origen: cliente, agencia, estimado por la IA o leído de Meta), `etapas` (JSON) y `testigo_ventas` | 0069 |
| Las ventas de cada semana | Tabla nueva `ventas_semana` (cliente, lunes de la semana, ventas, monto, de los anuncios, otros canales, quién la escribió: cliente o agencia). Una fila por cliente y semana | 0070 |
| «Va a pauta» y los textos de anuncio | `post.pauta`, `post.anuncio`, dentro del JSON del calendario | No |
| Los tipos de arte de la marca | `kit.tiposArte` | No |
| El plan del ciclo y lo marcado en la guía | `planes_campana.datos` con `tipo: "ciclo"`, el mes y el progreso | No |
| Reparto, umbrales, anuncios por conjunto, tasa por defecto | `manual_campanas` | No |
| Las 7 maletas | El JSON del estudio de mercado; lo aprobado se lee con alias | No |

`ventas_semana` entra en la capa de acceso con su `client_id` (`TABLAS_CON_CLIENTE`) y la página pública por su
testigo, como la aprobación; los tests de despliegue lo exigen.

### 5.5 Las entregas, en orden

Cada una es un pull request que pasa `verificar`, se une a `main` y se despliega antes de empezar la siguiente.

| # | Entrega | Qué trae | Tamaño |
|---|---|---|---|
| 1 | **La base del curso** | Etapas, 7 maletas con su semáforo, tipo de negocio y destino, tipos de arte, sesgos, qué pieza va en cada etapa según el negocio. Alias para lo ya escrito (A.1) | M |
| 2 | **Lo que va a pauta** | «Va a pauta» (a mano y desde el asistente del mes), el caption como anuncio, los textos aparte, la revisión de anuncio, «Versión para anuncio» (A.2–A.6) | M |
| 3 | **Números del negocio** | La ficha por cliente con la ayuda de la IA y las tres calculadoras; el diagnóstico, el estratega y el informe la leen (B.1, migración 0069) | M-L |
| 4 | **El enlace de ventas** | `/ventas?t=…`, el mensaje de los lunes, la tasa de cierre medida y el ROAS real de WhatsApp (E.1, migración 0070) | M |
| 5 | **La revisión 3Q** | Las métricas que faltan, Q1-Q2-Q3, 30/14/7 días, efecto desglose, fase de aprendizaje, etapa por el nombre, Resultados → Anuncios, la tarea de Mi día, los avisos y lo que lleva a producir (B.2–B.7) | L |
| 6 | **El plan de campañas** | El ciclo con temporada, presupuesto desde la calculadora, públicos y exclusiones, 4-6 anuncios por conjunto, qué pieza va en cada anuncio, la guía de montaje y su Excel (C.1–C.3) | L |
| 7 | **Cerrar el ciclo** | Qué publicación es cada anuncio, «En pauta» en la publicación, aprender qué tipo de arte rinde, sugerir qué pautar (D) | M |
| 8 | **WhatsApp e investigación** | El kit de WhatsApp Business (bienvenida, respuestas con las objeciones, etiquetas, guion), la voz del cliente y la revisión mensual del estudio (E) | M |

**Estado:** entregas 1 (la base del curso), 3 (números del negocio) y 4 (el enlace de ventas) desplegadas en el
primer pull request; 2 (lo que va a pauta), 5 (la revisión 3Q) y 8 (WhatsApp e investigación), en el segundo. Lo que cada una dejó fuera, en su sitio de CLAUDE.md.

Las entregas 1 y 2 no dependen de Meta: se notan desde el mes siguiente. La 3 y la 4 dan el número mágico de cada
cliente. La 5 empieza a vigilar lo que ya corre en el Ads Manager. La 6 junta todo en la campaña completa.

### 5.6 Lo que no se ha probado y cómo se prueba

Nada de anuncios se ha probado contra una cuenta real: los tests hablan con un `fetch` de mentira. El plan sólo LEE de
Meta (la creación queda congelada), así que la primera prueba es segura: con la entrega 5, abrir la revisión de un
cliente con campañas activas y comparar cada cifra con la del Ads Manager. Las calculadoras se prueban con los ejemplos
de los Excel y de deeplook: con las mismas entradas tienen que dar los mismos números.

---

## 6. El detalle de cada pieza

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

**A.4 Sus textos de anuncio aparte, siempre (S-M).** La agencia monta de las dos formas (decisión 8), así que toda
publicación «Va a pauta» los lleva, por si se monta subiendo la pieza. Cuando el anuncio se monta así (no con la
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

**Las fórmulas, confirmadas (5-nov).** La agencia pasó los tres Excel del curso y la calculadora de rentabilidad que
usa (deeplook.co/calculadora-roas, pública). Son dos números distintos y la app necesita los dos:

- **El OBJETIVO (el número mágico): cuánto se está dispuesto a pagar.** Excel «Calculadora de presupuesto». Entradas:
  meta de ventas del mes, ticket promedio y el % DE LA VENTA que se invierte en conseguir un cliente (no todo el margen:
  si el margen es 35 % y se quiere ganar al menos 15 %, se invierte 20 %).
  · ventas necesarias = meta ÷ ticket
  · costo por compra objetivo = ticket × %
  · inversión del mes = meta × %
  · ROAS objetivo = meta ÷ inversión (= 1 ÷ %)
  · en mensajes y clientes potenciales: costo por conversación objetivo = costo por compra objetivo × tasa de cierre
  (5 % si no se ha medido; luego la real).
- **El LÍMITE (el equilibrio): a partir de qué número se pierde dinero.** Calculadora de deeplook. Entradas: modelo
  (e-commerce, clientes potenciales, mensajes); costos variables en % de la venta NETA (producción, envíos, pasarela,
  otros); IVA (en Panamá, ITBMS 7 %); devoluciones en % de la venta total; costos fijos del mes (con el fee de la
  agencia, sin la pauta); presupuesto de pauta del mes; ticket; tasa de cierre; y si se mide todo el negocio (ventas
  totales ÷ pauta) o sólo la pauta (con las ventas de otros canales aparte).
  · margen bruto = 1 − la suma de los costos variables
  · margen efectivo = margen bruto × (1 − devoluciones) ÷ (1 + ITBMS): lleva el margen a la venta con impuesto
  · piso = 1 ÷ margen efectivo (por debajo, cada dólar de pauta pierde, sin contar los fijos)
  · ROAS de equilibrio = (fijos + presupuesto − ventas de otros canales × margen efectivo) ÷ (presupuesto × margen
  efectivo), y nunca por debajo del piso
  · CAC de equilibrio = ticket ÷ ROAS de equilibrio
  · costo por conversación de equilibrio = CAC de equilibrio × tasa de cierre
  · utilidad del mes a un ROAS dado = ventas de otros canales × margen efectivo + ROAS × presupuesto × margen
  efectivo − fijos − presupuesto. Con eso simula «a este ROAS ganas o pierdes tanto» y la tabla presupuesto × ROAS.
  Ojo: con los fijos dentro, el equilibrio DEPENDE del presupuesto (más pauta reparte los fijos).
- **La regla que une las dos:** el objetivo tiene que quedar por debajo del equilibrio. Si el costo por conversación
  objetivo pasa del de equilibrio, la app avisa: con esa meta se pierde dinero.
- **El SIMULADOR (Excel «Simulador de campañas»), cinco modos.** Conversaciones: impresiones = gasto ÷ CPM × 1.000;
  alcance = impresiones ÷ frecuencia; clics únicos = impresiones × CTR único; conversaciones = clics únicos × % de
  mensajes; costo por conversación = gasto ÷ conversaciones. Clientes potenciales de Meta: igual. Compras en la web:
  clics salientes → visitas (% de visitas) → compras (% de compras) → valor y ROAS. Clientes potenciales en la web:
  igual hasta las visitas. Alcance y ThruPlays: por costo por mil alcanzados y por ThruPlay. Los valores del Excel son
  ejemplos; la app pone los REALES del cliente (sus 30 días en el Ads Manager, con las métricas de B.2) y saca tres
  escenarios moviéndolos.
- **El Excel de estrategia es la plantilla de la guía de montaje (C.3), vacía.** Una hoja por campaña: Presentación (3
  conjuntos con su presupuesto diario y su público cada uno; calendario, exclusiones, ubicaciones y 5 anuncios
  compartidos), Evaluación (presupuesto de campaña Advantage+, 2 conjuntos, 4 anuncios), Conversión (1 conjunto, 3
  anuncios), Ascensión (1 conjunto, 4 anuncios) y una quinta, **Campaña especial** (1 conjunto, 4 anuncios), que los
  apuntes no explican. Columnas: objetivo, presupuesto de campaña, presupuesto diario, app de mensajes, objetivo de
  rendimiento, calendario, público, exclusiones, ubicaciones y los anuncios. Lo que va en cada casilla sale de los
  apuntes (módulo 5); la app la entrega llena y descargable en el mismo formato.
- **Dos errores en las copias de la agencia** (la app usa la fórmula correcta): en la Calculadora, hoja de interacción,
  el % a invertir está escrito «16» y no «16 %», así que sale una inversión de 16.000 $ y un ROAS de 0,06; en el
  Simulador, «Clientes potenciales en el sitio web» calcula los clientes sobre los clics salientes y no sobre las
  visitas (300 en vez de 240).

**Por cliente, en la app, con ayuda de la IA (decisión de la agencia, 5-nov).** Una ficha «Números del negocio» en Marca
(o junto a Anuncios) con cada dato, su ayuda (qué es y cómo sacarlo) y de dónde viene:

| Dato | De dónde sale | La IA o la app ayuda con |
|---|---|---|
| Ticket promedio | El cliente (ventas del mes ÷ pedidos) | Propone uno con los precios del catálogo, marcado «estimado» |
| Costos variables (%) | El cliente | Rangos habituales del rubro, marcados «estimado»; nunca como dato |
| ITBMS | 7 % por defecto | 0 si el cliente está exento |
| Devoluciones (%) | El cliente | 0 % si no tiene |
| Costos fijos y fee de la agencia | El cliente y la agencia | Qué entra y qué no |
| Meta de ventas y % a invertir | La agencia con el cliente | Que el % quede por debajo del margen |
| Tasa de cierre | Medida (ventas ÷ conversaciones) | 5 % hasta medirla; el ajuste semanal |
| Presupuesto, CPM, CTR único, % de mensajes, frecuencia | Lo lee la app del Ads Manager | — |

La IA no inventa un número: lo que propone queda «estimado» hasta que una persona lo confirma, como las fechas
especiales.

**Lo decidido (agencia, 6-nov):**

1. **La «Campaña especial» es la campaña de TEMPORADA** (la quinta hoja del Excel de estrategia; «especial» porque no es
   habitual). Se usa para lo que tiene fecha: la oferta del mes, una fecha comercial (Black Friday, Día de la Madre) o un lanzamiento. Es opcional:
   el plan la propone cuando el mes trae oferta o fecha comercial (ya están en la campaña del mes y en las fechas
   especiales). Su presupuesto es aparte del reparto 60/20/10/10 y dura lo que dura la fecha. Anuncios: **de 4 a 6 por
   conjunto** en todas las campañas, 4 por defecto (el promedio de la agencia).
2. **Qué número se compara, según el destino** (con las mismas fórmulas, ver §5.2). Web (e-commerce): el ROAS que
   registra Meta frente al ROAS de equilibrio en «sólo la plataforma». WhatsApp: el costo por conversación frente al
   objetivo y al de equilibrio, y las ventas del mes ÷ la pauta en «todo el negocio» (Meta no ve esas ventas). Con
   costos fijos y sin las ventas de otros canales la pauta carga todos los fijos: la app lo avisa y no cambia la cifra.
3. **Las ventas, por un enlace del cliente**, sin sesión, como el de aprobación (fase E.1).

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

- las 4 campañas (o presentación + evaluación si la cuenta es nueva), con el reparto (60/20/10/10 por defecto), y la de
  temporada cuando el mes trae oferta o fecha comercial, con su presupuesto aparte;
- los conjuntos con sus públicos y exclusiones;
- de 4 a 6 anuncios por conjunto (4 por defecto);
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

**E.1 «Tus ventas de la semana», por un enlace (S-M).** Muchos clientes no pasan sus ventas, y sin ellas no hay tasa
de cierre ni ROAS real en WhatsApp. Un enlace fijo por cliente, sin sesión (como el de aprobación), que se llena en 30
segundos desde el teléfono:

- ¿Cuántas ventas cerraste esta semana por WhatsApp? ¿Por cuánto en total? (las dos obligatorias, nada más);
- opcional: cuántas vinieron de los anuncios, si lo sabe, y las ventas en tienda u otros canales (para el equilibrio
  exacto).

La pantalla le enseña al cliente lo que la app ya sabe («esta semana te escribieron 84 personas por los anuncios»), así
el número tiene sentido. La agencia lo manda cada lunes con un mensaje de WhatsApp listo para copiar (como «Enviar a
cliente»), y también puede escribirlo ella desde la app si se lo dicen por llamada. Con eso:

- tasa de cierre = ventas ÷ conversaciones de Meta, sobre las últimas 4 semanas (las ventas de esta semana suelen ser de
  conversaciones de la anterior);
- costo real por venta = pauta ÷ ventas, y el ROAS de WhatsApp = monto ÷ pauta;
- si el cliente no contesta, se queda la última medida (o el 5 %) marcada «sin medir desde…», y el diagnóstico lo dice.

En e-commerce web no hace falta: las compras las registra Meta. El enlace sirve igual para contrastar la atribución de
Meta con las ventas reales.

Lo demás, sin cambios respecto a la primera versión. Para WhatsApp Business, listo para copiar: bienvenida, respuestas rápidas
con las objeciones del estudio, etiquetas y un guion de ventas por producto. Además: la tasa de cierre medida cada
semana, la encuesta «Voz del cliente» por enlace, la revisión mensual del estudio y las preguntas del curso en el
análisis de la Biblioteca. El CRM y las etiquetas de WhatsApp como público quedan para más adelante.

### Orden

El de las entregas de §5.5: A → B.1 → E.1 (las ventas, que la tasa de cierre necesita) → el resto de B → C → D → E.

---

## 7. Decisiones

| # | Decisión | Propuesta |
|---|---|---|
| 0 | ¿Montar en el Ads Manager con el calendario como plan, guía y seguimiento? | **Decidido (agencia, 5-nov):** sí; «Nueva campaña» de la app, congelada |
| 1 | Reparto: 60/20/10/10 (lámina) o 60-80 / 30 / 5-10 / 5-10 (nota) | Por defecto (sin confirmar; se cambia en el Manual): 60/20/10/10 por defecto, editable en el Manual |
| 2 | Advantage+ en cuentas nuevas | Por defecto (sin confirmar; se cambia en el Manual): Sólo como conjunto de prueba en presentación; nunca en evaluación ni ascensión |
| 3 | Cuenta nueva: 4 campañas o presentación + evaluación | Por defecto (sin confirmar; se cambia en el Manual): Nueva = presentación + evaluación; con historial = las 4 |
| 4 | Tasa de cierre por defecto: 20 % (hoy) o 5 % (curso) | **5 %** (lo dice el Excel del curso) hasta medir la del cliente; cambia todos los números mágicos |
| 5 | Nombres de etapas y maletas | Por defecto (sin confirmar; se cambia en el Manual): Los del curso, con alias para lo ya escrito |
| 6 | Tamaño del feed | Por defecto (sin confirmar; se cambia en el Manual): Se queda 4:5 |
| 7 | Cuándo se pausa un anuncio | Por defecto (sin confirmar; se cambia en el Manual): Fuera del número mágico con el doble gastado, y nunca si el conjunto está sano |
| 8 | ¿Lo normal es pautar la publicación existente o montar un anuncio nuevo? | **Decidido (agencia, 5-nov): las dos.** Toda publicación «Va a pauta» lleva su caption como anuncio (A.3) Y sus textos de anuncio aparte (A.4); `como` sólo dice cuál se espera |
| 9 | ¿Qué publicaciones se marcan «Va a pauta» solas? | **Decidido (agencia, 5-nov):** las del tipo «Anuncio» del plan semanal y las de la oferta del mes, quitables |
| 10 | ¿Hashtags en lo que va a pauta? | Por defecto (sin confirmar; se cambia en el Manual): Ninguno o casi |
| 11 | Los números del negocio | **Decidido (agencia, 5-nov):** se configuran por cliente en la app, con ayuda y propuestas de la IA (B.1) |
| 12 | ¿Qué es la «Campaña especial» de la plantilla? ¿Cuántos anuncios por conjunto? | **Decidido (6-nov):** la de temporada (una oferta, una fecha o un lanzamiento), opcional y con presupuesto aparte; de 4 a 6 anuncios por conjunto, 4 por defecto |
| 13 | ¿Equilibrio de todo el negocio o sólo de la pauta? | **Decidido (6-nov):** las mismas fórmulas de la agencia; web con el ROAS de Meta («sólo la plataforma»), WhatsApp con el costo por conversación y las ventas del mes («todo el negocio») (§5.2) |
| 14 | ¿Quién apunta las ventas de cada semana? | **Decidido (6-nov):** el cliente por un enlace; la agencia también puede escribirlas (E.1) |

---

## 8. Lo que queda para la Parte 2

- Optimización de campañas de ventas, clientes potenciales y reconocimiento; los destinos e-commerce, formularios y
  negocio local; las columnas de esos objetivos (6.1).
- Los módulos 5.1 a 5.6 y del 7 en adelante (el 6.2 cita el 9: potenciar con IA).
- Los Excel de presupuesto, simulador y estrategia ya están (B.1). Faltan, para la fase E: la plantilla de preguntas para
  clientes, la de mensajes con las objeciones y el documento de las columnas (6.1).
