# Walk storage and history

Every walk the user ends is durably saved locally, retrievable individually or as a full history, in a way that stays forward-compatible with future cloud sync.

- A walk's full record (locations, start time, finished status) is persisted as soon as it ends, whether it qualified for a reward or was finished short of the ground-covered floor (distinguishable from a qualifying walk). The record carries no territory polygon; the ground covered lives in the separately persisted Home Range grid (see `home-range`). It is retrievable after an app restart.
- A walk discarded via Cancel is never persisted (not retrievable afterward).
- A single walk is retrievable by identifier (full record), and the full set of saved walks is retrievable.
- Persistence is independent of React/JS app state: restart, crash or backgrounding never loses a saved walk.
- Each walk records whether it has been synced to a remote store, defaulting to not-synced, with no remote connectivity or sync behaviour required yet.
- **Looking back:** since 2026-10-18 saved walks are viewed as the Album of postcards (`visual-design.md`, "Postcards on the Bench"): newest started first, each entry identifies its walk (date/time); an empty Album shows a friendly on-tone empty state, never a blank or broken screen. A walk that painted nothing shows no card; no "rewarded / short" status is shown (nothing is framed as lesser).
- **Delete is permanent**, so it asks for confirmation first (from the open card, "Diese Karte wegnehmen"). It removes only that walk's record from storage and the Album; the ground stays: no cell it painted leaves the Home Range or the Range/Bloom (see `home-range`, monotonic Range). The confirmation copy never implies deleting undoes its effect on the map.
