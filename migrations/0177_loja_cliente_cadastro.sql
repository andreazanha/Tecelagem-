-- Cadastro de CLIENTE NOVO pela loja (Fase S) + sincronização dos PRAZOS do Syntech.
-- A loja recebe o cadastro da loja nova (status 'pendente'); o gestor aprova (define
-- região + prazo); a ponte cria no Syntech via APP_CLIENTES_INSERT_V2 e grava o código.

-- Campos do cadastro (os que o Syntech pede no APP_CLIENTES_INSERT_V2).
ALTER TABLE clientes ADD COLUMN fantasia TEXT;
ALTER TABLE clientes ADD COLUMN endereco TEXT;
ALTER TABLE clientes ADD COLUMN numero TEXT;
ALTER TABLE clientes ADD COLUMN complemento TEXT;
ALTER TABLE clientes ADD COLUMN bairro TEXT;
ALTER TABLE clientes ADD COLUMN cep TEXT;
ALTER TABLE clientes ADD COLUMN inscricao_estadual TEXT;   -- INSC_RG
ALTER TABLE clientes ADD COLUMN telefone TEXT;
ALTER TABLE clientes ADD COLUMN simples_nacional TEXT;     -- 'S' | 'M' | '' (presumido/real)

-- Fluxo de aprovação da loja.
ALTER TABLE clientes ADD COLUMN origem TEXT;               -- 'loja' quando veio do cadastro online
ALTER TABLE clientes ADD COLUMN loja_status TEXT;          -- 'pendente' | 'aprovado' | 'recusado'
ALTER TABLE clientes ADD COLUMN loja_cod_prazo TEXT;       -- COD_PRAZO escolhido na aprovação
ALTER TABLE clientes ADD COLUMN loja_criar_erp INTEGER DEFAULT 0;  -- 1 = liberado pra ponte criar no Syntech
ALTER TABLE clientes ADD COLUMN loja_cadastro_em TEXT;

-- PRAZOS do Syntech (tabela PRAZO: CODIGO + DESCRICAO), espelhados pela ponte.
CREATE TABLE IF NOT EXISTS erp_prazos (
  codigo      TEXT PRIMARY KEY,
  descricao   TEXT,
  atualizado_em TEXT
);
