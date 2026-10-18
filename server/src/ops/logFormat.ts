// Pure helpers for the `logs` CLI command (kept free of DB/process code so they are unit-testable).
import type { LogRow } from '../services/deviceLogs';

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3600_000, d: 86_400_000 };

/** "90s", "30m", "2h", "3d" -> a cut-off timestamp (now minus the span). Throws on anything else. */
export function parseSince(spec: string, now: number): number {
  const m = /^(\d+)\s*([smhd])$/i.exec(spec.trim());
  if (!m) throw new Error(`--since must look like 90s, 30m, 2h or 3d (got "${spec}")`);
  return now - Number(m[1]) * UNIT_MS[m[2].toLowerCase()];
}

/** One line per entry: `2026-10-18T12:00:00.000Z  Pixel  active  [WALK_START] {"id":"..."}`. */
export function formatLogLine(row: LogRow): string {
  const payload = JSON.stringify(row.payload ?? {});
  return `${new Date(row.t).toISOString()}  ${row.deviceLabel}  ${row.appState}  [${row.event}] ${payload}`;
}
