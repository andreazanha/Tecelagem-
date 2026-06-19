# 09 — Possíveis Gargalos Futuros

Riscos técnicos e operacionais antecipados, com mitigação planejada na arquitetura.

## 1. Leitura de PDF (OCR)
- **Risco**: PDFs do ERP com layout variável, escaneados ou de baixa qualidade → extração incorreta.
- **Impacto**: retrabalho de conferência, pedidos errados na produção.
- **Mitigação**: parser atrás de adapter (trocável); confiança por campo + revisão obrigatória; aprendizado com correções; *fallback* para entrada manual completa. **Idealmente, evoluir para integração direta via API do ERP** (elimina o PDF).

## 2. Conectividade no Chão de Fábrica
- **Risco**: Wi-Fi instável em galpões; teares/setores sem rede.
- **Impacto**: rolagem travada, motorista sem sincronizar.
- **Mitigação**: **offline-first** (mobile/tablet com fila local + sync); servidor on-premise; cache local.

## 3. Volume e Crescimento de Dados (auditoria)
- **Risco**: tabela de auditoria/movimentações cresce indefinidamente.
- **Impacto**: lentidão em consultas e no painel.
- **Mitigação**: particionamento por mês, índices certos, materialized views para o painel, arquivamento de partições antigas.

## 4. Tela "Todos os Pedidos" (consulta pesada)
- **Risco**: muitos filtros + muitos registros + tempo real = carga alta.
- **Impacto**: lentidão na tela mais usada.
- **Mitigação**: materialized view + atualização incremental por evento; paginação; WebSocket só para deltas.

## 5. Concorrência na Rolagem de Fase
- **Risco**: dois usuários rolando a mesma OP simultaneamente.
- **Impacto**: estados inconsistentes.
- **Mitigação**: state machine + *optimistic locking* (versão da OP); transição idempotente; bloqueio otimista com mensagem clara.

## 6. Agrupamento / Desmembramento
- **Risco**: lógica complexa (1 OP ↔ N pedidos, partes, pronta entrega misturados) → erros de vínculo.
- **Impacto**: pedido "perdido" ou duplicado após a Revisão.
- **Mitigação**: modelo `op_pedido` explícito; testes de regra; conferência obrigatória no desmembramento; rastreio que nunca quebra o vínculo com o pedido original.

## 7. Dependência de Provedor Externo (WhatsApp)
- **Risco**: mudança de política/preço/bloqueio da API do WhatsApp.
- **Impacto**: parada de notificações.
- **Mitigação**: adapter provider-agnostic; fila com retry; fallback (e-mail/SMS); histórico independente do provedor.

## 8. Pagamentos de Costureiras
- **Risco**: divergência entre peças enviadas/recebidas e valor pago.
- **Impacto**: conflito financeiro, retrabalho administrativo.
- **Mitigação**: conciliação automática por romaneio recebido; pendências rastreadas; trilha de auditoria nos pagamentos.

## 9. Adoção pelos Usuários (chão de fábrica)
- **Risco**: resistência, operação incompleta → dados não confiáveis.
- **Impacto**: sistema "pela metade", rastreabilidade furada.
- **Mitigação**: UX simples (PIN/scan), treinamento, implantação faseada por setor, indicadores de adesão.

## 10. Impressão de Etiquetas/Romaneios (futuro físico)
- **Risco**: heterogeneidade de impressoras (Zebra/comum), drivers.
- **Impacto**: falha na geração de etiqueta/romaneio.
- **Mitigação**: gerar **ZPL e PDF**; serviço de impressão desacoplado; fila com reimpressão.

## 11. Integração Fiscal (NF)
- **Risco**: emissão de NF é regulada e específica do ERP/SEFAZ.
- **Impacto**: bloqueio na fase Fiscal.
- **Mitigação**: manter Fiscal como **registro/integração** com o ERP existente (não reinventar emissão); adapter para o ERP.

## 12. Backup e Continuidade
- **Risco**: perda de dados / servidor on-premise.
- **Impacto**: perda de rastreabilidade (crítico).
- **Mitigação**: backup PITR + replicação para nuvem; teste de restauração periódico; plano de contingência.

## Resumo de Mitigações Estruturais (já na arquitetura)
- Adapters trocáveis · Offline-first · Append-only particionado · State machine + locking · `op_pedido` explícito · Materialized views · Filas com retry · Backup/restore testado.
