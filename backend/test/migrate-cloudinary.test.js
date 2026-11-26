const { test, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// Isolated upload dir for this file only, so the migration script's real
// downloads never touch backend/uploads - set before anything requires
// ../src/storage/local (which resolves UPLOAD_DIR once, at require time).
const TEST_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hbh-migrate-test-'))
process.env.UPLOAD_DIR = TEST_UPLOAD_DIR

const migrate = require('../scripts/migrate-cloudinary-to-local')
const { IMAGES_DIR } = require('../src/storage/local')

let pool

before(() => {
  pool = require('../db').pool
})

after(async () => {
  await pool.query(`DELETE FROM site_settings WHERE key = 'migtest'`)
  fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true })
})

// ── rewriteString / rewriteJson (pure URL-rewriting logic) ──────────────────

test('rewriteString replaces a mapped Cloudinary URL and leaves everything else untouched', () => {
  const urlMap = new Map([['https://res.cloudinary.com/demo/image/upload/v1/hairbyher/products/a.jpg', '/uploads/images/abc.jpg']])
  const { value, changed } = migrate.rewriteString(
    'see https://res.cloudinary.com/demo/image/upload/v1/hairbyher/products/a.jpg please',
    urlMap
  )
  assert.strictEqual(changed, true)
  assert.strictEqual(value, 'see /uploads/images/abc.jpg please')
})

test('rewriteString replaces multiple distinct URLs in the same string', () => {
  const urlMap = new Map([
    ['https://res.cloudinary.com/demo/image/upload/a.jpg', '/uploads/images/a.jpg'],
    ['https://res.cloudinary.com/demo/image/upload/b.jpg', '/uploads/images/b.jpg'],
  ])
  const { value, changed } = migrate.rewriteString(
    'https://res.cloudinary.com/demo/image/upload/a.jpg and https://res.cloudinary.com/demo/image/upload/b.jpg',
    urlMap
  )
  assert.strictEqual(changed, true)
  assert.strictEqual(value, '/uploads/images/a.jpg and /uploads/images/b.jpg')
})

test('rewriteString leaves a URL untouched when it failed to resolve (null in the map)', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/broken.jpg'
  const urlMap = new Map([[url, null]])
  const { value, changed } = migrate.rewriteString(`image: ${url}`, urlMap)
  assert.strictEqual(changed, false)
  assert.strictEqual(value, `image: ${url}`)
})

test('rewriteString is a no-op when no Cloudinary URL is present', () => {
  const { value, changed } = migrate.rewriteString('just plain text', new Map())
  assert.strictEqual(changed, false)
  assert.strictEqual(value, 'just plain text')
})

test('rewriteJson rewrites a Cloudinary URL nested inside objects and arrays', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/hero.jpg'
  const urlMap = new Map([[url, '/uploads/images/hero.jpg']])
  const input = {
    hero: { image: url },
    gallery: [{ url }, { url: 'https://example.com/unrelated.jpg' }],
    note: `background: ${url}`,
  }
  const { value, changed } = migrate.rewriteJson(input, urlMap)
  assert.strictEqual(changed, true)
  assert.strictEqual(value.hero.image, '/uploads/images/hero.jpg')
  assert.strictEqual(value.gallery[0].url, '/uploads/images/hero.jpg')
  assert.strictEqual(value.gallery[1].url, 'https://example.com/unrelated.jpg')
  assert.strictEqual(value.note, 'background: /uploads/images/hero.jpg')
})

test('rewriteJson is a no-op when nothing inside references a Cloudinary URL', () => {
  const input = { a: 1, b: ['x', 'y'], c: { d: 'z' } }
  const { value, changed } = migrate.rewriteJson(input, new Map())
  assert.strictEqual(changed, false)
  assert.deepStrictEqual(value, input)
})

test('isVideoUrl classifies by the /video/upload/ vs /image/upload/ path segment', () => {
  assert.strictEqual(migrate.isVideoUrl('https://res.cloudinary.com/demo/video/upload/clip.mp4'), true)
  assert.strictEqual(migrate.isVideoUrl('https://res.cloudinary.com/demo/image/upload/photo.jpg'), false)
})

