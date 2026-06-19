# Rolagem de Fase — Big Tricot

> **Status do projeto:** 📐 Fase de Arquitetura — **nenhum código será escrito até a aprovação desta documentação e dos mockups.**

Sistema de controle e rastreabilidade de produção da Big Tricot, do pedido à entrega final.

## Índice da Documentação

| # | Documento | Conteúdo |
|---|-----------|----------|
| 00 | [Visão Geral](./00-VISAO-GERAL.md) | Objetivo, escopo, glossário, princípios |
| 01 | [Arquitetura](./01-ARQUITETURA.md) | Stack, camadas, infraestrutura, segurança, auditoria |
| 02 | [Banco de Dados](./02-BANCO-DE-DADOS.md) | Modelagem, tabelas, DER, auditoria append-only |
| 03 | [Fluxos Operacionais](./03-FLUXOS-OPERACIONAIS.md) | Fluxogramas de todas as fases e tipos de pedido |
| 04 | [Módulos](./04-MODULOS.md) | Estrutura modular do sistema |
| 05 | [Relacionamentos](./05-RELACIONAMENTOS.md) | Relações entre entidades |
| 06 | [Permissões](./06-PERMISSOES.md) | Papéis, RBAC, matriz de acesso |
| 07 | [Mockups](./07-MOCKUPS.md) | Wireframes de todas as telas (web + mobile) |
| 08 | [Melhorias de Processo](./08-MELHORIAS.md) | Sugestões de otimização |
| 09 | [Gargalos Futuros](./09-GARGALOS.md) | Riscos e pontos de atenção |
| 10 | [Plano de Implementação](./10-PLANO-IMPLEMENTACAO.md) | Cronograma por fases/módulos |

## Como revisar

1. Leia do documento **00** ao **10** na ordem.
2. Os **mockups (07)** são wireframes em texto/ASCII — fáceis de comentar linha a linha.
3. Pontos que **exigem sua decisão** estão marcados com ⚠️ **DECISÃO NECESSÁRIA**.
4. Após aprovação, iniciamos o desenvolvimento conforme o plano (10).

## Pendências para o cliente (Big Tricot)

- 📄 **Especificação oficial de Romaneios**: foi citada como requisito mas não anexada. O documento [02](./02-BANCO-DE-DADOS.md) e [07](./07-MOCKUPS.md) trazem uma proposta robusta que deve ser confrontada com a spec oficial.
- 🔐 **Registro de senha em cada movimentação**: ver alerta de segurança em [01](./01-ARQUITETURA.md#auditoria-e-assinatura) — proposta de alternativa segura.
- 🏭 **Decisão de hospedagem** (on-premise vs nuvem) — ver [01](./01-ARQUITETURA.md#infraestrutura-e-implantação).
