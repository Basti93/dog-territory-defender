# Multiplayer: wie es weitergeht (M3 bis M6)

Stand 2026-10-18, Plan ohne Code. Ergänzt `design.md` (Decisions 1-24) und `proposal.md`; ersetzt nichts davon. Spielregeln bleiben bei `game-master` und `docs/specs/` (Tier A: erst Spec, dann Bau). Größen: S = ein Agentenlauf (halber bis ein Tag), M = 2-4 Tage, L = über eine Woche oder mehrere Läufe.

## 1. Stand

Läuft: Haushalt-Sync (M1) für zwei echte Spieler in einem Haushalt: Android (Owner) und iPhone (Partnerin, kostenloses Apple-Team, daher kein APNs und alle 7 Tage Neuinstallation). Walks, Range-Zellen, Territorien, Den, Hundename, Umbenennen, Löschen, Handarbeits-Nachtrag und Geräte-Logs (`POST /v1/logs`, 14 Tage) synchronisieren über den Home-Server (Docker, Postgres, Tailscale-Funnel, nur ssh-Admin per CLI); Updates der App laufen per EAS-OTA. Gebaut, aber aus: Track B (Nachbarhunde-Server: sechs Bot-Haushalte, Straßen-Kacheln von Overpass, Tagesplan, Events, Geschenke, Viertel-Runde) hinter `NEIGHBOURS_ENABLED=false`; die App holt `GET /v1/nearby` in einen reinen Speicher-Cache (`src/sync/nearbyStore.ts`), aber **kein Bildschirm zeigt ihn**. Wichtig für alles Folgende (im Code geprüft): der Sync-Client benutzt **kein Long-Poll** (`apiClient.events(after)` sendet kein `wait`), er läuft beim Öffnen, beim Zurückkehren in den Vordergrund (mind. 15 s Abstand) und nach dem Einreihen eines Befehls; der Server kann `wait` bis 25 s schon. Die neue Welt (`WorldScene`: Hof, Zaun, Viertel als Flickenteppich, Heimkehr, Briefkasten-Liste) steht; Postkarten, Zaun-Abzeichen und „Unsere Ecken“ (Konzept-Schritte 5-7) fehlen noch.

## 2. Ziel der nächsten Stufe

**Wir sind im Viertel nicht allein: Alex und ich sehen einander im Hof und im Viertel, und morgens liegt ein kleiner Zettel von einem Nachbarhund am Zaun.**

## 3. Bausteine (Reihenfolge = Bauordnung)

Gemeinsame Regeln für alle Slices: Ton nach `game-master` (nie traurig, nie mahnend, kein „du bist hinten“, keine Vergleichszahlen zwischen Spielern, kein Offline-Text); Server entscheidet, die App zeigt; jede neue Server-Antwort ist **additiv** (siehe Slice F0); neue Texte in `de` und `en`; Art über `artOr()` mit Glyph-Fallback, damit Code und Art unabhängig landen.

### Slice F0 (vorab, S+S): Betriebsbasis, bevor mehr Verkehr kommt
Siehe Abschnitt f unten; **muss vor M3 stehen**: API-Level, Restore-Probe, Morgenbericht-CLI.

