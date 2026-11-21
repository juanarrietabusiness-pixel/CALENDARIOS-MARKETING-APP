"""Transcripción por PALABRA de cada clip (faster-whisper large-v3-turbo, en CPU, int8).

Reanudable: un clip ya transcrito (trabajo/transcripcion/<clip>.json) no se repite. `indicacion` (del plan) ayuda con los
nombres propios y el rubro («Rofer Service, movimiento de tierra…»).

El audio lo decodifica ffmpeg (16 kHz, mono) y le llega a Whisper como arreglo: faster-whisper abre los archivos con
PyAV, y la versión de PyAV que instala pip no siempre casa con la suya (`metadata_errors`, 2026-11).
"""
import os

from comun import Reloj, escribir_json, leer_audio, leer_json, trabajo

T = trabajo()
clips = leer_json(os.path.join(T, "clips.json"))
salida = os.path.join(T, "transcripcion")
os.makedirs(salida, exist_ok=True)
faltan = [c for c in clips["clips"] if not os.path.exists(os.path.join(salida, c["id"] + ".json"))]
if not faltan:
    print("transcribir: todo hecho")
    raise SystemExit
from faster_whisper import WhisperModel  # noqa: E402  (tarda en cargar: sólo si hace falta)

modelo = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 2)
for c in faltan:
    r = Reloj(f"transcribir {c['id']}")
    audio = leer_audio(c["archivo"], sr=16000).astype("float32")
    segs, _ = modelo.transcribe(audio, language="es", word_timestamps=True, beam_size=5, vad_filter=False,
                                initial_prompt=clips.get("indicacion") or None)
    palabras, texto = [], []
    for s in segs:
        texto.append(s.text.strip())
        palabras += [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)} for w in s.words]
    escribir_json(os.path.join(salida, c["id"] + ".json"), {"texto": " ".join(texto), "palabras": palabras})
    r.fin(f"{len(palabras)} palabras")
