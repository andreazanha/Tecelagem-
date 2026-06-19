# 14 — Roadmap de Integrações e Módulos Futuros

> Itens planejados para **segunda fase** (não bloqueiam o sistema de produção atual), mas a arquitetura já é pensada para recebê-los.

## 0. Identidade visual
- **Logo oficial Big Tricot Home Decor** recriado em **vetor** e padronizado em **todo o sistema** (telas, menu, documentos e PDFs).
- Versões: preta (fundo claro/documentos), branca (fundo escuro/menu/topo) e compacta (favicon/ícone do app).
- Asset: `docs/prototipo/54-logo.png` · módulo reutilizável: `scripts/brand_logo.py`.

## 1. App de Vendas dos Representantes (CRM integrado)
Já existe um sistema hoje; será **integrado** ao Big Tricot.
- **Lançamento das vendas toda segunda-feira**.
- O sistema **envia mensagem automática** para **todos os representantes** com o **PDF de vendas da semana anterior**.
- Conexão com o **CRM** (cadastro de representantes, clientes, metas, comissões).
- Prioridade: **segundo plano**, mas a base (representantes, WhatsApp automático, geração de PDF) **já existe** no sistema (ver doc 13 — relatórios e envios automáticos).

## 2. Gerador de Etiquetas (código de barras)
- Geração de **etiquetas com código de barras** (produto/kit/cor/tamanho).
- Usos: identificação de volumes, estoque, conferência na Expedição/Transporte, leitura rápida.
- Integra com o cadastro de produtos/pedidos (mesmos dados do PDF do pedido).

## 3. Gerador de Recibos
- Emissão de **recibos de pagamento** (ex.: pagamento de costureiras/serviços, e outros).
- Reaproveita os dados de **romaneios/serviços** (doc 13) e o **logo oficial**.
- Saída em **PDF** com **Visualizar** + **Baixar (escolher diretório)**, no mesmo padrão dos demais relatórios.

---

### Por que já cabe na arquitetura
- **WhatsApp automático + PDFs**: já usados em Estoque, lembretes de costureira e relatório mensal → reaproveitáveis para vendas e recibos.
- **Catálogos configuráveis** (serviços, costureiras, transportadoras, tipos de romaneio) → mesmo padrão para representantes e tipos de etiqueta/recibo.
- **Geração de PDF com pré-visualização e escolha de diretório** → padrão único para romaneios, relatórios, etiquetas e recibos.
