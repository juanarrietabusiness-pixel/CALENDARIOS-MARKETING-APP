# Propuesta: un calendario siempre activo, y qué limpiar

Tres preguntas de la agencia:

1. ¿Crear un calendario cada mes, o uno **siempre activo**, como Business
   Suite y Metricool, sin perder el plan, las fechas especiales, el
   concepto semanal, las ofertas y las ideas que se repiten? Y quitar las
   categorías.
2. ¿Qué configuraciones u opciones sobran?
3. ¿Qué más mejorar en el móvil?

Esto es una propuesta: nada de lo de aquí está hecho todavía. Lo que sí
salió en el mismo cambio (Haiku, ampliar a 4:5 con IA, el panel de subir
al estilo Metricool, la portada del video, el video en el iPhone y el mes
del móvil de borde a borde) está en el historial de git.

---

## 1. El calendario siempre activo

### Lo que pasa hoy

El calendario es **una fila por cliente y por mes** (`calendars`), con
todos los días y publicaciones dentro de un JSON (`days`). De ahí salen
casi todas las fricciones:

- Hay que **crear** el mes antes de poder poner nada en él. «Subir» ya lo
  crea solo por detrás porque si no, no se podía subir.
- Una publicación **no se puede mover a otro mes**: el panel lo dice
  («Ese día es de otro mes: créala en ese calendario»).
- Una semana que empieza el 29 de septiembre y acaba el 5 de octubre está
  partida en dos calendarios.
- El enlace del cliente es **por mes**: cada mes, un enlace nuevo.
- Lo que se configura —concepto semanal, ofertas, fechas especiales— vive
  dentro de ese mes y se vuelve a escribir en el siguiente.

### Lo que propongo

**Para la agencia, un solo calendario por cliente**, que se abre en «hoy»
y se recorre con ‹ › (mes, semana o lista), como Metricool. No hay botón
«+ Calendario»: se toca un día y se crea la publicación.

Todo lo que hoy se configura por mes pasa a ser una **capa de
planificación** que se ve y se edita encima del calendario:

| Hoy (por mes) | Siempre activo |
|---|---|
| **Plan** (días y formatos de la semana, en la ficha → Semanal) | El **ritmo** del cliente: pinta huecos sugeridos («martes · reel») en los días futuros sin publicación. Se toca el hueco y se crea con ese formato. |
| **Fechas especiales** (`dayLabels`) | Una capa de **fechas del año** del cliente (aniversario, Black Friday…), que se repite cada año y sale arriba del día. |
| **Concepto semanal** (`weekConcepts`) | Se escribe en la **cabecera de la semana**, en cualquier semana, sin abrir ningún asistente. |
| **Ofertas / campaña** (`offers`, `campaign`, `promoCode`) | **Campañas con fechas de inicio y fin**, dibujadas como una franja de color sobre esos días. Lo que se genera dentro la tiene en cuenta. |
| **Ideas que se repiten** | **Publicaciones recurrentes** («cada lunes, frase motivacional»), como las tareas recurrentes: crean la publicación pendiente con N días de antelación. |
| **Generar contenido** (sobre el mes) | Generar sobre un **rango**: «esta semana», «las próximas 2 semanas», «el mes que viene», o sólo los huecos vacíos. |
| **Plantillas** (hoy en `localStorage`) | Plantillas guardadas **en la base, por espacio**. Hoy viven en el navegador de quien las creó: la compañera no las ve y se pierden al cambiar de equipo. |
| **Enviar al cliente** (enlace por mes) | **Un enlace permanente por cliente**. «Enviar» pasa a ser «avisar de que hay cosas nuevas»; su página enseña lo pendiente de aprobar, sea del mes que sea. |

**Las categorías se quitan.** Hoy colorean el chip, filtran y ocupan el
paso 5 del asistente. Con las campañas (franja de color por rango) y el
concepto semanal, lo que aportaban ya está en otro sitio. El chip pasa a
colorearse por formato y estado, que es lo que se mira. El campo
`category` se conserva en los datos viejos (como `script`), sin
enseñarlo ni pedirlo.

### Cómo hacerlo sin romper nada

Hay una razón técnica para que el mes exista: **D1 corta la fila a 2 MB**.
Un solo JSON con todas las publicaciones de un cliente desde siempre
acabaría chocando con ese techo. Así que no propongo meter todo en una
fila, sino esto:

- **Fase 1 · Navegación continua (sin cambiar la base).** Los meses siguen
  existiendo por dentro como «cajones», pero desaparecen de la interfaz:
  el calendario va de un mes a otro con ‹ ›, el cajón del mes se crea solo
  al escribir la primera publicación (como ya hace «Subir») y mover una
  publicación a otro mes la saca de un cajón y la mete en el otro. Es lo
  que más se nota y lo que menos riesgo tiene: la cola de publicación, las
  aprobaciones, el MCP y el asistente siguen leyendo lo mismo.
