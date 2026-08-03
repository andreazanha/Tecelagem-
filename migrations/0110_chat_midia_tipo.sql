-- Tipo da mídia anexada numa mensagem do chat interno: 'imagem' (print/foto) ou 'audio'.
-- Assim o app sabe se renderiza <img> ou <audio> (a chave do arquivo fica em imagem_key).
ALTER TABLE chat_mensagens ADD COLUMN midia_tipo TEXT;
