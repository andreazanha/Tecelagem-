-- Senha PADRÃO da loja: uma só pra todos os clientes. O cliente entra com CNPJ + esta senha,
-- sem precisar do link/criar senha. Convive com as senhas individuais (quem já tem a sua continua).
-- Vazia = recurso desligado (volta a exigir senha individual). Pode ser trocada quando vazar demais.
INSERT OR IGNORE INTO config (chave, valor) VALUES ('loja_senha_padrao', 'bigtricot');
