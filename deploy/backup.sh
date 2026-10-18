#!/usr/bin/env bash
# Taeglicher pg_dump (Cron 06:30). Schreibt NUR nach $BACKUP_DIR und loescht NUR dort
# dtd-*.sql.gz aelter als 14 Tage. Niemals /srv/backups benutzen (dort loescht das TGA-Backup).
# Optional zweite Kopie des neuen Dumps: BACKUP_COPY_DIR=/mnt/extern/dtd (eingehaengte Platte) und/oder
# BACKUP_RSYNC_TARGET=user@host:dog-territory-backups (rsync per ssh-Schluessel). Beides leer = aus.
set -euo pipefail
cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-$HOME/dog-territory/backups}"
case "$BACKUP_DIR" in ""|/|/srv/backups|/srv/backups/*) echo "Unzulaessiges BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/dtd-$(date +%Y%m%d-%H%M%S).sql.gz"
trap 'rm -f "$out.part"' ERR
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB"' | gzip > "$out.part"
gzip -t "$out.part"
mv "$out.part" "$out"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'dtd-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) ok $out ($(du -h "$out" | cut -f1))"

# Zweite Kopie ausserhalb dieser Platte (beides optional, Standard: nichts tun). Ein Fehler hier macht den
# Lauf rot (Exit 3), der Dump oben ist dann trotzdem fertig.
copy_status=0
if [ -n "${BACKUP_COPY_DIR:-}" ]; then
  case "$BACKUP_COPY_DIR" in /|/srv/backups|/srv/backups/*) echo "Unzulaessiges BACKUP_COPY_DIR: $BACKUP_COPY_DIR" >&2; exit 1;; esac
  if [ "$(cd "$BACKUP_COPY_DIR" 2>/dev/null && pwd -P || echo none)" = "$(cd "$BACKUP_DIR" && pwd -P)" ]; then
    echo "BACKUP_COPY_DIR ist dasselbe wie BACKUP_DIR: keine zweite Kopie." >&2; copy_status=3
  elif mkdir -p "$BACKUP_COPY_DIR" && cp "$out" "$BACKUP_COPY_DIR/$(basename "$out").part" && mv "$BACKUP_COPY_DIR/$(basename "$out").part" "$BACKUP_COPY_DIR/$(basename "$out")"; then
    find "$BACKUP_COPY_DIR" -maxdepth 1 -type f -name 'dtd-*.sql.gz' -mtime +14 -delete
    echo "$(date -Is) copy ok $BACKUP_COPY_DIR/$(basename "$out")"
  else
    rm -f "$BACKUP_COPY_DIR/$(basename "$out").part" 2>/dev/null || true
    echo "$(date -Is) WARN: Kopie nach $BACKUP_COPY_DIR fehlgeschlagen (Disk nicht eingehaengt?)" >&2; copy_status=3
  fi
fi
if [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  # Ziel wie user@host:pfad/ ; Schluessel-Login noetig (BatchMode: nie nach Passwort fragen, haengt sonst im Cron).
  if rsync -a --partial -e "ssh -o BatchMode=yes -o ConnectTimeout=15" "$out" "${BACKUP_RSYNC_TARGET%/}/"; then
    echo "$(date -Is) rsync ok ${BACKUP_RSYNC_TARGET%/}/$(basename "$out")"
  else
    echo "$(date -Is) WARN: rsync nach $BACKUP_RSYNC_TARGET fehlgeschlagen" >&2; copy_status=3
  fi
fi
exit "$copy_status"
