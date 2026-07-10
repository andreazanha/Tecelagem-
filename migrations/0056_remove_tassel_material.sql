-- Tassel NÃO é material de compra: ele é FABRICADO por nós (trabalho manual).
-- Ele consta apenas no cadastro do produto — o sistema calcula quantos fabricar
-- e gera o romaneio (já programado). Então removemos o tipo semeado na 0055.
-- Só remove se ninguém tiver cadastrado material sob esse tipo (segurança).
DELETE FROM material_categorias
 WHERE slug = 'tassel'
   AND NOT EXISTS (SELECT 1 FROM materiais WHERE categoria = 'tassel');
