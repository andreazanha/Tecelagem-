-- Fase 2: cadência de follow-up multi-etapa + regras.
-- followup_etapa: 0 nenhum | 1 enviado 24h | 2 enviado +3d | 3 enviado +7d (última) → para.
ALTER TABLE atend_conversas ADD COLUMN followup_etapa INTEGER NOT NULL DEFAULT 0;
-- Cliente pediu pra não receber mensagens automáticas (opt-out) → nunca recebe follow-up.
ALTER TABLE atend_conversas ADD COLUMN nao_perturbe INTEGER NOT NULL DEFAULT 0;

-- Regras das mensagens automáticas (chave/valor):
INSERT OR IGNORE INTO config (chave, valor) VALUES ('followup_ativo', '1');       -- liga/desliga a cadência
INSERT OR IGNORE INTO config (chave, valor) VALUES ('followup_hora_ini', '8');    -- início do horário comercial (Brasil)
INSERT OR IGNORE INTO config (chave, valor) VALUES ('followup_hora_fim', '18');   -- fim do horário comercial
INSERT OR IGNORE INTO config (chave, valor) VALUES ('followup_domingo', '0');     -- 0 = não envia aos domingos
INSERT OR IGNORE INTO config (chave, valor) VALUES ('followup_ia', '0');          -- 1 = gera o texto por IA (senão usa modelo pronto)
