-- Espelho do CATÁLOGO DE PRODUTOS vindo do ERP (Syntech). Somente leitura aqui:
-- a ponte traz nome, preços, grupo, classe (p/ foto), cores e tamanhos. O saldo por
-- cor/tamanho vem da tabela erp_estoque. Usado na aba Catálogo (atendimento/CRM/PCP).
CREATE TABLE IF NOT EXISTS erp_produtos (
  ref                 TEXT PRIMARY KEY,   -- CODIGO do produto no ERP (COD_PROD)
  nome                TEXT,
  unidade             TEXT,
  classe              TEXT,               -- CLASS_PROD.DESCRICAO (monta a URL da foto)
  grupo               TEXT,
  preco_atacado       REAL,
  preco_varejo        REAL,
  preco_atacado_promo REAL,
  preco_varejo_promo  REAL,
  estoque_geral       REAL,
  inativo             INTEGER NOT NULL DEFAULT 0,
  cores               TEXT,               -- JSON: [{"numero":1,"nome":"VERMELHO","hex":"#c00"}]
  tamanhos            TEXT,               -- JSON: ["45X45","70X220"]
  data_alt_reg        TEXT,
  atualizado_em       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_erp_produtos_nome ON erp_produtos (nome);
CREATE INDEX IF NOT EXISTS idx_erp_produtos_grupo ON erp_produtos (grupo);
