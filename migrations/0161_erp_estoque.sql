-- Espelho do ESTOQUE DE PRODUTOS vindo do ERP (Syntech). Somente leitura aqui:
-- a ponte manda o saldo e a gente só EXIBE (pronta-entrega, catálogo/CRM, PCP).
-- Uma linha por produto+cor+tamanho (chave). Atualizado a cada sincronização.
CREATE TABLE IF NOT EXISTS erp_estoque (
  chave         TEXT PRIMARY KEY,   -- ref|cor|tamanho (normalizado)
  produto       TEXT,
  ref           TEXT,
  cor           TEXT,
  tamanho       TEXT,
  saldo         REAL NOT NULL DEFAULT 0,
  unidade       TEXT,
  atualizado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_erp_estoque_ref ON erp_estoque (ref);
CREATE INDEX IF NOT EXISTS idx_erp_estoque_prod ON erp_estoque (produto);
