"""La MEZCLA: voz + música con ducking + efectos del CATÁLOGO del calendario alineados a su pico, y el máster a −14 LUFS
con pico −1,2 dBTP en el archivo FINAL (dos pasadas de loudnorm, apuntando 0,5 dB más abajo porque el AAC sube el pico). Lo mismo que mezcla.py de Rofer v2, con los números de oficio.json:

  · la canción se lleva a −14 dB RMS y encima se le pone la ganancia del momento: bajo la voz −18 (desde el llamado,
    −15), en los huecos sin voz −13 y en el cierre −6;
  · el ducking empieza ~150 ms ANTES de la voz (mira adelante), baja en 30 ms y vuelve en 0,4 s;
  · en los golpes grandes («apartar») la música se aparta un instante.

Lee trabajo/mezcla_plan.json (lo escribe `node kit.mjs mezcla`) y deja trabajo/mezcla.wav y trabajo/mezcla_informe.json
(la voz frente a la música en cada tramo, y la sonoridad final).
"""
import json
import os
import subprocess

import numpy as np

from comun import SR, Reloj, db, escribir_json, escribir_wav, ffmpeg, leer_audio, leer_json, medir_sonoridad, oficio, trabajo

T = trabajo()
O = oficio(T)
M, D, MA = O["musica"], O["ducking"], O["master"]
P = leer_json(os.path.join(T, "mezcla_plan.json"))
r = Reloj("mezcla")
N = int(round(P["duracion"] * SR))
VF = P["vozFin"]


def ajustar(x, n):
    y = np.zeros((n,) + x.shape[1:])
    y[: min(n, len(x))] = x[:n]
    return y


v = ajustar(leer_audio(os.path.join(T, "voz.wav")), N)
hay_musica = os.path.exists(os.path.join(T, "musica.wav")) and P.get("conMusica", True)
m = ajustar(leer_audio(os.path.join(T, "musica.wav"), canales=2), N) if hay_musica else np.zeros((N, 2))
if hay_musica:
    m /= np.sqrt((m ** 2).mean()) / db(M["normalizar"])

# ---- efectos
fx = np.zeros((N, 2))
cache = {}
for e in P.get("efectos", []):
    if e["ruta"] not in cache:
        x = leer_audio(e["ruta"], canales=2)
        cache[e["ruta"]] = x / (np.abs(x).max() + 1e-9)
    s = cache[e["ruta"]]
    t0 = e["t"] - (e.get("pico", 0) if e.get("alinear") == "pico" else 0)
    i = int(round(t0 * SR))
    a, b = max(0, i), min(N, i + len(s))
    if b > a:
        fx[a:b] += db(e["db"]) * s[a - i:b - i]

# ---- ducking: cuándo habla (ventanas de 50 ms), mirando ~150 ms adelante
w = int(0.05 * SR)
rms = np.sqrt(np.convolve(v ** 2, np.ones(w) / w, "same"))
act = (rms > db(D["umbralVoz"])).astype(float)
ant = int(D["anticipacion"] * SR)
subidas = np.flatnonzero(np.diff(act) > 0) + 1
for s in subidas:
    act[max(0, s - ant):s] = 1.0
g = np.zeros(N)
cur = 0.0
aa, ar = np.exp(-1 / (D["ataque"] * SR)), np.exp(-1 / (D["liberacion"] * SR))
for i in range(0, N, 64):
    tg = act[i]
    co = aa if tg > cur else ar
    cur = tg + (cur - tg) * co ** 64
    g[i:i + 64] = cur
t = np.arange(N) / SR
llamado = P.get("llamado")
debajo = np.where(t < llamado, M["bajoVoz"], M["llamado"]) if llamado is not None else np.full(N, float(M["bajoVoz"]))
libre = np.where(t < VF, M["libre"], M["cierre"])
mg = db(libre + (debajo - libre) * g)
for t0 in P.get("apartar", []):
    i0, i1 = max(0, int((t0 - 0.1) * SR)), min(N, int((t0 + 0.4) * SR))
    if i1 > i0:
        mg[i0:i1] *= np.interp(np.arange(i1 - i0), [0, (i1 - i0) * 0.25, i1 - i0], [1, M["apartar"], 1])

musica = m * mg[:, None]
mix = v[:, None] * np.ones((1, 2)) + musica + fx
fo = int(0.35 * SR)
mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
mix /= max(1.0, np.abs(mix).max() / 0.98)


# ---- informe: la voz frente a la música en cada tramo (ventanas con voz; la música con su ganancia)
def rms_db(x):
    return float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)) if len(x) else None


informe = []
for tr in P.get("tramos", []):
    i0, i1 = int(tr["desde"] * SR), int(tr["hasta"] * SR)
    hab = rms[i0:i1] > db(D["umbralVoz"])  # donde HABLA de verdad (sin la anticipación del ducking)
    vv = rms_db(v[i0:i1][hab]) if hab.any() else None
    mm = rms_db(musica[i0:i1].mean(1)[hab] if hab.any() else musica[i0:i1].mean(1)) if hay_musica else None
    informe.append({"tramo": tr["nombre"], "desde": tr["desde"], "hasta": tr["hasta"], "voz": None if vv is None else round(vv, 1),
                    "musica": None if mm is None else round(mm, 1), "voz_sobre_musica": round(vv - mm, 1) if vv is not None and mm is not None else None})

pre = os.path.join(T, "mezcla_pre.wav")
escribir_wav(pre, mix)
cadena = "acompressor=threshold=-18dB:ratio=2:attack=10:release=150,alimiter=limit=0.89:level=false"
objetivo = f"I={MA['lufs']}:TP={MA['picoDbtp'] - MA.get('margenAac', 0)}:LRA={MA['lra']}"  # margen: el AAC sube el pico
medida = subprocess.run(["ffmpeg", "-nostats", "-i", pre, "-af", f"{cadena},loudnorm={objetivo}:print_format=json", "-f", "null", "-"],
                        capture_output=True, text=True).stderr
j = json.loads(medida[medida.rindex("{"): medida.rindex("}") + 1])
segunda = (f"{cadena},loudnorm={objetivo}:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
           f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
salida = os.path.join(T, "mezcla.wav")
ffmpeg("-i", pre, "-af", segunda, "-ar", str(SR), salida)
lufs, pico = medir_sonoridad(salida)
escribir_json(os.path.join(T, "mezcla_informe.json"), {"lufs": lufs, "pico": pico, "tramos": informe, "efectos": len(P.get("efectos", []))})
for x in informe:
    if x["voz"] is None:
        print(f"  {x['tramo']:<14} {x['desde']:6.2f}–{x['hasta']:6.2f}  sin voz · música {x['musica']} dB")
    else:
        print(f"  {x['tramo']:<14} {x['desde']:6.2f}–{x['hasta']:6.2f}  voz {x['voz']} dB · música {x['musica']} dB · la voz {x['voz_sobre_musica']} dB por encima")
r.fin(f"{lufs} LUFS · pico {pico} dBTP · {len(P.get('efectos', []))} efectos")
