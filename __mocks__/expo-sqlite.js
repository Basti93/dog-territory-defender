// Jest manual mock for expo-sqlite (no native binary under jest).
// src/utils/debugLog.ts calls openDatabaseAsync eagerly at import time (via
// utils/log.ts, e.g. TerritoryPortrait), so that one entry point returns an
// inert fake database. Every OTHER way of opening a database throws loudly:
// screens under test must receive in-memory repositories as props, never
// sqlite-backed ones.

function makeFakeDatabase() {
  return {
    execAsync: async () => {},
    runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
  };
}

function refuse(name) {
  return () => {
    throw new Error(
      `expo-sqlite.${name} was called in a test. Pass in-memory repositories (src/storage/inMemory*) to the screen instead.`
    );
  };
}

module.exports = {
  openDatabaseAsync: async () => makeFakeDatabase(), // debugLog.ts only
  openDatabaseSync: refuse('openDatabaseSync'),
  deleteDatabaseAsync: refuse('deleteDatabaseAsync'),
  SQLiteProvider: refuse('SQLiteProvider'),
};
