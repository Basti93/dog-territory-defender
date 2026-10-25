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
- A stick gift no longer lies in the Hof: it arrives in the mailbox (see "Mailbox"). After the unwrap Buddy carries it to the shelf; "Stock von {Hund}!" and the gift's treat sprinkle (unchanged numbers) land. Sticks never expire; no "you missed" copy.
- The shelf has one slot per dog and is its own screen "Mein Stock-Regal" (`StickShelfScreen`). The stick pile by the doormat is its one entry (no sign): always there, drawing up to three collected sticks (one plain stick while the shelf is empty). Before any neighbour dog is known all six slots are soft silhouettes. Slots carry the dog's name; no counts, no "x of 6". A repeat stick from a dog is a quick wag: same sprinkle, shelf unchanged. The first stick of a dog adds "... hängt jetzt im Stock-Regal".
- Every dog can leave a stick: planner draws ONE stick candidate per round and then the dog; household gap 3 days between sticks, 10 days per dog, still max 1 gift per day (collars and socks keep their share). Old: Pfote only, 10-day line gap. The shelf is derived from opened gifts, nothing extra is stored. Old ids (`stick-oak`, `stick-birch`, `stick-pfote`) count for the dog that sent them.

## Mailbox (Posteingang)

The Hof mailbox holds what arrives "from outside" (`src/inbox/inbox.ts` derives it, `useInbox.ts`): stick gifts from neighbour dogs, neighbour notes (the dogs' fence lines, moved off the fence; not gift lines, not time-bound invitations), and new walk postcards (the reveal) plus any the player chose "Später" for (off the bench until pulled). Nothing time-critical: live partner walk status stays on the map/gate.
- Cue: a raised flag with a gentle wiggle (`MailboxFlag`); one item or nine look the same. No number, badge, TopBar dot, per-type icon, age or "waiting" wording; nothing expires. Empty = flag down.
- Tap: flag drops, Buddy trots over ("Post für uns! Ich hol's!") and pulls ONE item at a time: ~2 s unwrap beat (tap skips), one Buddy line, tap for the next. Order: gifts, notes, postcards, each newest first. Several: "Da hat sich was gesammelt. Wir haben Zeit." After the last: "Das war alles für heute. Gut geschnüffelt!" "Später" leaves the rest silently. No inbox-zero screen, no confetti.
- Lines: gift "Stock von {Hund}!" (+ shelf line the first time, then Buddy carries it to the shelf); note "Ein Zettel am Zaun: '{Text}'" (the line names the dog itself); postcard "Die kommt auf unsere Bank." (laid on the bench). Empty box: lid-open sniff, one of 3 rotating lines.
- Postcard reveal: a tracked walk that began after `notesFrom` arrives in the box (flag up) instead of landing on the bench; Buddy pulls it out, it shows big with "Die kommt auf unsere Bank." and goes to the bench. Cards from before, and hand-written logs, stay on the bench. "Später" leaves the not-yet-pulled cards in the box; the bench shows only delivered cards (the Album shows all).
- Stored (settings `inboxState`): postponed and delivered postcard ids, seen note keys, `notesFrom` (first look; older lines and cards never arrive). Gifts and postcards are derived.

## Neighbours on postcards

A tracked walk's postcard shows up to two neighbour dogs that were out at the same time (their planned walk overlapped ours; stored per walk, at most 3, derived by the server at upload) next to our Buddy. No counts, no "you missed" copy: a card without a neighbour simply has Buddy alone. Buddy's line may mention the first dog met (`postcard.line.met.*`).

## Buddys Spazier-Tagebuch (Hof)

One clay card on its own screen "Mein Tagebuch" (`WalkDiaryScreen`, `walks/walkDiary.ts`, `WalkDiaryCard`), opened by the notebook on a tree stump left of Buddy's doormat in the Hof (art `meadow-diary`); the bench opens postcards only. Derived on read from the household's stored tracked walks (partner walks included; bots and in-progress walks are not in the repository). Buddy's voice, no goals, streaks, deltas, days-since, rankings or cross-player comparison, no badge.
- Manual logs are left out entirely: they have no fixes (no duration/distance) and their start time is only "today/yesterday".
- Robust numbers: walks with a `statsExcluded` reason (aborted, stuck, glitchy; `walk-lifecycle` "Statistics hygiene") are left out, a walk ends at its last moving fix, and every typical and time-of-day value is a median (not a mean): with 3-10 walks one outlier cannot move it; a trimmed mean would degenerate at that size. Total distance stays a sum.
- Under 3 walks: only a teaser ("Noch 2 Runden, dann erzähl ich dir ..."). At the 3rd the card appears with the intro line, once (the prop opens the teaser until then) (`DiarySeen` in settings).
- Rows: typical walk (median, "ca. 35 Min · 2,1 km", minutes to 5, distance to 100 m), longest walk (soft month, "im Mai"), latest walk (duration only), total distance (labelled "aus getrackten Runden").
- Time of day by local start hour: Morgen <11, Mittag 11-17, Abend 17-22, Nacht >=22 or <5. A row (average duration + distance) only with >=3 walks in it; no empty rows. Top bucket named positively; all within 10%: "Bei uns ist jede Tageszeit gut."
- One sniff comment rotating with the walk count: sausage chain, football pitches, naps, longest walk. A new longest walk (by duration) drops a little confetti once.
- Not the Stats screen: that one holds lifetime counters, records by distance and badges; the diary adds time and time of day.
