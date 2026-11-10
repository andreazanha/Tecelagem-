-- Comercial: META mensal do representante, em PEÇAS (a pedido). 0/NULL = sem meta.
-- Usada pra acompanhar quanto o rep vendeu no mês × a meta (e quanto falta), e no
-- relatório semanal por WhatsApp. A venda conta pelos pedidos (exclui reposição).
ALTER TABLE representantes ADD COLUMN meta_pecas INTEGER NOT NULL DEFAULT 0;
