-- Auditoria do romaneio: quem gerou e quem deu o retorno (com data/hora).
-- gerado_por  = usuário que emitiu o romaneio (atualizado a cada geração).
-- retorno_por = usuário que marcou o retorno; retorno_em = data/hora do retorno.
ALTER TABLE romaneios_costura ADD COLUMN gerado_por  TEXT;
ALTER TABLE romaneios_costura ADD COLUMN retorno_por TEXT;
ALTER TABLE romaneios_costura ADD COLUMN retorno_em  TEXT;
ALTER TABLE romaneios_tassel  ADD COLUMN gerado_por  TEXT;
ALTER TABLE romaneios_tassel  ADD COLUMN retorno_por TEXT;
ALTER TABLE romaneios_tassel  ADD COLUMN retorno_em  TEXT;
