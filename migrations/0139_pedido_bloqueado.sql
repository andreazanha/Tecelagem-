-- Trava do PCP: pedido criado nasce BLOQUEADO (cadeado). Enquanto bloqueado=1, a produção não
-- pode iniciar/mover o pedido — o PCP libera (bloqueado=0) quando a tecelagem pode começar.
-- Pedidos que já existem ficam liberados (default 0); só os novos nascem bloqueados (via código).
ALTER TABLE pedidos ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0;
