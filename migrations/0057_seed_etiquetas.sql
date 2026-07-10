-- Etiquetas iniciais pedidas pelo usuário. Idempotente (ids fixos + INSERT OR IGNORE):
--   20x75 mm → R$ 0,14   |   25x40 mm → R$ 0,09
INSERT OR IGNORE INTO materiais (id, categoria, nome, tamanho, unidade, preco, minimo, status, saldo) VALUES
  ('etq-20x75mm', 'etiqueta', 'Etiqueta 20x75 mm', '20X75 MM', 'un', 0.14, 0, 'ativo', 0),
  ('etq-25x40mm', 'etiqueta', 'Etiqueta 25x40 mm', '25X40 MM', 'un', 0.09, 0, 'ativo', 0);
