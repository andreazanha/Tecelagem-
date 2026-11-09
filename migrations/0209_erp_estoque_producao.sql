-- O Syntech (APP_ESTOQUE_DETALHADO) já devolve, além do SALDO, quanto está EM PRODUÇÃO
-- (PRODUCAO), reservado em pedido de venda (PEDIDO) e em compra (PED_COMPRA), por cor/tamanho.
-- A ponte passa a mandar essas colunas também; aqui só guardamos pra exibir ("em produção
-- do Syntech" no Precisa Produzir/estoque). Só leitura — a entrada continua sendo no Syntech.
ALTER TABLE erp_estoque ADD COLUMN producao REAL NOT NULL DEFAULT 0;   -- em produção (OP aberta no Syntech)
ALTER TABLE erp_estoque ADD COLUMN pedido REAL NOT NULL DEFAULT 0;     -- reservado em pedido de venda no Syntech
ALTER TABLE erp_estoque ADD COLUMN ped_compra REAL NOT NULL DEFAULT 0; -- em compra no Syntech
