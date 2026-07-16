-- Etiqueta de colar (adesivo com o nome do produto). Marca, no modelo, se ele usa
-- a etiqueta de colar — que é gerada para todos os tamanhos e cores cadastrados
-- (texto: "Nome · Tamanho · Cor"). Aditivo/idempotente. 0 = não usa, 1 = usa.
ALTER TABLE modelos ADD COLUMN etiqueta_colar INTEGER NOT NULL DEFAULT 0;
