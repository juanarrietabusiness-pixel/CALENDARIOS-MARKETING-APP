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

## Fase 2b (la imagen)

| Pieza | Para qué | Licencia | Cómo llega |
|---|---|---|---|
| RobustVideoMatting resnet50 (código y pesos) | Recortar a la persona | **GPL-3.0** | GitHub (`PeterL1n/RobustVideoMatting`, v1.0.0), por sha256, al instalar. El kit NO lleva su código ni sus pesos: lo llama como un modelo ONNX. Usarlo dentro de la agencia no es distribuirlo |
| onnxruntime | Correr RVM | MIT | pip |
| OpenCV (headless) | Leer y escribir cuadros | Apache-2.0 | pip |
| Remotion 4.0.541 (+ @remotion/bundler y renderer) | Las piezas y el render | **Remotion License: gratis para personas y empresas de hasta 3 empleados**; desde el 4.º, licencia de empresa de pago | npm, con versiones fijadas (`remotion/package-lock.json`) |
| React | Las piezas | MIT | npm |
| Anton e Inter Tight (@fontsource) | Las letras si la marca no trae las suyas | OFL-1.1 | npm |

**Por qué RVM y no los permisivos** (decisión de la agencia, 2026-11-20: «gana la de licencia permisiva sólo si los
bordes se ven como en Rofer v2»): en la prueba de la Fase 2b, con el texto gigante detrás del casco, cerca (1434) y lejos
(1450), MediaPipe (selfie multiclass, Apache-2.0) dejó halo amarillo y un alfa que no llega a cero en el fondo, y SAM 2.1
tiny (Apache-2.0, ONNX de Hugging Face) dejó colar el texto por el tope del casco. Sólo RVM dio el borde limpio.
