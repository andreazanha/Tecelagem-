-- Estoque mínimo por produto (para calcular faltas e sobras no relatório).
ALTER TABLE produtos ADD COLUMN estoque_min REAL NOT NULL DEFAULT 0;
