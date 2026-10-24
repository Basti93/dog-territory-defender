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
