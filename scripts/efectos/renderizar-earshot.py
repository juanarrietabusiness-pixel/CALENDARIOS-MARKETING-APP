# Renderiza el banco de earshot (sin modelos) a WAV 48 kHz float, mono compatible, y guarda la meta de cada uno.
import json, sys, time
from pathlib import Path
import numpy as np
import soundfile as sf
from earshot.forge import bank
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
lista = json.load(open(sys.argv[2]))["sounds"]
t0 = time.time(); metas = []
for s in lista:
    i = s["id"]; t = time.time()
    try:
        y, meta = bank.render(i)
        y = np.asarray(y, np.float64)
        canal = "mono"
        if y.ndim == 2:
            mid = y.mean(axis=1)
            rms = lambda v: float(np.sqrt(np.mean(v ** 2)) + 1e-12)
            fuerte = y[:, int(np.argmax([rms(y[:, 0]), rms(y[:, 1])]))]
            # en un teléfono suena en mono: si la suma pierde más de 3 dB, va el canal más fuerte
            if 20 * np.log10(rms(mid) / rms(fuerte)) < -3: y, canal = fuerte, "canal"
            else: y, canal = mid, "mid"
        y = y / (np.abs(y).max() + 1e-12) * 10 ** (-1 / 20)
        p = out / (i.replace("/", "__") + ".wav")
        sf.write(p, y.astype(np.float32), meta["sr"], subtype="FLOAT")
        ch = meta.get("checks") or {}
        metas.append({"id": i, "ok": bool(ch.get("ok", True)), "avisos": [w.get("code") for w in ch.get("warnings", [])],
                      "canal": canal, "seg": round(time.time() - t, 2), "wav": p.name})
    except Exception as e:
        metas.append({"id": i, "error": repr(e)[:300]})
    print(i, metas[-1].get("ok"), metas[-1].get("seg"), metas[-1].get("error", ""), flush=True)
json.dump(metas, open(out / "render.json", "w"), indent=1)
print("FIN", len(metas), "s", round(time.time() - t0, 1), flush=True)
