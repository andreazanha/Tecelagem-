# Integração com o Catálogo Big Tricot (o CRM só LÊ)

Documento de referência da integração entre o **Catálogo** (projeto separado,
Cloudflare + Firebase) e este **CRM**. O CRM **apenas lê** essas fontes — não
escreve nada nelas. Tudo é 100% via dois endpoints na nuvem (nenhum arquivo local
é necessário).

## 1) Produtos, preços e representantes — Firebase (Firestore), leitura pública

```
GET https://firestore.googleapis.com/v1/projects/bigtricot-catalogo/databases/(default)/documents/catalogo/main
```

- A resposta vem no **formato tipado do Firestore** → precisa **decodificar**
  (`stringValue` / `integerValue` / `doubleValue` / `booleanValue` / `arrayValue`
  / `mapValue` / `nullValue`).
- Campos do documento `catalogo/main`:
  - `produtos[]`
  - `edicao_limitada { produtos[], categorias[] }`
  - `representantes[]`
  - `banco_cores[]`
  - `banco_tamanhos[]`
  - `capa`
  - `atualizado_em`
- **Preço por região**: os campos de preço têm sufixo `_sul` / `_norte`.
  - `NORTE` = Norte + Nordeste
  - `SUL` = todo o resto
- **Cachear** de 5 a 15 minutos (não bater no Firestore a cada request).
- **Respeitar o campo `oculto`** (produto oculto não deve aparecer/usar).

### Decoder do formato Firestore (JS) — esboço

```js
// Converte um "value" tipado do Firestore em valor JS puro.
function fsVal(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal);
  if ("mapValue" in v) return fsFields(v.mapValue.fields || {});
  return null;
}
function fsFields(fields) {
  const o = {};
  for (const k in fields) o[k] = fsVal(fields[k]);
  return o;
}
// const doc = await (await fetch(URL)).json();
// const catalogo = fsFields(doc.fields || {});
```

## 2) Contatos + atividade — Cloudflare Worker (JSON já limpo)

```
GET https://bt-atividade.andre-sellmac.workers.dev/log?code=bigtricot%7Ctricot2026
```
(o `%7C` é o caractere `|`; testado: HTTP 200)

- Resposta: `{ eventos: [ ... ] }`
- Campos de cada evento:
  - `tipo` — `acesso` / `envio` / `download` / `abertura` / `rep_acesso`
  - `telefone`
  - `loja`
  - `repId`
  - `regiao`
  - `ev`
  - `ts` (epoch em **milissegundos**)
- **Leads** = eventos `tipo: "acesso"` (têm `loja` + `telefone`).
- **Nome do representante**: o `acesso` traz só o `repId`; cruzar com
  `representantes[]` da fonte (1). O evento `envio` costuma trazer `repNome`.
- **NORMALIZAR o telefone**: manter só dígitos e prefixar `55` quando tiver 10–11
  dígitos (às vezes vem com `55`, às vezes sem).

## Como o CRM usa hoje

- O cron `lerAtividadeCatalogo` faz o GET no `/log` (URL guardada em
  `config.catalogo_log_url`), mapeia `repId → repNome` e cria os leads
  (`registrarEventoCatalogo`).
- Cada lead do catálogo também vira **card no funil** na coluna
  **"📥 Catálogo (contato)"** (`etapa = catalogo-recebido`).
- Ponte pública do botão de WhatsApp do catálogo →
  `GET /api/atendimento/catalogo-whatsapp?para=<zap destino>&wa=<zap cliente>&nome=&uf=&rep=`
  (registra no funil e redireciona pro WhatsApp).

## Pendências / próximos passos

- (Opcional) Endpoint proxy no CRM `/api/catalogo` que busca o Firestore, decodifica
  e devolve JSON limpo (produtos, preços por região, representantes) com cache —
  evita repetir o decoder em vários lugares. **Alternativa**: o catálogo expõe esse
  proxy já mastigado e o CRM só consome.
- Sincronizar `representantes[]` do catálogo com a tabela `representantes` do CRM.
