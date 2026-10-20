-- Citação de mensagem (responder/marcar): além do TRECHO (responder_texto), guarda o
-- ID interno da mensagem original, pra clicar na citação e PULAR pra ela (igual ao WhatsApp).
ALTER TABLE atend_mensagens ADD COLUMN responder_id TEXT;
