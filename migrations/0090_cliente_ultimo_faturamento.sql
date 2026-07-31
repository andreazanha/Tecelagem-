-- Data do último faturamento do cliente (da planilha "Data faturamento").
-- Usada para saber quando fazer o próximo contato/reativação. ISO YYYY-MM-DD.
ALTER TABLE clientes ADD COLUMN ultimo_faturamento TEXT;
