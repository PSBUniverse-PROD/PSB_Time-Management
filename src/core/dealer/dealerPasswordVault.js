import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// PSB staff can view a dealer's current password, so a reversible copy is kept
// in psb_s_dealeraccount.password_encrypted next to the bcrypt hash. Sign-in
// never uses this copy: it always checks password_hash.
// The copy is AES-256-GCM. Its key is derived from JWT_SECRET (no extra env
// variable); changing JWT_SECRET makes stored copies unreadable, and staff then
// set a new password. Stored as "v1:<iv>:<tag>:<ciphertext>".

const VAULT_VERSION = "v1";
const IV_BYTES = 12;

function getVaultKey() {
  const secret = process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error("Dealer password storage is not configured (JWT_SECRET is missing).");
  }
  // Own suffix, so this key is never the same as the dealer session key.
  return createHash("sha256").update(`${secret}:dealer-password`).digest();
}

export function encryptDealerPassword(password) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getVaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(password ?? ""), "utf8"), cipher.final()]);
  return [VAULT_VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

/** The plain password, or null when none is stored or it can't be read (other key, changed value). */
export function decryptDealerPassword(stored) {
  if (!stored) return null;
  const [version, iv, tag, ciphertext] = String(stored).split(":");
  if (version !== VAULT_VERSION || !iv || !tag || !ciphertext) return null;

  const key = getVaultKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
