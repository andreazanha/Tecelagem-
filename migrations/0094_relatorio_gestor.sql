-- Relatório semanal de representantes: guarda o WhatsApp do GESTOR (quem recebe o
-- relatório geral) e já preenche o WhatsApp do André Azanha, que também é representante.
-- Número no formato Z-API (com DDI 55): 55 + DDD + número.
INSERT OR IGNORE INTO config (chave, valor) VALUES ('relatorio_gestor_nome', 'André Azanha');
INSERT OR IGNORE INTO config (chave, valor) VALUES ('relatorio_gestor_whatsapp', '5519996217167');

UPDATE representantes SET whatsapp = '5519996217167'
 WHERE id = 'rep-andre-azanha' AND (whatsapp IS NULL OR whatsapp = '');
