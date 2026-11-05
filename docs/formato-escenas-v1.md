# Formato de escenas v1 — video animado

El guion de un video animado («Content Factory») es **un JSON**. Lo escribe Claude
(por MCP) o el asistente, lo valida `validarGuion()` (`src/lib/videoEscenas.js`),
lo aprueba una persona, la pantalla lo dibuja como vista previa y el render del
Container (fase 2) lo consume **tal cual**. Se guarda en `videos_proyectos.guion`
(migración 0059).

## Las tres reglas

1. **Las escenas se anclan a palabras, no a segundos.** El `habla` de todas las
   escenas, en orden, **es** la locución (una sola toma). Una escena empieza donde
   empieza su primera palabra; una capa aparece «en la palabra 3» de su escena.
   Si se cambia de voz, todo se vuelve a cuadrar solo. Antes de que haya voz, los
   tiempos se estiman a 2,5 palabras por segundo.
2. **Las posiciones son zonas, y el motor reparte.** Con nombre (`arriba`, `centro`,
   `abajo`; con `izq`/`der` para ir lado a lado) la posición dice el **orden** de arriba
   abajo, no un punto: el motor mide cada capa con el mismo código que la dibuja y
   reparte el alto del **área segura** entre todas (lo que sobra, por igual arriba,
   abajo y entre bloques; un titular y su apoyo van juntos). Nada se encima: una placa
   de texto y una imagen tienen cada una su sitio. Si no cabe, se encoge primero lo
   visual. Una `forma` es un fondo: va detrás de la capa que la sigue. Dos capas que no
   se ven a la vez comparten sitio. En 16:9 lo visual va en una columna y el resto en
   otra. `{ "x": 0.5, "y": 0.3 }` (0–1) pone una capa en ese punto y la saca del
   reparto. `tam` es el ancho en fracción del **lado corto** (como mucho, el de su
   columna). El mismo guion sale en 9:16, 1:1 y 16:9, sin tocar coordenadas.
   - **Área segura** (sin texto ni botones fuera): 9:16 deja el 12 % de arriba (la barra
     de la red) y el 20 % de abajo (el texto del post y los botones), con 6 % a los
     lados; 1:1, 7 % arriba, 10 % abajo y 7 % a los lados; 16:9, 8 %, 12 % y 6 %.
   - **Los subtítulos** tienen su franja dentro del área segura (abajo, o arriba si
     `subtitulos.pos` lo dice; con `centro` van encima del contenido) y nada entra en ella.
   - **El primer segundo:** en la primera escena (el gancho) lo primero que entra, al
     empezar, es su **texto principal** (un titular; si no, el sello, otro texto o el
     llamado); lo demás entra 0,3 s después si iba a entrar antes. Sin texto en la escena,
     la capa que antes entra se adelanta al principio.
   - **La `pantalla` se ve:** si una escena no trae ninguna capa con letras (texto, sello o
     llamado), su `pantalla` se dibuja como titular, la primera y arriba.
   - **Las líneas van parejas:** un texto que ocupa varias líneas se reparte con líneas
     parecidas y prefiere cortar en un separador («·», coma, punto); un «·» no empieza ni
     acaba una línea.
   - **El logo y las imágenes se miden sin su borde transparente**, y el logo del cierre
     mide al menos la mitad del lado corto.
   - **Se lee siempre:** un texto sobre su placa (o un llamado sobre su fondo) que no
     llegue a 3 a 1 de contraste usa el claro u oscuro de la paleta que más contraste.
3. **Los colores son del estilo.** Un token (`fondo`, `superficie`, `texto`, `acento`,
   `apoyo`, `claro`, `oscuro`) o `#RRGGBB`. Cambiar el estilo recolorea el video.
   Sin `estilo.paleta`, los tokens salen del **kit** por el papel de cada color (lo que
   el papel dice ANTES de la primera raya o barra es lo que el color es y pesa el
   triple): `fondo` lo que se llama fondo; `texto` lo que se llama texto o título y se
   lee sobre ese fondo (4,5 a 1); `acento` un CTA, botón o «highlight» antes que un
   «acento» a secas; `superficie` un fondo de apoyo claro; `apoyo` el color de marca que
   queda. Con el kit de Baby Caleb: fondo #EFFFED, superficie #F2EFE5, texto #1B3246,
   acento #EE924A, apoyo #91C9A2.

## Raíz

