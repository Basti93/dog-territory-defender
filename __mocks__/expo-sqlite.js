// Jest manual mock (openspec/changes/home-dashboard). expo-sqlite wraps a
// native module that isn't available in this project's plain jest-expo test
// environment (no native binary) — calling the real module's
// openDatabaseAsync crashes the whole process (not just a test failure)
// because src/utils/debugLog.ts calls it eagerly at module-import time. No
// existing test file happened to transitively import debugLog.ts (via
// src/utils/log.ts) until this change's DoorstepScreen.test.ts started
// importing DoorstepScreen.tsx -> TerritoryPortrait.tsx -> utils/log.ts.
// This mock only needs to let that import chain resolve without crashing;
// no test in this codebase asserts anything about the debug log's own
// content.

function makeFakeDatabase() {
  return {
    execAsync: async () => {},
    runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
  };
}

module.exports = {
  openDatabaseAsync: async () => makeFakeDatabase(),
};
