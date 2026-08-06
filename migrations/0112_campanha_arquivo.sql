-- Anexo (foto/arquivo) opcional na campanha: a mesma mídia vai pra todos os alvos, com a
-- mensagem como legenda (imagem) ou como texto logo em seguida (documento/áudio).
ALTER TABLE atend_campanhas ADD COLUMN arquivo_url TEXT;
ALTER TABLE atend_campanhas ADD COLUMN arquivo_tipo TEXT;   -- imagem | audio | arquivo
ALTER TABLE atend_campanhas ADD COLUMN arquivo_nome TEXT;
ALTER TABLE atend_campanhas ADD COLUMN arquivo_ext TEXT;
