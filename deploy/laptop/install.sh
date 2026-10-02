#!/usr/bin/env bash
# Memasang Meiosis beta sebagai layanan systemd user di laptop (lewat Cloudflare Tunnel).
#   bash deploy/laptop/install.sh          pasang & nyalakan
#   bash deploy/laptop/install.sh --stop   matikan semua
# Butuh: ~/.cloudflared/meiosis.yml (tunnel "meiosis"), .env berisi nilai Sepolia.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BUN="$(command -v bun)"
CLOUDFLARED="$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")"
UNITS="$HOME/.config/systemd/user"
NAMES=(meiosis.service meiosis-tunnel.service meiosis-awake.service meiosis-backup.service meiosis-backup.timer meiosis-health.service meiosis-health.timer)

if [[ "${1:-}" == "--stop" ]]; then
  systemctl --user disable --now meiosis.service meiosis-tunnel.service meiosis-awake.service meiosis-backup.timer meiosis-health.timer || true
  exit 0
fi

mkdir -p "$UNITS"
for n in "${NAMES[@]}"; do
  sed -e "s|@DIR@|$DIR|g" -e "s|@BUN@|$BUN|g" -e "s|@CLOUDFLARED@|$CLOUDFLARED|g" -e "s|@HOME@|$HOME|g" "$DIR/deploy/laptop/$n" > "$UNITS/$n"
done
loginctl enable-linger "$USER" >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable --now meiosis.service meiosis-tunnel.service meiosis-awake.service meiosis-backup.timer meiosis-health.timer
systemctl --user --no-pager status meiosis.service meiosis-tunnel.service | grep -E "●|Active:" || true
