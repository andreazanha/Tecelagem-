-- "Passar na frente": marca uma parte como prioritária na esteira.
-- Aparece numa coluna própria e fica destacada em cada setor.
ALTER TABLE producao ADD COLUMN prioridade INTEGER NOT NULL DEFAULT 0;

-- Pronta-entrega (KIT) não passa pela produção: vai direto para o Estoque
-- (separação). Move os kits que estavam na Tecelagem/Passadoria para o Estoque,
-- preservando o status — assim nenhum card fica escondido ao tirar as colunas
-- de kit dos quadros de produção.
UPDATE producao SET setor = 'estoque'
 WHERE parte = 'pronta-entrega' AND setor IN ('tecelagem', 'passadoria');
