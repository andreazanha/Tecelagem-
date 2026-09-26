-- Primeiro acesso: usuário cria a própria senha no 1º login (senha_definida=0).
ALTER TABLE usuarios ADD COLUMN senha_definida INTEGER NOT NULL DEFAULT 1;

-- Cadastro inicial da equipe (login = 1º nome; senha vazia até o 1º acesso). Barragem já
-- ativa (perm_configurado=1): cada um vê/edita só o(s) setor(es) e funções liberadas abaixo.
INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_leandrobueno', 'Leandro Bueno', 'leandrobueno', '', 0, '["producao"]', 'tecelagem', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_leandrobueno', 'tecelagem', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.iniciar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.finalizar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.enviar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.voltar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.defeito');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.devolver');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.prioridade');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.desmembrar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.revisadora');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandrobueno', 'producao.historico');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_guilherme', 'Guilherme', 'guilherme', '', 0, '["producao"]', 'tecelagem', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_guilherme', 'tecelagem', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.iniciar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.finalizar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.enviar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.voltar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.defeito');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.devolver');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.prioridade');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.desmembrar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.revisadora');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_guilherme', 'producao.historico');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_natalia', 'Natalia', 'natalia', '', 0, '["corte"]', 'corte', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_natalia', 'corte', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.iniciar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.finalizar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.enviar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.voltar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.defeito');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.devolver');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.prioridade');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.desmembrar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.revisadora');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'producao.historico');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_natalia', 'expedicao.romaneio');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_leandro', 'Leandro', 'leandro', '', 0, '["passadoria"]', 'passadoria', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_leandro', 'passadoria', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.iniciar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.finalizar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.enviar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.voltar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.defeito');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.devolver');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.prioridade');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.desmembrar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.revisadora');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_leandro', 'producao.historico');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_betania', 'Betania', 'betania', '', 0, '["revisao"]', 'revisao', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_betania', 'revisao', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.iniciar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.finalizar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.enviar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.voltar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.defeito');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.devolver');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.prioridade');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.desmembrar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.revisadora');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_betania', 'producao.historico');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_bruna', 'Bruna', 'bruna', '', 0, '["revisao"]', 'revisao', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_bruna', 'revisao', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.iniciar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.finalizar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.enviar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.voltar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.defeito');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.devolver');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.prioridade');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.desmembrar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.revisadora');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_bruna', 'producao.historico');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_katherine', 'Katherine', 'katherine', '', 0, '["revisao"]', 'revisao', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_katherine', 'revisao', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.iniciar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.finalizar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.enviar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.voltar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.defeito');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.devolver');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.prioridade');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.desmembrar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.revisadora');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_katherine', 'producao.historico');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_ray', 'Ray', 'ray', '', 0, '["expedicao","revisao"]', 'expedicao', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_ray', 'expedicao', 1, 1);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_ray', 'revisao', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.iniciar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.finalizar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.enviar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.voltar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.defeito');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.devolver');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.prioridade');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.desmembrar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.revisadora');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'producao.historico');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'expedicao.fase');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'expedicao.romaneio');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ray', 'expedicao.etiquetas');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_beatris', 'Beatris', 'beatris', '', 0, '["fiscal"]', 'fiscal', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_beatris', 'fiscal', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_beatris', 'fiscal.frete');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_beatris', 'fiscal.nf');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_jenifer', 'Jenifer', 'jenifer', '', 0, '["fiscal"]', 'fiscal', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_jenifer', 'fiscal', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_jenifer', 'fiscal.frete');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_jenifer', 'fiscal.nf');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_ricardo', 'Ricardo', 'ricardo', '', 0, '["transporte","expedicao"]', 'expedicao', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_ricardo', 'expedicao', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_ricardo', 'expedicao.fase');

INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, setor_principal, perm_configurado, senha_definida) VALUES ('usr_grasiela', 'Grasiela', 'grasiela', '', 0, '["pedidos","romaneios","expedicao"]', 'pcp', 1, 0);
INSERT OR IGNORE INTO usuario_setores (usuario_id, setor_id, ver, editar) VALUES ('usr_grasiela', 'pcp', 1, 1);
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_grasiela', 'pcp.liberar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_grasiela', 'pedido.criar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_grasiela', 'pedido.editar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_grasiela', 'pedido.importar');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_grasiela', 'pedido.etiquetas');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_grasiela', 'expedicao.romaneio');
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES ('usr_grasiela', 'expedicao.etiquetas');

