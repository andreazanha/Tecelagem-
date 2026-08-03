-- Responder uma mensagem específica (citação/reply estilo WhatsApp).
--  • zap_id: id da mensagem na Z-API (das mensagens RECEBIDAS) — usado pra citar
--    a mensagem original no WhatsApp de forma nativa.
--  • responder_texto: trecho da mensagem que está sendo respondida — usado pra
--    mostrar a "citação" na nossa tela, em cima da resposta enviada.
ALTER TABLE atend_mensagens ADD COLUMN zap_id TEXT;
ALTER TABLE atend_mensagens ADD COLUMN responder_texto TEXT;
