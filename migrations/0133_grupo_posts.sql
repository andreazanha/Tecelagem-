-- Postagens em GRUPO (lojista / pessoa física): a Big posta no grupo (na hora, agendado ou
-- recorrente) com um LINK "chamar no privado" (wa.me do número da Big) — a ideia é ninguém
-- conversar no grupo: quem quer comprar clica no link e cai no privado (CRM → IA/vendedor).
CREATE TABLE IF NOT EXISTS atend_grupo_posts (
  id TEXT PRIMARY KEY,
  grupo_id TEXT NOT NULL,                        -- id/telefone do grupo (conversa estado='grupo')
  grupo_nome TEXT,
  mensagem TEXT NOT NULL DEFAULT '',
  com_link INTEGER NOT NULL DEFAULT 1,           -- 1 = anexa o link "chamar no privado"
  link_texto TEXT,                               -- texto já preenchido no privado (wa.me ?text=)
  arquivo_url TEXT, arquivo_tipo TEXT, arquivo_nome TEXT, arquivo_ext TEXT,
  quando TEXT,                                   -- datetime UTC do disparo ÚNICO (NULL se recorrente)
  recorrencia TEXT NOT NULL DEFAULT 'nenhuma',   -- nenhuma | diaria | semanal
  dia_semana INTEGER,                            -- 0=domingo .. 6=sábado (recorrência semanal)
  hora TEXT,                                     -- 'HH:MM' (horário de Brasília) da recorrência
  ativo INTEGER NOT NULL DEFAULT 1,
  ultimo_envio_em TEXT,                          -- datetime UTC do último envio (controle de recorrência)
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grupo_posts_ativo ON atend_grupo_posts (ativo, recorrencia);
