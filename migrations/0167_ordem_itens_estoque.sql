-- A ordem de compra passa a mostrar o estoque atual e o mínimo de cada insumo
-- (fotografia do momento em que a ordem foi criada).
ALTER TABLE ordem_compra_itens ADD COLUMN saldo REAL;
ALTER TABLE ordem_compra_itens ADD COLUMN minimo REAL;
