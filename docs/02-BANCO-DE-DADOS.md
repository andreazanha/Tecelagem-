# 02 — Modelagem do Banco de Dados

> Banco: **PostgreSQL**. Convenções: `snake_case`, PK `id` (UUID), `created_at`/`updated_at` em todas as tabelas, soft-delete (`deleted_at`) onde aplicável. Tabelas de auditoria são **append-only**.

## 1. Diagrama Entidade-Relacionamento (visão macro)

```
 cliente ──< pedido >── tipo_pedido
                │
                │ (N pedidos : 1 OP via agrupamento)
                ▼
 agrupamento ──< ordem_producao >── produto_op >── produto
                      │
                      ├──< movimentacao_fase >── fase / setor / usuario
                      │
                      ├──< romaneio >── romaneio_item
                      │        │
                      │        ├── costureira
                      │        └── motorista ──< entrega >── entrega_foto
                      │
                      └──< documento >── (pdf_original / pdf_padronizado / pdf_agrupado)

 usuario ──< papel >── permissao            (RBAC)
 usuario ──< evento_auditoria              (append-only, tudo)

 costureira ──< pagamento_costureira
 costureira ──< pendencia_costureira

 material ──< movimentacao_estoque >── usuario   (Almoxarifado)
 material ── estoque_minimo / alerta_estoque

 notificacao ──< notificacao_log            (WhatsApp/futuro)
 produto ── etiqueta / codigo_barras        (futuro físico)
```

## 2. Domínios / Agregados

### 2.1 Cadastros Base

**`cliente`**
| Campo | Tipo | Notas |
|------|------|------|
| id | uuid PK | |
| codigo_erp | text | vínculo com ERP |
| razao_social | text | |
| nome_fantasia | text | |
| cnpj_cpf | text | |
| contato_* | text | telefone, email |
| endereco_* | json | |
| ativo | bool | |

**`produto`**
| id | uuid PK |
| codigo_erp | text |
| descricao | text |
| referencia | text |
| cor / tamanho / grade | text/json |
| unidade | text (PC, KG, M) |
| codigo_barras | text (futuro) |

**`usuario`** — `id, nome, login (unique), senha_hash (Argon2), email, ativo, ultimo_login, mfa_pin_hash (ações críticas)`
**`papel`** — `id, nome, descricao`
**`permissao`** — `id, chave, descricao`
**`usuario_papel`** (N:N) · **`papel_permissao`** (N:N) — ver doc 06.

### 2.2 Pedidos

**`pedido`**
| Campo | Tipo | Notas |
|------|------|------|
| id | uuid PK | |
| numero_pedido | text | número do ERP |
| cliente_id | uuid FK | |
| tipo_pedido | enum | `UNICO, PARTE_1_2, PARTE_1_2_PE, ESTOQUE, PRONTA_ENTREGA` |
| parte | enum null | `P1, P2, PE` quando aplicável |
| data_entrada | timestamptz | |
| data_entrega | date | prazo |
| status | enum | `IMPORTADO, CONFERIDO, EM_PRODUCAO, FINALIZADO, ENTREGUE, CANCELADO` |
| pdf_original_id | uuid FK → documento | **PDF do ERP preservado** |
| pdf_padronizado_id | uuid FK → documento | gerado após conferência |
| dados_extraidos | jsonb | saída bruta do OCR (auditável) |
| conferido_por | uuid FK → usuario | |
| conferido_em | timestamptz | |
| ordem_producao_id | uuid FK null | OP que executa este pedido |

**`pedido_item`** — `id, pedido_id, produto_id, quantidade, observacao` (itens identificados no PDF, com correção manual rastreada via auditoria).

### 2.3 Agrupamento e Ordem de Produção

**`agrupamento`** — `id, codigo, criado_por, criado_em, pdf_agrupado_id, observacao`
**`agrupamento_pedido`** (N:N) — `agrupamento_id, pedido_id` (mantém vínculo com originais).

