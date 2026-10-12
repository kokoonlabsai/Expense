const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { HttpError } = require('./util');
const { ready } = require('./db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// CORS_ORIGIN: comma-separated list of allowed frontend origins (e.g. your Vercel URL). Unset = allow all.
const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : undefined));
// Make sure the schema exists before the first query.
app.use((req, res, next) => ready.then(() => next(), next));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
// Some automation apps send JSON with a text/plain content type.
app.use(express.text({ type: 'text/plain' }));
app.use((req, res, next) => {
  if (typeof req.body === 'string' && /^\s*[[{]/.test(req.body)) {
    try { req.body = JSON.parse(req.body); } catch { /* leave as-is */ }
  }
  next();
});

// Tiny in-memory rate limiter for auth endpoints.
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = hits.get(key) || { n: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.n = 0; entry.reset = now + windowMs; }
    entry.n++;
    hits.set(key, entry);
    if (entry.n > max) return next(new HttpError(429, 'Too many attempts. Try again in a minute.'));
    next();
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', rateLimit(20, 60_000), require('./routes/auth'));
app.use('/api/v1', require('./routes/v1'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api', require('./routes/transactions'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body is not valid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = Number(process.env.PORT) || 4000;
if (require.main === module) {
  app.listen(port, () => console.log(`Tally API listening on http://localhost:${port}`));
}

module.exports = app;
