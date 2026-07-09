-- Cores enriquecidas: código da cor + tipo de fio. O tipo de fio tem fornecedor
-- (para viabilizar a ordem de compras). Fornecedor já é cadastro próprio.
CREATE TABLE IF NOT EXISTS tipos_fio (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,
  fornecedor_id TEXT,                                -- → fornecedores.id
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE cores ADD COLUMN codigo TEXT;            -- código da cor
ALTER TABLE cores ADD COLUMN fio_id TEXT;            -- → tipos_fio.id

-- Cadastro de tamanhos (cada modelo tem vários) — usado ao montar as variações.
CREATE TABLE IF NOT EXISTS tamanhos (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL UNIQUE,                     -- ex.: 50X50, 90X200, 1.20X1.80
  ordem     INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Sementes comuns (não duplica se já existir pelo nome).
INSERT OR IGNORE INTO tamanhos (id, nome, ordem) VALUES
  (lower(hex(randomblob(8))), '50X50', 1),
  (lower(hex(randomblob(8))), '45X45', 2),
  (lower(hex(randomblob(8))), '0.90X1.20', 3),
  (lower(hex(randomblob(8))), '90X200', 4),
  (lower(hex(randomblob(8))), '1.20X1.80', 5),
  (lower(hex(randomblob(8))), '70X250', 6);
