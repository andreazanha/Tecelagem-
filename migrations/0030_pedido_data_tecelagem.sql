-- Prazo interno da Tecelagem (data limite do tear), por pedido — diferente da
-- data de entrega do cliente. Aparece só no card da Tecelagem.
ALTER TABLE pedidos ADD COLUMN data_tecelagem TEXT;
