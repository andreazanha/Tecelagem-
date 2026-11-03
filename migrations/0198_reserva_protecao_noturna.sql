-- ETAPA 1 da PROTEÇÃO NOTURNA (Reserva EL). Fuso America/São_Paulo.
-- O vencimento efetivo (reserva_expira_em) continua sendo a ÚNICA fonte que esvazia o carrinho e
-- solta as reservas; a proteção noturna só MUDA o valor dele quando cairia na madrugada.
--
--   reserva_expira_original : o vencimento BASE (agora+12h, ou +6h na prorrogação) ANTES da
--                             proteção noturna — só para auditoria/histórico.
--   reserva_noturna         : 1 quando a proteção noturna foi aplicada ao vencimento atual; 0 caso
--                             contrário. (base do aviso de proteção noturna, que vem na Etapa 2.)
ALTER TABLE pedidos ADD COLUMN reserva_expira_original TEXT;
ALTER TABLE pedidos ADD COLUMN reserva_noturna INTEGER NOT NULL DEFAULT 0;
