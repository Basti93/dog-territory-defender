# Dog Territory Defender — Design Brief

You're the design lead for **Dog Territory Defender**, a location-based game that makes dog walks feel like a neighborhood adventure. Think *Pokémon GO meets INTVL* — but the whole vibe is warm, joyful, and dog-centric, like a sunny spring morning with your pup.

---

## The Design Challenge

We have the mechanics (territory claiming, collectibles, leaderboards, walk tracking). Now we need the **feeling**. Every screen should answer: *"Why would a busy dog owner play this instead of just... walking?"* Answer: because it makes the walk feel like shared adventure, celebrates their dog, and builds neighborhood connection.

---

## Three Core Design Questions

### 1. **What makes the map feel like *their* neighborhood, not a game board?**

Real streets, real parks, real landmarks. But also alive with personality—territory colors, seasonal details (spring blooms, pollen badges), and little celebrations when they claim a zone.

**Your call:**
- Pick a reference design: *Google Maps* (familiar, minimal) or *Apple Maps* (warmer, more illustrative)? Or hybrid?
- How do territories appear on the map? (opaque colored polygons? soft gradient halos? animated growth animation?)
- What happens to the map in spring? (cherry blossoms? green gradients? weather overlays?)

### 2. **How do we celebrate progress so a walk *feels* rewarding?**

The emotional hook: after each walk, something tangible happens. Territory appears. Dog levels up. XP ticks over. The screen should feel like a small win, every time.

**Your call:**
- End-of-walk screen: celebratory animation or calm summary? (Suggest: celebratory—confetti, tail wag, big XP number.)
- Territory claimed: does it auto-zoom the map? Show a "you own this street now" animation?
- Dog progression: XP bar or milestone badges? Both?

### 3. **How do we make the UI disappear so the map is center stage?**

Most time in the app: looking at the map. Minimal chrome. But buttons for key actions (start walk, see profile, claim territory, attack rival) must be instant and obvious.

**Your call:**
- Walk in progress: where's the stop button? (Bottom center, always visible?)
- Territory on map: tap to see details, or swipe? (Suggest: tap—less friction.)
- Leaderboard: modal popup or separate tab? (Suggest: modal—keeps map primary.)

---

## Visual Direction (Specific)

**Inspired by:**
- **Duolingo's playfulness** — rounded, bright, no corners feel sharp.
- **Strava's athletic clarity** — maps, stats, community, but friendly not aggressive.
- **Apple's spring palette** — greens, sky blues, warm whites, no dark mode.

**Colors (hex):**
- **Primary green** (territory/growth): `#2ECC71` (spring grass)
- **Sky blue** (map/safety): `#3498DB` (clear day)
- **Warm accent** (collectibles/joy): `#F39C12` (golden hour)
- **Dog brown** (UI elements, badges): `#8B6F47` (earth, natural)
- **White/neutral**: `#FAFAF8` (warm white, not pure white)

**Typography:**
- Headlines: rounded sans (like *Sora* or *Nunito* — friendly, not corporate)
- Body: clean sans (like *Inter* — readable at small sizes)
- Smallest text: never below 12px (accessibility for outdoor use)

**Paw prints & dog elements:**
- Paw print icon as breadcrumb trail on map (where you walked)
- Dog avatar changes based on breed (Corgi ears, Dachshund long body, Retriever fluff)
- Tiny tail wag animation when you gain XP

---

## Four Key Screens (Wireframe + Intent)

### **1. Map View (Active Walk)**
```
┌─────────────────────────────────┐
│     🗺️  MAP (full screen)        │
│  [territory polygons]            │
│  [collectible icons scattered]   │
│                                  │
│                   🐾 START POINT │
│                                  │
│         Your Dog's Trail ~~~~    │
│                                  │
│         [Rival Territory] ❌     │
└─────────────────────────────────┘
     [PAUSE]    [+ 0.8 KM]  ⚙️
        ↓
    Time: 12 min
    Battery: 73%
```

