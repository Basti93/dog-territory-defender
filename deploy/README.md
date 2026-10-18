# Deploy: Heimserver (Multiplayer-Test)

Regeln stehen in `~/SERVER.md` auf dem Server. Dienste: `api` (127.0.0.1:7000), `db` (127.0.0.1:7001),
`tailscale` (eigener Knoten `your-server.example.com`, Funnel auf 443). RAM-Grenzen: 384m/512m/128m.
Der Agent bereitet nur Dateien vor; alles unten fuehrst du selbst per ssh aus, ohne sudo.

## Erster Start

1. Vorab (nur lesen): `ss -tln; docker ps --format '{{.Names}}\t{{.Ports}}'; tailscale serve status; free -h; df -h /`
2. SERVER.md ergaenzen (Tabellen unten), **bevor** etwas startet.
3. Repo-Stand kopieren (ohne node_modules/.git):
   `rsync -av --exclude node_modules --exclude .git ./ user@home-server:dog-territory/`
4. `ssh user@home-server`, dann `mkdir -p ~/dog-territory/backups && cd ~/dog-territory/deploy`
5. `cp .env.example .env && chmod 600 .env && nano .env` (Passwort, `DATABASE_URL`, `TS_AUTHKEY` aus der
   Tailscale-Konsole; fuer den Knoten muessen HTTPS-Zertifikate und das `funnel`-Attribut erlaubt sein).
   Tailscale-Konsole, zwei Punkte: (a) beim Knoten `dog-territory` **Key expiry deaktivieren** (sonst faellt der
   Funnel nach ca. 180 Tagen still aus); (b) in der ACL/Policy braucht der Knoten das `funnel`-nodeAttr,
   z.B. `"nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]`.
6. Reihenfolge ist wichtig: `make build` (nicht zwischen 02:00 und 06:00), dann `docker compose up -d db`
   (wartet auf healthy), dann `make migrate` (einmaliger Container), dann `docker compose up -d`.
   (`MIGRATE_ON_START=true` in der Compose-Datei migriert zusaetzlich beim api-Start; ohne Tabellen stirbt api nicht mehr.)
7. `make status`, `curl -s http://127.0.0.1:7000/healthz`, `docker compose logs tailscale | tail -n 20`.
8. `TRUST_PROXY_CIDR` eingrenzen: `docker network inspect dog-territory_default` zeigt das Subnetz (z.B. `172.18.0.0/16`);
   dieses statt `172.16.0.0/12` in `.env` eintragen, dann `docker compose up -d api`.
9. Haushalt des Owners anlegen, mit Import-Erlaubnis (nur dieser eine):
   `make cli ARGS="create-household --name Zuhause --allow-import"` (gibt den ersten Einladungscode aus).
   Ohne `--allow-import` ist der Gruendungs-Import des Haushalts geschlossen (409); so kann ein spaeterer
   Haushalt nicht per Import mit Fremd-Daten befuellt werden.
   Weitere Codes: `make cli ARGS="create-invite --household Zuhause"`. Aufruf-Muster der CLI:
   `cli create-household --name <name> [--timezone Europe/Berlin] [--allow-import] | create-invite --household <id|name> | list | revoke-device --device <id>`
10. Von aussen (Handy im Mobilfunk): `curl -s https://your-server.example.com/healthz`
11. **Client-IP pruefen (einmalig, wichtig fuer Rate-Limits und Bans):** `LOG_FORWARDED_HEADERS=true` in `.env`,
    `docker compose up -d api`, vom Handy (Mobilfunk) einen Request senden, dann
    `docker compose logs api | grep forwarded-headers`. Erwartet: `reqIp` = oeffentliche Handy-IP (nicht die
    Sidecar-IP), `xForwardedFor` = dieselbe IP, `socketAddr` im Docker-Netz, `tailscaleIngressSrc` gesetzt.
    Zeigt `reqIp` die Sidecar-IP, greifen Limits/Bans global statt pro Handy: dann `TRUST_PROXY_CIDR` korrigieren.
    Danach `LOG_FORWARDED_HEADERS` wieder auf `false` (loggt ohnehin nur die ersten 50 Requests).
    X-Forwarded-For wird nur von `TRUST_PROXY_CIDR` akzeptiert; `Tailscale-Ingress-Src` wird nur geloggt, nie ausgewertet.

## SERVER.md Belegungstabelle (Zeile einfuegen)

| Dog Territory Defender (Multiplayer-Test) | `~/dog-territory` | `dog-territory` | 127.0.0.1:7000 (api), 127.0.0.1:7001 (db) | Tailscale-Sidecar `your-server.example.com:443`, **Funnel öffentlich** (nur dieser eigene Knoten; Host-Knoten und dessen 443 unberührt) | 06:30 pg_dump (`# dog-territory`) | `~/dog-territory/backups` (14 Tage) | 1 GiB (api 384m, db 512m, tailscale 128m) |

Bei "Belegte Ports": `| 7000 | dog-territory API | Dog Territory |` und `| 7001 | dog-territory PostgreSQL | Dog Territory |`

## Backup und Cron

Zeile anhaengen (Crontab nie ersetzen):
`(crontab -l; echo '30 6 * * * $HOME/dog-territory/deploy/backup.sh >> $HOME/dog-territory/backups/backup.log 2>&1 # dog-territory') | crontab -`

Manuell: `make backup`. Wiederherstellen: `./restore.sh ~/dog-territory/backups/dtd-<zeit>.sql.gz` (fragt nach, stoppt api,
legt zuerst einen Sicherheitsdump `pre-restore-<zeit>.sql.gz` an, droppt die Schemas `drizzle` und `public`, spielt ein).

## Betrieb: Logs, Limits, Tageslimits

- Alle Dienste: json-file-Logrotation 3 x 10 MB. db: 1 CPU, `pids_limit` 200. Image `tailscale/tailscale:v1.76.1` bewusst manuell anheben.
- `docker compose stop api` wartet bis 30 s (`stop_grace_period`); SIGTERM weckt offene Long-Polls sofort.
- Tageslimits (Walks/Commands pro Haushalt) zaehlen den **Kalendertag in der Zeitzone des Haushalts**, derselbe Tag
  wie beim taeglichen Belohnungs-Multiplikator (kein gleitendes 24-h-Fenster mehr).

## Kill Switch

- Sofort aus: `docker compose stop api` (App ist offline-first, Sync pausiert nur).
- Nicht mehr öffentlich: `AllowFunnel` aus `tailscale/serve.json` entfernen, `docker compose restart tailscale`.
- Alles stoppen: `make down` (Daten bleiben). Niemals `down -v` ohne Backup. Nie `tailscale ... reset` auf dem Host.
- Geheimnis geleckt: `POSTGRES_PASSWORD` und `TS_AUTHKEY` rotieren, Geräte per CLI sperren, neu einladen.

## Umzug in die Cloud

Das Image ist 12-Factor (nur Env: `DATABASE_URL`, `PORT`, ...). Zwei Wege:
- Eigener VPS: dieselbe `docker-compose.yml` ohne `tailscale`-Dienst, davor Caddy/Traefik fuer TLS, `api` ohne Host-Port.
- Fly.io: Skizze in `cloud/fly.toml` (Release-Command migriert, Check auf `/healthz`).
Daten: `backup.sh`-Dump in die neue DB einspielen, `DATABASE_URL` setzen, Server-URL in der App-Einstellung aendern.
