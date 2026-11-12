-- Código ÚNICO por PEÇA, para a conferência de expedição (bipagem).
-- Cada peça física de um pedido ganha um código único e imutável (ex.: "000022-003").
-- Na Expedição o operador bipa peça por peça; cada código conta UMA única vez, o
-- que impede pegar uma peça e bipar várias (a reclamação do André). Só fecha o
-- pedido quando TODAS as peças distintas foram bipadas.
-- IMPORTANTE: isto é controle 100% interno da Big Tricot. NADA é escrito no Syntech.
CREATE TABLE IF NOT EXISTS peca_codigo (
  codigo      TEXT PRIMARY KEY,        -- código impresso no código de barras (único no sistema)
  pedido_id   TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,        -- ordem da peça dentro do pedido (1..N)
  produto     TEXT,                    -- nome do modelo p/ exibir (ex.: "Manta Acácia" / "Kit Kora")
  ref         TEXT,                    -- referência do item (ex.: OT1012)
  cor         TEXT,
  tamanho     TEXT,
  tipo        TEXT,                    -- Peça/Peseira/Manta/Almofada/Capa (só para exibir)
  kit         INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  bipado_em   TEXT,                    -- NULL = peça ainda não foi bipada
  bipado_por  TEXT
);
CREATE INDEX IF NOT EXISTS idx_peca_codigo_pedido ON peca_codigo(pedido_id);
