#!/usr/bin/env bash
# Stellt ein Backup wieder her: ./restore.sh ~/dog-territory/backups/dtd-XXXX.sql.gz
# ACHTUNG: ersetzt den Inhalt der Datenbank `dtd` vollstaendig. Vorher api stoppen, danach starten.
set -euo pipefail
cd "$(dirname "$0")"
file="${1:?Aufruf: ./restore.sh <backup.sql.gz>}"
[ -f "$file" ] || { echo "Datei fehlt: $file" >&2; exit 1; }
gzip -t "$file"
read -r -p "Datenbank dtd mit $file ueberschreiben? ('ja' tippen) " answer
[ "$answer" = "ja" ] || { echo "Abgebrochen."; exit 1; }
BACKUP_DIR="${BACKUP_DIR:-$HOME/dog-territory/backups}"
case "$BACKUP_DIR" in ""|/|/srv/backups|/srv/backups/*) echo "Unzulaessiges BACKUP_DIR: $BACKUP_DIR" >&2; exit 1;; esac
mkdir -p "$BACKUP_DIR"
docker compose stop api
# Sicherheitsdump des aktuellen Stands, bevor irgendetwas geloescht wird (Name passt nicht auf die 14-Tage-Bereinigung).
safety="$BACKUP_DIR/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB"' | gzip > "$safety.part"
gzip -t "$safety.part"
mv "$safety.part" "$safety"
echo "Sicherheitsdump: $safety"
psql_db() { docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'; }
# drizzle-Schema mit droppen: sonst meint das Migrationsjournal, alles sei schon angewendet.
echo 'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;' | psql_db
gunzip -c "$file" | psql_db
docker compose start api
echo "Wiederhergestellt aus $file"
