-- Desmembramento de OP consolidada: cada card separado guarda a OP de origem.
-- op = número do pedido original (NULL/'' = card normal, ainda não desmembrado).
-- Os cards desmembrados usam parte = "<parte>#<op>" para conviverem na mesma
-- chave (pedido_id, parte) sem mudar a estrutura existente.
ALTER TABLE producao ADD COLUMN op TEXT;
