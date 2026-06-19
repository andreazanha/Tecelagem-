-- A composição (100% Poliéster / 100% Acrílico / etc.) é definida pelo MODELO,
-- não pela cor (a mesma cor pode ter composição diferente em modelos diferentes).
ALTER TABLE modelos ADD COLUMN composicao TEXT;
