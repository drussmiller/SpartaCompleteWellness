import crypto from "crypto";

export function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}
