"""Los CUADROS que pinta Remotion: cada cuadro de salida etalonado (cam/NNNNN.jpg) y la persona recortada encima
(p/NNNNN.webp, RGBA: el mismo cuadro con el alfa de persona.py). Lo mismo que extract.py y persona.py de Rofer v2.

El etalonado: un poco de nitidez, contraste y saturación; un clip que la cámara acerca mucho (persona lejos) lleva más
nitidez (en v2, 1450). REANUDABLE: lo que ya está no se repite. Con `solo` (cuadros de salida separados por comas) hace
sólo esos: para los cuadros de muestra de la propuesta corta, sin esperar al video entero.

Lee trabajo/cuadros_plan.json: { fps, ancho, alto, fuente: [[clip, cuadro] | null por cuadro de salida], clips: {id:
archivo}, nitidez: [ids de clip], destino }. Uso: cuadros.py <trabajo> [solo] [presupuesto_s]
"""
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from PIL import Image

from comun import leer_json, trabajo

T = trabajo()
P = leer_json(os.path.join(T, "cuadros_plan.json"))
SOLO = {int(x) for x in sys.argv[2].split(",") if x.strip()} if len(sys.argv) > 2 and sys.argv[2] else None
PRESUPUESTO = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
W, H = P.get("ancho", 1080), P.get("alto", 1920)
GRADO = "unsharp=5:5:0.55:5:5:0,eq=contrast=1.07:saturation=1.07:brightness=-0.005"
GRADO_LEJOS = "unsharp=7:7:0.95:5:5:0,eq=contrast=1.08:saturation=1.08:brightness=-0.005"
CAM = os.path.join(P["destino"], "cam")
PER = os.path.join(P["destino"], "p")
os.makedirs(CAM, exist_ok=True)
os.makedirs(PER, exist_ok=True)
inicio = time.time()

# Con `conPersona` (persona.soloDetras), la persona recortada sólo en esos cuadros de salida.
CON_PERSONA = set(P["conPersona"]) if P.get("conPersona") is not None else None
lleva_persona = lambda f: CON_PERSONA is None or f in CON_PERSONA

# Qué cuadros de origen hacen falta, por clip → los de salida que salen de cada uno.
necesita = {}
for f, x in enumerate(P["fuente"]):
    if not x or (SOLO is not None and f not in SOLO):
        continue
    if os.path.exists(os.path.join(CAM, f"{f:05d}.jpg")) and (not lleva_persona(f) or os.path.exists(os.path.join(PER, f"{f:05d}.webp"))):
        continue
    necesita.setdefault(x[0], {}).setdefault(x[1], []).append(f)

# Codificar JPEG y sobre todo WebP con transparencia es lo que más tarda (en Rofer, 9 min de 1.101 cuadros en serie):
# se reparte entre hilos (Pillow y OpenCV sueltan el GIL al codificar).
pool = ThreadPoolExecutor(max_workers=os.cpu_count() or 2)
pendientes = []


def guardar(im, alfa, fs):
    """Escribe el cuadro etalonado y, si toca, la persona en RGBA, para cada cuadro de salida `fs`. → (hechos, sin_alfa)."""
    jpg = cv2.imencode(".jpg", im[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 93])[1].tobytes()
    h = s = 0
    webp = None
    for f in fs:
        with open(os.path.join(CAM, f"{f:05d}.jpg"), "wb") as fh:
            fh.write(jpg)
        if not lleva_persona(f):
            continue
        if alfa is None:
            s += 1
            continue
        tmp = os.path.join(PER, f"{f:05d}.tmp.webp")
        if webp is None:
            Image.fromarray(np.dstack([im, cv2.GaussianBlur(alfa, (3, 3), 0)]), "RGBA").save(tmp, "WEBP", quality=90, method=3)
            webp = os.path.join(PER, f"{f:05d}.webp")
        else:
            with open(webp, "rb") as a, open(tmp, "wb") as b:
                b.write(a.read())
        os.replace(tmp, os.path.join(PER, f"{f:05d}.webp"))
        h += 1
    return h, s


hechos = faltan = sin_alfa = 0
for clip in sorted(necesita):
    quiere = necesita[clip]
    if time.time() - inicio > PRESUPUESTO:
        faltan += sum(len(v) for v in quiere.values())
        continue
    a, b = min(quiere), max(quiere)
    grado = GRADO_LEJOS if clip in P.get("nitidez", []) else GRADO
    # Con pocos cuadros (las muestras) se busca cada uno; con muchos, se lee el tramo de corrido.
    tramos = [[n, n] for n in sorted(quiere)] if len(quiere) <= 6 else [[a, b]]
    for x0, x1 in tramos:
        proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", P["clips"][clip], "-vf",
                                 f"scale={W}:{H}:flags=lanczos,fps={P['fps']},select=between(n\\,{x0}\\,{x1}),{grado}", "-vsync", "0",
                                 "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        n = x0
        while True:
            buf = proc.stdout.read(W * H * 3)
            if len(buf) < W * H * 3:
                break
            if n in quiere:
                im = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()
                alfa = cv2.imread(os.path.join(T, "alfa", clip, f"{n:05d}.png"), 0)
                pendientes.append(pool.submit(guardar, im, alfa, quiere[n]))
                # Que la cola no crezca sin tope en memoria (cada cuadro son 6 MB).
                if len(pendientes) > 4 * (os.cpu_count() or 2):
                    h, s_ = pendientes.pop(0).result()
                    hechos += h
                    sin_alfa += s_
            n += 1
        proc.wait()
for fut in pendientes:
    h, s_ = fut.result()
    hechos += h
    sin_alfa += s_
pool.shutdown()
total = time.time() - inicio
print(f"cuadros: {hechos} en {total:.0f} s" + (f" · {sin_alfa} sin recorte (corre persona)" if sin_alfa else "") + (f" · FALTAN {faltan}" if faltan else ""), flush=True)
sys.exit(3 if faltan or sin_alfa else 0)
