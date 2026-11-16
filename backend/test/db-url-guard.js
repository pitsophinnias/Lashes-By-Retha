// Shared validation for TEST_DATABASE_URL - used by both the pretest check
// (check-test-db.js, which runs once before anything else) and the setup
// preloaded into every test-file subprocess (setup.js), so the two can
// never drift apart on what counts as a safe test database. Tests must
// never be able to reach DATABASE_URL (a real database), so this never
// falls back to it - an invalid or missing TEST_DATABASE_URL is a hard stop.

function resolveTestDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL
  if (!raw) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Tests run only against a separate local test database, never DATABASE_URL - see backend/.env.example.'
    )
  }
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid connection string.')
  }
  const host = parsed.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`TEST_DATABASE_URL must point at localhost or 127.0.0.1 - got "${host}".`)
  }
  const dbName = parsed.pathname.replace(/^\//, '')
  if (!dbName.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL's database name ("${dbName}") must end in "_test".`)
  }
  return { url: raw, dbName, host }
}

module.exports = { resolveTestDatabaseUrl }
