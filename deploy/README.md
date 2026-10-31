# Deploy: Heimserver (Multiplayer-Test)

Regeln stehen in `~/SERVER.md` auf dem Server. Dienste: `api` (127.0.0.1:7000), `db` (127.0.0.1:7001), `tailscale` (eigener Knoten `your-server.example.com`, Funnel auf 443). RAM-Grenzen: 384m/512m/128m. Der Agent bereitet nur Dateien vor; alles unten fuehrst du selbst per ssh aus, ohne sudo.

## Erster Start

1. Vorab (nur lesen): `ss -tln; docker ps --format '{{.Names}}\t{{.Ports}}'; tailscale serve status; free -h; df -h /`
2. SERVER.md ergaenzen (Tabellen unten), **bevor** etwas startet.
3. Repo kopieren: `rsync -av --exclude node_modules --exclude .git ./ user@home-server:dog-territory/`
4. `ssh user@home-server`, dann `mkdir -p ~/dog-territory/backups && cd ~/dog-territory/deploy`
5. `cp .env.example .env && chmod 600 .env && nano .env` (Passwort, `TS_AUTHKEY` aus der Tailscale-Konsole; HTTPS-Zertifikate und `funnel`-Attribut muessen erlaubt sein). Tailscale-Konsole: (a) beim Knoten `dog-territory` **Key expiry deaktivieren** (sonst faellt der Funnel nach ca. 180 Tagen still aus); (b) ACL braucht das `funnel`-nodeAttr, z.B. `"nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]`.
6. Reihenfolge wichtig: `make build` (nicht zwischen 02:00 und 06:00), `docker compose up -d db` (wartet auf healthy), `make migrate` (einmaliger Container), `docker compose up -d`. (`MIGRATE_ON_START=true` migriert zusaetzlich beim api-Start.)
7. `make status`, `curl -s http://127.0.0.1:7000/healthz`, `docker compose logs tailscale | tail -n 20`.
8. `TRUST_PROXY_CIDR` eingrenzen: `docker network inspect dog-territory_default` zeigt das Subnetz (z.B. `172.18.0.0/16`); statt `172.16.0.0/12` in `.env` eintragen, dann `docker compose up -d api`.
9. Haushalt des Owners mit Import-Erlaubnis (nur dieser): `make cli ARGS="create-household --name Zuhause --allow-import"` (gibt den ersten Einladungscode aus). Ohne `--allow-import` ist der Gruendungs-Import geschlossen (409), ein spaeterer Haushalt kann nicht mit Fremd-Daten befuellt werden. Weitere Codes: `make cli ARGS="create-invite --household Zuhause"`. CLI: `cli create-household --name <name> [--timezone Europe/Berlin] [--allow-import] | create-invite --household <id|name> | list | revoke-device --device <id>`
10. Von aussen (Handy im Mobilfunk): `curl -s https://your-server.example.com/healthz`
11. **Client-IP pruefen (einmalig, wichtig fuer Rate-Limits und Bans):** `LOG_FORWARDED_HEADERS=true` in `.env`, `docker compose up -d api`, vom Handy (Mobilfunk) einen Request senden, dann `docker compose logs api | grep forwarded-headers`. Erwartet: `reqIp` = oeffentliche Handy-IP (nicht Sidecar-IP), `xForwardedFor` = dieselbe IP, `socketAddr` im Docker-Netz, `tailscaleIngressSrc` gesetzt. Zeigt `reqIp` die Sidecar-IP, greifen Limits/Bans global statt pro Handy: `TRUST_PROXY_CIDR` korrigieren. Danach `LOG_FORWARDED_HEADERS` wieder `false` (loggt ohnehin nur die ersten 50 Requests). X-Forwarded-For wird nur von `TRUST_PROXY_CIDR` akzeptiert; `Tailscale-Ingress-Src` wird nur geloggt, nie ausgewertet.

## SERVER.md Belegungstabelle (Zeile einfuegen)

| Dog Territory Defender (Multiplayer-Test) | `~/dog-territory` | `dog-territory` | 127.0.0.1:7000 (api), 127.0.0.1:7001 (db) | Tailscale-Sidecar `your-server.example.com:443`, **Funnel öffentlich** (nur dieser eigene Knoten; Host-Knoten und dessen 443 unberührt) | 06:30 pg_dump (`# dog-territory`) | `~/dog-territory/backups` (14 Tage) | 1 GiB (api 384m, db 512m, tailscale 128m) |

Bei "Belegte Ports": `| 7000 | dog-territory API | Dog Territory |` und `| 7001 | dog-territory PostgreSQL | Dog Territory |`

## Backup und Cron

Zeile anhaengen (Crontab nie ersetzen):
`(crontab -l; echo '30 6 * * * $HOME/dog-territory/deploy/backup.sh >> $HOME/dog-territory/backups/backup.log 2>&1 # dog-territory') | crontab -`

Manuell: `make backup`. Wiederherstellen: `./restore.sh ~/dog-territory/backups/dtd-<zeit>.sql.gz` (fragt nach, stoppt api, legt zuerst `pre-restore-<zeit>.sql.gz` an, droppt die Schemas `drizzle` und `public`, spielt ein).

