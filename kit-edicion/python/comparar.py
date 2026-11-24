"""LA COMPARACIÓN DE ESTILOS: los cuadros de muestra de cada estilo propuesto en una sola imagen, una fila por estilo
(con su letra y su nombre) y los mismos momentos en columnas (el texto que entra, la transición, el subtítulo y el
cierre), para que la persona escoja de un vistazo.

Uso: comparar.py <trabajo> <carpeta de estilos> <salida.jpg>   (la carpeta tiene estilos.json y una subcarpeta por letra)
"""
import glob
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

from comun import trabajo

trabajo()
carpeta, salida = sys.argv[2], sys.argv[3]
lista = json.load(open(os.path.join(carpeta, "estilos.json"), encoding="utf-8"))
W, H, CAB, ESP = 324, 576, 64, 12
filas = []
for e in lista:
    cuadros = sorted(glob.glob(os.path.join(carpeta, e["letra"], "muestra-*.jpg")))
    if cuadros:
        filas.append((e, cuadros))
if not filas:
    sys.exit("comparar: no hay muestras que juntar")
columnas = max(len(c) for _, c in filas)
lienzo = Image.new("RGB", (ESP + columnas * (W + ESP), ESP + len(filas) * (CAB + H + ESP)), (18, 18, 22))
dib = ImageDraw.Draw(lienzo)


def letra_de(tam):
    for ruta in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, tam)
    return ImageFont.load_default()


grande, chica = letra_de(30), letra_de(17)
for i, (e, cuadros) in enumerate(filas):
    y = ESP + i * (CAB + H + ESP)
    dib.text((ESP, y + 4), f"{e['letra']} · {e.get('nombre', '')}", fill=(255, 255, 255), font=grande)
    dib.text((ESP, y + 40), e.get("resumen", ""), fill=(180, 180, 190), font=chica)
    for j, ruta in enumerate(cuadros):
        im = Image.open(ruta).convert("RGB").resize((W, H))
        lienzo.paste(im, (ESP + j * (W + ESP), y + CAB))
lienzo.save(salida, quality=88)
print(salida, flush=True)