- **Fase 2 · Capas de planificación y fuera categorías.** Tablas nuevas
  por cliente: `campanas` (rango, color, oferta, código), `fechas_cliente`
  (anuales), `conceptos_semana` (por semana ISO). Migración: lo que hoy hay
  en `weekConcepts`, `offers` y `dayLabels` de cada mes se copia a ellas.
  El asistente de 7 pasos se queda en un «Generar» con el rango y el
  enfoque; lo demás ya está puesto en el calendario.
- **Fase 3 · El enlace del cliente, permanente.** Un testigo por cliente en
  vez de por mes. Los enlaces viejos siguen abriendo (redirigen al nuevo),
  porque el cliente los tiene en su correo.
- **Fase 4 · Recurrentes y ritmo.** Las publicaciones que se repiten y los
  huecos sugeridos del plan semanal.

La alternativa «limpia» —una fila por publicación en una tabla `posts`—
es mejor a largo plazo, pero toca la cola, las aprobaciones, el
historial, la exportación, el MCP y el asistente a la vez. Con la fase 1
se consigue lo que se ve sin esa migración, y deja la puerta abierta.

---

## 2. Qué quitaría

Lo que sigue sale de leer la aplicación, no de medir el uso: **confirmad
qué se usa antes de borrar nada**. Ordenado de más claro a menos.

**Quitar**

- **Categorías** — pedido de la agencia (ver arriba).
- **Groq como segundo proveedor de texto** (`rutaGroq` en
  `worker/rutas/ia.js`). Con Haiku elegible en Ajustes, la opción barata
  ya es de Anthropic, se mide en el mismo presupuesto y habla el mismo
  idioma que el resto. Dos proveedores son dos formas de fallar.
- **«Renombrar calendario» y «Duplicar calendario»** (menú ⋯). Con el
  calendario continuo no tienen sentido; duplicar lo sustituyen las
  recurrentes y las plantillas.
- **«Exportar a HTML»**. Hace lo mismo que «Imprimir o guardar en PDF» y
  que el enlace del cliente, con un código aparte (`export.js`) que hay que
  mantener: incrustar imágenes, `onclick` en línea…
- **El banco de contenido anterior** («Del banco», la migración a Drive)
  en cuanto todos los clientes estén pasados a Drive.

**Juntar**

- **«La publico yo» y «Ya la publiqué a mano»**: dos botones para dos
  momentos de lo mismo. Uno solo: «La publico yo» antes; y en Mi día,
  «Hecho» cuando se publicó.
- **Los resúmenes del cliente**: «2 de 12 aprobadas · 10 por aprobar · 12 a
  medias» arriba y «12 publicaciones · 2 aprobadas · 17 %» otra vez justo
  debajo. Una sola tira.
- **El asistente de 7 pasos** (Plan, Fechas, Campaña, Conceptos,
  Categorías, Ofertas, Ideas) → **un diálogo de «Generar»** con el rango y
  el enfoque. Plan, fechas, campaña y conceptos pasan al calendario (sección
  1); categorías se van.
- **La ficha del cliente en 6 pestañas** (Básico, ADN, Voz, Visual, Drive y
  GitHub, Semanal) → **3**: Marca (básico, voz y visual), Fuentes (Drive y
  GitHub) y Ritmo (el plan semanal).

**Revisar si se usa**

- **«Prompt maestro para Meta AI»** (menú ⋯). Si las piezas ya se hacen con
  la skill aparte o con «Crear con IA», sobra aquí.
- **«Programar al aprobar»** (apagado por defecto). Con el paso final de
  «Aprobadas, por programar», puede que nadie lo encienda.
- **«Copia de seguridad»** en Ajustes: si nadie la descarga, D1 ya tiene
  su propia recuperación (Time Travel: 7 días en el plan gratuito).

---

## 3. El móvil

Hecho en este cambio: el mes de **borde a borde** (sin hueco entre
celdas ni margen de página, tocar lo vacío de un día añade ahí, la
etiqueta a dos líneas con guiones), fuera el título del mes repetido y la
tira de estadísticas, y el **video que no se reproducía en el iPhone**:
el servidor no contestaba por trozos (`Range` → 206) y Safari no
reproduce un video sin eso.

Propongo, por orden de impacto:

1. **Tocar un día abre una hoja desde abajo** con sus publicaciones en
   grande (como el calendario del teléfono). Hoy hay que acertar en un chip
   de 50 px.
2. **Deslizar a los lados para cambiar de mes** (o de semana).
3. **Una sola fila de herramientas**: [Mes | Lista] · Generar · ⋯. «Enviar
   al cliente», el banco de ideas y «Seleccionar» van al ⋯. Hoy son dos
   filas.
4. **La cabecera del cliente en una línea**: nombre y ⋯ (editar, nuevo
   calendario); los tres resúmenes en una tira que se desliza. Hoy ocupan
   más de media pantalla antes del calendario.
5. **El panel de una publicación, a pantalla completa con un interruptor
   «Editar | Vista previa»** en vez de apilar la vista previa en medio del
   formulario.
6. **Compartir desde la galería del teléfono** directo a «Subir» (Web Share
   Target de la PWA): se elige la foto en la galería → Compartir → Juancito
   Ads, y se abre «Subir» con el archivo puesto.
