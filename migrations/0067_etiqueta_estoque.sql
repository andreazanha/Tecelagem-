-- Estoque das ETIQUETAS DE COLAR, por produto + tamanho + cor (cada etiqueta é
-- única dessa combinação). Entrada quando a gráfica entrega; baixa automática
-- quando entra pedido (1 por peça). A presença da linha = "esse produto usa
-- etiqueta nessa combinação". Aditivo/idempotente.
CREATE TABLE IF NOT EXISTS etiqueta_estoque (
  produto  TEXT NOT NULL,
  tamanho  TEXT NOT NULL,
  cor      TEXT NOT NULL,
  saldo    REAL NOT NULL DEFAULT 0,
  minimo   REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (produto, tamanho, cor)
);
