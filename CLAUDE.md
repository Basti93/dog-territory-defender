# CLAUDE.md — Rules for Claude Code & AI Coding Agent Sessions

This file tells Claude (and any AI coding agent) how to collaborate on **Dog Territory Defender**. Read this at the start of every session.

---

## Project essentials

- **Product:** Location-based mobile game for urban dog owners. Spring-like, joyful. Cookie-clicker background loop. Anti-snowball social layer.
- **Status tracker:** [README.md](README.md) — check Project Status section first.
- **Master build plan:** [docs/01-prototype-plan-prompt.md](docs/01-prototype-plan-prompt.md) (5-phase lean-startup plan). **Do not deviate from the phase-gated approach.**
- **Per-phase validation:** [docs/02-post-prototype-investigation-prompt.md](docs/02-post-prototype-investigation-prompt.md) (run at end of each phase).
- **Visual direction:** [docs/03-design-brief.md](docs/03-design-brief.md).
- **Engagement mechanics:** [docs/04-engagement-mechanics.md](docs/04-engagement-mechanics.md) (The Den, The Pack, anti-snowball).
- **Design update prompt:** [docs/05-design-update-prompt.md](docs/05-design-update-prompt.md) (evolve the prototype as phases progress).
- **Decisions log:** [DECISIONS.md](DECISIONS.md) (append-only, newest first).
- **Visual prototype:** [prototype/](prototype/) — clickable HTML demo. Match its output, not its internal structure.

---

## For AI Coding Agents — Implementation handoff

When implementing the real app (i.e., you're not just planning):

1. **The prototype is a design spec, not a starter codebase.** It's HTML + React Babel standalone — meant to be pixel-recreated in React Native + Expo (the target stack). Don't copy its structure; match its visuals and behaviors.
2. **Always confirm the phase before writing code.** Ask: "Are we implementing Phase 0, 1, 2, 3, or 4?" Build only what that phase needs.
3. **Read the `PARKED FOR LATER PHASES` comment block** at the top of `prototype/Dog Territory Defender.html` — those features are explicitly deferred and must not leak into earlier phases.
4. **Use the design tokens** defined in the prototype (`T.green`, `T.blue`, etc.). No new colors without an entry in [DECISIONS.md](DECISIONS.md).
5. **Re-read [docs/04-engagement-mechanics.md](docs/04-engagement-mechanics.md)** before touching anything related to treats, the Den, building levels, or anti-snowball. Numeric thresholds there are load-bearing.
6. **When ambiguity arises, ask the user — don't guess.** Scope clarification is cheap; rebuilding is not.
7. **After implementation of a phase:** run [docs/02-post-prototype-investigation-prompt.md](docs/02-post-prototype-investigation-prompt.md) to validate before advancing.

---

## Your Core Responsibilities

### 1. Keep the project plan up-to-date

When any of the following changes, update the relevant doc **in the same turn**:

| Change | Update |
|---|---|
| New feature decided | `docs/01-prototype-plan-prompt.md` (assign to a phase) + `DECISIONS.md` |
| Visual / UX direction shifts | `docs/03-design-brief.md` + `DECISIONS.md` |
| Game mechanic added or changed | `docs/04-engagement-mechanics.md` + `DECISIONS.md` |
| Phase hypothesis validated/invalidated | `README.md` status + `DECISIONS.md` |
| Tech stack / architecture decision | `docs/01-prototype-plan-prompt.md` (architecture section) + `DECISIONS.md` |
| Tone / language guideline added | `docs/03-design-brief.md` + `DECISIONS.md` |
| Prototype files added/renamed | `README.md` folder map + `prototype/README.md` |

**Rule:** No silent drift. If the plan no longer matches reality, fix it now.

### 2. Log every significant decision in `DECISIONS.md`

Entry format:

```markdown
## YYYY-MM-DD — [Short title]
**Area:** Architecture / Design / Game / Tone / Product
**Decision:** [What was decided, in one sentence]
**Why:** [The rationale — especially the tradeoffs considered]
**Alternatives rejected:** [What else was considered and why not]
**Affects:** [Which files / phases / features this touches]
**Decided by:** [User / Claude / discussion]
```

**Significant** = tech choices, mechanic changes, numeric thresholds, cutting features, tone shifts, architecture moves, user preferences revealed.
**Not significant** = typos, reordering bullets, wording clarifications that don't change meaning.

### 3. Memorize key decisions to long-term memory

For decisions that should persist across conversations, save to the memory system (see auto memory instructions at session start). Memory types:
- **user** — role/preferences (e.g., "the owner is a Senior Fullstack Developer")
- **project** — ongoing context (e.g., "Dog Territory Defender targets EU, Berlin-first beta")
- **feedback** — collaboration guidance
- **reference** — pointers to external systems

`DECISIONS.md` is the authoritative log. Memory is the quick-recall cache.

### 4. Respect phase boundaries

- **Never** build Phase 3 features in Phase 1.
- Every feature request: first classify which phase it belongs to.
- If out-of-phase, push back kindly and park it for later.
- Scope creep is how prototypes die.

### 5. Preserve the tone

- **Spring-like, friendly, joyful, dog-centric.**
- Never "conquer," "destroy," "kill," "battle." Use "claim," "defend," "protect."
- No dark mode.
- Copy is warm and celebratory, not transactional.
- Match the tone of existing files in any new file.

### 6. Don't guess — check

- Before referencing a file, verify with `ls` or `Glob`.
- Before citing a numeric threshold, read it from the source doc.
- Before proposing a mechanic, check `docs/04-engagement-mechanics.md` — it may exist.
- Memory can be stale — verify against current files.

### 7. Default behaviors

- **Prefer editing over creating** new files. Each doc has a purpose; justify a new one first.
- **Keep docs concise.** Every doc is meant to be read end-to-end.
- **Update `README.md`** folder map when adding or moving files.
- **Update `DECISIONS.md`** when anything non-trivial is decided.

---

## How to start a new session

1. Read `CLAUDE.md` (this file) → collaboration rules
2. Read `README.md` → current status, folder map, phase we're in
3. Skim `DECISIONS.md` → recent decisions (last 5–10 entries)
4. Check `MEMORY.md` (if memory system is available) → user preferences + project context
5. If working on implementation: open `prototype/Dog Territory Defender.html` in a text editor to see the design spec
6. Ask the user: "What are we working on today, and which phase?"

---

## Anti-patterns to avoid

- ❌ Building Phase 3+ features when we're still in Phase 1
- ❌ Updating a doc without an entry in `DECISIONS.md`
- ❌ Forgetting to update `README.md` status after a phase completes
- ❌ Using aggressive/competitive language
- ❌ Proposing dark mode, emoji-heavy UI, or aggressive monetization
- ❌ Silently changing a numeric threshold without logging why
- ❌ Creating a new `.md` file when an existing one could be extended
- ❌ Copying the prototype's React-Babel-standalone structure into production code
- ❌ Starting to code before confirming the target phase with the user

---

**Remember:** The phased plan is sacred. The tone is spring. The dog is the star. The walk is the heartbeat.
