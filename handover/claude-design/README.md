# Briefing für Claude Design: Dog Territory Defender

Du hast keinen Zugriff auf das Repo. Alles Nötige steht hier und in den Begleitdateien: `ui-kit.md` (Komponenten, exakte Werte), `copy-samples.md` (36 DE/EN-Texte), `screens/` (Ist-Screenshots, Android, 1080x2400), `art/` (Contact Sheets und Vorschauen der heutigen 3D-Sprites). Aufgabe: die ganze App neu stylen und eine 3D-Art-Direction entwerfen, die unsere Blender-Pipeline (Abschnitt 8) wirklich rendern kann. Deliverables stehen in Abschnitt 9.

## 1. Das Spiel in einem Absatz

Dog Territory Defender ist ein standortbasiertes Mobilspiel für Hundebesitzer in der Stadt. Beim Gassigehen zeichnet die App den GPS-Pfad und färbt die Karte unter euren Pfoten grün: das "Revier" wächst mit jeder Runde und schrumpft nie. Zwischen den Runden (die 23,5 Stunden dazwischen) läuft ein Cookie-Clicker-Hintergrundloop: Leckerlis sammeln sich, mit ihnen baut man "den Hof" aus (Hundehütte, Leckerli-Bäckerei, Schnüffelgarten). Im Mittelpunkt steht Buddy, der anpassbare Hund (kein Foto, immer Illustration), der nie traurig, hungrig oder vernachlässigt ist. Frühlingshaft, freundlich, mit einer sanft verrückten Ader. Nordstern: Nach einer Runde schaut man auf die Karte und denkt "Das haben wir gemacht. Wir gehören hierher."

## 2. Spielschleife

1. Haustür öffnen, Buddy begrüßt (Schwanzwedeln, trabt herein), Leckerlis im Napf.
2. "Gassi gehen" drücken, Karte öffnet, Handy kommt in die Tasche (Audio-Cues statt Bildschirm, nie visuelle Unterbrechung während der Runde).
3. Runde beenden: Strecke wird ins Revier gemalt. Ab ca. 200 m echter Strecke gibt es Leckerlis und Hof-XP.
4. Feier-Screen (Höhepunkt der Freude): was markiert wurde, Leckerlis, ggf. Level, neue Straßen, Abzeichen.
5. Leckerlis in den Hof stecken: Gebäude wachsen (5 Stufen, siehe 8.2). Bäckerei backt auch von allein weiter, Hundehütte hat ein Lager (Überlauf ist ein sanfter Hinweis, kein Druck).
6. Zurück zu 1. Anti-Snowball und Soziales sind Mechanik, kein Designthema hier.

## 3. Der heutige Look (Ausgangspunkt, nicht heilig)

- **3D-Clay-Sprites**: vorgerenderte weiche Knetfiguren (Pixar-/Plastilin-Anmutung), runde dicke Formen, Pastell, weiches Studiolicht, leicht von oben (isometrisch-dreiviertel). Code animiert nur PNGs (Atmen, Hüpfen, Wedeln).
- **Clay-UI-Kit**: weiße abgerundete Karten (Radius 24) auf Creme `#FAFAF8`, Pillen-Buttons (Radius 28), weiche warme Schatten, Nunito.
- **Karte**: CARTO-Voyager-Kacheln mit Pastell-Overlay, grünes Revier (Bloom: Wiesengrün `#DCE8BE` für "wild", Grün `#2ECC71` für "frisch"), gestrichelte warme Kontur für "wilde" Flecken, orangefarbener Pin, Wolken-Deko am Kartenrand.
- **Himmel + Hügel**: Haustür und Hof haben blauen Himmel mit Clay-Wolken oben und einen grünen Hügel; der Hof ist der "Held" (ca. 48 % der Bildschirmhöhe, 340 bis 440 pt).
- Schwächen laut Owner: UI-Karten wirken im Vergleich zu den 3D-Sprites noch etwas flach/generisch; die Karte ist funktional, aber nicht so charmant wie der Hof; Settings und Listen sind nüchtern. Hier darfst du mutig sein.

