// Preloaded via --import for every test-file subprocess `node --test`
// spawns (see package.json's "test" script) - forces every test file to
// run against the test database, never the real one, and gives each file
// its own clean, freshly-seeded slate before anything else in that file
// runs.
//
// This has to be an ES module specifically so its top-level await actually
// finishes before node:test starts loading the test file itself. A
// CommonJS --require preload registering its own before() hook does NOT
// get awaited before the test file's own before() hook starts - the two
// run concurrently, which raced this truncate against the test file's own
// require('../index') (which calls createTables() itself on startup) and
// produced duplicate-key errors. --import's top-level await has no such
// race: Node doesn't evaluate the next module in the graph (the test file)
// until this one's module evaluation, awaits included, is fully done.
//
// Safe only because the test script also passes --test-concurrency=1: this
// truncates every table, which would corrupt another file's in-progress
// data if files ever ran concurrently against the same database.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { resolveTestDatabaseUrl } = require('./db-url-guard')

let info
try {
  info = resolveTestDatabaseUrl()
} catch (err) {
  console.error(`\nRefusing to run tests: ${err.message}\n`)
  process.exit(1)
}

// Never fall back to DATABASE_URL, even if dotenv has already set it from
// a real .env - this always wins.
process.env.DATABASE_URL = info.url

const { pool, createTables } = require('../db')

const { rows } = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
if (rows.length > 0) {
  const tableList = rows.map((r) => `"${r.tablename}"`).join(', ')
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
}
// Re-seeds roles, courses, products, categories, the sysadmin user and the
// site/system settings defaults that the truncate above just wiped - the
// same seeding createTables() already does for a brand-new database, run
// again here so every file starts from that same known-good state.
await createTables()
