-- Segundo id da Z-API por mensagem (o "zaapId", formato de 32 caracteres). O callback de status
-- de contatos com id oculto (@lid) vem com o zaapId, não com o messageId — então sem guardar os dois
-- os ✓✓ não casavam pra esses contatos (ficavam em 1 risco só). Agora casamos por zap_id OU zap_id2.
ALTER TABLE atend_mensagens ADD COLUMN zap_id2 TEXT;
CREATE INDEX IF NOT EXISTS idx_atend_msg_zap_id2 ON atend_mensagens(zap_id2);
