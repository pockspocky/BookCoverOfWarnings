import { hash, verify, type Algorithm } from '@node-rs/argon2'

const options = {
  algorithm: 2 as Algorithm, // Argon2id. Ambient const enums cannot be imported under verbatimModuleSyntax.
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
}

export function hashPassword(password: string) {
  return hash(password, options)
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password)
}
