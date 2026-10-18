#!/usr/bin/env bash
# Restore-Probe: spielt den neuesten Dump (oder ./restore-drill.sh <datei>) in einen Wegwerf-Postgres ein,
# zaehlt Zeilen und raeumt auf. Beruehrt die echte Datenbank NIE: eigener Container (zufaelliger Name,
# kein veroeffentlichter Port, 256 MB), liest nur die Dump-Datei. Monatlich ausfuehren und nach jeder Migration.
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-$HOME/dog-territory/backups}"
case "$BACKUP_DIR" in ""|/|/srv/backups|/srv/backups/*) echo "Unzulaessiges BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
file="${1:-}"
if [ -z "$file" ]; then
  file="$(ls -1t "$BACKUP_DIR"/dtd-*.sql.gz 2>/dev/null | head -n 1 || true)"
fi
[ -n "$file" ] && [ -f "$file" ] || { echo "Kein Dump gefunden in $BACKUP_DIR (dtd-*.sql.gz)." >&2; exit 1; }
gzip -t "$file"

name="dtd-restore-drill-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
cleanup() { docker rm -fv "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Dump: $file ($(du -h "$file" | cut -f1)), Wegwerf-Container: $name"
# Kein -p/--publish, kein Volume-Mount der echten Daten; das anonyme Volume geht mit `rm -fv` weg.
docker run -d --name "$name" --memory 256m --pids-limit 200 --cpus 1 \
  -e POSTGRES_PASSWORD="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')" -e POSTGRES_DB=dtd \
  postgres:16-alpine >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -U postgres -d dtd -h 127.0.0.1 >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "Wegwerf-Postgres wurde nicht bereit." >&2; exit 1; }
# Der Init-Lauf startet den Server einmal kurz neu; nochmal bestaetigen.
sleep 2
docker exec "$name" pg_isready -U postgres -d dtd -h 127.0.0.1 >/dev/null

gunzip -c "$file" | docker exec -i "$name" psql -U postgres -d dtd -v ON_ERROR_STOP=1 -q -o /dev/null

counts="$(docker exec "$name" psql -U postgres -d dtd -At -F ' ' -c "
  select 'households', count(*) from households
  union all select 'walks', count(*) from walks
  union all select 'cells', count(*) from cells
  union all select 'den_state', count(*) from den_state
  union all select 'events', count(*) from events")"
echo "Zeilen im wiederhergestellten Dump:"
echo "$counts" | awk '{ printf "  %-12s %s\n", $1, $2 }'

if [ "$(echo "$counts" | awk '$1=="households" {print $2}')" = "0" ]; then
  echo "WARNUNG: 0 Haushalte. Stimmt das (frische Installation) oder ist der Dump leer?" >&2
fi
mkdir -p "$BACKUP_DIR"
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') restore-drill ok $(basename "$file") $(echo "$counts" | awk '{printf "%s=%s ", $1, $2}')" >> "$BACKUP_DIR/drill.log"
echo "Restore-Probe ok. Container wird entfernt; die echte Datenbank wurde nicht beruehrt."
