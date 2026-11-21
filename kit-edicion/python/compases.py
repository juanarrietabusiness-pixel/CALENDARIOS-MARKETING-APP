"""La REJILLA de compases de una canción: tempo, dónde empieza el primer compás (a0) y la energía de cada compás, para
escoger dónde entra el drop, dónde está el quiebre y dónde acaba (como en Rofer v2). Con librosa.

Uso: compases.py <trabajo> <canción>. Deja trabajo/compases.json y lo enseña en una tabla.
"""
import os
import sys

import numpy as np

from comun import Reloj, escribir_json, leer_audio, trabajo

T = trabajo()
if len(sys.argv) < 3:
    sys.exit("Falta la canción: compases.py <trabajo> <canción>")
ruta = os.path.abspath(sys.argv[2])
r = Reloj("compases")
import librosa  # noqa: E402

SR = 22050
y = leer_audio(ruta, sr=SR).astype(np.float32)
dur = len(y) / SR
tempo, beats = librosa.beat.beat_track(y=y, sr=SR, units="time")
tempo = float(np.atleast_1d(tempo)[0])
beats = np.asarray(beats, dtype=float)
if len(beats) < 8:
    sys.exit("No encuentro el pulso de esta canción (¿es muy libre o muy corta?).")
pulso = float(np.median(np.diff(beats)))
# El pulso, afinado con todos los golpes: recta por mínimos cuadrados de golpe k → tiempo.
k = np.round((beats - beats[0]) / pulso)
pulso, b0 = np.polyfit(k, beats, 1)
# El TIEMPO FUERTE: de las cuatro fases posibles, la que tiene más graves (bombo) en sus golpes.
onset = librosa.onset.onset_strength(y=y, sr=SR, fmax=200, n_mels=32)
t_on = librosa.times_like(onset, sr=SR)
golpes = b0 + pulso * np.arange(int((dur - b0) / pulso) + 1)
fuerza = np.interp(golpes, t_on, onset)
fase = int(np.argmax([fuerza[f::4].mean() for f in range(4)]))
compas = 4 * pulso
a0 = (b0 + fase * pulso) % compas
n = int((dur - a0) / compas)
tabla = []
for m in range(n + 1):
    t0 = a0 + m * compas
    seg = y[int(t0 * SR): int(min(dur, t0 + compas) * SR)]
    e = float(20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)) if len(seg) else -90.0
    tabla.append({"m": m, "t": round(t0, 3), "db": round(e, 1)})
escribir_json(os.path.join(T, "compases.json"), {"cancion": ruta, "duracion": round(dur, 3), "bpm": round(60 / pulso, 2),
                                                "a0": round(a0, 4), "pulso": round(pulso, 5), "compases": tabla})
alto = max(c["db"] for c in tabla)
print(f"{os.path.basename(ruta)}: {60 / pulso:.2f} BPM · a0 {a0:.4f} s · pulso {pulso:.5f} s · compás {compas:.3f} s · {dur:.1f} s")
print("compás   empieza   energía")
for c in tabla:
    barra = "#" * max(0, int(round((c["db"] - alto + 30) / 1.5)))
    print(f"{c['m']:>6}  {c['t']:>8.2f}  {c['db']:>6.1f}  {barra}")
r.fin()
