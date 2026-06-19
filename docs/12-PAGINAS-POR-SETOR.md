# 12 — Páginas por Setor (modelo de navegação)

> Requisito do cliente: **cada setor tem a sua própria página**, e **cada pessoa acessa apenas o seu setor**. Dentro da página do setor ficam **todas as etapas internas daquele setor**.

## 1. Conceito

O sistema **não** começa por um quadro global. Cada operador entra direto na **página do seu setor** e vê só o que é dele. O pedido "anda" entre setores: ao **finalizar** no setor atual, o operador clica em **Enviar ▶** e o pedido **rola para o próximo setor** (com assinatura 🔒).

```
Operador Tecelagem  →  abre  →  Página "Setor: Tecelagem"  (vê só Tecelagem)
Operador Costura    →  abre  →  Página "Setor: Costura"    (vê só Costura)
Revisor             →  abre  →  Página "Setor: Revisão"    (vê só Revisão)
... e assim por diante
```

## 2. Páginas de setor (uma para cada fase)

| Página de Setor | Quem acessa | Etapas internas (sub-status) | Ao finalizar, envia para |
|-----------------|-------------|------------------------------|--------------------------|
| **Tecelagem** ✅ | Operador Tecelagem | Aguard. Parte 1 (Máq 3) · Aguard. Parte 2 (Máq 7) · Aguard. Kits · Tecendo · Tecidos · Tecidos Kits | Passadoria |
| **Passadoria** | Operador Passadoria | Aguardando → Passando → Finalizado | Corte |
| **Corte** | Operador Corte | Aguardando → Cortando → Finalizado | Costura *(gera romaneio)* |
| **Costura** | Operador Costura | Aguardando → Costurando (por costureira) → Finalizado | Revisão |
| **Revisão** | Revisor | Aguardando → Revisando (por revisor) → Aprovado/Devolvido | Expedição *(desmembra agrupados)* |
| **Expedição** | Expedição | Aguardando → Separando/Embalando → Finalizado | Fiscal |
| **Fiscal** | Fiscal | Aguardando → Emitindo NF → Finalizado | Transporte |
| **Transporte** | Logística/Motorista | Aguardando → Em rota → Entregue | (fim) |

> Cada página tem o **mesmo formato**: contadores no topo (Aguardando / Em execução / Finalizados), recursos do setor (teares, costureiras, revisores…) e um **mini-quadro Kanban interno** com as etapas daquele setor.

## 3. Estrutura visual de uma página de setor

```
┌ Setor: Tecelagem ───────────────────────────────── Pedro (Operador) ┐
│ [Aguardando 5] [Tecendo 4] [Finalizados 3] [Teares 4/6]             │
│ Teares: ●Tear1 #1031  ●Tear2 #1010  ◐Tear3 setup  ●Tear6 #1040 ...  │
│ ┌ Aguardando ┐  ┌ Tecendo ┐        ┌ Finalizado → Passadoria ┐      │
│ │ #1042 Loja K│ │#1010 Tear2 │     │ #1009  [🔒 Enviar ▶]     │      │
│ │ #1045 ...   │ │#1031 Tear1 │     │ #1002  [🔒 Enviar ▶]     │      │
│ └─────────────┘ └────────────┘     └─────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

- A **fila de entrada** de cada setor = os pedidos que o setor anterior enviou.
- Recursos variam por setor: **Tecelagem → teares**, **Costura → costureiras**, **Revisão → revisores**, **Transporte → motoristas**.

## 4. Acessos (resumo)

| Papel | O que vê |
|-------|----------|
| **Operador do setor** | Apenas a página do seu setor |
| **Supervisor de Produção / Gestor** | **Todas** as páginas + Dashboard global + Quadro Kanban geral + Lista "Todos os Pedidos" |
| **Administrador** | Tudo + configuração |

> Ou seja: os operadores trabalham na **visão de setor**; supervisão/gestão têm a **visão geral** (Dashboard + Kanban global + Lista). São as mesmas informações, em níveis diferentes.

## 5. Reflexo na arquitetura

- O modelo de dados **já suporta** isto: cada `ordem_producao` tem `fase_atual` e `setor_atual_id`; a página do setor é só um **filtro** por setor + as **etapas internas** (sub-status) daquele setor.
- **Permissões** (doc 06): cada papel de operador enxerga apenas o seu `setor`.
- **Sub-status internos** são configuráveis por setor (catálogo `setor_etapa`), permitindo que cada setor tenha suas próprias colunas sem alterar o código.
- **Enviar ▶** = a rolagem de fase já especificada (movimentacao_fase + auditoria + assinatura).

## 3.1 Tecelagem — fluxo aprovado ✅

Colunas da página da Tecelagem:

1. **Aguardando Tecelagem · Parte 1** — fila da **Máquina 3**
2. **Aguardando Tecelagem · Parte 2** — fila da **Máquina 7**
3. **Aguardando Tecelagem · Kits** — fila de kits
4. **Tecendo** — em produção (mostra máquina, operador, tempo)
5. **Tecidos** — partes prontas
6. **Tecidos · Kits** — kits prontos

**Regras de negócio:**
- **Parte 1 (Máq 3)** e **Parte 2 (Máq 7)** são tecidas **separadamente** e **se unem somente no Corte**, formando uma única parte.
- **Kits** seguem **separados** durante todo o fluxo (não se unem).
- Ações no cartão: **▶ Iniciar** (vai p/ Tecendo, escolhe máquina) · **✓ Finalizar** (vai p/ Tecidos) · **🔒 Enviar ▶** (rola p/ próxima fase).

> Modelo de dados: `pedido.parte` (P1/P2/KIT) + `setor_etapa` por setor já comportam essas colunas. A união P1+P2 ocorre no Corte (agregação por `pedido_id`).

## ⚠️ Para confirmar com a Big Tricot

Preciso das **etapas internas reais de cada setor** (as colunas dentro de cada página), pois variam de fábrica para fábrica. A tabela do item 2 é uma proposta. Exemplos de dúvidas:

- **Tecelagem**: as etapas são por *tear* ou existem passos como *programação → tecendo → conferência de malha*?
- **Costura**: separa por *costureira* (já proposto) — confirma?
- **Revisão**: por *revisor* + *aprovado/devolvido* — confirma?
- Algum setor tem etapa interna que eu não previ?
