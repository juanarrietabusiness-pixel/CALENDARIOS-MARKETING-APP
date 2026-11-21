"""Los ANCHOS MEDIDOS de los textos de la escena, con las letras de verdad que pinta Remotion (las de la marca o Anton e
Inter Tight): la suma de los avances de cada carácter (tabla hmtx) en em, y la altura de las mayúsculas (OS/2). Con
esto la escena coloca las piezas (el trío del mismo tamaño y dentro de su columna) y la revisión de oficio comprueba que
ningún texto se monte sobre otro ni se salga del cuadro. El interletraje (kerning) no se suma: casi siempre ACORTA, así
que la medida queda un pelo larga (del lado seguro).

Lee trabajo/letras_pedido.json: { fuentes: { rol: archivo }, textos: { rol: [texto, …] } } y escribe trabajo/anchos.json:
{ rol: { "_mayus": em, texto: em } } (junta lo que ya había). Uso: letras.py <trabajo>
"""
import os
import sys

from fontTools.ttLib import TTFont

from comun import escribir_json, leer_json, trabajo

T = trabajo()
pedido = leer_json(os.path.join(T, "letras_pedido.json"))
salida = leer_json(os.path.join(T, "anchos.json"), {})
for rol, archivo in pedido["fuentes"].items():
    if not archivo or not os.path.exists(archivo):
        print(f"letras: falta el archivo de la letra «{rol}» ({archivo}): las medidas de ese papel quedan aproximadas", flush=True)
        continue
    f = TTFont(archivo, lazy=True)
    em = f["head"].unitsPerEm
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    os2 = f["OS/2"] if "OS/2" in f else None
    mayus = (getattr(os2, "sCapHeight", 0) or 0) / em if os2 else 0
    if not mayus:
        # Sin el dato, la altura de la «H».
        g = cmap.get(ord("H"))
        mayus = (f["glyf"][g].yMax / em) if g and "glyf" in f else 0.72
    clave = f"{rol}|{os.path.basename(archivo)}"
    tabla = salida.setdefault(clave, {"_mayus": round(mayus, 4)})
    sin = hmtx[cmap.get(ord("?"), ".notdef")][0] if ord("?") in cmap else em * 0.5
    for texto in pedido["textos"].get(rol, []):
        if texto in tabla:
            continue
        tabla[texto] = round(sum(hmtx[cmap[ord(c)]][0] if ord(c) in cmap else sin for c in texto) / em, 4)
escribir_json(os.path.join(T, "anchos.json"), salida)
sys.exit(0)
