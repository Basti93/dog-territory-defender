import { createHash, randomBytes, randomInt } from 'node:crypto';

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** `dtd_` prefix lets secret scanners recognise a leaked token. */
export function newDeviceToken(): string {
  return `dtd_${randomBytes(32).toString('base64url')}`;
}

// Unambiguous alphabet: no 0/O, 1/I/L.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 8;

export function newInviteCode(): string {
  let out = '';
  for (let i = 0; i < INVITE_LENGTH; i++) out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return out;
}

/** Case-insensitive; spaces and dashes ignored, so "abcd-2345" works. */
export function normalizeInviteCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export const hashInviteCode = (code: string): string => sha256Hex(`invite:${normalizeInviteCode(code)}`);