### Slice b-1 (M): Nachbarhunde sichtbar, Teil 1 (Karte, Zettel, Profil)
- **Spieler sieht:** im Viertel (WebView-Karte) kleine **gestrichelte Pastell-Flicken** in sechs Farben, ohne Naht und ohne Namen: andere Hunde sind „gestickt in Fäden“, wir sind genäht und liegen oben; weiche Überlappung ändert nie unsere Farben. Tipp auf einen Flicken öffnet einen **Zettel „Nachbarhund“** (Buddy-Renderer mit dem Look des Hundes, Wesenszeile, „Treffen“ als schlichter Zustand ohne Zahl) mit dem **Pfoten-Roboter-Abzeichen** und dem Wort „simuliert“; das Abzeichen nur dort, nie auf der Karte. Events kommen als **Zettel am Zaun** (Wäscheklammer, höchstens einer sichtbar, kein Zähler) oder als Buddy-Sprechblase am Tor; ältere liegen in der Briefkasten-Liste unter „Post vom Viertel“ (kein Ablauf, kein Rückstand). Pfotenspuren der Reaktions-Events als kleine Stempel auf unserem neuen Boden.
- **Server:** praktisch fertig (Decisions 17-24). Offen: (1) `nearby?include=cells` liefert bis zu sechs Zellmengen; Antwort um ein `rev`/ETag ergänzen, damit die App nicht bei jedem Sync alles lädt (Schätzung: einige Hundert KB im ungünstigen Fall, ungeprüft, messen). (2) Sicherstellen, dass Geschenk-Events ohne gültigen `giftId` keine Sackgasse erzeugen. (3) Anschaltmoment (siehe Frage 2): erst wenn beide Phones den Build haben, sonst verbrennen W1/W2 der Eskalation ungesehen.
- **App:** Karten-Layer „Nachbarn“ (Renderer-Erweiterung: Tönung je Layer, gestrichelter Rand, `visual-design.md`-Tokens prüfen, neue Farben nur mit Eintrag dort); ein reiner Auflöser Event → Zaun-Zettel/Sprechblase (Logik liegt zum Teil schon in `src/sync/householdEvents.ts`, an die Welt anpassen, nicht doppeln); Profil-Zettel; Zeilen `neighbours.line.*` (de/en) aus dem Bots-Design; Test: beide Wörterbücher haben dieselben Schlüssel.
- **Art (Blender, `scripts/blender/`):** Pfoten-Roboter-Abzeichen, Papier-Zettel mit Wäscheklammer, Pfotenstempel (klein), Fähnchen-Zustand am Briefkasten (aufgestellt/unten). Sechs Hunde brauchen **keine** neue Art (Buddy-Renderer aus den Enums). Lücke: Nebels „Stern“-Markierung gibt es nicht (Platzhalter `mask`), Tier-B-Aufgabe später.
- **Daten/Datenschutz:** nur Zellindizes synthetischer Ranges, nie Bot-Routen; Overpass-Anfragen sind grobe Kacheln (im Datenschutzvermerk nennen, Decision 12/24).
- **Spaß-Signal:** nach 7 Tagen sagt Alex unaufgefordert mindestens einmal „Hast du gesehen, was Momo gemacht hat?“ (Selbstauskunft, 1 Frage am Tag 7); Log-Signal: Tipp auf Zettel oder Profil an ≥ 4 von 7 Tagen.
- **Größe:** M (App-Hauptlast, Art S).

