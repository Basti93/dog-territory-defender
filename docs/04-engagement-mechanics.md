# Engagement Mechanics — The Den, The Pack, and the Long Game

This document defines the **background game loop** for Dog Territory Defender — the mechanics that keep players engaged when they're walking the same route every day (because that's what dogs love) and when they're *not* walking at all.

The walk is the heartbeat. The game lives in the in-between.

---

## The Core Tension

| Reality | Game Need |
|---|---|
| Dogs love the same daily route | Players need novelty |
| Owner's eyes belong on the dog | UI must be minimal during walks |
| Walks are short (~20 min/day) | Engagement must persist 24/7 |
| New players join late | Veterans shouldn't lock them out |

Solution: **Make the walk simple. Make the background rich. Make the social fair.**

---

## Part 1: The Den (your dog's home base)

A cute isometric / top-down view of your dog's home space. Visually grows over time. This is the cookie-clicker core — always a visible "next upgrade" to chase.

### How it works
- Treats earned from walks + passive trickle from buildings = currency
- Spend treats on building upgrades (each building has 100 levels)
- Each level is exponentially more expensive but gives diminishing returns above L50
- Buildings stack bonuses across multiple categories
- Den visually evolves: more buildings, more decorations, busier scene

### The 10 buildings (unlock progressively)

| # | Building | Effect | Unlocks at |
|---|---|---|---|
| 1 | **Doghouse** (HQ) | Treat storage capacity + base | Start |
| 2 | **Treat Bakery** | Passive treats per hour (idle generator) | Start |
| 3 | **Sniff Garden** | +X% collectibles found on walks | Start |
| 4 | **Training Yard** | +X% XP per walk | Den Lv 5 |
| 5 | **Watch Tower** | +X% territory defense | Den Lv 10 |
| 6 | **Friend Lounge** | Chance for visiting dogs to leave gifts | Den Lv 15 |
| 7 | **Spring Garden** | Seasonal: +X% during spring (cycles per season) | Den Lv 20 |
| 8 | **Trophy Hall** | Display badges, +0.5% per badge displayed | Den Lv 25 |
| 9 | **Pack House** | Recruit AI dog companions (passive bonuses) | Den Lv 30 |
| 10 | **Memorial Bench** | Log walks, sentimental, no bonus | Anytime (free) |

### Why this works as a cookie-clicker
- **Always a next upgrade visible** — player always knows what to chase
- **Visible visual change** — Den evolves; flexing it on friends matters
- **Specialization paths** — focus on Sniff Garden (collector) vs Watch Tower (defender) vs Treat Bakery (idle farmer)
- **Soft cap at L50** — keeps anti-snowball intact (more on this below)
- **Late-game players have impressive Dens** — bragging rights without combat advantage

### Spring-like UX touches
- Den's grass actually grows greener in spring
- Spring Garden literally blooms with daffodils when season changes
- Idle animations: dog sleeping in Doghouse, butterflies near Sniff Garden
- Notifications: "Your Treat Bakery overflowed! 124 treats waiting 🦴"

---

## Part 2: The Pack (collection metagame)

Recruit AI dog companions. Each has a personality, breed, and small passive bonus. Adds variety on top of the Den's vertical progression.

