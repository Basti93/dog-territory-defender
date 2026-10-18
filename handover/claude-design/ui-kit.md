# UI-Kit: Komponenten, Props, exakte Werte

Quelle: `src/ui/` (React Native, kein Web-CSS). Alles kommt aus `src/ui/theme.ts` und `src/ui/tokens.ts`. Stil: weicher Clay-Look, Frühlings-Pastell, dicke runde Formen. Kein Dark Mode, keine neuen Farben ohne Begründung (Tints entstehen per `mix()` aus Tokens).

## Tokens (`tokens.ts`)

| Name | Hex | Rolle |
|---|---|---|
| green | `#2ECC71` | Primär, Revier/Wachstum, Primary-Button-Fläche |
| blue | `#3498DB` | Karte/Sicherheit, Sky-Tint |
| warm | `#F39C12` | Sammelobjekte/Freude, Map-Pin, Warm-Tint |
| brown | `#8B6F47` | Hund/Abzeichen, Schattenfarbe |
| meadow | `#DCE8BE` | "Wildes" Gras, Bloom-Ende, Border-Basis |
| white (Creme) | `#FAFAF8` | App-Hintergrund |
| text | `#1A2A1A` | Fließtext (dunkles Grün, nie reines Schwarz) |
| muted | `#8A9A8A` | Roh-Wert, wird für Text abgedunkelt (siehe palette.muted) |

Konfetti-Farben: green, blue, warm, brown, meadow.

## Abgeleitete Palette (`theme.ts`, `mix(a,b,t)` = lineare RGB-Mischung)

