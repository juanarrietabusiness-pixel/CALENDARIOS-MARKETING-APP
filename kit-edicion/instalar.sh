#!/usr/bin/env bash
# ============================================================
# Instala el KIT DE EDICIÓN en el chat de Claude: UN comando, idempotente (lo hecho no se repite) y sin preguntas.
#   bash instalar.sh
# Lo que hace: comprueba python3, node y ffmpeg; instala las librerías de Python; baja el modelo de reducción de voz
# (rnnoise, fijado por commit y sha256), el de transcripción (faster-whisper large-v3-turbo, de Hugging Face), el de
# recorte de la persona (RobustVideoMatting, de GitHub, por sha256) e instala Remotion (npm ci).
# Si algo falla a la mitad, se vuelve a correr y sigue.
# ============================================================
set -euo pipefail
KIT="$(cd "$(dirname "$0")" && pwd)"
MARCAS="$KIT/.instalado"
mkdir -p "$MARCAS" "$KIT/modelos"
hecho() { [ -f "$MARCAS/$1" ]; }
marcar() { touch "$MARCAS/$1"; }
inicio=$(date +%s)

for p in python3 node ffmpeg ffprobe; do command -v "$p" >/dev/null || { echo "✗ Falta $p."; exit 1; }; done
echo "Kit de edición v$(node "$KIT/kit.mjs" version) en $KIT"
node -e 'if (+process.versions.node.split(".")[0] < 18) process.exit(1)' || { echo "✗ Hace falta Node 18 o más."; exit 1; }
# (sin tubería a grep -q: con pipefail, grep corta la salida de ffmpeg y la línea entera «falla»)
FILTROS="$(ffmpeg -hide_banner -filters 2>/dev/null || true)"
case "$FILTROS" in *" arnndn "*) ;; *) echo "· OJO: este ffmpeg no tiene arnndn: la voz se limpiará con afftdn." ;; esac
[ -n "${KIT_DOMINIO:-}" ] && echo "$KIT_DOMINIO" > "$KIT/.dominio"

if ! hecho pip; then
  echo "· Librerías de Python…"
  python3 -m pip install -q --break-system-packages -r "$KIT/requisitos.txt" 2>/dev/null \
    || python3 -m pip install -q --user -r "$KIT/requisitos.txt"
  marcar pip
fi

RNN="$KIT/modelos/rnnoise.rnnn"
SHA_RNN="70bb6685eb0c2a1d18e2918dca3fbfbd39317010b1802eb1b6ea73a92f3fdec0"
if ! hecho rnnoise; then
  echo "· Modelo de reducción de ruido (rnnoise, somnolent-hogwash)…"
  curl -fsSL "https://raw.githubusercontent.com/GregorR/rnnoise-models/3eee541a283fd3b8f81b85b1748e3b9ccbefa04d/somnolent-hogwash-2018-09-01/sh.rnnn" -o "$RNN.tmp"
  echo "$SHA_RNN  $RNN.tmp" | sha256sum -c --quiet - || { echo "✗ El modelo de rnnoise no es el esperado."; rm -f "$RNN.tmp"; exit 1; }
  mv "$RNN.tmp" "$RNN"
  marcar rnnoise
fi

if ! hecho whisper; then
  echo "· Modelo de transcripción (faster-whisper large-v3-turbo, ~1,6 GB)…"
  python3 -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8')"
  marcar whisper
fi

# El recorte de la persona: RobustVideoMatting (GPL-3.0), bajado de su origen. resnet50 es el de Rofer v2 y el que ganó la
# prueba de la Fase 2b; mobilenetv3 (2,4× más rápido, borde algo más inestable) sólo si el plan lo pide.
RVM="https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0"
for par in "rvm_resnet50:25db300fcb6ee27f941a1b52c97856e8d1f13c7f35817f81a612f89af0e8a85c" "rvm_mobilenetv3:88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828"; do
  nombre="${par%%:*}"; sha="${par##*:}"; destino="$KIT/modelos/$nombre.onnx"
  [ "$nombre" = "rvm_mobilenetv3" ] && [ -z "${KIT_RVM_RAPIDO:-}" ] && continue
  if ! hecho "$nombre"; then
    echo "· Recorte de la persona ($nombre, RobustVideoMatting)…"
    curl -fsSL "$RVM/${nombre}_fp32.onnx" -o "$destino.tmp"
    echo "$sha  $destino.tmp" | sha256sum -c --quiet - || { echo "✗ El modelo $nombre no es el esperado."; rm -f "$destino.tmp"; exit 1; }
    mv "$destino.tmp" "$destino"
    marcar "$nombre"
  fi
done

# Remotion (las piezas gráficas y el render), con las versiones fijadas en remotion/package-lock.json.
if ! hecho remotion; then
  echo "· Remotion (las piezas y el render)…"
  (cd "$KIT/remotion" && npm ci --no-audit --no-fund --loglevel=error)
  marcar remotion
fi

echo "✓ Listo en $(( $(date +%s) - inicio )) s. Desde la carpeta del proyecto: node $KIT/kit.mjs preparar <clips>"
