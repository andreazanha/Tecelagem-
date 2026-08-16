-- CORREÇÃO PONTUAL (uma vez só): reabre os cards que o FECHO AUTOMÁTICO de 24h encerrou POR ENGANO
-- enquanto ainda estavam na fila "Aguardando atendimento humano" — ou seja, ninguém tinha ASSUMIDO
-- (responsavel vazio). Esses nunca deviam ter sido finalizados: o cliente estava esperando alguém pegar.
-- A regra já foi corrigida no código (o fecho de 24h agora só encerra quem tem responsável). Aqui
-- desfazemos o estrago que já tinha acontecido: zerar encerrado_em traz o card de volta pra fila.
--
-- Como identificamos com segurança: o fecho automático grava uma mensagem de sistema com este texto
-- exato. Filtramos por ela + responsavel vazio (fila) para NÃO mexer em quem foi encerrado à mão nem
-- em quem já estava "Em atendimento" (com responsável) quando fechou.
UPDATE atend_conversas
   SET encerrado_em = NULL,
       atualizado_em = datetime('now')
 WHERE encerrado_em IS NOT NULL
   AND estado = 'atendimento-humano'
   AND COALESCE(responsavel,'') = ''
   AND id IN (
     SELECT DISTINCT conversa_id
       FROM atend_mensagens
      WHERE texto = 'Atendimento encerrado automaticamente (24h sem conversa).'
   );
