-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DE STAGING — dados 100% FICTÍCIOS para o ambiente de teste.
-- Rodado SÓ contra o banco de staging (rolagem-de-fase-staging), nunca produção.
-- Usa INSERT OR IGNORE / OR REPLACE em config para ser idempotente.
--
-- Logins de teste:
--   • Admin (painel):        usuario = admin        senha = admin
--   • Vendedor interno:      usuario = vint         senha = admin   (senha interna é texto)
--   • Loja — cliente direto: CNPJ 11.111.111/0001-11   senha = teste123
--   • Loja — cliente de rep: CNPJ 22.222.222/0001-22   senha = teste123
--   • Representante (loja):  e-mail rep@example.test   senha = teste123   (login do rep é por e-mail)
-- (Troque estes dados quando a lista real de usuários/telefones de teste for definida.)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── CONFIG ───────────────────────────────────────────────────────────────────
-- WhatsApp DESLIGADO: garante que NENHUMA mensagem real sai nesta fase (enviarWhatsapp
-- retorna "desligado" em todos os caminhos). Esta é a trava real da simulação de WhatsApp.
INSERT INTO config (chave, valor, atualizado_em) VALUES ('zapi_ativo','0',datetime('now'))
  ON CONFLICT(chave) DO UPDATE SET valor='0', atualizado_em=datetime('now');
INSERT INTO config (chave, valor, atualizado_em) VALUES ('atendimento_ativo','0',datetime('now'))
  ON CONFLICT(chave) DO UPDATE SET valor='0', atualizado_em=datetime('now');
-- A ponte do Syntech NÃO cria clientes aqui (simulação só).
INSERT INTO config (chave, valor, atualizado_em) VALUES ('loja_criar_clientes','0',datetime('now'))
  ON CONFLICT(chave) DO UPDATE SET valor='0', atualizado_em=datetime('now');
-- Catálogo mostra preço de atacado (lojista).
INSERT OR IGNORE INTO config (chave, valor, atualizado_em) VALUES ('catalogo_preco','atacado',datetime('now'));
-- Marcador do ambiente (útil para um banner "STAGING" futuro; nenhum código lê hoje).
INSERT INTO config (chave, valor, atualizado_em) VALUES ('ambiente','staging',datetime('now'))
  ON CONFLICT(chave) DO UPDATE SET valor='staging', atualizado_em=datetime('now');
-- Flags do piloto (ligar/desligar funções). zapi_ativo acima JÁ controla o WhatsApp de
-- verdade. As três abaixo são MARCADORES: para virarem interruptores reais no servidor
-- é preciso uma pequena alteração de código, aprovada à parte (ver STAGING.md).
INSERT OR IGNORE INTO config (chave, valor, atualizado_em) VALUES ('piloto_reservas','1',datetime('now'));
INSERT OR IGNORE INTO config (chave, valor, atualizado_em) VALUES ('piloto_whatsapp','0',datetime('now'));
INSERT OR IGNORE INTO config (chave, valor, atualizado_em) VALUES ('piloto_pcp_popup','1',datetime('now'));
INSERT OR IGNORE INTO config (chave, valor, atualizado_em) VALUES ('piloto_crm_popup','1',datetime('now'));

-- ── USUÁRIOS internos ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO usuarios (id, nome, usuario, senha, admin, paginas, perm_configurado) VALUES
  ('u-admin-stg', 'Administrador (staging)', 'admin', 'admin', 1, '[]', 1),
  ('u-vint',      'Vera (vendedora interna)', 'vint',  'admin', 0, '[]', 1);

-- Permissões do vendedor interno de teste (CRM + PCP + conferência manual).
INSERT OR IGNORE INTO usuario_permissoes (usuario_id, permissao) VALUES
  ('u-vint','vendedor.interno'),
  ('u-vint','pedidos'),
  ('u-vint','pcp.liberar');

-- ── REPRESENTANTE de teste ───────────────────────────────────────────────────
INSERT OR IGNORE INTO representantes (id, nome, whatsapp, email, ativo, codigo_erp, senha_hash) VALUES
  ('r-stg-1', 'Rogério (representante teste)', '5500000000001', 'rep@example.test', 1, 'R01',
   'pbkdf2$100000$uirQpPDT8UN+2FkaBVSM0A==$IE8b+yUR9KCOtm6m12PnbK4Zplj7Vrtf1VQXRJdZ6Qo=');

-- ── CLIENTES de teste ────────────────────────────────────────────────────────
-- senha = teste123 (hash PBKDF2). cnpj em dígitos. loja_status aprovado = pode logar.
INSERT OR IGNORE INTO clientes
  (id, nome, razao_social, cnpj, uf, cidade, whatsapp, email, loja_status, rep_codigo, vendedor_interno, senha_hash)
