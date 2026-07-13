-- Ficha de consumo: guarda a COR DO PRODUTO (nome da cor do tricô) em que cada
-- material se aplica. Usado principalmente pelo zíper, cuja cor (número do
-- fabricante) é ligada manualmente a cada cor do tricô — os nomes não batem.
-- NULL = aplica-se a todas as cores (comportamento atual dos demais materiais).
ALTER TABLE modelo_materiais ADD COLUMN cor_produto TEXT;
