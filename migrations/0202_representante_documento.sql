-- Documento (CPF/CNPJ) do representante, vindo do Syntech (GUIAS.CPF via ponte).
-- Serve pra NÃO tratar um representante como cliente: quem está cadastrado como
-- representante não pode aparecer na lista de clientes nem receber aviso de cliente.
ALTER TABLE representantes ADD COLUMN documento TEXT;
