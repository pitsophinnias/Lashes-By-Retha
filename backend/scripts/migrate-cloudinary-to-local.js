// One-off migration: finds every res.cloudinary.com URL anywhere in the
// database (every text/varchar/json/jsonb column of every table - not just
// the obvious media/gallery_images/categories columns, so a URL buried in
// site_settings/site_settings_history JSON is never missed), downloads
// each unique file once into UPLOAD_DIR, and rewrites every reference to
// point at the new local URL instead.
//
// Downloads files directly from their public Cloudinary URL over plain
// HTTPS - never needs CLOUDINARY_URL or the Cloudinary SDK, so it still
// works after the account itself has been removed.
//
// Usage (from backend/):
//   npm run migrate:cloudinary:dry   # report only - downloads and writes nothing
//   npm run migrate:cloudinary       # downloads files and rewrites the database
//
// Safe to run more than once: a row already rewritten no longer matches
// the "contains a cloudinary URL" search, and a file already downloaded
// (same URL -> same filename, see localFilenameFor below) is reused
// instead of being fetched again.

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { pool } = require('../db')
const {
  IMAGES_DIR,
  VIDEOS_DIR,
  PUBLIC_PREFIX,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
} = require('../src/storage/local')

const DRY_RUN = process.argv.includes('--dry-run')