### Slice a (L): Partner im Hof (Präsenz)
- **Spieler sieht:** am Gartentor hängt ein Holzschild „Alex ist gerade mit Buddy unterwegs“. Im Viertel wächst ihr Pfad als **Heftfaden** (gestrichelt, noch nicht genäht) mit einem kleinen Marker für sie; nie Strecke, Zeit oder „seit x Minuten“. Kommt sie heim (`walk.added`), läuft bei mir **die Heimkehr im Kleinen**: Buddy bellt am Tor, der Heftfaden wird in 0,6 s zur Naht, Leckerlis rollen leise in den gemeinsamen Napf, ein Satz „Alex ist wieder da.“ Nur Beat 1 und 2 aus `homecomingPlan.ts` (Variante „Partner“), nicht die volle Feier; war meine App zu, wird die Mini-Heimkehr beim nächsten Öffnen **einmal** gespielt (innerhalb 48 h, sonst Stille). Es gibt **keinen** „offline“- oder „zuletzt gesehen“-Zustand; ohne Signal verschwindet das Schild still.
- **Server:** neuer, **flüchtiger** Kanal, nicht in die ewige `events`-Tabelle (Decision 2: Retention „für immer“ wäre für Herzschläge falsch): Tabelle `walk_presence(household_id, player_id, walk_id, started_at, last_seen_at, trail)` mit Upsert je Herzschlag, Pfad auf höchstens ~400 Punkte (15-m-Auflösung, ältere ausgedünnt), Zeile verfällt 5 Minuten nach `last_seen_at`; `walk.finish` und `walk.delete` löschen sie in derselben Transaktion. `POST /v1/presence` (Herzschlag, ≤ 16 KiB, eigenes Limit z. B. 6/min je Gerät, **nicht** auf das Tageslimit von 200 Befehlen anrechnen) und `GET /v1/presence?after=<rev>&wait=<s>` (Zustand des Partners, Long-Poll über den vorhandenen `EventBus` aus `services/events.ts`). Redaction: Koordinaten bleiben aus Logs (Decision 12).
- **Polling oder Long-Poll?** Betrachter: **Long-Poll (≤ 25 s) nur solange die Welt im Vordergrund offen ist**, sonst gar nichts; das ist ein einfacher `fetch`, zählt im Rate-Limit einmal (Decision 16), und passt zu „App synchronisiert nur im Vordergrund“ (Decision 9). Kurzes Polling wäre 10x mehr Anfragen für dieselbe Latenz. Gehender: Herzschlag alle ~30 s aus der laufenden Runde, gebündelt (neue Punkte seit dem letzten Schlag); **keine zusätzliche GPS-Last**. Offen, vor dem Bau auf Gerät zu prüfen (Spike): ob die Runde im Hintergrund (Standort-Dienst, `expo-task-manager` ist schon da) `fetch` zuverlässig ausführen darf, auf Android (Vordergrunddienst) vermutlich ja, auf dem iPhone mit Bildschirm aus unsicher. Rückfall: nur Herzschläge, wenn die Runde im Vordergrund ist; dann sieht man Alex live nur, wenn sie das Handy anschaut, und bekommt sonst „war unterwegs“ per `walk.added`. Ehrlich: **live ist ein Hinschau-Moment**, kein Dauerzustand (Risiko 1).
- **Kein Push:** das iPhone hat kein APNs (kostenloses Team), die Partnerin erfährt Neues beim Öffnen. Android: eine **lokale Benachrichtigung bei Partner-Ereignissen ist nur möglich, solange der Prozess lebt** (eigene Runde läuft, App offen); das ist selten und fühlt sich zufällig an. Empfehlung: **keine** Benachrichtigung in M4. Echte Hintergrundabfrage auf Android bräuchte `expo-background-task` (neue native Abhängigkeit, Dev-Client-Neubau, Owner-Go, Frage 3) mit 15-30 min Verzögerung; FCM-Push wäre eine zweite Stufe. Falls später: opt-in, höchstens eine pro Partnerrunde, Text ohne Namen-Vergleich („Buddy ist wieder zu Hause.“), nie ein Erinnern.
- **App:** die laufende Runde sendet Herzschläge über einen eigenen flüchtigen Pfad (bei Fehlschlag verwerfen, **nie** in die Sync-Outbox, kein Wiederholen); Settings-Schalter „Mitlaufen lassen“ je Spieler (Opt-in, Standard aus, einmalige Einwilligung im Klartext, Decision 12: heute ist Teilen der **fertigen** Runde vereinbart, Live ist neu); Viertel-Layer „Heftfaden“, Tor-Schild, Heimkehr-Variante.
- **Daten/Datenschutz:** Pfad nur an Mitglieder desselben Haushalts, nie gespeichert über das Ende der Runde hinaus (die fertige Runde kommt als normaler Walk); `DELETE /v1/me` leert auch Präsenz; Schalter aus = Server löscht sofort.
- **Spaß-Signal:** Log-Ereignisse `PRESENCE_VIEW_STARTED` und `PRESENCE_SENT`; Ziel: in zwei Wochen mindestens 3 Betrachtungen während einer fremden Runde (der Kern ist das Lachen, wenn man zufällig zusieht, dazu 1 Frage: „Hat sich das lebendig angefühlt?“).
- **Größe:** L (Spike + Server + Welt-Animation + Opt-in).

