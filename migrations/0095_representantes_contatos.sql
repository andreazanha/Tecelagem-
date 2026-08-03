-- Contatos dos representantes (WhatsApp + e-mail), importados da lista do gestor.
-- WhatsApp no formato Z-API (só dígitos, com DDI 55). Números que vieram com 8 dígitos
-- (sem o 9º dígito) foram normalizados com o 9 na frente — CONFERIR antes do 1º envio.
-- Casa por nome (case-insensitive). Idempotente o suficiente pra reaplicar.

UPDATE representantes SET whatsapp='5555996477110', email='aline-canani@hotmail.com'            WHERE lower(nome)=lower('Aline Viecinski');           -- ⚠ era (5555) 9647-7110
UPDATE representantes SET whatsapp='5561998718545', email='andersonrodriguesrep@gmail.com'       WHERE lower(nome)=lower('Anderson Rodrigues');        -- ⚠ era (61) 9871-8545
UPDATE representantes SET whatsapp='5519996217167', email='administrativo@bigtricot.com'         WHERE lower(nome)=lower('André Azanha');
UPDATE representantes SET whatsapp='5555996448333', email='akrepresentacoes@outlook.com'         WHERE lower(nome)=lower('Augusto Kauling');           -- ⚠ era (5555) 9644-8333
UPDATE representantes SET whatsapp='5511981082605', email='daisygm.rep@gmail.com'                WHERE lower(nome)=lower('Daisy Gomes Medeiros');
UPDATE representantes SET whatsapp='5562993275804', email='confexrepresentacao@gmail.com'        WHERE lower(nome)=lower('Eduardo Vaz');               -- ⚠ era (62) 9327-5804
UPDATE representantes SET whatsapp='5519981168486', email='evertonreato@gmail.com'               WHERE lower(nome)=lower('Everton Reato');
UPDATE representantes SET whatsapp='5548988052077', email='francielitrevisan@gmail.com'          WHERE lower(nome)=lower('Francieli Trevisan');
UPDATE representantes SET whatsapp='5527998915170', email='rep.oliveira@hotmail.com'             WHERE lower(nome)=lower('Jeferson Oliveira');
UPDATE representantes SET whatsapp='5534999399163', email='freitas.gomes1993@gmail.com'          WHERE lower(nome)=lower('João Fernando de Freitas Gomes'); -- ⚠ era (34) 9939-9163
UPDATE representantes SET whatsapp='5583999070026', email='mokahe2019@gmail.com'                 WHERE lower(nome)=lower('Kátia Castilho');
UPDATE representantes SET whatsapp='5571997161937', email='contato.ferreirabahia@gmail.com'      WHERE lower(nome)=lower('Luciano Augusto Teixeira Ferreira'); -- inativo
UPDATE representantes SET whatsapp='5551985994982', email='martha@fernersul.com.br'              WHERE lower(nome)=lower('Martha Vellinho');
UPDATE representantes SET whatsapp='5571996002611', email='priscilarepresentacoes@outlook.com'   WHERE lower(nome)=lower('Priscila Seraphim');         -- ⚠ era (71) 9600-2611
UPDATE representantes SET whatsapp='5519971330885', email='raffinato.representacoes@hotmail.com' WHERE lower(nome)=lower('Rafael Castaneli');
UPDATE representantes SET whatsapp='5519983238373', email='renanhortense@gmail.com'              WHERE lower(nome)=lower('Renan Folster Hortense');
UPDATE representantes SET whatsapp='5532999696277', email='th3.representacao@gmail.com'           WHERE lower(nome)=lower('Thiago Leocadio da Silva');  -- ⚠ era (32) 9969-6277
UPDATE representantes SET whatsapp='5531991180113', email='tuliomsoliveira@gmail.com'            WHERE lower(nome)=lower('Tulio Marcos Saez Oliveira'); -- ⚠ era (31) 9118-0113
UPDATE representantes SET whatsapp='5514991241886', email='diasecristorepre@gmail.com'           WHERE lower(nome)=lower('Valter Dias Gomes');
-- Pedro Henrique (3536330984, parece fixo) e Vendedor Interno: NÃO cadastrados — aguardando confirmação.
