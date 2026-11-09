-- Histórico diário do saldo do Syntech (espelho erp_estoque é sobrescrito a cada sync,
-- então não guarda passado). Esta tabela tira uma "foto" do saldo por SKU a cada fim de
-- rodada (um registro por dia, o último do dia vence). É o combustível da PREVISÃO DE
-- RUPTURA (velocidade de consumo = quanto o saldo cai por dia). Só leitura na UI.
CREATE TABLE IF NOT EXISTS erp_estoque_hist (
  dia           TEXT NOT NULL,              -- 'YYYY-MM-DD' (dia do Brasil, UTC-3)
  chave         TEXT NOT NULL,              -- ref|cor|tamanho (minúsculo) = erp_estoque.chave
  ref           TEXT,
  cor           TEXT,
  tamanho       TEXT,
  produto       TEXT,
  saldo         REAL NOT NULL DEFAULT 0,    -- saldo no fim do dia (já líquido do empenho do ERP)
  atualizado_em TEXT,
  PRIMARY KEY (dia, chave)
);
CREATE INDEX IF NOT EXISTS idx_estoque_hist_chave ON erp_estoque_hist(chave);
CREATE INDEX IF NOT EXISTS idx_estoque_hist_ref   ON erp_estoque_hist(ref);
CREATE INDEX IF NOT EXISTS idx_estoque_hist_dia   ON erp_estoque_hist(dia);
