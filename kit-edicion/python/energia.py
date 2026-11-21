"""La ENERGÍA del audio de cada clip: dB RMS de cada ventana de 10 ms, de la voz LIMPIA (paso alto + rnnoise, la misma
limpieza que la voz final): con el ruido de una obra debajo, los silencios del audio crudo no bajan lo bastante y el
corte deja pausas largas (medido al rehacer Rofer v2, 2026-11-21).

Con esto y las palabras, src/lib/corteEdicion.js decide dónde cortar (el punto más callado, los silencios relativos a la
voz). Reanudable por clip.
"""
import os

import numpy as np

from comun import KIT, SR, Reloj, escribir_json, leer_audio, leer_json, oficio, trabajo

T = trabajo()
clips = leer_json(os.path.join(T, "clips.json"))
salida = os.path.join(T, "energia")
os.makedirs(salida, exist_ok=True)
PASO = 0.01
V = oficio(T)["voz"]
RN = os.path.join(KIT, "modelos", "rnnoise.rnnn")
LIMPIA = f"highpass=f={V['pasoAltoHz']}," + (f"arnndn=m={RN}:mix={V['ruidoMezcla']}" if os.path.exists(RN) else "afftdn=nf=-25")
for c in clips["clips"]:
    ruta = os.path.join(salida, c["id"] + ".json")
    if os.path.exists(ruta):
        continue
    r = Reloj(f"energía {c['id']}")
    a = leer_audio(c["archivo"], filtro=LIMPIA)
    w = int(PASO * SR)
    n = len(a) // w
    rms = np.sqrt((a[: n * w].reshape(n, w) ** 2).mean(1))
    dbs = np.round(20 * np.log10(rms + 1e-9), 1)
    escribir_json(ruta, {"paso": PASO, "duracion": round(len(a) / SR, 3), "db": dbs.tolist()})
    r.fin(f"{n} ventanas")
