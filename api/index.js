// Vercel Serverless entry for the backend API ("Path B": whole stack on Vercel).
//
// vercel.json rewrites every `/api/*` request (any depth) to this function,
// which hands it to the existing Express app (server/app.js). The app mounts
// its routes under `/api`, so we make sure that prefix is present regardless of
// how the platform forwards the path.
//
// Unavailable in this serverless environment (need a long-running host instead):
//   - Socket.IO realtime chat / live notifications (no persistent connection)
//   - Local file uploads (filesystem is read-only except /tmp)
// Everything else — auth, the admin control panel, and the rest of the REST
// API — works once the database environment variables are set in Vercel.

const app = require('../server/app');

module.exports = (req, res) => {
  if (typeof req.url === 'string' && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};
