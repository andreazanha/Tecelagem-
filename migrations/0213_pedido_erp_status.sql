-- STATUS do pedido no Syntech, lido pela ponte a cada rodada (só leitura no Firebird).
-- Serve pra: (1) mostrar no painel e DESCOBRIR o número do "faturado" (o aprovado é 10);
-- (2) soltar a reserva do pedido da loja quando ele é FATURADO (estoque já baixou no Syntech)
-- ou CANCELADO (nunca baixou) — fechando o ciclo sem clique e sem furo.
ALTER TABLE pedidos ADD COLUMN erp_status INTEGER;     -- STATUS numérico (PEDIDO.STATUS do Syntech)
ALTER TABLE pedidos ADD COLUMN erp_status_em TEXT;     -- quando a ponte leu esse status
ALTER TABLE pedidos ADD COLUMN erp_canc TEXT;          -- PEDIDO.CANC do Syntech ('S' = cancelado)
