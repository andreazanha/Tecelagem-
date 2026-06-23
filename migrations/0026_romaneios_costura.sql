-- Romaneios de costura emitidos (base da costureira p/ pagamento no fim do mês).
-- Um registro por pedido; ao regerar, atualiza. data_retorno = quando a
-- costureira deve devolver a produção.
CREATE TABLE IF NOT EXISTS romaneios_costura (
  pedido_id    TEXT PRIMARY KEY,
  numero       TEXT,                         -- = número do pedido/OP
  costureira   TEXT,
  volumes      TEXT,
  total_pecas  INTEGER NOT NULL DEFAULT 0,
  total_valor  REAL NOT NULL DEFAULT 0,
  data_saida   TEXT,                          -- ISO (YYYY-MM-DD) — quando saiu
  data_retorno TEXT,                          -- ISO (YYYY-MM-DD) — devolução prevista
  servicos     TEXT,                          -- JSON snapshot dos serviços/valores
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rom_costura_costureira ON romaneios_costura(costureira);
