-- Avisos internos exibidos no Dashboard (TV).
CREATE TABLE IF NOT EXISTS avisos (
  id         TEXT PRIMARY KEY,
  texto      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
