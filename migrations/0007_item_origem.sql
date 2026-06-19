-- Origem do item: número do pedido original de onde ele veio. Numa OP que junta vários
-- pedidos, permite perguntar a entrega da Pronta Entrega (junto/separado) por pedido.
ALTER TABLE pedido_itens ADD COLUMN origem TEXT;
