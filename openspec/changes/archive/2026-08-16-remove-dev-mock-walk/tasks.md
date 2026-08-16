## 1. Remove mock code

- [x] 1.1 Delete `src/utils/mockGps.ts` and `src/utils/mockWalkFixtures.ts`.
- [x] 1.2 Remove the two 🧪 mock-walk buttons and `startMockWalkFlow` from `App.tsx`.
- [x] 1.3 Remove `mockSubscriptionRef`/`MockWalkHandle` import; simplify `stopAllTracking()` to just call `stopWatchingLocation()`.

## 2. Wrap-up

- [x] 2.1 `npx tsc --noEmit` and `npx jest` both clean after removal.
- [x] 2.2 Update `README.md`: replace the mock-buttons note with emulator GPX-route testing instructions, mention `testing/munich-route.gpx`.