const CLOUDINARY_URL_PATTERN = /https?:\/\/res\.cloudinary\.com\/[^\s"'<>\\]+/g
const TEXTUAL_TYPES = ['text', 'character varying', 'json', 'jsonb']

const summary = {
  uniqueUrls: 0,
  filesDownloaded: 0,
  filesAlreadyOnDisk: 0,
  filesFailed: [],
  rowsUpdated: {}, // "table.column" -> count
}

const resetSummary = () => {
  summary.uniqueUrls = 0
  summary.filesDownloaded = 0
  summary.filesAlreadyOnDisk = 0
  summary.filesFailed = []
  summary.rowsUpdated = {}
}

// Every text/varchar/json/jsonb column of every real table in the public
// schema - deliberately not hand-picked, so a URL stashed somewhere
// unexpected (a JSON settings blob, a history snapshot) is never missed.
const listTextualColumns = async () => {
  const { rows } = await pool.query(
    `SELECT c.table_name, c.column_name, c.data_type
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       AND c.data_type = ANY($1)
     ORDER BY c.table_name, c.column_name`,
    [TEXTUAL_TYPES]
  )
  return rows
}

const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`

const isJsonColumn = (dataType) => dataType === 'json' || dataType === 'jsonb'

// Cloudinary's secure_url always reflects the asset's real resource type
// in its path ("/image/upload/" or "/video/upload/"), regardless of the
// "auto" resource_type this app uploaded with - reliable to classify on.
const isVideoUrl = (url) => /\/video\/upload\//.test(url)

// Deterministic per-URL filename - the same Cloudinary URL always maps to
// the same local file, which is what makes downloads idempotent across
// runs without needing a separate manifest.
const hashFor = (url) => crypto.createHash('sha256').update(url).digest('hex')

const findExistingFile = (dir, hash) => {
  try {
    return fs.readdirSync(dir).find((f) => f.startsWith(hash)) || null
  } catch {
    return null
  }
}

const extensionFromUrl = (url) => {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    if (ALLOWED_IMAGE_EXTENSIONS.includes(ext) || ALLOWED_VIDEO_EXTENSIONS.includes(ext)) return ext
  } catch {}
  return null
}

const EXTENSION_FROM_CONTENT_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
}

// Resolves one Cloudinary URL to its local /uploads/... URL, downloading
// it if needed. Returns null (and records a failure) if it can't be
// fetched - callers then leave that reference untouched so it's picked up
// again on the next run.
const resolveUrl = async (url, dryRun) => {
  const hash = hashFor(url)
  const dir = isVideoUrl(url) ? VIDEOS_DIR : IMAGES_DIR
  const subfolder = isVideoUrl(url) ? 'videos' : 'images'

  const existing = findExistingFile(dir, hash)
  if (existing) {
    summary.filesAlreadyOnDisk++
    return `${PUBLIC_PREFIX}/${subfolder}/${existing}`
  }

  if (dryRun) return `${PUBLIC_PREFIX}/${subfolder}/${hash}.*` // would-be URL, nothing written

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim()
    const ext = extensionFromUrl(url) || EXTENSION_FROM_CONTENT_TYPE[contentType] || '.jpg'
    const filename = `${hash}${ext}`
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(path.join(dir, filename), buffer)
    summary.filesDownloaded++
    console.log(`[downloaded] ${url} -> ${subfolder}/${filename}`)
    return `${PUBLIC_PREFIX}/${subfolder}/${filename}`
  } catch (err) {
    console.error(`[failed] ${url}: ${err.message}`)
    summary.filesFailed.push({ url, error: err.message })
    return null
  }
}

// Replaces every occurrence of a mapped Cloudinary URL inside a string.
// URLs that failed to resolve (urlMap value is null/undefined) are left
// exactly as they are.
const rewriteString = (value, urlMap) => {
  let changed = false
  const next = value.replace(CLOUDINARY_URL_PATTERN, (match) => {
    const replacement = urlMap.get(match)
    if (!replacement) return match
    changed = true
    return replacement
  })
  return { value: next, changed }
}

// Walks a parsed JSON value (object/array/string/...) rewriting any
// Cloudinary URLs found inside string values, however deeply nested.
const rewriteJson = (value, urlMap) => {
  let changed = false
  const walk = (node) => {
    if (typeof node === 'string') {
      const result = rewriteString(node, urlMap)
      if (result.changed) changed = true
      return result.value
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(node)) out[k] = walk(v)
      return out
    }
    return node
  }
  const next = walk(value)
  return { value: next, changed }
}

const run = async ({ dryRun = DRY_RUN } = {}) => {
  resetSummary()
  console.log(dryRun ? 'Dry run - nothing will be downloaded or written.\n' : 'Running migration - files will be downloaded and the database updated.\n')

  const columns = await listTextualColumns()

  // ── Discovery: find every row referencing a cloudinary URL ──────────────
  const perColumnRows = [] // { table, column, dataType, rows: [{ctid, value}] }
  const allUrls = new Set()

  for (const { table_name: table, column_name: column, data_type: dataType } of columns) {
    const t = quoteIdent(table)
    const c = quoteIdent(column)
    const { rows } = await pool.query(
      `SELECT ctid, ${c} AS value FROM ${t} WHERE ${c}::text ~ 'res\\.cloudinary\\.com'`
    )
    if (rows.length === 0) continue
    perColumnRows.push({ table, column, dataType, rows })
    for (const row of rows) {
      const text = isJsonColumn(dataType) ? JSON.stringify(row.value) : String(row.value)
      const matches = text.match(CLOUDINARY_URL_PATTERN) || []
      matches.forEach((m) => allUrls.add(m))
    }
  }

  summary.uniqueUrls = allUrls.size
  console.log(`Found ${allUrls.size} unique Cloudinary URL(s) across ${perColumnRows.length} column(s).\n`)

  // ── Resolve every unique URL to its local equivalent ─────────────────────
  const urlMap = new Map()
  for (const url of allUrls) {
    urlMap.set(url, await resolveUrl(url, dryRun))
  }

  // ── Rewrite ───────────────────────────────────────────────────────────────
  if (!dryRun && perColumnRows.length > 0) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const { table, column, dataType, rows } of perColumnRows) {
        const t = quoteIdent(table)
        const c = quoteIdent(column)
        let updated = 0
        for (const row of rows) {
          const { value, changed } = isJsonColumn(dataType)
            ? rewriteJson(row.value, urlMap)
            : rewriteString(row.value, urlMap)
          if (!changed) continue
          const cast = dataType === 'jsonb' ? '::jsonb' : dataType === 'json' ? '::json' : ''
          const param = isJsonColumn(dataType) ? JSON.stringify(value) : value
          await client.query(`UPDATE ${t} SET ${c} = $1${cast} WHERE ctid = $2`, [param, row.ctid])
          updated++
        }
        if (updated > 0) summary.rowsUpdated[`${table}.${column}`] = updated
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('Migration failed, rolled back all database changes:', err.message)
      throw err
    } finally {
      client.release()
    }
  } else if (dryRun) {
    // Report what WOULD be updated, without writing anything.
    for (const { table, column, dataType, rows } of perColumnRows) {
      let wouldUpdate = 0
      for (const row of rows) {
        const { changed } = isJsonColumn(dataType)
          ? rewriteJson(row.value, urlMap)
          : rewriteString(row.value, urlMap)
        if (changed) wouldUpdate++
      }
      if (wouldUpdate > 0) summary.rowsUpdated[`${table}.${column}`] = wouldUpdate
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────')
  console.log(`Unique Cloudinary URLs found: ${summary.uniqueUrls}`)
  console.log(`Files downloaded: ${summary.filesDownloaded}${dryRun ? ' (dry run - none actually downloaded)' : ''}`)
  console.log(`Files already on disk (skipped): ${summary.filesAlreadyOnDisk}`)
  console.log(`Failed downloads: ${summary.filesFailed.length}`)
  summary.filesFailed.forEach((f) => console.log(`  - ${f.url}: ${f.error}`))
  const rowEntries = Object.entries(summary.rowsUpdated)
  console.log(`Rows ${dryRun ? 'that would be updated' : 'updated'}: ${rowEntries.reduce((a, [, n]) => a + n, 0)}`)
  rowEntries.forEach(([key, count]) => console.log(`  - ${key}: ${count}`))
  console.log('──────────────────────────────────────────────────\n')

  return summary
}

module.exports = {
  run,
  rewriteString,
  rewriteJson,
  isVideoUrl,
  hashFor,
  CLOUDINARY_URL_PATTERN,
  summary,
}

// Only run as a CLI when invoked directly (node scripts/migrate-cloudinary-to-local.js) -
// a test file requires this module's exports without wanting the process to exit.
if (require.main === module) {
  run()
    .then(async () => {
      await pool.end()
      process.exit(summary.filesFailed.length > 0 ? 1 : 0)
    })
    .catch(async (err) => {
      console.error(err)
      try { await pool.end() } catch {}
      process.exit(1)
    })
}
