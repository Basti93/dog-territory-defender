#!/usr/bin/env bash
# Runs on the Mac: pulls the nightly pg_dump backups (dtd-*.sql.gz) of the home server into a local folder, so a
# copy survives a broken disk or a stolen server. Pull, not push: the server cannot delete the copies on the Mac.
# Started daily by launchd (see install-pull.sh); a failure shows a macOS notification. Keeps KEEP_DAYS days.
# Same pattern as the pull script of the another-project project. Only dtd-*.sql.gz is fetched (not the
# pre-restore-*.sql.gz safety dumps or backup.log).
set -euo pipefail

SERVER="${BACKUP_SERVER:-user@home-server}"
SOURCE="dog-territory/backups/"   # relative to the home directory on the server (= ~/dog-territory/backups/)
TARGET="${BACKUP_TARGET:-$HOME/Backups/dog-territory}"
KEEP_DAYS="${KEEP_DAYS:-90}"      # dumps are tiny
LOG="$TARGET/pull.log"

mkdir -p "$TARGET"

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Tails-Up-Server-Backup\"" >/dev/null 2>&1 || true
}

fail() {
  echo "$(date '+%F %T') FAILED: $1" >> "$LOG"
  notify "Backup vom Server fehlgeschlagen: $1"
  exit 1
}

# dumps are written once and never change afterwards (-a keeps their mtime, which the pruning below relies on)
/usr/bin/rsync -a --timeout=120 -e "/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=20" \
  --include='dtd-*.sql.gz' --exclude='*' "$SERVER:$SOURCE" "$TARGET/" 2>> "$LOG" \
  || fail "Server nicht erreichbar oder Kopieren gescheitert (Details: $LOG)"

newest=$(/bin/ls -t "$TARGET"/dtd-*.sql.gz 2>/dev/null | head -1 || true)
[ -n "$newest" ] || fail "keine Datenbanksicherung gefunden"
age_days=$(( ( $(date +%s) - $(stat -f %m "$newest") ) / 86400 ))
[ "$age_days" -le 2 ] || fail "neueste Datenbanksicherung ist $age_days Tage alt"

find "$TARGET" -type f -name 'dtd-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date '+%F %T') ok, newest $(basename "$newest"), $(du -sh "$TARGET" | cut -f1) in total" >> "$LOG"
