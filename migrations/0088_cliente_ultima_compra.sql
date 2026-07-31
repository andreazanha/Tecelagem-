-- Data da última compra vinda do cadastro/planilha (fallback quando o cliente
-- ainda não tem pedidos lançados no sistema). Formato ISO YYYY-MM-DD.
ALTER TABLE clientes ADD COLUMN ultima_compra TEXT;
