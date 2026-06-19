# 03 — Fluxos Operacionais

## 1. Fluxo Macro (Pedido Único)

```
[ERP gera PDF] 
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ 1. CRIAÇÃO DE PEDIDO                                     │
│  • Upload do PDF  • OCR extrai dados                     │
│  • Conferência manual (cliente, nº, entrega, itens, qtd)│
│  • Guarda PDF original  • Gera PDF padronizado           │
│  • Status: IMPORTADO → CONFERIDO                         │
└───────────────────────────┬─────────────────────────────┘
                            ▼  (cria OP)
   TECELAGEM → PASSADORIA → CORTE ──(romaneio)──> COSTURA
                                                    │
                                                    ▼
                                                 REVISÃO
                                  (desmembra agrupamento → pedidos)
                                                    │
        ┌───────────────────────────────────────────┘
        ▼                  ▼                    ▼
    EXPEDIÇÃO  ───────►  FISCAL  ──────────► TRANSPORTE ──► ENTREGUE
   (por pedido)      (NF por pedido)     (motorista/app)
```

A cada seta (rolagem): **valida regra → grava `movimentacao_fase` + `evento_auditoria` (com reautenticação) → notifica/atualiza painel em tempo real**.

## 2. Fluxo: Pronta Entrega (NÃO passa pela Tecelagem)

```
[Pedido Pronta Entrega] → reserva no ESTOQUE/Almoxarifado
      │
      ▼
  EXPEDIÇÃO → FISCAL → TRANSPORTE → ENTREGUE
```

## 3. Fluxo: Parte 1 + Parte 2 (+ Pronta Entrega)

```
Pedido
 ├─ PARTE 1 → Tecelagem → ... → Revisão ┐
 ├─ PARTE 2 → Tecelagem → ... → Revisão ┼─► CONSOLIDAÇÃO na Revisão
 └─ PRONTA ENTREGA → Estoque ───────────┘     │
                                              ▼
                                  EXPEDIÇÃO → FISCAL → TRANSPORTE
```
Regra: o pedido só avança para Expedição quando **todas as partes** chegam à Revisão e são consolidadas.

## 4. Fluxo: Agrupamento de Pedidos

```
Pedidos pequenos: #1001, #1002, #1003 (mesmo cliente/produto/prazo compatível)
        │  (usuário agrupa)
        ▼
  AGRUPAMENTO G-045  →  gera PDF agrupado (lista #1001,#1002,#1003)
        │
        ▼
  1 ORDEM DE PRODUÇÃO (OP) percorre: Tecelagem → Passadoria → Corte → Costura → REVISÃO
        │
        ▼  (na Revisão, DESMEMBRA)
  #1001 ─┐
  #1002 ─┼─► cada pedido individual → Expedição → Fiscal → Transporte
  #1003 ─┘
```

## 5. Fluxo Detalhado: Criação de Pedido (PDF → OCR → Conferência)

```
┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────┐
│ Upload   │ → │ Fila/    │ → │ OCR/Parser   │ → │ Tela de      │ → │ Conferido  │
│ PDF ERP  │   │ Worker   │   │ extrai dados │   │ Conferência  │   │ + PDF novo │
└──────────┘   └──────────┘   └──────┬───────┘   └──────┬───────┘   └────────────┘
                                     │                  │
                          dados_extraidos (jsonb)   Correção manual
                          PDF original preservado    (rastreada em auditoria)
```
- Baixa confiança do OCR → campo destacado em amarelo para revisão obrigatória.
- Correções manuais geram `evento_auditoria` (valor_anterior → valor_novo).

## 6. Fluxo Detalhado: Corte → Costura (Romaneio)

```
Corte conclui peças cortadas
      │
      ▼
┌──────────────────────────────────────────────┐
│ Tela "Enviar para Costura"                    │
│  1. Seleciona COSTUREIRA                      │
│  2. Seleciona MOTORISTA                       │
│  3. Confere itens/quantidades                 │
│  4. Reautentica (assinatura)                  │
└───────────────────┬──────────────────────────┘
                    ▼
  • Gera ROMANEIO automático (PDF) + nº sequencial
  • Registra histórico (movimentacao_fase + auditoria)
  • Cria ENTREGA p/ o motorista (app)
  • Inicia RASTREAMENTO  • (futuro) dispara WhatsApp p/ costureira
                    │
                    ▼
  Motorista (app): A_CAMINHO → CHEGOU → ENTREGUE (+ fotos/observações)
                    │
                    ▼
  Costureira recebe e produz → retorno via romaneio COSTURA_PARA_REVISAO
```

## 7. Fluxo: App do Motorista

```
Login → Lista de Entregas (romaneios atribuídos)
   │
   ├─ Abre entrega → vê itens, costureira/endereço, mapa
   ├─ [Confirmar Chegada]  → status CHEGOU (+ geo, hora)
   ├─ Registrar observação / fotos
   └─ [Confirmar Entrega]  → status ENTREGUE (assinatura/fotos)
            │
            ▼
   Atualiza romaneio + rastreio + painel em tempo real
```
Funciona **offline**: ações são enfileiradas e sincronizadas quando há rede.

## 8. Fluxo: Revisão (Controle de Qualidade + Desmembramento)

```
OP chega na REVISÃO
   │
   ├─ Inspeção de qualidade por peça/pedido
   │     ├─ OK → segue
   │     └─ Defeito → status DEVOLVIDO (retrabalho) + pendência
   │
   └─ Se OP é AGRUPADA → DESMEMBRA em pedidos individuais
            │
            ▼
   Cada pedido → fila de EXPEDIÇÃO (rastreio agora por pedido)
```

## 9. Fluxo: Expedição → Fiscal → Transporte

```
EXPEDIÇÃO: separa/embala por pedido → confere → libera
   │
   ▼
FISCAL: emite NF (integração ERP/futuro) → vincula documento
   │
   ▼
TRANSPORTE: gera romaneio de expedição → motorista/transportadora
   │
   ▼
ENTREGA ao cliente (confirmação + comprovante) → Pedido ENTREGUE
```

## 10. Fluxo: Almoxarifado

```
ENTRADA (NF/compra) → +saldo → registra
SAÍDA (consumo produção) → -saldo → vincula OP
AJUSTE (inventário) → recalcula → exige motivo + reautenticação
      │
      ▼
Saldo ≤ estoque_minimo → gera ALERTA → notifica responsável
```

## 11. Eventos que disparam Notificação (WhatsApp futuro)

| Evento | Destinatário | Conteúdo |
|--------|-------------|----------|
| Romaneio Corte→Costura emitido | Costureira | Itens, prazo, PDF do romaneio |
| Entrega confirmada | Escritório | Status + fotos |
| Pagamento lançado | Costureira | Comprovante/extrato |
| Estoque mínimo atingido | Almoxarife | Alerta |
| Pedido atrasado na fase | Supervisor | Tempo parado excedido |
