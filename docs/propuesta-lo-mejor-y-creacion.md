# Propuesta: «Lo mejor del momento» y una creación de contenido más simple

5 de noviembre de 2026. Sale de cinco análisis del código hechos en paralelo (inspiración y virales; imágenes y
director; carruseles y video; de la idea al calendario; navegación) y de consultas a la base de producción. Sólo
lectura: nada de esto está implementado todavía.

## Resumen

- **Casi todo existe, pero repartido.** Hay unas 9 puertas para crear la imagen de un post, 6 sitios con 4 nombres
  para «recrear» algo de otra cuenta, 7 caminos que escriben textos, 5 generadores de guion de video y la misma
  configuración del mes en 5 sitios.
- **Los caminos no aplican las mismas reglas.** El director y el control de calidad sólo se aplican siempre en lo que
  va por el servidor (lote, «Producir el mes», carrusel, `disenar_piezas`). **151 de las 430 piezas originales de las
  últimas tres semanas no pasaron por el control** (consulta a producción). Hay caminos sin director, sin logo
  estampado, con otro modelo o que mandan al motor la imagen de otra marca.
- **Lo mejor que ya tiene la app no se ve:** la Inspiración funciona con Meta real (6 cuentas de Instagram, 180
  publicaciones guardadas, 48 que rinden el doble o más de lo normal de su cuenta) y sabe medir «rinde X×» contra la
  mediana de cada cuenta, que es mejor que el «viral» de Higgsfield (curaduría suya, sin métricas). Pero está metida en
  una pestaña de cada cliente y repetida en 5 sitios con 3 cifras distintas.

**Orden propuesto:** primero que todo camino dé el mismo resultado (fase 1), luego un solo motor de textos (fase 2) y
«Lo mejor del momento» sobre lo que ya hay (fase 3); después simplificar las pantallas (fase 4), llevar el video al
servidor (fase 5), el mes en un solo flujo (fase 6) y la reorganización completa (fase 7).

---

## 1. «Lo mejor del momento»

### Lo que hay hoy

| Sitio | Datos | Cifra que enseña | Acciones |
|---|---|---|---|
| Inspiración (pestaña del cliente y panel del calendario) | `business_discovery` de Instagram, YouTube Data API; guardado en `inspiracion_publicaciones`, cron cada 20 h | «rinde X×» (interacciones ÷ mediana de la cuenta) | Llevar a un día, Extraer guion, Analizar, Recrear con mi marca, Fórmula, Al banco |
| Cerebro → Estudio de mercado → Competencia → «Su contenido en Instagram» | `business_discovery` en vivo, no guarda | interacciones brutas y % por cada 100 seguidores | Analizar, Extraer guion UGC |
| Biblioteca (global) por Scrape Creators | anuncios por empresa o palabra; caché 12 h | ninguna (sólo el orden de Scrape Creators) | Analizar, Traer, Al banco, Transcribir |
| Referencias del estudio de mercado | subidas o llegadas de los anteriores | ninguna | Adaptar, Recrear con mi marca, Seguir este video |
| Banco de ideas, «Guardar referencia», Compartir | enlaces con oEmbed | ninguna | editar, asignar empresa, llevar a un día |
| Resultados → Competencia | foto diaria | seguidores, interacción media | — |

Los huecos de datos son reales: TikTok no deja leer lo de otras cuentas, Instagram no da vistas de cuentas ajenas ni
lee cuentas personales, un reel con música no trae su video, y la API de Meta sólo da anuncios de política fuera de la
UE. Scrape Creators podría taparlos (perfiles y reels con reproducciones, TikTok por hashtag o tendencia), pero en el
código sólo están sus 5 rutas de la Biblioteca de anuncios. Hay que verificar esos otros endpoints y su costo.

### Lo que tiene Higgsfield y aquí falta

Una sola galería visual con vista previa, pestañas «Tendencia» y «Nuevo», y un botón «Recrear» con el costo delante
que deja todo listo con tus archivos. Lo que **aquí ya es mejor**: datos reales del mercado de Panamá normalizados por
cuenta, anuncios de la competencia de verdad, el análisis ligado al estudio de mercado y la adaptación con el kit, el
catálogo y el cerebro sin copiar.

