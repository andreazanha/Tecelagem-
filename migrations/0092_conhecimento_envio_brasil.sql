-- Resposta treinada da Bia para dúvidas de ENVIO / cobertura por região.
-- Idempotente: só insere se ainda não existir uma entrada com essa pergunta.
INSERT INTO ia_conhecimento (id, pergunta, resposta, ativo)
SELECT
  'conh-envio-brasil',
  'Vocês enviam para todo o Brasil? Atendem a minha região / meu estado? Fazem entrega para o Norte / Nordeste / Sul / Sudeste / Centro-Oeste?',
  'Sim, enviamos para todo o Brasil! 😊

Atendemos lojistas de todas as regiões. Você gostaria de conhecer nossos produtos e receber o catálogo?',
  1
WHERE NOT EXISTS (SELECT 1 FROM ia_conhecimento WHERE id = 'conh-envio-brasil');
