"""El LOGO sin márgenes: el del kit de la marca suele venir con mucho blanco (o transparente) alrededor y en la tarjeta
del logo y el cierre salía pequeño (Rofer, 2026-11-21: v2 usó un PNG ya recortado). Recorta hasta lo que no es fondo
(el color de la esquina, o lo transparente) con un 4 % de aire. Uso: logo.py <trabajo> <entrada> <salida.png>"""
import sys

import numpy as np
from PIL import Image

_, _, entrada, salida = sys.argv[:4]
im = Image.open(entrada).convert("RGBA")
a = np.array(im).astype(np.int16)
if (a[..., 3] < 250).mean() > 0.05:
    marca = a[..., 3] > 8
else:
    fondo = a[0, 0, :3]
    marca = np.abs(a[..., :3] - fondo).max(-1) > 18
ys, xs = np.where(marca)
if len(xs):
    aire = int(0.04 * max(xs.max() - xs.min(), ys.max() - ys.min()))
    caja = (max(0, xs.min() - aire), max(0, ys.min() - aire), min(im.width, xs.max() + aire + 1), min(im.height, ys.max() + aire + 1))
    im = im.crop(caja)
im.save(salida)
print(f"logo: {im.width}×{im.height} (de {entrada})")
