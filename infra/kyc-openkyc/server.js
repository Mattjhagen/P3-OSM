/**
 * Mock OpenKYC/IDKit server for local KYC investor demo.
 * Exposes the same API surface as FaceOnLive OpenKYC for development.
 * Works fully offline - no external dependencies.
 */

const http = require('http');
const url = require('url');

const PORT = parseInt(process.env.PORT || '8787', 10);
const APP_BASE = process.env.MOCK_APP_BASE_URL || 'http://localhost:5173';

const sessions = new Map();

function randomId() {
  return 'mock_' + Math.random().toString(36).slice(2, 12);
}

function createSession() {
  const sessionId = randomId();
  const verifyUrl = `${APP_BASE}/kyc-mock-ui?sessionId=${sessionId}`;
  sessions.set(sessionId, {
    sessionId,
    status: 'pending',
    createdAt: Date.now(),
    extractedFields: null,
  });
  return { sessionId, url: verifyUrl };
}

function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  // Auto-approve after 10 seconds (demo simulation)
  if (s.status === 'pending' && Date.now() - s.createdAt >= 10000) {
    s.status = 'approved';
    s.extractedFields = {
      firstName: 'Demo',
      lastName: 'Investor',
      dateOfBirth: '1990-01-15',
      documentType: 'passport',
      country: 'US',
    };
  }
  return { status: s.status, extractedFields: s.extractedFields };
}

function completeSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  if (s.status === 'pending') {
    s.status = 'approved';
    s.extractedFields = {
      firstName: 'Demo',
      lastName: 'Investor',
      dateOfBirth: '1990-01-15',
      documentType: 'passport',
      country: 'US',
    };
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /sessions -> create session
  if (method === 'POST' && path === '/sessions') {
    const body = { sessionId: '', url: '' };
    let buf = '';
    req.on('data', (chunk) => { buf += chunk; });
    req.on('end', () => {
      const result = createSession();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  // GET /sessions/:id -> get status
  const sessionsMatch = path.match(/^\/sessions\/([^/]+)$/);
  if (method === 'GET' && sessionsMatch) {
    const sessionId = sessionsMatch[1];
    const result = getSession(sessionId);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // POST /sessions/:id/complete -> manual complete (for mock UI)
  const completeMatch = path.match(/^\/sessions\/([^/]+)\/complete$/);
  if (method === 'POST' && completeMatch) {
    const sessionId = completeMatch[1];
    const ok = completeSession(sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: ok }));
    return;
  }

  // GET /health
  if (method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'mock-openkyc' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Mock OpenKYC listening on http://localhost:${PORT}`);
});
