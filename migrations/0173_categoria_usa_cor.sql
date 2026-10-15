-- Categoria de material pode ter um campo "Cor" (ex.: gráfica/etiqueta, zíper).
ALTER TABLE material_categorias ADD COLUMN usa_cor INTEGER NOT NULL DEFAULT 0;