| Campo | Qué es | Por defecto |
|---|---|---|
| `version` | Siempre `1` | `1` |
| `titulo` | Nombre del video (≤ 120) | `""` |
| `formatos` | `["9:16"]`, `["9:16","1:1","16:9"]`… El primero es el principal | `["9:16"]` |
| `estilo` | Paleta, fuentes, grano, ritmo, ilustración (abajo) | lo del kit |
| `escenas` | 1 a 40 escenas | — (obligatorio) |
| `subtitulos` | `activo`, `pos` (abajo/centro/arriba), `maxPalabras` (1–4), `maxCaracteres` (10–30), `acento` | `true`, `abajo`, `4`, `23`, `acento` |
| `musica` | `{ estilo, instrumental, clave, volumen 0–1, bajarConVoz }` o `null`. `estilo` (≤ 300) dice QUÉ música lleva («acústica alegre con ukelele, 100 bpm»): lo usa `generar_musica` (Suno). `clave` es un archivo de la galería; la música escogida en «Sonido» del video manda sobre ella | `null` |

Duración total: **de 5 s a 150 s**.

### `estilo`

| Campo | Qué es |
|---|---|
| `estiloId` | El estilo guardado del cliente del que sale (paso 6) |
| `paleta` | `{ token: "#RRGGBB" }`. Lo que falte lo pone el kit de marca |
| `fuentes.titular`, `fuentes.cuerpo` | `"kit"` (la fuente real del kit) o `{ nombre, clave }` con la clave `clientes/<c>/fuentes/…` |
| `grano` | 0–1 (0,25) |
| `ritmo` | `calmado`, `medio`, `rapido` |
| `ilustracion` | `plana`, `papel`, `linea`, `poster` |

## Escena

| Campo | Qué es |
|---|---|
| `id` | Único (si falta, `e1`, `e2`…) |
| `tipo` | `gancho`, `problema`, `agitacion`, `solucion`, `producto`, `beneficio`, `pasos`, `dato`, `prueba`, `comparacion`, `explicacion`, `cierre` |
| `habla` | Lo que se dice (≤ 400). Las indicaciones de emoción de ElevenLabs v3 van entre corchetes: `[emocionada]`. No cuentan como palabras |
| `pantalla` | El texto principal en pantalla, para leer el guion de un vistazo y aprobarlo (≤ 80) |
| `pausa` | Segundos de silencio **detrás** del habla (0–3). Una escena muda necesita `pausa`. El render inserta ese silencio en el audio |
| `fondo` | `{ tipo: plano/degradado/papel/rayas/puntos/estrellas/lineas, color, color2 }`. En `puntos`, `estrellas` (titilan) y `lineas` (curvas suaves), `color2` es el del adorno; vacío, el claro u oscuro que contraste |
| `transicion` | Cómo ENTRA la escena: `{ tipo: corte/fundido/barrido/zoom/deslizar, dur: 0–1 }` |
| `capas` | Hasta 8 componentes, en orden de dibujo (el primero, al fondo) |

## Capa (componente)

Todas llevan:

| Campo | Qué es |
|---|---|
| `tipo` | Uno de los 16 componentes |
| `id` | Único dentro de la escena |
| `pos`, `tam` | Dónde y de qué ancho (ver reglas) — `centro`, `0.6` |
| `entra`, `sale` | `{ "palabra": n }` (la n-ésima palabra que se dice en la escena, desde 0) o `{ "s": segundos }` desde que empieza. `sale` vacío = hasta el final |
| `animacion` | `entrada` (aparece, fundido, sube, baja, escala, rebote, escribe, barrido, dibuja), `salida` (ninguna, fundido, baja, escala), `bucle` (ninguno, flota, pulso, gira, late) |

Los 16 componentes de la librería v1 y lo propio de cada uno:

