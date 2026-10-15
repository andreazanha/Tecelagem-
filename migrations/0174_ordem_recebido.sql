-- Quanto de cada item da ordem de compra já foi RECEBIDO (entrada no estoque).
-- Permite recebimento parcial: recebe parte agora e o resto depois.
ALTER TABLE ordem_compra_itens ADD COLUMN recebido REAL NOT NULL DEFAULT 0;
