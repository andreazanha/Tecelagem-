-- PEDIDOS DE TESTE para experimentar o fluxo/relatório, já na fase CORTE.
-- Bem marcados (numero_erp "TESTE-xx", cliente "TESTE ...") pra achar e apagar fácil.
-- Idempotente (INSERT OR IGNORE + ids fixos). Para remover tudo depois, é só apagar
-- os pedidos com numero_erp LIKE 'TESTE-%' (ou peço uma migração de limpeza).

-- Cabeçalhos dos pedidos
INSERT OR IGNORE INTO pedidos (id, numero_erp, cliente_nome, tipo, data_pedido, data_entrega, status, created_at) VALUES
  ('teste-corte-1', 'TESTE-01', 'TESTE - Cliente A', 'pedido', date('now'), date('now','+7 days'), 'novo', datetime('now')),
  ('teste-corte-2', 'TESTE-02', 'TESTE - Cliente B', 'pedido', date('now'), date('now','+7 days'), 'novo', datetime('now')),
  ('teste-corte-3', 'TESTE-03', 'TESTE - Cliente C', 'pedido', date('now'), date('now','+8 days'), 'novo', datetime('now')),
  ('teste-corte-4', 'TESTE-04', 'TESTE - Cliente D', 'pedido', date('now'), date('now','+8 days'), 'novo', datetime('now')),
  ('teste-corte-5', 'TESTE-05', 'TESTE - Cliente E', 'pedido', date('now'), date('now','+9 days'), 'novo', datetime('now')),
  ('teste-corte-6', 'TESTE-06', 'TESTE - Cliente F', 'pedido', date('now'), date('now','+9 days'), 'novo', datetime('now'));

-- Itens (1 por pedido)
INSERT OR IGNORE INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, qtd, parte) VALUES
  ('teste-item-1', 'teste-corte-1', 'MANTA LUMI',            'MLUMI',  'OFF WHITE: 8',  8,  'unico'),
  ('teste-item-2', 'teste-corte-2', 'PESEIRA WAVE 70X2.50',  'PWAVE',  'CINZA: 12',     12, 'unico'),
  ('teste-item-3', 'teste-corte-3', 'ALMOFADA KORA 50X50',   'AKORA',  'TERRACOTA: 20', 20, 'unico'),
  ('teste-item-4', 'teste-corte-4', 'CAPA ASPEN 55X35',      'CASPEN', 'BEGE: 15',      15, 'unico'),
  ('teste-item-5', 'teste-corte-5', 'MANTA LUMI',            'MLUMI',  'VERDE: 6',      6,  'unico'),
  ('teste-item-6', 'teste-corte-6', 'PESEIRA WAVE 90X2.50',  'PWAVE',  'AZUL: 10',      10, 'unico');

-- Cards de produção JÁ na fase Corte (aguardando, liberados)
INSERT OR IGNORE INTO producao (pedido_id, parte, setor, status, pecas, resumo, bloqueado) VALUES
  ('teste-corte-1', 'parte-unica', 'corte', 'aguardando', 8,  '1 modelo(s)', 0),
  ('teste-corte-2', 'parte-unica', 'corte', 'aguardando', 12, '1 modelo(s)', 0),
  ('teste-corte-3', 'parte-unica', 'corte', 'aguardando', 20, '1 modelo(s)', 0),
  ('teste-corte-4', 'parte-unica', 'corte', 'aguardando', 15, '1 modelo(s)', 0),
  ('teste-corte-5', 'parte-unica', 'corte', 'aguardando', 6,  '1 modelo(s)', 0),
  ('teste-corte-6', 'parte-unica', 'corte', 'aguardando', 10, '1 modelo(s)', 0);
