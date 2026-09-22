-- Ajuste: Fiscal e PCP já existiam (migração 0085). Remove as duplicatas criadas
-- na 0135 e mantém só o que faltava: Financeiro (com nome curto, no padrão dos demais).
DELETE FROM atend_setores WHERE id IN ('fiscal', 'pcp');
UPDATE atend_setores SET nome = 'Financeiro' WHERE id = 'financeiro';
INSERT OR IGNORE INTO atend_setores (id, nome, ativo) VALUES ('financeiro', 'Financeiro', 1);
