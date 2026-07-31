-- Fase 3c: sincroniza o status do pedido com a conversa do atendimento.
-- pedido_id: pedido do cliente que a conversa está acompanhando.
-- pedido_marco: último marco já avisado — 'realizado' | 'faturado' | 'enviado'.
ALTER TABLE atend_conversas ADD COLUMN pedido_id TEXT;
ALTER TABLE atend_conversas ADD COLUMN pedido_marco TEXT;
