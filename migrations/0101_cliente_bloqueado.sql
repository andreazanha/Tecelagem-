-- Bloquear mensagens para um cliente (caloteiro / inadimplente): quando marcado,
-- o sistema NÃO envia nenhuma mensagem de WhatsApp para ele (nem o robô, nem
-- campanhas automáticas). Serve para não abordar quem está em débito.
ALTER TABLE clientes ADD COLUMN bloqueado INTEGER DEFAULT 0;
