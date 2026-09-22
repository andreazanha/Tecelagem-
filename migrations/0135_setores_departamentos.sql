-- Cria os setores/departamentos padrão do atendimento (Fiscal, Financeiro, PCP).
-- INSERT OR IGNORE: não duplica se já existirem (id fixo por setor).
INSERT OR IGNORE INTO atend_setores (id, nome, ativo) VALUES
  ('fiscal',     'Departamento Fiscal',     1),
  ('financeiro', 'Departamento Financeiro', 1),
  ('pcp',        'PCP',                     1);
