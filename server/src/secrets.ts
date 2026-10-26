import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLACEHOLDERS = new Set(['bow', 'bowsecret', 'password', 'postgres', 'changeme', 'change-me', 'secret', 'minioadmin'])

function resolveSecretPath(file: string) {
  if (isAbsolute(file) || existsSync(file)) return file
  const fromRepo = join(dirname(fileURLToPath(import.meta.url)), '../..', file)
  if (existsSync(fromRepo)) return fromRepo
  return file
}

export function readSecret(name: string) {
  const file = process.env[`${name}_FILE`]?.trim()
  if (file) return readFile(resolveSecretPath(file), `${name}_FILE`)
  const directory = process.env.SECRETS_DIR?.trim()
  if (directory) {
    const path = join(directory, name)
    if (existsSync(path)) return readFile(path, name)
  }
  const value = process.env[name]?.trim()
  return value || undefined
}

export function requireSecret(name: string) {
  const value = readSecret(name)
  if (!value) throw new Error(`Missing ${name}. Set ${name}_FILE, place a file named ${name} in SECRETS_DIR, or set ${name}.`)
  assertProductionSecret(name, value)
  return value
}

function readFile(path: string, label: string) {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const value = readFileSync(path, 'utf8').trim()
  if (!value) throw new Error(`${label} is empty.`)
  return value
}

export function assertProductionSecret(name: string, value: string) {
  if (process.env.NODE_ENV !== 'production') return
  if (PLACEHOLDERS.has(value.toLowerCase())) {
    throw new Error(`${name} is a placeholder. Load it from ${name}_FILE or SECRETS_DIR.`)
  }
  try {
    const url = new URL(value)
    const password = decodeURIComponent(url.password)
    if (password && PLACEHOLDERS.has(password.toLowerCase())) {
      throw new Error(`${name} contains a placeholder password. Load it from ${name}_FILE or SECRETS_DIR.`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('placeholder')) throw error
  }
}