Screenshots: `screens/01-doorstep.png` (Haustür, Buddy schläft), `01b-doorstep-sleepy-alt.png` (zweite Fassung), `02-den.png` (Hof), `03-map-idle.png` (Karte ohne laufende Runde), `04-settings.png` (Einstellungen). Von Feier, Verlauf, Portrait, Onboarding gibt es keine brauchbaren Screenshots; dort bitte aus der Beschreibung in Abschnitt 6 entwerfen. Die Texte in den Screenshots sind teils Debug-Stand (z. B. gemischtes DE/EN "Newt's New Range wird wieder grün"), nicht als Copy-Vorbild nehmen.

## 4. Ton

Frühlingshaft, freundlich, freudig, hundezentriert; warm und feiernd, nicht transaktional. Dazu eine **süße verrückte Ader**: "Die Welt ist zuerst warm und fröhlich und manchmal sanft, harmlos durchgedreht" (Ufo hebt ein Gänseblümchen hoch und gibt es mit Verbeugung zurück, Mond kichert, Enten mit Partyhüten). Warm zuerst, verrückt zweitens, selten.

Sechs "Nie"-Regeln für die verrückte Ader (bindend):
1. Nie Waffen oder Laser (Strahlen heben, leuchten, liefern nur).
2. Nie Buddy erschrecken, verkleinern, verletzen oder bloßstellen.
3. Nie Sarkasmus über die Spielerin oder den Spieler.
4. Nie Angst, Tod, Gore, Düsternis.
5. Nie Belohnungen, Timer oder Serien an den verrückten Extras.
6. Nie den Lauf-Screen unterbrechen oder einen Tipp blockieren.

Weitere bindende Regeln: kein Dark Mode. Nie "erobern/zerstören/töten/kämpfen", sondern "markieren, beschützen, erkunden". Buddy ist nie traurig, hungrig, vernachlässigt oder nörgelnd (keine hängenden Ohren, keine Bettelaugen, kein leerer Napf). Keine Schuldgefühle bei verpassten Tagen, keine "Serie verloren"-Optik. Kein aggressives Monetarisieren, kein Emoji-Overload (höchstens ein Pfoten-Emoji pro Screen), kein Gamey-Chrome (keine XP-Balken überall, keine Power-Meter, keine Kampf-UI). Hunde nie als Foto.

## 5. Glossar (Deutsch ist die Leitsprache; Du-Form)

| Konzept | Deutsch | Englisch |
|---|---|---|
| Walk | Runde / Gassirunde (Verb und Hauptbutton: "Gassi gehen"); "Spaziergang" nur in Fließtext | walk |
| Territory / Home Range | Revier (Mz. Reviere) | territory / range |
| claimed | markiert | claimed |
| The Den | Der Hof ("Dein Hof"), nie "Höhle" | The Den |
| Doorstep (Home) | Haustür | Doorstep |
| treats | Leckerlis | treats |
| Doghouse / Treat Bakery / Sniff Garden | Hundehütte / Leckerli-Bäckerei / Schnüffelgarten | same |
| badges | Abzeichen (Level und XP bleiben) | badges |
| Buddy | Buddy (Name, nie übersetzt); Hundename des Spielers ist frei wählbar | Buddy |
Regeln: kein Genitiv-s an Hundenamen ("Look von {dog}"), Geschlecht des Hundes unbekannt (kein "er/sein"), Buttons kurz (Deutsch ca. 30 % länger).

## 6. Bildschirm-Inventar (15 Screens)

Format: Screen, was er enthalten muss. Alle Screens: Portrait, Android, Breiten 360 bis 430 pt, Statusleiste und Navigationsleiste respektieren (Safe Area).

