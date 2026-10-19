-- Clientes cadastrados pelo representante não devem ficar "em análise":
-- o rep normalmente está na loja e precisa seguir com o pedido na hora.
-- A partir de agora o cadastro já entra liberado; esta migration libera os
-- que foram cadastrados antes desse ajuste (ficaram presos em "pendente").
UPDATE clientes
   SET loja_status = 'aprovado'
 WHERE COALESCE(origem,'') = 'rep'
   AND COALESCE(loja_status,'') = 'pendente';
