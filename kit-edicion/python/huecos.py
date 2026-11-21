"""HUECOS SIN VOZ: que en la voz montada (trabajo/voz.wav) SUENE algo donde la transcripción dice que se habla.

Cada palabra que queda (trabajo/linea.json, en segundos de salida) se mide en la voz montada; una palabra MUDA es la que
está a más de 30 dB por debajo del habla típica del video (o por debajo de −55 dBFS). Palabras mudas seguidas que suman
0,25 s o más son un HUECO: se dicen con su segundo y su texto y el paso sale con código 2 (el kit no entrega). En un video
de Rofer, una pieza que empezaba 0,02 s antes del clip dejó «Y tres, la pregunta que casi nadie se hace…» 3 s sin voz y
nada lo vio hasta que una persona miró el video.

Uso: huecos.py <trabajo> [audio]   (por defecto, trabajo/voz.wav). Deja trabajo/huecos.json.
"""
import os
import sys

import numpy as np

from comun import SR, escribir_json, leer_audio, leer_json, trabajo

T = trabajo()
AUDIO = sys.argv[2] if len(sys.argv) > 2 else os.path.join(T, "voz.wav")
palabras = leer_json(os.path.join(T, "linea.json"), {}).get("palabras", [])
if not palabras or not os.path.exists(AUDIO):
    print("huecos: no hay palabras o no hay voz montada que revisar", flush=True)
    sys.exit(0)
x = leer_audio(AUDIO)


def nivel(s, e):
    """dB RMS de la voz entre dos segundos (al menos 80 ms, centrados en la palabra)."""
    m = (s + e) / 2
    a, b = int(max(0, min(s, m - 0.04)) * SR), int(max(e, m + 0.04) * SR)
    seg = x[a:min(len(x), b)]
    return float(20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)) if len(seg) else -120.0


niveles = [nivel(p["s"], p["e"]) for p in palabras]
habla = float(np.median([n for n in niveles if n > -60] or [-20.0]))
muda = [n < max(-55.0, habla - 30) for n in niveles]

huecos, i = [], 0
while i < len(palabras):
    if not muda[i]:
        i += 1
        continue
    j = i
    while j + 1 < len(palabras) and muda[j + 1]:
        j += 1
    desde, hasta = palabras[i]["s"], palabras[j]["e"]
    if hasta - desde >= 0.25:
        huecos.append({"desde": round(desde, 2), "hasta": round(hasta, 2), "texto": " ".join(str(p["w"]) for p in palabras[i:j + 1])})
    i = j + 1

escribir_json(os.path.join(T, "huecos.json"), {"habla": round(habla, 1), "huecos": huecos})
if huecos:
    for h in huecos:
        print(f"✗ HUECO SIN VOZ {h['desde']:.2f}–{h['hasta']:.2f} s: «{h['texto']}» (la transcripción dice que se habla y no suena)", flush=True)
    sys.exit(2)
print(f"huecos: ninguno ({len(palabras)} palabras con voz; el habla, a {habla:.1f} dB)", flush=True)
