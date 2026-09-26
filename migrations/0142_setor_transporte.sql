-- Transporte agora é um SETOR (antes existia só como tela). Assim dá pra ter setor principal
-- "Transporte" e controlar acesso ver/editar como nos outros.
INSERT OR IGNORE INTO setores (id, nome, ativo, ordem) VALUES ('transporte', 'Transporte', 1, 11);

-- Ricardo (transportadora) passa a ter Transporte como setor principal + acesso ver/editar.
UPDATE usuarios SET setor_principal = 'transporte' WHERE id = 'usr_ricardo';
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_ricardo', 'transporte', 1, 1);
