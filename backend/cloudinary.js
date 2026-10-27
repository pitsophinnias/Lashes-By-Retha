// Cloudinary's SDK auto-configures itself from the CLOUDINARY_URL env var,
// so requiring it here (after dotenv.config() has run) is enough.
const cloudinary = require('cloudinary').v2

const isCloudinaryEnabled = !!process.env.CLOUDINARY_URL

// Wraps upload_stream in a promise so routes can await an in-memory buffer
// upload instead of writing it to disk first.
const uploadBuffer = (buffer, options) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
    if (err) reject(err)
    else resolve(result)
  })
  stream.end(buffer)
})

module.exports = { cloudinary, isCloudinaryEnabled, uploadBuffer }
