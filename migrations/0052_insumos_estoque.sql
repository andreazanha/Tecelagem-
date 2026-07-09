-- Insumos (materiais) viram CADASTRÁVEIS: além dos 6 padrão, o usuário cria novas
-- categorias e elas aparecem sozinhas no submenu Materiais e nas sub-abas.
CREATE TABLE IF NOT EXISTS material_categorias (
  id        TEXT PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,                 -- usado na URL/aba (?mat=slug)
  nome      TEXT NOT NULL,
  cor       TEXT,
  icone     TEXT,
  ordem     INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO material_categorias (id, slug, nome, cor, icone, ordem) VALUES
  (lower(hex(randomblob(8))), 'forro',     'Forro',     '#0891b2', '🧵', 1),
  (lower(hex(randomblob(8))), 'ziper',     'Zíper',     '#7c3aed', '🤐', 2),
  (lower(hex(randomblob(8))), 'etiqueta',  'Etiqueta',  '#ca8a04', '🏷️', 3),
  (lower(hex(randomblob(8))), 'encarte',   'Encarte',   '#16a34a', '📄', 4),
  (lower(hex(randomblob(8))), 'embalagem', 'Embalagem', '#ea580c', '📦', 5),
  (lower(hex(randomblob(8))), 'refil',     'Refil',     '#db2777', '🛏️', 6);

-- Controle de estoque do material (para saber quando COMPRAR).
ALTER TABLE materiais ADD COLUMN unidade TEXT;                  -- un|cm|kg|m (unidade de consumo/compra)
ALTER TABLE materiais ADD COLUMN saldo   REAL NOT NULL DEFAULT 0;   -- quantidade em estoque
ALTER TABLE materiais ADD COLUMN minimo  REAL NOT NULL DEFAULT 0;   -- estoque mínimo (abaixo disso, sugere compra)

-- Movimentações de estoque do material: entrada (compra), baixa (consumo) e ajuste.
CREATE TABLE IF NOT EXISTS material_mov (
  id          TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  tipo        TEXT NOT NULL,                          -- entrada|baixa|ajuste
  quantidade  REAL NOT NULL,                          -- + entra / − sai
  motivo      TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_material_mov_mat ON material_mov(material_id);
