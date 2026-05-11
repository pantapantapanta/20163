/**
 * 20163 Risk Management and Value in Banking and Insurance
 * Sanmartino Guest Lecture - Question Submission App
 *
 * NEW MODEL (rev. 12 May 2026)
 *   - 5 focus areas are predefined (A1..A5)
 *   - Each Scribe submits ONE record identified by their @studbocconi.it email
 *   - Group identity = submitter's email. Same email resubmits = overwrite (refinement)
 *   - Multiple students may choose the same area, independently - they do NOT see
 *     who else has chosen it. Each submission is its own group.
 *   - Public wall: groups submissions by area; each card labeled "Group N" (per-area
 *     sequential index, no email shown).
 *   - Admin: full visibility - email, area, both questions, both hypotheses, select toggles.
 */

const express = require('express');
const path = require('path');
const app = express();

// --- CONFIG ---
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'gfm2026';
const MAX_QUESTION_WORDS = 50;
const MAX_HYPOTHESIS_WORDS = 200;

// --- FIXED FOCUS AREAS ---
const AREAS = [
  { id: "A1", title: "Standard Formula vs Internal Model - rationale & trade-offs" },
  { id: "A2", title: "UFR & Risk-Free Rate term structure construction" },
  { id: "A3", title: "Volatility Adjustment" },
  { id: "A4", title: "Interest Rate Risk SCR - Up scenario & calibration under rising rates" },
  { id: "A5", title: "Mass Lapse risk under interest rate shocks" }
];

// --- IN-MEMORY STORE ---
const state = {
  areas: AREAS,
  submissions: new Map(), // email -> { email, area, q1, h1, q2, h2, sel1, sel2, submittedAt }
  submissionsOpen: false
};

const wallClients = new Set();
const adminClients = new Set();

// --- MIDDLEWARE ---
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- HELPERS ---
function countWords(s) {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function sortedSubmissions() {
  return Array.from(state.submissions.values())
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

// Compute per-area sequential group labels (Group 1, Group 2, ... by submission time)
function buildLabels(subs) {
  const counters = {};
  return subs.map(s => {
    counters[s.area] = (counters[s.area] || 0) + 1;
    return { ...s, groupLabel: `Group ${counters[s.area]}` };
  });
}

function publicView() {
  // Wall data - no email, no hypotheses
  const labelled = buildLabels(sortedSubmissions());
  return labelled.map(s => ({
    area: s.area,
    groupLabel: s.groupLabel,
    q1: s.q1, sel1: !!s.sel1,
    q2: s.q2, sel2: !!s.sel2
  }));
}

function adminView() {
  // Admin data - full
  const labelled = buildLabels(sortedSubmissions());
  return labelled.map(s => ({
    email: s.email,
    area: s.area,
    groupLabel: s.groupLabel,
    submittedAt: s.submittedAt,
    q1: s.q1, h1: s.h1, sel1: !!s.sel1,
    q2: s.q2, h2: s.h2, sel2: !!s.sel2
  }));
}

function broadcastWall() {
  const payload = JSON.stringify({
    type: 'wall',
    areas: state.areas,
    submissions: publicView(),
    submissionsOpen: state.submissionsOpen,
    submittedCount: state.submissions.size
  });
  for (const res of wallClients) res.write(`data: ${payload}\n\n`);
}

function broadcastAdmin() {
  const payload = JSON.stringify({
    type: 'admin',
    areas: state.areas,
    submissions: adminView(),
    submissionsOpen: state.submissionsOpen,
    submittedCount: state.submissions.size
  });
  for (const res of adminClients) res.write(`data: ${payload}\n\n`);
}

function broadcastAll() { broadcastWall(); broadcastAdmin(); }

function adminAuth(req, res, next) {
  const pw = req.headers['x-admin-password'] || req.query.pw;
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid admin password' });
  next();
}

// --- PUBLIC API ---

// Status (public): areas + open/closed + limits - does NOT expose submissions
app.get('/api/status', (req, res) => {
  res.json({
    areas: state.areas,
    submissionsOpen: state.submissionsOpen,
    submittedCount: state.submissions.size,
    limits: { maxQuestionWords: MAX_QUESTION_WORDS, maxHypothesisWords: MAX_HYPOTHESIS_WORDS }
  });
});

// Fetch own submission for refinement (key = email). Used by the form to pre-fill.
app.get('/api/my-submission', (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.json({ exists: false });
  const sub = state.submissions.get(email);
  if (!sub) return res.json({ exists: false });
  res.json({
    exists: true,
    email: sub.email,
    area: sub.area,
    q1: sub.q1, h1: sub.h1,
    q2: sub.q2, h2: sub.h2,
    submittedAt: sub.submittedAt
  });
});

// Submit (or overwrite by email)
app.post('/api/submit', (req, res) => {
  const { email, area, q1, h1, q2, h2 } = req.body || {};

  if (!state.submissionsOpen) return res.status(400).json({ error: 'Submissions are currently closed.' });

  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Bocconi email is required.' });
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail.endsWith('@studbocconi.it')) {
    return res.status(400).json({ error: 'You must use your @studbocconi.it email address.' });
  }

  if (!area || typeof area !== 'string' || !state.areas.some(a => a.id === area)) {
    return res.status(400).json({ error: 'Please select a valid focus area.' });
  }

  for (const [field, value, max] of [
    ['Primary Question', q1, MAX_QUESTION_WORDS],
    ['Backup Question', q2, MAX_QUESTION_WORDS],
    ['AI hypothesis on the Primary', h1, MAX_HYPOTHESIS_WORDS],
    ['AI hypothesis on the Backup', h2, MAX_HYPOTHESIS_WORDS]
  ]) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: `${field} is required.` });
    }
    if (countWords(value) > max) {
      return res.status(400).json({ error: `${field} exceeds the ${max}-word limit.` });
    }
  }

  const prev = state.submissions.get(normalizedEmail);
  state.submissions.set(normalizedEmail, {
    email: normalizedEmail,
    area,
    q1: q1.trim(),
    h1: h1.trim(),
    q2: q2.trim(),
    h2: h2.trim(),
    sel1: prev ? !!prev.sel1 : false,
    sel2: prev ? !!prev.sel2 : false,
    submittedAt: new Date().toISOString()
  });

  broadcastAll();
  res.json({ success: true, message: 'Submission recorded.' });
});

