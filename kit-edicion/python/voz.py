"""La VOZ montada: cada clip limpio (paso alto, reducción de ruido, presencia si se pidió, atempo), al mismo nivel de
habla, pegado pieza a pieza con fundidos cortos, los realces de palabras susurradas y el bus (compresión suave y
de-esser). Lo mismo que voz.py de Rofer v2, con los números de oficio.json.

Lee trabajo/voz_plan.json (lo escribe `node kit.mjs voz`): { duracion, piezas, clips: {id: {archivo, vel, ganancia,
presencia}}, realces: [[desde, hasta, db]] }. Deja trabajo/voz.wav.
"""
import os

import numpy as np

from comun import KIT, SR, Reloj, db, escribir_wav, ffmpeg, leer_audio, leer_json, oficio, trabajo, tramo

T = trabajo()
O = oficio(T)
V = O["voz"]
P = leer_json(os.path.join(T, "voz_plan.json"))
r = Reloj("voz")

RN = os.path.join(KIT, "modelos", "rnnoise.rnnn")
if os.path.exists(RN):
    LIMPIA = f"highpass=f={V['pasoAltoHz']},arnndn=m={RN}:mix={V['ruidoMezcla']}"
else:
    print("OJO: falta el modelo de rnnoise (instalar.sh): limpio con afftdn, que es peor.")
    LIMPIA = f"highpass=f={V['pasoAltoHz']},afftdn=nf=-25"
RES = O["rescate"]
PRESENCIA = f",equalizer=f={RES['presenciaHz']}:t=q:w=1:g={RES['presenciaDb']},equalizer=f=180:t=q:w=1:g=1.5"


def nivel_habla(x):
    """La mediana del nivel de las ventanas de 50 ms con voz (las que están a menos de 22 dB del máximo)."""
    w = int(0.05 * SR)
    n = len(x) // w
    if n == 0:
        return -60.0
    niveles = 20 * np.log10(np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(1)) + 1e-9)
    return float(np.median(niveles[niveles > niveles.max() - 22]))


limpio, ganancia = {}, {}
for cid, c in P["clips"].items():
    vel = c.get("vel", 1) or 1
    filtro = LIMPIA + (PRESENCIA if c.get("presencia") else "") + (f",atempo={vel}" if vel != 1 else "")
    x = leer_audio(c["archivo"], filtro=filtro)
    trozos = [tramo(x, int(p["src0"] / vel * SR), int((p["src1"] - p["src0"]) / vel * SR)) for p in P["piezas"] if p["clip"] == cid]
    lvl = nivel_habla(np.concatenate(trozos)) if trozos else -60.0
    limpio[cid] = (x, vel)
    ganancia[cid] = V["nivel"] + float(c.get("ganancia", 0)) - lvl
    print(f"  {cid}: habla a {lvl:.1f} dB → ganancia {ganancia[cid]:+.1f} dB")

N = int(round(P["duracion"] * SR))
out = np.zeros(N)
F = int(V["fundido"] * SR)
for p in P["piezas"]:
    x, vel = limpio[p["clip"]]
    a = int(round(p["src0"] / vel * SR))
    n = int(round((p["out1"] - p["out0"]) * SR))
    s = tramo(x, a, n) * db(ganancia[p["clip"]])
    if len(s) > 2 * F:
        s[:F] *= np.linspace(0, 1, F)
        s[-F:] *= np.linspace(1, 0, F)
    i = int(round(p["out0"] * SR))
    out[i:i + len(s)] += s[: max(0, N - i)]

for a, b, g in P.get("realces", []):
    i0, i1 = int(a * SR), int(b * SR)
    if i1 <= i0:
        continue
    rampa = min(int(0.03 * SR), (i1 - i0) // 2)
    e = np.ones(i1 - i0)
    if rampa:
        e[:rampa] = np.linspace(0, 1, rampa)
        e[-rampa:] = np.linspace(1, 0, rampa)
    out[i0:i1] *= 10 ** (g * e / 20)

cruda = os.path.join(T, "voz_cruda.wav")
escribir_wav(cruda, out)
C = V["compresor"]
ffmpeg("-i", cruda, "-af",
       f"acompressor=threshold={C['umbral']}dB:ratio={C['razon']}:attack={C['ataqueMs']}:release={C['liberacionMs']}:makeup={C['ganancia']}dB,"
       f"deesser=i={V['deesser']}", "-ar", str(SR), "-ac", "1", os.path.join(T, "voz.wav"))
r.fin(f"{P['duracion']:.2f} s")
