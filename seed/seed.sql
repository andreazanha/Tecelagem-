-- Dados de exemplo para desenvolvimento local
INSERT OR IGNORE INTO clientes (id, nome) VALUES
  ('c1', 'Loja K — Malhas & Cia'),
  ('c2', 'Atacado D'),
  ('c3', 'Cliente B'),
  ('c4', 'Artelasse Indústria e Comércio Ltda');

INSERT OR IGNORE INTO pedidos (id, numero_erp, cliente_nome, vendedor, tipo, entrega_pe, data_pedido, data_entrega, status)
VALUES
  ('p1', '8842', 'Loja K — Malhas & Cia', 'Marcos R.', 'unico_pe', 'junto', '2026-06-14', '2026-06-22', 'novo'),
  ('p2', '8840', 'Atacado D', 'Ana P.', 'p1p2', NULL, '2026-06-12', '2026-06-26', 'novo');

INSERT OR IGNORE INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, qtd, parte) VALUES
  ('i1', 'p1', 'Blusa Tricô', 'BT12', 'Off-white · P-M-G', 150, 'unico'),
  ('i2', 'p1', 'Echarpe', 'EC09', 'Bege · Único', 40, 'pe'),
  ('i3', 'p2', 'Cardigã', 'CG04', 'Cinza · P-M', 90, 'p1');

-- Catálogo: modelos da Parte 1 (o restante vira Parte 2 automaticamente)
INSERT OR IGNORE INTO modelos (nome, parte) VALUES
  ('Aspen',1),('Elo',1),('Perola',1),('Balls',1),('Kora',1),('Celine',1),
  ('Linea',1),('Rice',1),('Montana',1),('Daytona',1),('Otto',1),('Pipoca',1);

-- Cores 100% Poliéster (as demais ficam sem composição)
INSERT OR IGNORE INTO cores (nome, poliester) VALUES
  ('Off-White',1),('Areia',1),('Mescla Colosso',1),('Romenia',1),('Terracota',1),
  ('Cobre Escuro',1),('Bege Novo',1),('Brow',1),('Golden',1),('Mescla Riviera',1),
  ('Marinho',1),('Verde Escuro',1),('Cavalinha',1),('Prata Mescla',1),
  ('Grafite Mescla',1),('Maré',1),('Cacau',1),('Mostarda',1);
