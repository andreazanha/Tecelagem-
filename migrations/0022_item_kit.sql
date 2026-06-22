-- Pedido de kit (pronta-entrega) marcado manualmente na criação do pedido.
-- Os itens assim marcados viram a parte "pronta-entrega" e seguem para o estoque.
ALTER TABLE pedido_itens ADD COLUMN kit INTEGER NOT NULL DEFAULT 0;
