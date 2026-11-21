"""La GEOMETRÍA de la persona sin el recorte a resolución completa: RVM resnet50 sobre el cuadro a 1/4 (270×480, ~16
veces menos trabajo) sólo para saber dónde está la cabeza (tope, centro, ancho) y los pies, que es lo que necesita la
cámara virtual. Con `persona.soloDetras` en el plan, el recorte bueno (persona.py) se hace sólo donde hay un texto detrás
de la persona, y esto da la geometría del resto. REANUDABLE por clip.

Lee trabajo/persona_plan.json (los tramos de origen de TODO el montaje). Uso: geometria.py <trabajo> [presupuesto_s]
"""
import os
import subprocess
import sys
import time

import cv2
import numpy as np

from comun import KIT, escribir_json, leer_json, trabajo

T = trabajo()
P = leer_json(os.path.join(T, "persona_plan.json"))
PRESUPUESTO = float(sys.argv[2]) if len(sys.argv) > 2 else 1e9
W, H = 270, 480
MODELO = os.path.join(KIT, "modelos", "rvm_resnet50.onnx")
inicio = time.time()

import onnxruntime as ort  # noqa: E402

so = ort.SessionOptions()
so.intra_op_num_threads = os.cpu_count() or 2
sesion = ort.InferenceSession(MODELO, so, providers=["CPUExecutionProvider"])
faltan = 0
for clip, desde, hasta in P["tramos_todos"]:
    ruta = os.path.join(T, "geometria", f"{clip}.json")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    geo = leer_json(ruta, {})
    if all(str(n) in geo for n in range(desde, hasta + 1)):
        continue
    if time.time() - inicio > PRESUPUESTO:
        faltan += 1
        continue
    a = max(0, desde - 10)
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", P["clips"][clip], "-vf",
                             f"scale={W}:{H}:flags=area,fps=30,select=between(n\\,{a}\\,{hasta})", "-vsync", "0",
                             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
    n = a
    while True:
        buf = proc.stdout.read(W * H * 3)
        if len(buf) < W * H * 3:
            break
        x = (np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.float32) / 255).transpose(2, 0, 1)[None]
        _, pha, *rec = sesion.run(None, {"src": x, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": np.array([1.0], np.float32)})
        if n >= desde and str(n) not in geo:
            m = pha[0, 0] > 0.5
            filas = np.where(m.sum(1) > 2)[0]
            if len(filas):
                top = int(filas[0])
                ys, xs = np.where(m[top:top + 40])
                _, bx = np.where(m[top:top + 100])
                geo[str(n)] = {"top": top * 4, "hx": round(float(xs.mean() * 4), 1), "hw": int((xs.max() - xs.min() + 1) * 4),
                               "cx": round(float(bx.mean() * 4), 1), "bot": int(filas[-1] * 4), "rapida": True}
        n += 1
    proc.wait()
    escribir_json(ruta, geo)
print(f"geometría: {time.time() - inicio:.0f} s" + (f" · FALTAN {faltan} tramos" if faltan else " · completa"), flush=True)
sys.exit(3 if faltan else 0)
