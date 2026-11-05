# Ponte → Sincronizar clientes do Syntech

Objetivo: a ponte lê a tabela **CLIENTES** do Firebird (Syntech) e envia a lista
para o sistema, que **cria** os clientes que faltam e **preenche o telefone/WhatsApp**
dos existentes (sem apagar o que foi digitado à mão). Os criados ganham o selo
**origem = "syntech"** (aparece como `🔗 Syntech` na tela de Clientes).

Isso é **ADICIONAL** ao que a ponte já manda em `/carteira-codigos` (código do cliente
+ representante). A diferença: aqui vão também **nome, telefone, celular, cidade e UF**.

## Endpoint

```
POST  https://rolagem-de-fase.andre-sellmac.workers.dev/api/integracao/clientes-sync
Header:  X-Integracao-Token: <MESMO token já usado em /estoque e /carteira-codigos>
Content-Type: application/json
```

## Corpo (JSON)

Envie em **lotes** (ex.: 300–500 clientes por requisição; repita até acabar):

```json
{
  "clientes": [
    {
      "codigo":  "1234",            // CLIENTES.CODIGO  (código do cliente no Syntech)
      "cnpj":    "37177019000118",  // CLIENTES.CNPJ (ou CPF) — pode vir com pontuação
      "nome":    "LOJA EXEMPLO LTDA",// CLIENTES.RAZAO (razão social / nome)
      "fantasia":"Loja Exemplo",    // CLIENTES.FANTASIA (opcional)
      "fone":    "3133334444",      // CLIENTES.FONE (telefone fixo) — opcional
      "celular": "31988887777",     // CLIENTES.CELULAR (vira o WhatsApp) — opcional
      "cidade":  "Belo Horizonte",  // CLIENTES.CIDADE — opcional
      "uf":      "MG",              // CLIENTES.UF — opcional
      "guia":    "7"                // CLIENTES.GUIA (código do representante) — opcional
    }
  ]
}
```

Campos aceitos (nomes alternativos que o endpoint também entende):
- código do cliente: `codigo` ou `cod`
- nome: `nome` ou `razao`
- telefone fixo: `fone` ou `telefone`
- whatsapp: `celular` ou `whatsapp` (se vazio, usa o `fone`)

Só o **nome** é obrigatório por linha. CNPJ e código ajudam a **casar** com clientes
que já existem (evita duplicar). O resto é opcional.

## O que o sistema faz com cada cliente

1. **Casa** por `codigo` (= `codigo_erp`) ou, se não tiver, por **CNPJ** (dígitos).
2. **Se já existe:** preenche SÓ o que está vazio — `codigo_erp`, `rep_codigo` (guia),
   `whatsapp`, `telefone`. **Nunca sobrescreve** um número já cadastrado à mão.
3. **Se não existe:** **cria** o cliente com `origem = "syntech"`.
4. **Ignora** nomes internos (ESTOQUE, BIG TRICOT, REPOSIÇÃO, CONSOLIDADA…).
5. **Nunca apaga** ninguém. Pode rodar quantas vezes quiser (idempotente).

## Resposta

```json
{
  "ok": true,
  "recebidos": 500,
  "criados": 120,          // novos clientes criados (origem=syntech)
  "atualizados": 80,       // existentes que ganharam telefone/código
  "casados": 380,          // bateram com um cliente que já existia
  "pulados": 0,            // nomes internos ignorados
  "clientes_do_syntech": 120
}
```

## Frequência sugerida

Clientes mudam pouco — **1x por dia** já resolve (ou junto de uma das sincronizações
de estoque). Não precisa ser a cada 2 minutos como o estoque.

## Consulta Firebird (exemplo — ajuste os nomes das colunas ao seu schema)

```sql
SELECT CODIGO, CNPJ, RAZAO, FANTASIA, FONE, CELULAR, CIDADE, UF, GUIA
FROM   CLIENTES
WHERE  COALESCE(INATIVO, 'N') <> 'S'   -- só ativos, se houver essa coluna
```

Monte o JSON acima a partir dessas linhas e faça o POST em lotes.
