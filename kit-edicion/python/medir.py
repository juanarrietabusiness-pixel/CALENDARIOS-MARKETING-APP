"""Medir un archivo terminado (wav o mp4): LUFS integrados y pico verdadero. El pico se mide en el archivo FINAL (después
de codificar a AAC), que es donde puede pasarse. Uso: medir.py <trabajo> <archivo>."""
import os
import sys

from comun import medir_sonoridad, oficio, trabajo

T = trabajo()
O = oficio(T)["master"]
ruta = sys.argv[2] if len(sys.argv) > 2 else os.path.join(T, "mezcla.wav")
lufs, pico = medir_sonoridad(ruta)
bien = lufs is not None and abs(lufs - O["lufs"]) <= 1 and pico is not None and pico <= O["picoDbtp"]
print(f"{os.path.basename(ruta)}: {lufs} LUFS (objetivo {O['lufs']}) · pico {pico} dBTP (tope {O['picoDbtp']}) · {'BIEN' if bien else 'REVISAR'}")
