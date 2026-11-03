-- ETAPA 2 da RESERVA EL (avisos): carimbo do AVISO DE PROTEÇÃO NOTURNA.
-- Enviado uma única vez por carrinho protegido (reserva_noturna=1), informando que o prazo foi
-- estendido até a manhã. Idempotente: só o primeiro ciclo do cron a marcar é que envia.
ALTER TABLE pedidos ADD COLUMN reserva_aviso_noturno_em TEXT;
