-- Acesso do usuário a cada setor: pode VER e/ou EDITAR. Uma linha por (usuário, setor) marcado.
-- Sem linha = sem acesso àquele setor. `principal` marca o setor principal do usuário (onde ele
-- trabalha normalmente) — separado das permissões de acesso (o principal não decide tudo sozinho).
CREATE TABLE IF NOT EXISTS usuario_setores (
  usuario_id TEXT NOT NULL,
  setor_id   TEXT NOT NULL,
  ver        INTEGER NOT NULL DEFAULT 0,
  editar     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, setor_id)
);
CREATE INDEX IF NOT EXISTS idx_usuario_setores_u ON usuario_setores(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_setores_s ON usuario_setores(setor_id);

-- Permissões de FUNÇÃO liberadas por usuário (controle fino de botões/ações). A presença da linha
-- = liberado. Chave textual (ex.: 'pedido.excluir', 'producao.iniciar') — escalável: função nova
-- é só uma chave nova, sem reconstruir nada.
CREATE TABLE IF NOT EXISTS usuario_permissoes (
  usuario_id TEXT NOT NULL,
  permissao  TEXT NOT NULL,
  PRIMARY KEY (usuario_id, permissao)
);
CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_u ON usuario_permissoes(usuario_id);

-- Setor principal do usuário (id do setor). Coluna direta para consulta rápida na listagem.
ALTER TABLE usuarios ADD COLUMN setor_principal TEXT;

-- Marca que o gestor JÁ configurou as permissões finas deste usuário. Enquanto 0 (legado), o
-- usuário mantém tudo que já fazia (nada quebra no dia do deploy). Quando o gestor salva as
-- permissões, vira 1 e o controle fino passa a valer para ele — no front E no backend.
ALTER TABLE usuarios ADD COLUMN perm_configurado INTEGER NOT NULL DEFAULT 0;