### Tiers
- **Common dogs** (easy: walk 5km in their breed's preferred zone): +1–3% bonus
- **Rare dogs** (medium: complete a multi-walk quest): +5–10% bonus + special ability
- **Legendary dogs** (hard: seasonal events, limited time): cosmetic + small bonus + flex value

### Why this works
- Collection drive ("gotta catch 'em all")
- Variety of choice (build a Pack that suits your style)
- Quests give walks a one-time goal *without* breaking routine — "walk anywhere for 5km this week to recruit a Beagle scout"
- Pack roster shows off long-term play without making new players feel weak

### Anti-snowball within Pack
- Bonuses cap at +30% total Pack contribution
- Common dogs are 80% as effective as Legendary in core mechanics — Legendary mostly cosmetic flex
- Pack slots cap at 8 (so a level 100 player can't run 50 dogs)

---

## Part 3: Anti-Snowball Mechanisms (so new players don't feel locked out)

This is the hardest design problem. Here's the layered defense:

### 1. Local leaderboards by zip code
A new player in Berlin Kreuzberg competes only with their neighbors, not the global #1. They can be top-3 in their zip in week 1.

### 2. Rolling 7-day scoring (the great equalizer)
The main competitive metric is **walks this week**, not lifetime XP. A daily walker who joined yesterday beats the lapsed veteran from 6 months ago.

### 3. Soft caps with diminishing returns
- Building bonuses cap at +50% above L50
- A L100 player has only ~30% advantage over a L1 player on equivalent walks
- The walk itself dominates — buildings tilt, don't decide

### 4. Beginner's Luck (first 30 days)
2x XP and 2x treats for new players. Lets them catch up to mid-level fast and feel meaningful progress immediately.

### 5. Mentor bonuses
High-level players get a small bonus (+5% treats) when a new player they "mentor" walks. Encourages veterans to onboard newcomers, not crush them. Builds neighborhood community.

### 6. Seasonal resets (cosmetic-only prestige)
Every 3 months, leaderboards reset. Long-term players keep all upgrades + cosmetic prestige badges (e.g., "Spring 2026 Champion" forever). New players have a fair shot at the top of each season.

### 7. Co-op > Compete (most events are collaborative)
"Kreuzberg dogs collectively walk 1000km this week to unlock a community Spring Garden!" — old + new players are on the same team. Solo competition is the minority of gameplay.

### 8. Walk frequency > total stats (defense decays)
Territory defense scales with how recently you walked, not total stats. A new player who walks daily can defend against an L100 who hasn't walked in 5 days. Lapsed veterans gradually lose defended territory.

### 9. Asymmetric value props
- **Long-term players:** rare cosmetics, prestige badges, big Den to flex, deep Pack collection
- **New players:** 2x bonuses, fresh territory in their neighborhood, beginner perks
- **Both feel valued.** Different things matter to each.

### 10. Hard power gap soft-cap
A L100 vs L1 player on equivalent walks: max +30% advantage from all sources combined. Below the threshold where new players give up, above the threshold where vets feel their grind was meaningless.

---

## Part 4: How It Ties to the Phased Prototype

| Phase | Engagement mechanics introduced |
|---|---|
| **Phase 0** | None — just walking skeleton |
| **Phase 1** | Treats + 3 buildings (Doghouse, Treat Bakery, Sniff Garden). Test cookie-clicker hook. |
| **Phase 2** | Scent layering + seasonal variations + passive accumulation continues during rest days. Test repetition rewards. |
| **Phase 3** | Local leaderboards + rolling 7-day scoring + mentor bonuses. Test anti-snowball. |
| **Phase 4** | Full Den (10 buildings) + Pack collection + seasonal events + Beginner's Luck. Test long-term retention. |

Each phase tests whether *that layer* of engagement actually works before adding the next.

---

## Part 5: Spring-Themed Engagement Examples

**Monday morning, the owner + Max walk their usual Kreuzberg loop:**
- Phone in pocket. Gentle ding when they pass the bakery POI.
- Walk ends. "Nice loop! +87 XP. Your territory's scent is getting stronger 🌸"

**Tuesday at lunch:**
- "Max earned 124 treats overnight! 🦴 Your Treat Bakery is at L12 — next upgrade unlocks Friend Lounge."
- The owner spends treats, upgrades Sniff Garden to L8.

**Wednesday recap:**
- "Luna (the Husky from Görlitzer Park) sniffed your territory and left a friendly paw print. She's at level 23 — neighbor!"

**Friday evening:**
- "5-day streak on the Morning Loop! It's now officially 'Max's Territory' 🏆 + permanent badge"
- "Spring event: collect 3 daffodils this weekend on any walk for a seasonal Pack member."

**Saturday morning:**
- The owner walks a slightly different route to catch the daffodils.
- He passes a new player walking their first dog. The app shows a tiny "👋 New neighbor! Mentor them?" prompt.
- The owner taps yes. He's now Lily (Cocker Spaniel)'s mentor — she gets a small bonus, he gets +5% treats from her walks.

---

## Design North Star

*"Every walk feels rewarding. Every off-walk hour feels productive. Every veteran feels respected. Every newcomer feels welcomed."*

The walk is the heartbeat. The Den is the home. The Pack is the family. The neighborhood is the world.
