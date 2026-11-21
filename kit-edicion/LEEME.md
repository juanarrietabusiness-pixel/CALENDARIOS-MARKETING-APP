# Kit de edición de Juancito Ads

Lo que corre Claude en el chat para editar un video GRABADO (clips de una persona hablando a cámara). El método
—qué se corta, cómo suena, qué gráficos van y dónde— está en el **manual del editor** del calendario; esto son las
herramientas. Las decisiones las toma la lógica del calendario (`lib/`), lo pesado lo hace Python (`python/`).

## Instalar (un comando, unos minutos la primera vez)

```bash
bash instalar.sh
```

Es idempotente: si se corta, se vuelve a correr y sigue. Instala las librerías de Python, el modelo de reducción de
ruido de la voz (rnnoise), el de transcripción (faster-whisper large-v3-turbo), el del recorte de la persona
(RobustVideoMatting, de su origen en GitHub) y Remotion (las piezas y el render).

## Editar

Desde una carpeta del proyecto (por ejemplo `~/edicion/rofer`):

```bash
node ~/kit/kit.mjs preparar /ruta/de/los/clips    # copia los clips y escribe plan.json
node ~/kit/kit.mjs siguiente                       # hace el próximo paso que falta; repítelo
node ~/kit/kit.mjs estado                          # qué está hecho
```

Los pasos, en orden: `transcribir` → `cortar` → `voz` → (`compases <canción>` y escribir `plan.musica`) → `musica` →
`mezcla` → `crudo`. Cada paso deja su resultado en `trabajo/` y no repite lo hecho: los procesos del chat mueren al
responder, así que cada uno dura poco y se puede volver a lanzar.

### El plan (`plan.json`)

Lo escribe quien edita. `cortar` enseña las palabras con su índice: con ese índice se anclan los efectos, los realces y
el llamado («palabra»), así siguen en su sitio si cambia el corte.

```json
{
  "version": 1, "fps": 30, "cierre": 3.3,
  "indicacion": "Rofer Service, movimiento de tierra y alquiler de equipo pesado en Panamá.",
  "clips": [
    { "id": "1427", "archivo": "clips/1427.mov" },
    { "id": "1444", "archivo": "clips/1444.mov", "excluir": [[25, 25]] },
    { "id": "1450", "archivo": "clips/1450.mov", "velocidad": 1.05, "presencia": true, "ganancia": 2.2 }
  ],
  "realces": [{ "palabra": 116, "db": 11 }],
  "musica": {
    "archivo": "musica/cancion.mp3", "a0": 0.2147, "pulso": 0.62925, "llamado": { "palabra": 122, "mas": -0.1 },
    "tramos": [{ "cancion": [0.46, 20.35], "video": 0 }, { "cancion": [22.87, 35.45], "video": 19.89 }]
  },
  "efectos": [
    { "id": "impact-deep", "t": 0, "db": -15 },
    { "id": "impact-classic", "palabra": 18, "mas": -0.02, "db": -13, "alinear": "pico" }
  ],
  "apartar": [{ "palabra": 18 }]
}
```

- **clips**: en el orden del montaje. `excluir`: índices de palabra del clip que no van (una toma repetida; `cortar`
  sugiere las que ve). `velocidad`: un clip flojo un 5 % más ágil (el tono no cambia). `presencia` y `ganancia` (dB sobre
  el nivel común): para rescatar un clip flojo.
- **realces**: una palabra susurrada, más fuerte sólo ella.
- **musica**: SIEMPRE de la biblioteca del cliente o de Suno, nunca hecha con código. `compases <canción>` da `a0`,
  `pulso` y la energía de cada compás; los tramos se cortan en compases y se pegan en el video sin huecos.
  `llamado`: desde ahí la música empuja más bajo la voz.
- **efectos**: sólo del catálogo del calendario (`efectos_sonido`) y de la identidad del cliente. `alinear: "pico"`
  hace caer el pico del efecto en ese instante.
