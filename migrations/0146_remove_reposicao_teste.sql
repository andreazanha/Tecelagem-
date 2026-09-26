-- Remove a reposição de TESTE (REP-TESTE) criada na 0143 para testar o aviso de WhatsApp.
-- O teste já cumpriu o papel; aqui limpamos tudo para não poluir a produção.
DELETE FROM producao      WHERE pedido_id = 'ped-rep-teste';
DELETE FROM producao_eventos WHERE pedido_id = 'ped-rep-teste';
DELETE FROM pedido_itens  WHERE pedido_id = 'ped-rep-teste';
DELETE FROM pedidos       WHERE id = 'ped-rep-teste';
DELETE FROM produto_mov   WHERE pedido_id = 'ped-rep-teste' OR produto_id IN ('prod-rt-1', 'prod-rt-2');
DELETE FROM produtos      WHERE id IN ('prod-rt-1', 'prod-rt-2');
