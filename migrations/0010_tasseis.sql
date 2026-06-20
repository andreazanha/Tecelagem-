-- Cadastro de Tasseis: cor + tamanho (G/P) + valor da mão de obra (por tassel).
-- Usado para somar automaticamente o valor no romaneio de tassel.
CREATE TABLE IF NOT EXISTS tasseis (
  cor        TEXT NOT NULL,
  tamanho    TEXT NOT NULL,                 -- G | P | ...
  valor      REAL NOT NULL DEFAULT 0,       -- mão de obra por tassel
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cor, tamanho)
);
