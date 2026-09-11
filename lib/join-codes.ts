import { randomBytes } from "node:crypto";

/**
 * The short codes people hand each other to join something — a squad, or a
 * raid.
 *
 * Spoken out loud as often as pasted, so the alphabet drops everything that
 * sounds or looks like something else: no I, no O, no 0, no 1. 32 characters
 * over 6 places is about a billion codes.
 *
 * Shared by `lib/squads.ts` and `lib/raids.ts` rather than written twice: the
 * two collections hand out codes from the same alphabet, and a player typing a
 * code should not have to know which of the two they were given.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/** How many free codes to look for before giving up on a nearly-full space. */
export const CODE_ATTEMPTS = 5;

/**
 * 256 divides evenly by 32, so taking each random byte modulo the alphabet
 * length is unbiased.
 */
export function newCode(): string {
  return Array.from(
    randomBytes(CODE_LENGTH),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");
}

/** The form a code takes in the database, and what a typed one is compared as. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Which unique index a write collided with, or `null` if it did not collide at
 * all.
 *
 * Both cases are duplicate keys and neither is a bug, but they call for opposite
 * answers: a taken code is retried with another one, whereas a user who is
 * already in a squad is not something a retry can fix.
 */
export function duplicateOf(error: unknown): "code" | "member" | null {
  const failure = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
    message?: string;
  } | null;

  if (failure?.code !== 11000) return null;

  // `keyPattern` names the index; the message is the fallback for drivers or
  // proxies that do not carry it.
  const named = failure.keyPattern
    ? Object.keys(failure.keyPattern).join(" ")
    : (failure.message ?? "");

  return named.includes("members.userId") ? "member" : "code";
}
