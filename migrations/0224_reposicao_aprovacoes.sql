-- Registro (auditoria) das aprovações de reposição: quem aprovou, quando, quanto e os itens.
-- Cada aprovação gera uma ou mais OPs de estoque (producao_op_estoque) pela esteira existente.
CREATE TABLE IF NOT EXISTS reposicao_aprovacoes (
  id          TEXT PRIMARY KEY,
  criado_em   TEXT NOT NULL,            -- data/hora da aprovação (servidor)
  usuario     TEXT,                     -- nome de quem aprovou
  usuario_id  TEXT,                     -- id do usuário
  total_pecas INTEGER NOT NULL DEFAULT 0,
  ops_criadas INTEGER NOT NULL DEFAULT 0,
  itens_json  TEXT                      -- [{ref,cor,tamanho,tipo,modelo,qtd,numero}]
);
CREATE INDEX IF NOT EXISTS idx_reposicao_aprov_data ON reposicao_aprovacoes(criado_em);
