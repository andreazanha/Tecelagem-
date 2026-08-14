-- Guarda o "@lid" (id oculto do WhatsApp) de cada conversa. Alguns contatos mandam o callback de
-- status (entregue/lido) com um id que NÃO bate com o messageId/zaapId da mensagem — só dá pra casar
-- pela conversa (via @lid). Aprendemos o @lid quando o cliente escreve (o webhook traz chatLid).
ALTER TABLE atend_conversas ADD COLUMN lid TEXT;
CREATE INDEX IF NOT EXISTS idx_atend_conv_lid ON atend_conversas(lid);
