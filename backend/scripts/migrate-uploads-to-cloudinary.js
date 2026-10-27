// One-off migration: uploads everything under backend/uploads to Cloudinary
// and points the database at the new URLs. Safe to run more than once - it
// skips anything that looks already migrated.
//
// Usage: npm run migrate:uploads  (run from the backend directory)

const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { pool } = require('../db')
const { isCloudinaryEnabled, uploadBuffer } = require('../cloudinary')

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')

const summary = { uploaded: 0, skipped: 0, failed: 0 }

// Matches "products-12.jpg" / "classes-3.png" - captures the numeric id.
const itemFilePattern = (type) => new RegExp(`^${type}-(\\d+)\\.[a-zA-Z0-9]+$`)

const migrateItemType = async (type) => {
  const dir = path.join(UPLOAD_DIR, type)
  if (!fs.existsSync(dir)) return
  const pattern = itemFilePattern(type)

  for (const filename of fs.readdirSync(dir)) {
    const match = filename.match(pattern)
    if (!match) continue
    const itemId = match[1]

    try {
      const existing = await pool.query(
        'SELECT url FROM media WHERE type = $1 AND item_id = $2',
        [type, itemId]
      )
      if (existing.rows[0]?.url?.startsWith('http')) {
        console.log(`[skip] ${type} ${itemId} - already migrated`)
        summary.skipped++
        continue
      }

      const buffer = fs.readFileSync(path.join(dir, filename))
      const result = await uploadBuffer(buffer, {
        folder: `hairbyher/${type}`,
        public_id: `${type}-${itemId}`,
        overwrite: true,
        invalidate: true,
        resource_type: 'auto',
      })
      await pool.query(
        `INSERT INTO media (type, item_id, url, public_id, resource_type, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (type, item_id) DO UPDATE
         SET url = $3, public_id = $4, resource_type = $5, updated_at = NOW()`,
        [type, itemId, result.secure_url, result.public_id, result.resource_type]
      )
      console.log(`[ok] ${type} ${itemId} -> ${result.secure_url}`)
      summary.uploaded++
    } catch (err) {
      console.error(`[fail] ${type} ${itemId}:`, err.message)
      summary.failed++
    }
  }
}

const migrateGallery = async () => {
  const dir = path.join(UPLOAD_DIR, 'gallery')
  const { rows } = await pool.query('SELECT id, filename, url, type FROM gallery_images')

  for (const row of rows) {
    if (row.url?.startsWith('http')) {
      console.log(`[skip] gallery ${row.id} - already migrated`)
      summary.skipped++
      continue
    }

    const filePath = path.join(dir, row.filename)
    if (!fs.existsSync(filePath)) {
      console.error(`[fail] gallery ${row.id}: file not found (${row.filename})`)
      summary.failed++
      continue
    }

    try {
      const buffer = fs.readFileSync(filePath)
      const result = await uploadBuffer(buffer, {
        folder: 'hairbyher/gallery',
        resource_type: 'auto',
      })
      await pool.query(
        'UPDATE gallery_images SET url = $1, public_id = $2 WHERE id = $3',
        [result.secure_url, result.public_id, row.id]
      )
      console.log(`[ok] gallery ${row.id} -> ${result.secure_url}`)
      summary.uploaded++
    } catch (err) {
      console.error(`[fail] gallery ${row.id}:`, err.message)
      summary.failed++
    }
  }
}

const run = async () => {
  if (!isCloudinaryEnabled) {
    console.error('CLOUDINARY_URL is not set. Add it to backend/.env before running this migration.')
    process.exit(1)
  }

  await migrateItemType('products')
  await migrateItemType('classes')
  await migrateGallery()

  console.log(`\nDone. Uploaded: ${summary.uploaded}, skipped: ${summary.skipped}, failed: ${summary.failed}.`)
  await pool.end()
  process.exit(summary.failed > 0 ? 1 : 0)
}

run()
