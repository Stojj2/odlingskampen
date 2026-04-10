#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/odlingskampen}"
APP_USER="${APP_USER:-$USER}"
APP_PORT="${APP_PORT:-8080}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Kor scriptet som root eller via sudo."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Det har scriptet stoder Debian/Ubuntu-baserade VM/LXC."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

. /etc/os-release

DOCKER_DISTRO=""
case "${ID:-}" in
  ubuntu)
    DOCKER_DISTRO="ubuntu"
    ;;
  debian)
    DOCKER_DISTRO="debian"
    ;;
  *)
    echo "Ostod distro for automatisk Docker-installation: ${ID:-unknown}"
    exit 1
    ;;
esac

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${DOCKER_DISTRO} \
  ${VERSION_CODENAME} stable" >/etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

mkdir -p "${APP_DIR}/data" "${APP_DIR}/uploads"

if id "${APP_USER}" >/dev/null 2>&1; then
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
fi

cat <<EOF

Docker ar installerat.

Nasta steg:
1. Kopiera projektet till ${APP_DIR}
2. Ga till mappen
3. Starta appen:

   docker compose -f compose.proxmox.yaml up -d --build

4. Oppna:

   http://SERVER-IP:${APP_PORT}/login

EOF
