// Pure session types, kept apart from doorstepSession.ts (which imports a React component) so that server-shared modules
// (postcards.ts -> den/wildExtras.ts) never pull React/TSX into the server's tsc.
export type SessionKind = 'same-day-reopen' | 'fresh-open';
export type GreetingFlavor = 'first-open' | 'long-absence';
