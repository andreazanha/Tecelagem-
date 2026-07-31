-- Seed: 21 representantes (relatório importado em 31/07/2026).
-- Idempotente: só insere quem ainda não existe (casa por nome).
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-aline-viecinski', 'Aline Viecinski', 1, 'RS', 'Anta Gorda, Arvorezinha, Carazinho, Casca, Constantina, Erechim, Frederico Westphalen, Getúlio Vargas, Guaporé, Horizontina, Humaitá, Ibiaçá, Ibiraiaras, Ijuí, Lagoa Vermelha, Marau, Nova Alvorada, Nova Araçá, Palmeira das Missões, Panambi, Paraí, Passo Fundo, Porto Xavier, Sananduva, Santa Rosa, Santo Ângelo, São Domingos do Sul, São Miguel das Missões, Sarandi, Seberi, Serafina Corrêa, Soledade, Tapejara, Três de Maio, Três Passos, Vacaria, Vila Maria, Não-me-toque, Encantado', 8.0, 'Região: Sul'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Aline Viecinski'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-anderson-rodrigues', 'Anderson Rodrigues', 1, 'DF,GO', NULL, 8.0, 'Região: Distrito Federal'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Anderson Rodrigues'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-andre-azanha', 'André Azanha', 1, 'SP', NULL, 3.0, 'Região: Geral'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('André Azanha'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-augusto-kauling', 'Augusto Kauling', 1, 'RS', 'Santa Maria, Xangri-la, Candelaria, Lajeado, Osório, Santiago, Torres, Alegrete, Bagé, Bento Gonçalves, Caçavapa do Sul, Garibaldi, Imbé, Itaqui, Pelotas, Santana do Livramento, São Jeronimo, Uruguaiana, Amaral Ferrador, Arroio do Sal, Arroio do Tigre, Arroio dos Ratos, Arroio Grande, Bom Retiro do Sul, Butiá, Cachoeira do Sul, Camaqua, Capão da Canoa, Charquadas, Chuí, Cristal, Dom Feliciano, Dom Pedrito, Estrela, Hulha Negra, Jaguarão, Lavras, Mato Leitão, Minas do Leão, Morrinhos do Sul, Passo do Sobrado, Pedro Osório, Pinheiro Machado, Quarai, Rio Grande, Rio Pardo, Rosário do Sul, Santa Cruz do Sul, Santa Vitória do Palmar, Santo Antonio da Patrulha, São Borja, São José do Norte, São Lourenço do Sul, São Sepe, Sinimbu, Sobradinho, Tapes, Terra de Areia, Teutonia, Tramandai, Três Cachoeiras, Vale do Sol, Vale Verde, Venâncio Aires', 8.0, 'Região: Sul'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Augusto Kauling'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-daisy-gomes-medeiros', 'Daisy Gomes Medeiros', 1, 'SP', NULL, 8.0, 'Região: Grande São Paulo'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Daisy Gomes Medeiros'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-eduardo-vaz', 'Eduardo Vaz', 1, 'GO', 'Goiânia, Aparecida de Goiânia, Anápolis, Rio Verde, Itubiara, Caldas Novas, Catalão, Jataí, Formosa, Luziâna, Valparaíso de Goiás, Trindade, Senador Canedo, Iporá, Mineiros, Quirinópolis, Inhumas, Morrinhos, Ipameri, Porangatu, Uruaçu, Ceres, Itaberaí, Goianésia, Jaguará, Pires do Rio, Palmeiras do Rio, Palmeiras de Goiás, Bela Vista de Goiás, Silvânia, Pirenópolis, Novo Gama, Águas Lindas de Goias, Santo Ântonio do Descoberto, Cristalina, Alexânia, Goiás, Anicuns, Aragarças, Barro Alto, Bom Jesus de Goiás, Buriti Alegre, Caiapônia, Campo Alegre de Goiás, Campos Belos, Chapadão do Céu, Cidade Ocidental, Corumbá de Goiás, Crixás, Edéia, Faina, Firminópolis, Formoso, Goiatuba, Guapó, Hidrolândia, Indiara, Itapirapuã, Itarumã, Jandaia, Joviânia, Leopoldo de Bulhões, Mara Rosa, Minaçu, Montividiu, Mozarlândia, Nerópolis, Niquelândia, Nova Veneza, Orizona, Ouvidor, Padre Bernardo, Palmelo, Panamá, Paraúna, Petrolina de Goiás, Planaltina de Goiás, Pontalina, Porteirão, Portelândia, Professor Jamil, Rialma, Rianápolis, Rio Quente, Rubiataba, Santa Helena de Goiás, Santa Rita do Araguaia, São Luiz de Montes Belos, São Miguel do Araguia, São Simão, Serranópolis, Taquaral de Goiás, Turvelândia, Urutaí, Varjão, Vianópolis, Vicentinópolis, Vila Propício, Cumari, Três Ranchos', 8.0, 'Região: Centro Oeste'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Eduardo Vaz'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-everton-reato', 'Everton Reato', 1, 'SP', 'Americana, Santa Barbara d''Oeste, Nova Odessa, Sumaré, Limeira, Paulínia, Piracicaba, Araras, Leme, Descalvado, Cosmópolis, Cordeirópolis, Artur Nogueira, Conchal, Mogi Mirim, Porto Ferreira, Águas de São Pedro, São Pedro, Pedreira, Holambra, Jaguariúna, Araraquara, São Carlos, Catanduva, São José do Rio Preto, Votuporanga, Jales, Fernandópolis, Mirassol', 8.0, 'Região: Interior de São Paulo'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Everton Reato'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-francieli-trevisan', 'Francieli Trevisan', 1, 'PR,SC', NULL, 10.0, 'Região: Sul'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Francieli Trevisan'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-jeferson-oliveira', 'Jeferson Oliveira', 1, 'RJ,MG,ES', NULL, 10.0, 'Região: Sudeste'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Jeferson Oliveira'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-joao-fernando-de-freitas-gomes', 'João Fernando de Freitas Gomes', 1, 'MG', 'Alfenas, Alpinópolis, Araguari, Arapuá, Araxá, Arceburgo, Arcos, Bambuí, Boa Esperança, Bom Despacho, Buritis, Caldas Novas, Campo Belo, Campos Alto, Capitólio, Carmo do Paraíba, Cássia, Centralina, Coromandel, Divinópolis, Extrema, Formiga, Frutal, Ibiá, Ibiraci, Ipatinga, Itatinga, Itajubá, Itaú de Minas, Ituiutaba, João Pinheiro, Juiz de Fora, Lavras, Luz, Matutina, Monte Carmelo, Muzambinho, Nova Serrana, Oliveira, Pains, Pará de Minas, Paracatu, Passos, Patos de Minas, Patrocínio, Perdizes, Pimenta, Pirapora, Piumhi, Pouso Alegre, Prata, Presidente Olegário, Sacramento, Santo Antônio do Monte, São Gotardo, São Sebastião do Paraíso, Tiros, Três Marias, Tupaciguara, Ubá, Uberaba, Uberlândia, Unaí, Varjão de Minas, Vazante', 8.0, 'Região: Sudeste'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('João Fernando de Freitas Gomes'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-katia-castilho', 'Kátia Castilho', 1, 'PB', NULL, 8.0, 'Região: Nordeste'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Kátia Castilho'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-luciano-augusto-teixeira-ferreira', 'Luciano Augusto Teixeira Ferreira', 0, 'BA', NULL, 7.0, 'Região: Nordeste'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Luciano Augusto Teixeira Ferreira'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-martha-vellinho', 'Martha Vellinho', 1, 'RS', 'Porto Alegre, Caxias do Sul, Gravataí, Novo Hamburgo, Antônio Prado, Canela, Cruz Alta, São Gabriel, Alvorada, Arroio do Meio, Campo Bom, Canoas, Dois Irmãos, Estância Velha, Esteio, Ivoti, Monte Negro', 10.0, 'Região: Sul'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Martha Vellinho'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-pedro-henrique', 'Pedro Henrique', 1, NULL, NULL, 1.0, 'Região: Geral'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Pedro Henrique'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-priscila-seraphim', 'Priscila Seraphim', 1, 'BA', NULL, 8.0, 'Região: Nordeste'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Priscila Seraphim'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-rafael-castaneli', 'Rafael Castaneli', 1, 'SP', 'Avaré, Hortolândia, Santa Bárbara do Oeste, Jundiaí, Itapetininga, Santa Cruz do Rio Pardo', 8.0, 'Região: Interior de São Paulo'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Rafael Castaneli'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-renan-folster-hortense', 'Renan Folster Hortense', 1, 'SP', 'Americana, Santa Bárbara d''Oeste, Limeira, Rio Claro, Araras, Leme, Pirassununga, Porto Ferreira, Santa Cruz das Palmeiras, Casa Branca, Mococa, Mogi Guaçu, Mogi Mirim, Holambra, Artur Nogueira, Jaguariuna, Pedreira, Amparo, Serra Negra, Paulínia, Sumaré, Campinas, Valinhos, Vinhedo, Jundiaí, Cabreúva, Itu, Salto, Indaiatuba, Sorocaba, Araçoiaba da Serra, Capela do Alto, Tatuí, Boituva, Porto Feliz, Tietê, Capivari, Itapetininga, Buri, Itapeva, Itararé, Jaguariaíva, Piracicaba, São Pedro, Brotas, Barra Bonita, Jaú, Bariri, Ibitinga, Itápolis, Borborema, Catanduva, Araraquara, São Carlos', 10.0, 'Região: Interior de São Paulo'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Renan Folster Hortense'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-thiago-leocadio-da-silva', 'Thiago Leocadio da Silva', 1, 'MG,BA', 'Manhuaçu, Caratinga, Valadares, Teófilo Otoni, Ipatinga, Santa Efigênia de Minas, Montes Claros, Diamantina, Janaúba', 8.0, 'Região: Sul da Bahia - Sudeste'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Thiago Leocadio da Silva'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-tulio-marcos-saez-oliveira', 'Tulio Marcos Saez Oliveira', 1, 'MG', 'Belo Horizonte, Contagem, Betim, Nova Lima, Ribeirão das Neves, Santa Luzia, Ibirité, Sabará, Vespasiano, Lagoa Santa, Pedro Leopoldo, Brumadinho, Caeté, Matozinhos, Itaguara, Igarapé, Divinópolis, Itaúna, Formiga, Oliveira, Lagoa da Prata, Nova Serrana, Carmo do Cajuru, Bom Despacho, Vale do Aço, Ipatinga, Coronel Fabriciano, Timóteo, João Monlevade, Santa Bárbara, Barão de Cocais, São Gonçalo do Rio Abaixo, Itabira', 8.0, 'Região: Sudeste'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Tulio Marcos Saez Oliveira'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-valter-dias-gomes', 'Valter Dias Gomes', 1, 'SP', 'Agudos, Pederneiras, Macatuba, Lençois Paulista, Barra Bonita, Igaraçu do Tiete, Jaú, São Manoel, Botucatu, Brotas, Dois Corregos, Matão, Jaboticabal, Guariba, Monte Alto, Taquaritinga, Ibitinga, Borborema, Itápolis, Tabatinga, Novo Horizonte, Bariri, Iacanga', 8.0, 'Região: Interior de São Paulo'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Valter Dias Gomes'));
INSERT INTO representantes (id, nome, ativo, ufs, cidades, comissao, observacao)
SELECT 'rep-vendedor-interno', 'Vendedor Interno', 0, NULL, NULL, 1.0, 'Região: Geral'
WHERE NOT EXISTS (SELECT 1 FROM representantes WHERE lower(nome) = lower('Vendedor Interno'));
