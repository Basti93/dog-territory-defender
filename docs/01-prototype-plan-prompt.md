# Prompt 1 — Phased Prototype Plan

Paste this into a fresh Claude (or Claude Code) session to receive a **phased, lean-startup style** prototype plan for "Dog Territory Defender." Each phase tests ONE core hypothesis before adding the next layer. No big-bang builds.

---

## PROMPT (copy from here)

You are a senior mobile product architect with a lean-startup mindset. Build a **phased prototype plan** for "Dog Territory Defender" — a location-based mobile game for urban dog owners, inspired by INTVL (territory walking), Pokémon GO (collectibles), and cookie-clicker idle games (background progression).

Treat this as a greenfield project. Make reasonable assumptions, state them, move on. **Each phase must validate ONE core hypothesis with a real user test before the next phase begins.**

### Product vision (one paragraph)
A mobile game that turns the daily dog walk into a neighborhood adventure. The walk itself is the heartbeat (low cognitive load, eyes on dog). The real game lives in the background: passive treat generation, a buildable "Den" that grows over time, async social events, and seasonal layering that keeps the same daily route fresh. Spring-like, joyful, dog-centric tone throughout.

### Phased build approach (mandatory structure)

You must produce a plan with exactly **5 phases**. Each phase has:
1. **ONE hypothesis** (the only thing this phase tests)
2. **Minimum feature set** (build only what tests the hypothesis)
3. **Acceptance criteria** (5–7 numeric, measurable bullets)
4. **Test protocol** (exactly how to validate with real users)
5. **Continue / Iterate / Kill thresholds** (numeric — when to advance, when to refine, when to stop)
6. **Day-1 task list** (the first 5–7 commits for this phase)
7. **Demo script** (60-second walkthrough you can show a stakeholder)

---

### The 5 Phases

#### **Phase 0 — Walking Skeleton** (~Week 1)
**Hypothesis:** GPS tracking on a real urban walk feels accurate and satisfying to replay.
**Build:** Map view, start/stop walk button, polyline of route shown live + post-walk replay. No game mechanics.
**Test:** 3 testers walk 20 min in their own city.
**Goal:** GPS drift <10m in urban canyon, battery <5% per 30 min, replay feels accurate.

#### **Phase 1 — Core Game Loop** (~Week 2–3)
**Hypothesis:** Claiming territory + earning passive treats creates a "want to walk again tomorrow" feeling.
**Build:**
- Closed-perimeter detection → polygon territory shown on map
- Treats earned per walk + passive treat generation per hour (the cookie-clicker hook)
- Tiny "Den" screen with 3 buildable upgrades (Doghouse, Treat Bakery, Sniff Garden) — each gives % bonus
- Visible "next upgrade" always teased
**Test:** 5 dog owners walk 2x/day for 5 days.
**Goal:** 4/5 walk ≥8 sessions. Self-reported "I wanted to walk again."

#### **Phase 2 — Repetition Reward Loop** (~Week 4–5)
**Hypothesis:** Same-route walks become *more* rewarding over time, not less, through scent layering and seasonal variation.
**Build:**
- Scent strength (territory deepens visually with repeat walks)
- 7-day streak rewards
- Time-of-day & seasonal collectible variations (morning vs evening, spring blooms)
- Evening recap notification ("Here's what happened in your territory today")
- Background passive accumulation continues even on rest days (with diminishing returns)
**Test:** Same 5 testers walk same route for 14 days.
**Goal:** 4/5 still engaged at day 14. "I like seeing my territory grow stronger."

#### **Phase 3 — Social Layer** (~Week 6–7)
**Hypothesis:** Async multiplayer (other dogs visit, leave gifts, friendly competition) makes the world feel alive without being toxic.
**Build:**
- Other players' territories on shared map
- Async events ("Luna sniffed your territory at 3pm")
- Local leaderboard (zip code only — anti-snowball)
- Soft territory overlap (reduce, not destroy)
- Rolling 7-day scoring as primary metric
**Test:** 20 testers in same city for 14 days.
**Goal:** 60% engagement maintained. Positive social feelings. No reported toxicity.

#### **Phase 4 — Long-Term Hooks & Beta-Ready** (~Week 8–10)
**Hypothesis:** The Den + Pack metagame + seasonal events keep long-term players engaged AND new players don't feel locked out.
**Build:**
- Full Den (10+ buildable upgrades, levels 1–100, soft caps at L50 for diminishing returns)
- Pack collection (recruit AI dog companions, common → rare → legendary)
- Seasonal events (spring blooms, summer heat, autumn leaves, winter cozy)
- Anti-snowball: Beginner's Luck (2x for 30 days), mentor bonuses, co-op neighborhood goals, seasonal leaderboard resets
- Cosmetic prestige (badges, dog accessories)
**Test:** Closed beta in 1 city, 100 users, 30 days.
**Goal:** D7 retention >40%, D30 >20%, no abandonment by new joiners.

---

### Cross-cutting concerns (built once, reused all phases)
- **Battery:** target <5% per 30 min walk. Background tracking opt-in.
- **Privacy:** fuzz start point by 100m to hide home address. GDPR compliant by default.
- **Audio-first interaction:** subtle dings on POI passes, optional Apple Watch / Wear OS haptics. Phone stays in pocket.
- **Visual identity:** spring-like, joyful, dog-centric (per `03-design-brief.md`).
- **Engagement mechanics:** see `04-engagement-mechanics.md` for Den/Pack/anti-snowball design.

---

### What I want you to produce

A single document with:

1. **Assumptions & scope cuts** — what you assumed, what's explicitly not in any phase yet.
2. **Tech stack recommendation** — concrete choice (e.g., React Native + Expo + Supabase + PostGIS + MapLibre). 2 bullets justifying vs. each alternative. Pricing tier per service.
3. **System architecture** — client stack, backend, data model (ER-ish), geo stack, real-time, auth, push. Show how it grows phase-by-phase (don't build Phase 4 infra in Phase 0).
4. **Geospatial design** — how territories are stored (PostGIS polygons), how overlap/conquest is computed, how GPS noise is handled, how closed-perimeter detection works.
5. **5 phase specs** — each with the 7 elements listed above (hypothesis, features, acceptance criteria, test protocol, kill/continue thresholds, day-1 tasks, demo script).
6. **Cross-phase risks & unknowns** — top 5, each with a cheap experiment to de-risk.
7. **"Day 1 of Phase 0" build checklist** — the first 10 commits / tasks in order, specific enough to hand to a coding agent.

### Style
- Be opinionated. No "it depends."
- Concrete numbers (meters, seconds, Hz, MB, €).
- Where you recommend a library or SaaS, name it and the pricing tier.
- Phase boundaries are sacred: no scope creep across phases.
- End with a single **Next Action** line: the exact first command to execute.

Begin.
