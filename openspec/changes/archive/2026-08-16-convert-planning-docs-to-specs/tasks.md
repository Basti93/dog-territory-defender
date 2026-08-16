## 1. Land specs in openspec/specs/

- [x] 1.1 Sync the 5 delta specs (`game-phases`, `visual-design`, `den-economy`, `pack-collection`, `anti-snowball`) into `openspec/specs/` via `/opsx:sync` (or archive, which syncs inline)
- [x] 1.2 Run `openspec validate --specs` to confirm the newly synced main specs are structurally valid

## 2. Update cross-references

- [x] 2.1 Update `CLAUDE.md`'s "Project essentials" links: replace `docs/01-prototype-plan-prompt.md` with `openspec/specs/game-phases/spec.md`, `docs/02-post-prototype-investigation-prompt.md` with the "Per-Phase Validation Process" requirement in `openspec/specs/game-phases/spec.md`, `docs/03-design-brief.md` with `openspec/specs/visual-design/spec.md`, `docs/04-engagement-mechanics.md` with `openspec/specs/den-economy/spec.md` + `openspec/specs/pack-collection/spec.md` + `openspec/specs/anti-snowball/spec.md`, and `docs/05-design-update-prompt.md` with the "Phase-Scoped Visual Delivery" requirement in `openspec/specs/visual-design/spec.md`
- [x] 2.2 Update `CLAUDE.md`'s "Your Core Responsibilities" doc-update table and the numbered implementation-handoff list to reference the new spec paths instead of the removed docs
- [x] 2.3 Check `README.md` for any `docs/*.md` links and update or remove them
- [x] 2.4 Leave `DECISIONS.md` and `README.md`'s status content otherwise untouched

## 3. Remove superseded docs

- [x] 3.1 Delete `docs/01-prototype-plan-prompt.md`
- [x] 3.2 Delete `docs/02-post-prototype-investigation-prompt.md`
- [x] 3.3 Delete `docs/03-design-brief.md`
- [x] 3.4 Delete `docs/04-engagement-mechanics.md`
- [x] 3.5 Delete `docs/05-design-update-prompt.md`
- [x] 3.6 Remove the `docs/` directory if it is empty after the deletions above (verify with `ls` first - do not assume)

## 4. Validate

- [x] 4.1 Run `openspec validate` (full) and confirm no errors
- [x] 4.2 Spot-check `CLAUDE.md` and `README.md` for any remaining dead links to `docs/`