**Intent:** Map dominates. Walk in progress is obvious (time, distance, small buttons). Pausing and abandoning should be easy but not accidental.

---

### **2. Territory Claimed (Post-Walk Celebration)**
```
┌─────────────────────────────────┐
│                                  │
│         🎉 Territory Claimed!   │
│                                  │
│      Your dog now owns this     │
│        little corner of Berlin  │
│                                  │
│      📍 Kreuzberg North          │
│      Area: 0.34 km²             │
│                                  │
│      [Dog avatar celebrating]   │
│         🐕 Max                  │
│      XP +120 → Level 4! 🌟      │
│                                  │
│         [Next Walk →]            │
└─────────────────────────────────┘
```

**Intent:** Peak joy. Clear info (what they own, dog progress). Momentum to next walk.

---

### **3. Dog Profile**
```
┌─────────────────────────────────┐
│         🐕 Max                  │
│     Golden Retriever             │
│                                  │
│     Level 4  ████████░░ 87%     │
│                                  │
│     📊 Stats:                    │
│     Total walks: 34              │
│     Total km: 127.4 km           │
│     Territories owned: 7         │
│     Rivals defeated: 2           │
│                                  │
│     🏆 Kreuzberg Champion        │
│                    [i info]      │
└─────────────────────────────────┘
```

**Intent:** Dog is the star. Stats are about walks & community, not power creep. Badges feel earned.

---

### **4. Leaderboard (Tap from map)**
```
┌─────────────────────────────────┐
│     This Week in Kreuzberg      │
│                                  │
│  🥇 1. Luna (Husky) ⭐⭐⭐        │
│       523 XP, 4 territories      │
│                                  │
│  🥈 2. Max (Golden) ⭐⭐          │
│       487 XP, 7 territories      │
│                                  │
│  🥉 3. Buddy (Corgi)             │
│       412 XP, 5 territories      │
│                                  │
│       [Sort by: week/month]      │
│       [Filter by breed]          │
└─────────────────────────────────┘
```

**Intent:** Friendly competition. Celebrates all dogs. Makes you want to walk more next week.

---

## Interaction Moments (The Details That Delight)

1. **Pull-to-refresh on map** → paw prints appear briefly as if the dog just walked there.
2. **Tap a collectible (bone icon)** → bounces, gets collected with a little "ding" sound.
3. **Territory overlaps with rival's** → rival territory gets a subtle red outline, your territory stays green. Tap to "defend" (walk it again).
4. **Dog levels up** → full-screen celebration, tail wag animation, XP counter ticks up.
5. **End of walk** → confetti falls gently, not aggressively (confetti is friendly, not overwhelming).

---

## What We're *Not* Doing

- ❌ Dark mode (too aggressive for outdoor, spring vibes).
- ❌ PvP language ("conquer," "destroy"). Use "claim," "defend," "protect."
- ❌ Gamey chrome (XP bars everywhere, battle UI, power meters).
- ❌ Dog photos (use illustrations/avatars instead—more inclusive, more playful).

---

## Success Criteria

- A parent looks at the app and says: "This makes my dog walk more fun, not stressful."
- The map is the main event; UI buttons fade into the background.
- Claiming territory feels like "I made my mark on the neighborhood," not "I leveled up a metric."
- Someone walking with a friend can both be in the game at the same time and not feel like competitors.

---

## Next Moves

1. **Sketch the 4 screens** in wireframe form (even on paper).
2. **Pick color palette** — lock in 5 hex codes.
3. **Test one interaction** — build the "territory claimed" celebration screen in Figma/code.
4. **Iterate with a dog owner** — show them a walk-in-progress screen. Does it feel safe? Obvious?

---

**Design North Star:** *After a walk, the player looks at the map and thinks "I just did that. My dog did that. We belong here."*
