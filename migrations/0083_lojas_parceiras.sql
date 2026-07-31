-- Vitrine de lojas parceiras: cadastro próprio (independente de clientes) das lojas
-- que revendem os produtos da Big Tricot. O consumidor final abre a vitrine pública
-- (link /vitrine), escolhe estado → cidade e vê nome, endereço, site, Instagram e
-- WhatsApp (clicáveis). A Bia manda esse link pro consumidor final.
CREATE TABLE IF NOT EXISTS lojas_parceiras (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  endereco   TEXT,
  cidade     TEXT,
  uf         TEXT,
  whatsapp   TEXT,
  instagram  TEXT,
  site       TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lojas_parceiras_uf ON lojas_parceiras (uf);
CREATE INDEX IF NOT EXISTS idx_lojas_parceiras_cidade ON lojas_parceiras (cidade);
