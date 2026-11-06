-- Tokens de acesso ao CATÁLOGO DIGITAL (isolamento das duas tabelas comerciais).
-- Cada token é opaco (sem CNPJ/dado sensível), ligado a um cliente, com validade e
-- revogação. O servidor valida o token e RECALCULA a região do cadastro a cada acesso,
-- entregando SÓ os preços da região autorizada. Tabela nova, aditiva — não toca em nada.
CREATE TABLE IF NOT EXISTS catalogo_acessos (
  token      TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em  TEXT NOT NULL,
  revogado   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_catacesso_cliente ON catalogo_acessos(cliente_id);
