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

### La fase 1 en detalle: «sin tocar la base»

**Qué quiere decir.** Ninguna tabla nueva, ninguna columna nueva y ninguna
migración que reescriba datos que ya existen. Cada publicación sigue
guardada donde está hoy: en la fila de su mes. Lo que cambia es **la
pantalla**. Hoy el mes es un documento que se crea, se nombra y se abre.
En la fase 1 pasa a ser un cajón interno que nadie ve, igual que nadie ve
en qué carpeta guarda Metricool sus publicaciones.

**Por qué no un solo calendario de verdad en la base.** Hay tres motivos,
y el tamaño es el menos importante:

1. **El tamaño.** D1 no admite filas de más de 2 MB. Un mes ronda las
   decenas de kilobytes (las imágenes están en R2). Si todo el historial de
   un cliente viviera en una sola fila, esa fila crecería cada mes hasta
   llegar al tope.
2. **Cada guardado reescribe la fila entera.** Hoy, cambiar una hora
   reescribe un mes. En una sola fila reescribiría años de publicaciones, y
   el aviso de tiempo real mandaría esos años a cada compañera conectada.
3. **Los choques.** Hoy, dos personas que editan meses distintos no se
   pisan: son filas distintas. Con una sola fila por cliente, cualquier
   edición simultánea sobre ese cliente choca. `App.jsx` avisaría de
   conflictos que ahora no existen.

Así que el mes, como forma de guardar, es sano. Lo que molesta es tener
que crearlo y verlo.

**Qué cambia para la agencia**

| Hoy | En la fase 1 |
|---|---|
| «+ Calendario» y el asistente antes de poder poner nada | Se abre el cliente y sale el calendario en **hoy**. Se toca un día y se crea la publicación. Si ese mes aún no tenía cajón, se crea solo, en silencio (como ya hace «Subir»). |
| Un selector de meses («Octubre 2026», «Noviembre 2026»…) | **‹ Hoy ›** para pasar de mes. Un mes que no existe se ve igual, vacío, con el plan semanal pintado. |
| La semana del 29 de septiembre al 5 de octubre partida en dos | La vista de semana y la de lista leen **los dos cajones** y la enseñan entera. |
| «Ese día es de otro mes: créala en ese calendario» | Se **mueve** a otro mes, arrastrando o desde «¿Cuándo sale?». |
| Renombrar, duplicar, eliminar calendario | Fuera del menú: no hay nada que nombrar. |
| La dirección `/cliente/dcasa-pty/octubre-2026` | Se queda, pero ahora dice **dónde estás mirando**, no qué documento abriste. Los enlaces que ya se hayan pegado siguen abriendo. |

**Lo único delicado: mover una publicación de mes.** Una publicación no
vive sola. Seis tablas la señalan por «calendario + publicación»:

- `approvals`: lo que respondió el cliente.
- `comentarios_aprobacion`: la conversación con el cliente.
- `publicaciones_programadas`: la cola de publicación.
- `client_tasks`: sus tareas.
- `notas_equipo`: el hilo interno.
- `historial`: qué cambió.

Si al cambiar de mes sólo se moviera la publicación, esas seis quedarían
apuntando al cajón viejo. La aprobación dejaría de verse, el hilo se
perdería y la cola publicaría desde una fila en la que la publicación ya
no está. Así que hace falta **una operación nueva en el servidor**, «mover
de mes», que en un solo lote de D1:

1. saca la publicación de un cajón y la mete en el otro;
2. cambia el calendario en esas seis tablas;
3. vuelve a sincronizar la cola con la hora nueva.

O entra todo o no entra nada. Tiene que ir con su prueba sobre la D1 en
memoria (`tests/utils/d1Memoria.js`). Esa operación es el grueso del
trabajo de la fase 1. Lo demás es interfaz.

**Qué NO cambia en la fase 1.** Siguen igual:

- la cola de publicación;
- la página de aprobación del cliente, con su enlace por mes;
- el MCP de Claude;
- el asistente y sus herramientas;
- los informes;
- «Exportar»;
- «Mi día», Programación y el tablero.

