# Ponte Syntech → Tecelagem

Programa que roda **no PC da fábrica** (que fica ligado), lê os **pedidos aprovados**
no ERP Syntech (banco Firebird) e envia pro sistema da Tecelagem, onde eles caem na
tela de **conferência** (PCP) pra aprovar/explodir.

> ⚠️ Esta parte é pra quem cuida de **TI / informática**. A senha do banco e o token
> ficam **só neste PC**, no arquivo `config.json` (que nunca vai pro GitHub).

## O que ele faz
- A cada 2 minutos (ajustável), busca em `PEDIDO` os pedidos com **STATUS = 10 (Aprovado)**,
  que **não** estão cancelados (`CANC <> 'S'`) e que **mudaram** desde a última vez
  (campo `DATA_ALT_REG`).
- Pra cada pedido, lê os itens (produto, cor, tamanho, quantidade), **pulando** os itens
  baixados (`ITENS_PEDIDO.BAIXADO = 'B'`), e envia pro sistema.
- Guarda a última data processada em `state.json`, então **não reprocessa** o que já mandou.
- É **idempotente**: se mandar o mesmo pedido de novo, o sistema reconhece e não duplica.

## Instalação (uma vez)
1. Instale o **Node.js 18 ou mais novo** no PC: https://nodejs.org (versão LTS).
2. Copie esta pasta `bridge/` pro PC da fábrica (ex.: `C:\tecelagem-bridge`).
3. Abra o **Prompt de Comando** nessa pasta e rode:
   ```
   npm install
   ```
4. Copie `config.example.json` para `config.json` e preencha:
   - **firebird.database**: caminho do banco (ex.: `C:\Textil\Empresas\FABRICA.MDB`).
     Se a ponte rodar no mesmo servidor do Firebird, `host` pode ficar `127.0.0.1`.
   - **firebird.user / firebird.password**: usuário e senha do Firebird (os que o
     Syntech te passou).
   - **api.token**: o mesmo valor do segredo **INTEGRACAO_TOKEN** configurado no sistema.
   - **api.base**: já vem com a URL do sistema; só troque se mudar.
   - **desde**: data inicial (só na 1ª vez) — pedidos aprovados a partir dessa data.

## Testar
Rode uma vez e veja o resultado:
```
npm run once
```
Deve listar os pedidos aprovados e dizer "enviado ✓" pra cada um. No sistema, eles
aparecem em **PCP › conferência de pedidos do ERP**.

## Deixar rodando sozinho
Opção simples — **Agendador de Tarefas do Windows**:
- Ação: `node.exe C:\tecelagem-bridge\sync.js --once`
- Disparador: repetir a cada 5 minutos.

Opção robusta — rodar como **serviço** (fica sempre ligado): use o
[NSSM](https://nssm.cc/) apontando pra `node.exe sync.js` (sem `--once`); aí ele
mesmo repete a cada `intervaloSegundos`.

## Observações / ajustes finos
- **Tamanho (medida real):** a ponte tenta pegar `TAMANHO_PROD.DETALHE` (ex.: 45X45).
  Se o nome da coluna de ligação nessa base for diferente, ela cai automaticamente no
  código do tamanho — e o join pode ser ajustado em `sync.js` (procure por `TAMANHO_PROD`).
- **Cliente:** hoje envia só o **nome**. Se quiser mandar CNPJ/cidade/UF (pra separar por
  loja no corte), dá pra incluir — é só dizer os nomes desses campos na tabela `CLIENTES`.
- **Status:** o gatilho é `STATUS = 10 (Aprovado)`. Pra mudar, altere `statusAprovado`
  no `config.json`.

## Estoque de produtos (opcional)
A ponte também pode **espelhar o saldo** dos produtos pro sistema (só leitura — o ERP
continua sendo a fonte da verdade). Fica **desligado** até você preencher a consulta.

No `config.json`, em `estoque.sql`, coloque um SELECT que devolva estas colunas:
`PRODUTO, REF, COR, TAMANHO, SALDO, UNIDADE`. Peça pro Syntech te dizer qual tabela
guarda o saldo (por produto, ou por produto+cor+tamanho). Exemplo genérico:
```sql
SELECT PR.NOME AS PRODUTO, E.COD_PROD AS REF, CR.NOME AS COR,
       E.TAMANHO AS TAMANHO, E.SALDO AS SALDO, 'un' AS UNIDADE
  FROM ESTOQUE E
  INNER JOIN PRODUTOS PR ON PR.CODIGO = E.COD_PROD
  LEFT JOIN CORES CR ON CR.NUMERO = E.COD_COR
```
Com isso preenchido, a cada rodada a ponte envia o saldo e ele aparece no sistema.
