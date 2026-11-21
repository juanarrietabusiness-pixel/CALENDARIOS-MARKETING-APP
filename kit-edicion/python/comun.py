"""Lo común de los pasos en Python del kit de edición: rutas, el oficio, leer y escribir audio.

Cada paso recibe la carpeta de TRABAJO (la que arma `node kit.mjs`): ahí están `oficio.json` (los números del oficio,
escritos desde src/lib/oficioEdicion.js: una sola fuente), `clips.json` y lo que dejaron los pasos anteriores. Los
pasos son REANUDABLES: lo que ya está hecho en disco no se repite (los procesos del chat mueren al responder).
"""
import json
import os
import subprocess
import sys
import time
import wave

import numpy as np

SR = 48000
KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def trabajo():
    if len(sys.argv) < 2:
        sys.exit("Falta la carpeta de trabajo (la arma «node kit.mjs»).")
    return os.path.abspath(sys.argv[1])


def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        if defecto is not None:
            return defecto
        raise


def escribir_json(ruta, datos):
    """Escribe a un temporal y lo mueve: un proceso cortado a la mitad no deja un JSON roto."""
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)
    os.replace(tmp, ruta)


def oficio(t):
    return leer_json(os.path.join(t, "oficio.json"))


def db(x):
    return 10 ** (x / 20)


def leer_audio(ruta, canales=1, sr=SR, filtro=None):
    """Decodifica con ffmpeg a float64 (n,) o (n, canales)."""
    cmd = ["ffmpeg", "-v", "error", "-i", ruta, "-vn", "-ac", str(canales), "-ar", str(sr)]
    if filtro:
        cmd += ["-af", filtro]
    cmd += ["-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    return x if canales == 1 else x.reshape(-1, canales)


def escribir_wav(ruta, x, sr=SR):
    """16 bits; (n,) mono o (n, 2) estéreo. Temporal + mover, como el JSON."""
    x = np.asarray(x)
    canales = 1 if x.ndim == 1 else x.shape[1]
    tmp = ruta + ".tmp.wav"
    w = wave.open(tmp, "wb")
    w.setnchannels(canales)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    w.close()
    os.replace(tmp, ruta)


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def medir_sonoridad(ruta):
    """LUFS integrados y pico verdadero (dBTP) con el ebur128 de ffmpeg."""
    r = subprocess.run(["ffmpeg", "-nostats", "-i", ruta, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    lufs = pico = None
    for linea in r.stderr.splitlines()[::-1]:
        s = linea.strip()
        if lufs is None and s.startswith("I:") and "LUFS" in s:
            lufs = float(s.split()[1])
        if pico is None and s.startswith("Peak:") and "dBFS" in s:
            pico = float(s.split()[1])
    return lufs, pico


class Reloj:
    def __init__(self, que):
        self.que, self.t = que, time.time()

    def fin(self, extra=""):
        print(f"{self.que}: {time.time() - self.t:.1f} s{(' · ' + extra) if extra else ''}", flush=True)
