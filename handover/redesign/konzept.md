# Dog Territory Defender: Game-Design-Konzept „Unser Viertel“

Stand 2026-10-18, Entwurf. Ersetzt den Design-System-Anstrich. Ziel: ein Design, das aus der Spielerfahrung kommt und das nur dieses Spiel haben kann.

## 1. Die Kernfantasie

**„Wir machen dieses Viertel zu unserem.“**

Nicht „ich tracke meine Spaziergänge“, nicht „ich level einen Hund“. Zwei Wesen gehen jeden Tag dieselben Straßen, und mit der Zeit gehört ihnen die Gegend: der Bäcker kennt den Hund, die Ecke am Park ist „unsere Ecke“, der Weg zum Kiosk ist eingelaufen. Das Spiel macht dieses Gefühl sichtbar.

Nebenfantasie: **„Zuhause wartet unser Hof.“** Der Hof ist der Ort, an dem die Runden zu etwas werden: Leckerlis, Gebäude, Erinnerungen.

Der Satz, den das Spiel am Ende jeder Runde auslösen will: *Das haben wir gemacht. Wir gehören hierher.*

## 2. Die Verben der Spielerin

| Verb | Wann | Was das Spiel zurückgibt |
|---|---|---|
| **Losgehen** | Haustür → Gartentor | Buddy rennt voraus, die Welt öffnet sich |
| **Markieren** | Während der Runde (passiv, Handy in der Tasche) | Audio-Cues; danach ein neuer Flicken im Revier |
| **Heimkommen** | Runde beenden | Die Feier ist eine Heimkehr, keine Tabelle |
| **Bauen** | Im Hof, zwischen Runden | Der Hof wird größer, Buddy hat mehr zu tun |
| **Erinnern** | Album, Zaun | Runden als Postkarten, Abzeichen als Dinge am Zaun |

| **Nachschauen** | An Tagen ohne Runde | Im Hof ist etwas Kleines passiert (Buddy hat etwas mitgebracht, ein Gast, ein Cameo); nie eine Belohnung, nie ein Timer |

Alles andere (Einstellungen, Erinnerungen, Backup, Debug) ist Haushalt. Der Haushalt hat einen Ort in der Welt (den Briefkasten), aber dahinter eine schlichte Liste; dort braucht es keine Inszenierung.

## 3. Design-Säulen

1. **Die Welt ist ein Ort, kein Menü.** Es gibt keine Listen, keine Karten-Stapel, keine Tabs. Alles, was die Spielerin tun kann, ist ein Ding in der Szene: Tor, Briefkasten, Bank, Zaun, Napf. Text erscheint auf Schildern und in Sprechblasen, die aus der Szene wachsen.
2. **Das Revier ist ein Bild, das wir nähen.** Die Karte ist kein Kartendienst mit Overlay, sondern ein Flickenteppich: jede Runde wird ein Stoffflicken mit sichtbarer Naht, Straßen sind Trampelpfade, wilde Stellen hohes Gras. Der Kartendienst bleibt darunter lesbar (Straßen, Blocks), damit man planen kann: „Heute laufen wir um den Block, der noch fehlt.“ Wo ihr noch nie wart, liegt kein leeres Leinen, sondern eine Kreideskizze mit Wolken: Platz zum Entdecken, keine To-do-Liste.
2b. **Orte bekommen ein Gesicht.** Stellen, an denen ihr oft seid, werden zu „unseren Ecken“: eine kleine Kulisse auf dem Teppich (Bank, Laterne, Bäckerladen), eine Buddy-Pose, ein Name, den die Spielerin vergibt. Das ist die zweite Ebene des Teppichs neben der Fläche und das, was nach Woche drei trägt, wenn die Stammrunde längst grün ist. Der Flächenumfang ist nie die Hauptzahl; die Lieblingsecke ist es.
3. **Buddy führt.** Jede Szene ist aus Hundehöhe erzählt. Buddy ist der Erzähler, Wegweiser und Grund für alles: er läuft zum Tor, wenn es Zeit ist, er schnüffelt am Briefkasten, wenn eine Erinnerung ansteht, er legt sich auf die Postkarte, die er mag.
4. **Zeit ist spürbar, nie Druck.** Der Himmel über dem Hof hat die echte Tageszeit, die Wiese die echte Jahreszeit. Nichts läuft ab, nichts blinkt, nichts erinnert an Verpasstes. Der Hof wartet einfach, so wie ein Hof wartet.
5. **Warm zuerst, verrückt zweitens.** Die verrückte Ader bleibt Cameo: selten, kosmetisch, ohne Belohnung.

