-- "Treino da Bia": base de conhecimento (pergunta → resposta) que o time cadastra.
-- As entradas ativas são injetadas no prompt da IA pra ela responder perguntas
-- complexas do jeito certo (preços de política, prazos, private label, dúvidas comuns…).
CREATE TABLE IF NOT EXISTS ia_conhecimento (
  id         TEXT PRIMARY KEY,
  pergunta   TEXT NOT NULL,
  resposta   TEXT NOT NULL,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
