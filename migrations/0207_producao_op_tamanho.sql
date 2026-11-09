-- OP de estoque agora pode ser de um produto específico por TAMANHO (não só kit por cor).
-- tamanho vazio/NULL = OP no nível do kit (como já era); preenchido = produto+cor+tamanho.
ALTER TABLE producao_op_estoque ADD COLUMN tamanho TEXT;
