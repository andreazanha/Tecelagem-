-- Página de Romaneios: prestadores de serviço e cadastro de costura.
CREATE TABLE IF NOT EXISTS prestadores (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  telefone   TEXT,
  servico    TEXT,                          -- tassel | costura | outro
  obs        TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS costura (
  nome       TEXT PRIMARY KEY,              -- descrição do serviço de costura
  valor      REAL NOT NULL DEFAULT 0,       -- mão de obra
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
