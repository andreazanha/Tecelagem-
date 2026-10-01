-- 2º pedido de TESTE do ERP (cliente diferente) pra testar o "Explodir juntos"
-- (consolidar vários pedidos numa OP só). Idempotente.
INSERT OR IGNORE INTO pedidos (id, numero_erp, cliente_nome, tipo, data_pedido, status, erp_integracao, created_at) VALUES
  ('erp-teste-2', 'ERP-TESTE-2', 'TRECOS & TRAMAS', 'pedido', date('now'), 'aguardando_aprovacao', 1, datetime('now'));

INSERT OR IGNORE INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte) VALUES
  ('erp-teste2-item-1', 'erp-teste-2', 'MANTA LUMI',          'MLUMI', 'TERRACOTA', '70X2.50', 2, 'unico'),
  ('erp-teste2-item-2', 'erp-teste-2', 'ALMOFADA KORA 50X50', 'AKORA', 'TERRACOTA', '50X50',   4, 'unico');
