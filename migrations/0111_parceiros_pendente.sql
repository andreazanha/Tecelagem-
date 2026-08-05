-- Loja parceira criada a partir de um CLIENTE da base, aguardando aprovação do gestor
-- antes de aparecer na vitrine pública ("Onde Comprar"). Enquanto pendente=1 a loja NÃO
-- aparece na vitrine, mesmo com ativo. cliente_id liga à origem e evita duplicar na importação.
ALTER TABLE lojas_parceiras ADD COLUMN pendente INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lojas_parceiras ADD COLUMN cliente_id TEXT;
CREATE INDEX IF NOT EXISTS idx_lojas_parceiras_cliente ON lojas_parceiras (cliente_id);