1. **Haustür (Doorstep)**: Himmel-Hügel-Hero mit Buddy (sitzt, wedelt, schläft bei Zzz) und der Hundehütte des Spielers; Kopfzeile "Hundename · Level N · Titel" (z. B. "Newt · Level 5 · Block-Bummler"), runder Zahnrad-Button (öffnet Menü: Einstellungen, Verpasste Runde nachtragen, Debug-Protokoll). Großer grüner Button "Gassi gehen" mit Pfoten-Icon (sanftes Glimmen), Zeile "Newt bringt 63 Leckerlis pro Runde mit.", Revier-Portrait (stilles Kartenbild des Reviers, WebView), optional eine warme Hinweiskarte ("Wilde" Stelle, Überlauf, Zufallszeile), Listen-Zeilen "Bisherige Runden", "Statistik & Abzeichen", und eine Hof-Teaser-Karte ("217 / 4.237 Leckerlis · Ausbau für 393").
2. **Hof (Den), Hofszene + Karten**: Hero-Szene (Himmel, Hügel, drei Gebäude auf runden Rasen-Tellern, Buddy läuft herum, Level-Pillen "Lv 8" unter Gebäuden, Wild-Extras als seltene Cameos), darunter Leckerli-Kontostand ("217 / 4.237") als große warme Pille, Hinweiskarte "Als Nächstes im Hof: Leckerli-Bäckerei, 393 Leckerlis", je Gebäude eine Karte (Sprite, Name, Untertitel, "Level 8, Platz für 4.237 Leckerlis", nächster Effekt, Button "Ausbauen: 1.025 Leckerlis"), Hundelevel/XP und "Buddy kennt N Straßen". Ausbau muss sich wie "größerer Hof für den Hund" anfühlen, nicht wie Stat-Dashboard.
3. **Karte, während der Runde**: Karte vollflächig, Live-Pfad malt Revier, Strecke/Punkte/Leckerlis gut lesbar aber zurückhaltend, "Runde beenden" (leicht erreichbar, nicht versehentlich) und Abbrechen, kein Blinken.
4. **Karte, nach/ohne Runde (Idle)**: gesamtes Revier (Umriss + Bloom-Füllung), warmer gestrichelter Wildkontur, Marker für den lohnendsten wilden Fleck, Pill "Reviere" oben rechts, Zoom +/-, Wolken-Deko, Attributions-Pille (OSM/CARTO Pflicht), Hinweiskarte unten, Zahlenzeile (Strecke, Punkte, Leckerlis, Level), "Zurück zur Haustür".
5. **Feier (Celebration)**: Höhepunkt der Freude. Konfetti/Burst, Buddy springt, Headline ("Tolle Runde! ..."), "+N Leckerlis" (zählt hoch), Fläche "x m² gehören jetzt euch", optionale Beat-Karten (Frisches Grün, Neue Wege, Neues Revier, Zwei Welten, Level-Up mit alter/neuer Rate, Neues Abzeichen, Cliffhanger "Noch eine Runde bis Titel ..."), Abschluss-Button "Schöne Runde!" mit Schub zur nächsten Runde.
6. **Verlauf (Walk History)**: Liste vergangener Runden (Datum, Strecke, "Belohnt"-Haken oder "Kleiner Bummel", Punkte), Tipp öffnet Portrait, Löschen mit freundlichem Dialog, Leerzustand mit Buddy.
7. **Runden-Portrait (Walk Portrait)**: Erinnerungsbild einer Runde: Pfad auf gedämpfter Revierkarte, neue Straßen farblich abgesetzt, Tag-und-Tageszeit-Phrase ("Dienstagnachmittag"), Name des Reviers, Werte. Soll sich wie ein Sammelbild anfühlen.
8. **Reviere (Territories)**: Liste von Revier-Karten (Portrait, benennbarer Name, Titel wie "Alltagsrevier/Wildes Revier/Fernes Revier", Bekannte Straßen, Runden hier, Leckerlis von hier, "≈N Leckerlis/Std."), Umbenennen, Leerzustand.
9. **Statistik & Abzeichen**: Kacheln (Level, Runden, Strecke, größtes Revier, längste Runde, Leckerlis gesamt, Hof-Level) und Abzeichen-Galerie (verdient mit Datum; Abzeichen müssen sich verdient anfühlen, nicht wie Power-Creep). Abzeichen-Artwork fehlt bisher: Entwurf erwünscht.
10. **Einstellungen**: Gassi-Erinnerungen (3 Slots Morgens/Mittags/Abends mit Schalter und Uhrzeit, Berechtigungs-Status, Test-Button, Akku-Hinweis), Sound, Haptik, Musik, Sound-Test (Chips pro Sound), Look des Hundes ändern, Sprache (System/Deutsch/English), Backup teilen/wiederherstellen (mit Warn-Dialog). Kein Dark-Mode-Schalter.
11. **Onboarding-Karten**: 3 Seiten im Pager (Gassi gehen, Revier markieren, Hof ausbauen), Punkte-Indikator, "Los geht's" und "Überspringen". Je Karte ein Hero-Sprite.
12. **Berechtigungs-Primer**: "Zwei kleine Dinge": Standort und Erinnerungen, je Karte mit kurzer Begründung und Button, beides freiwillig; Zustände "Alles bereit" / "Kein Problem...", "Später".
13. **Hundename**: Frage "Wie heißt dein Hund?", Eingabefeld (Platzhalter "z. B. Buddy"), "Los geht's!".
14. **Look-Picker**: 5 kurze Schritte (Fell, Markierungen, Ohren, Schwanz, Größe) + Abschluss "Das ist {name}! Bereit für draußen?", Live-Buddy-Vorschau, Chips mit Optionsnamen, alles gratis, keine falsche Wahl, "Später". Auch aus Einstellungen erreichbar.
15. **Verpasste Runde nachtragen (Log missed walk)**: Auswahl "Heute früher" / "Gestern", optional bekannter Weg oder "Diesmal woanders", Submit "Runde eintragen". Zählt voll, ohne Abstrich, nie schuldzuweisend.
(+ **Debug-Protokoll**: reiner Entwicklertext, nur Monospace-Liste in Karte, niedrige Priorität. Es gibt sonst keine Kontoseite, kein Leaderboard, keine Shop-Ansicht.)

