"""HOJA DE CONTACTOS de un video: un cuadro cada N segundos (1,7 por defecto) en una sola imagen, con su segundo, para
mirar de un vistazo los solapes, lo que tapa la cara o se sale de la franja segura. También sirve con los clips en bruto
(diagnóstico: el tipo de video).

Uso: hoja.py <trabajo> <video> [cada_segundos] [salida.jpg] [desde] [hasta]
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

from comun import Reloj, oficio, trabajo

T = trabajo()
if len(sys.argv) < 3:
    sys.exit("Uso: hoja.py <trabajo> <video> [cada] [salida] [desde] [hasta]")
video = sys.argv[2]
cada = float(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else oficio(T)["hoja"]["cadaSegundos"]
salida = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else os.path.join(T, "..", "salida", f"hoja-{os.path.splitext(os.path.basename(video))[0]}.jpg")
desde = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
hasta = float(sys.argv[6]) if len(sys.argv) > 6 else None
os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
r = Reloj("hoja")
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                           capture_output=True, text=True, check=True).stdout.strip())
fin = min(dur, hasta) if hasta else dur
tiempos = []
x = desde
while x < fin - 0.05:
    tiempos.append(round(x, 2))
    x += cada
ANCHO = 270
cuadros = []
with tempfile.TemporaryDirectory() as tmp:
    for k, t in enumerate(tiempos):
        ruta = os.path.join(tmp, f"{k:04d}.jpg")
        subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", video, "-frames:v", "1", "-vf", f"scale={ANCHO}:-2", "-q:v", "3", ruta], check=True)
        if os.path.exists(ruta):
            cuadros.append((t, Image.open(ruta).convert("RGB")))
if not cuadros:
    sys.exit("No salió ningún cuadro.")
alto = cuadros[0][1].height
cols = 6 if alto > ANCHO else 4
filas = (len(cuadros) + cols - 1) // cols
hoja = Image.new("RGB", (cols * ANCHO, filas * (alto + 22)), (16, 16, 16))
d = ImageDraw.Draw(hoja)
for k, (t, im) in enumerate(cuadros):
    x, y = (k % cols) * ANCHO, (k // cols) * (alto + 22)
    hoja.paste(im.resize((ANCHO, alto)), (x, y + 22))
    d.text((x + 6, y + 5), f"{t:.1f} s", fill=(255, 255, 255))
hoja.save(salida, quality=85)
r.fin(f"{len(cuadros)} cuadros → {os.path.abspath(salida)}")
