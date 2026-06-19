-- Seed de PRODUÇÃO: garante os modelos base da Parte 1 (Máquina 3).
-- Usa INSERT OR IGNORE para NÃO sobrescrever edições feitas na tela de Cadastros.
-- Composição e Tassel são preenchidos pelo cliente no cadastro (variam por modelo).
--   wrangler d1 execute DB --remote --file=./seed/catalogo.sql

INSERT OR IGNORE INTO modelos (nome, parte) VALUES
  ('Aspen',1),('Elo',1),('Perola',1),('Balls',1),('Kora',1),('Celine',1),
  ('Linea',1),('Rice',1),('Montana',1),('Daytona',1),('Otto',1),('Pipoca',1);