### Slice d (S): Postkarten teilen
- **Spieler sieht:** Alex' Runden liegen als Postkarten auf **meiner Bank** (Verlauf zeigt schon Haushalts-Walks mit Namen), mit ihrem Stempel „von Alex“. Dazu ein **Gruß**: nach der Runde darf man der Postkarte einen Stempel mitgeben aus einer festen Liste (z. B. „Schön war’s“, „Buddy war müde“, „Tolle Ecke“; ca. 8 Stück, von `game-master` zu schreiben). Der andere findet den Stempel beim Öffnen der Bank. Kein Freitext, kein Antworten, kein Chat.
- **Server:** fast nichts, weil die Postkarte **aus den Walk-Daten auf dem Gerät gerendert wird** (der Partner hat die volle Route schon über den Sync, kein Bild-Upload, kein Objektspeicher). Neu: Befehl `walk.stamp {walkId, stampKey}` (idempotent, ein Stempel je Spieler und Walk, Schlüssel gegen Whitelist geprüft) und Event `walk.stamped`.
- **App:** hängt an Konzept-Schritt 5 (Postkarten statt Walk-Portrait-Zettel); bis dahin Stempel am bestehenden Verlaufseintrag. Reine Anzeige in der Bank, kein Zähler.
- **Datenschutz:** nur Haushalt; Whitelist verhindert Freitext (kein Moderationsbedarf).
- **Spaß-Signal:** Anteil der Runden mit Stempel (Log `STAMP_SENT`); „fühlt sich nett an, nicht wie Pflicht“ per 1 Frage; sinkt die Quote auf null nach Woche 2, ist es trotzdem okay (keine Aufgabe).
- **Größe:** S (nach Schritt 5), vorher S-.

### Slice b-2 (M): Geschenke und Einladungen
- **Spieler sieht:** im **Briefkasten** hebt sich ein Fähnchen (kein Zähler); Antippen öffnet das Geschenk (Halsband, Stock, Bankkissen, Hof-Deko oder winziger Leckerli-Regen, Decision 20: 5 % einer Durchschnittsrunde, kein Anfängerglück-Doppel). Der Zettel „Bruno geht um 18:00 am Kanal, kommst du?“ am Zaun trägt einen Knopf „Ich komme mit“; wer mitgeht und innerhalb −30/+60 min startet, bekommt das Foto-Moment-Sticker „mit Bruno“, nächsten Morgen Zeile 10. Nicht mitgehen kostet nichts, es gibt keine Erinnerung.
- **Server:** `POST /v1/invitations/:id/accept` und der Sticker-Zweig sind laut Decisions-Log (f) noch offen (`thanksCome` und Lottes Kissen warten darauf); Besitz-Liste der Kosmetika aus geöffneten Geschenken im Snapshot.
- **App:** Geschenk-Öffnen über den vorhandenen Befehl `gift.open` (Server: erster Öffner gewinnt), Kosmetik-Anzeige (Halsband am Buddy, Stock im Hof); es gibt heute **kein** Kosmetik-Inventar (Decision 20), nur Ableitung aus Geschenken.
- **Art:** 2 Halsbänder, Stock-Prop, Bankkissen, 2 Hof-Deko, Briefkasten-Fähnchen, Socke (Nebel), Mond-Doodle.
- **Daten:** nichts Neues. **Spaß-Signal:** Geschenke werden innerhalb von 48 h geöffnet (Log), Einladung wird mindestens einmal in zwei Wochen angenommen.
- **Größe:** M.

### Slice b-3 (S/M): Viertel-Runde am Zaun
- **Spieler sieht:** ein Holzschild „Viertel-Runde“ am Zaun mit einem **Faden-Fortschritt** (eine Verhältniszahl, keine Kilometer, kein Mensch-gegen-Bot-Split), ab Woche 3; bei Abschluss Zeile 7 und ein Blumenbeet im Hof (für beide Spieler). Kein Verlustzustand; Überhang trägt weiter (Decision 21).
- **Server:** `GET /v1/coop/week` und `coop.progress` sind gebaut; offen: `game-master` bestätigt die Zahlen (P 4-12 km, B ≤ 60 % von G, Ziel eher 10-30 km statt 4-12; Decisions-Log (d)). **App:** Schild, Beet-Dekoration aus `yardDecorations`. **Art:** Holzschild (vorhanden, 3 Größen), Blumenbeet. **Spaß-Signal:** Abschluss in Woche 3 oder 4 ohne dass jemand „extra rausmusste“ (Frage: „Warst du wegen des Schilds draußen?“; ein Ja ist okay, ein „genervt“ nicht). **Größe:** S bis M.

