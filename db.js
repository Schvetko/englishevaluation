const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'assessments.db');
require('fs').mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    question1 TEXT NOT NULL,
    transcript1 TEXT NOT NULL,
    duration1 INTEGER,
    mode1 TEXT,
    question2 TEXT NOT NULL,
    transcript2 TEXT NOT NULL,
    duration2 INTEGER,
    mode2 TEXT,
    band TEXT,
    evaluation TEXT
  )
`);

module.exports = db;
