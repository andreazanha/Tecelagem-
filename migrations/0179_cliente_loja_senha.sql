-- Login da loja B2B: senha por cliente (hash) + token do link de primeiro acesso.
ALTER TABLE clientes ADD COLUMN senha_hash TEXT;      -- PBKDF2 (pbkdf2$iter$salt$hash); nulo = ainda não criou senha
ALTER TABLE clientes ADD COLUMN acesso_token TEXT;    -- token do link que o gestor envia pro cliente criar a senha
