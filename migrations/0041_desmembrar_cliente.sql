-- Desmembramento de OP consolidada com NOME DO CLIENTE por card.
-- Cada item guarda o cliente de origem (o pedido de onde ele veio, antes de juntar
-- vários pedidos numa OP só). Ao desmembrar, cada card recebe o cliente da sua OP.
ALTER TABLE pedido_itens ADD COLUMN origem_cliente TEXT;
-- Override de cliente no card de produção (usado nos cards desmembrados; quando
-- vazio, o card mostra o cliente do pedido).
ALTER TABLE producao ADD COLUMN cliente TEXT;
