-- Cadeado do PCP passa a ser POR PARTE (por card), não mais por pedido inteiro.
-- Assim, liberar a Parte 1 NÃO solta a Parte 2 — cada parte é liberada separadamente.
ALTER TABLE producao ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0;

-- Backfill: os cards dos pedidos ainda bloqueados nascem bloqueados (mantém o estado atual).
UPDATE producao
   SET bloqueado = 1
 WHERE pedido_id IN (SELECT id FROM pedidos WHERE COALESCE(bloqueado, 0) = 1);