**`ordem_producao`** (OP — a unidade que "rola" pelas fases)
| Campo | Tipo | Notas |
|------|------|------|
| id | uuid PK | |
| codigo_op | text unique | |
| origem | enum | `PEDIDO_UNICO, AGRUPAMENTO, ESTOQUE` |
| agrupamento_id | uuid FK null | se origem = agrupamento |
| fase_atual | enum | uma das 9 fases |
| setor_atual_id | uuid FK | |
| status_atual | enum | `AGUARDANDO, EM_EXECUCAO, PARADO, CONCLUIDO, DEVOLVIDO` |
| responsavel_atual_id | uuid FK → usuario | |
| entrou_fase_em | timestamptz | base do "tempo parado na fase" |
| prioridade | int | |
| data_entrega_prometida | date | menor prazo dos pedidos |

**`op_pedido`** (N:N OP↔Pedido) — permite OP agrupada e o **desmembramento na Revisão** (a partir daí cada pedido segue individual).

### 2.4 Produção / Rastreabilidade (núcleo)

**`fase`** (catálogo) — `id, codigo (CRIACAO, TECELAGEM, PASSADORIA, CORTE, COSTURA, REVISAO, EXPEDICAO, FISCAL, TRANSPORTE), ordem, ativo`
**`setor`** — `id, fase_id, nome, tipo (INTERNO/EXTERNO), localizacao`

**`movimentacao_fase`** ⭐ (coração da rastreabilidade — append-only)
| Campo | Tipo | Notas |
|------|------|------|
| id | uuid PK | |
| ordem_producao_id | uuid FK | |
| pedido_id | uuid FK null | preenchido após desmembramento |
| fase_origem | enum null | |
| fase_destino | enum | |
| setor_origem_id / setor_destino_id | uuid FK | |
| status | enum | |
| usuario_id | uuid FK | **quem executou** |
| assinatura_evento_id | uuid FK → evento_auditoria | **autorização** |
| iniciado_em / concluido_em | timestamptz | |
| duracao_segundos | int (gerado) | p/ métricas de gargalo |
| observacao | text | |
| romaneio_id | uuid FK null | quando a movimentação gera romaneio |

### 2.5 Romaneios e Logística

> 📄 **Estrutura proposta** — deve ser confrontada com a **especificação oficial de Romaneios** (pendente de anexo).

**`romaneio`**
| Campo | Tipo | Notas |
|------|------|------|
| id | uuid PK | |
| numero | text unique | sequencial |
| tipo | enum | `CORTE_PARA_COSTURA, COSTURA_PARA_REVISAO, EXPEDICAO, INTERNO` |
| ordem_producao_id | uuid FK | |
| costureira_id | uuid FK null | destino quando p/ costura |
| motorista_id | uuid FK null | transportador |
| origem_setor_id / destino_setor_id | uuid FK | |
| status | enum | `EMITIDO, EM_TRANSITO, ENTREGUE, RECEBIDO, DEVOLVIDO, DIVERGENTE` |
| emitido_por | uuid FK → usuario | |
| emitido_em | timestamptz | |
| pdf_id | uuid FK → documento | |
| previsao_retorno | date | |

**`romaneio_item`** — `id, romaneio_id, produto_id, pedido_id, quantidade_enviada, quantidade_recebida, divergencia, observacao`

**`entrega`** (execução do transporte / app do motorista)
| id | uuid PK |
| romaneio_id | uuid FK |
| motorista_id | uuid FK |
| status | enum (`A_CAMINHO, CHEGOU, ENTREGUE, FALHOU`) |
| chegada_confirmada_em | timestamptz |
| entrega_confirmada_em | timestamptz |
| geo_lat / geo_lng | numeric (opcional) |
| observacao | text |

**`entrega_foto`** — `id, entrega_id, documento_id (storage), legenda, criado_em`

### 2.6 Costureiras

**`costureira`** — `id, nome, tipo (INTERNA/FACCAO), documento (CPF/CNPJ), telefone, whatsapp, endereco_json, chave_pix, valor_acordo_json, ativo, observacoes`
**`costureira_historico`** — derivado de `movimentacao_fase` + `romaneio` (view).
**`pagamento_costureira`** — `id, costureira_id, romaneio_id null, periodo, valor, status (PENDENTE/PAGO), pago_em, comprovante_id, lancado_por`
**`pendencia_costureira`** — `id, costureira_id, tipo (PECA_FALTANTE, RETRABALHO, FINANCEIRA), descricao, valor null, status (ABERTA/RESOLVIDA), aberta_por, resolvida_em`

