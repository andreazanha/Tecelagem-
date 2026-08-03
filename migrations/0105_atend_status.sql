-- Status de entrega/leitura das mensagens enviadas (✓ enviado, ✓✓ entregue,
-- ✓✓ azul lido). Atualizado pelos callbacks de status da Z-API (MessageStatusCallback),
-- casando pelo zap_id (messageId) que guardamos ao enviar.
ALTER TABLE atend_mensagens ADD COLUMN status TEXT;
