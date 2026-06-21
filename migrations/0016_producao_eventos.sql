-- Histórico de cada parte na produção: registra cada mudança de setor/status
-- (quem fez e quando), para montar a linha do tempo do pedido.
CREATE TABLE IF NOT EXISTS producao_eventos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id  TEXT NOT NULL,
  parte      TEXT NOT NULL,
  setor      TEXT NOT NULL,
  status     TEXT NOT NULL,
  operador   TEXT,
  em         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eventos_parte ON producao_eventos(pedido_id, parte, em);
