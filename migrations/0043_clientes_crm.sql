-- CRM Fase 1: enriquece o cadastro de clientes (antes só id + nome).
-- Campos de contato/localização + representante (nome) + observação.
ALTER TABLE clientes ADD COLUMN contato TEXT;
ALTER TABLE clientes ADD COLUMN whatsapp TEXT;
ALTER TABLE clientes ADD COLUMN email TEXT;
ALTER TABLE clientes ADD COLUMN cidade TEXT;
ALTER TABLE clientes ADD COLUMN uf TEXT;
ALTER TABLE clientes ADD COLUMN cnpj TEXT;
ALTER TABLE clientes ADD COLUMN representante TEXT;
ALTER TABLE clientes ADD COLUMN observacao TEXT;
