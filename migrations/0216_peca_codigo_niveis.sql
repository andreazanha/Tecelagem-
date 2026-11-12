-- Dois níveis de bipagem no mesmo pedido, sem tocar no Syntech:
--  • SEPARAÇÃO (estoque): bipa cada UNIDADE que sai do estoque — o KIT inteiro
--    (1 código) e cada peça AVULSA (1 código). "Tudo que é estoque, kit ou avulso."
--  • EXPEDIÇÃO: bipa cada PEÇA física (kit explodido em peseira/almofadas + avulsas).
-- Por isso cada código guarda o NÍVEL e um estado de bipagem por fase.
ALTER TABLE peca_codigo ADD COLUMN nivel TEXT NOT NULL DEFAULT 'peca';  -- 'kit' (só separação) | 'peca' (expedição; avulsa também na separação)
ALTER TABLE peca_codigo ADD COLUMN grupo INTEGER;                       -- nº do kit dentro do pedido (liga as peças ao seu kit); NULL = avulsa
ALTER TABLE peca_codigo ADD COLUMN separado_em TEXT;                    -- bipagem da SEPARAÇÃO (NULL = ainda não separado)
ALTER TABLE peca_codigo ADD COLUMN separado_por TEXT;