### Slice c (M): Gemeinsame Ecken
- **Spieler sieht:** eine Stelle, an der wir oft sind, bekommt eine kleine Kulisse auf dem Teppich (Bank, Laterne) und ein **Namensschild, das einer von uns vergibt** („Kiosk-Ecke“); der andere sieht den Namen und kann ihn **umbenennen** (letzter Schreiber gewinnt, kosmetisch). Antippen: Name ändern, Buddy-Pose, Postkarten von dort. Die Lieblingsecke, nicht die Fläche, ist die Hauptzahl (Konzept 2b).
- **Server:** Tabelle `corners(id, household_id, cell_ix, cell_iy, name, created_by, updated_at)`, Befehl `corner.name` (idempotent, Name 1-24 Zeichen), Event `corner.updated`; **Erkennung** der Kandidatenstelle serverseitig aus `cell_days` (z. B. ≥ 4 verschiedene Tage in einem 3x3-Zellblock, Zahl in `src/economy` ablegen, `game-master` bestätigt) und als Vorschlag im Snapshot, damit beide Telefone dieselbe Ecke sehen (sonst zwei Ecken für dieselbe Straße, derselbe Fehler wie bei Territorien, Decision 1). Bots lösen nie Ecken aus; Bot-Ereignisse „an deiner Ecke“ (Momo schnüffelt) beziehen sich auf diese Ecken, sobald sie existieren.
- **App:** hängt an Konzept-Schritt 7 (Ecken lokal) und wird dort **von Anfang an haushaltsfähig** gebaut (kein späteres Umrüsten); Name aus Sync.
- **Daten:** nur Haushalt. **Spaß-Signal:** innerhalb von zwei Wochen nach Erscheinen haben wir mindestens eine Ecke benannt und die Namen des anderen gesehen; die Frage „Heißt sie bei dir auch so?“ wird gestellt.
- **Größe:** M (nach Schritt 7), vorher nichts bauen.