### La propuesta

**Dónde.** Una sección global **«Lo mejor»** en la navegación. En el teléfono ocupa el sitio de «Enlace» en la barra
inferior («Pegar un enlace» queda dentro). Dentro de cada cliente, la pestaña Inspiración pasa a ser esta misma vista
filtrada por él (y el ojo del calendario abre lo mismo). El aviso de «esto rinde 3×», que ya existe, lleva aquí.

**Qué junta, por fases.**
1. Lo que ya está guardado: la inspiración de todos los clientes (sin repetir cuentas), las referencias guardadas por
   el equipo y **lo mejor propio** (`metricas_publicacion`: lo que más guardados y compartidos tuvo de cada cliente).
2. Los anuncios de las búsquedas guardadas de Scrape Creators, releídos una vez por semana con un tope de créditos.
3. Tendencias por rubro o hashtag de TikTok e Instagram por Scrape Creators (después de probar sus endpoints).

**Cómo se ordena.** Cada fuente con su señal propia (orgánico: «rinde X×» corregido cuando hay pocas publicaciones;
YouTube: también las vistas contra las del canal; anuncios: días activo, si sigue activo y cuántas versiones tiene;
propias: percentil en guardados y compartidos). Cada señal se pasa a **percentil dentro de su fuente** en la ventana
escogida y se ordena por eso. La tarjeta enseña la cifra de verdad, sin mezclar unidades: «rinde 4,1×», «63 días
activo», «tu mejor del mes». Pestañas: **Esta semana · Este mes · Nuevo**, y filtros por cliente, rubro, red y formato.

**La tarjeta.** Vista previa grande (el video se reproduce). Acción principal **«Recrear para [cliente]»**:
1. crea la publicación en el próximo día libre con el original como REFERENCIA (nunca como lo que se publica);
2. lanza al director (imagen o carrusel) o el guion (reel o UGC);
3. enseña el costo antes de crear.

Secundarias: Guardar en ideas, Extraer guion, Fórmula, Ver el original.

**Claude.** Herramientas del conector `ver_lo_mejor` y `recrear`, con la vista previa del chat que ya existe. Y que el
«Crear con Claude» lleve la referencia (hoy no la manda).

**Lo que hay que arreglar antes (si no, la sección hereda los fallos):**
- **Un solo «Recrear con mi marca».** Hoy son tres motores con el mismo nombre. El del estudio de mercado («Seguir este
  video») fija `kling-omni-video`, un modelo de Higgsfield que la cuenta no tiene (EstudioMercado.jsx:1059). El modo
  «En el Estudio» manda al motor la imagen de la otra marca, que la agencia prohibió. Quedarse con el del director, que
  mira la referencia sin copiarla.
- **No pagar dos veces lo mismo.** Un video ya bajado se vuelve a bajar y Gemini lo vuelve a analizar en cada
  «Analizar», «Extraer guion» o «Recrear» (los videos no tienen huella; las referencias no se deduplican por enlace).
- **No perder la cifra.** Al pasar al banco, el «rinde» queda como texto y sin miniatura; «Guardar en el banco» de
  «Extraer guion» pierde el enlace y el video.
- **Probar contra el servicio real** lo que CLAUDE.md marca sin probar (todo Scrape Creators). La Inspiración por Meta
  sí funciona en producción.

---

## 2. Lo que encontramos en la creación de contenido

### A. Los caminos no aplican las mismas reglas (lo más grave)

| Entrada | Director | Control | Modelo del cliente | Logo estampado | Proporción |
|---|---|---|---|---|---|
| Lote, «Producir el mes», carrusel, `disenar_piezas` (servidor) | sí | sí | sí | sí | sí |
| «Crear la imagen aquí» (post) | sí | según el navegador | sí | sí | sí |
| Visor: «Otra igual», «Versión distinta», «Editar» | parcial | **no** | el de la original | **no** | no |
| «Otra versión» en modo «En el Estudio» (el predeterminado) | sólo si la original tenía ficha | **no** | — | **no** | no |
| «Recrear con mi marca» en modo Estudio | **no** (manda la imagen ajena) | sí | sí | sí | no |
| «Recrear con mi marca» en modo Aquí | sí | **no** | sí | sí | sí |
| `crear_en_estudio` y `generar_imagen` (asistente y conector) | **no** | **no** | **no** (el predeterminado) | **no** | no |
| «Generar en 4:5 con IA» (ajuste de imagen) | **no** | **no** | aparte | **no** | — |