| Componente | Propiedades |
|---|---|
| `texto` | `texto`*, `rol` (titular/apoyo/dato/etiqueta), `color`, `placa` (color de fondo o vacío), `alinear` |
| `sello` | `texto`* (≤ 24), `color`, `rotacion` (−20 a 20) |
| `telefono` | `pantalla` (chat/imagen/color/notificacion), `mensajes` [{ `de`: cliente/marca, `texto` }] (≤ 6), `archivo`, `notificacion`, `color` |
| `burbuja` | `texto`*, `lado` (izq/der), `color` |
| `imagen` | `archivo`* (id de la galería: la foto REAL del producto), `rol` (producto/foto/persona), `recorte` (contener/cubrir), `marco` |
| `personaje` | `variante` (adulto/nino/bebe), `pose` (de-pie/saluda/senala/piensa/celebra/preocupado), `color` — figura genérica de la casa |
| `icono` | `nombre` (check, cruz, corazon, estrella, rayo, reloj, bolsa, carrito, chat, telefono, ubicacion, regalo, escudo, hoja, gota, bebe, casa, flecha, alerta, sonrisa, dinero, camion), `color`, `fondo` (un círculo de ese color detrás; el icono toma el color que más contraste) |
| `cifra` | La **cifra gigante**: `valor`*, `prefijo` («$»), `sufijo` («%», «años»; más pequeño, al lado), `etiqueta` (≤ 30, debajo), `contar` (sube desde 0 en 1,2 s), `decimales`, `color`. Coma decimal y punto de miles desde 5 cifras; el ancho es el del valor final (no baila mientras cuenta) |
| `anillo` | Un porcentaje que se llena: `valor`* (0–100), `texto` (≤ 10, en medio; vacío, el porcentaje que cuenta), `etiqueta` (≤ 30), `contar`, `color`, `pista` (el aro de fondo) |
| `dibujo` | El **lienzo libre**: `proporcion` (alto ÷ ancho, 0,2–3) y `formas` (1–24). Ver «El dibujo» abajo |
| `lista` | `items`* (1–6, ≤ 40 cada uno), `numerada`, `color` |
| `reloj` | `modo` (reloj/contador/cuenta_atras), `desde`, `hasta`, `color` |
| `forma` | `figura` (circulo/rect/ola/estrella/flecha/linea/mancha), `color`, `relleno` |
| `logo` | `placa` (opcional). El del kit de marca: el motor le quita el fondo liso (el blanco de un JPG o un PNG sin transparencia) y, si aun así no contrasta con el fondo de la escena, le pone una placa clara u oscura. Con `placa` se fuerza ese color |
| `llamado` | `texto`* (≤ 30), `color`, `fondo` |
| `antes_despues` | `modo` (lado: pantalla partida; deslizador: una línea que barre de un lado al otro; secuencia: primero uno y luego el otro), `textoAntes`, `textoDespues` (≤ 40), `archivoAntes`, `archivoDespues` (ids de la galería), `etiquetaAntes`, `etiquetaDespues` (≤ 16; «Antes» y «Después» si van vacías), `color`. Cada lado necesita su texto o su imagen |

`*` = obligatorio.

### El dibujo

Para dibujar un objeto propio del video (una taza, una casa, un gráfico) sin una
imagen y sin tocar el código. Cada forma va en **fracciones de la caja del dibujo**
(0,0 arriba a la izquierda; 1,1 abajo a la derecha; la caja mide `tam` de ancho y
`proporcion` × eso de alto):

| Campo | Qué es |
|---|---|
| `figura` | `circulo`, `elipse`, `rect`, `triangulo`, `estrella`, `corazon`, `gota` (x, y = el centro; w, h = el tamaño; `h` 0 = tan alto como ancho), `linea` y `curva` (de x,y a x2,y2; la curva dobla hacia cx,cy), `arco` (centro x,y, diámetro w, de `inicio` a `fin` en grados, 0 = a la derecha) |
| `color`, `relleno`, `grosor` | Token o #RRGGBB; `relleno: false` = sólo el trazo, de `grosor` (fracción del ancho) |
| `giro`, `radio` | Grados (−180 a 180); las esquinas del `rect` (0–0,5) |
| `retraso`, `entrada` | Segundos desde que entra el dibujo hasta que aparece esa forma; `escala`, `aparece`, `fundido`, `sube` o `dibuja` (traza las líneas de a poco; lo relleno se descubre de izquierda a derecha) |

```jsonc
{ "tipo": "dibujo", "id": "taza", "pos": "centro", "tam": 0.5, "proporcion": 1, "formas": [
  { "figura": "rect", "x": 0.45, "y": 0.62, "w": 0.5, "h": 0.42, "radio": 0.12, "color": "claro", "entrada": "sube" },
  { "figura": "arco", "x": 0.74, "y": 0.6, "w": 0.2, "inicio": 270, "fin": 90, "relleno": false, "grosor": 0.05, "color": "claro", "retraso": 0.2, "entrada": "dibuja" },
  { "figura": "curva", "x": 0.38, "y": 0.36, "x2": 0.4, "y2": 0.1, "cx": 0.3, "cy": 0.22, "relleno": false, "grosor": 0.025, "color": "acento", "retraso": 0.4, "entrada": "dibuja" }
] }
```

