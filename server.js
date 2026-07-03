require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');

const db = require('./db');
const { getQuestionPair } = require('./lib/questions');
const { evaluateAnswers } = require('./lib/evaluate');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Admin protection: HTTP Basic Auth with ADMIN_PASSWORD ---
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return res.status(500).send('ADMIN_PASSWORD is not configured on the server');
  }
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Authentication required');
}

// --- Pages ---
app.get('/', (req, res) => res.redirect('/assessment'));
app.get('/assessment', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'assessment.html'))
);
app.get('/results/:id', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'results.html'))
);
app.get('/admin', requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
);

// --- API ---
app.get('/api/questions', (req, res) => {
  res.json(getQuestionPair());
});

app.post('/api/evaluate', async (req, res) => {
  const { name, q1, q2 } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Candidate name is required' });
  }
  for (const [label, q] of [['q1', q1], ['q2', q2]]) {
    if (!q || typeof q.question !== 'string' || typeof q.transcript !== 'string') {
      return res.status(400).json({ error: `${label} must include question and transcript` });
    }
  }
  if (!q1.transcript.trim() && !q2.transcript.trim()) {
    return res.status(400).json({ error: 'Both transcripts are empty — nothing to evaluate' });
  }

  try {
    const evaluation = await evaluateAnswers({
      question1: q1.question,
      transcript1: q1.transcript,
      question2: q2.question,
      transcript2: q2.transcript
    });

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO assessments
        (id, name, created_at,
         question1, transcript1, duration1, mode1,
         question2, transcript2, duration2, mode2,
         band, evaluation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name.trim(),
      new Date().toISOString(),
      q1.question,
      q1.transcript,
      Number.isFinite(q1.durationSec) ? Math.round(q1.durationSec) : null,
      q1.mode === 'text' ? 'text' : 'voice',
      q2.question,
      q2.transcript,
      Number.isFinite(q2.durationSec) ? Math.round(q2.durationSec) : null,
      q2.mode === 'text' ? 'text' : 'voice',
      evaluation.overall_band,
      JSON.stringify(evaluation)
    );

    res.json({ id });
  } catch (err) {
    console.error('Evaluation failed:', err);
    res.status(502).json({ error: 'Evaluation failed. Please try again.' });
  }
});

app.get('/api/results/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM assessments WHERE id = ?')
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  res.json({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    band: row.band,
    q1: {
      question: row.question1,
      transcript: row.transcript1,
      durationSec: row.duration1,
      mode: row.mode1
    },
    q2: {
      question: row.question2,
      transcript: row.transcript2,
      durationSec: row.duration2,
      mode: row.mode2
    },
    evaluation: JSON.parse(row.evaluation)
  });
});

app.get('/api/admin/assessments', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      'SELECT id, name, created_at, band FROM assessments ORDER BY created_at DESC'
    )
    .all();
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`English assessment app listening on http://localhost:${PORT}`);
});
