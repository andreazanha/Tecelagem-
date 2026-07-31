-- Setores do atendimento (Vendas, Fiscal, Estoque, PCP…) e quem é de cada um.
-- `membros` = CSV de logins de usuários (tabela usuarios.usuario). Usado no Painel do
-- Gestor (números por setor) e, futuramente, para rotear a conversa ao setor certo.
CREATE TABLE IF NOT EXISTS atend_setores (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  membros    TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO atend_setores (id, nome) VALUES
  ('setor-vendas',  'Vendas'),
  ('setor-fiscal',  'Fiscal'),
  ('setor-estoque', 'Estoque'),
  ('setor-pcp',     'PCP');
