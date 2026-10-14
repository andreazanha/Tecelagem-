-- Data de entrega prevista da ordem de compra (editável na tela, sai no PDF).
ALTER TABLE ordens_compra ADD COLUMN data_entrega TEXT;
