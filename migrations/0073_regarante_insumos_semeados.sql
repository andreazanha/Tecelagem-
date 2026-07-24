-- Re-garante os insumos SEMEADOS (etiquetas + encartes) que as migrations 0057
-- e 0058 já haviam criado. ADITIVA e IDEMPOTENTE: ids fixos + INSERT OR IGNORE,
-- então só recria o que faltar e NUNCA sobrescreve saldo/preço já ajustados.
--
-- Motivo: junto com as categorias (ver 0072), em algumas bases esses materiais
-- semeados sumiram da tela de "Estoque de materiais". Isto os devolve.
-- Obs.: insumos cadastrados à mão (zíper, forro, tag, etc.) não são recriados
-- aqui porque seus dados não ficam guardados nas fichas — só o ID é referenciado.

-- Etiquetas (iguais à 0057)
INSERT OR IGNORE INTO materiais (id, categoria, nome, tamanho, unidade, preco, minimo, status, saldo) VALUES
  ('etq-20x75mm', 'etiqueta', 'Etiqueta 20x75 mm', '20X75 MM', 'un', 0.14, 0, 'ativo', 0),
  ('etq-25x40mm', 'etiqueta', 'Etiqueta 25x40 mm', '25X40 MM', 'un', 0.09, 0, 'ativo', 0);

-- Encartes (iguais à 0058)
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
