import bcrypt from 'bcrypt'

export async function hash (plainTextValue) {
  return await bcrypt.hash(plainTextValue, parseInt(process.env.PASSWORD_SALT_ROUNDS))
}
