-- Controle de "lido" do chat interno POR USUÁRIO (no servidor, não no aparelho):
-- assim a bolinha de recado novo fica igual em qualquer celular/PC do mesmo login.
CREATE TABLE IF NOT EXISTS chat_lido (
  usuario  TEXT NOT NULL,
  canal    TEXT NOT NULL,
  visto_em TEXT,
  PRIMARY KEY (usuario, canal)
);
