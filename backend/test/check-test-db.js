// Runs once, before any test file starts - wired up as the npm "pretest"
// script, which npm always runs before "test" on its own, in its own
// process. Validates TEST_DATABASE_URL, prints which database the whole
// suite is about to run against (so that's never a surprise), and creates
// the schema there if it doesn't exist yet - the one-time bootstrap that
// setup.js's per-file truncate-and-reseed (see that file) depends on
// already being there.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { resolveTestDatabaseUrl } = require('./db-url-guard')

let info
try {
  info = resolveTestDatabaseUrl()
} catch (err) {
  console.error(`\nRefusing to run tests: ${err.message}\n`)
  process.exit(1)
}

// Never fall back to DATABASE_URL, even if dotenv has already set it.
process.env.DATABASE_URL = info.url

console.log(`\nRunning backend tests against database "${info.dbName}" on ${info.host}.\n`)

const { pool, createTables } = require('../db')

createTables()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to prepare the test database schema:', err.message)
    process.exit(1)
  })
