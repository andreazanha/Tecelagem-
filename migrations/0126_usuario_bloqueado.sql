-- Bloquear o acesso de um usuário (ex-funcionário) sem apagar o cadastro. Quando bloqueado=1:
-- o login é recusado E a sessão ativa dele para de valer (o servidor confere isso a cada request).
ALTER TABLE usuarios ADD COLUMN bloqueado INTEGER DEFAULT 0;
