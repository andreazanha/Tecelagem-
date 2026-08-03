-- Auto-cadastro de loja: marca se a loja é ONLINE (vende pela internet) ou física.
ALTER TABLE lojas_parceiras ADD COLUMN loja_online INTEGER NOT NULL DEFAULT 0;