Además:
- **Preferencias guardadas en el navegador cambian el resultado:** si el control está encendido, si se usa el kit
  (se puede apagar y queda recordado), «En el Estudio / Aquí, rápido», la plantilla recordada… Dos personas que pulsan
  lo mismo obtienen piezas distintas.
- **«¿Qué quieres?» se pierde** en el modo predeterminado, en «Crear con IA», el carrusel y las historias.
- **«Otra versión» corta el pedido por el final** (`slice(0, MAX_PROMPT)` en otraVersion.js:144 y Estudio.jsx:652):
  el mismo tipo de fallo que el de las fichas cortadas que arreglamos hoy. Y repite el kit viejo de la original.
- La plantilla que escoge el director no llega al motor fuera del lote; «Crear con IA» pierde los productos secundarios;
  las historias con IA no piden confirmar el costo.

### B. Demasiadas puertas y nombres que confunden

- **Puertas:** unas 9 para crear la imagen de un post, 5 para diseñar el mes, 6 sitios para recrear, 8 entradas al
  banco, 7 para extraer un guion.
- **Una palabra, varias cosas:** «Subir» (el botón global y la pestaña del panel), «Idea» (5 sentidos), «Plantilla»
  (del kit, de texto, de plan), «Director» (de arte, creativo, comercial), «Voz» (tono, UGC, locución, la de Google),
  «Plan» (3), «Estudio» (pestaña y subpestaña de Cerebro), «Contenido» (que es Drive).
- **Pantallas sobrecargadas:** el «⋯» del calendario tiene 12 entradas, y la pestaña Subir del panel unos 25
  controles de IA en una columna.
- **Estructura impuesta por el tamaño del código, no por la persona:** la pestaña Diseño separada del Estudio y el menú
  de video de tres niveles (Video → Guiado → Por planos / Del producto / Animado) existen por el tope de 20 kB del
  Estudio.
- **Jerga a la vista:** prompt, preset, lote, «/receta id», «secreto del Worker», «textoPieza» en un error.

### C. De la idea al calendario y los textos

- **7 caminos escriben textos y no todos pasan por el mismo motor.** Y el motor del servidor (el bueno) **no lee las
  instrucciones obligatorias del cliente**, ni su estilo, sus hashtags base o su WhatsApp, que sí leen los caminos
  viejos.
- **Reglas que se contradicen por formato:** a una historia se le exige guion y caption aunque no lleva; texto en la
  pieza en reels sí y no; hashtags dentro del caption en unos caminos y aparte en otros (pueden salir dos veces);
  guion de reel «10 s por planos» frente a «Hook 0-3 s → Desarrollo → CTA».
- **«Planificar mes»:** las Ofertas se piden después de la Estrategia que las usa (llegan vacías); cerrar el asistente
  tira las ideas ya pagadas; al crear el calendario se pierde la ficha de diseño ya pagada (y se vuelve a pagar); si el
  mes ya tenía publicaciones, las nuevas se añaden encima en los mismos días.
- **La misma configuración en 5 sitios** (plan, formatos y tipos por día) y **dos definiciones de «semana»** (bloques
  de 7 días desde el 1, o filas de lunes a domingo): en noviembre la «Semana 1» del asistente tiene 7 días y la de la
  rejilla, 1.
- **La estrategia del mes sólo vive dentro del asistente:** no se ve ni se edita después.

### D. Carruseles y video

- **5 generadores de guion de video casi iguales**, y el reel ignora el guion que ya tiene la publicación.
- **Duraciones que se contradicen:** los chips no se filtran por las llaves que hay; se puede pedir un guion de 30 s
  con un modelo que hace 10 s.
- **El reel por planos depende de la pantalla abierta** y no se pone solo en la publicación; el carrusel con «Primero
  la portada» no se puede reanudar si se cierra.
