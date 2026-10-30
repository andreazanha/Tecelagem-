-- Corrige o efeito colateral da 0191: ao deixar o responsável NULL, as conversas
-- passaram a contar como "precisa de atendente" e dispararam um monte de avisos.
-- Marca como responsável "Big Tricot" (a marca é a "dona") as conversas que ficaram
-- SEM dono mas que já têm mensagem de SAÍDA como "Big Tricot" — assim elas mostram
-- "Big Tricot" E saem da fila de "precisa de atendente" (sem disparar aviso).
-- Conversas realmente aguardando atendimento (cliente escreveu, ninguém respondeu) NÃO
-- têm mensagem de saída "Big Tricot", então continuam na fila normalmente.
UPDATE atend_conversas SET responsavel = 'Big Tricot'
  WHERE (responsavel IS NULL OR TRIM(responsavel) = '')
    AND id IN (
      SELECT DISTINCT conversa_id FROM atend_mensagens
       WHERE direcao = 'out' AND LOWER(TRIM(COALESCE(autor, ''))) = 'big tricot'
    );
