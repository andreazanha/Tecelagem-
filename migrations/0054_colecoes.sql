-- Coleções de produtos. Um produto pode estar em VÁRIAS coleções, e em cada
-- coleção pode usar um tipo de fio diferente (fio_id por coleção-produto).
CREATE TABLE IF NOT EXISTS colecoes (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  ordem     INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS colecao_produtos (
  colecao_id  TEXT NOT NULL,
  modelo_nome TEXT NOT NULL,
  fio_id      TEXT,                              -- tipo de fio deste produto NESTA coleção (opcional)
  PRIMARY KEY (colecao_id, modelo_nome)
);
CREATE INDEX IF NOT EXISTS idx_colecao_prod ON colecao_produtos(colecao_id);

-- Coleções iniciais (as de hoje). Semeadas uma vez.
INSERT OR IGNORE INTO colecoes (id, nome, ordem) VALUES
  (lower(hex(randomblob(8))), 'Pronta entrega', 1),
  (lower(hex(randomblob(8))), 'Polisoft', 2),
  (lower(hex(randomblob(8))), 'Soft', 3);
