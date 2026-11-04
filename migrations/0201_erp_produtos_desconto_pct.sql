-- DESCONTO (promoção) por produto, vindo direto do Syntech (PRODUTO.DESCONTO_AUTO quando PROMOCAO='S').
-- A ponte passa a enviar o PERCENTUAL do desconto. Guardamos aqui para o catálogo aplicar o desconto
-- de forma robusta mesmo quando o preço é POR TAMANHO (onde o preço do cabeçalho pode ser 0 e os
-- campos preco_*_promo não refletem o desconto por tamanho). 0 = sem promoção.
ALTER TABLE erp_produtos ADD COLUMN desconto_pct REAL NOT NULL DEFAULT 0;
