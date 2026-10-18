# Mockups „Unser Viertel“ (für die Implementierung)

Drei Screens bei 390×844 pt, je als `.png` (2x, zum Anschauen) und `.html` (Quelle: exakte Farben, Formen, Positionen; reine HTML/SVG, im Browser zu öffnen). `yard-ground.png` ist der Hofboden aus `assets/art/`. Lebende Fassung mit Kommentaren: https://claude.ai/artifact/VWkH1frPVWx2Xwjahbj5Yg. Das Konzept dahinter: `../konzept.md`.

| Datei | Screen | Was er zeigt |
|---|---|---|
| `01-hof` | Der Hof (Start) | Himmel mit Tageszeit, Viertel am Horizont, Zaun mit Tor + Schild „Gassi gehen“ (einziger Primär-Tipp), Buddy am Tor, Hütte, Bäckerei mit Wimpel „Ausbau möglich“, Napf + Leckerli-Schild, Bank = Album, Briefkasten = Post |
| `02-viertel` | Das Viertel | Flickenteppich über leiser Karte: Flicken gewohnt/frisch/wild mit Naht, Trampelpfad mit Pfotenstempeln, „unsere Ecke“ mit Kulisse und Schild, Pin auf hohem Gras, Kreideskizze für Unbekanntes, Zahlen-Schild, Zaunkante „zurück zum Hof“ |
| `03-heimkehr` | Heimkehr, Beat 1 | Kamera über dem neuen Flicken, Naht läuft, neue Straßen koralle markiert, die eine Zahl auf dem Schild, Buddy kommt durchs offene Tor, Schlusssatz zur konkreten Runde |

## Stilregeln, die in den Dateien stecken

- **Zwei Materialien:** Alles Räumliche (Hof, Buddy, Gebäude, Zaun, Tor, Bank, Briefkasten) ist Filz/Plüsch mit sichtbarer Naht (Creme `#FFFBF0`, gestrichelt 4/4 oder 7/5, runde Enden). Alles Flächige (Viertel, Schilder, Zettel) ist Stoff und Holz: Leinen `#EFE7D6` mit Webmuster, Holzschild `#E9C98E` mit Rand `#B08D5E` und 3 px Unterkante `#7A5C3A`.
- **Flicken:** gewohnt `#9FD79A` (Punktmuster `#8CCB88`), frisch `#4FBF6B`, wild `#DCE8BE` mit Grashalmen `#C6D6A0`; Naht Creme 3 px, beim frischen Flicken 4 px. Kacheln darunter nur leicht entsättigt: Blocks `#E4DBC5`, Straßen weiß 10 px. Kreideskizze `#C9B48E` gestrichelt 3/5.
- **Pfad:** `#C9A06A` 7 px bei 55 % plus Pfotenstempel `#8B6F47` 3 px, dash 2/10.
- **Buddy (Filz):** Fell `#E6B259` mit Punktmuster `#D9A24B`, Ohren/Brauen `#C98B3A`, Brust/Schnauze `#FBEFD5`, Nase `#2B2523`, Zunge `#E59A9A`, Wange `#F5B5B5` unter dem nahen Auge, Knopfaugen mit zwei Glanzpunkten, Herz-Flicken `#F2786E` auf der Brust. Teile und Ebenen wie in der SVG-Quelle (Schwanz, fernes Ohr, Körper, Brust, Beine, Kopf, Schnauze, Augen, Brauen, nahes Ohr).
- **Schrift:** Schilder in Fredoka 600/700 (OFL, Google Fonts), Handschrift-Notizen in Caveat 600, Fließtext Nunito. Text immer `#1A2A1A`, grüne Akzente `#1E7A47`, gedämpft `#5F6F5F`.
- **Farben außerhalb der bestehenden Tokens** (in `docs/specs/visual-design.md` nachzutragen): Leinen, Garn-Creme, Holz hell/dunkel, Filz-Grüns, Himmel-Abend `#F7C9A8`/`#FBE3CC`.
- **Keine** Karten-Stapel, keine Listen, keine Gradients. Tiefe nur über Unterkanten und Nähte.

## Was die Mockups bewusst offen lassen

Bewegung (Scroll-Parallax, Nähen-Animation, Tor-Schwung), die Briefkasten-Liste (Einstellungen bleiben eine schlichte Liste auf Papier), Postkarten-Detail, Zaun-Abzeichen, Look-Picker. Siehe Konzept, Abschnitte 6 und 8.
