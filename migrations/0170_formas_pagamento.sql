-- Lista gerenciável de formas de pagamento (selecionada no cadastro do fornecedor
-- e na ordem de compra). Semeada com as formas já usadas.
CREATE TABLE IF NOT EXISTS formas_pagamento (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  ordem     INTEGER NOT NULL DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO formas_pagamento (id, nome, ordem) VALUES
  ('fp-pix',      'PIX à vista',     1),
  ('fp-boleto30', 'Boleto 30 dias',  2),
  ('fp-2845',     '28/45',           3),
  ('fp-3060',     '30/60',           4),
  ('fp-306090',   '30/60/90',        5),
  ('fp-dinheiro', 'Dinheiro',        6),
  ('fp-cartao',   'Cartão',          7);
