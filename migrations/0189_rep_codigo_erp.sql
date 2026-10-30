-- Liga os representantes ao Syntech pelo CÓDIGO (tabela GUIAS do ERP), em vez de
-- casar por nome (que gerava duplicados). A ponte lê GUIAS e preenche codigo_erp;
-- e lê CLIENTES.GUIA pra gravar rep_codigo em cada cliente — aí a carteira fica
-- ligada por código, estável, mesmo que o nome varie.
ALTER TABLE representantes ADD COLUMN codigo_erp TEXT;   -- GUIAS.CODIGO (código do representante no Syntech)
ALTER TABLE clientes ADD COLUMN rep_codigo TEXT;         -- CLIENTES.GUIA (código do representante do cliente no Syntech)
CREATE INDEX IF NOT EXISTS idx_representantes_codigo_erp ON representantes(codigo_erp);
CREATE INDEX IF NOT EXISTS idx_clientes_rep_codigo ON clientes(rep_codigo);
