-- Data da última vez que o cliente entrou numa campanha de prospecção/reativação. Fica marcado na
-- lista de Clientes (com a data) pra não prospectar a mesma pessoa de novo sem querer.
ALTER TABLE clientes ADD COLUMN prospectado_em TEXT;
