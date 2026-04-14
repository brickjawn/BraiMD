require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const apiKeyAuth = require('./middleware/apiKeyAuth');
const skillRoutes = require('./routes/skillRoutes');
const edgeRoutes = require('./routes/edgeRoutes');
const viewRoutes = require('./routes/viewRoutes');
const viewController = require('./controllers/viewController');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust first proxy hop (Podman bridge / future Caddy reverse proxy)
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Security headers — allow CDN scripts/styles for Bootstrap and vis-network
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
    },
  },
}));

// CORS — restrict to configured origin
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Rate limiting on API routes
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later.' },
}));

// Routes — API key auth on agent-facing skill routes only
app.use('/api/skills', apiKeyAuth, skillRoutes);

// Edge routes: no API key auth — consumed by the dashboard tree page (same-origin
// fetch calls that don't carry an x-api-key header). Adding apiKeyAuth here would
// break the vis-network drag-to-connect and edge deletion flows.
// Phase 2: session auth for dashboard routes; API key auth for external edge consumers.
app.use('/api/edges', edgeRoutes);

// Tree data endpoint powers the vis-network graph on /dashboard/tree
app.get('/api/tree-data', viewController.treeData);

app.use('/dashboard', viewRoutes);

// Root redirect
app.get('/', (_req, res) => res.redirect('/dashboard'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`BraiMD server listening on port ${PORT}`);
});
