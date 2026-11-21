"""La PERSONA recortada: el alfa de cada cuadro de origen que usa el montaje (RobustVideoMatting resnet50, ONNX) y su
GEOMETRÍA (el tope real de la cabeza o del casco, su centro y su ancho, el centro del torso y los pies).

Por qué RVM: en la prueba de la Fase 2b (docs/propuesta-edicion-video-grabado.md §14) fue el único con el borde del casco
limpio con el texto gigante detrás, cerca y lejos; MediaPipe y SAM 2.1 dejaban halo. RVM es GPL-3.0: el kit no lo lleva
dentro, `instalar.sh` baja el modelo de su origen (GitHub, fijado por sha256).

RVM es RECURRENTE (recuerda los cuadros anteriores): cada tramo seguido de un clip se procesa en orden, empezando
`CALENTAR` cuadros antes. REANUDABLE: lo que ya está en trabajo/alfa/<clip>/ no se repite, y con `presupuesto` (segundos)
el paso se para a tiempo y dice cuánto falta (los procesos del chat mueren al responder).

Lee trabajo/persona_plan.json: { clips: {id: archivo}, tramos: [[clip, desde, hasta]] (cuadros de origen),
modelo, ancho, alto }. Uso: persona.py <trabajo> [presupuesto_s]
"""
import json
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
W, H = P.get("ancho", 1080), P.get("alto", 1920)
CALENTAR = 20
MODELO = os.path.join(KIT, "modelos", f"{P.get('modelo', 'rvm_resnet50')}.onnx")
if not os.path.exists(MODELO):
    sys.exit(f"Falta el modelo {os.path.basename(MODELO)}: vuelve a correr instalar.sh.")
inicio = time.time()


def geometria(a):
    """Del alfa (a 1/4): tope de la cabeza, su centro y su ancho (banda de 40 px reales... a 1/4), centro del torso, pies."""
    m = cv2.resize(a, (W // 4, H // 4), interpolation=cv2.INTER_AREA) > 128
    filas = np.where(m.sum(1) > 2)[0]
    if len(filas) == 0:
        return None
    top = int(filas[0])
    cabeza = m[top:top + 40]
    ys, xs = np.where(cabeza)
    banda = m[top:top + 100]
    _, bx = np.where(banda)
    return {"top": top * 4, "hx": round(float(xs.mean() * 4), 1), "hw": int((xs.max() - xs.min() + 1) * 4),
            "cx": round(float(bx.mean() * 4), 1), "bot": int(filas[-1] * 4)}


import onnxruntime as ort  # noqa: E402

so = ort.SessionOptions()
so.intra_op_num_threads = os.cpu_count() or 2
sesion = ort.InferenceSession(MODELO, so, providers=["CPUExecutionProvider"])
hechos = faltan = 0
for clip, desde, hasta in P["tramos"]:
    carpeta = os.path.join(T, "alfa", clip)
    os.makedirs(carpeta, exist_ok=True)
    ruta_geo = os.path.join(T, "geometria", f"{clip}.json")
    os.makedirs(os.path.dirname(ruta_geo), exist_ok=True)
    geo = leer_json(ruta_geo, {})
    pendientes = [n for n in range(desde, hasta + 1) if not os.path.exists(os.path.join(carpeta, f"{n:05d}.png"))]
    if not pendientes:
        continue
    if time.time() - inicio > PRESUPUESTO:
        faltan += len(pendientes)
        continue
    a = max(0, pendientes[0] - CALENTAR)
    b = hasta
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", P["clips"][clip], "-vf",
                             f"scale={W}:{H}:flags=lanczos,fps=30,select=between(n\\,{a}\\,{b})", "-vsync", "0",
                             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
    n = a
    cortado = False
    while True:
        buf = proc.stdout.read(W * H * 3)
        if len(buf) < W * H * 3:
            break
        x = (np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.float32) / 255).transpose(2, 0, 1)[None]
        _, pha, *rec = sesion.run(None, {"src": x, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3],
                                         "downsample_ratio": np.array([0.45], np.float32)})
        if n >= desde:
            alfa = (np.clip(pha[0, 0], 0, 1) * 255).astype(np.uint8)
            ruta = os.path.join(carpeta, f"{n:05d}.png")
            if not os.path.exists(ruta):
                cv2.imwrite(ruta + ".tmp.png", alfa)
                os.replace(ruta + ".tmp.png", ruta)
                hechos += 1
            g = geometria(alfa)
            if g:
                geo[str(n)] = g
        n += 1
        if time.time() - inicio > PRESUPUESTO:
            cortado = True
            break
    proc.kill()
    escribir_json(ruta_geo, geo)
    if cortado:
        faltan += len([m for m in range(desde, hasta + 1) if not os.path.exists(os.path.join(carpeta, f"{m:05d}.png"))])
total = time.time() - inicio
print(f"persona: {hechos} cuadros en {total:.0f} s ({total / max(1, hechos):.2f} s/cuadro)" + (f" · FALTAN {faltan}: vuelve a correrlo" if faltan else " · completo"), flush=True)
sys.exit(3 if faltan else 0)
