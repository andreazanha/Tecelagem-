-- Membros da equipe que usam OUTRO número de WhatsApp (não têm login no sistema).
-- A conversa interna com eles vai/volta pelo WhatsApp deles (canal ext:<id>).
CREATE TABLE IF NOT EXISTS chat_membros (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
