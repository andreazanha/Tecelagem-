-- Chat: foto na mensagem (R2) e associação da inscrição de push ao usuário
-- (para notificar a pessoa certa em @menção e mensagem direta).
ALTER TABLE chat_mensagens ADD COLUMN imagem_key TEXT;
ALTER TABLE push_subscriptions ADD COLUMN usuario TEXT;
CREATE INDEX IF NOT EXISTS idx_push_usuario ON push_subscriptions(usuario);
