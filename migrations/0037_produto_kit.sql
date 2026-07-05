-- Dois tipos de produto no estoque: 'avulso' (peça individual, ex.: peseira,
-- almofada) e 'kit' (junção de vários produtos). O kit tem estoque próprio;
-- a composição (quais produtos e quantas unidades) fica descrita em produto_kit.
ALTER TABLE produtos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'avulso';

CREATE TABLE IF NOT EXISTS produto_kit (
  id            TEXT PRIMARY KEY,
  kit_id        TEXT NOT NULL,       -- o produto que é o KIT
  componente_id TEXT,                -- produto componente (vínculo ao catálogo, opcional)
  nome          TEXT NOT NULL,       -- nome do componente
  qtd           REAL NOT NULL DEFAULT 1,
  observacao    TEXT
);
CREATE INDEX IF NOT EXISTS idx_produto_kit_kit ON produto_kit(kit_id);