## 4. Das eine Bild

**Blick über den Gartenzaun aufs Viertel.** Vorne der Hof (Hütte, Bäckerei, Beet, Buddy), in der Mitte der Zaun mit dem Gartentor, dahinter, leicht von oben, das Viertel als Flickenteppich: genähte grüne Flicken dort, wo ihr wart, dazwischen helles Leinen, wo ihr noch nicht wart, am Horizont Wolken. Alles ein durchgehendes Bild, das man nach oben scrollt (vom Hof zum Viertel) und nach unten (zurück zur Haustür).

Dieses Bild ist der Startscreen, die Hof-Ansicht und die Revier-Ansicht zugleich. Es gibt keinen „Haustür-Screen“ und keinen „Hof-Screen“ mehr, es gibt eine Welt mit drei Höhen.

## 5. Die Welt: drei Höhen, zwei Ausflüge

```
┌──────────────────────────────┐
│  HORIZONT · Himmel, Wolken   │  Tageszeit, Wetter-Cameos
├──────────────────────────────┤
│  DAS VIERTEL · Flickenteppich│  ↑ hochscrollen: Revier, wilde Stellen, Pin
│  (Leaflet darunter, Stoff    │    Tipp auf Flicken: Postkarte dieser Runde
│   darüber)                   │
├──────────────────────────────┤
│  ZAUN · Gartentor · Schild   │  Tor = „Gassi gehen“; Zaun = Abzeichen; Schild = Reviername
├──────────────────────────────┤
│  DER HOF · Hütte, Bäckerei,  │  Start-Höhe. Buddy, Napf (Leckerlis), Gebäude,
│  Beet, Napf, Bank, Briefkasten│  Bank = Album, Briefkasten = Haushalt (Liste)
└──────────────────────────────┘
```

Das Tor ist auf der Start-Höhe immer sichtbar, egal wie groß der Hof wird: es sitzt am oberen Rand des Hof-Ausschnitts, und der Hof wächst nach unten und zur Seite, nie über das Tor hinaus. Losgehen darf nie Scrollen erfordern. Es gibt keine versteckte Haustür-Höhe; Hundename und Look liegen im Briefkasten unter „Dein Hund“.

Das Viertel ist auch im Idle pannbar und zoombar; es ist der wichtigste Anschau-Moment und darf keinen Zwischenschritt haben. Der Scroll zwischen den Höhen und das Pannen im Viertel trennen sich über die Zaun-Kante: oberhalb des Zauns gehören Gesten der Karte, ein Griff „Zurück zum Hof“ am unteren Kartenrand bringt die Szene zurück.

**Ausflug 1: Draußen (die Runde).** Durch das Tor gehen = Runde starten. Die Welt klappt weg, es bleibt nur das Viertel aus der Nähe: der Flicken, der gerade entsteht, als wachsender Stoffrand hinter Buddy. Zwei Dinge auf dem Bildschirm: Buddy läuft, und unten das Tor als „Heim“. Kein Blinken, keine Zahlen außer Strecke und Zeit auf einem kleinen Holzschild. Handy in die Tasche.

**Ausflug 2: Die Postkarte (Runden-Portrait).** Jede Runde ist eine Postkarte: vorne der Flicken dieser Runde auf Leinen, der Pfad als Trampelpfad, hinten die Werte in Handschrift-Optik („Dienstagnachmittag, 2,1 km, drei neue Straßen“). Postkarten liegen auf der Bank im Hof (Verlauf) und sind an den Flicken im Viertel gepinnt.

## 6. Die Momente