> "Pedidos em aberto" da costureira = romaneios `CORTE_PARA_COSTURA` ainda não `RECEBIDO`/devolvidos.

### 2.7 Almoxarifado

**`material`** — `id, codigo, descricao, categoria, unidade, estoque_atual, estoque_minimo, localizacao, ativo`
**`movimentacao_estoque`** (append-only) — `id, material_id, tipo (ENTRADA/SAIDA/AJUSTE), quantidade, saldo_anterior, saldo_novo, motivo, ordem_producao_id null, usuario_id, assinatura_evento_id, criado_em, documento_id null (NF)`
**`alerta_estoque`** — `id, material_id, tipo (MINIMO_ATINGIDO), gerado_em, resolvido_em`

### 2.8 Documentos / Storage

**`documento`** — `id, tipo (PDF_ORIGINAL, PDF_PADRONIZADO, PDF_AGRUPADO, ROMANEIO, FOTO_ENTREGA, COMPROVANTE, NF), storage_key, mime, tamanho, hash_sha256, criado_por, criado_em`
(Conteúdo binário no Object Storage; metadados no banco.)

### 2.9 Notificações (WhatsApp / futuro)

**`notificacao`** — `id, canal (WHATSAPP/EMAIL/SMS), destinatario_tipo (COSTUREIRA/MOTORISTA/CLIENTE), destinatario_id, template, payload_json, anexo_documento_id null, status (PENDENTE/ENVIADA/FALHA/ENTREGUE/LIDA), provider, criado_em, enviado_em`
**`notificacao_log`** — eventos por status do provider (histórico de envios).

### 2.10 Auditoria (append-only, transversal)

**`evento_auditoria`** ⭐
| Campo | Tipo | Notas |
|------|------|------|
| id | uuid PK | |
| usuario_id | uuid FK | **quem** |
| acao | text | ex.: `ROLAGEM_FASE`, `CORRECAO_PEDIDO`, `EMISSAO_ROMANEIO`, `PAGAMENTO`, `AJUSTE_ESTOQUE` |
| entidade_tipo | text | tabela/agregado afetado |
| entidade_id | uuid | |
| valor_anterior | jsonb | |
| valor_novo | jsonb | |
| ip | inet | |
| dispositivo | text | |
| reautenticado | bool | true em ações críticas (assinatura eletrônica) |
| hash_evento | text | hash do conteúdo |
| hash_anterior | text | encadeamento anti-adulteração |
| criado_em | timestamptz | **quando** (data+hora) |

> 🔐 **Senha NÃO é armazenada aqui.** O campo `reautenticado=true` + `hash_evento` constituem a **assinatura eletrônica** (ver doc 01 §7). Trigger no banco bloqueia UPDATE/DELETE. Particionada por mês.

## 3. Índices e Performance (essenciais)

- `ordem_producao (fase_atual, setor_atual_id, status_atual)` — painel "Todos os Pedidos".
- `ordem_producao (entrou_fase_em)` — cálculo de tempo parado.
- `movimentacao_fase (ordem_producao_id, criado_em)` — timeline de rastreio.
- `evento_auditoria (entidade_tipo, entidade_id)` e `(usuario_id, criado_em)`.
- `pedido (numero_pedido)`, `pedido (cliente_id, data_entrega)`.
- `romaneio (costureira_id, status)`, `romaneio (motorista_id, status)`.
- **Materialized view** `vw_pedidos_painel` para a tela principal (refresh por evento).

## 4. Regras de Integridade Chave

1. OP só "rola" para a próxima fase válida segundo seu `tipo_pedido` (Pronta Entrega pula Tecelagem→…→Estoque→Expedição).
2. Toda transição cria **1 `movimentacao_fase` + 1 `evento_auditoria`** na **mesma transação** (Outbox).
3. Desmembramento na Revisão: gera N registros `op_pedido`/`movimentacao_fase` por pedido; a partir daí rastreio é por `pedido`.
4. Romaneio `RECEBIDO` exige conferência de `quantidade_recebida` (gera `pendencia_costureira` se divergente).
5. `movimentacao_estoque` sempre recalcula `saldo_novo`; saldo nunca é editado direto.
