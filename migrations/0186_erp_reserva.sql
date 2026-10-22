-- Reserva LOCAL de peças (capa/peseira) de um pedido da loja, pra fechar a janela entre
-- "cliente enviou" e "Syntech empenhou + ponte sincronizou". Enquanto o pedido ainda não
-- está refletido no SALDO do Syntech, a reserva desconta do catálogo. Depois que o Syntech
-- empenha e a ponte traz o SALDO menor, a reserva deixa de contar (o empenho assume).
CREATE TABLE IF NOT EXISTS erp_reserva (
  id TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL,
  ref TEXT NOT NULL,
  cor TEXT,
  tamanho TEXT,
  qtd REAL NOT NULL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_erp_reserva_peca ON erp_reserva(ref, cor, tamanho);
CREATE INDEX IF NOT EXISTS idx_erp_reserva_pedido ON erp_reserva(pedido_id);