### Losgehen
Buddy sitzt am Tor und schaut zurück. Tipp auf das Tor (oder auf Buddy): Tor schwingt auf, Buddy trabt durch, die Kamera folgt nach oben ins Viertel, das Viertel zoomt auf die Haustür-Position. Dauer 600 ms, dann Handy in die Tasche.

### Heimkommen (die Feier)
Nicht Pop-up, sondern Heimkehr, mit einem Star und einer festen Blickführung. Die Kamera fährt zu jedem Beat, die Spielerin muss nichts suchen. Ein Tipp geht zum nächsten Beat, nie über alles hinweg.
1. **Der Star: der Flicken.** Kamera über dem Viertel. Der neue Flicken wird vor den Augen der Spielerin genäht (Naht läuft, 1,2 s), daneben steht die eine Zahl dieser Runde groß auf einem Schild: „+3 neue Straßen“, oder „128 m²“, oder „Erste Runde am Fluss“, je nachdem, was heute das Besondere war. Das ist der lauteste Moment, alles danach ist leiser.
2. Kamera zum Hof: Leckerlis rollen aus Buddys Fell in den Napf (zählt hoch, leise).
3. Nur wenn es etwas gibt: ein Abzeichen hängt sich an den Zaun, oder ein Gebäude bekommt den Wimpel, oder das Torschild dreht sich zum neuen Titel. Höchstens zwei davon; der Rest wartet im Hof und wird beim nächsten Öffnen entdeckt.
4. Buddy legt sich hin. Der Schlusssatz bezieht sich auf die konkrete Runde („Die Ecke am Kiosk ist jetzt wirklich eure.“, „Dienstagabend, und der Park kennt euch jetzt.“), nie derselbe Satz zweimal hintereinander. Der Pool kommt aus `copy.md` und wächst mit der Zeit.
Beat-Karten gibt es nicht mehr; jeder Beat ist ein Ding, das in der Szene ankommt. Nach der zehnten Heimkehr darf die Choreografie variieren (Buddy kommt mal von links, mal wartet er schon am Napf), damit sie nicht zur Tapete wird.

### Bauen
Ein Gebäude mit Wimpel antippen: Buddy läuft hin, ein Holzschild klappt aus (Name, Stufe, „Ausbauen für 1.025“). Ausbauen: Leckerlis fliegen aus dem Napf ins Gebäude, das Gebäude wächst (Sprite-Wechsel mit Hüpfer), Buddy springt. Keine Gebäude-Karten, kein Dashboard; die Zahlen stehen auf dem Schild.

### Erinnern
Bank antippen: der Postkarten-Stapel fächert auf (Verlauf). Zaun antippen: Abzeichen hängen als Dinge dran (Rosette, Knochen-Komet, Gießkanne). Nicht verdiente Abzeichen sind unsichtbar, bis man nah dran ist (ab etwa 80 % des Anlasses erscheint ein leerer Haken mit Schild); kein Rückstand an der Wand. Ein Flicken im Viertel antippen: seine Postkarte. Eine „unsere Ecke“ antippen: Name ändern, Buddy-Pose ansehen, die Postkarten von dort.

### Nachschauen
An Tagen ohne Runde gibt es trotzdem einen Grund, den Hof zu öffnen: etwas Kleines ist passiert. Buddy hat einen Stock mitgebracht und liegt daneben; die Ente mit Partyhut sitzt auf dem Zaun; die Bäckerei hat einen Keks auf die Bank gelegt. Alles kosmetisch, nichts davon bringt Leckerlis, nichts läuft ab, nichts fehlt, wenn man es nicht sieht. Es ist der Hof, der lebt, nicht eine Aufgabe, die wartet.

### Haushalt
Briefkasten antippen: eine schlichte Liste (Dein Hund, Erinnerungen, Töne, Sprache, Backup, Verpasste Runde nachtragen, Debug). Hier gibt es keine Inszenierung: Einstellungen will niemand erleben, nur erledigen. Die Liste sieht aus wie ein Zettel aus dem Briefkasten (Papier-Hintergrund, Nunito), mehr nicht.

## 7. Das Bild: Material und Blick

