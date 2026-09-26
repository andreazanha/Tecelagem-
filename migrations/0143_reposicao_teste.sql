-- REPOSIÇÃO FAKE para testar o aviso de WhatsApp ao dar entrada no estoque.
-- Cai direto na Separação Pronta Entrega, coluna "Dar entrada no estoque".
-- Idempotente. Para remover depois:
--   DELETE FROM producao WHERE pedido_id='ped-rep-teste';
--   DELETE FROM pedido_itens WHERE pedido_id='ped-rep-teste';
--   DELETE FROM pedidos WHERE id='ped-rep-teste';
--   DELETE FROM produtos WHERE id IN ('prod-rt-1','prod-rt-2');

INSERT OR IGNORE INTO pedidos (id, numero_erp, cliente_nome, vendedor, tipo, reposicao, status, data_pedido, data_entrega)
VALUES ('ped-rep-teste', 'REP-TESTE', 'REPOSIÇÃO TESTE', 'ILHA BELA', 'Reposição', 1, 'novo', date('now'), date('now','+7 days'));

INSERT OR IGNORE INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte, kit)
VALUES
  ('it-rep-1', 'ped-rep-teste', 'MANTA TRICO',   'RT-MANTA-1', 'CINZA', 'CASAL', 10, 'unico', 0),
  ('it-rep-2', 'ped-rep-teste', 'ALMOFADA AYLA', 'RT-ALM-1',   'AVELA', '50X50', 6,  'unico', 0);

-- Produtos que CASAM com os itens (por ref) — precisam existir e estar ativos.
INSERT OR IGNORE INTO produtos (id, nome, ref, categoria, tamanho, cor, unidade, ativo, estoque)
VALUES
  ('prod-rt-1', 'Manta Tricô',   'RT-MANTA-1', 'Manta',    'CASAL', 'CINZA', 'un', 1, 0),
  ('prod-rt-2', 'Almofada Ayla', 'RT-ALM-1',   'Almofada', '50X50', 'AVELA', 'un', 1, 0);

-- Card já na Separação (setor estoque) para aparecer em "Dar entrada no estoque".
INSERT INTO producao (pedido_id, parte, setor, status, pecas, resumo)
VALUES ('ped-rep-teste', 'parte-unica', 'estoque', 'aguardando', 16, '2 modelo(s)')
ON CONFLICT(pedido_id, parte) DO NOTHING;
