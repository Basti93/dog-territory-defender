## Context

See `proposal.md` - Why. This is a pure documentation-to-specs migration: five `docs/*.md` files (a phased-plan prompt, a per-phase audit prompt, a design brief, an engagement-mechanics spec, and a prototype-update prompt) are being converted into 5 OpenSpec capabilities. Two of the source documents (`01-prototype-plan-prompt.md`, `02-post-prototype-investigation-prompt.md`, and to a lesser extent `05-design-update-prompt.md`) are written as *prompts for a future AI session to generate a plan*, not as the plan's output — they describe a process and a structure more than they contain fixed content. This design records how that ambiguity was resolved so the mapping choices are auditable later.

## Goals / Non-Goals

**Goals:**
- Decide, once, which capability owns which source content, so the spec files (this change's actual deliverable) are internally consistent and nothing is silently dropped.
- Record where narrative/flavor content was deliberately kept as descriptive prose instead of forced into a normative `SHALL` requirement.

**Non-Goals:**
- Redesigning the phased plan, the engagement mechanics, or the visual direction. No content decisions here change what the game does — only where its description lives.
- Deciding the capability split for future, unrelated features. This design only covers the 5 capabilities created by this change.

## Decisions

### Capability split: 5 capabilities, not fewer or more
`game-phases`, `visual-design`, `den-economy`, `pack-collection`, `anti-snowball`. Considered a single monolithic `product-spec` capability instead — rejected because OpenSpec deltas are per-capability, and a future change touching only, say, Pack tuning would otherwise force a delta across unrelated Den/anti-snowball content. Considered splitting Den and Pack further (e.g. one capability per building) — rejected as over-fragmentation for a 10-row table with no independent lifecycle.

### Phase-gating rule lives inside `game-phases`, not as a standalone capability or purely in CLAUDE.md
The rule ("never build a later phase's features early") is a process constraint, but OpenSpec's own model treats "the build process SHALL NOT implement out-of-phase features" as a testable requirement on the system's development process, not on runtime behavior — so it fits the `### Requirement: Phase Gating Rule` format cleanly. It stays paired with the 5 phase requirements in one file because the rule only makes sense next to the phases it gates, and splitting it out would force every reader to cross-reference two capabilities to understand one rule. `CLAUDE.md` keeps a short pointer to `openspec/specs/game-phases/spec.md` (see proposal's Impact) rather than restating the rule, so there is one source of truth.

### `docs/02-post-prototype-investigation-prompt.md` becomes a `Requirement` inside `game-phases`, not a separate capability
Its content (the audit's 8 sections, the CONTINUE/ITERATE/PIVOT/KILL decision) is itself a testable process requirement ("the team SHALL produce this audit before advancing"), so it was written as `### Requirement: Per-Phase Validation Process` rather than dropped as pure process. It stays inside `game-phases` because it has no independent existence apart from the phase plan it validates.

### `docs/04-engagement-mechanics.md` Part 4 (phase-to-mechanic mapping) becomes a requirement in `game-phases`, cross-referencing the other three capabilities
Rather than duplicating the full mapping table inside each of `den-economy`, `pack-collection`, and `anti-snowball`, it lives once in `game-phases` as `### Requirement: Engagement Mechanic Rollout per Phase`, and each of the other specs' own "Phase 1 Minimum Den"-style requirements only states its own phase-scoping fact. This avoids three copies of the same table silently drifting out of sync.

### `docs/04-engagement-mechanics.md` Part 5 ("Spring-Themed Engagement Examples") and both docs' "Design North Star" lines are descriptive prose, not requirements
These are illustrative day-in-the-life narratives and tone-setting quotes, not testable behavior — forcing them into `SHALL`/`WHEN`/`THEN` form would fabricate false precision (e.g. "the owner" and "Max" are example names, not required content). They were folded into each relevant spec's `## Purpose` section as one-line design-north-star quotes (`game-phases`, `visual-design`, `anti-snowball`) instead of being dropped, per the instruction to prefer preserving design thinking over deleting it. The Monday-through-Saturday narrative walkthrough itself (the most flavor-heavy part of Part 5) was judged low-value to preserve verbatim in a spec file — it dramatizes mechanics already captured as requirements elsewhere (treat notifications in `den-economy`, mentor prompts in `anti-snowball`, streak badges in `game-phases`/`visual-design`) and would read as odd narrative prose inside a requirements document. It is not carried into any spec file; it existed only in `docs/04-engagement-mechanics.md`, which this change deletes. **Flagged for the user**: if this narrative walkthrough itself (not just the mechanics it illustrates) has standalone value, it should be recovered from git history before or instead of merging this change, since no spec file preserves its prose.

### `docs/01-prototype-plan-prompt.md`'s "what I want you to produce" meta-instructions (tech stack recommendation ask, architecture-ER-diagram ask, "Day 1 of Phase 0" checklist ask) are not carried into any spec
That section instructs a *future planning session* what document to produce - it is not itself a decision, a number, or a requirement (e.g. no tech stack was actually chosen in this file; `openspec/config.yaml`'s context block already records the real chosen stack: Expo SDK 54, React Native 0.74, React 18, TypeScript 5.3 strict). Carrying prompt-authoring instructions into `game-phases/spec.md` would misrepresent them as product requirements. This is a deliberate drop, not an oversight.

### `docs/05-design-update-prompt.md`'s prototype-specific implementation inventory (component names like `IOSDevice`, `NeighborhoodMap`, `Confetti`, animation keyframe names, the tweaks-panel field list) is not carried into `visual-design`
Per `CLAUDE.md`, the prototype is a design spec to be pixel-recreated, not a starter codebase to copy structurally - so its internal component/prop names are implementation detail owned by `prototype/` (explicitly out of scope for this change), not durable product requirements. The *intent* behind that file (only build the current target phase's screens; reuse tokens; park later-phase ideas) is preserved as `visual-design`'s `### Requirement: Phase-Scoped Visual Delivery`, which is the part of docs/05 that is actually a durable rule rather than a file-specific inventory.

## Risks / Trade-offs

[Risk: numeric thresholds could be silently altered during transcription] → Mitigation: every number in `den-economy`, `pack-collection`, `anti-snowball`, and `game-phases`' acceptance criteria was copied verbatim from the source docs (e.g. +50% above L50, +30% combined cap, 2x for 30 days, +5% mentor bonus, 3-month resets, 8-slot cap, 80% common-vs-legendary, 100m privacy fuzz, <5%/30min battery, <10m GPS drift) rather than paraphrased; a reviewer can diff each requirement against the corresponding table/bullet in `docs/04-engagement-mechanics.md` (via git history after deletion) to confirm.

[Risk: the Part 5 narrative walkthrough is lost] → Mitigation: called out explicitly above and in the final report; recoverable from git history (`git show e352096:docs/04-engagement-mechanics.md` from the pre-deletion commit) if wanted later.

[Risk: `docs/01`/`docs/02` being "prompt templates" means re-running them would regenerate different phase numbers than what's now frozen in `game-phases`] → Mitigation: this is intentional - the spec now freezes the *actual* Phase 0-4 plan that was already decided and is referenced as current (README.md, DECISIONS.md) rather than leaving it open to regeneration. If the team wants to re-run the planning prompts, that becomes a new OpenSpec change proposing a `MODIFIED` delta against `game-phases`, not a doc edit.

## Migration Plan

1. Land this change's delta specs into `openspec/specs/` via `/opsx:sync` (or archive, which syncs inline).
2. Update `CLAUDE.md` references from `docs/01`-`docs/05` to the corresponding `openspec/specs/<capability>/spec.md` paths.
3. Check `README.md` for dead links to the removed docs and fix any found.
4. Delete the 5 superseded `docs/*.md` files and the `docs/` directory if left empty.
5. Run `openspec validate` to confirm structural validity.
6. No rollback beyond `git checkout` of the deleted files / edited docs, since nothing outside `openspec/`, `CLAUDE.md`, and `README.md` changes.
