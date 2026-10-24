/** YYYY-MM-DD of `ms` in an IANA timezone (same format and rule as the server's dayKeyInZone); the device's zone when none is given. */
export function dayKeyInZone(ms: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
