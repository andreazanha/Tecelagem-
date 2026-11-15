-- Escolha de ENVIO da pronta entrega (junto/separado) feita na APROVAÇÃO/EXPLOSÃO,
-- por PEDIDO DE ORIGEM: JSON { "<numero_do_pedido>": "junto" | "separado" }.
-- Usada na geração dos PDFs (buildPEJobs/buildRevisaoPEJobs) e onde os cards nascem.
-- `entrega_pe` (já existente) continua sendo o padrão geral do pedido.
ALTER TABLE pedidos ADD COLUMN entregas_pe TEXT;