### Slice e (L, später): Echte Nachbarn
Eigener Change mit eigener Spec (neue Spielerregeln, Tier A), **nicht** vor M5. Was sich ändert:
- **Sichtbarkeit:** eine zweite echte Familie sieht von uns nur Ranges, nie Routen, nie Live. Vor dem Teilen: Zellen im 150-m-Heimblock entfernen (der Server kennt den Anker schon, Decision 17), nur Zellen mit ≥ 2 verschiedenen Tagen, Aggregat auf 2x2 Zellen (40 m), 100-m-Startfuzz wie in `game-backlog.md` und Decision 12; keine Zeitstempel feiner als „diese Woche“. Weiche Überlappung wie bei Bots: unsere Farbe oben, nie schrumpfend.
- **Einwilligung:** getrennter Schalter „Für Nachbarn sichtbar“ (Standard aus), Verknüpfung nur beidseitig; jederzeit lösen; Lösen entfernt die Daten aus der anderen Sicht beim nächsten Sync.
- **Identität:** weiter **Einladungscodes** (Haushalt lädt Haushalt ein: Nachbarschaftscode, 24 h, einmalig); plus „Gerät wechseln“-Code, damit Freunde ohne ssh ein neues Handy koppeln können. Sign in with Apple/Google erst vor einem öffentlichen Store-Release, über die Authenticator-Naht (Decision 7); Sign in with Apple braucht vermutlich die bezahlte Apple-Mitgliedschaft (vor Planung prüfen).
- **Rangliste:** Spec `anti-snowball.md` verlangt PLZ-Rangliste mit rollierenden 7 Tagen. Mit 2-3 Haushalten wäre das ein Duell (PvP) und widerspricht dem Ton. Vorschlag: zuerst **nur kooperativ** (Viertel-Runde über verknüpfte Haushalte, rollierende 7 Tage als Summe), Ranglisten-Anzeige erst ab ~30 Haushalten je PLZ-Gebiet, dann ohne Plätze für den Rest („Platz 17 von 40“ nie anzeigen), nur eine Würdigung der Wochen-Spitzen als Stempel; Spec-Änderung mit `game-master` (Frage 5).
- **Moderation:** kein Freitext zwischen Haushalten (nur Stempel/Whitelist); Hundenamen und Anzeigenamen sind Freitext: Länge, Block-Liste, „Melden“ und „Blockieren“ in der App (Store-Regeln für nutzergenerierte Inhalte), Operator-CLI `block-household`.
- **Missbrauchsgrenzen** am öffentlichen Funnel: max. 8 Verknüpfungen je Haushalt, 5 Verknüpfungsversuche/Tag je Haushalt, vorhandene IP-Limits und Sperren (Decision 16) bleiben; vor dem ersten fremden Haushalt zusätzlich Lasttest und Anzeige-Cap je Abfrage.
- **Recht:** Datenschutzerklärung, Impressum, AV-Vertrag mit dem Cloud-Anbieter, kurze DSFA (Standortdaten), Altersfrage; kein Rechtsrat, Anwalt/Datenschutzbeauftragter vor dem ersten Nicht-Freund.
- **Umzug in die Cloud:** wenn eines zutrifft: ≥ 5 Haushalte außerhalb des Freundeskreises, Verfügbarkeit des Heimnetzes stört, oder die Bot-/Overpass-Last bremst TGA. Weg: kleiner EU-Server mit dem vorhandenen Compose, `pg_dump` zurückspielen, Server-URL in den Einstellungen ändern (Decision 13); der Restore-Test aus F2 ist die Voraussetzung.
- **Spaß-Signal:** die Freunde melden sich selbst nach einer Woche mit „Wir waren an eurer Ecke“-Sätzen; kein Meldefall. **Größe:** L (Spec M, Server L, App M, Recht eigener Strang).

### Slice f (laufend): Betrieb
Gestaffelt, jeweils mit Eintrag im Decisions-Log:
- **F0 (vor M3, S):** (1) **API-Level**: jede Antwort von `snapshot`/`events` trägt `apiLevel`; die App kennt ihr Maximum, zeigt bei „Server neuer“ im Briefkasten ruhig „Es gibt ein Update“ und bleibt bei ihren Funktionen; unbekannte Event-Arten **ignorieren** (im `switch` von `src/sync/apply.ts` prüfen, ein Test mit erfundener Art ergänzen). Regel: innerhalb eines Levels nur additive Felder, Server wird **vor** der App ausgerollt, Brüche bekommen `/v2`. `/healthz` bleibt unverändert (Decision 16: keine Version nach außen). (2) **Restore-Probe** als Skript `ops/restore-drill.sh`: letzten Dump in einen Wegwerf-Container einspielen, Zeilenzahlen von `walks`, `cells`, `den_state` vergleichen, Ergebnis in `backups/drill.log`; monatlich vom Owner, nach jeder Migration einmal. (3) **Zweite Kopie** der Dumps außerhalb der Platte (Owner zieht wöchentlich per rsync auf den Mac; heute liegen Dump und Datenbank auf derselben Platte).
- **F1 (vor M4, S):** `cli report` („Morgenbericht“): Anzahl Syncs, Fehler `SYNC_RUN_FAILED`, 401/429, Sperren, Bot-Tick ok/übersprungen, Overpass-Fehler, letzter Kontakt je Gerät; ein Leitfaden „Logs lesen“ in `server/README.md` (`make device-logs` mit den drei gängigen Filtern). **Beszel** (Tailnet, Regel 11 in SERVER.md, nichts umstellen): Alarmgrenzen für api-Speicher > 80 % von 384 MB und Platten-Füllstand; Gegenprobe von außen: ein selbstgebautes Ping-Skript auf dem Mac gegen `/healthz`, nicht über Dritte. **Ratelimits mit Bots:** Budget je Gerät dokumentieren (Sync, Long-Poll zählt 1, Präsenz eigenes Limit); Bots erzeugen ~1-2 Events/Tag je Haushalt, kein Problem; Vorsicht bei `nearby?include=cells` (Slice b-1: ETag).
- **F2 (vor M6, M):** Overpass-Höflichkeit: Kontakt im User-Agent, nie 02:00-06:00, Kacheln dauerhaft zwischenspeichern (nur nach > 90 Tagen erneuern), ein Spiegel per `OVERPASS_URL` wählbar, Obergrenze Anfragen/Tag; bei > ~50 Haushalten lokaler Auszug statt öffentlicher Instanz. Zweiter Server-Stand für Tests (`NEIGHBOURS_ENABLED` und neue Slices erst testen, dann live), Kill-Switch-Probe (`docker compose stop api` im Alltag testen, Spiel läuft weiter).
- **OTA-Regel:** JS/Asset-Änderungen per EAS-OTA an beide Telefone; alles mit nativer Änderung (neue Abhängigkeit, `app.json`) braucht neuen APK/IPA und ist Owner-Go; das iPhone läuft mit kostenlosem Team nur 7 Tage, bis dahin ist die Partnerin im Zweifel auf altem Stand: deshalb die API-Level-Regel.

