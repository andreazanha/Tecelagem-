-- Sessões de login (barreira de acesso REAL no servidor). O login cria um token aqui; toda
-- requisição sensível confere o token e descobre no servidor QUEM é a pessoa e o cargo — sem
-- confiar no que o navegador diz. Assim um atendente não vê/abre conversa de outro pela URL.
CREATE TABLE IF NOT EXISTS sessoes (
  token       TEXT PRIMARY KEY,
  usuario_id  TEXT NOT NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em);
