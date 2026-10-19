-- Login do REPRESENTANTE na loja (R1): senha própria + token do link de 1º acesso.
-- O rep entra com e-mail + senha e vê só a carteira dele (clientes.representante = nome dele).
ALTER TABLE representantes ADD COLUMN senha_hash TEXT;     -- PBKDF2; nulo = ainda não criou senha
ALTER TABLE representantes ADD COLUMN acesso_token TEXT;   -- token do link que o gestor envia pro rep criar a senha
