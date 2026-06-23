-- Status dos romaneios emitidos: retorno da costura/prestador e soft-delete (p/ undo).
-- cliente guardado p/ permitir regerar o PDF ao editar (inclusive avulsos).
ALTER TABLE romaneios_costura ADD COLUMN retornou INTEGER NOT NULL DEFAULT 0;
ALTER TABLE romaneios_costura ADD COLUMN data_retorno_real TEXT;
ALTER TABLE romaneios_costura ADD COLUMN excluido INTEGER NOT NULL DEFAULT 0;
ALTER TABLE romaneios_costura ADD COLUMN cliente TEXT;
ALTER TABLE romaneios_tassel  ADD COLUMN retornou INTEGER NOT NULL DEFAULT 0;
ALTER TABLE romaneios_tassel  ADD COLUMN data_retorno_real TEXT;
ALTER TABLE romaneios_tassel  ADD COLUMN excluido INTEGER NOT NULL DEFAULT 0;
ALTER TABLE romaneios_tassel  ADD COLUMN cliente TEXT;
