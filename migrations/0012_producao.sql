-- Tecelagem (Kanban): status de cada PARTE de uma OP na produção.
-- parte: parte-1 (Máq 3) | parte-2 (Máq 7) | parte-unica | pronta-entrega (kit)
-- status: aguardando | tecendo | pronto | enviado
CREATE TABLE IF NOT EXISTS producao (
  pedido_id     TEXT NOT NULL,
  parte         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'aguardando',
  pecas         INTEGER NOT NULL DEFAULT 0,
  resumo        TEXT,
  maquina       TEXT,
  operador      TEXT,
  iniciado_em   TEXT,
  finalizado_em TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pedido_id, parte)
);
CREATE INDEX IF NOT EXISTS idx_producao_status ON producao(status);
