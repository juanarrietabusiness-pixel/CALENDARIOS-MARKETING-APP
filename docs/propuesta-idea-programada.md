# Propuesta: la idea que sale sola cuando el cliente la aprueba

> Estado: **implementada con un cambio de la agencia**: lo aprobado NO sale
> solo. La agencia quiere un paso de decisión final aunque esté aprobado,
> así que la respuesta del cliente deja la publicación en «Aprobadas, por
> programar» (Programación y Mi día) y alguien la programa. Además se
> distingue qué aprueba el cliente: la IDEA (queda «por producir», nunca
> se programa) o la PIEZA FINAL (queda «por programar»). Se avisa si se
> cambió algo después del sí. «Programar al aprobar» sigue, apagado por
> defecto y sólo para piezas. Lo de abajo es la propuesta original.

## El problema

Hoy una publicación tiene dos vidas que no se tocan:

- **Idea**: se escribe para que el cliente la revise y la apruebe.
- **Subir**: el archivo, el texto de cada red y «¿Cuándo sale?».

Cuando el cliente aprueba una idea, alguien de la agencia tiene que volver
a abrirla, ir a Subir y programarla. Si nadie se acuerda, no sale. Existe
«Programar al aprobar», pero es un interruptor de TODO el calendario
(`cal.opciones.programarAlAprobar`), no de cada publicación, y no dice en la
publicación qué va a pasar.

Lo que se pide: **que una idea pueda dejarse lista para salir —archivo,
texto, redes, día y hora— y que salga sola en el momento en que el cliente
la aprueba**. Una publicación programada con candado: el candado lo abre
el cliente al aprobar, y la agencia decide si ese candado existe o no.

## La propuesta: «Programada, a la espera del cliente»

### 1. Mismo botón, otra etiqueta

En «¿Cuándo sale?», si la publicación **no está aprobada**, el botón deja de
decir «Programar para sáb 10, 9:00» y dice:

> **Programar cuando el cliente apruebe** · sáb 10 oct, 9:00 · Instagram y Facebook

No hay pantalla nueva ni un tercer estado que aprender: es la misma
pregunta de siempre, y el botón dice lo que va a pasar.

### 2. La tarjeta dice que está esperando

En vez de «Programada para…», una tarjeta ámbar:

> ⏳ **Esperando al cliente** — sale el sáb 10 oct a las 9:00 en Instagram
> (reel) y Facebook (publicación) en cuanto lo apruebe.
> [Cambiar] [Quitar la espera]

En la rejilla del mes, el chip lleva un reloj con candado; en Programación
aparece en un bloque propio, «Esperando aprobación», para que no se
confunda con lo que sale seguro.

### 3. Qué pasa cuando el cliente responde

| El cliente… | Qué pasa |
|---|---|
| Aprueba antes de la hora | Entra en la cola al momento, a su día y hora. Aviso al equipo: «Café Luna aprobó el reel del sáb 10: ya está programado». |
| Aprueba DESPUÉS de la hora | No se publica tarde a ciegas. Ver «Decisiones», punto 1. |
| Pide cambios | Sigue esperando, con la marca «El cliente pidió cambios». Al corregirla y volver a enviarla, espera la nueva aprobación. |
| No responde | Un día antes de la hora, aviso en Mi día: «Mañana sale X y el cliente aún no la aprobó». |

### 4. Lo que ve el cliente

Si la publicación ya tiene su archivo, la página de aprobación enseña **la
pieza final** (imagen o video, texto, hashtags) y una línea: «Si la
apruebas, se publica el sáb 10 a las 9:00». Así aprobar significa aprobar
lo que se publica, no sólo el concepto.

Una idea SIN archivo nunca se programa sola, aunque se apruebe: aprobar un
concepto no es aprobar una pieza.

## Cómo se construye (para quien lo programe)

Casi todo existe ya; es cablearlo por publicación en vez de por calendario.

1. **Un campo en la publicación**: `post.alAprobar = { redes, fecha }`. Lo
   escribe «¿Cuándo sale?» y lo borra «Quitar la espera».
2. **Las imágenes se preparan al pulsar el botón**, en el navegador
   (`prepararParaRedes`: JPEG y copias 4:5 / 9:16), igual que al programar.
   El servidor no puede convertir imágenes, y cuando el cliente aprueba no
   hay ningún navegador de la agencia abierto.
3. **`programarAlAprobar()`** (`worker/lib/publicador.js`) ya se llama al
   aprobar. Cambia su condición: `cal.opciones.programarAlAprobar ||
   post.alAprobar`, y pasa `post.alAprobar.redes` a `programar()`. Las
   reglas son las de siempre (`planificar()` + `revisarPublicacion()`): lo
   que no se pueda programar se avisa, no se calla.
4. **Pedir cambios** ya cancela lo pendiente (`cancelarPendientes`); con
   `alAprobar` no hay nada en la cola que cancelar, sólo se marca.
5. **La página de aprobación** lee `alAprobar` para la línea «se publica
   el…» (`publicacionParaCliente` decide qué campos ve).
6. Tests: la regla pura (¿se programa sola?, ¿con qué redes?, ¿y si ya
   pasó la hora?) en `lib/`, y el flujo aprobar → cola en
   `tests/migracion/publicar.test.js` con la D1 de verdad.

Tamaño: un pull request mediano. Sin migración de D1: el campo vive en el
JSON de `days`, como el resto de la publicación.

## Decisiones que tiene que tomar la agencia

1. **Si el cliente aprueba tarde** (la hora ya pasó): ¿se publica en ese
   momento, se mueve a la siguiente hora sugerida, o se avisa y espera a que
   alguien elija? *Recomendación: si faltan menos de 24 h de retraso,
   ofrecer «Publicar ahora» con un toque desde el aviso; nunca publicar
   tarde sin que nadie lo vea.*
2. **Si la agencia cambia el archivo o el texto DESPUÉS de que el cliente
   aprobó**: ¿sigue saliendo sola o vuelve a pedir aprobación? Hoy
   `marcarActualizada()` ya sabe detectar el cambio. *Recomendación: sigue
   saliendo, pero con un aviso en la tarjeta: «Cambiaste el texto después
   de que el cliente lo aprobara».*
3. **¿Quién puede armar la espera?** Cualquiera del equipo, o sólo el
   administrador. *Recomendación: cualquiera; lo que sale lo decide el
   cliente, y la tarjeta enseña quién lo dejó así.*

## Y mientras tanto (ya hecho en esta rama)

- «Agregar publicación» pregunta **Subir contenido** o **Agregar idea** y
  abre directamente la pestaña, sin pedir título.
- La idea puede convertirse en publicación en cualquier momento: es la
  misma publicación, basta pasar a la pestaña Subir.
