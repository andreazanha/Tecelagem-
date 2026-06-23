-- Romaneio de costura por SERVIÇO: cada serviço cobra uma família de peças.
-- agrupamento: 'peseira_manta' | 'almofada_capa' | 'todas'
ALTER TABLE costura ADD COLUMN agrupamento TEXT NOT NULL DEFAULT 'todas';
