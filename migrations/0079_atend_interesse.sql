-- Fase 3a: detecção de interesse + produtos citados na conversa.
ALTER TABLE atend_conversas ADD COLUMN interessado INTEGER NOT NULL DEFAULT 0;

-- Produtos/assuntos que o cliente citou (um por linha, sem repetir por conversa).
CREATE TABLE IF NOT EXISTS atend_interesses (
  id          TEXT PRIMARY KEY,
  conversa_id TEXT NOT NULL,
  termo       TEXT NOT NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (conversa_id, termo)
);
CREATE INDEX IF NOT EXISTS idx_atend_int_conv ON atend_interesses(conversa_id);

-- Modelos reconhecidos na conversa (editável). Base: linhas da Big Tricot.
INSERT OR IGNORE INTO config (chave, valor) VALUES ('interesse_modelos', 'Dalia,Bubbles,Siena,Pop Korn,Kora,Peseira,Almofada,Manta,Capa,Enchimento');
