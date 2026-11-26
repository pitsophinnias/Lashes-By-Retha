// Local-disk file storage - replaces the old Cloudinary integration now
// that the app runs on a VPS with a persistent disk instead of Render's
// free tier (wiped on every restart/sleep). UPLOAD_DIR is configurable so
// production can point it outside the repo (e.g. /home/serverha/hbh-uploads)
// and git pulls never touch uploaded files.
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const multer = require('multer')

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'))
const PUBLIC_PREFIX = '/uploads'
const IMAGES_DIR = path.join(UPLOAD_DIR, 'images')
const VIDEOS_DIR = path.join(UPLOAD_DIR, 'videos')

;[UPLOAD_DIR, IMAGES_DIR, VIDEOS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

// Only ever these - never svg (XSS via inline <script> in a "image"),
// html or anything executable. Checked by extension AND mimetype below,
// so a renamed .html can't sneak in as a fake .jpg.
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov']
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

const positiveNumber = (value, fallback) => {
  const parsed = parseFloat(value)
  return !isNaN(parsed) && parsed > 0 ? parsed : fallback
}

// MAX_FILE_SIZE_MB is the pre-existing env var name this reuses for images;
// videos get their own, larger default since a few seconds of phone video
// is routinely 20-50MB.
const MAX_IMAGE_BYTES = positiveNumber(process.env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024
const MAX_VIDEO_BYTES = positiveNumber(process.env.MAX_VIDEO_FILE_SIZE_MB, 100) * 1024 * 1024

const isVideoExtension = (filename) => ALLOWED_VIDEO_EXTENSIONS.includes(path.extname(filename).toLowerCase())
const isImageExtension = (filename) => ALLOWED_IMAGE_EXTENSIONS.includes(path.extname(filename).toLowerCase())

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  const mime = file.mimetype
  const isImage = ALLOWED_IMAGE_EXTENSIONS.includes(ext) && ALLOWED_IMAGE_MIME_TYPES.includes(mime)
  const isVideo = ALLOWED_VIDEO_EXTENSIONS.includes(ext) && ALLOWED_VIDEO_MIME_TYPES.includes(mime)
  if (isImage || isVideo) return cb(null, true)
  cb(new Error('Only jpg, jpeg, png, webp, gif images or mp4, webm, mov videos are allowed'), false)
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, isVideoExtension(file.originalname) ? VIDEOS_DIR : IMAGES_DIR)
  },
  // Random and unguessable - never derived from the original filename or
  // the item it belongs to, so a listing/guessed URL can't enumerate files.
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${crypto.randomUUID()}${ext}`)
  },
})

const upload = multer({ storage: diskStorage, fileFilter, limits: { fileSize: MAX_VIDEO_BYTES } })

const checkFileSize = (file) => {
  const isVideo = isVideoExtension(file.originalname)
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if (file.size <= max) return null
  // multer has already written the file to disk by the time we can check
  // its size (diskStorage, unlike memoryStorage) - remove it so a rejected
  // upload doesn't linger.
  if (file.path) { try { fs.unlinkSync(file.path) } catch {} }
  const maxMb = Math.round(max / (1024 * 1024))
  return isVideo ? `Videos must be smaller than ${maxMb}MB.` : `Images must be smaller than ${maxMb}MB.`
}

// The relative, public URL for a just-uploaded file - what gets stored in
// the database and served to the frontends.
const relativeUrlForFile = (file) => `${PUBLIC_PREFIX}/${isVideoExtension(file.filename) ? 'videos' : 'images'}/${file.filename}`

// Resolves a stored relative URL (e.g. "/uploads/images/<uuid>.jpg") back
// to an absolute path, guarding against it ever resolving outside
// UPLOAD_DIR. Returns null for anything that isn't a local upload URL
// (an absolute http(s) URL, or an unexpected shape).
const resolveUploadPath = (url) => {
  if (!url || typeof url !== 'string') return null
  if (/^https?:\/\//i.test(url)) return null
  const relative = url.startsWith(PUBLIC_PREFIX) ? url.slice(PUBLIC_PREFIX.length) : url
  const resolved = path.resolve(UPLOAD_DIR, `.${relative}`)
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) return null
  return resolved
}

// Best-effort delete - a missing file or bad URL never throws, since
// callers use this to clean up after a DB row that might already be
// pointing at a file that's gone for other reasons.
const deleteByUrl = (url) => {
  const resolved = resolveUploadPath(url)
  if (!resolved) return
  try { fs.unlinkSync(resolved) } catch {}
}

module.exports = {
  UPLOAD_DIR,
  IMAGES_DIR,
  VIDEOS_DIR,
  PUBLIC_PREFIX,
  upload,
  checkFileSize,
  relativeUrlForFile,
  resolveUploadPath,
  deleteByUrl,
  isVideoExtension,
  isImageExtension,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
}
