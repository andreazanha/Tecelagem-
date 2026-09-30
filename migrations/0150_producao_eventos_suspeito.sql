-- Detecção de "conclusão instantânea" (burla humana): a pessoa clica iniciar e
-- finalizar na mesma hora, ou finaliza sem ter iniciado. Guarda no log de eventos
-- a duração (segundos) da fase e se a conclusão foi marcada como suspeita — pra
-- alimentar o relatório "quem está burlando". NÃO bloqueia nada, só registra.
ALTER TABLE producao_eventos ADD COLUMN duracao_seg INTEGER;
ALTER TABLE producao_eventos ADD COLUMN suspeito INTEGER NOT NULL DEFAULT 0;
