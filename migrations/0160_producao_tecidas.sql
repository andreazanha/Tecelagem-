-- Peças já TECIDAS, marcadas item a item no modal "Visualizar pedido".
-- Uma linha por item marcado (pedido + parte + chave do item). A presença da
-- linha = marcado; desmarcar apaga a linha. qtd guarda quantas peças aquele item
-- representa, pra somar quantas já foram tecidas.
CREATE TABLE IF NOT EXISTS producao_tecidas (
  pedido_id TEXT NOT NULL,
  parte     TEXT NOT NULL,
  chave     TEXT NOT NULL,   -- modelo|ref|cor|comp|tipo|tamanho
  qtd       INTEGER NOT NULL DEFAULT 0,
  operador  TEXT,
  em        TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (pedido_id, parte, chave)
);
CREATE INDEX IF NOT EXISTS idx_producao_tecidas_ped ON producao_tecidas (pedido_id, parte);
