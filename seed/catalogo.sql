-- Seed de PRODUÇÃO: apenas o catálogo (Modelos da Parte 1 e Cores 100% Poliéster).
-- Use no D1 remoto:  wrangler d1 execute DB --remote --file=./seed/catalogo.sql

INSERT OR IGNORE INTO modelos (nome, parte) VALUES
  ('Aspen',1),('Elo',1),('Perola',1),('Balls',1),('Kora',1),('Celine',1),
  ('Linea',1),('Rice',1),('Montana',1),('Daytona',1),('Otto',1),('Pipoca',1);

INSERT OR IGNORE INTO cores (nome, poliester) VALUES
  ('Off-White',1),('Areia',1),('Mescla Colosso',1),('Romenia',1),('Terracota',1),
  ('Cobre Escuro',1),('Bege Novo',1),('Brow',1),('Golden',1),('Mescla Riviera',1),
  ('Marinho',1),('Verde Escuro',1),('Cavalinha',1),('Prata Mescla',1),
  ('Grafite Mescla',1),('Maré',1),('Cacau',1),('Mostarda',1);