- **Zwei Materialien, klar getrennt.** Alles Räumliche (Hof, Buddy, Gebäude, Zaun, Tor, Bank, Briefkasten) ist Knete, wie heute. Alles Flächige (das Viertel, Schilder, Postkarten, Zettel) ist **Stoff und Papier**: Leinen, Filz-Flicken mit Naht, Holzschilder, Karteikarten. UI = Papier in einer Knetwelt. Damit hat jede Fläche einen Grund, warum sie so aussieht.
- **Der Flickenteppich.** Flicken in drei Grüntönen (frisch, gewohnt, wild), Nahtlinie in Garn-Creme, Kanten leicht ungerade. Eure Wege als Trampelpfade (hellbraune Linie mit Pfotenstempeln). Darunter die Leaflet-Kacheln nur leicht entsättigt und in Creme getönt: Straßen, Blocks und Straßennamen bleiben lesbar, denn die Lücke sehen zu können ist der Planungs-Spaß. Wo ihr noch nie wart: Kreideskizze der Straßen mit Wolken-Deko, „Platz zum Entdecken“, nicht „noch zu erledigen“. „Unsere Ecken“ als kleine Kulissen-Sprites auf dem Teppich mit Namensschild.
- **Blickhöhe.** Hof und Zaun aus Hundehöhe (Kamera tief, Gebäude wirken groß), Viertel von oben wie ein Teppich auf dem Boden, den man von der Bank aus sieht. Der Übergang ist der Zaun.
- **Typografie.** Zwei Stimmen: Schilder in einer gestempelten Groteske (breit, rund, leicht unregelmäßig; Kandidaten: Fredoka, Baloo 2, Sniglet), Postkarten in einer ruhigen Handschrift-Schreibschrift nur für Phrasen („Dienstagnachmittag“), Zahlen immer in der Groteske. Nunito bleibt für Fließtext auf Zetteln. Alle Schriften OFL.
- **Farbe.** Die bestehenden Tokens bleiben, dazu Material-Farben: Leinen, Garn, Holz, Filz-Grüns. Begründung in `docs/decisions/LOG.md`.
- **Bewegung.** Kamera-Scroll zwischen den Höhen ist die wichtigste Animation (ScrollView mit Parallax: Himmel langsam, Hof schnell). Alles andere sind Sprite-Hüpfer und Opacity.

## 8. Was das für den Code heißt (Machbarkeit)

- **Eine Szene statt vieler Screens.** Ein vertikaler ScrollView mit absolut positionierten Sprite-Ebenen (Himmel, Viertel, Zaun, Hof, Haustür). Parallax über `Animated.ScrollView` und `interpolate`, nativer Treiber. Tippbare Dinge sind `Pressable` über Sprites. Keine neue native Abhängigkeit.
- **Das Viertel bleibt Leaflet** in der WebView, aber: Kacheln per CSS-Filter entsättigt und aufgehellt, Revier-Polygone mit SVG-Pattern (Filz-Textur, Nahtlinie als dashed stroke mit rundem Linienende), Pfade mit Pfotenstempel-Pattern. Alles im bestehenden `src/web`-HTML. Die Idle-Ansicht ist in die Szene eingebettet; während der Runde vollflächig.
- **Schilder, Postkarten, Zettel** sind drei Komponenten mit Papier-Sprites als Hintergrund (9-Slice via `ImageBackground` mit `capInsets`), Text darüber. Sie ersetzen Card, ListRow, Chip, StatTile.
- **Sprites aus Blender, neu:** Zaun (3 Segmente, kachelbar), Gartentor (zu/offen), Bank mit Postkartenstapel, Briefkasten (gibt es als Prop), Napf, Holzschild (3 Größen), Fußmatte, Flicken-Texturen (als Pattern-PNG), Wimpel. Buddy: Laufzyklus von hinten (durch das Tor) als 2 Frames zusätzlich.
- **Spec-Folgen:** Die Visual-Design-Spec kennt fünf Key Screens mit „Karte dominiert vollflächig“ und einen separaten Feier-Screen; die Bank/Zaun/Briefkasten-Navigation und die Szenen-Feier ändern diese Intents. Dazu neue Farben und Schriften. „Unsere Ecken“ (Orte mit Gesicht, benennbar) und „Nachschauen“ (kosmetische Hof-Ereignisse ohne Belohnung) sind neue spielerseitige Regeln und gehören als eigene Capability in den Change, geprüft gegen Anti-Snowball (die Lieblingsecke ist die Hauptzahl, nie die Fläche) und gegen die Weird-Regel 5 (keine Belohnung an Cameos). Diese Regeln werden direkt in `docs/specs/visual-design.md` und `docs/specs/game-backlog.md` nachgezogen; Den-Economy und Pack bleiben unberührt.