- **Los videos con IA salen sin texto, sin subtítulos y sin logo**, y nuestro propio revisor «¿Está listo?» los
  reprueba por eso. El render del video animado ya podría ponerles ese acabado (acepta clips).
- Referencias que se caen sin aviso (un modelo de 3 referencias pierde las fotos del producto desde la lámina 3).
- Por el conector no hay reel por planos, ni «¿Está listo?», ni extraer un guion UGC.

### E. Navegación y avisos

- Lo creado en la pestaña Estudio no se puede poner en una publicación desde ahí.
- Los lotes, encargos y renders no dejan aviso en la campana: lo que se lanza desde el teléfono antes de cerrar la app
  termina sin que nadie se entere.
- En el teléfono: 10 pestañas que se desplazan de lado, el banco y la Inspiración se abren debajo del mes entero,
  iconos sin texto.

### Lo que funciona bien y se conserva

Las direcciones reales de cada pestaña; «¿Cuándo sale?» como una sola pregunta; «Producir el mes» como botón principal;
el panel ancho con vista previa real; el asistente dentro de un post con «Deshacer»; «rinde X×» contra la mediana; lo
de otra cuenta siempre como referencia; el costo antes de crear; el director y el control cuando van por el servidor.

---

## 3. A dónde llegar

- **Un cliente con 5 pestañas:** Calendario · **Crear** (Estudio y Diseño juntos: una caja «¿Qué quieres crear?» que
  habla con el director, los atajos y la galería; lo manual en «Avanzado») · **Referencias** (Ideas, Inspiración y la
  competencia: «Lo mejor» de ese cliente) · **Marca** (ficha, cerebro, kit, voces, plan semanal, fechas, Drive) ·
  Resultados.
- **Navegación global:** Inicio · Mi día · **Lo mejor** · **Producción** (lo que está por producir y la cola) · Bandeja ·
  Resultados · Anuncios (con la Biblioteca dentro) · Auditorías. En Ajustes, un apartado **«Cómo trabajamos»**: recetas,
  fórmulas UGC, plantillas de plan y los manuales.
- **Panel de una publicación: Idea · Pieza · Publicar.** Pieza con tres botones: «Diseñar con el director», «Subir
  archivo» y «De la galería»; lo demás (video del producto, animado, receta, modelo, estilo) en «Más formas».
- **Un glosario:** *Diseñar* (crear con el director) · *Otra versión* (misma información, otra composición) ·
  *Corregir* (editar la misma imagen) · *Recrear con mi marca* (sólo para lo de otra cuenta) · *Poner en una
  publicación* · *Guardar referencia*.
- **Un kit de marca con semáforo:** qué le falta a cada cliente (logo, fotos del catálogo, plantillas, «Me gusta»),
  avisado también en el post y en Crear.

---

## 4. Plan de acción

Cada fase es uno o varios pull requests que llegan desplegados, con `npm run verificar` y una prueba en pantalla.

**Fase 1 — Las mismas reglas en todos los caminos.** *Sin cambios de pantalla; esfuerzo bajo; mejora directa de
calidad.*
- Control y logo estampado en todo lo que crea el visor y «Recrear»; confirmación de costo en las historias.
- «Otra versión» rehecha con el kit actual y acortada con `ajustarFicha`, nunca cortada.
- `crear_en_estudio` y `generar_imagen` con cliente: el modelo del cliente y el director (o, mejor, sólo
  `disenar_piezas` para imágenes).
- «¿Qué quieres?», los productos secundarios y la plantilla del director llegan a todos los caminos.
- Fuera las preferencias por navegador que cambian el resultado: control siempre encendido, kit siempre puesto.
- Comprobación: volver a consultar en producción cuántas piezas nuevas salen sin control (meta: 0).

**Fase 2 — Un solo motor de texto.** *Esfuerzo bajo-medio.*
- Todo texto (los botones «IA» de cada campo, «Completar», el banco, la vista Lista) por el motor del servidor.
- El motor recibe también las instrucciones obligatorias, el estilo, los hashtags base, el WhatsApp y la estrategia
  completa en todos los modos.
