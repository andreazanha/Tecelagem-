-- Expedição → Fiscal → Transporte: uma linha por PEDIDO (não por parte).
-- O pedido chega aqui quando suas partes saem da Revisão para o setor 'expedicao'.
-- A partir daí o pedido caminha por fases: expedicao → fiscal → transporte.
CREATE TABLE IF NOT EXISTS expedicao (
  pedido_id      TEXT PRIMARY KEY,
  fase           TEXT NOT NULL DEFAULT 'expedicao',  -- expedicao | fiscal | transporte
  status         TEXT NOT NULL DEFAULT 'aguardando', -- expedicao: aguardando|expedindo · fiscal: aguardando|cotando · transporte: aguardando|enviado
  volumes        TEXT,            -- JSON: [{tipo,altura,largura,comprimento,peso}]
  nf_numero      TEXT,
  frete          TEXT,
  transportadora TEXT,            -- braspress | translovato | jadlog | correios | envio-proprio | cliente-retirou
  entrou_em      TEXT NOT NULL DEFAULT (datetime('now')), -- quando entrou na fase/coluna atual (retenção 15d no Transporte)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expedicao_fase ON expedicao(fase, status);
