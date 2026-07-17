-- Normaliza a composição dos produtos pela coleção de fio:
--   Polisoft → 100% POLIÉSTER
--   Soft     → 100% ACRÍLICO
-- Regra pedida pelo usuário. Roda uma vez (o CI aplica migrações não aplicadas).
-- Depois disso, cada produto pode ser ajustado à mão no cadastro normalmente.

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