- Una regla por formato compartida por el motor, la completitud y el panel (historia sin guion ni caption, reel sin
  texto en la pieza, hashtags siempre aparte).
- Una sola definición de semana (las filas de la rejilla).
- Arreglos de «Planificar mes»: Ofertas antes de Estrategia, borrador que se guarda, no pisar días ocupados, conservar
  la ficha de diseño ya pagada.

**Fase 3 — «Lo mejor del momento» v1 y un solo «Recrear».** *Esfuerzo medio.*
- La sección global con la inspiración de todos los clientes, las referencias y lo mejor propio; puntuación por
  percentil; la tarjeta con «Recrear para [cliente]».
- La pestaña Inspiración del cliente pasa a ser esta vista filtrada.
- Un solo recreador (el del director), sin pagar dos veces el análisis de un video, y la cifra que viaja al banco.
- `ver_lo_mejor` y `recrear` en el conector, con su vista previa en el chat.

**Fase 4 — Menos puertas, nombres claros.** *Esfuerzo bajo-medio, muy visible.*
- Aplicar el glosario; panel Idea · Pieza · Publicar; quitar el interruptor «En el Estudio / Aquí, rápido».
- «Poner en una publicación…» desde el visor y la pestaña Estudio.
- Avisos en la campana cuando un lote, encargo o render termina o falla.
- El «⋯» del calendario adelgazado (revisar y producir pasan al diálogo «Producir el mes»; plan y fechas a Marca).
- Estudio reordenado (Crear y la galería arriba, el kit al final); en el teléfono, el banco y Lo mejor como hoja
  inferior y texto junto a los iconos; fuera la jerga.

**Fase 5 — El video, en el servidor y terminado.** *Esfuerzo medio-alto.*
- Un encargo de servidor para el reel (fotogramas → video), cerrable y reanudable, como el carrusel.
- Todo resultado se pone solo en su publicación (con caption, guion y portada) — también `disenar_piezas` con `post_id`.
- Un **acabado común** con el render del animado: subtítulos, gancho escrito, logo, llamado a la acción y música sobre
  cualquier clip con IA (y fuera el ZIP para CapCut).
- Una tabla de duraciones por ruta filtrada por las llaves; un solo generador de guion de video; una sola voz de marca.
- En el conector: crear un reel, «¿Está listo?» y extraer un UGC.

**Fase 6 — El mes en un solo flujo.** *Esfuerzo medio.*
- Un «Asistente del mes» en el botón grande, que se guarda y se retoma: estrategia (precargada, una sola IA) → plan (del
  plan semanal) → ideas con el balance y la aprobación interna en la misma lista → diseñar las aprobadas, que se ponen
  solas → revisar y enviar, con las horas en bloque.
- Un plan semanal único (formato, tipo, hora y nota por día) en lugar de los 5 sitios; «Producir el mes» también para
  reels.

**Fase 7 — La reorganización completa y «Lo mejor» v2.** *Esfuerzo alto.*
- Crear (Estudio + Diseño, resolviendo el tope de tamaño con carga diferida), Referencias y Marca; 5 pestañas por
  cliente.
- Anuncios semanales de las búsquedas guardadas y tendencias de TikTok e Instagram por Scrape Creators, con tope de
  créditos.

**Recomendación:** empezar por la fase 1 (es lo que más cambia la calidad y no mueve pantallas) y la fase 3 en
paralelo (es lo que pediste y apenas toca lo demás).

## 5. Decisiones que necesito de ti

1. **Quitar el interruptor «En el Estudio / Aquí, rápido»** y que todo se haga en la publicación por el director (con
   «Ver en el Estudio» como enlace). ¿De acuerdo?
2. **Quitar las preferencias por navegador** (control siempre encendido, el kit siempre puesto). ¿De acuerdo?
3. **«Lo mejor»:** ¿global y además dentro de cada cliente? ¿Cuántos créditos de Scrape Creators por semana para
   anuncios y tendencias (fases 3 y 7)?
4. **Pasar de 10 a 5 pestañas por cliente** (fase 7): es el cambio más visible para el equipo. ¿Lo hacemos al final o
   antes?
5. **Por dónde empiezo:** ¿fase 1 y fase 3, como recomiendo?
