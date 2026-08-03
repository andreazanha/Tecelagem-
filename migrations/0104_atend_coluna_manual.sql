-- Kanban do atendimento: permite arrastar o card pra outra coluna (coluna_manual
-- sobrepõe a coluna automática derivada do estado). Colunas customizadas e a ordem
-- ficam em config (atend_colunas_extra / atend_colunas_ordem).
ALTER TABLE atend_conversas ADD COLUMN coluna_manual TEXT;
