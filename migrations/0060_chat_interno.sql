-- Chat interno da equipe: mensagens por canal (setor). Atualização por polling.
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id        TEXT PRIMARY KEY,
  canal     TEXT NOT NULL,          -- geral|tecelagem|passadoria|corte|costura|revisao|estoque|expedicao
  autor     TEXT NOT NULL,          -- nome de quem enviou
  texto     TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_canal ON chat_mensagens(canal, criado_em);
