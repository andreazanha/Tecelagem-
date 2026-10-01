-- INTEGRAÇÃO ERP: marca pedidos vindos da ponte (Syntech) pra conferência.
-- erp_integracao=1 + status='aguardando_aprovacao' = fica fora da produção até aprovar.
ALTER TABLE pedidos ADD COLUMN erp_integracao INTEGER NOT NULL DEFAULT 0;

-- Pedido de TESTE (espelha o exemplo real 000001: CAPA GENEBRA, cor AVELÃ) pra testar
-- a tela de conferência sem depender da ponte. Idempotente.
INSERT OR IGNORE INTO pedidos (id, numero_erp, cliente_nome, tipo, data_pedido, status, erp_integracao, created_at) VALUES
  ('erp-teste-1', 'ERP-TESTE-1', 'FIO SUL', 'pedido', date('now'), 'aguardando_aprovacao', 1, datetime('now'));

INSERT OR IGNORE INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte) VALUES
  ('erp-teste-item-1', 'erp-teste-1', 'CAPA GENEBRA', '8019C', 'AVELÃ', '45X45', 1, 'unico'),
  ('erp-teste-item-2', 'erp-teste-1', 'CAPA GENEBRA', '8019C', 'AVELÃ', '55X35', 2, 'unico'),
  ('erp-teste-item-3', 'erp-teste-1', 'CAPA GENEBRA', '8019C', 'AVELÃ', '50X50', 2, 'unico');
