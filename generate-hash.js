import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, KEY_LENGTH));
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  const password = "Test1234!";
  const hashedPassword = await hashPassword(password);
}

main().catch(console.error);