Los subtítulos y el grano **no** son capas: los pone el motor en
todo el video con `subtitulos` y `estilo.grano`.

**Cómo salen los subtítulos** (`src/lib/subtitulos.js`): palabra por palabra, con los
tiempos de la locución (o los estimados si aún no hay voz). Se parte el `habla` de cada
escena en trozos de frase —puntos, interrogaciones, comas—, una palabra suelta se junta
con el trozo siguiente y cada trozo se reparte en los menos grupos posibles, parejos,
de hasta `maxPalabras` palabras y `maxCaracteres` letras. La palabra clave de cada grupo
va en `acento`: un número si lo hay; si no, la más larga que no sea de relleno. Lo dicho
se ve entero, lo que se dice da un salto y lo que falta va atenuado. No hace falta
escribir nada más en el guion: si un corte queda mal, se cambia una coma en el `habla`.

## La revisión antes de renderizar

`revisarEscenas()` (`src/lib/revisionEscenas.js`; `revisar_video` y debajo de la vista
previa) mide con el mismo reparto que dibuja. **Graves**: subtítulos que tapan, texto
que se sale o se parte, fuera de la zona segura, capas encimadas. **Avisos**: texto
apretado o con una palabra sola, y el diseño de cada escena en su instante «lleno»:

- `texto_pequeno` — un texto que sale a menos del 3,5 % del lado corto (unos 38 px en
  1080): en el teléfono no se lee.
- `espacio_vacio` — lo que se ve ocupa menos del 12 % del cuadro (sin la franja de los
  subtítulos), o cabe en una franja de menos del 35 % del alto ocupando poco.
- `desequilibrio` — el centro de lo que ocupa la escena (de lo más alto a lo más bajo,
  de un lado al otro) se va más del 15 % del alto, o del 12 % del ancho, del centro.

## Qué es error y qué es aviso

`validarGuion()` **no arregla nada en silencio**: un texto largo, un color que no
existe, una palabra que la escena no dice o una duración fuera de 5–150 s son
**errores** con `donde` y `mensaje` (quien lo escribió lo corrige). Un campo que no
es del formato se quita y va en `avisos`.

## Ejemplo (anuncio, 9:16, unos 20 s)

Los colores son los del kit de Baby Caleb; lo que se dice del producto es
ilustrativo (un guion de verdad sale del cerebro y del catálogo). Este bloque lo
valida un test (`src/lib/videoEscenas.test.js`): si el formato cambia y el ejemplo
deja de valer, falla.

```json
{
  "version": 1,
  "titulo": "Toallitas Nateen · piel tranquila",
  "formatos": ["9:16", "1:1"],
  "estilo": {
    "paleta": { "fondo": "#F9F6ED", "texto": "#1B3246", "acento": "#EE924A", "apoyo": "#91C9A2", "oscuro": "#1B3246", "claro": "#F9F6ED" },
    "fuentes": { "titular": "kit", "cuerpo": "kit" },
    "grano": 0.3,
    "ritmo": "medio",
    "ilustracion": "poster"
  },
  "escenas": [
    {
      "id": "e1", "tipo": "gancho",
      "habla": "[preocupada] ¿Las toallitas le dejan la piel roja a tu bebé?",
      "pantalla": "¿Piel roja?",
      "fondo": { "tipo": "papel", "color": "fondo" },
      "capas": [
        { "tipo": "personaje", "variante": "bebe", "pose": "preocupado", "pos": "centro", "tam": 0.55, "animacion": { "entrada": "rebote", "bucle": "flota" } },
        { "tipo": "sello", "texto": "¿Piel roja?", "pos": "arriba", "tam": 0.7, "entra": { "palabra": 5 }, "animacion": { "entrada": "escala" } }
      ]
    },
    {
      "id": "e2", "tipo": "problema",
      "habla": "Muchas traen alcohol y perfume que irritan su piel.",
      "pantalla": "Alcohol + perfume = irritación",
      "transicion": { "tipo": "barrido", "dur": 0.3 },
      "capas": [
        { "tipo": "icono", "nombre": "alerta", "pos": "arriba", "tam": 0.25, "animacion": { "entrada": "escala", "bucle": "pulso" } },
        { "tipo": "lista", "items": ["Alcohol", "Perfume"], "pos": "centro", "tam": 0.7, "entra": { "palabra": 2 }, "animacion": { "entrada": "sube" } }
      ]
    },
    {
      "id": "e3", "tipo": "producto",
      "habla": "[tranquila] Nateen limpia suave, sin alcohol y sin perfume.",
      "pantalla": "Sin alcohol · sin perfume",
      "fondo": { "tipo": "degradado", "color": "fondo", "color2": "apoyo" },
      "transicion": { "tipo": "zoom", "dur": 0.4 },
      "capas": [
        { "tipo": "forma", "figura": "mancha", "color": "apoyo", "pos": "centro", "tam": 0.9, "animacion": { "entrada": "dibuja", "bucle": "gira" } },
        { "tipo": "imagen", "archivo": "ID-DE-LA-FOTO-EN-LA-GALERIA", "rol": "producto", "pos": "centro", "tam": 0.6, "entra": { "palabra": 0 }, "animacion": { "entrada": "rebote" } },
        { "tipo": "texto", "texto": "Sin alcohol · sin perfume", "rol": "titular", "placa": "acento", "color": "claro", "pos": "abajo", "tam": 0.85, "entra": { "palabra": 4 } }
      ]
    },
    {
      "id": "e4", "tipo": "cierre",
      "habla": "Pídelas hoy por WhatsApp.",
      "pantalla": "Pídelas por WhatsApp",
      "pausa": 1.2,
      "transicion": { "tipo": "fundido", "dur": 0.3 },
      "capas": [
        { "tipo": "logo", "pos": "arriba", "tam": 0.4, "animacion": { "entrada": "fundido" } },
        { "tipo": "llamado", "texto": "Pídelas por WhatsApp", "pos": "abajo", "tam": 0.8, "entra": { "palabra": 0 }, "animacion": { "entrada": "sube", "bucle": "late" } }
      ]
    }
  ],
  "subtitulos": { "activo": true, "pos": "abajo", "maxPalabras": 4, "maxCaracteres": 23, "acento": "acento" },
  "musica": null
}
```

