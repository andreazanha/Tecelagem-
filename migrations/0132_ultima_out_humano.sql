-- Marca QUANDO um HUMANO respondeu o cliente pela última vez (separado de ultima_out_em, que conta
-- também o robô). É isso que decide "Em atendimento" (humano respondeu depois da última mensagem do
-- cliente) x "Aguardando atendimento humano" (cliente esperando OU só o robô respondeu → pisca).
ALTER TABLE atend_conversas ADD COLUMN ultima_out_humano_em TEXT;
-- Backfill: pros cards que já existem, assume que a última saída foi humana (aproximação), pra não
-- mudar tudo de lugar de uma vez no deploy. Daqui pra frente é preenchido só em resposta humana real.
UPDATE atend_conversas SET ultima_out_humano_em = ultima_out_em WHERE ultima_out_humano_em IS NULL AND ultima_out_em IS NOT NULL;
