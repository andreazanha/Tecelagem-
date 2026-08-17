-- "Trazer pro quadro": quando no_quadro=1, TODOS os contatos que receberam esta campanha
-- aparecem na coluna "Campanhas" do Atendimento (mesmo sem terem respondido) — pra você ver
-- quem recebeu e acompanhar um a um. Padrão 0 = escondidos (comportamento antigo).
ALTER TABLE atend_campanhas ADD COLUMN no_quadro INTEGER DEFAULT 0;
-- Índice por telefone: o board cruza as conversas com os alvos da campanha por telefone.
CREATE INDEX IF NOT EXISTS idx_camp_alvos_tel ON atend_campanha_alvos(telefone);