## 7. UI-Kit und Constraints

Kit, Tokens (Hex), Radien, Abstände, Typo-Skala, Schatten, Komponenten: siehe `ui-kit.md`. Kurzfassung der Tokens: green `#2ECC71`, blue `#3498DB`, warm `#F39C12`, brown `#8B6F47`, meadow `#DCE8BE`, Creme `#FAFAF8`, text `#1A2A1A`, muted `#8A9A8A`. Schrift Nunito (OFL), Weiß der Karten reines `#FFFFFF`.

Technische Grenzen (React Native 0.81, Expo, Android zuerst; iOS später):
- Layout ist Flexbox, kein CSS-Grid, keine Pseudo-Elemente, keine Blur-/Backdrop-Filter, keine Verläufe (keine Gradient-Bibliothek; Verläufe nur als Bild/Sprite). Schatten auf Android nur als Elevation (grauer Rand), keine farbigen weichen Schlagschatten verlassen.
- Neue Farben nur mit Begründung (Tokens sind per Spec fix). Wenn du neue Farben vorschlägst, liefere sie als Erweiterungsliste mit Grund.
- Breiten 360 bis 430 pt, Text nie unter 12 pt (draußen im Sonnenlicht lesbar), Tippflächen mindestens 44 pt, hoher Kontrast für Fließtext (muted-Text mind. 4,5:1).
- Karte ist WebView (Leaflet): Kartenstil als Farben/Overlays lieferbar (Revier-Grün, Wildkontur, Pin, Kartenrand-Deko), aber keine neuen Native-Libraries. Neue native Abhängigkeiten sind tabu.
- Animationen nur Transform/Opacity (nativer Treiber): Hüpfen, Skalieren, Ein-/Ausblenden, 200 bis 300 ms. Kein Lottie, kein 3D zur Laufzeit; alles Räumliche sind vorgerenderte PNGs.
- Bildgrößen begrenzen den Speicher (Mittelklasse-Android): Gebäude 512 px, Icons 256 px, Props 256 px, Buddy-Teile 512 px, Hof-Boden 1536x1024, Himmel 1024, Burst 768.
- Kein Dark Mode, kein Emoji-lastiges UI, Hunde nie als Foto. Zweisprachig: DE ist 30 % länger, Layouts müssen beides tragen.
- (Hinweise zu pointerEvents/WebView-Fades sind reine Implementierung, bitte ignorieren.)

## 8. Art-Pipeline (Blender, headless, deterministisch)

Wir rendern **nicht** per KI-Bildgenerator, sondern mit einem Python-Skript aus Primitiven in Blender 5.x (EEVEE). Das Ergebnis ist reproduzierbar und konsistent, aber auf das beschränkt, was sich aus einfachen Formen modellieren lässt. Entwirf bitte so, dass es dort ankommt. Gib Maße **relativ** an (Bruchteile der Sprite-Box, 0 bis 1; Breite = 1.0 als Einheit), damit unsere Agenten es nachbauen können.

