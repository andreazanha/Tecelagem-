-- Controle da Tecelagem: % de eficiência das máquinas + motivos de parada (tempo),
-- registrado 2× ao dia (turno manhã/tarde). Base para bonificação mensal.
-- Tudo ADITIVO e idempotente (CREATE IF NOT EXISTS + INSERT OR IGNORE).

-- Máquinas (teares) — cadastráveis.
CREATE TABLE IF NOT EXISTS tecelagem_maquinas (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  ordem     INTEGER NOT NULL DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Motivos de parada (cadastráveis). tipo: 'parada' (conta contra a máquina)
-- | 'limpeza' | 'manutencao' (paradas JUSTIFICADAS — não descontam da bonificação).
CREATE TABLE IF NOT EXISTS tecelagem_motivos (
  id     TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome   TEXT,
  tipo   TEXT NOT NULL DEFAULT 'parada',
  ordem  INTEGER NOT NULL DEFAULT 0,
  ativo  INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO tecelagem_motivos (id, codigo, nome, tipo, ordem) VALUES
  (lower(hex(randomblob(8))), 'yarn',       'Yarn',       'parada',      1),
  (lower(hex(randomblob(8))), 'ndl',        'Ndl',        'parada',      2),
  (lower(hex(randomblob(8))), 'TWR',        'TWR',        'parada',      3),
  (lower(hex(randomblob(8))), 'SHK',        'SHK',        'parada',      4),
  (lower(hex(randomblob(8))), 'ETC',        'ETC',        'parada',      5),
  (lower(hex(randomblob(8))), 'MAN',        'MAN',        'parada',      6),
  (lower(hex(randomblob(8))), 'FINSH',      'FINSH',      'parada',      7),
  (lower(hex(randomblob(8))), 'WGT',        'WGT',        'parada',      8),
  (lower(hex(randomblob(8))), 'limpeza',    'Limpeza',    'limpeza',    90),
  (lower(hex(randomblob(8))), 'manutencao', 'Manutenção', 'manutencao', 91);

-- Registro por máquina / dia / turno (1 registro por combinação).
CREATE TABLE IF NOT EXISTS tecelagem_registros (
  id            TEXT PRIMARY KEY,
  maquina_id    TEXT NOT NULL,
  data          TEXT NOT NULL,               -- YYYY-MM-DD
  turno         TEXT NOT NULL,               -- manha | tarde
  percentual    REAL,                        -- % cedida pela máquina (0-100)
  operador      TEXT,
  obs           TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (maquina_id, data, turno)
);
CREATE INDEX IF NOT EXISTS idx_tec_reg_data ON tecelagem_registros(data);
CREATE INDEX IF NOT EXISTS idx_tec_reg_maq  ON tecelagem_registros(maquina_id);

-- Tempo parado por motivo em cada registro (em MINUTOS).
CREATE TABLE IF NOT EXISTS tecelagem_paradas (
  id          TEXT PRIMARY KEY,
  registro_id TEXT NOT NULL,
  motivo      TEXT NOT NULL,                 -- codigo do motivo
  minutos     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (registro_id, motivo)
);
CREATE INDEX IF NOT EXISTS idx_tec_par_reg ON tecelagem_paradas(registro_id);
