-- Razão social (nome registrado no CNPJ) da loja/cliente, coletada no formulário de cadastro.
-- É diferente do "nome fantasia" (coluna nome), que é como a loja é conhecida no dia a dia.
ALTER TABLE atend_conversas ADD COLUMN razao_social TEXT;
