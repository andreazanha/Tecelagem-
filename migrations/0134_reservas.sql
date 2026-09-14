-- RESERVAS de peças (grupo VIP / venda por arte): a Big posta uma "peça" (arte com foto + nome +
-- cor + tamanho + quantidade). Quem pedir primeiro no privado leva, até acabar a quantidade.
-- Guarda a ORDEM de chegada (quando) pra saber quem reservou primeiro.
CREATE TABLE IF NOT EXISTS atend_reserva_pecas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  cor TEXT,
  tamanho TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,      -- quantas unidades disponíveis
  foto_url TEXT,                              -- a arte (imagem) com os dados
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS atend_reservas (
  id TEXT PRIMARY KEY,
  peca_id TEXT NOT NULL,
  conversa_id TEXT,                           -- conversa do cliente (quando reservado de dentro do chat)
  telefone TEXT,
  cliente_nome TEXT,
  quando TEXT NOT NULL DEFAULT (datetime('now')),   -- ORDEM de chegada (quem pediu primeiro)
  status TEXT NOT NULL DEFAULT 'reservado',   -- reservado | confirmado | cancelado
  obs TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reservas_peca ON atend_reservas (peca_id, quando);
CREATE INDEX IF NOT EXISTS idx_reservas_conv ON atend_reservas (conversa_id);
