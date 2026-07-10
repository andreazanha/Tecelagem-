-- Ficha de consumo do produto (aba Materiais): cada linha ganha unidade, obs,
-- status e a FONTE do material (material comprado ou fio de tipos_fio).
ALTER TABLE modelo_materiais ADD COLUMN unidade TEXT;
ALTER TABLE modelo_materiais ADD COLUMN obs     TEXT;
ALTER TABLE modelo_materiais ADD COLUMN status  TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE modelo_materiais ADD COLUMN fonte   TEXT NOT NULL DEFAULT 'material';  -- material|fio

-- Tassel volta a ser um TIPO de material — agora com custo, para entrar na ficha
-- (o custo representa o valor de fabricação; ele é fabricado por nós).
INSERT OR IGNORE INTO material_categorias (id, slug, nome, cor, icone, ordem) VALUES
  (lower(hex(randomblob(8))), 'tassel', 'Tassel', '#e11d48', '🧶', 9);
