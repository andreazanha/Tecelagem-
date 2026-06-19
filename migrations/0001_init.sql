-- Rolagem de Fase — esquema inicial (Pedidos)
-- Tipos de pedido: 'unico' | 'unico_pe' | 'p1p2' | 'p1p2_pe' | 'estoque' | 'pronta_entrega'
-- entrega_pe (apenas quando o tipo inclui Pronta Entrega): 'junto' | 'separado'
-- parte do item: 'unico' | 'p1' | 'p2' | 'kit' | 'pe' | 'estoque'

CREATE TABLE IF NOT EXISTS clientes (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pedidos (
  id            TEXT PRIMARY KEY,
  numero_erp    TEXT,
  cliente_nome  TEXT NOT NULL,
  vendedor      TEXT,
  tipo          TEXT NOT NULL,
  entrega_pe    TEXT,                                  -- 'junto' | 'separado' | NULL
  data_pedido   TEXT,
  data_entrega  TEXT,
  observacao    TEXT,
  pdf_key       TEXT,                                  -- chave no R2 do PDF original
  status        TEXT NOT NULL DEFAULT 'novo',          -- 'novo' | 'conferido' | 'em_producao' ...
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id          TEXT PRIMARY KEY,
  pedido_id   TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto     TEXT NOT NULL,
  ref         TEXT,
  cor_grade   TEXT,
  qtd         INTEGER NOT NULL DEFAULT 0,
  parte       TEXT NOT NULL DEFAULT 'unico'
);

CREATE INDEX IF NOT EXISTS idx_itens_pedido    ON pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_created ON pedidos(created_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_status  ON pedidos(status);
