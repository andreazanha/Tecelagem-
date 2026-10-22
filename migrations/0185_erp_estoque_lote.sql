-- Carimbo de sincronização do espelho de estoque. Cada rodada da ponte usa um 'lote'
-- único; ao final, o servidor apaga as linhas de lotes anteriores (estoque que sumiu do
-- Syntech) — assim o espelho reflete EXATAMENTE o Syntech, sem saldo fantasma.
ALTER TABLE erp_estoque ADD COLUMN lote TEXT;
