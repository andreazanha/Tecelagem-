-- Código pai: identificador único para OPs consolidadas (vários pedidos juntos).
-- Pedido único usa o código original; vários pedidos ganham um código pai p/ busca.
ALTER TABLE pedidos ADD COLUMN codigo_pai TEXT;

CREATE TABLE IF NOT EXISTS contadores (
  nome  TEXT PRIMARY KEY,
  valor INTEGER NOT NULL DEFAULT 1000
);
INSERT OR IGNORE INTO contadores (nome, valor) VALUES ('codigo_pai', 1000);
