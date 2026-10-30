-- A dona não quer o nome "Administrador"/"Administrativo" aparecendo nas conversas do
-- CRM: tudo que estava no nome dele passa a ser "Big Tricot" (sem vendedor). É só um
-- RÓTULO INTERNO do atendimento — o cliente nunca viu o nome do autor no WhatsApp.
-- Daqui pra frente, enviar sem assumir já não grava o responsável (ver atendimento.ts,
-- lista de autores genéricos + endpoint /liberar-responsavel).

-- 1) Conversas que estavam "assumidas" pelo Administrador ficam SEM dono → saem como
--    Big Tricot (o estado de atendimento não muda).
UPDATE atend_conversas SET responsavel = NULL
  WHERE LOWER(TRIM(COALESCE(responsavel, ''))) IN ('administrador', 'administrativo');

-- 2) Mensagens de saída já enviadas com autor "Administrador" passam a mostrar "Big Tricot".
UPDATE atend_mensagens SET autor = 'Big Tricot'
  WHERE direcao = 'out' AND LOWER(TRIM(COALESCE(autor, ''))) IN ('administrador', 'administrativo');
