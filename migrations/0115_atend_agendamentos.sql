-- Agendamentos "Chamar IA" numa TABELA própria (uma linha por agendamento).
-- Antes era um blob JSON único em config: ao agendar VÁRIOS seguidos, os salvamentos concorrentes
-- liam→modificavam→gravavam a mesma lista e sobrescreviam uns aos outros — a MAIORIA se perdia
-- ("volta e cancela agendamento"). Com uma linha por agendamento, INSERT/DELETE são atômicos e
-- não há corrida.
CREATE TABLE IF NOT EXISTS atend_agendamentos (
  id          TEXT PRIMARY KEY,
  conversa_id TEXT NOT NULL,
  telefone    TEXT,
  quando      INTEGER NOT NULL,
  criado_em   INTEGER,
  enviado     INTEGER NOT NULL DEFAULT 0,
  mensagem    TEXT
);
CREATE INDEX IF NOT EXISTS idx_atend_agend_conv ON atend_agendamentos(conversa_id);
CREATE INDEX IF NOT EXISTS idx_atend_agend_quando ON atend_agendamentos(quando);
