#!/usr/bin/env bash
# Installs the daily pull of the server backups on this Mac (launchd, 10:15, after the 06:30 dump and after the
# 10:00 pull of the other project; a missed run happens after wake).
# Run once: BACKUP_SERVER=user@host deploy/mac/install-pull.sh   Remove: launchctl bootout gui/$(id -u)/de.tails-up.backup-pull && rm ~/Library/LaunchAgents/de.tails-up.backup-pull.plist
set -euo pipefail

# launchd does not inherit the shell environment, so the ssh target is written into the plist.
: "${BACKUP_SERVER:?set BACKUP_SERVER=user@host (ssh target of the backup server)}"

cd "$(dirname "$0")"
script="$PWD/pull-backups.sh"
label="de.tails-up.backup-pull"
plist="$HOME/Library/LaunchAgents/$label.plist"
target="$HOME/Backups/dog-territory"

mkdir -p "$HOME/Library/LaunchAgents" "$target"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$script</string></array>
  <key>EnvironmentVariables</key><dict><key>BACKUP_SERVER</key><string>$BACKUP_SERVER</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>15</integer></dict>
  <key>StandardErrorPath</key><string>$target/launchd.err</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "installed: $plist"
