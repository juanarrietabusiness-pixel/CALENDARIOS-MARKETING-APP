#!/usr/bin/env bash
# ============================================================
# Protege la rama main: sin CI en verde, no se mergea.
#
# Crea un ruleset en GitHub con cuatro reglas:
#
#   · Los cambios entran por pull request (no se puede empujar a main).
#   · El job «verificar» de CI tiene que estar en verde.
#   · La rama tiene que estar al día con main antes de mergear, para que
#     lo que se probó sea lo que va a entrar y no una versión anterior.
#   · main no se puede borrar ni reescribir con un force-push.
#
# NO pide aprobaciones de nadie: en un repositorio de una sola persona,
# exigir una revisión ajena bloquearía todo —no se puede aprobar el
# propio pull request—. Lo que bloquea aquí son las pruebas, que es lo
# que se quería.
#
# Uso:
#   GITHUB_TOKEN=ghp_... ./scripts/proteger-main.sh
#
# El token necesita permiso de administración sobre el repositorio
# (un token clásico con el ámbito `repo`, o uno «fine-grained» con
# Administration: Read and write).
#
# Es idempotente: si el ruleset ya existe, lo actualiza en vez de
# duplicarlo.
# ============================================================
set -euo pipefail

REPO="${REPO:-juanarrietabusiness-pixel/CALENDARIOS-MARKETING-APP}"
NOMBRE="main protegida: sin CI en verde no se mergea"
# El nombre del job en .github/workflows/ci.yml. Si se renombra allí,
# hay que renombrarlo aquí y volver a ejecutar este script, o la
# protección se quedaría esperando un check que ya no existe.
CHECK="verificar"
APP_GITHUB_ACTIONS=15368

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Falta GITHUB_TOKEN." >&2
  echo "Genera uno en https://github.com/settings/tokens con permiso de" >&2
  echo "administración sobre el repositorio y vuelve a ejecutar:" >&2
  echo "  GITHUB_TOKEN=... ./scripts/proteger-main.sh" >&2
  exit 1
fi

api() {
  curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
           -H "Accept: application/vnd.github+json" \
           -H "X-GitHub-Api-Version: 2022-11-28" "$@"
}

cuerpo=$(cat <<JSON
{
  "name": "$NOMBRE",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "$CHECK", "integration_id": $APP_GITHUB_ACTIONS }
        ]
      }
    }
  ]
}
JSON
)

# ¿Existe ya?
existente=$(api "https://api.github.com/repos/$REPO/rulesets" \
  | python3 -c "
import sys, json
nombre = '''$NOMBRE'''
try:
    datos = json.load(sys.stdin)
except Exception:
    datos = []
if isinstance(datos, list):
    for r in datos:
        if r.get('name') == nombre:
            print(r['id']); break
")

if [ -n "$existente" ]; then
  echo "El ruleset ya existe (id $existente). Actualizándolo…"
  respuesta=$(api -X PUT -H "Content-Type: application/json" \
    -d "$cuerpo" "https://api.github.com/repos/$REPO/rulesets/$existente")
else
  echo "Creando el ruleset…"
  respuesta=$(api -X POST -H "Content-Type: application/json" \
    -d "$cuerpo" "https://api.github.com/repos/$REPO/rulesets")
fi

echo "$respuesta" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'id' in d:
    print()
    print('Listo. main está protegida.')
    print('  ruleset:', d['id'], '—', d['name'], f\"({d['enforcement']})\")
    for r in d.get('rules', []):
        print('  regla:', r['type'])
    print()
    print('Compruébalo en:')
    print('  https://github.com/$REPO/settings/rules')
else:
    print()
    print('No se pudo. GitHub respondió:')
    print(json.dumps(d, indent=2, ensure_ascii=False)[:1200])
    sys.exit(1)
"
