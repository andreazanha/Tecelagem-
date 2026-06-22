-- Pedido de REPOSIÇÃO de estoque: produz os kits (passam pela esteira). Quando
-- desligado (pedido de cliente), a pronta-entrega já está no estoque e o card
-- nasce direto no Estoque (Junto/Separado conforme entrega_pe).
ALTER TABLE pedidos ADD COLUMN reposicao INTEGER NOT NULL DEFAULT 0;
