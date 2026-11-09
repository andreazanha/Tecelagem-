-- INVENTÁRIO: contagem física do estoque, comparada com o saldo do sistema (Syntech).
-- Cada "inventário" é uma rodada de contagem (com data). Os itens guardam o que foi contado
-- e o saldo do sistema no momento, pra calcular a divergência. O AJUSTE no Syntech depende da
-- escrita (pendente); por ora o inventário registra a contagem e aponta as divergências.
CREATE TABLE IF NOT EXISTS inventario (
  id          TEXT PRIMARY KEY,
  nome        TEXT,
  criado_em   TEXT,
  criado_por  TEXT,
  fechado_em  TEXT
);
CREATE TABLE IF NOT EXISTS inventario_item (
  id             TEXT PRIMARY KEY,
  inventario_id  TEXT NOT NULL,
  ref            TEXT,
  cor            TEXT,
  tamanho        TEXT,
  produto        TEXT,
  sistema        REAL,            -- saldo do sistema no momento da contagem
  contado        REAL,            -- contagem física
  motivo         TEXT,            -- motivo da divergência (livre, opcional)
  por            TEXT,
  atualizado_em  TEXT,
  UNIQUE (inventario_id, ref, cor, tamanho)
);
CREATE INDEX IF NOT EXISTS idx_inv_item_inv ON inventario_item(inventario_id);
