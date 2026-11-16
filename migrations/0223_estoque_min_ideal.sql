-- Estoque IDEAL por ref+cor (o ALVO da reposição). Complementa o estoque_min existente:
--   minimo = GATILHO (abaixo disso, dispara a reposição).
--   ideal  = ALVO   (até onde repor quando dispara).
-- Fica na MESMA tabela estoque_min (que NÃO é sobrescrita pelo sync do Syntech).
-- ideal = 0 significa "não configurado" (aí a necessidade repõe só até o mínimo).
ALTER TABLE estoque_min ADD COLUMN ideal REAL NOT NULL DEFAULT 0;
