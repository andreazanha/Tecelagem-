-- Correção final da composição por coleção (anula a 0069).
-- Regra: Soft → 100% ACRÍLICO; Polisoft → 100% POLIÉSTER.
-- Quando o produto está nas DUAS coleções, ele é Soft (ex.: Bali) → Acrílico.
-- Reaplica Polisoft e depois Soft (Soft por último vence nos casos duplos).

UPDATE modelos SET composicao = '100% POLIÉSTER'
 WHERE nome IN (
   SELECT cp.modelo_nome FROM colecao_produtos cp
     JOIN colecoes c ON c.id = cp.colecao_id
    WHERE LOWER(c.nome) = 'polisoft'
 );

UPDATE modelos SET composicao = '100% ACRÍLICO'
 WHERE nome IN (
   SELECT cp.modelo_nome FROM colecao_produtos cp
     JOIN colecoes c ON c.id = cp.colecao_id
    WHERE LOWER(c.nome) = 'soft'
 );
