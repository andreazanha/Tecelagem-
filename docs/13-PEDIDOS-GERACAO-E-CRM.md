# 13 — Geração de Pedidos (PDF por parte) + Integração CRM

## 1. Regras de geração da Ordem (aprovadas)

- O sistema importa o **PDF do ERP** (preservado) → lê por OCR → conferência → gera os PDFs padronizados.
- **1 PDF por parte**: cada parte vira um documento próprio.
  - **Parte 1** (Máquina 3) → PDF Parte 1 → segue para **Produção** (Tecelagem → … → Revisão).
  - **Parte 2** (Máquina 7) → PDF Parte 2 → segue para **Produção**.
  - **Pronta Entrega** → PDF Pronta Entrega → **não passa pela produção** → o card vai direto para o **Estoque**.

## 2. Pronta Entrega — opção de envio

Quando o pedido tem Pronta Entrega, definir **quando enviar**:

| Opção | Comportamento |
|-------|---------------|
| **Junto com o pedido** | Aguarda a produção (Parte 1/2) ficar pronta e **envia tudo junto** na Expedição. |
| **Antecipado (vai antes)** | Sai **na frente**, imediatamente do Estoque → Expedição → Fiscal → Transporte, sem esperar a produção. |

Combinações possíveis de pedido:
- Único
- Parte 1 + Parte 2
- Parte 1 + Parte 2 + Pronta Entrega (junto)
- Parte 1 + Parte 2 + Pronta Entrega (antecipado)
- Estoque
- Pronta Entrega (pura)

> Modelagem: `pedido_parte` (P1/P2/PE/KIT) + atributo `pe_envio` = `JUNTO | ANTECIPADO`. A Expedição consolida as partes conforme essa regra na Revisão/desmembramento.

## 3. Integração com o CRM (mesmo sistema)

> Decisão do cliente: o CRM em desenvolvimento será **integrado neste mesmo sistema** (plataforma única).

### Como encaixa na arquitetura (sem retrabalho)
- O sistema já é **modular**: o CRM entra como **mais um módulo** (`M-CRM`), compartilhando o **núcleo** (Auth/RBAC, Auditoria, Storage, Notificações).
- **Cliente é a entidade-ponte**: o `cliente` já existe no sistema (pedidos) e passa a ser **o mesmo cadastro** do CRM — sem duplicar dados.
- **Fluxo unificado**: CRM (oportunidade/negociação) → vira **Pedido** → entra na **Rolagem de Fase** → Expedição/Fiscal/Transporte → pós-venda volta ao CRM. Ciclo fechado.

### Módulo CRM (proposta de escopo)
- **Clientes 360º**: dados, contatos, histórico de pedidos, financeiro, interações.
- **Funil de vendas** (leads → oportunidade → proposta → ganho/perdido).
- **Atividades/Tarefas** (ligações, follow-up, lembretes).
- **Propostas/Orçamentos** → geram pedido.
- **Pós-venda**: status de produção/entrega visível ao vendedor (puxado da Rolagem de Fase).
- **Integração WhatsApp** (já prevista) reaproveitada para o CRM.

### Benefícios da unificação
- Login único, permissões únicas, **auditoria única**.
- Vendedor enxerga **a produção em tempo real** do pedido que ele vendeu.
- Sem integração frágil entre dois sistemas; **um só banco, um só app**.

### ⚠️ A definir com a Big Tricot
1. O CRM já está sendo construído **em qual tecnologia/base**? (para decidir entre *absorver no mesmo projeto* ou *integrar via módulo/serviço*).
2. **Escopo do CRM** v1: só funil de vendas e clientes, ou também propostas/financeiro/pós-venda?
3. O pedido **nasce no CRM** (proposta aprovada vira pedido) ou continua entrando pelo **PDF do ERP**, e o CRM só acompanha?
