# Suno por Kie.ai — la parte que usa la aplicación

Extracto que entregó la agencia el 4-11-2026, sacado de https://docs.kie.ai/suno-api/* (cada página tiene su versión
Markdown con `.md`). Lo usa `src/lib/musica.js` (`cuerpoSuno`, `pistasDeSuno`) y `worker/lib/estudio/musica.js`.
**Nada se ha probado contra Kie real**: la forma sale de aquí.

## Comunes

- Base `https://api.kie.ai`, `Authorization: Bearer <KIE_API_KEY>`, JSON.
- Todo Suno va por el MISMO endpoint y cambia `model`:

```
POST /api/v1/jobs/createTask
{ "model": "ai-music-api/<operación>", "callBackUrl": "…opcional…", "input": { … } }
→ { "code": 200, "msg": "success", "data": { "taskId": "…" } }   (HTTP siempre 200: se mira `code`)
```

- `code`: 200 bien · 401 llave · 402 sin créditos · 404 · 409 · 422 / 500 no se pudo (leer `msg`) · 429 · 451 · 455.
- Estado: `GET /api/v1/jobs/recordInfo?taskId=…` → `data`: `state` (`waiting` | `queuing` | `generating` | `success` |
  `fail`), `param` (texto JSON; su `input` es otro texto JSON), `resultJson` (texto JSON, sólo en `success`), `response`
  (resultJson ya leído), `failCode`, `failMsg`, `costTime`, `completeTime`, `createTime`, `creditsConsumed`.
- Recomiendan empezar a preguntar cada 2–3 s e ir subiendo. **Los archivos se guardan 14 días**: bajarlos.
- En las tareas de audio de Suno, las pistas van en `data.response.data[]` con `audio_url`, `stream_audio_url`,
  `image_url`, `id` (= audio_id), `duration`. Suelen ser **2 variaciones** por pedido.
- Callback (no se usa: la cola pregunta): `callbackType` `text` → `first` → `complete`; sólo `complete` es seguro.

## Modelos

`V6` (más expresión, voces naturales), `V6_MINI` (ligero y rápido), `V6_WILD` (más audaz). V4–V5.5 están
descontinuados. Topes en V6: `prompt`/`lyrics` 5000, `style` 1000, `title` 80.

## Generate Music — `model: "ai-music-api/generate"`

| Campo | Tipo | Notas |
|---|---|---|
| `custom_mode` | bool | **Requerido.** `false` simple; `true` control detallado |
| `instrumental` | bool | **Requerido** |
| `model` | string | **Requerido.** V6 / V6_MINI / V6_WILD |
| `prompt` | string | Personalizado: se canta TAL CUAL como letra. Simple: la idea (≤ 3000) |
| `lyrics` | string | ≤ 5000. Personalizado: manda sobre `prompt` |
| `style` | string | ≤ 1000 |
| `title` | string | **Requerido en personalizado**, ≤ 80 |
| `negative_tags` | string | Estilos a excluir |
| `vocal_gender` | `m` \| `f` | Sólo personalizado |
| `style_weight`, `weirdness_constraint`, `audio_weight` | 0–1 | Sólo personalizado (`audio_weight` no con instrumental) |
| `variety` | 0–4 (1) | Sólo personalizado |
| `duration` | 10–360 s | **Sólo personalizado** y V6 / V6_MINI / V6_WILD |
| `persona_id`, `persona_model` | | Persona o voz propia |
| `image_urls`, `video_urls`, `audio_urls` | | Sólo modo simple |

Reglas:

- Personalizado: `title` obligatorio y al menos uno de `style`, `lyrics` o `negative_tags`.
- Simple: al menos uno de los adjuntos, `style` o `lyrics`; NO `duration`, `vocal_gender`, `style_weight`,
  `weirdness_constraint`, `audio_weight`, `variety`.
- `instrumental: true` en modo simple no lo garantiza: reforzar en el texto («Instrumental, no vocals») y no describir voces.

**Lo que hace la aplicación:** siempre modo personalizado (es el que admite `duration` y `title`), la descripción en
`style` (+ «Instrumental, no vocals.» si lo es), las voces en `negative_tags` en una instrumental, la letra en `lyrics`
sólo con voz, y nunca `prompt` (se cantaría). Sin `callBackUrl`.

## Lo que NO se usa (está en la documentación)

Extend, Upload and Cover, Upload and Extend, Add Instrumental, Add Vocals, Replace Section, Mashup, letras, letras con
tiempos, WAV, video musical, portada, Boost Style, Persona, Recovery y Suno Voice. **El precio no viene en la
documentación**: el costo es un estimado (`CREDITOS_SUNO`) y al entregar se apunta `creditsConsumed` si llega.
