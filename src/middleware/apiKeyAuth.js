const crypto = require('crypto');

const API_KEY_HASH = process.env.API_KEY_HASH;
const API_KEY_ID = process.env.API_KEY_ID || 'unknown';

if (!API_KEY_HASH) {
  console.warn('[WARN] API_KEY_HASH not set — API key auth is DISABLED (dev mode)');
}

/**
 * Express middleware that verifies the x-api-key header against a
 * SHA-256 hash stored in the API_KEY_HASH environment variable.
 *
 * When API_KEY_HASH is unset, all requests pass through (dev mode).
 * On success, attaches req.apiKeyId for downstream logging.
 */
function apiKeyAuth(req, res, next) {
  // Dev mode — no hash configured, let everything through
  if (!API_KEY_HASH) {
    req.apiKeyId = null;
    return next();
  }

  const provided = req.headers['x-api-key'];
  if (!provided) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const providedHash = crypto
      .createHash('sha256')
      .update(provided)
      .digest('hex');

    // Both are 64-char hex strings → equal-length buffers
    const a = Buffer.from(providedHash, 'hex');
    const b = Buffer.from(API_KEY_HASH, 'hex');

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  req.apiKeyId = API_KEY_ID;
  next();
}

module.exports = apiKeyAuth;
