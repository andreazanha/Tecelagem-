-- Descontos no pagamento da costureira/prestador.
-- descontos_fixos: catálogo reutilizável (ex.: "Almofada refeita" = R$ 3,00).
CREATE TABLE IF NOT EXISTS descontos_fixos (
  nome       TEXT PRIMARY KEY,
  valor      REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- descontos: lançamentos (esporádicos ou a partir de um fixo) aplicados a alguém.
CREATE TABLE IF NOT EXISTS descontos (
  id         TEXT PRIMARY KEY,
  pessoa     TEXT NOT NULL,                 -- costureira/prestador
  tipo       TEXT NOT NULL DEFAULT 'costura', -- costura | tassel
  descricao  TEXT,
  valor      REAL NOT NULL DEFAULT 0,
  data       TEXT,                          -- ISO (YYYY-MM-DD) — define o mês do desconto
  excluido   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_descontos_pessoa ON descontos(pessoa, tipo);
