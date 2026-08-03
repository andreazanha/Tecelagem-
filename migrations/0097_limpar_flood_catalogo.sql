-- Limpa o "flood" de eventos de catálogo repetidos (bug do "eee"): a mesma mensagem
-- "Entrou no catálogo — loja: X" foi gravada dezenas/centenas de vezes por conversa.
-- Mantém só a PRIMEIRA ocorrência de cada rótulo por conversa e apaga o resto.
DELETE FROM atend_mensagens
 WHERE autor = 'catalogo'
   AND rowid NOT IN (
     SELECT MIN(rowid) FROM atend_mensagens WHERE autor = 'catalogo' GROUP BY conversa_id, texto
   );
