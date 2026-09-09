-- Renomeia o vendedor/representante "Pedro Henrique" para "Eduarda" (Eduarda assume a carteira dele).
-- O nome do representante é guardado como TEXTO em vários lugares (a lista de representantes e, por
-- nome, em cada cliente e em cada conversa do atendimento). Por isso troca em todos: assim a Eduarda
-- herda os clientes e as conversas que eram do Pedro. O id interno do cadastro não muda.
UPDATE representantes  SET nome='Eduarda'          WHERE lower(nome)=lower('Pedro Henrique');
UPDATE clientes        SET representante='Eduarda' WHERE lower(representante)=lower('Pedro Henrique');
UPDATE atend_conversas SET representante='Eduarda' WHERE lower(representante)=lower('Pedro Henrique');