**Zweite Kopie (ausserhalb der Platte):** `backup.sh` kopiert den neuen Dump zusaetzlich, wenn eine Variable gesetzt ist (Standard: keine); im Cron vor den Aufruf schreiben oder in `~/.profile` exportieren.
- `BACKUP_COPY_DIR=/mnt/extern/dtd`: lokaler Pfad (externe Platte, NAS); dort werden nur `dtd-*.sql.gz` aelter als 14 Tage geloescht. Nicht dasselbe Verzeichnis wie `BACKUP_DIR`.
- `BACKUP_RSYNC_TARGET=user@host:dog-territory-backups`: rsync per ssh (nur mit ssh-Schluessel, kein Prompt im Cron); Zielverzeichnis muss existieren; dort wird nichts geloescht.
Schlaegt die Kopie fehl, steht eine `WARN`-Zeile im Backup-Log und das Skript endet mit Exit 3; der Dump selbst ist fertig.

**Kopie auf dem Mac (Pull):** `BACKUP_SERVER=<user@host> deploy/mac/install-pull.sh` (einmal auf dem Mac) legt den LaunchAgent `de.tails-up.backup-pull` an: taeglich 10:15 holt `deploy/mac/pull-backups.sh` per rsync/ssh (BatchMode) alle `dtd-*.sql.gz` nach `~/Backups/dog-territory/` (Log `pull.log`, Fehler in `launchd.err`). Der Mac zieht, der Server kann dort nichts loeschen; es gibt eine macOS-Meldung "Tails-Up-Server-Backup", wenn der Server nicht erreichbar oder der neueste Dump aelter als 2 Tage ist; Aufbewahrung 90 Tage (`KEEP_DAYS`). Entfernen: `launchctl bootout gui/$(id -u)/de.tails-up.backup-pull && rm ~/Library/LaunchAgents/de.tails-up.backup-pull.plist` (Backups bleiben liegen). Pruefen auf dem Mac: `gunzip -t <datei>` und `gunzip -c <datei> | head` (macOS-`zcat` will `.Z`).

**Restore-Probe (monatlich und nach jeder Migration):** `make restore-drill` (oder `./restore-drill.sh [<dump>]`) nimmt den neuesten `dtd-*.sql.gz`, startet einen Wegwerf-`postgres:16-alpine` (Name `dtd-restore-drill-...`, kein veroeffentlichter Port, 256 MB), spielt den Dump ein, druckt Zeilenzahlen (`households`, `walks`, `cells`, `den_state`, `events`, `player_stats`; -1 = der Dump ist aelter als Migration 0007) und entfernt Container samt Volume. Echte DB und `restore.sh` bleiben unberuehrt; Ergebnis auch in `$BACKUP_DIR/drill.log`. Ein Dump, der sich nicht einspielen laesst, ist kein Backup: sofort `make backup` wiederholen und den Fehler klaeren. Zahlen etwa wie im Spiel (`make cli ARGS="list"`).

## Betrieb

- **Server-URL der App:** `EXPO_PUBLIC_SERVER_URL` (Vorlage `.env.example` im Repo-Root) wird beim Bauen fest eingesetzt. `.env` ist git-ignoriert und wird nicht zu EAS hochgeladen: fuer EAS-Builds als EAS-Umgebungsvariable setzen, fuer OTA ebenso (`eas update --environment <env>`) oder in der lokalen `.env` des Publish-Rechners. Fehlt sie, bleibt das Feld leer und neue Spieler muessen die URL tippen; bestehende Haushalte behalten ihre gespeicherte URL.
- Alle Dienste: json-file-Logrotation 3 x 10 MB. db: 1 CPU, `pids_limit` 200. Image `tailscale/tailscale:v1.76.1` bewusst manuell anheben.
- `docker compose stop api` wartet bis 30 s (`stop_grace_period`); SIGTERM weckt offene Long-Polls sofort.
- **API-Level:** jede Antwort traegt `X-Api-Level`, `GET /healthz` meldet `apiLevel`, die App sendet `X-Client-Api-Level`. Innerhalb eines Levels nur additive Felder; **Server vor der App ausrollen**; Brueche bekommen `/v2`. `MIN_CLIENT_API_LEVEL` (.env, Standard 1) weist aeltere Apps bei Schreibzugriffen mit 426 `upgrade_required` ab (Lesen geht, die App zeigt "Es gibt ein Update" und haelt Aenderungen zurueck). Erst anheben, wenn **beide** Telefone den neuen Stand haben (das iPhone mit kostenlosem Team ist oft zurueck!).
- Tageslimits (Walks/Commands pro Haushalt) zaehlen den **Kalendertag in der Zeitzone des Haushalts**, derselbe Tag wie beim Belohnungs-Multiplikator (kein gleitendes 24-h-Fenster).

## Kill Switch

- Sofort aus: `docker compose stop api` (App ist offline-first, Sync pausiert nur).
- Nicht mehr öffentlich: `AllowFunnel` aus `tailscale/serve.json` entfernen, `docker compose restart tailscale`.
- Alles stoppen: `make down` (Daten bleiben). Niemals `down -v` ohne Backup. Nie `tailscale ... reset` auf dem Host, nie `docker system prune` / `docker volume prune` (geteilter Server).
- Geheimnis geleckt: `POSTGRES_PASSWORD` und `TS_AUTHKEY` rotieren, Geräte per CLI sperren, neu einladen.

## Umzug in die Cloud

Das Image ist 12-Factor (nur Env: `DATABASE_URL`, `PORT`, ...). Eigener VPS: dieselbe `docker-compose.yml` ohne `tailscale`-Dienst, davor Caddy/Traefik fuer TLS, `api` ohne Host-Port. Fly.io: Skizze in `cloud/fly.toml` (Release-Command migriert, Check auf `/healthz`). Daten: `backup.sh`-Dump in die neue DB einspielen, `DATABASE_URL` setzen, Server-URL in der App-Einstellung aendern.
