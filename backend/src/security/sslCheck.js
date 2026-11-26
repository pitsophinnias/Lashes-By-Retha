// Reads the live TLS certificate's expiry by making an ordinary HTTPS
// connection - no root access or server config needed, since this just
// looks at what any browser visiting the site would see.
const tls = require('tls')

const getSslDaysRemaining = (host = process.env.SSL_CHECK_HOST || 'hairbyher.co.za', port = 443) => new Promise((resolve) => {
  const socket = tls.connect({ host, port, servername: host, timeout: 8000 }, () => {
    try {
      const cert = socket.getPeerCertificate()
      const validTo = cert?.valid_to ? new Date(cert.valid_to) : null
      socket.end()
      if (!validTo || isNaN(validTo.getTime())) return resolve(null)
      resolve(Math.ceil((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    } catch {
      socket.end()
      resolve(null)
    }
  })
  socket.on('error', () => resolve(null))
  socket.on('timeout', () => { socket.destroy(); resolve(null) })
})

module.exports = { getSslDaysRemaining }
