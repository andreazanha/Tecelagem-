# Integração Syntech — referência técnica (pedidos, clientes, produtos, fotos)

Resumo das procedures/consultas do Syntech (Firebird 2.5) usadas pela ponte.
Fonte: manuais "Integração Produtos e Pedidos" e "Integração Clientes e Comunicação".

## Gravar PEDIDO no ERP (site → ERP) — 3 procedures, NESTA ORDEM

### 1) Cabeçalho — `APP_PEDIDO_INSERT_V2` (retorna NUMERO inteiro)
Chamar com `EXECUTE BLOCK` pra já receber o número:
```sql
execute block returns (vnumero int) as begin
  select numero from app_pedido_insert_v2(
    :DATA, :VALOR, :DATA_ENTR, :COD_CLI, :OBS_PED, :COD_PRAZO, :OPCAO_PRECO,
    :GUIA, :FRETE, :COD_DIG, :COD_VEND, :COD_TRANSP, :FORMA_PAGTO, :DATA_ALT_REG,
    :IMEI, :CLASSIF_PED, :DESCONTO, :VALOR_FRETE, :NOME_APP
  ) into vnumero;
  suspend;
end
```
Parâmetros (ordem exata, todos VARCHAR(25) salvo indicado):
| # | Campo | Observação |
|---|-------|-----------|
| 1 | DATA | vazio = data de hoje. **Formato MM/DD/YYYY** (ex.: `08/13/2020`) |
| 2 | VALOR | valor do pedido |
| 3 | DATA_ENTR | data de entrega (MM/DD/YYYY) |
| 4 | COD_CLI | **código do cliente** (do `app_clientes_search`/`insert`) |
| 5 | OBS_PED | VARCHAR(500) — observação |
| 6 | COD_PRAZO | aceita vazio |
| 7 | OPCAO_PRECO | `A` atacado, `V` varejo |
| 8 | GUIA | vazio |
| 9 | FRETE | 0-Emitente,1-Destinatário,2-Terceiro,3-Prop.Rem.,4-Prop.Dest.,9-Sem frete |
| 10 | COD_DIG | digitador — vazio |
| 11 | COD_VEND | vendedor — vazio (ou o código do representante) |
| 12 | COD_TRANSP | vazio |
| 13 | FORMA_PAGTO | 1-Dinheiro,2-Cheque,3-Cartão,6-Depósito,8-Boleto |
| 14 | DATA_ALT_REG | vazio |
| 15 | IMEI | VARCHAR(100) — **enviar nulo obrigatoriamente** (conflito com apps) |
| 16 | CLASSIF_PED | |
| 17 | DESCONTO | 0 se não houver |
| 18 | VALOR_FRETE | valor do frete se houver |
| 19 | NOME_APP | VARCHAR(50) — origem (ex.: `Web`) |

Exemplo do manual:
```sql
app_pedido_insert_v2('','493','08/13/2020','1025','ENTREGA: Observ.entrega',
  '','','','2','','','','','','','','0','15','Web')
```

### 2) Itens — `APP_ITENS_PEDIDO_INSERT` (chave: numero, cod_prod, tamanho)
Parâmetros: `NUMERO, COD_PROD, TAMANHO, AUTOINC_TAM, QUANT_PED, PRECO, OBS(VARCHAR200)`
`AUTOINC_TAM` pode ser 0.
```sql
EXECUTE PROCEDURE app_itens_pedido_insert(1,'190007','P','2','1','178','');
```

### 3) Cores dos itens — `APP_CORES_PEDIDO_INSERT` (chave: numero, cod_prod, tamanho, cor)
Parâmetros: `NUMERO, COD_PROD, COD_COR, TAMANHO, AUTOINC_TAM, QUANT`
```sql
EXECUTE PROCEDURE app_cores_pedido_insert(1,'190007','1000056','P','2','1');
```

## CLIENTES (necessário antes do pedido)

### Procurar por CNPJ/CPF — `APP_CLIENTES_SEARCH`
Entrada: `CNPJ_CPF_PESQUISA VARCHAR(18)` (pontuado: `xxx.xxx.xxx-xx` ou `xx.xxx.xxx/xxxx-xx`).
```sql
SELECT * FROM app_clientes_search('123.123.123-87');
```
Saídas (principais): CODIGO(int), NOME, FANTASIA, CNPJ_CPF, INSC_RG, ENDERECO, NUMERO(int),
COMPL, BAIRRO, CEP, CIDADE, UF, EMAIL, DATA_NASC, TELEFONE, **CELULAR**, SIMPLES_NACIONAL,
FUNC_CADASTRO(int), MALA_DIRETA, COD_PRAZO, COD_TRANSP, GUIA, FORMA, OPCAO_PRECO,
DATA_ALT_REG, DATA_CAD. (Vazio = cliente não existe → inserir.)