Todos leen los meses como hasta ahora, porque los meses siguen estando.
El concepto semanal, las ofertas y las fechas especiales siguen guardados
en su mes, pero ya se editan sobre el propio calendario. Pasarlos a sus
propias tablas es la fase 2.

### Recomendación final

**Ni dejarlo como está ni hacerlo todo de golpe: la fase 1 sola, con las
reglas de abajo.** Después, unas semanas de uso real, y sólo entonces se
decide la siguiente fase.

**Por qué no dejarlo como está.** El modelo por meses ya tiene grietas, y
ninguna avisa:

- «Subir» crea meses a escondidas.
- Una publicación no se puede cambiar de mes.
- La semana que cruza de un mes a otro sale partida.
- La base **no impide dos calendarios del mismo mes para un cliente**.
  «Duplicar calendario» crea «Octubre 2026 (copia)» con el mismo mes y el
  mismo año. Y si «Subir» trabaja con una lista desactualizada, puede crear
  un segundo octubre.

Quedarse quieto también tiene riesgo; lo que pasa es que no se ve.

**Por qué no hacerlo todo de golpe.** La fase 3 cambia lo que ve el
cliente final, y la migración a una fila por publicación reescribe todos
los datos de producción. Son los dos cambios con los que un error llega al
cliente o hace perder datos. La fase 1 no toca ninguna de las dos cosas.

**Reglas para la fase 1**

1. **Un solo mes por cliente, y lo garantiza el servidor.**
   - El cajón de un mes lo busca o lo crea el servidor, nunca el
     navegador.
   - «Duplicar calendario» desaparece.
   - Antes de empezar, una consulta de sólo lectura en producción dice si
     ya hay meses repetidos. Si los hay, se juntan a mano con la agencia,
     viendo cuál es cuál.
   - Después, un índice único (cliente, año, mes) hace que la base rechace
     el segundo. Es la única migración de la fase, y no reescribe datos.
2. **El mes se crea al escribir, nunca al mirar.** Pasar por diciembre con
   ‹ › no deja una fila vacía.
3. **Mover de mes, sólo con la operación del servidor, y todo o nada.** Si
   alguno de los dos meses cambió desde que se leyó, porque alguien lo
   estaba editando, no escribe nada. Responde «Alguien acaba de cambiar
   este mes: vuelve a intentarlo». Nunca pisa.
4. **Lo que NO se puede mover:**
   - lo publicado o lo que se está publicando;
   - lo programado, a un día u hora que ya pasó;
   - una publicación a otro cliente.
5. **Lo que está con el cliente se mueve con aviso.** Hasta que exista el
   enlace permanente (fase 3), mover una publicación pendiente de aprobar
   la saca del enlace de su mes. Por eso pide confirmación: «Tu cliente
   la verá en el enlace de noviembre, no en el de octubre». Su aprobación
   y su conversación viajan con ella.
6. **No se borran meses enteros desde el calendario.** Se borran
   publicaciones. Borrar un mes (lo que hoy hace «Eliminar calendario»)
   queda para quien administra, con confirmación.
7. **Volver atrás no toca los datos.** Aparte del índice único, no cambia
   la forma de nada. Si algo sale mal, se despliega la versión anterior y
   todo sigue donde estaba.
8. **No entra sin probarse en tres sitios:**
   - «mover de mes» sobre la D1 en memoria, comprobando las seis tablas;
   - el test en vivo con dos personas, una moviendo y la otra editando el
     mismo mes a la vez;
   - la pantalla de verdad, en Chromium y en el teléfono, antes de mergear.

**Fuera de la fase 1.** Quitar las categorías no depende de nada de esto:
sólo deja de enseñarlas y pedirlas, y los datos se quedan. Puede ir antes,
o junto con la fase 1.

**Lo que no propongo, ni ahora ni con esta agencia:** guardar un cliente
entero en una sola fila, o pasar a una fila por publicación. La primera
tiene los tres problemas de arriba. La segunda es una migración grande
cuyo beneficio sólo se nota con mucho más volumen.

**Qué se descarta con esto.** Nada. Si más adelante se quiere una fila
por publicación, porque la agencia crece o porque se quieren búsquedas y
cifras que crucen todos los meses, la fase 1 no estorba: la pantalla ya
no depende de que el mes exista, y el cambio se haría sólo por dentro.

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
