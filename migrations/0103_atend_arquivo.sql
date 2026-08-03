-- Anexos no atendimento: guarda a URL pública do arquivo enviado (imagem/documento)
-- pra mostrar na conversa e pra Z-API buscar e mandar pro cliente.
ALTER TABLE atend_mensagens ADD COLUMN arquivo_url TEXT;
