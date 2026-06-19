# 13 — Insumos, Romaneios e Pagamento de Costura

## 1. Separação de Insumos
**Insumos** = embalagem, etiquetas, encartes, tags, tassel.
- Página com **lista de todos os pedidos criados**.
- Cada pedido mostra os insumos necessários (chips). Ao separar, a pessoa aperta **"✓ Insumos separados"** → registra **quem** e **a hora**.
- Se faltar algum insumo, o pedido fica **sinalizado** (não trava a produção).

## 2. Romaneios
- Criar **avulso** ou **por pedido**.
- **Gera PDF em 2 vias na mesma página** (1ª via Empresa / 2ª via Costureira, com linha de corte).
- **Romaneio de costura simplificado** com **agrupamento**:
  - **Peseiras + Mantas** somam juntas (ex.: 5 peseiras + 10 mantas = **15 Peseiras/Mantas**).
  - **Almofadas + Capas** somam juntas (ex.: **20 Almofadas/Capas**).
- **Serviços** (cadastráveis): colocar etiquetas, colocar capas, colocar almofadas, costurar peseira/manta… cada um com **unidade**, **agrupamento** e **valor unitário**.

## 3. Controle de Romaneio e Pagamento
- Cada romaneio tem **saída**, **retorno previsto** e **retorno real**.
- A costureira informa a **previsão de entrega** ao gerar o romaneio.
- **Regra de pagamento:** romaneios **não devolvidos até o dia 31** **não são liberados** para pagamento — aparecem no relatório como **Vencido / Bloqueado**, mas **não entram no total a pagar**.
- Status de pagamento: **Aguardando · ✓ Liberado · ✗ Bloqueado**.

## 4. Mensagens automáticas (WhatsApp)
- **Lembretes da costureira** (3, todos marcados "🤖 mensagem automática"):
  1. **Véspera** (1 dia antes da previsão).
  2. **Manhã do dia da entrega**.
  3. **Em atraso** (se passar da previsão), reforçando a regra do dia 31.
- **Relatório mensal** — **todo dia 1º**: total a pagar liberado, valores **por costureira** e os **não liberados** (vencidos).

> Mockups: `43-insumos` · `44-romaneios` · `45-romaneio-pdf` · `46-cadastro-servicos` · `47-whatsapp-mensal` · `48-whatsapp-lembretes`.

## 6. Relatório Individual por Costureira (PDF)
O fechamento mensal também gera **um PDF para cada costureira**, contendo:
- Dados da costureira + período + indicadores.
- **Todos os romaneios do mês** (Nº, pedido, saída, retorno, serviços/qtd, valor, status).
- **Subtotais**: liberado e bloqueado (não voltou até dia 31).
- **Resumo por serviço** (qtd × valor unitário × subtotal).
- **Recibo** com linha de assinatura.

Mockup: `51-relatorio-individual-pdf`. (O `50-relatorio-mensal-pdf` é o consolidado de todas.)

## 7. Tipos de Romaneio (vias) e Visualização
- **Romaneio de Costura**: **2 vias** na mesma página (1ª Empresa / 2ª Costureira), ambas com "Conferido na IDA / no RETORNO". Modelo fiel ao ROM-0135. Mockup: `45-romaneio-pdf`.
- **Romaneio de Tassel**: **3 vias** na mesma página; **somente a 1ª via tem campo de assinatura** (as vias 2 e 3 são controle interno). Mockup: `53-romaneio-tassel`.
- Cabeçalho/colunas idênticos: BiG Home Decor · ROMANEIO Nº · Cliente/Pedido/Costureira/Volumes/Datas · tabela **Serviço · Qtd · Vl Unit. · Vl Total** · TOTAL GERAL · "✂ CORTAR AQUI".

## 8. Visualizar e Baixar PDF (todos os relatórios/romaneios)
- Botão **👁 Visualizar** abre a pré-visualização do PDF na tela antes de baixar.
- Botão **⬇ Baixar PDF** abre **"Salvar PDF como…"** para **escolher o diretório** (Acesso rápido + navegação de pastas), com **nome do arquivo já sugerido**.
- Mockup: `52-pdf-preview`.

## 9. Resumo Mensal de Pagamento (consolidado)
PDF no formato **Resumo Financeiro**: tabela por costureira (Romaneios · Peças · Liberado · Bloqueado), TOTAL, **Total líquido a pagar no mês** e Resumo do período. Mockup: `50-relatorio-mensal-pdf`. (O `51-relatorio-individual-pdf` é o PDF de cada costureira.)
