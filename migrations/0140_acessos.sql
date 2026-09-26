-- Tela ACESSOS (Gestão): campos aditivos para usuários e prestadores. Nada é removido; defaults
-- seguros para não quebrar quem já existe. Autenticação, pedidos e produção seguem intactos.

-- Usuário ganha e-mail (opcional). "Último acesso" NÃO é coluna: é derivado de MAX(sessoes.criado_em).
ALTER TABLE usuarios ADD COLUMN email TEXT;

-- Prestador de serviço (costureiras entram aqui): tipo, setor relacionado, e-mail e status.
-- `servico` (costura|tassel|outro) continua sendo a base do romaneio/pagamento — não mexer nele.
ALTER TABLE prestadores ADD COLUMN tipo  TEXT;
ALTER TABLE prestadores ADD COLUMN setor TEXT;
ALTER TABLE prestadores ADD COLUMN email TEXT;
ALTER TABLE prestadores ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;

-- Pré-preenche o tipo a partir do serviço já cadastrado (só onde ainda está vazio).
UPDATE prestadores SET tipo = CASE
    WHEN servico = 'costura' THEN 'Costureira'
    WHEN servico = 'tassel'  THEN 'Tassel'
    ELSE 'Prestador'
  END
 WHERE tipo IS NULL OR tipo = '';
