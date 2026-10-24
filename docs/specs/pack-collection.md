# Pack Collection

The Pack is the AI dog companion collection metagame: horizontal variety on top of the Den's vertical progression, driven by "gotta catch 'em all", capped so it never creates an unfair power gap.

## Recruitment tiers

- **Common dogs** (easy): walk 5km in the companion breed's preferred zone, which makes that companion recruitable. Bonus +1-3%.
- **Rare dogs** (medium): complete a multi-walk quest. Bonus +5-10% plus a special ability.
- **Legendary dogs** (hard): seasonal, limited-time events. A cosmetic, a small bonus, and flex value.

## Quests

- Completable via the player's normal walking routine (e.g. "walk anywhere for 5km this week to recruit a Beagle scout"); never require abandoning the normal route for a special one. An active quest is satisfiable by walks on the normal route, not only on a dedicated one.

## Anti-snowball limits

- Total Pack bonus is capped at +30%: combined Pack bonuses above +30% are applied as +30%.
- Common dogs are at least 80% as effective as Legendary dogs in core mechanics (Legendary is mostly cosmetic flex, not a core-mechanic power advantage).
- At most 8 active Pack slots regardless of level: a level-100 player fielding more than 8 companions is refused a 9th slot.

## Roster display

- A long-term player's full Pack roster is visible on their profile or Den as bragging rights, while the mechanical advantage still respects the +30% total Pack cap, so new players are never outmatched beyond the capped advantage.

## Stick shelf (Stock-Regal)

A small collection that is not a power: each of the six neighbour dogs (Momo, Pfote, Bruno, Keks, Lotte, Nebel) leaves its own stick (own wood, shape and colour, `src/economy/sticks.ts`, art `stick-<dog>`).
- A waiting stick lies in the Hof right of the doormat (up to 3 shown as a pile; other gifts show as a parcel there). One tap: Buddy trots over, picks it up, plays a happy beat, a calm line "Stock von {Hund}!" and the gift's treat sprinkle (unchanged numbers) land. Sticks never expire; no "you missed" copy.
- The shelf has one slot per dog and hangs at the top of the Album (bench). It shows once neighbour dogs exist. Fetched sticks carry the dog's name, empty slots are soft silhouettes; no counts, no "x of 6". A repeat stick from a dog is a duplicate: same pickup and sprinkle, shelf unchanged. The first stick of a dog adds "... hängt jetzt im Stock-Regal im Album".
- Every dog can leave a stick: planner draws ONE stick candidate per round and then the dog; household gap 3 days between sticks, 10 days per dog, still max 1 gift per day (collars and socks keep their share). Old: Pfote only, 10-day line gap. The shelf is derived from opened gifts, nothing extra is stored. Old ids (`stick-oak`, `stick-birch`, `stick-pfote`) count for the dog that sent them.

## Neighbours on postcards

A tracked walk's postcard shows up to two neighbour dogs that were out at the same time (their planned walk overlapped ours; stored per walk, at most 3, derived by the server at upload) next to our Buddy. No counts, no "you missed" copy: a card without a neighbour simply has Buddy alone. Buddy's line may mention the first dog met (`postcard.line.met.*`).

## Buddys Spazier-Tagebuch (Album)

One clay card above the postcards (`walks/walkDiary.ts`, `WalkDiaryCard`), derived on read from the household's stored tracked walks (partner walks included; bots and in-progress walks are not in the repository). Buddy's voice, no goals, streaks, deltas, days-since, rankings or cross-player comparison, no badge.
- Manual logs are left out entirely: they have no fixes (no duration/distance) and their start time is only "today/yesterday".
- Under 3 walks: only a teaser ("Noch 2 Runden, dann erzähl ich dir ..."). At the 3rd the card appears with the intro line, once (`DiarySeen` in settings).
- Rows: typical walk (average, "ca. 35 Min · 2,1 km", minutes to 5, distance to 100 m), longest walk (soft month, "im Mai"), latest walk (duration only), total distance (labelled "aus getrackten Runden").
- Time of day by local start hour: Morgen <11, Mittag 11-17, Abend 17-22, Nacht >=22 or <5. A row (average duration + distance) only with >=3 walks in it; no empty rows. Top bucket named positively; all within 10%: "Bei uns ist jede Tageszeit gut."
- One sniff comment rotating with the walk count: sausage chain, football pitches, naps, longest walk. A new longest walk (by duration) drops a little confetti once.
- Not the Stats screen: that one holds lifetime counters, records by distance and badges; the diary adds time and time of day.