| Name | Formel | ca. Hex |
|---|---|---|
| background | tokens.white | `#FAFAF8` |
| card | Reinweiß, bewusst keine Token-Farbe | `#FFFFFF` |
| text | tokens.text | `#1A2A1A` |
| muted | mix(text, muted, 0.62) | ca. `#5F6F5F` (13 pt auf Creme mind. 4.5:1) |
| greenText | mix(green, text, 0.3) | dunkleres Grün für grünen TEXT (Ghost-Button, Auswahl) |
| primary | tokens.green | `#2ECC71` |
| border | mix(meadow, white, 0.4) | helles Wiesengrün |
| meadowTint | mix(#FFFFFF, meadow, 0.45) | Karten-Tint "meadow" |
| skyTint | mix(#FFFFFF, blue, 0.14) | Karten-Tint "sky" |
| warmTint | mix(#FFFFFF, warm, 0.14) | Karten-Tint "warm" |
| shadow | mix(brown, text, 0.3) | warmer Schatten, nie reines Schwarz |

Ausnahme-Farben außerhalb der Tokens (Bestand, bitte bewusst übernehmen oder ersetzen): Sprite-Palette der Blender-Szenen (siehe README Abschnitt 8), Hundefell-Palette (`BUDDY_PALETTE`, siehe unten).

## Radien (`radii`)
card 24, pill 999, chip 14, button 28, tile 20.

## Abstände (`spacing`)
xs 4, sm 8, md 12, lg 16, xl 24, xxl 32.

## Typografie (`type`), Schrift: Nunito (OFL) Regular/SemiBold/Bold/ExtraBold

| Stufe | Größe / Zeilenhöhe | Gewicht | Rolle |
|---|---|---|---|
| display | 32 / 38 | 800 | Titel, große Zahlen |
| h1 | 24 / 30 | 700 | Screen-Titel |
| h2 | 18 / 24 | 700 | Karten-Titel |
| body | 16 / 22 | 600 | Fließtext, Buttons |
| small | 13 / 18 | 600 | Zweitinfo |
| min | 12 / 16 | 600 | absolutes Minimum (`MIN_FONT_SIZE = 12`, nie darunter) |

Gewichte laufen über getrennte Font-Dateien (Android ignoriert `fontWeight`), also nur diese vier Schnitte.

## Schatten (`shadows`, iOS: shadowOffset/Opacity/Radius; Android: nur `elevation`, Farbe `palette.shadow`)

| Name | offsetY | opacity | radius | elevation |
|---|---|---|---|---|
| soft | 2 | 0.10 | 6 | 2 |
| card | 4 | 0.14 | 12 | 4 |
| floating | 8 | 0.20 | 18 | 8 |

Hinweis: Android kennt keinen weichen Schatten mit Radius, nur Elevation (grauer Rand). Design nicht auf weiche, farbige Schlagschatten verlassen.

## Komponenten (alle nehmen zusätzlich `style`)

| Komponente | Props | Beschreibung |
|---|---|---|
| `Screen` | `scroll`, `backdrop='sky'\|'none'`, `contentStyle` | Seitenrahmen mit Safe-Area, optionaler Himmel-Backdrop (blauer Verlauf aus Bild `doorstep-sky`) oben, Creme-Hintergrund. |
| `Header` | `title`, `icon`, `onBack`, `right` | Zeile mit rundem Zurück-Button (weiße Pille), Icon-Sprite, h1-Titel, optional Slot rechts. |
| `Card` | `tint='meadow'\|'sky'\|'warm'` (sonst weiß), `title` | Weiße oder getönte Karte, Radius 24, Schatten `card`, optionaler h2-Titel. |
| `Button` | `label`, `onPress`, `variant='primary'\|'secondary'\|'ghost'`, `icon`, `pulse`, `disabled` | Pille, Radius 28. Primary: grüne Fläche, Creme-Text, Icon-Sprite links; Secondary/Ghost: Creme-Fläche mit Wiesen-Rand und greenText. `pulse` = langsames Glimmen (stoppt nach ca. 10 s oder erster Berührung). Druck: Spring-Scale. |
| `Chip` / `Badge` | `label`, `icon`, `tint` | Kleine Pille/Etikett, Radius 14, z. B. "217 / 4.237 Leckerlis" mit Knochen-Icon. |
| `StatTile` | `value`, `label`, `icon`, `decimals`, `format` | Kachel (Radius 20) mit Icon, großer Zahl (zählt hoch) und Label. In einer Reihe mit `gap`. |
| `ListRow` | `title`, `subtitle`, `icon`, `onPress`, `hideChevron` | Tippbare Karten-Zeile mit Icon-Sprite links, Titel, Chevron rechts (Doorstep: "Bisherige Runden", "Statistik & Abzeichen"). |
| `EmptyState` | `title`, `message`, children (Buddy) | Leerer Zustand: Buddy-Avatar, Titel, freundlicher Satz. Nie Schuld, nie "nichts hier". |
| `ArtImage` | `art`, `size`, `width`, `height` | Zeigt ein Sprite (contain), Platzhalter wenn PNG fehlt. |
| `PressableScale` | | Press-Feedback (Spring auf 0.96). |
| `AnimatedNumber` | | Zählt hoch (unter 1,2 s, per Tipp überspringbar). |
| `Confetti` | | 24 Teilchen in Konfetti-Farben, sanft ("Dankeschön", kein Spielautomat). |
| `TreatPop` | | "+N"-Aufpoppen nur beim Öffnen/Zurückkehren, nie wiederholt. |
| `FadeSlideIn` | | 200-300 ms Einblenden (nie um WebView-Screens: Karte, Portraits). |

## Icon-Sprites (256 px, Blender, `ArtImage art="icon-..."`)
icon-treat (Knochen), icon-paw, icon-pin, icon-badge, icon-home, icon-settings (Zahnrad, blau), icon-walks (Pfotenspur grün), icon-den (Hütte mit Herz).

## Hundefell-Palette (`BUDDY_PALETTE`, nur für den Hund, nie für UI)
Felle: cream `#F3E3C3`, golden `#E0A94E`, ginger `#C8672E`, chocolate `#6B4429`, charcoal `#4A423E`, grey `#A9A8A2`, white `#F7F2EA`, tricolour (Basis `#F7F2EA` + ginger/charcoal Flecken). Akzente (Brust/Schnauze): cream `#FBEFD5`, white `#FFFDF7`, tan `#E8C99A`. Nase: dunkel `#2B2523`, braun `#5A3A28`, rosa `#E59A9A` (auch Zunge/Wangen).

## Blender-Szenen-Palette (`scripts/blender/common.py` HEX)
grass `#7FD67F`, grass_dark `#4FBF6B`, meadow `#DCE8BE`, sky `#8CCBF2`, warm `#F7B84B`, brown `#B08D5E`, brown_dark `#7A5C3A`, cream `#FAF6EA`, coral `#F2786E` (Dächer), pink `#F8A9C4`, lav `#B9A8EA`, yellow `#FFDA6A`, white `#FFFFFF`, dark `#4A3A2C`, blue `#5DADE8`, mint `#9BE3C0`.
