-- Cards de TESTE na tela "Separação Pronta Entrega" (setor estoque), coluna
-- "DAR ENTRADA NO ESTOQUE" — que mostra cards de REPOSIÇÃO (reposicao=1) que
-- voltaram da Revisão. Bem marcados como TESTE. Idempotente.

INSERT OR IGNORE INTO pedidos (id, numero_erp, cliente_nome, tipo, reposicao, data_pedido, status, created_at) VALUES
  ('teste-rep-1', 'TESTE-REP-1', 'TESTE - Reposição', 'pedido', 1, date('now'), 'novo', datetime('now')),
  ('teste-rep-2', 'TESTE-REP-2', 'TESTE - Reposição', 'pedido', 1, date('now'), 'novo', datetime('now'));

INSERT OR IGNORE INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, qtd, parte) VALUES
  ('teste-rep-item-1', 'teste-rep-1', 'ALMOFADA KORA 50X50', 'AKORA', 'OFF WHITE: 10', 10, 'unico'),
  ('teste-rep-item-2', 'teste-rep-2', 'MANTA LUMI',          'MLUMI', 'CINZA: 5',       5,  'unico');

-- Card no setor estoque (reposição → aparece em "Dar entrada no estoque")
INSERT OR IGNORE INTO producao (pedido_id, parte, setor, status, pecas, resumo, bloqueado) VALUES
  ('teste-rep-1', 'parte-unica', 'estoque', 'aguardando', 10, '1 modelo(s)', 0),
  ('teste-rep-2', 'parte-unica', 'estoque', 'aguardando', 5,  '1 modelo(s)', 0);
