-- CRM Fase 1 (1a/1b): identificação do contato + roteamento por região.
-- Enriquece a conversa do atendimento e dá "carteira de UFs" ao representante.

ALTER TABLE atend_conversas ADD COLUMN origem TEXT;         -- whatsapp | instagram | formulario | catalogo
ALTER TABLE atend_conversas ADD COLUMN tipo TEXT;           -- lojista | consumidor | representante | fornecedor | sem-identificacao
ALTER TABLE atend_conversas ADD COLUMN representante TEXT;  -- representante responsável (nome)
ALTER TABLE atend_conversas ADD COLUMN cliente_id TEXT;     -- vínculo com clientes.id, se reconhecido na base
ALTER TABLE atend_conversas ADD COLUMN contato_nome TEXT;   -- nome do perfil do WhatsApp (senderName)

-- Cobertura de região do representante: UFs que ele atende (CSV, ex.: "MG,SP,GO").
ALTER TABLE representantes ADD COLUMN ufs TEXT;

-- Contato do cliente: WhatsApp já existe (0043); adiciona o link do Instagram.
ALTER TABLE clientes ADD COLUMN instagram TEXT;
ALTER TABLE representantes ADD COLUMN instagram TEXT;

-- Interruptor mestre do atendimento automático (robô responde clientes reais).
-- Começa DESLIGADO: dá pra testar internamente pelo Simulador sem tocar em ninguém.
INSERT OR IGNORE INTO config (chave, valor) VALUES ('atendimento_ativo', '0');
