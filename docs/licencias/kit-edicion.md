# Kit de edición de videos grabados — lo que usa y su licencia

El kit (`kit-edicion/`) se descarga y corre en el chat de Claude de la agencia. No lleva dentro código ni pesos de
terceros: el instalador los baja de su origen. No es asesoría legal.

| Pieza | Para qué | Licencia | Cómo llega |
|---|---|---|---|
| faster-whisper + CTranslate2 | Transcribir por palabra | MIT | pip |
| Whisper large-v3-turbo (pesos de OpenAI, conversión CTranslate2) | El modelo de transcripción | MIT | Hugging Face, al instalar |
| rnnoise-models (GregorR), modelo `somnolent-hogwash` | Reducir el ruido de la voz (`arnndn` de ffmpeg) | Su autor declara que los modelos no son obra creativa y no tienen derechos de autor; RNNoise es BSD-3 | GitHub, fijado por commit (`3eee541a`) y sha256 |
| librosa | Tempo y compases de la música | ISC | pip |
| NumPy, SciPy, soundfile | Audio | BSD | pip |
| Pillow | La hoja de contactos | MIT-CMU (HPND) | pip |
| ffmpeg | Decodificar, filtrar, codificar | LGPL/GPL según la compilación | El del chat; no lo distribuimos |
| Efectos del catálogo | Los efectos de la mezcla | earshot (MIT) y uisfx (CC0), ya en el calendario | Del sitio publicado (`/efectos/v1/`) |
| Música | — | La de la biblioteca del cliente o de Suno (por Kie): lo que permite Suno depende del plan con que se generó | Del calendario |

Pendiente de la Fase 2b (docs/propuesta-edicion-video-grabado.md §6 y §11): Remotion (gratis hasta 3 empleados) y la
segmentación de la persona (RVM GPL-3.0, bajado de su origen, frente a SAM 2.1 y MediaPipe, Apache-2.0).
