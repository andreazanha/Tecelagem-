-- Remove de vez o CHAT INTERNO da equipe (a antiga "Comunicação interna"), que já foi tirado da tela
-- e das rotas. Apaga as tabelas dele. (O número da equipe que o robô não atende continua funcionando
-- por outro caminho — config 'equipe_numeros' — e NÃO é afetado aqui.)
DROP TABLE IF EXISTS chat_mensagens;
DROP TABLE IF EXISTS chat_lido;
DROP TABLE IF EXISTS chat_membros;