### 8.1 Rig (fest, für alle Gebäude/Icons/Props)
- **Kamera orthographisch** (keine Perspektive). Gebäude und Hof-Objekte: 62 Grad Neigung, 30 Grad Drehung (dreiviertel von oben, leicht von rechts-vorn); Icons: 72/18; Props: 80/8 (fast frontal); Himmel/Burst frontal; Hofboden 78/0 (Hügel von vorn). Der Hund hat eine eigene feste Kamera (75 Grad Neigung, Hund 32 Grad zur Kamera gedreht, blickt nach LINKS).
- **Licht (Dreipunkt, weich)**: warmes Hauptlicht (1.0, 0.93, 0.82) von rechts-vorn-oben, kühles Fülllicht (0.82, 0.9, 1.0) von links, weißes Gegenlicht von hinten links, Weltlicht `#F4F8FF` Stärke 0.5. Farbverwaltung AgX, Belichtung +0.4 (Pastelle clippen nicht). Schatten weich, kein harter Schlagschatten, Hintergrund transparent.
- **Material "Clay"**: Principled BSDF, Roughness 0.6, schwacher Subsurface (0.1), leichter "Fingerabdruck"-Bump (Rauschtextur, kaum sichtbar). Alle Kanten abgerundet (Bevel ca. 0.04 Einheiten, 3 Segmente), Glattschattierung. Dazu `glow()` (emissiv, für Leuchtendes) und `ghost()` (transluzent, für Glas/Strahlen).
- **Palette** (Blender-HEX, bitte erweitern statt ersetzen): grass `#7FD67F`, grass_dark `#4FBF6B`, meadow `#DCE8BE`, sky `#8CCBF2`, warm `#F7B84B`, brown `#B08D5E`, brown_dark `#7A5C3A`, cream `#FAF6EA`, coral `#F2786E` (alle Dächer), pink `#F8A9C4`, lav `#B9A8EA`, yellow `#FFDA6A`, blue `#5DADE8`, mint `#9BE3C0`, dark `#4A3A2C`, white `#FFFFFF`.
- **Was die Bausteine können**: Quader mit Fase (`box`), Zylinder, Ellipsoide/Kugeln (Kugel mit Skalierung), Kegel, Torus, Dreiecksprisma (Satteldach), Stäbe (`rod`), Ketten aus glatter Kugelröhre (`chain`, für Girlanden, Schläuche, Schwänze), Bézier-Bögen, Knochenform, 4-Zack-Stern, Blumen, Büsche, Herzen, Wimpel, Lichterketten, Croissant, Sonnenblume, Pilz, Wolke. Alles Primitive plus Boolean-ähnliche Hüllen.
- **Was NICHT geht**: keine gemalten Texturen, kein Text/Schrift, kein Fell/Haar-Rendering, keine feinen Details unter ca. 2 % der Sprite-Box (verschwinden bei 32 bis 200 dp), keine Organik aus Sculpting, keine Partikel/Flüssigkeit. Gesichter nur aus Kugeln (Augen, Nase), Linien nur als dünne Röhren.
- Bauweise: um den Ursprung, Vorderseite zeigt nach -Y (zur Kamera), Sockel immer ein runder Rasenteller (grüne Scheibe mit braunem Rand) für Gebäude.

