-- Região de PREÇO do cliente na loja B2B ('sul' | 'norte').
-- Nulo = deduz pela UF do cadastro (Norte+Nordeste = 'norte', resto = 'sul').
ALTER TABLE clientes ADD COLUMN loja_regiao TEXT;
