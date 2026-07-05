-- Reposição automática de estoque:
-- produtos.reposicao_qtd = quanto produzir quando o produto atingir o mínimo.
-- reposicao_alertas = fila de produtos que precisam de reposição (1 por produto
-- em aberto). O usuário gera o pedido de reposição com 1 clique (status 'gerado').
ALTER TABLE produtos ADD COLUMN reposicao_qtd REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reposicao_alertas (
  id                TEXT PRIMARY KEY,
  produto_id        TEXT NOT NULL,
  qtd_sugerida      REAL NOT NULL,
  estoque_no_alerta REAL NOT NULL DEFAULT 0,
  estoque_min       REAL NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pendente', -- pendente | gerado | ignorado
  pedido_id         TEXT,                             -- pedido de reposição gerado
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  resolvido_em      TEXT
);
CREATE INDEX IF NOT EXISTS idx_reposicao_status ON reposicao_alertas(status);
CREATE INDEX IF NOT EXISTS idx_reposicao_prod ON reposicao_alertas(produto_id);
