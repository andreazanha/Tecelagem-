-- Estoque — fundação da baixa automática + estorno (aditivo, não quebra nada).
-- • caixas: contagem de caixas do material, INDEPENDENTE da unidade base (kg/un).
--   A baixa automática do pedido mexe só na unidade base; caixas é manual/QR.
-- • material_mov.pedido_id: amarra cada movimento ao pedido que o causou, para
--   estornar EXATAMENTE o que saiu quando o pedido é excluído/corrigido.
-- • material_mov.estornado: marca o movimento de baixa já devolvido (idempotência).
ALTER TABLE materiais ADD COLUMN caixas REAL NOT NULL DEFAULT 0;
ALTER TABLE material_mov ADD COLUMN pedido_id TEXT;
ALTER TABLE material_mov ADD COLUMN estornado INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_material_mov_pedido ON material_mov(pedido_id);
