"""El LOGO para las piezas. Dos usos:

  logo.py <trabajo> <entrada> <salida.png>             el logo SIN MÁRGENES: el del kit de la marca suele venir con mucho
                                                       blanco (o transparente) alrededor y en la tarjeta del logo y el
                                                       cierre salía pequeño (Rofer, 2026-11-21: v2 usó un PNG recortado).
  logo.py <trabajo> <entrada> <salida.png> --dibujo    sólo el DIBUJO del logo, aparte del nombre, y en BLANCO: la imagen
                                                       del trío (en Rofer v2 se recortó a mano la excavadora del logo y se
                                                       pasó a blanco). Si el logo no tiene un dibujo separable del nombre,
                                                       sale con código 4 y no escribe nada (el trío va sin imagen).

El fondo: lo transparente, o el color de la esquina. El dibujo: se quitan las rayas finas de lado a lado (la línea bajo la
excavadora), se parte el logo por su hueco vacío más grande (en horizontal o en vertical) y se queda la parte cuya forma
más grande pesa más: las letras son muchas formas pequeñas; un dibujo, una grande.
"""
import sys

import cv2
import numpy as np
from PIL import Image

_, _, entrada, salida = sys.argv[:4]
DIBUJO = "--dibujo" in sys.argv[4:]
im = Image.open(entrada).convert("RGBA")
a = np.array(im).astype(np.int16)
transparente = (a[..., 3] < 250).mean() > 0.05
if transparente:
    marca = a[..., 3] > 8
    alfa = a[..., 3].astype(np.uint8)
else:
    fondo = a[0, 0, :3]
    dist = np.abs(a[..., :3] - fondo).max(-1)
    marca = dist > 18
    # Un alfa suave desde la distancia al fondo (el JPG tiene bordes mezclados con el blanco).
    alfa = np.clip((dist.astype(np.float32) - 10) * 255 / 60, 0, 255).astype(np.uint8)


def caja(m):
    ys, xs = np.where(m)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None


if not DIBUJO:
    c = caja(marca)
    if c:
        aire = int(0.04 * max(c[2] - c[0], c[3] - c[1]))
        im = im.crop((max(0, c[0] - aire), max(0, c[1] - aire), min(im.width, c[2] + aire), min(im.height, c[3] + aire)))
    im.save(salida)
    print(f"logo: {im.width}×{im.height} (de {entrada})")
    sys.exit(0)

# ---------------------------------------------------------------- el dibujo
c = caja(marca)
if not c:
    sys.exit(4)
m = marca[c[1]:c[3], c[0]:c[2]].copy()
H, W = m.shape
# Las rayas finas de lado a lado (filas casi llenas, de pocas filas seguidas): fuera.
llenas = m.mean(1) > 0.6
y = 0
while y < H:
    if llenas[y]:
        z = y
        while z < H and llenas[z]:
            z += 1
        if z - y <= max(3, int(0.03 * H)):
            m[max(0, y - 1):min(H, z + 1)] = False
        y = z
    else:
        y += 1


def bandas(perfil, minimo):
    """Los tramos con algo, separados por huecos vacíos de al menos `minimo`."""
    out, a0, vacio = [], None, 0
    for i, v in enumerate(perfil):
        if v:
            if a0 is None:
                a0 = i
            vacio = 0
            fin = i + 1
        elif a0 is not None:
            vacio += 1
            if vacio >= minimo:
                out.append((a0, fin))
                a0 = None
    if a0 is not None:
        out.append((a0, fin))
    return out


candidatas = []
for eje in (0, 1):
    perfil = m.any(1 - eje) if eje == 0 else m.any(0)
    tramos = bandas(perfil, max(4, int(0.02 * (H if eje == 0 else W))))
    if len(tramos) < 2:
        continue
    for a0, a1 in tramos:
        parte = np.zeros_like(m)
        if eje == 0:
            parte[a0:a1] = m[a0:a1]
        else:
            parte[:, a0:a1] = m[:, a0:a1]
        n, _, st, _ = cv2.connectedComponentsWithStats(parte.astype(np.uint8), connectivity=8)
        if n < 2:
            continue
        areas = st[1:, cv2.CC_STAT_AREA]
        candidatas.append((areas.max() / max(1, areas.sum()), areas.max(), parte))
if not candidatas:
    print("logo: no tiene un dibujo aparte del nombre", flush=True)
    sys.exit(4)
# La parte cuya forma más grande domina y es grande de verdad.
dominio, mayor, parte = max(candidatas, key=lambda x: (x[0] > 0.5, x[1]))
if dominio < 0.5 or mayor < 0.15 * m.sum():
    print("logo: no tiene un dibujo aparte del nombre", flush=True)
    sys.exit(4)
cp = caja(parte)
full = np.zeros(marca.shape, bool)
full[c[1]:c[3], c[0]:c[2]] = parte
x0, y0, x1, y1 = c[0] + cp[0], c[1] + cp[1], c[0] + cp[2], c[1] + cp[3]
# El dibujo en BLANCO, con el alfa del original (suave en los bordes) sólo donde está el dibujo (algo dilatado).
zona = cv2.dilate(full.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
alfa_d = np.where(zona, alfa, 0)[y0:y1, x0:x1]
blanco = np.dstack([np.full(alfa_d.shape, 255, np.uint8)] * 3 + [alfa_d])
Image.fromarray(blanco, "RGBA").save(salida)
print(f"logo: el dibujo, {x1 - x0}×{y1 - y0}, en blanco (de {entrada})")
