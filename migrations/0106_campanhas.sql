-- Campanhas de envio em massa "aos poucos" (respeitando intervalo pra não banir):
-- o gestor escolhe contatos, escreve a mensagem, e a IA vai disparando aos poucos.
CREATE TABLE IF NOT EXISTS atend_campanhas (
  id            TEXT PRIMARY KEY,
  nome          TEXT,
  mensagem      TEXT NOT NULL,
  intervalo_seg INTEGER DEFAULT 40,
  status        TEXT DEFAULT 'ativa',   -- ativa | pausada | concluida
  ultimo_envio_em TEXT,
  criado_em     TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS atend_campanha_alvos (
  id          TEXT PRIMARY KEY,
  campanha_id TEXT NOT NULL,
  telefone    TEXT NOT NULL,
  nome        TEXT,
  status      TEXT DEFAULT 'pendente',  -- pendente | enviado | falhou | bloqueado
  motivo      TEXT,
  enviado_em  TEXT
);
CREATE INDEX IF NOT EXISTS idx_camp_alvos ON atend_campanha_alvos (campanha_id, status);
