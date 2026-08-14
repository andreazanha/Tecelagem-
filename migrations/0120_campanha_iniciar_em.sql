-- Agendar o INÍCIO de uma campanha pra outro dia/horário. NULL = começa já. Guardado em UTC
-- ('YYYY-MM-DD HH:MM:SS') pra comparar direto com datetime('now'). Enquanto iniciar_em > agora, o
-- cron NÃO dispara a campanha (ela fica 'ativa' porém aguardando a data).
ALTER TABLE atend_campanhas ADD COLUMN iniciar_em TEXT;
