-- Registra QUEM fez cada movimentação de insumo (material_mov).
-- Antes só gravávamos data/quantidade/tipo; agora guardamos o usuário também,
-- para o Relatório de Estoque (histórico de entrada/saída por usuário).
-- Linhas antigas ficam NULL (aparecem como "—" no relatório).
ALTER TABLE material_mov ADD COLUMN usuario_id TEXT;
ALTER TABLE material_mov ADD COLUMN usuario_nome TEXT;
