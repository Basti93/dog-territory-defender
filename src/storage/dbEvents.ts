// Storage diagnostics without importing the logger: log.ts -> debugLog.ts -> database.ts would loop. log.ts registers
// itself here at load time.
type DatabaseEventListener = (tag: string, data: Record<string, unknown>) => void;
let listener: DatabaseEventListener = () => undefined;

export function setDatabaseEventListener(next: DatabaseEventListener): void {
  listener = next;
}

export function reportDatabaseEvent(tag: string, data: Record<string, unknown> = {}): void {
  try {
    listener(tag, data);
  } catch {
    // Diagnostics never break storage.
  }
}
