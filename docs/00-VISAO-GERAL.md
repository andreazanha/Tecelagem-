# 00 — Visão Geral

## 1. Objetivo do Sistema

Controlar **toda a produção da Big Tricot**, desde a entrada do pedido (PDF do ERP) até a entrega final ao cliente, com **rastreabilidade completa e auditável** de cada movimentação.

Premissa central: **nenhuma movimentação ocorre sem histórico**. Toda alteração registra *quem*, *quando*, *o quê* e *com qual autorização*.

## 2. As 9 Fases do Processo

```
┌──────────────┐   ┌────────────┐   ┌─────────────┐   ┌────────┐
│ 1. Criação   │ → │ 2.Tecelagem│ → │3. Passadoria│ → │4. Corte│
│   de Pedido  │   │            │   │             │   │        │
└──────────────┘   └────────────┘   └─────────────┘   └───┬────┘
                                                          │
   ┌────────────┐   ┌────────────┐   ┌─────────────┐      │
   │7. Expedição│ ← │ 6. Revisão │ ← │  5. Costura │ ←────┘
   └─────┬──────┘   └────────────┘   └─────────────┘
         │
   ┌─────▼──────┐   ┌──────────────┐
   │ 8. Fiscal  │ → │9. Transporte │ → ENTREGA
   └────────────┘   └──────────────┘
```

> **Rolagem de Fase** = o ato de "rolar" (avançar) uma ordem de produção de uma fase para a próxima, sempre com registro de responsável e timestamp.

## 3. Tipos de Pedido

| Tipo | Fluxo | Observação |
|------|-------|-----------|
| **Único** | Todas as fases | Padrão |
| **Parte 1 + Parte 2** | Produção dividida em 2 lotes | Cada parte rastreada; consolidação na Revisão |
| **Parte 1 + Parte 2 + Pronta Entrega** | Partes produzidas + item já em estoque | Mistura produção e estoque |
| **Estoque** | Produzido para repor estoque (sem cliente final imediato) | Vira disponível p/ Pronta Entrega |
| **Pronta Entrega** | **Estoque → Expedição → Fiscal → Transporte** | **NÃO passa pela Tecelagem** |

## 4. Agrupamento de Pedidos

Vários pedidos pequenos podem ser agrupados em **uma única Ordem de Produção (OP)**:

- Mantém vínculo com os pedidos originais.
- Gera PDF agrupado exibindo todos os números de pedido.
- Segue como **uma única OP** da Tecelagem até a Revisão.
- **Na Revisão, o grupo é desmembrado**: cada pedido volta a existir individualmente para **Expedição, Fiscal e Transporte**.

## 5. Glossário

| Termo | Definição |
|-------|-----------|
| **OP** | Ordem de Produção — unidade que percorre as fases |
| **Pedido** | Solicitação do cliente, originada de PDF do ERP |
| **Agrupamento** | Conjunto de pedidos tratados como 1 OP |
| **Fase** | Etapa macro do processo (Tecelagem, Corte…) |
| **Setor** | Local físico/equipe onde a fase ocorre |
| **Status** | Situação dentro da fase (Aguardando, Em execução, Concluído, Parado…) |
| **Rolagem** | Avanço de uma OP para a próxima fase |
| **Romaneio** | Documento de remessa (ex.: Corte → Costureira) com itens, responsáveis e rastreio |
| **Costureira** | Prestadora que executa a Costura (interna ou facção externa) |
| **Motorista** | Responsável pelo transporte entre setores/costureiras/cliente |
| **Tempo parado** | Tempo decorrido desde a entrada da OP na fase atual |
| **Pronta Entrega** | Item de estoque pronto, sem necessidade de produção |

## 6. Princípios de Arquitetura

1. **Rastreabilidade total** — todo evento é um registro imutável (append-only).
2. **Provider-agnostic** — integrações externas (WhatsApp, OCR, etiquetas) atrás de interfaces, trocáveis sem reescrever o sistema.
3. **Mobile-ready e offline-tolerante** — motoristas, costureiras e tablets de chão de fábrica podem ter conectividade instável.
4. **Modular** — cada fase/área é um módulo coeso, evoluível de forma independente.
5. **Preparado para automação física** — código de barras, etiquetas e leitores previstos desde a modelagem.
6. **Segurança e LGPD** — dados de pessoas (costureiras, motoristas, clientes) protegidos; autenticação forte em movimentações críticas.

## 7. Escopo desta Entrega (Arquitetura)

✅ Incluído: arquitetura, modelagem de dados, fluxos, módulos, relacionamentos, permissões, mockups, melhorias, gargalos, plano.
❌ Não incluído: implementação/código (somente após aprovação).