## La línea de tiempo

`lineaDeTiempo(guion, palabras?)` devuelve, para cada escena, `desde`/`hasta` en
segundos y en frames (30 fps) y cada palabra con su momento **en el video**; además,
`silencios: [{ en, dur }]` en tiempo del **audio**, que el render insertará con
ffmpeg. `palabras` son los tiempos de la toma (uno por palabra de
`palabrasDe(textoDeLocucion(guion))`); sin ellos, o si no cuadran, se estima y
`estimado` es `true`.

El audio se corta al empezar la primera palabra de cada escena; cada escena dura su
trozo más su `pausa` (y lo que le falte para 0,6 s). La última termina 0,4 s después
de la última palabra, más su pausa.

## El proyecto (fila de D1)

`videos_proyectos`: `client_id`, `calendar_id` + `post_id` (la publicación, si va
atada a una), `titulo`, `estado` (borrador → aprobado → con_voz → renderizando →
renderizado / fallido), `version` (sube con cada cambio del guion),
`aprobada_version`, `guion`, `locucion` (voz, modelo, ajustes, clave en R2, tiempos
por palabra y la versión para la que se hizo), `render` (fase 2), quién y cuándo
aprobó. **La locución sólo se genera si `version` = `aprobada_version`**; editar el
guion lo devuelve a borrador.

## La locución (paso 3)

Una sola toma con `textoDeLocucion(guion)`: ElevenLabs v3 por Kie.ai (con las
`[emociones]`) o v2 de respaldo (sin ellas). Es un trabajo del Estudio
(`tipo: "audio"`) y **siempre** pide confirmar el costo. Al terminar,
`locucion` queda así:

```json
{
  "estado": "lista", "modelo": "v3", "voz": { "id": "hpp4J3VqNfWAUOO0d1Us", "nombre": "Bella" },
  "clave": "clientes/<c>/estudio/…/locucion.mp3", "duracion": 19.4,
  "palabras": [{ "desde": 0.12, "hasta": 0.38 }],
  "fuente": "motor | verificado | estimado", "coincidencia": 0.97, "revisar": false,
  "version": 3, "costo": 0.014
}
```

`palabras` lleva una entrada por palabra del guion, en orden: es lo que recibe
`lineaDeTiempo`. `fuente` dice de dónde salieron: del motor, de oír la toma
(Gemini, alineado con el guion) o estimados sobre la duración real. Con
`coincidencia` por debajo de 0,85 la voz no dijo lo que dice el guion y queda
`revisar`. Si el guion cambió mientras se generaba, va `desfasada: true` y el
proyecto no pasa a «Con voz».
