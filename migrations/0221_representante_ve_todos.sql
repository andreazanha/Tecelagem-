-- VENDEDOR INTERNO: um representante marcado com ve_todos=1 enxerga TODOS os
-- clientes no portal (vendas.bigtricot.com.br), em vez de só a carteira dele.
-- O representante normal (ve_todos=0) continua vendo apenas os clientes dele.
ALTER TABLE representantes ADD COLUMN ve_todos INTEGER NOT NULL DEFAULT 0;
