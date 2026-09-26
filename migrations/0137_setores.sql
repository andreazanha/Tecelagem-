-- SETORES da empresa (registro central, org-wide) — diferente de `atend_setores` (que é só do
-- roteamento de conversa do WhatsApp). Aqui ficam os setores usados no controle de acesso:
-- cada usuário tem um setor principal e pode ter acesso (ver/editar) a vários setores.
-- `id` fixo por setor (casa com a chave de tela do sistema quando existe) para o menu continuar
-- funcionando sem mudar nada. `ordem` controla a exibição. NÃO apagar setor com histórico:
-- a tela só permite DESATIVAR (ativo=0).
CREATE TABLE IF NOT EXISTS setores (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  ativo      INTEGER NOT NULL DEFAULT 1,
  ordem      INTEGER NOT NULL DEFAULT 0,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Setores iniciais pedidos pela gestão. CRM entra como setor também (item do pedido).
INSERT OR IGNORE INTO setores (id, nome, ordem) VALUES
  ('tecelagem',  'Tecelagem',  1),
  ('passadoria', 'Passadoria', 2),
  ('corte',      'Corte',      3),
  ('costura',    'Costura',    4),
  ('revisao',    'Revisão',    5),
  ('pcp',        'PCP',        6),
  ('fiscal',     'Fiscal',     7),
  ('expedicao',  'Expedição',  8),
  ('estoque',    'Estoque',    9),
  ('crm',        'CRM',        10);
