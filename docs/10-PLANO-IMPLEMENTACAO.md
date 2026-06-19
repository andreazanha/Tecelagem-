# 10 — Plano de Implementação por Fases

> Início **somente após aprovação** desta arquitetura e dos mockups. Estimativas em "sprints" de 2 semanas — calibráveis conforme tamanho da equipe.

## Visão Geral das Fases

```
FASE 0  Fundação        ──▶  FASE 1  Pedidos      ──▶  FASE 2  Produção (núcleo)
   │                                                        │
FASE 3  Romaneios+Costureiras ──▶ FASE 4  Motorista(mobile) ──▶ FASE 5 Almoxarifado
   │
FASE 6  Fiscal/Expedição ──▶ FASE 7  Relatórios/BI ──▶ FASE 8  WhatsApp
   │
FASE 9  Etiquetas/Barcode ──▶ FASE 10  Tablets chão de fábrica
```

---

## FASE 0 — Fundação (Core) · 2–3 sprints
**Entrega**: base sobre a qual tudo é construído.
- Setup do projeto (backend NestJS, frontend Next.js, infra Docker, CI).
- Banco de dados base + migrações.
- **Auth + RBAC + reautenticação (assinatura eletrônica)**.
- **Auditoria append-only** (hash encadeado) — transversal.
- Storage (PDFs/fotos), Domain Events/Outbox, port de Notificações (stub).
- Cadastros base: usuários, papéis, clientes, produtos, setores/fases.

**Critério de aceite**: login, controle de acesso, e toda ação já gravando trilha auditável.

## FASE 1 — Pedidos & Ingestão de PDF · 2–3 sprints
- Upload e preservação do PDF original.
- OCR/parser (port) + tela de **conferência com correção**.
- Geração de **PDF padronizado**.
- **Agrupamento** + PDF agrupado + vínculos.
- Tipos de pedido e regras de fluxo.

**Critério**: importar PDF → conferir → gerar pedido/OP → agrupar.

## FASE 2 — Produção / Rolagem de Fase (NÚCLEO) · 3–4 sprints
- State machine das 9 fases + regras por tipo de pedido (incl. Pronta Entrega pulando Tecelagem).
- **Rolagem** com `movimentacao_fase` + auditoria + reautenticação.
- **Tela "Todos os Pedidos"** com filtros avançados + tempo real.
- **Detalhe da OP** (timeline de rastreio).
- **Desmembramento na Revisão**.

**Critério**: uma OP percorre todas as fases com rastreabilidade completa; agrupamento desmembra corretamente.

## FASE 3 — Romaneios & Costureiras · 2–3 sprints
- Módulo de **Romaneios** (emissão automática, PDF, conferência de retorno, divergências).
- **Corte → Costura** (seleciona costureira+motorista, gera romaneio, inicia rastreio).
- **Cadastro de Costureiras** completo (histórico, em aberto, romaneios, pagamentos, pendências).
> Incorporar a **especificação oficial de Romaneios** aqui.

**Critério**: enviar Corte→Costura gera romaneio e histórico; costureira tem visão 360º.

## FASE 4 — App do Motorista (mobile) · 2 sprints
- React Native (Expo), **offline-first**.
- Entregas, confirmar chegada/entrega, observações, **fotos**, sincronização.

**Critério**: motorista opera entregas no celular, inclusive offline.

## FASE 5 — Almoxarifado · 2 sprints
- Entrada/saída/ajuste, histórico append-only, estoque mínimo, **alertas**.
- Consumo vinculado à OP / reserva de material (melhoria).

**Critério**: controle de estoque com alertas e trilha.

## FASE 6 — Fiscal & Expedição · 1–2 sprints
- Separação/embalagem por pedido (pós-desmembramento).
- Registro/integração de NF (adapter ERP).
- Romaneio de expedição → fechamento do ciclo até a entrega.

**Critério**: pedido vai de Expedição a Entregue com NF registrada.

## FASE 7 — Relatórios & BI · 1–2 sprints
- Lead time por fase, gargalos, OTIF, produtividade por costureira, atrasos.
- Exportação PDF/Excel, dashboards.

## FASE 8 — WhatsApp (ativação) · 1–2 sprints
- Implementar adapter (Meta Cloud API/BSP) sobre o port já existente.
- Templates, envio de PDFs/relatórios, **histórico de envios**, retry/fallback.

## FASE 9 — Etiquetas & Código de Barras · 2 sprints
- Geração de etiquetas (ZPL/PDF), QR/Code128 por OP/peça/pedido.
- Leitura por câmera/scanner para rolagem rápida.

## FASE 10 — Tablets no Chão de Fábrica · 2–3 sprints
- Painéis nos teares/setores, modo quiosque, login PIN/crachá, rolagem por scan.

---

## Marcos (Milestones)

| Marco | Após Fase | Valor entregue |
|-------|-----------|----------------|
| **MVP Rastreável** | 2 | Pedido entra, percorre fases com rastreabilidade total e painel central |
| **Logística completa** | 4 | Romaneios + costureiras + motorista mobile |
| **Operação fim-a-fim** | 6 | Do PDF à entrega com NF |
| **Gestão por dados** | 7 | Indicadores e decisão |
| **Automação física** | 10 | Barcode + tablets no chão de fábrica |

## Sequenciamento (resumo)
- **Crítico primeiro**: Core → Pedidos → Produção (o coração do sistema).
- **WhatsApp, Etiquetas, Tablets**: arquitetura preparada desde já, **implementação ao final** (sem retrabalho graças aos adapters/ports).
- Cada fase entrega valor utilizável e testável isoladamente.

## Próximos Passos Imediatos
1. ✅ Revisar e aprovar esta documentação + mockups.
2. 📄 Anexar **especificação oficial de Romaneios**.
3. ⚠️ Decidir: **stack**, **hospedagem (on-premise vs nuvem)**, **assinatura eletrônica vs senha**.
4. 🎨 (Opcional) Converter mockups ASCII em protótipo visual (Figma) para validação final.
5. 🚀 Iniciar **Fase 0**.
