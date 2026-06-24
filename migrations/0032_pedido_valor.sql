-- Preço de venda do pedido: valor unitário por item (qtd × valor_unit = total do item).
ALTER TABLE pedido_itens ADD COLUMN valor_unit REAL NOT NULL DEFAULT 0;