// Public wall data - grouped-by-area on the client
app.get('/api/questions', (req, res) => {
  res.json({
    areas: state.areas,
    submissions: publicView(),
    submissionsOpen: state.submissionsOpen,
    submittedCount: state.submissions.size
  });
});

app.get('/api/wall/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('\n');
  res.write(`data: ${JSON.stringify({
    type: 'wall',
    areas: state.areas,
    submissions: publicView(),
    submissionsOpen: state.submissionsOpen,
    submittedCount: state.submissions.size
  })}\n\n`);
  wallClients.add(res);
  req.on('close', () => wallClients.delete(res));
});

// --- ADMIN API ---

app.post('/api/admin/open', adminAuth, (req, res) => {
  state.submissionsOpen = true;
  broadcastAll();
  res.json({ success: true, submissionsOpen: true });
});

app.post('/api/admin/close', adminAuth, (req, res) => {
  state.submissionsOpen = false;
  broadcastAll();
  res.json({ success: true, submissionsOpen: false });
});

app.post('/api/admin/reset', adminAuth, (req, res) => {
  state.submissions.clear();
  state.submissionsOpen = false;
  broadcastAll();
  res.json({ success: true });
});

app.get('/api/admin/submissions', adminAuth, (req, res) => {
  res.json({
    areas: state.areas,
    submissions: adminView(),
    submissionsOpen: state.submissionsOpen,
    submittedCount: state.submissions.size
  });
});

app.get('/api/admin/stream', adminAuth, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('\n');
  res.write(`data: ${JSON.stringify({
    type: 'admin',
    areas: state.areas,
    submissions: adminView(),
    submissionsOpen: state.submissionsOpen,
    submittedCount: state.submissions.size
  })}\n\n`);
  adminClients.add(res);
  req.on('close', () => adminClients.delete(res));
});

// Toggle selected on a specific question; key = email + qNum
app.post('/api/admin/select', adminAuth, (req, res) => {
  const { email, qNum, selected } = req.body || {};
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const sub = state.submissions.get(normalizedEmail);
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (qNum !== 1 && qNum !== 2) return res.status(400).json({ error: 'qNum must be 1 or 2.' });
  if (qNum === 1) sub.sel1 = !!selected; else sub.sel2 = !!selected;
  broadcastAll();
  res.json({ success: true });
});

app.get('/api/admin/export.json', adminAuth, (req, res) => {
  const payload = {
    exportedAt: new Date().toISOString(),
    course: '20163 Risk Management and Value in Banking and Insurance',
    exercise: 'Sanmartino Guest Lecture - Question Submission Cycle',
    areas: state.areas,
    submissions: adminView()
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="questions_export.json"');
  res.send(JSON.stringify(payload, null, 2));
});

app.get('/api/admin/export.csv', adminAuth, (req, res) => {
  const rows = [];
  rows.push(['Email', 'Area', 'GroupLabel', 'SubmittedAt',
             'Q1', 'Selected1', 'H1',
             'Q2', 'Selected2', 'H2'].map(csvEsc).join(','));
  for (const s of adminView()) {
    rows.push([
      s.email, s.area, s.groupLabel, s.submittedAt,
      s.q1 || '', s.sel1 ? 'yes' : '', s.h1 || '',
      s.q2 || '', s.sel2 ? 'yes' : '', s.h2 || ''
    ].map(csvEsc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="questions_export.csv"');
  res.send(rows.join('\n'));
});

function csvEsc(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// --- START ---
app.listen(PORT, () => {
  console.log(`\n  20163 Question Submission App on http://localhost:${PORT}`);
  console.log(`  Submission form: /     -  Wall: /wall.html  -  Admin: /admin.html`);
  console.log(`  Admin password:  ${ADMIN_PASSWORD}\n`);
});
