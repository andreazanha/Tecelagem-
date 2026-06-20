-- Esteira de setores: cada parte da OP caminha Tecelagem → Passadoria → Corte → ...
-- 'setor' = setor atual da parte; status passa a ser aguardando | fazendo | pronto.
ALTER TABLE producao ADD COLUMN setor TEXT NOT NULL DEFAULT 'tecelagem';
UPDATE producao SET status = 'fazendo' WHERE status = 'tecendo';
UPDATE producao SET setor = 'passadoria', status = 'aguardando' WHERE status = 'enviado';
