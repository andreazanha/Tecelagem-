# 06 — Permissões de Usuários (RBAC)

## 1. Modelo

**RBAC** (Role-Based Access Control) com permissões finas:
`Usuário → Papéis → Permissões`. Um usuário pode ter múltiplos papéis (ex.: supervisor que também opera o corte).

Ações críticas exigem **reautenticação** (assinatura eletrônica) independentemente do papel.

## 2. Papéis Propostos

| Papel | Descrição |
|-------|-----------|
| **Administrador** | Acesso total, gestão de usuários/parâmetros |
| **Gestor / Diretoria** | Visão geral, relatórios, sem operar fases |
| **Supervisor de Produção** | Acompanha/desbloqueia todas as fases, prioriza OPs |
| **Operador Tecelagem** | Rola fase Tecelagem |
| **Operador Passadoria** | Rola fase Passadoria |
| **Operador Corte** | Rola Corte + emite romaneio p/ Costura |
| **Operador Costura (interno)** | Registra recebimento/retorno de costura |
| **Revisor (Qualidade)** | Revisão, desmembramento, devolução/retrabalho |
| **Expedição** | Separação, embalagem, liberação |
| **Fiscal** | Emissão/registro de NF |
| **Logística / Romaneios** | Gestão de romaneios e motoristas |
| **Almoxarife** | Entrada/saída/ajuste de materiais |
| **Financeiro (Costureiras)** | Pagamentos e pendências de costureiras |
| **Conferente de Pedidos** | Importa PDF, confere, gera PDF padronizado |
| **Motorista** | App mobile: entregas, chegada, entrega, fotos |
| **Costureira** | (futuro) PWA: vê romaneios, relatórios, pagamentos |

## 3. Matriz de Permissões (resumida)

Legenda: ✅ total · 👁 leitura · ➖ sem acesso · ✍ leitura+ação

| Módulo / Ação | Admin | Gestor | Superv. | Conf. Pedido | Corte | Revisor | Exped. | Fiscal | Logíst. | Almox. | Financ. | Motorista |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Importar/Conferir Pedido (PDF) | ✅ | 👁 | ✍ | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Agrupar Pedidos | ✅ | 👁 | ✅ | ✍ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Tela Todos os Pedidos | ✅ | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | ➖ |
| Rolar fase (genérico) | ✅ | ➖ | ✅ | ➖ | ✍(corte) | ✍(rev) | ✍(exp) | ✍(fiscal) | ➖ | ➖ | ➖ | ➖ |
| Emitir Romaneio Corte→Costura | ✅ | ➖ | ✍ | ➖ | ✅ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ➖ |
| Desmembrar agrupamento (Revisão) | ✅ | ➖ | ✍ | ➖ | ➖ | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Cadastro Costureiras | ✅ | 👁 | 👁 | ➖ | ➖ | ➖ | ➖ | ➖ | ✍ | ➖ | ✍ | ➖ |
| Pagamentos Costureiras | ✅ | 👁 | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ |
| Almoxarifado (entrada/saída/ajuste) | ✅ | 👁 | 👁 | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Emitir NF (Fiscal) | ✅ | 👁 | 👁 | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ➖ | ➖ |
| App Motorista (entregas) | ✅ | ➖ | 👁 | ➖ | ➖ | ➖ | ➖ | ➖ | 👁 | ➖ | ➖ | ✍ |
| Relatórios / BI | ✅ | ✅ | ✅ | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 | ➖ |
| Gestão de Usuários/Papéis | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Auditoria (consulta trilha) | ✅ | 👁 | 👁 | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |

> A matriz completa (por permissão-chave) será detalhada no início do desenvolvimento do M0. Esta versão cobre as decisões de acesso de alto nível.

## 4. Ações que Exigem Reautenticação (Assinatura)

- Rolagem de fase
- Emissão de romaneio
- Desmembramento na Revisão
- Pagamento de costureira
- Ajuste de estoque
- Cancelamento de pedido/OP
- Correção manual de dados de pedido

## 5. Princípios de Segurança de Acesso

1. **Menor privilégio**: papéis dão só o necessário.
2. **Segregação de funções**: quem opera o Corte não aprova pagamento; quem ajusta estoque não audita.
3. **Trilha de acesso**: consultas sensíveis (auditoria, pagamentos) também são logadas.
4. **Sessão**: expiração + bloqueio por inatividade; PIN rápido em tablets/quiosque.
