-- Comercial / CRM: cadastro de representantes (vendedores). O pedido já guarda o
-- nome do vendedor; este cadastro guarda os contatos (para o resumo semanal por
-- WhatsApp na 2ª etapa) e a lista limpa de representantes.
CREATE TABLE IF NOT EXISTS representantes (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  whatsapp   TEXT,
  email      TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1,
  observacao TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
