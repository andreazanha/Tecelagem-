-- Tamanho como campo próprio do item (agrupamento por Referência + Cor + Tamanho).
-- 'ref' passa a guardar a GRADE (ex.: 1075, 1083, KT1096); 'cor_grade' guarda a COR.
ALTER TABLE pedido_itens ADD COLUMN tamanho TEXT;
