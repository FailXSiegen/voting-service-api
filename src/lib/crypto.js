import argon2 from "argon2";

export async function hash(plainTextValue) {
  return await argon2.hash(plainTextValue);
}

export async function verify(plainTextValue, hash) {
  try {
    return await argon2.verify(hash, plainTextValue);
  } catch (err) {
    console.error(err);
    return false;
  }
}
