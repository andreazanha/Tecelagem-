-- Correção da 0068: quando um produto está nas DUAS coleções (Polisoft e Soft),
-- o Polisoft é o fio principal e deve prevalecer → 100% POLIÉSTER.
-- Reaplica Soft e depois Polisoft (Polisoft por último vence nos casos duplos).

UPDATE modelos SET composicao = '100% ACRÍLICO'
 WHERE nome IN (
   SELECT cp.modelo_nome FROM colecao_produtos cp
     JOIN colecoes c ON c.id = cp.colecao_id
    WHERE LOWER(c.nome) = 'soft'
 );

UPDATE modelos SET composicao = '100% POLIÉSTER'
 WHERE nome IN (
   SELECT cp.modelo_nome FROM colecao_produtos cp
     JOIN colecoes c ON c.id = cp.colecao_id
    WHERE LOWER(c.nome) = 'polisoft'
 );