## 4. Reihenfolge und Meilensteine

| Meilenstein | Inhalt | Ein-Satz-Demo |
|---|---|---|
| **M3 „Nachbarn am Zaun“** | F0, b-1 (Server anschalten am Tag, an dem beide den Build haben) | „Momo hat an unserer Ecke geschnüffelt“ liegt morgens als Zettel am Zaun, und sein gestrichelter Flicken liegt neben unserem im Viertel. |
| **M4 „Alex im Hof“** | F1, a (Präsenz), d (Postkarten-Stempel) | Alex sieht meinen Pfad live als Heftfaden wachsen, und als ich heimkomme, näht sich bei ihr die Naht im Kleinen. |
| **M5 „Post und Ecken“** | b-2, b-3, c | Pfote hat ein Halsband in den Briefkasten gelegt; und die „Kiosk-Ecke“ heißt bei uns beiden gleich. |
| **M6 „Ein Freund im Viertel“** | F2, Vorarbeit für e (Spec, Datenschutz, Melden/Blockieren), Test mit **einem** befreundeten Haushalt | Ein Freund mit Hund taucht als echter gestrichelter Flicken an unserem Rand auf, ohne dass einer von uns seinen Weg sieht. |

Abhängigkeiten, die oft übersehen werden: d braucht Konzept-Schritt 5, c braucht Schritt 7 (beide gehören zur Welt, nicht zum Multiplayer); b-1 und a sind unabhängig und könnten parallel laufen (zwei Agenten, getrennte Dateien: Karten-Layer gegen Präsenzkanal); b-2 braucht b-1. Die Eskalation der Bots läuft in **Kalenderwochen** (W1 Momo/Pfote … W4 Nebel), darum ist M3 zuerst: jede Woche früher ist eine Woche früher gelernt, ob die Hunde tragen.

## 5. Risiken (die sechs wichtigsten)

