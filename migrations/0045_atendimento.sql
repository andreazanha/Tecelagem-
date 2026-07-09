-- Robô de atendimento do WhatsApp (triagem automática no primeiro contato).
-- Uma conversa por telefone; a máquina de estados avança conforme o cliente responde.
CREATE TABLE IF NOT EXISTS atend_conversas (
  id            TEXT PRIMARY KEY,
  telefone      TEXT NOT NULL UNIQUE,                       -- só dígitos (com DDI)
  nome          TEXT,                                       -- nome da loja (coletado)
  estado        TEXT NOT NULL DEFAULT 'novo',
  setor         TEXT,                                       -- vendas|financeiro|pos-venda|outros
  cnpj          TEXT,
  cidade        TEXT,
  uf            TEXT,
  lojista       INTEGER,                                    -- 1 sim, 0 não, NULL indefinido
  responsavel   TEXT,                                       -- atendente humano que assumiu
  card_id       TEXT,                                       -- vínculo com o funil (quando qualifica)
  ultima_in_em  TEXT,                                       -- última msg do cliente (p/ follow-up)
  ultima_out_em TEXT,                                       -- última msg enviada (p/ follow-up)
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atend_estado ON atend_conversas(estado);

-- Histórico completo da conversa (o atendente vê tudo antes de assumir).
CREATE TABLE IF NOT EXISTS atend_mensagens (
  id          TEXT PRIMARY KEY,
  conversa_id TEXT NOT NULL REFERENCES atend_conversas(id) ON DELETE CASCADE,
  direcao     TEXT NOT NULL,                                -- in | out
  autor       TEXT,                                         -- cliente | bot | <nome do atendente>
  tipo        TEXT NOT NULL DEFAULT 'texto',                -- texto | arquivo | sistema
  texto       TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atend_msg_conv ON atend_mensagens(conversa_id);