- **apartar**: la música se aparta un instante en los golpes grandes.

### La imagen

Con el corte y el sonido aprobados (`crudo`): `marca <carpeta del ZIP de kit_descargable>` (colores, logo y letra en
`plan.marca`), escribir `plan.piezas`, `muestras` (2 o 3 cuadros con la marca para enseñar ANTES de editar) y, con el sí,
`"aprobado": true` → `persona` → `cuadros` → `escena` → `render` → `final`. `siguiente` los encadena. Lo lento (`persona`,
`cuadros`, `render`) va con presupuesto de tiempo (`KIT_PRESUPUESTO`, 420 s): si sale con código 3, se repite y sigue.

Las piezas se anclan a una palabra (`desde`, `hasta`, cada ítem con su `palabra`); lo que no dice dónde va, la escena lo
coloca con aire sobre el tope de la cabeza:

```json
"piezas": [
  { "tipo": "titular", "lineas": [{ "texto": "LO MÁS CARO" }, { "texto": "DE UNA OBRA" }], "hasta": { "palabra": 9 } },
  { "tipo": "gigante", "texto": "+20 AÑOS", "desde": { "palabra": 30 }, "hasta": { "palabra": 34 }, "modo": "golpe" },
  { "tipo": "trio", "imagen": "logo", "desde": { "palabra": 68 }, "hasta": { "t": 21.7 },
    "items": [{ "texto": "MINIS", "palabra": 68 }, { "texto": "MEDIANOS", "palabra": 69 }, { "texto": "GRANDES", "palabra": 71 }] }
]
```

Tipos: `titular` (el gancho, completo en el cuadro 0), `gigante` y `tachado` (detrás de la persona), `cinta`, `logo`,
`ficha` (`lado`, `icono`: reloj, dinero, check, flecha; `baja`), `lista` (`titulo`, `items`), `sello` (`arriba`,
`grande`), `preguntas` (`items`, `marcar`), `trio`, `whatsapp` (`toque`) y `celular` (`pantallas`, `titulos`).

- **El trío**: sin `imagen`, las tres palabras van del MISMO tamaño, medidas para que quepan en su columna. Con
  `"imagen": "logo"`, el DIBUJO del logo de la marca, separado del nombre y en blanco (en Rofer, la excavadora); si el logo
  no tiene un dibujo aparte, va sin imagen y la escena lo dice. También vale la ruta de una imagen que suba la marca
  (`"imagen": "marca/excavadora.png"`). Con imagen, lo que crece es la imagen y la palabra va debajo.
- `escena` hace la REVISIÓN DE OFICIO con los anchos MEDIDOS con las letras de verdad: lo que tapa la cara, el texto que
  la cabeza no deja leer, la franja segura, el subtítulo encima de un gráfico, el cuadro 0 sin gancho, y que ningún texto
  se monte sobre otro ni se salga del cuadro. Lo grave para el render: se arregla, o si la persona lo acepta,
  `"revision": "aceptada"`.
- `persona`: por defecto, el recorte bueno sólo donde hay un texto detrás (`"persona": { "completa": true }` lo hace en todo).

### Revisar

- `node ~/kit/kit.mjs hoja <video>`: una hoja de contactos (un cuadro cada 1,7 s).
- `node ~/kit/kit.mjs medir <archivo>`: LUFS y pico verdadero del archivo FINAL (después de codificar).
- La mezcla deja en `trabajo/mezcla_informe.json` la voz frente a la música en cada tramo.
- `voz`, `crudo` y `final` comprueban que SUENE la voz donde la transcripción dice que se habla (`python/huecos.py`): un
  hueco mudo para el kit con su segundo y su texto (`trabajo/huecos.json`). No se entrega así: se mira el corte de esa
  pieza.

Lo terminado se sube a la galería del cliente con `subir_a_galeria`.
