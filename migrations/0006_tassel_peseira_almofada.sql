-- Tassel separado por tipo (tamanhos diferentes): quantidade por peça.
ALTER TABLE modelos ADD COLUMN tassel_peseira INTEGER NOT NULL DEFAULT 0;
ALTER TABLE modelos ADD COLUMN tassel_almofada INTEGER NOT NULL DEFAULT 0;
