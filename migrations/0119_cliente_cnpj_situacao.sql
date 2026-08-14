-- Enriquecimento por CNPJ (rodado aos poucos pelo cron, respeitando o limite dos serviços públicos):
-- guarda a razão social, a situação cadastral (ATIVA/BAIXADA/INAPTA/…) e quando foi a última checagem
-- (pra não consultar o mesmo CNPJ toda hora). Cidade/UF continuam nas colunas próprias já existentes.
ALTER TABLE clientes ADD COLUMN razao_social TEXT;
ALTER TABLE clientes ADD COLUMN cnpj_situacao TEXT;
ALTER TABLE clientes ADD COLUMN cnpj_checado_em TEXT;
