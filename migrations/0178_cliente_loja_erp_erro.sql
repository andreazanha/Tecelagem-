-- Guarda o último erro ao criar o cliente no Syntech (mostra na fila de aprovação).
ALTER TABLE clientes ADD COLUMN loja_erp_erro TEXT;