VALUES
  ('cli-stg-1', 'Loja Teste Direto', 'Loja Teste Direto Ltda', '11111111000111', 'SP', 'São Paulo',
   '5500000000011', 'cli1@example.test', 'aprovado', '', 'u-vint',
   'pbkdf2$100000$E/h/xwcMImmHyMNaYAS+9w==$zTf4m864n3TTXPK91KopaqScCZbaHL93jtpA1MIev68='),
  ('cli-stg-2', 'Loja Teste do Rep', 'Loja Teste do Rep Ltda', '22222222000122', 'RJ', 'Rio de Janeiro',
   '5500000000022', 'cli2@example.test', 'aprovado', 'R01', 'u-vint',
   'pbkdf2$100000$E/h/xwcMImmHyMNaYAS+9w==$zTf4m864n3TTXPK91KopaqScCZbaHL93jtpA1MIev68=');

-- ── CATÁLOGO fictício (erp_produtos) ──────────────────────────────────────────
-- Dois modelos. Letra final do ref = tipo (A=Almofada, C=Capa, P=Peseira/Manta).
-- cores e tamanhos em JSON, com preço de atacado/varejo por tamanho.
INSERT OR IGNORE INTO erp_produtos (ref, nome, unidade, classe, grupo, preco_atacado, preco_varejo, estoque_geral, inativo, cores, tamanhos, atualizado_em) VALUES
  ('9001A', 'ALMOFADA MODELO TESTE A', 'UN', 'TESTE', 'padrao', 39.90, 59.90, 10, 0,
    '[{"numero":1,"nome":"Off-White","hex":"#f3efe6"},{"numero":2,"nome":"Marinho","hex":"#1b2a4a"}]',
    '[{"medida":"45X45","atacado":39.90,"varejo":59.90}]', datetime('now')),
  ('9001C', 'CAPA MODELO TESTE A', 'UN', 'TESTE', 'padrao', 29.90, 44.90, 10, 0,
    '[{"numero":1,"nome":"Off-White","hex":"#f3efe6"},{"numero":2,"nome":"Marinho","hex":"#1b2a4a"}]',
    '[{"medida":"45X45","atacado":29.90,"varejo":44.90}]', datetime('now')),
  ('9002P', 'MANTA MODELO TESTE B', 'UN', 'TESTE', 'padrao', 129.90, 189.90, 5, 0,
    '[{"numero":3,"nome":"Cacau","hex":"#5b3b2e"},{"numero":4,"nome":"Mostarda","hex":"#c99a2e"}]',
    '[{"medida":"1,30X1,70","atacado":129.90,"varejo":189.90}]', datetime('now'));

-- ── ESTOQUE físico espelhado (erp_estoque) ────────────────────────────────────
-- chave = ref|cor|tamanho em minúsculas (igual ao que o POST /estoque grava).
-- Inclui um cenário de ÚLTIMA UNIDADE (saldo=1) para testar concorrência.
INSERT OR IGNORE INTO erp_estoque (chave, produto, ref, cor, tamanho, saldo, unidade, lote, atualizado_em) VALUES
  ('9001a|off-white|45x45', 'ALMOFADA MODELO TESTE A', '9001A', 'Off-White', '45X45', 4, 'UN', 'seed-staging', datetime('now')),
  ('9001a|marinho|45x45',   'ALMOFADA MODELO TESTE A', '9001A', 'Marinho',   '45X45', 1, 'UN', 'seed-staging', datetime('now')),
  ('9001c|off-white|45x45', 'CAPA MODELO TESTE A',     '9001C', 'Off-White', '45X45', 6, 'UN', 'seed-staging', datetime('now')),
  ('9001c|marinho|45x45',   'CAPA MODELO TESTE A',     '9001C', 'Marinho',   '45X45', 2, 'UN', 'seed-staging', datetime('now')),
  ('9002p|cacau|1,30x1,70',    'MANTA MODELO TESTE B', '9002P', 'Cacau',    '1,30X1,70', 5, 'UN', 'seed-staging', datetime('now')),
  ('9002p|mostarda|1,30x1,70', 'MANTA MODELO TESTE B', '9002P', 'Mostarda', '1,30X1,70', 1, 'UN', 'seed-staging', datetime('now'));

-- ── PRAZOS de pagamento (para o checkout da loja oferecer opção) ──────────────
INSERT OR IGNORE INTO erp_prazos (codigo, descricao, atualizado_em) VALUES ('30', '30 dias', datetime('now'));