## 9. Risiken und wie wir sie abfangen

| Risiko | Antwort |
|---|---|
| Diegetische Navigation ist schwer zu entdecken oder nervt beim zehnten Mal | Jedes Ding hat ein Holzschild mit Wort („Gassi gehen“, „Post“, „Album“); Buddy läuft beim ersten Öffnen die Dinge ab; Onboarding ist ein Rundgang durch den Hof statt drei Karten. Das Tor ist immer ohne Scrollen erreichbar. Häufiges (Losgehen) ist ein Tipp, Seltenes (Post, Album) darf zwei sein. |
| Die Heimkehr wird nach zehn Runden Routine | Ein Star-Beat statt vier gleich lauter; Satz und Zahl hängen an der konkreten Runde; Choreografie variiert ab der zehnten Heimkehr; Beats 3 und 4 fallen weg, wenn es nichts gibt. |
| Der Teppich der Vielläufer macht Unterschiede sichtbar (Anti-Snowball) | Die Fläche ist nie die Hauptzahl. Die Postkarte und die Lieblingsecke sind der Blick, mit dem man sich vergleicht, nicht die Quadratmeter. |
| Text auf Papier-Sprites und Lesbarkeit draußen | Papier ist fast weiß, Text `ink`, mind. 14 pt auf Schildern; Kontrast wird gegen den Papier-Ton geprüft. |
| Scroll-Welt kollidiert mit Leaflet-Gesten | Das eingebettete Viertel ist im Idle nicht pannbar (Tipp öffnet Vollbild); Vollbild hat eine klare „Zurück zum Hof“-Kante unten. |
| Performance auf Mittelklasse-Android | Ebenen als wenige große PNGs, Parallax nur Transform, Leaflet nur eine Instanz. |
| TalkBack | Jedes Ding hat `accessibilityLabel` und `accessibilityRole="button"`; Reihenfolge Hof → Zaun → Viertel. |
| Zu viel auf einmal | Schrittfolge: 1 Szene mit Hof + Tor + Napf (ersetzt Haustür und Hof), 2 Flickenteppich im Leaflet (der größte sichtbare Gewinn), 3 Heimkehr-Feier, 4 Schilder und Briefkasten-Liste, 5 Postkarten, 6 Zaun-Abzeichen, 7 Unsere Ecken, 8 Nachschauen. Jeder Schritt ist für sich spielbar. |

## 9b. Fun-Check (game-master, 2026-10-18)

Urteil: Kern weiterverfolgen, Umsetzung entschlacken. Eingearbeitet: Orte mit Gesicht („Unsere Ecken“) gegen Abnutzung nach Woche drei; Heimkehr mit Blickführung, einem Star-Beat und rundenbezogenem Satz plus Zahl; „Nachschauen“ als Grund, den Hof an Tagen ohne Runde zu öffnen; Karte unter dem Teppich bleibt planbar; Leinen wird Kreideskizze statt To-do; unverdiente Abzeichen bleiben verborgen; Haushalt ist eine schlichte Liste; „Tipp überspringt alles“ gestrichen; Tor immer ohne Scrollen erreichbar; Haustür-Höhe gestrichen.

## 10. Was aus dem Design-System-Artefakt bleibt

Brauchbar: die Kontrast-Rechnung und Tinten-Tokens, die 3D-Art-Direction (Material, Licht, Gebäudestufen, Props), der Props-Backlog, die Copy-Zeilen, der Tone-Teil des Brand-Books. Verworfen: Karten-Stapel-Layouts, Clay-Kante als Tiefenkonzept, die 15 Screen-Spezifikationen, die Komponenten Card/ListRow/Chip/StatTile/BeatCard.