1. **Live-Präsenz wird kaum gesehen** (eine geht, die andere schaut selten zu; Hintergrund-`fetch` auf dem iPhone unsicher). Gegenmittel: Spike vor dem Bau, kleinster Kanal, Messung per Log, bei Flop auf die Mini-Heimkehr reduzieren (die trägt allein).
2. **Das iPhone ist das schwächste Glied:** kein APNs, 7-Tage-Neuinstallation, iOS-Hintergrund-Standort ungetestet. Jede Funktion muss ohne Push und mit seltenem Öffnen sinnvoll sein; ein verfallener Build sieht aus wie „Server kaputt“. Gegenmittel: Briefkasten-Zeile „Zuletzt synchronisiert“, Frage 4.
3. **Bots wirken beliebig oder eingeschnappt-künstlich:** früh nur 4 nutzbare Zeilen (Log (g)), Offset-Rückfall sieht nach „unseren eigenen Wegen“ aus, wenn Overpass fehlt. Gegenmittel: Tag-7- und Tag-14-Check durch `game-master`, `generator`-Anteil im Morgenbericht, Kill-Switch `NEIGHBOURS_ENABLED`.
4. **Datenschutz/Exposition:** öffentlicher Funnel, Token unverschlüsselt auf dem Gerät, jetzt auch Live-Standort; später fremde Haushalte. Gegenmittel: Opt-in je Person, flüchtige Präsenz, Whitelist statt Freitext, `expo-secure-store` und Rechtsprüfung vor jedem fremden Haushalt.
5. **Heimserver als Einzelstelle** (Strom, Router, gleiche Platte für Dump, 7,1 GB RAM mit TGA, Overpass-Abhängigkeit). Gegenmittel: F0/F1, Restore-Probe, zweite Kopie, Cloud-Auslöser benannt.
6. **Versions- und Scope-Drift:** OTA bringt neue App auf ein Gerät und nicht aufs andere; oder soziale Funktionen rutschen in Chat/PvP. Gegenmittel: API-Level, additive Regel, Abschnitt 6 als Prüfliste für jeden Slice.

**Offene Fragen an den Owner** (je ein Wort oder ein Satz):
1. Live-Präsenz: Pfad als Heftfaden, nur ein Punkt, oder nur das Schild „unterwegs“? (Pfad / Punkt / Schild)
2. Soll `NEIGHBOURS_ENABLED=true` erst an dem Tag angehen, an dem beide Telefone den M3-Build haben? (Ja / schon vorher)
3. Android-Hintergrundabfrage für „Buddy ist wieder zu Hause“ mit neuer nativer Abhängigkeit (`expo-background-task`, Dev-Client-Neubau): jetzt, später oder nie? (Jetzt / später / nie)
4. Bezahltes Apple-Developer-Programm kaufen (löst 7-Tage-Neuinstallation und APNs, ermöglicht Sign in with Apple)? (Ja / später / nein)
5. PLZ-Rangliste aus der Anti-Snowball-Spec durch eine rein kooperative Viertel-Summe ersetzen, bis es sehr viele Haushalte gibt? (Ja / nein)

## 6. Was wir bewusst nicht bauen

- **Kein Chat, kein Freitext zwischen Haushalten** (nur Stempel aus fester Liste), keine Antworten, keine Reaktionszähler.
- **Kein PvP und keine Gebietsabnahme:** nichts erobert, zerstört oder schrumpft ein fremdes Revier (Wörter: beanspruchen, verteidigen, beschützen).
- **Kein Streak-Druck, keine Erinnerungen an Verpasstes, keine „Alex war schon unterwegs“-Vergleiche**, keine Abwesenheitsmeldungen, kein „offline“, kein „zuletzt gesehen“.
- **Keine Rangplätze für Nicht-Spitzen**, keine Mensch-gegen-Bot-Zahlen, keine Kilometervergleiche zwischen Spielern.
- **Keine Live-Position über Haushaltsgrenzen** und keine Routen fremder Haushalte, nie; Start-Fuzz und Heimblock bleiben Pflicht.
- **Kein Push, solange kein Owner-Go** (iPhone ohne APNs; Android nur mit neuer Abhängigkeit); keine Hintergrund-Aufgaben ohne Freigabe.
- **Keine Verwaltungsendpunkte im Netz:** Haushalte, Sperren, Löschungen bleiben Operator-CLI per ssh (Decision 7/16).
- **Keine Bezahl-Ebenen, keine Werbe-IDs, kein E-Mail-Login** in dieser Stufe.
- **Keine Täuschung über Bots:** Nachbarhunde bleiben offen „simuliert“ (Pfoten-Roboter-Abzeichen auf dem Zettel), und echte Nachbarn werden nie mit Bots vermischt dargestellt.

Prüfliste pro Slice: Spec-Änderung zuerst (falls Spielregel), `game-master` für Text, `senior-architect` bei Server-Schema und Kanälen, Check-auf-Gerät-Liste für den Owner, Eintrag im Decisions-Log (`design.md` dieses Changes) und README-Status.
