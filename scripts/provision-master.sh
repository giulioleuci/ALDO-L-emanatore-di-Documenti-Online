#!/usr/bin/env bash

set -euo pipefail

# Edit these values before the first provisioning run.
GLF_REPOSITORY_URL="https://github.com/giulioleuci/GasLibraryFactory.git"
GLF_BRANCH="main"
MASTER_TITLE="ALDO — Master"
MASTER_FOLDER_PATH="ALDO/Produzione/Master"

ALDO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
GLF_DIR="$ALDO_ROOT/GasLibraryFactory"
DIST_DIR="$ALDO_ROOT/dist"
REPO_INFO_FILE="$ALDO_ROOT/REPO_FOR_GLF.txt"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aldo-bound-master.XXXXXXXX")"
SUCCEEDED=false

cleanup() {
  if "$SUCCEEDED"; then
    rm -rf "$TEMP_DIR"
  else
    printf 'Provisioning non completato. Directory temporanea mantenuta: %s\n' "$TEMP_DIR" >&2
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Comando richiesto non trovato: %s\n' "$1" >&2
    exit 1
  fi
}

require_command git
require_command npm
require_command npx

if ! npx --prefix "$ALDO_ROOT" clasp show-authorized-user >/dev/null 2>&1; then
  printf 'Autorizzazione clasp assente o scaduta: completa il login nel browser.\n'
  npx --prefix "$ALDO_ROOT" clasp login
fi

if [[ ! -d "$GLF_DIR/.git" ]]; then
  git clone --branch "$GLF_BRANCH" --single-branch "$GLF_REPOSITORY_URL" "$GLF_DIR"
else
  if [[ -n "$(git -C "$GLF_DIR" status --porcelain)" ]]; then
    printf 'GasLibraryFactory contiene modifiche locali: aggiornamento interrotto per non sovrascriverle.\n' >&2
    exit 1
  fi
  git -C "$GLF_DIR" fetch origin "$GLF_BRANCH"
  git -C "$GLF_DIR" checkout "$GLF_BRANCH"
  git -C "$GLF_DIR" pull --ff-only origin "$GLF_BRANCH"
fi

GLF_COMMIT="$(git -C "$GLF_DIR" rev-parse HEAD)"
{
  printf 'repository=%s\n' "$GLF_REPOSITORY_URL"
  printf 'branch=%s\n' "$GLF_BRANCH"
  printf 'commit=%s\n' "$GLF_COMMIT"
} >"$REPO_INFO_FILE"

(
  cd "$ALDO_ROOT"
  npm run refresh:vendor
  npm run build:production
)

(
  cd "$TEMP_DIR"
  npx --prefix "$ALDO_ROOT" clasp create --type sheets --title "$MASTER_TITLE" --rootDir "$DIST_DIR"
  npx --prefix "$ALDO_ROOT" clasp push
)

SUCCEEDED=true
printf 'Master creato nella Drive root. Spostalo manualmente in: %s\n' "$MASTER_FOLDER_PATH"
printf 'Revision GLF registrata in: %s\n' "$REPO_INFO_FILE"
