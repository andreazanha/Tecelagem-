-- Representante: cidades em que atua (CSV livre) e percentual de comissão.
-- (Os estados/UFs já existem na coluna `ufs`.)
ALTER TABLE representantes ADD COLUMN cidades TEXT;
ALTER TABLE representantes ADD COLUMN comissao REAL;
