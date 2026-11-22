// DB access for message_templates, kept separate from index.js (like
// siteSettings/store.js and systemSettings/store.js) so it can be
// required directly in tests without booting the server.
const { pool } = require('../../db')
const { TEMPLATES, getDefaultTemplate } = require('./templates')

// Every built-in template, merged with whatever override exists - the
// shape the Settings page's template list and the Message Customer
// panel's dropdown both read from. isOverridden lets the UI show a
// "Reset to default" action only when there's actually a row to reset.
const listTemplates = async () => {
  const { rows } = await pool.query('SELECT * FROM message_templates')
  const overrides = Object.fromEntries(rows.map((r) => [r.id, r]))
  return TEMPLATES.map((def) => {
    const override = overrides[def.id]
    return {
      id: def.id,
      group: def.group,
      label: def.label,
      body: override ? override.body : def.body,
      emailSubject: override ? override.email_subject : def.emailSubject,
      isOverridden: !!override,
    }
  })
}

const getTemplate = async (id) => {
  const def = getDefaultTemplate(id)
  if (!def) return null
  const { rows } = await pool.query('SELECT * FROM message_templates WHERE id = $1', [id])
  const override = rows[0]
  return {
    id: def.id,
    group: def.group,
    label: def.label,
    body: override ? override.body : def.body,
    emailSubject: override ? override.email_subject : def.emailSubject,
    isOverridden: !!override,
  }
}

const saveTemplateOverride = async (id, { body, emailSubject }, adminId) => {
  await pool.query(
    `INSERT INTO message_templates (id, body, email_subject, updated_at, updated_by)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (id) DO UPDATE SET body = $2, email_subject = $3, updated_at = NOW(), updated_by = $4`,
    [id, body, emailSubject, adminId]
  )
}

const resetTemplate = async (id) => {
  await pool.query('DELETE FROM message_templates WHERE id = $1', [id])
}

module.exports = { listTemplates, getTemplate, saveTemplateOverride, resetTemplate }