### 8.2 Gebäude: je 5 Wachstumsstufen, müssen als EIN Gebäude lesbar sein, das wächst
Leinwand 512x512 px transparent. Füllgrad der Box: Stufe 1 ca. 50 %, Stufe 2 ca. 72 %, Stufe 3 ca. 92 %, Stufen 4 und 5 ca. 93 %. Dach immer koralle, Rasenteller als Anker; Stufe 5 schwebt, behält aber eine Gras-Kachel. Stufen 1 bis 3 "zahm, gemütlich, außergewöhnlich"; 4 und 5 sind die verrückte Ader (Owner will spürbaren Sprung von zahm zu riesig).
- **Hundehütte**: 1 kleine Holzhütte, Satteldach, runder Eingang; 2 größer, Blumenkasten, Fähnchen, Napf und Knochen; 3 Villa mit Turm, Rutsche, Knochen-Teich, Wimpel, Lichter; 4 Baumhaus-Observatorium (Hütte in Eiche, Messing-Teleskop, Hängematte, Lichterketten); 5 winzige Orbitalstation (gleiches Dach mit Schornstein auf kleinem Asteroiden, Portal-Tür, knochenförmiger Satellit, Bullauge mit Buddys Gesicht).
- **Leckerli-Bäckerei**: 1 winziger Keks-Wagen; 2 Laden mit gestreifter Markise, Keksregal, Knochen-Schild; 3 knochenförmiges Gebäude mit Kuppeln, Schornstein, Kuchenauslage, Knusperweg; 4 Food-Truck-Bäckerei (Förderband mit Dampf, Croissant-Wetterfahne); 5 kosmische Knochen-Bäckerei (Ofen öffnet sich zu Sternenwirbel, Knochen kreisen wie Monde, freundliche Tentakelhand reicht Leckerlis).
- **Schnüffelgarten**: 1 kleines Beet mit Keimlingen; 2 Beet, Blumen, Zäunchen, Gießkanne; 3 üppiger Garten (Baum, Sonnenblume, Regenbogen, Brunnen, Leiter/Baumhaus); 4 leuchtendes Gewächshaus (Glaskuppel, Riesensonnenblumen, leuchtende Pilze); 5 schwebender Garten (Beet auf Wolke, Möhren kopfüber, Regenbogen-Sprinkler, schwerelose Eiche).
- Sprite-Anzeige im Hof: Boxen ca. 280 bis 300 px, ca. 10 % Überhang an den Rändern; Ausbau-Stufen im Hof wechseln bei Gebäudelevel 4, 10, 20, 35 (Stufe 1 bis 5).

### 8.3 Wild-Extras (Props, 256x256, transparent, Kamera 80/8, Füllung ca. 88 %)
prop-ufo (Mini-Ufo, Pastell), prop-beam (separater sanfter Lichtkegel, nur zum Heben/Leuchten), prop-comet-bone (knochenförmiger Komet mit Regenbogenschweif), prop-duck-party (Ente mit Partyhut), prop-squirrel-raincoat (Eichhörnchen mit Regenmantel und Pilzschirm), prop-mailbox (blauer Briefkasten mit Periskop), prop-sock (nasse Socke), prop-gnome (Gartenzwerg am Teetisch), prop-cloud-tea (Wolkengesicht mit Tasse), prop-moon-cheese (Mond als Käse, schlafend/zwinkernd), prop-firefly (Leuchtpunkt), prop-lightbulb (Glühbirne), prop-question (Fragezeichen, lavendel). Auslöser (alle selten, kosmetisch, ohne Belohnung): Gänseblümchen-Entführung am Wochenende, Mond-Cameo nachts, Regentanz-Eichhörnchen im Herbst, Komet bei langer Runde, Briefkasten-Portal jede 10. Runde, Enten-Parade am Montag, Leuchtkäfer bei Gebäude-Level-Up (formen ein Hundegesicht), Tee-Besuch nachmittags.

### 8.4 Icons (256x256, Kamera 72/18, Füllung 80 %)
Bestehend: Knochen, Pfote, Pin (koralle), Abzeichen (Rosette mit Band), Haus, Zahnrad (blau), Pfotenspur (grün), Hütte mit Herz. Alle ein einzelnes Objekt mit klarer Silhouette, erkennbar bei 32 dp. Weitere Hintergründe: Hofboden-Hügel (Wiese mit Gänseblümchen, 1536x1024), Himmel mit Clay-Wolken (1024, deckend), Konfetti-Burst radial (768).