### Incluir — `APP_CLIENTES_INSERT_V2` (retorna CODIGO int)
Parâmetros (ordem exata, 21):
`NOME, FANTASIA, CNPJ_CPF, INSC_RG, ENDERECO, NUMERO, COMPL, BAIRRO, CEP, CIDADE, UF, EMAIL, DATA_NASC, TELEFONE, CELULAR, SIMPLES_NACIONAL, FUNC_CADASTRO, MALA_DIRETA, COD_PRAZO, GUIA, IMEI`
```sql
SELECT codigo FROM app_clientes_insert_v2('SIRLENE CRISTINA','TESTE','123.123.123-87','321321321',
  'RUA TREZE DE MAIO','128','','CENTRO','37590-000','JACUTINGA','MG','sirlene@...','11.02.1980',
  '(35) 3443-325','','','1','S','1','','');
```
- Obrigatórios: NOME, FANTASIA, CIDADE, UF, FUNC_CADASTRO, MALA_DIRETA.
- CNPJ_CPF pontuado. NUMERO inteiro (sem número = 0, resto no COMPL). CEP `xxxxx-xxx`.
  DATA_NASC `dd.mm.aaaa`. SIMPLES_NACIONAL: `S`/`M`/`''`. MALA_DIRETA: `S`/`N`.
  COD_PRAZO `1` = à vista. GUIA `''`. **IMEI nulo obrigatoriamente**.
- FUNC_CADASTRO = código fixo do funcionário "do site" (**pedir ao Syntech**).

### Alterar — `APP_CLIENTES_UPDATE` (cuidado: insere se não existir)
Parâmetros (21): `CODIGO, NOME, FANTASIA, CNPJ_CPF, INSC_RG, ENDERECO, NUMERO, COMPL, BAIRRO, CEP, CIDADE, UF, EMAIL, DATA_NASC, TELEFONE, CELULAR, SIMPLES_NACIONAL, FUNC_CADASTRO, MALA_DIRETA, COD_PRAZO, GUIA`
```sql
EXECUTE PROCEDURE APP_CLIENTES_UPDATE(91000791,'SIRLENE CRISTINA','TESTE',...);
```

### Endereço de entrega/cobrança (direto na tabela CLIENTES)
As SPs não mexem nesses campos; se precisar, pedir privilégio de UPDATE e filtrar por CODIGO ou CNPJ_CPF:
- Cobrança: ENDERECO_COB, BAIRRO_COB, CEP_COB, UF_COB, CIDADE_COB, COMPLEMENTO_COB
- Entrega: ENDERECO_ENTR, BAIRRO_ENTR, CEP_ENTR, UF_ENTR, CIDADE_ENTR, COMPLEMENTO_ENTR

### Comunicação
Firebird Client nativo (PHP `ibase_*`) é o recomendado — é o que a ponte (node-firebird) usa.
Há também um módulo REST (2ª opção) com `server_config.php` e funções `faz_select`/`faz_execute`.

## LER do ERP (ERP → nós)
- **Pedidos aprovados**: `PEDIDO` onde `STATUS=10` e `CANC<>'S'`, incremental por `DATA_ALT_REG`. Itens por cor/tamanho em `CORES_PEDIDO.QUANT` (pular `ITENS_PEDIDO.BAIXADO='B'`).
- **Produtos**: SELECT com CODIGO, NOME, UNIDADE, preços (atacado/varejo + promoção), CLASSIFICACAO, GRUPO, DATA_ALT_REG, ESTOQUE_GERAL. Cores: `CORES` (tem COR_HTML). Tamanhos: `TAMANHO_PROD(COD_PROD,TAMANHO)`. Cores por produto: `CORES_PROD`.
- **Estoque por cor/tamanho**: `ESTOQUE_DETALHADO`. (Há consulta de disponível descontando empenho.)
- **Vendedores**: tabela `VENDEDORES` (confirmar campos código/nome; PEDIDO liga por COD_VEND).
- `DATA_ALT_REG` do produto muda em qualquer alteração, inclusive estoque → polling incremental.

## FOTOS (HTTPS público)
Base: `https://bigtricot.syntechsistemas.com`
- Principal: `<base>/<CLASSE>/<CODIGO>.jpg` (ex.: `.../PESEIRAS%20E%20MANTAS/8019P.jpg`)
- Por cor/tamanho: `<base>/<CLASSE>/<COD>_<TAM>_<COR>_<NUM>.jpg`
(CLASSE = `CLASS_PROD.DESCRICAO`). Carregar direto no front.
