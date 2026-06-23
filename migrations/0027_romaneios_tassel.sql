-- Romaneios de tassel emitidos (base do prestador de tassel p/ pagamento).
-- Um registro por pedido; ao regerar, atualiza.
CREATE TABLE IF NOT EXISTS romaneios_tassel (
  pedido_id     TEXT PRIMARY KEY,
  numero        TEXT,                          -- = número do pedido/OP
  prestador     TEXT,
  volumes       TEXT,
  total_tasseis INTEGER NOT NULL DEFAULT 0,
  total_valor   REAL NOT NULL DEFAULT 0,
  data_saida    TEXT,                          -- ISO (YYYY-MM-DD)
  data_retorno  TEXT,                          -- ISO (YYYY-MM-DD) — devolução prevista
  linhas        TEXT,                          -- JSON snapshot (cor/tam/tasseis/valor)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rom_tassel_prestador ON romaneios_tassel(prestador);
