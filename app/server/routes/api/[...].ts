import { defineEventHandler, toWebRequest } from 'h3'
import { useStorage } from 'nitropack/runtime'
import { getApp } from '../../../../server/src/instance'
import type { MigrationSource } from '../../../../server/src/db/migrate'

function migrationId(key: string) {
  const name = key.replace(/\\/g, '/').replace(/:/g, '/').split('/').pop()
  return name || key
}

async function bundledMigrations(): Promise<MigrationSource[]> {
  const storage = useStorage('assets:migrations')
  const keys = (await storage.getKeys()).filter((key) => migrationId(key).endsWith('.sql')).sort()
  const files: MigrationSource[] = []
  for (const key of keys) {
    const source = await storage.getItem(key)
    const text = typeof source === 'string'
      ? source
      : source instanceof Uint8Array
        ? new TextDecoder().decode(source)
        : ''
    if (!text.trim()) throw new Error(`Migration ${migrationId(key)} is empty.`)
    files.push({ id: migrationId(key), source: text })
  }
  if (!files.length) throw new Error('No SQL migrations were bundled from server/drizzle.')
  return files
}

export default defineEventHandler(async (event) => {
  const app = await getApp(await bundledMigrations())
  return app.fetch(toWebRequest(event))
})