### 8.5 Buddy (der Star)
- Pose sitzend, **blickt nach links**, Dreiviertel von oben, großer Kopf, kugelige Formen. Alle Teile liegen auf **derselben 512x512 Leinwand** am selben Ort (wie ein zerschnittener fertiger Hund), damit sie sich exakt stapeln.
- Teile (hinten nach vorn): Schwanz, Ohr rechts (fern), Körper (Rumpf, Hinterpfote, fernes Vorderbein), Vorderbeine (nah), Kopf (Schnauze, Nase, geschlossener Mund, ohne Augen und Ohren), Augen offen, Augen geschlossen, Mund glücklich (Zunge), Ohr links (nah, überlappt Kopf), dazu Zzz-Zeichen. Der Code dreht Kopf um den Hals, wedelt den Schwanz, bewegt Ohren und Beine.
- Varianten: **3 Ohrenformen** (Schlappohren, Stehohren, Kippohren), **3 Schwänze** (geringelt, gerade, wuscheliger Stummel), **8 Felle** (Creme, Goldgelb, Fuchsrot, Schokobraun, Anthrazit, Grau, Weiß, Dreifarbig, Hex in `ui-kit.md`), **Markierungen** (keine, Fleck, Söckchen, Maske; als dünne Overlay-Schale, Farbe abhängig vom Fell), Größen klein/mittel/groß (reine Skalierung 0.88/1.0/1.12 um die Füße), 3 Akzentfarben (Brust/Schnauze).
- Zusatz-Sprites: **Liegepose** (Sphinx, Kopf auf Pfoten, Augen zu, Schlappohren, Ringelschwanz, alles in einem Bild) und zwei **Lauf-Vorderbeine** (A vor, B zurück).
- Verboten: Buddy nie traurig, hungrig, verängstigt, mit Bettelaugen oder hängenden Ohren/Schwanz. Stimmungen: ruhig (Atmen, Blinzeln), glücklich (Hüpfen, Zunge), aufgeregt (Springen, Rotor-Schwanz), müde (zusammengerollt, ein winziges "z", nie einsam), neugierig (Kopf schief, Pfote heben).
- Für das Redesign: Buddy ist heute leicht "niedlich-generisch". Mehr Persönlichkeit, aber gleiches Teile-System (jedes Teil muss als eigene Ebene renderbar bleiben).

## 9. DELIVERABLES: das wollen wir zurück

Bitte liefere (Maße immer **relativ**: Bruchteile der Sprite-Box, Seitenverhältnisse, Prozent der Breite; wo Pixel nötig sind, auf die Zielgröße aus Abschnitt 7 beziehen):

a) **Styleguide**: Palette mit Hex (inkl. begründeter Erweiterungen, Kontrastwerte), Typo-Skala (mind. 12 pt, Nunito oder begründeter Ersatz), Radien, Schatten (Android-tauglich), Abstände, Ikonografie-Regeln (Linienstärke, Perspektive, Silhouette, Größen 24/32/48 dp), Zustände (gedrückt, deaktiviert, Fokus).
b) **Moodboard mit 3 Stilrichtungen** und einer klaren Empfehlung (mit Begründung gegen Tone-Regeln und gegen die Blender-Machbarkeit). Alle 3 müssen frühlingshaft und dog-zentriert bleiben.
c) **Layouts für alle 15 Screens** (Phone-Frames, 360 und 412 pt Breite, DE-Texte aus `copy-samples.md`, alle Zustände wo relevant: Leerzustand, gefülltes Beispiel, Feier mit Beat-Karten), mit Komponentenbezug zum UI-Kit.
d) **3D-Art-Direction-Sheet**: Proportionen (relativ), Materiallook (Clay-Parameter, Glanz, Kantenrundung), Beleuchtung (Richtung, Wärme/Kühle, Schattenhärte), Farbrampen (je Gebäudefamilie, Rasenteller, Dächer, Himmel), **je eine Referenz-Render-Beschreibung pro Gebäudestufe (15) und pro Prop (13)** in Form: Silhouette, Formen aus welchen Primitiven, Farben (Hex), relative Maße, Auslassungen; Buddy-Turnaround (vorn, Seite, Dreiviertel) und Ausdrucksblatt (ruhig, glücklich, aufgeregt, müde, neugierig, 3 verrückte Tricks: schweben, durch die Hütte schauen, Glitzer-Niesen).
e) **Liste neuer Props/Deko** (Hof-Deko, Jahreszeiten, Abzeichen-Artwork, Icons), jeweils mit Aufwand-Schätzung (einfach/mittel/aufwendig für Blender) und Zweck, ohne neue Spielmechanik zu erfinden.
f) **Copy-Ton-Beispiele**: 20 neue DE-Zeilen (mit EN) im Stil von `copy-samples.md`, inkl. 6 verrückten Zeilen (warm zuerst), 3 Fehler-/Leerzustände ohne Schuld, 3 Abzeichen-Texte.

Format: gern als Bilder plus Markdown; für Maße bitte Tabellen. Priorität bei Zeitmangel: a, d, c (Haustür, Hof, Feier, Karte zuerst), dann b, e, f.
