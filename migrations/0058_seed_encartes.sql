-- Encartes iniciais: os 9 tamanhos já preenchidos (o usuário completa valor,
-- pedido mínimo e fornecedor depois). Idempotente (ids fixos + INSERT OR IGNORE).
INSERT OR IGNORE INTO materiais (id, categoria, nome, tamanho, unidade, minimo, status, saldo) VALUES
  ('enc-60x150',  'encarte', 'Encarte 60x1.50',  '60x1.50',  'un', 0, 'ativo', 0),
  ('enc-60x200',  'encarte', 'Encarte 60x2.00',  '60x2.00',  'un', 0, 'ativo', 0),
  ('enc-70x220',  'encarte', 'Encarte 70x2.20',  '70x2.20',  'un', 0, 'ativo', 0),
  ('enc-70x250',  'encarte', 'Encarte 70x2.50',  '70x2.50',  'un', 0, 'ativo', 0),
  ('enc-70x270',  'encarte', 'Encarte 70x2.70',  '70x2.70',  'un', 0, 'ativo', 0),
  ('enc-90x200',  'encarte', 'Encarte 90x2.00',  '90x2.00',  'un', 0, 'ativo', 0),
  ('enc-90x220',  'encarte', 'Encarte 90x2.20',  '90x2.20',  'un', 0, 'ativo', 0),
  ('enc-90x250',  'encarte', 'Encarte 90x2.50',  '90x2.50',  'un', 0, 'ativo', 0),
  ('enc-120x180', 'encarte', 'Encarte 1.20x1.80', '1.20x1.80', 'un', 0, 'ativo', 0);
