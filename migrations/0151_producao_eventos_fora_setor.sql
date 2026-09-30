-- Registra QUEM agiu em cada etapa (o operador que autenticou, "agente"), o setor
-- em que ele é cadastrado, e se a ação foi feita FORA do setor dele (cadastrado num
-- setor e mexendo em outro). NÃO bloqueia — só registra pro relatório detalhado.
ALTER TABLE producao_eventos ADD COLUMN agente TEXT;
ALTER TABLE producao_eventos ADD COLUMN agente_setor TEXT;
ALTER TABLE producao_eventos ADD COLUMN fora_setor INTEGER NOT NULL DEFAULT 0;
