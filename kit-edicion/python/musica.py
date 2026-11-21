"""La MÚSICA cortada al montaje: los tramos de la canción (ya comprobados en compás por src/lib/musicaEdicion.js) pegados
en el video con fundidos de 12 ms de igual potencia. Lo mismo que musica_suno.py de Rofer v2.

Lee trabajo/musica_plan.json (lo escribe `node kit.mjs musica`): { archivo, duracion, tramos: [{cancion0, cancion1,
video0}] }. Deja trabajo/musica.wav (estéreo).
"""
import os

import numpy as np

from comun import SR, Reloj, escribir_wav, leer_audio, leer_json, trabajo

T = trabajo()
P = leer_json(os.path.join(T, "musica_plan.json"))
r = Reloj("música")
x = leer_audio(P["archivo"], canales=2)
N = int(round(P["duracion"] * SR))
out = np.zeros((N + SR, 2))
XF = int(0.012 * SR)
tramos = P["tramos"]
for k, t in enumerate(tramos):
    a, b = int(round((t["cancion0"] - 0.012) * SR)), int(round((t["cancion1"] - 0.012) * SR))
    seg = x[max(0, a):b].copy()
    if len(seg) <= 2 * XF:
        continue
    if k > 0:
        seg[:XF] *= np.sqrt(np.linspace(0, 1, XF))[:, None]
    if k < len(tramos) - 1:
        seg[-XF:] *= np.sqrt(np.linspace(1, 0, XF))[:, None]
    i = int(round((t["video0"] - 0.012) * SR))
    i0 = max(0, i)
    trozo = seg[i0 - i:]
    fin = min(len(out), i0 + len(trozo))
    out[i0:fin] += trozo[: fin - i0]
    print(f"  {k + 1}: canción {t['cancion0']:6.2f}–{t['cancion1']:6.2f} → video {t['video0']:6.2f}")
out = out[:N]
f = int(0.01 * SR)
out[:f] *= np.linspace(0, 1, f)[:, None]
escribir_wav(os.path.join(T, "musica.wav"), out)
r.fin(f"{N / SR:.2f} s")
