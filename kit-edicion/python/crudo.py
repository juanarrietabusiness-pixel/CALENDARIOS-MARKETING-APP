"""El CORTE EN CRUDO: el video montado tal cual (sin cámara virtual ni gráficos: eso es la Fase 2b) con la mezcla, a
1080×1920 y 30 cuadros. Sirve para que la persona apruebe el corte y el sonido antes de lo largo.

Lee trabajo/crudo_plan.json (lo escribe `node kit.mjs crudo`): { fps, cierre, piezas, clips: {id: archivo} }.
Deja salida/crudo.mp4.
"""
import os

from comun import Reloj, ffmpeg, leer_json, trabajo

T = trabajo()
P = leer_json(os.path.join(T, "crudo_plan.json"))
r = Reloj("corte en crudo")
fps = P["fps"]
entradas, filtros, etiquetas = [], [], []
indice = {}
for cid, archivo in P["clips"].items():
    indice[cid] = len(indice)
    entradas += ["-i", archivo]
for k, p in enumerate(P["piezas"]):
    i = indice[p["clip"]]
    filtros.append(
        f"[{i}:v]trim=start={p['src0']}:end={p['src1']},setpts=(PTS-STARTPTS)/{p['vel']},"
        f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps={fps},setsar=1[v{k}]")
    etiquetas.append(f"[v{k}]")
filtros.append(f"color=c=black:s=1080x1920:r={fps}:d={P['cierre']}[cierre]")
etiquetas.append("[cierre]")
filtros.append(f"{''.join(etiquetas)}concat=n={len(etiquetas)}:v=1:a=0[v]")
salida = os.path.join(T, "..", "salida")
os.makedirs(salida, exist_ok=True)
destino = os.path.abspath(os.path.join(salida, "crudo.mp4"))
ffmpeg(*entradas, "-i", os.path.join(T, "mezcla.wav"), "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", f"{len(indice)}:a",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
       "-shortest", "-movflags", "+faststart", destino)
r.fin(destino)
