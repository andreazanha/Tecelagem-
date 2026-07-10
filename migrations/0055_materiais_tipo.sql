-- Etapa 1 — Cadastro de Materiais unificado e "type-aware".
-- ADITIVA: não remove nada; só acrescenta campos comuns, tipos padrão que faltavam
-- e o mapa de refil (medida do produto → medida do refil) que a ficha vai usar depois.

-- Campos comuns do material (além de nome/tamanho/unidade/preco/saldo/minimo/fornecedor).
ALTER TABLE materiais ADD COLUMN codigo_interno TEXT;                 -- SKU interno (opcional)
ALTER TABLE materiais ADD COLUMN status         TEXT NOT NULL DEFAULT 'ativo';  -- ativo|inativo
ALTER TABLE materiais ADD COLUMN obs            TEXT;                 -- observações livres
ALTER TABLE materiais ADD COLUMN extra          TEXT;                 -- JSON dos campos específicos do tipo

-- Tipos de material que faltavam (os 6 antigos continuam: forro, ziper, etiqueta,
-- encarte, embalagem, refil). São categorias como as demais, então entram sozinhos
-- no submenu Materiais e nas sub-abas.
INSERT OR IGNORE INTO material_categorias (id, slug, nome, cor, icone, ordem) VALUES
  (lower(hex(randomblob(8))), 'tag',       'Tag',       '#0d9488', '🔖', 7),
  (lower(hex(randomblob(8))), 'tabuleiro', 'Tabuleiro', '#9333ea', '🟪', 8),
  (lower(hex(randomblob(8))), 'tassel',    'Tassel',    '#e11d48', '🧶', 9),
  (lower(hex(randomblob(8))), 'linha',     'Linha',     '#2563eb', '🧵', 10),
  (lower(hex(randomblob(8))), 'aviamento', 'Aviamento', '#0891b2', '🔘', 11);

-- Mapa de refil: dada a MEDIDA do produto, qual REFIL usar. medida_refil NULL = sem refil.
CREATE TABLE IF NOT EXISTS refil_mapa (
  medida_produto TEXT PRIMARY KEY,   -- ex.: 45x45
  medida_refil   TEXT                 -- ex.: 50x50  (NULL = não leva refil)
);
INSERT OR IGNORE INTO refil_mapa (medida_produto, medida_refil) VALUES
  ('45x45', '50x50'),
  ('50x50', '55x55'),
  ('55x35', '60x40'),
  ('65x50', NULL);
