// DB access for site_settings/site_settings_history, kept separate from
// index.js (like ozow.js and phone.js) so it can be required directly in
// tests without booting the server.

const { pool } = require('../../db')

const SITE_SETTINGS_KEYS = ['content', 'theme']

// Theme changes the whole site's look, so it is restricted one level tighter
// than content - sysadmin only, not owner.
const siteSettingsRolesForKey = (key) => (key === 'theme' ? ['sysadmin'] : ['sysadmin', 'owner'])

// Saves a new value for a settings key, archiving whatever was live before it
// into history, then trims that key's history down to its 10 most recent
// rows. Restoring or resetting also calls this, so both count as a save and
// an undo of an undo works.
const saveSiteSetting = async (key, value, adminId) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'SELECT value, updated_by FROM site_settings WHERE key = $1 FOR UPDATE',
      [key]
    )
    if (rows.length > 0) {
      await client.query(
        'INSERT INTO site_settings_history (key, value, saved_by) VALUES ($1, $2, $3)',
        [key, rows[0].value, rows[0].updated_by]
      )
    }
    await client.query(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3`,
      [key, value, adminId]
    )
    await client.query(
      `DELETE FROM site_settings_history WHERE id IN (
         SELECT id FROM site_settings_history WHERE key = $1 ORDER BY saved_at DESC OFFSET 10
       )`,
      [key]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

module.exports = { SITE_SETTINGS_KEYS, siteSettingsRolesForKey, saveSiteSetting }
