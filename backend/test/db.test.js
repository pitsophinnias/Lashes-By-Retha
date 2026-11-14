const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { pool, createTables } = require('../db')

const DASHBOARD_TITLE = 'Dashboard ready'
const DASHBOARD_MESSAGE = 'Hair By Her admin dashboard is live and running.'

test('createTables removes old "Dashboard ready" notifications and leaves other system notifications alone', async () => {
  await pool.query(
    `INSERT INTO notifications (type, title, message) VALUES ($1, $2, $3)`,
    ['system', DASHBOARD_TITLE, DASHBOARD_MESSAGE]
  )
  const { rows: [other] } = await pool.query(
    `INSERT INTO notifications (type, title, message) VALUES ($1, $2, $3) RETURNING id`,
    ['system', 'Something else', 'An unrelated system notification.']
  )

  try {
    await createTables()

    const { rows: dashboardRows } = await pool.query(
      `SELECT * FROM notifications WHERE type = 'system' AND title = $1 AND message = $2`,
      [DASHBOARD_TITLE, DASHBOARD_MESSAGE]
    )
    assert.strictEqual(dashboardRows.length, 0)

    const { rows: otherRows } = await pool.query('SELECT * FROM notifications WHERE id = $1', [other.id])
    assert.strictEqual(otherRows.length, 1)
  } finally {
    await pool.query('DELETE FROM notifications WHERE id = $1', [other.id])
  }
})
