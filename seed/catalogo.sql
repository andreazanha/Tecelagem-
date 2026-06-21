-- Seed de PRODUÇÃO (BOOTSTRAP): só cria modelos que AINDA NÃO existem.
-- Usa INSERT OR IGNORE → roda em todo deploy SEM sobrescrever nada que você edita na tela
-- de Cadastros (código/parte/composição/tassel são preservados). Parte 1 = Máquina 3.
--   wrangler d1 execute DB --remote --file=./seed/catalogo.sql

INSERT OR IGNORE INTO modelos (nome, parte, ref, composicao) VALUES
  -- Parte 1 (Máquina 3)
  ('Aspen',1,'1092',NULL),
  ('Balls',1,'1078',NULL),
  ('Celine',1,'1082',NULL),
  ('Daytona',1,'1091',NULL),
  ('Elo',1,'1095',NULL),
  ('Kora',1,'1088',NULL),
  ('Linea',1,'1090',NULL),
  ('Montana',1,'1103',NULL),
  ('Otto',1,'1081',NULL),
  ('Pérola',1,'1087',NULL),
  ('Rice',1,'1086',NULL),
  ('Pipoca',1,'1112',NULL),
  -- Parte 2 (demais modelos — ajuste a parte na tela de Cadastros se necessário)
  ('Chess',2,'1093',NULL),
  ('Predileta 100% Algodão',2,'1101','100% ALGODÃO'),
  ('Stanza',2,'1085',NULL),
  ('Wave',2,'1094',NULL),
  ('Acácia',2,'1104',NULL),
  ('Begônia',2,'1105',NULL),
  ('Bubbles',2,'1106',NULL),
  ('Colmeia',2,'1107',NULL),
  ('Dália',2,'1108',NULL),
  ('Magnólia',2,'1109',NULL),
  ('Mosaico',2,'1110',NULL),
  ('Native',2,'1111',NULL),
  ('Alana',2,'1114',NULL),
  ('Arieli',2,'1115',NULL),
  ('Ayla',2,'1116',NULL),
  ('Bali',2,'1117',NULL),
  ('Frascati',2,'1118',NULL),
  ('Genebra',2,'1119',NULL),
  ('Paris',2,'1120',NULL),
  ('Predileta (Soft)',2,'1121',NULL);

-- Revisadoras pré-cadastradas (senha provisória 1234 — trocar em Cadastros › Operadores).
INSERT OR IGNORE INTO operadores (id, nome, senha, setor) VALUES
  ('op-rev-betania', 'Betânia', '1234', 'revisao'),
  ('op-rev-bruna',   'Bruna',   '1234', 'revisao'),
  ('op-rev-sula',    'Sula',    '1234', 'revisao'),
  ('op-rev-eduarda', 'Eduarda', '1234', 'revisao');

-- Usuário administrador inicial (admin/admin) — troque a senha em Cadastros › Usuários.
INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas) VALUES
  ('user-admin', 'Administrador', 'admin', 'admin', 1, '[]');