test('hashFor is deterministic for the same URL and differs for different URLs', () => {
  const a = migrate.hashFor('https://res.cloudinary.com/demo/image/upload/a.jpg')
  const b = migrate.hashFor('https://res.cloudinary.com/demo/image/upload/a.jpg')
  const c = migrate.hashFor('https://res.cloudinary.com/demo/image/upload/b.jpg')
  assert.strictEqual(a, b)
  assert.notStrictEqual(a, c)
})

// ── End-to-end: discovers, downloads and rewrites a real row ───────────────

test('run() downloads a referenced file and rewrites the database; a second run is a no-op', async (t) => {
  const fakeUrl = `https://res.cloudinary.com/demo/image/upload/v1/hairbyher/products/${crypto.randomBytes(4).toString('hex')}.jpg`
  const fakeBytes = Buffer.from('fake-jpeg-bytes')

  await pool.query(
    `INSERT INTO site_settings (key, value) VALUES ('migtest', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify({ hero: { image: fakeUrl } })]
  )

  const realFetch = global.fetch
  let fetchCalls = 0
  global.fetch = async (url) => {
    if (String(url) === fakeUrl) {
      fetchCalls++
      return {
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => fakeBytes.buffer.slice(fakeBytes.byteOffset, fakeBytes.byteOffset + fakeBytes.byteLength),
      }
    }
    return realFetch(url)
  }
  t.after(() => { global.fetch = realFetch })

  // Dry run: reports the row as needing an update but changes nothing.
  const dryResult = await migrate.run({ dryRun: true })
  assert.strictEqual(dryResult.rowsUpdated['site_settings.value'], 1)
  assert.strictEqual(fetchCalls, 0)
  const afterDry = (await pool.query(`SELECT value FROM site_settings WHERE key = 'migtest'`)).rows[0]
  assert.strictEqual(afterDry.value.hero.image, fakeUrl)
  assert.strictEqual(fs.readdirSync(IMAGES_DIR).length, 0)

  // Real run: downloads the file once and rewrites the row.
  const realResult = await migrate.run({ dryRun: false })
  assert.strictEqual(realResult.filesDownloaded, 1)
  assert.strictEqual(realResult.rowsUpdated['site_settings.value'], 1)
  assert.strictEqual(fetchCalls, 1)

  const afterReal = (await pool.query(`SELECT value FROM site_settings WHERE key = 'migtest'`)).rows[0]
  const newUrl = afterReal.value.hero.image
  assert.ok(newUrl.startsWith('/uploads/images/'))
  assert.notStrictEqual(newUrl, fakeUrl)
  const writtenFiles = fs.readdirSync(IMAGES_DIR)
  assert.strictEqual(writtenFiles.length, 1)
  assert.strictEqual(fs.readFileSync(path.join(IMAGES_DIR, writtenFiles[0])).toString(), 'fake-jpeg-bytes')

  // Second real run: the row no longer references a Cloudinary URL, so
  // nothing is downloaded or rewritten again.
  const secondResult = await migrate.run({ dryRun: false })
  assert.strictEqual(secondResult.uniqueUrls, 0)
  assert.strictEqual(secondResult.filesDownloaded, 0)
  assert.deepStrictEqual(secondResult.rowsUpdated, {})
  assert.strictEqual(fetchCalls, 1)
  assert.strictEqual(fs.readdirSync(IMAGES_DIR).length, 1)
})

test('run() leaves a reference untouched when the download fails, so it is retried next time', async (t) => {
  const fakeUrl = `https://res.cloudinary.com/demo/image/upload/v1/hairbyher/products/${crypto.randomBytes(4).toString('hex')}.jpg`

  await pool.query(
    `INSERT INTO site_settings (key, value) VALUES ('migtest', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify({ hero: { image: fakeUrl } })]
  )

  const realFetch = global.fetch
  global.fetch = async (url) => {
    if (String(url) === fakeUrl) return { ok: false, status: 404 }
    return realFetch(url)
  }
  t.after(() => { global.fetch = realFetch })

  const result = await migrate.run({ dryRun: false })
  assert.strictEqual(result.filesFailed.length, 1)
  assert.strictEqual(result.filesFailed[0].url, fakeUrl)
  assert.deepStrictEqual(result.rowsUpdated, {})

  const row = (await pool.query(`SELECT value FROM site_settings WHERE key = 'migtest'`)).rows[0]
  assert.strictEqual(row.value.hero.image, fakeUrl)
})
