-- Materiais (insumos) da ficha técnica: forro, zíper, etiqueta, encarte,
-- embalagem, refil. Tamanho em texto livre; zíper guarda cor + código.
CREATE TABLE IF NOT EXISTS materiais (
  id            TEXT PRIMARY KEY,
  categoria     TEXT NOT NULL,                     -- forro|ziper|etiqueta|encarte|embalagem|refil
  nome          TEXT NOT NULL,
  tamanho       TEXT,                              -- texto livre (90X200, Pequena, Único…)
  fornecedor_id TEXT,                              -- → fornecedores.id (ordem de compras)
  cor           TEXT,                              -- (zíper) nome da cor
  cor_hex       TEXT,                              -- (zíper) amostra da cor
  codigo        TEXT,                              -- (zíper) código da cor
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materiais_cat ON materiais(categoria);
