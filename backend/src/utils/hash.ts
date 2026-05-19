import * as crypto from "crypto";

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const SEPARATOR = ":";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}${SEPARATOR}${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored.includes(SEPARATOR)) {
    // 兼容旧密码（明文存储，未加盐）
    return stored === password;
  }
  const [salt, hash] = stored.split(SEPARATOR);
  const computed = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return computed === hash;
}
