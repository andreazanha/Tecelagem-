-- Marca de PRONTA ENTREGA por modelo (exceção além dos produtos com "KIT" no nome).
-- Ex.: Manta Lumi é pronta entrega mesmo sem "KIT" no nome. O gestor marca no cadastro.
ALTER TABLE modelos ADD COLUMN pronta_entrega INTEGER NOT NULL DEFAULT 0;
