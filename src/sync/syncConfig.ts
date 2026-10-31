/**
 * Prefilled server address on the join form. Set EXPO_PUBLIC_SERVER_URL at build/OTA time (see .env.example,
 * deploy/README.md); empty means the player types it. Joined households keep their stored serverUrl.
 */
export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? '';
/** Invite codes are 8 chars from an unambiguous alphabet (multiplayer-sync design.md Decision 7). */
export const INVITE_CODE_LENGTH = 8;
