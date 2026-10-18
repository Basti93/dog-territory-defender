#!/usr/bin/env bash
# Taeglicher pg_dump (Cron 06:30). Schreibt NUR nach $BACKUP_DIR und loescht NUR dort
# dtd-*.sql.gz aelter als 14 Tage. Niemals /srv/backups benutzen (dort loescht das TGA-Backup).
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
