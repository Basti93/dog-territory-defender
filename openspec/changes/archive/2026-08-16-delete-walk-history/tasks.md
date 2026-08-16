## 1. Delete UI

- [x] 1.1 Add a delete button per row in `WalkHistoryScreen`'s `FlatList` row.
- [x] 1.2 Wire it to `Alert.alert` confirmation, then `repository.deleteWalk(item.id)` on confirm, updating local `walks` state to remove it.

## 2. Map refresh on return

- [x] 2.1 Add `territoryRefreshKey` state in `App.tsx`, incremented in the `WalkHistoryScreen`'s `onClose` handler.
- [x] 2.2 Pass it to `MapView` as a new prop; add to the territory-fetch `useEffect`'s dependency array.

## 3. Wrap-up

- [x] 3.1 Manual on-device smoke check: delete a walk from history, close history, confirm it's gone from both the list and the idle map.
- [x] 3.2 Update `README.md`'s "What works" section.
