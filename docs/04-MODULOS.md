# 04 — Estrutura dos Módulos

Cada módulo é coeso, com fronteira clara, expondo casos de uso e emitindo eventos de domínio. Numeração reflete dependência/ordem de construção sugerida.

## M0 — Núcleo / Core (transversal)
- **Auth & RBAC**: login, JWT/refresh, papéis, permissões, reautenticação (assinatura).
- **Auditoria**: `evento_auditoria` append-only, hash encadeado, trilha por entidade.
- **Storage**: abstração de Object Storage (PDFs, fotos).
- **Domain Events / Outbox**: garantia transacional de eventos.
- **Notificações (port)**: interface `NotificationProvider` (impl. WhatsApp depois).

## M1 — Pedidos & Ingestão de PDF
- Upload e **preservação do PDF original**.
- **OCR/Parser** (port `OcrProvider`): extrai cliente, nº pedido, data de entrega, produtos, quantidades → `dados_extraidos`.
- **Tela de Conferência** com correção manual (rastreada).
- **Geração de PDF padronizado** da empresa.
- Cadastro de tipos de pedido e regras de fluxo.

## M2 — Agrupamento
- Agrupar N pedidos em 1 OP; manter vínculo com originais.
- Gerar **PDF agrupado** com todos os números.
- Suporte ao **desmembramento na Revisão**.

## M3 — Produção / Rolagem de Fase (motor central)
- **State machine** das 9 fases + regras por tipo de pedido.
- Registro de `movimentacao_fase` + auditoria por rolagem.
- Cálculo de **tempo parado**, status, setor e responsável atual.
- **Tela "Todos os Pedidos"** com filtros avançados (via materialized view).
- Atualização em **tempo real** (WebSocket) para painéis.

## M4 — Romaneios & Logística
- Emissão automática de romaneio (Corte→Costura, Costura→Revisão, Expedição).
- Geração do PDF do romaneio.
- Conferência de retorno (quantidade enviada vs recebida) + divergências.
- Vínculo com costureira e motorista.
> Requisito: incorporar a **especificação oficial de Romaneios** (pendente).

## M5 — Costureiras
- Cadastro completo (interna/facção, contato, PIX, acordos).
- Histórico, **pedidos em aberto**, romaneios, **pagamentos**, **pendências**.

## M6 — App do Motorista (mobile)
- Lista de entregas; confirmar chegada/entrega; observações; **fotos**.
- **Offline-first** com sincronização.
- Rastreamento e atualização de status do romaneio/entrega.

## M7 — Almoxarifado
- Entrada, saída, ajustes; histórico append-only.
- Estoque mínimo, **alertas**.
- Consumo vinculado à OP.

## M8 — Fiscal & Expedição
- Separação/embalagem por pedido (pós-desmembramento).
- Emissão/registro de NF (integração ERP — fase futura).
- Romaneio de expedição.

## M9 — Notificações / WhatsApp (arquitetura agora, ativação futura)
- Adapter provider-agnostic (Meta Cloud API / BSP).
- Templates, envio de PDFs/relatórios, **histórico de envios**.
- Troca de provedor sem refazer o sistema.

## M10 — Relatórios & BI
- Indicadores de produção, lead time por fase, gargalos, produtividade por costureira, atrasos.
- Exportação (PDF/Excel) e dashboards.

## M11 — Etiquetas / Código de Barras (preparação física — futuro)
- Geração de etiquetas (ZPL/PDF), Code128/QR por OP/peça/pedido.
- Leitura por scanner/câmera para rolagem rápida nos setores.

## M12 — Chão de Fábrica / Tablets (futuro)
- Painéis nos teares e setores; rolagem por toque/scan.
- Modo quiosque, login rápido por PIN/crachá.

## Mapa de Dependências

```
M0 (Core) ─ base de todos
M1 → M2 → M3 (central) → M4 → M5
                 │         └→ M6 (motorista)
                 ├→ M8 (fiscal/expedição)
                 └→ M10 (relatórios)
M7 (almoxarifado) ┘ independente, integra com M3 (consumo)
M9, M11, M12 — preparados na arquitetura, ativados em fases futuras
```
