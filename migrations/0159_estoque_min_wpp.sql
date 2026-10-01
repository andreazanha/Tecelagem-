-- Número de WhatsApp que recebe o resumo diário de materiais abaixo do mínimo.
-- Editável depois pela config. Idempotente.
INSERT OR IGNORE INTO config (chave, valor, atualizado_em)
VALUES ('estoque_min_wpp', '19996217167', datetime('now'));
