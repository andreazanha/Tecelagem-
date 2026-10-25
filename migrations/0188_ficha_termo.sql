-- Termos técnicos reutilizáveis da Ficha de Programa (pontos de tricô / stitch,
-- localizações, nomes de programa e outros termos frequentes).
-- Fios reutilizam tipos_fio; máquinas/galgas reutilizam ficha_maquina/ficha_galga.
-- nome_norm = grafia normalizada (minúsculo, sem acento) para busca e dedup;
-- nome = grafia canônica exibida. usos = frequência (ordena as sugestões).
CREATE TABLE IF NOT EXISTS ficha_termo (
  id         TEXT PRIMARY KEY,
  tipo       TEXT NOT NULL,                       -- 'ponto' | 'programa' | 'stitch' | ...
  nome       TEXT NOT NULL,
  nome_norm  TEXT NOT NULL,
  usos       INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- impede duplicado por tipo ignorando maiúsc/minúsc e acento
CREATE UNIQUE INDEX IF NOT EXISTS ux_ficha_termo ON ficha_termo(tipo, nome_norm);
CREATE INDEX IF NOT EXISTS idx_ficha_termo_tipo_usos ON ficha_termo(tipo, usos);
