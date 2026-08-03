-- WhatsApp da própria empresa (a linha que o sistema usa pra enviar — a "Bia").
-- Serve de TRAVA: no envio de relatórios, o sistema nunca manda pra este número
-- (evita enviar pra si mesmo). É o número fixo 35 3633-0984, em formato Z-API.
INSERT OR IGNORE INTO config (chave, valor) VALUES ('empresa_whatsapp', '553536330984');
