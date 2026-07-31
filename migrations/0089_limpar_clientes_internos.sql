-- Remove "clientes" que na verdade são nomes internos criados por pedidos de
-- estoque / OP consolidada / reposição / Big Tricot. Eles não são clientes reais
-- e não devem constar na lista. (A criação desses nomes já foi bloqueada no back.)
DELETE FROM clientes WHERE
  TRIM(COALESCE(nome, '')) = ''
  OR UPPER(TRIM(nome)) = 'ESTOQUE'
  OR UPPER(nome) LIKE '%CONSOLIDAD%'
  OR UPPER(nome) LIKE '%REPOSI%'
  OR UPPER(nome) LIKE '%BIG%TRICOT%';
