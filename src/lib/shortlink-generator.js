import crypto from "crypto";
import { findOneByShortCode } from "../repository/event-user-shortlink-repository";

/**
 * Generate a random alphanumeric string
 * @param {number} length - Length of the string to generate
 * @returns {string}
 */
function generateRandomString(length) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a unique short code for shortlink
 * Checks database to ensure uniqueness
 * @param {number} length - Length of the short code (default: 10)
 * @returns {Promise<string>}
 */
export async function generateUniqueShortCode(length = 10) {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const shortCode = generateRandomString(length);
    const existing = await findOneByShortCode(shortCode);

    if (!existing) {
      return shortCode;
    }

    attempts++;
  }

  // If we still have collisions after 10 attempts, increase length
  return generateRandomString(length + 2);
}
