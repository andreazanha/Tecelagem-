# 05 — Relacionamentos entre Entidades

## 1. Cardinalidades Principais

| Relação | Cardinalidade | Observação |
|--------|---------------|-----------|
| Cliente → Pedido | 1 : N | um cliente tem vários pedidos |
| Pedido → Pedido_Item | 1 : N | itens do pedido |
| Pedido_Item → Produto | N : 1 | |
| Agrupamento ↔ Pedido | N : N (`agrupamento_pedido`) | mantém vínculo com originais |
| Agrupamento → Ordem_Produção | 1 : 1 | agrupamento vira uma OP |
| Ordem_Produção ↔ Pedido | N : N (`op_pedido`) | OP única (1:1) ou agrupada (1:N); permite desmembramento |
| Ordem_Produção → Movimentação_Fase | 1 : N | timeline de rastreio |
| Movimentação_Fase → Usuário | N : 1 | responsável |
| Movimentação_Fase → Evento_Auditoria | 1 : 1 | assinatura |
| Ordem_Produção → Romaneio | 1 : N | vários romaneios ao longo do fluxo |
| Romaneio → Romaneio_Item | 1 : N | |
| Romaneio → Costureira | N : 1 | quando Corte→Costura |
| Romaneio → Motorista | N : 1 | transporte |
| Romaneio → Entrega | 1 : N | tentativas/etapas de entrega |
| Entrega → Entrega_Foto | 1 : N | fotos do motorista |
| Costureira → Pagamento_Costureira | 1 : N | |
| Costureira → Pendência_Costureira | 1 : N | |
| Material → Movimentação_Estoque | 1 : N | append-only |
| Usuário ↔ Papel | N : N | RBAC |
| Papel ↔ Permissão | N : N | RBAC |
| (qualquer entidade) → Evento_Auditoria | 1 : N | trilha por `entidade_tipo+entidade_id` |
| Documento → (Pedido/Romaneio/Entrega/Material) | 1 : N (polimórfico por tipo) | PDFs/fotos/NF |
| Notificação → Notificação_Log | 1 : N | histórico de envios |

## 2. Diagrama de Relacionamentos (textual)

```
CLIENTE 1───N PEDIDO N───N AGRUPAMENTO
                 │              │1
                 │N             │
            PEDIDO_ITEM         │
                 │N        ORDEM_PRODUCAO 1───N MOVIMENTACAO_FASE N───1 USUARIO
                 1              │ N                    │1
             PRODUTO           ROMANEIO 1───N ROMANEIO_ITEM      EVENTO_AUDITORIA
                 │              │N    │N                              (1:1)
            (ETIQUETA/        ENTREGA COSTUREIRA 1───N PAGAMENTO
             BARCODE)          │N      │1            1───N PENDENCIA
                          ENTREGA_FOTO  │
                                     MOTORISTA

MATERIAL 1───N MOVIMENTACAO_ESTOQUE N───1 USUARIO
   │1
ALERTA_ESTOQUE

USUARIO N───N PAPEL N───N PERMISSAO        NOTIFICACAO 1───N NOTIFICACAO_LOG
```

## 3. Regras de Relacionamento Críticas

1. **OP↔Pedido via `op_pedido`** é o que permite o ciclo *agrupar → produzir como 1 → desmembrar na Revisão*. Antes da Revisão, rastreio pela OP; depois, por Pedido.
2. **Todo evento de movimentação** referencia simultaneamente OP (e Pedido quando já desmembrado) + Usuário + Evento_Auditoria — garante o "nenhuma movimentação sem histórico".
3. **Romaneio** conecta três agregados (Produção, Costureira, Motorista/Entrega) — ponto central da logística.
4. **Documento** é polimórfico (tipo + referência) para reaproveitar storage entre PDFs, fotos e NFs.
5. **Auditoria** é referenciável por qualquer entidade, sem FK rígida bidirecional (append-only, desacoplada).
