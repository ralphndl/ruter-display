#!/bin/sh
# Manage the Departino service on the Linux host.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
UNIT=departino.service

unit_exists() {
  systemctl cat "$1" >/dev/null 2>&1
}

case "${1:-}" in
  install)
    UNIT_FILE=$(mktemp)
    trap 'rm -f "$UNIT_FILE"' EXIT HUP INT TERM
    # Quote paths for systemd, including spaces and literal percent signs.
    node - "$ROOT" "$(id -un)" "$(command -v node)" > "$UNIT_FILE" <<'NODE'
const [root, user, executable] = process.argv.slice(2);
const quote = value => '"' + value.replace(/%/g, '%%').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
process.stdout.write(`[Unit]
Description=Departino (independent departure board)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${quote(root)}
ExecStart=${quote(executable)} ${quote(`${root}/server.js`)}
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`);
NODE
    # Stop through systemd first, including activating/restarting services.
    # Killing their Node process directly would trigger Restart=always.
    if unit_exists "$UNIT"; then
      sudo systemctl stop "$UNIT"
    fi
    # Retire the old name only when it belongs to this exact checkout.
    if unit_exists ruter-display.service &&
      [ "$(systemctl show ruter-display.service --property=WorkingDirectory --value)" = "$ROOT" ]; then
      sudo systemctl disable --now ruter-display.service
    fi
    node "$ROOT/scripts/local-server.js" stop
    sudo install -m 644 "$UNIT_FILE" "/etc/systemd/system/$UNIT"
    sudo systemctl daemon-reload

    sudo systemctl enable "$UNIT"
    sudo systemctl restart "$UNIT"
    echo "$UNIT installed and started."
    ;;
  uninstall)
    if unit_exists "$UNIT"; then
      sudo systemctl disable --now "$UNIT"
      sudo rm -f "/etc/systemd/system/$UNIT"
    fi
    sudo systemctl daemon-reload
    echo "Departino systemd service removed."
    ;;
  check-uninstalled)
    # Native macOS installs do not use systemd.
    if command -v systemctl >/dev/null 2>&1; then
      if unit_exists "$UNIT"; then
        echo "Run 'make unservice' before uninstalling dependencies." >&2
        exit 1
      fi
    fi
    ;;
  *)
    echo "Usage: $0 install|uninstall|check-uninstalled" >&2
    exit 1
    ;;
esac
