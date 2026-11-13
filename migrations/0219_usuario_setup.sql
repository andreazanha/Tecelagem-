-- Acesso de MONTAGEM / SETUP: um usuário TRAVADO (sem nenhuma permissão) para o
-- dono deixar cada computador pronto (ex.: escolher o setor do chat deste PC) SEM
-- precisar entrar com a conta pessoal dele. Este acesso NÃO enxerga pedido, estoque
-- nem Syntech: perm_configurado=1 e nenhuma função/setor liberado, admin=0, paginas vazia.
-- A SENHA PADRÃO é criada no PRIMEIRO acesso (senha_definida=0): a primeira vez que
-- alguém entra com o usuário "setup", o sistema pede pra criar a senha — e essa vira
-- a senha padrão de montagem (use-a nos demais computadores).
INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida)
VALUES ('usr_setup', 'Montagem (setup)', 'setup', '', 0, '[]', NULL, 1, 0);
