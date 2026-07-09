-- Estoque de produtos acabados: só produtos SELECIONADOS aparecem na aba Estoque
-- (pronta-entrega). Produto criado a partir de pedido nasce fora do estoque.
-- Kits são pronta-entrega por natureza e entram automaticamente.
ALTER TABLE produtos ADD COLUMN controla_estoque INTEGER NOT NULL DEFAULT 0;

-- Migração inicial: mantém no estoque quem já tinha mínimo definido ou saldo ≠ 0
-- (os que a pessoa de fato usava), além dos kits.
UPDATE produtos SET controla_estoque = 1
 WHERE COALESCE(estoque_min,0) > 0 OR COALESCE(estoque,0) <> 0 OR tipo = 'kit';
