-- CHAT INTERNO da equipe (conversa entre setores), tipo um WhatsApp só da Big Tricot.
-- 100% SEPARADO do resto: não toca em pedido, estoque nem Syntech. Cada computador
-- escolhe o seu setor (no navegador); os setores conversam 1 a 1 (cada setor é um "contato").
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id         TEXT PRIMARY KEY,
  par        TEXT NOT NULL,            -- par canônico "a|b" (os dois setores em ordem) p/ achar a conversa
  de_setor   TEXT NOT NULL,            -- setor que enviou
  para_setor TEXT NOT NULL,            -- o outro setor da conversa
  autor      TEXT,                     -- nome de quem digitou (opcional)
  texto      TEXT,
  imagem_key TEXT,                     -- (futuro) foto no R2
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_par ON chat_mensagens(par, criado_em);

-- Até quando cada setor já leu cada conversa (para contar as não lidas).
CREATE TABLE IF NOT EXISTS chat_leitura (
  setor      TEXT NOT NULL,            -- quem leu
  com_setor  TEXT NOT NULL,            -- a conversa (o outro setor)
  lido_em    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (setor, com_setor)
);
