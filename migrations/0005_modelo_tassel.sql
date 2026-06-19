-- Tassel: acessório que vai na peseira (e em algumas almofadas).
-- Guardamos a quantidade de tassel por peça em cada modelo.
ALTER TABLE modelos ADD COLUMN tassel INTEGER NOT NULL DEFAULT 0;
