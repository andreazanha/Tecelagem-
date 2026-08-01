-- Respostas treinadas da Bia para perguntas comuns que chegam no WhatsApp.
-- Todas acolhem e QUALIFICAM (lojista x uso pessoal) sem inventar preço.
-- Idempotente: cada entrada só é inserida se o id ainda não existir.

-- Preço / valor / tabela (ex.: "valor do kit de almofadas com a manta", "quanto custa a manta")
INSERT INTO ia_conhecimento (id, pergunta, resposta, ativo)
SELECT 'conh-preco',
  'Quanto custa? Qual o valor? Qual o preço da manta, do kit de almofadas com a manta, das almofadas ou das capas? Tem tabela de preços?',
  'Oi! 😊 A Big Tricot é fábrica e trabalha no atacado, só para lojistas (revenda). Pra eu te passar os valores do jeito certo: você tem loja/CNPJ pra revender, ou é pra uso pessoal? 💛',
  1
WHERE NOT EXISTS (SELECT 1 FROM ia_conhecimento WHERE id = 'conh-preco');

-- Orçamento (ex.: "entrei em contato pelo site e gostaria de um orçamento")
INSERT INTO ia_conhecimento (id, pergunta, resposta, ativo)
SELECT 'conh-orcamento',
  'Quero um orçamento. Entrei em contato pelo site e gostaria de um orçamento. Podem me passar um orçamento?',
  'Que bom que você chegou até a gente! 💛 Pra montar seu orçamento certinho, me conta: você tem loja/CNPJ (compra pra revender) ou é pra uso pessoal? E quais produtos te interessam? Assim já te encaminho pro vendedor certo. 😊',
  1
WHERE NOT EXISTS (SELECT 1 FROM ia_conhecimento WHERE id = 'conh-orcamento');

-- Produto específico / disponibilidade (ex.: "quero peseira casal", "tem tal modelo/tamanho?")
INSERT INTO ia_conhecimento (id, pergunta, resposta, ativo)
SELECT 'conh-produtos',
  'Quero peseira (pe de cama) casal ou solteiro. Voces tem tal produto, modelo, cor ou tamanho? Quais produtos voces fazem? Quero manta, capa de almofada ou almofada.',
  'Temos uma linha linda de tricô pra decoração 😍 Pra te mostrar os modelos, cores e tamanhos, posso te enviar nosso catálogo. Antes me diz: você tem loja/CNPJ (revenda) ou é pra uso pessoal? 💛',
  1
WHERE NOT EXISTS (SELECT 1 FROM ia_conhecimento WHERE id = 'conh-produtos');

-- Pergunta genérica / pedir mais informações (ex.: "posso ter mais informacoes sobre isso?")
INSERT INTO ia_conhecimento (id, pergunta, resposta, ativo)
SELECT 'conh-mais-info',
  'Posso ter mais informacoes sobre isso? Quero saber mais. Me fala mais sobre esse produto.',
  'Claro! 😊 Me conta o que você gostaria de saber e qual produto te interessou. E você tem loja/CNPJ (pra revender) ou é pra uso pessoal? Assim eu te ajudo certinho. 💛',
  1
WHERE NOT EXISTS (SELECT 1 FROM ia_conhecimento WHERE id = 'conh-mais-info');

-- Reforça a resposta de envio pra cobrir tambem "outras cidades" / "minha cidade".
UPDATE ia_conhecimento
   SET pergunta = 'Voces enviam para todo o Brasil? Enviam para outras cidades / para a minha cidade? Atendem a minha regiao / meu estado? Fazem entrega para o Norte / Nordeste / Sul / Sudeste / Centro-Oeste?'
 WHERE id = 'conh-envio-brasil';
