-- Cards marcados como LOJISTA (lojista=1) mas que continuavam presos em "Cliente final" porque
-- o tipo/estado antigos (classificação da IA como consumidor/parceiro) ainda diziam o contrário.
-- A coluna "Cliente final" é decidida por tipo='consumidor' OU lojista=0 OU estado de parceiro —
-- então lojista=1 sozinho não tirava o card de lá (era o caso da "Cris"). Corrige os contraditórios:
-- quem foi marcado lojista=1 passa a ter tipo='lojista' e sai dos estados de parceiro.
UPDATE atend_conversas SET tipo='lojista', atualizado_em=datetime('now')
 WHERE lojista=1 AND lower(COALESCE(tipo,'')) = 'consumidor';
UPDATE atend_conversas SET estado='atendimento-humano', atualizado_em=datetime('now')
 WHERE lojista=1 AND estado IN ('indicado-parceiro','aguardando-cidade-parceiro');
