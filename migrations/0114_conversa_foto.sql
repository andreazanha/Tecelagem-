-- Cache da foto de perfil do contato (Z-API) na conversa, pra o quadro mostrar NA HORA
-- (sem re-buscar tudo a cada recarga) — a foto não "some" mais no reload.
ALTER TABLE atend_conversas ADD COLUMN foto_url TEXT;
ALTER TABLE atend_conversas ADD COLUMN foto_em TEXT;
