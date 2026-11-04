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
2. **Las posiciones son relativas.** Por nombre (`centro`, `arriba`, `abajo`, `izq`,
   `der`, `arriba-izq`, `arriba-der`, `abajo-izq`, `abajo-der`) o `{ "x": 0.5, "y": 0.3 }`
   (0–1, desde arriba a la izquierda). `tam` es el ancho en fracción del **lado corto**.
   El mismo guion sale en 9:16, 1:1 y 16:9.
3. **Los colores son del estilo.** Un token (`fondo`, `superficie`, `texto`, `acento`,
   `apoyo`, `claro`, `oscuro`) o `#RRGGBB`. Cambiar el estilo recolorea el video.

## Raíz

| Campo | Qué es | Por defecto |
|---|---|---|
| `version` | Siempre `1` | `1` |
| `titulo` | Nombre del video (≤ 120) | `""` |
| `formatos` | `["9:16"]`, `["9:16","1:1","16:9"]`… El primero es el principal | `["9:16"]` |
| `estilo` | Paleta, fuentes, grano, ritmo, ilustración (abajo) | lo del kit |
| `escenas` | 1 a 40 escenas | — (obligatorio) |
| `subtitulos` | `activo`, `pos` (abajo/centro/arriba), `maxPalabras` (1–4), `maxCaracteres` (10–30), `acento` | `true`, `abajo`, `4`, `23`, `acento` |
| `musica` | `{ clave, volumen 0–1, bajarConVoz }` o `null` (la mezcla es de la fase 2) | `null` |

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
| `fondo` | `{ tipo: plano/degradado/papel/rayas/puntos, color, color2 }` |
| `transicion` | Cómo ENTRA la escena: `{ tipo: corte/fundido/barrido/zoom/deslizar, dur: 0–1 }` |
| `capas` | Hasta 8 componentes, en orden de dibujo (el primero, al fondo) |

## Capa (componente)

Todas llevan:

| Campo | Qué es |
|---|---|
| `tipo` | Uno de los 14 componentes |
| `id` | Único dentro de la escena |
| `pos`, `tam` | Dónde y de qué ancho (ver reglas) — `centro`, `0.6` |
| `entra`, `sale` | `{ "palabra": n }` (la n-ésima palabra que se dice en la escena, desde 0) o `{ "s": segundos }` desde que empieza. `sale` vacío = hasta el final |
| `animacion` | `entrada` (aparece, fundido, sube, baja, escala, rebote, escribe, barrido, dibuja), `salida` (ninguna, fundido, baja, escala), `bucle` (ninguno, flota, pulso, gira, late) |

Los 14 componentes de la librería v1 y lo propio de cada uno:

| Componente | Propiedades |
|---|---|
| `texto` | `texto`*, `rol` (titular/apoyo/dato/etiqueta), `color`, `placa` (color de fondo o vacío), `alinear` |
| `sello` | `texto`* (≤ 24), `color`, `rotacion` (−20 a 20) |
| `telefono` | `pantalla` (chat/imagen/color/notificacion), `mensajes` [{ `de`: cliente/marca, `texto` }] (≤ 6), `archivo`, `notificacion`, `color` |
| `burbuja` | `texto`*, `lado` (izq/der), `color` |
| `imagen` | `archivo`* (id de la galería: la foto REAL del producto), `rol` (producto/foto/persona), `recorte` (contener/cubrir), `marco` |
| `personaje` | `variante` (adulto/nino/bebe), `pose` (de-pie/saluda/senala/piensa/celebra/preocupado), `color` — figura genérica de la casa |
| `icono` | `nombre` (check, cruz, corazon, estrella, rayo, reloj, bolsa, carrito, chat, telefono, ubicacion, regalo, escudo, hoja, gota, bebe, casa, flecha, alerta, sonrisa, dinero, camion), `color` |
| `cifra` | `valor`*, `prefijo`, `sufijo`, `contar` (sube desde 0), `decimales`, `color` |
| `lista` | `items`* (1–6, ≤ 40 cada uno), `numerada`, `color` |
| `reloj` | `modo` (reloj/contador/cuenta_atras), `desde`, `hasta`, `color` |
| `forma` | `figura` (circulo/rect/ola/estrella/flecha/linea/mancha), `color`, `relleno` |
| `logo` | — (el del kit de marca del cliente) |
| `llamado` | `texto`* (≤ 30), `color`, `fondo` |
| `antes_despues` | `modo` (lado: pantalla partida; deslizador: una línea que barre de un lado al otro; secuencia: primero uno y luego el otro), `textoAntes`, `textoDespues` (≤ 40), `archivoAntes`, `archivoDespues` (ids de la galería), `etiquetaAntes`, `etiquetaDespues` (≤ 16; «Antes» y «Después» si van vacías), `color`. Cada lado necesita su texto o su imagen |

`*` = obligatorio. Los subtítulos y el grano **no** son capas: los pone el motor en
todo el video con `subtitulos` y `estilo.grano`.

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
