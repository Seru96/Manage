#!/usr/bin/env bash
# Notas de una versión sacadas de CHANGELOG.md: la sección «## X.Y.Z · fecha» hasta la siguiente.
# Uso: scripts/notas-version.sh 0.12.0
set -euo pipefail
v="$1"
awk -v v="$v" '
  /^## / { if (on) exit; if (index($0, "## " v " ") == 1) { on = 1; next } }
  on { print }
' "$(dirname "$0")/../CHANGELOG.md" | sed -e '/./,$!d'
