// Disk space for the filesystem holding a given path (UPLOAD_DIR), via
// `df` - Node has no built-in cross-platform disk-usage API. Resolves to
// null on anything that doesn't have `df` (e.g. local Windows dev), so the
// Security page just shows "unknown" there instead of failing.
const { execFile } = require('child_process')

const getDiskUsage = (targetPath) => new Promise((resolve) => {
  execFile('df', ['-Pk', targetPath], { timeout: 5000 }, (err, stdout) => {
    if (err) return resolve(null)
    try {
      const lines = stdout.trim().split('\n')
      const fields = lines[lines.length - 1].trim().split(/\s+/)
      // Filesystem, 1K-blocks, Used, Available, Use%, Mounted on
      const totalBytes = parseInt(fields[1], 10) * 1024
      const usedBytes = parseInt(fields[2], 10) * 1024
      const freeBytes = parseInt(fields[3], 10) * 1024
      const usedPercent = parseInt(fields[4], 10)
      if (![totalBytes, usedBytes, freeBytes, usedPercent].every(Number.isFinite)) return resolve(null)
      resolve({ totalBytes, usedBytes, freeBytes, usedPercent })
    } catch {
      resolve(null)
    }
  })
})

module.exports = { getDiskUsage }
