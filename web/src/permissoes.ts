// Catálogo de PERMISSÕES DE FUNÇÃO (controle fino de botões/ações) — lado do front.
// As CHAVES aqui têm que bater exatamente com src/permissoes.ts (backend). Rótulo e descrição são
// só para a tela. Função nova = adicionar uma linha aqui e a mesma chave no backend.

export interface FuncaoDef { key: string; label: string; desc?: string }
export interface CategoriaFuncao { id: string; titulo: string; icon: string; funcoes: FuncaoDef[] }

export const CATEGORIAS_FUNCAO: CategoriaFuncao[] = [
  {
    id: "pedidos", titulo: "Pedidos", icon: "📦", funcoes: [
      { key: "pedido.criar", label: "Criar pedido", desc: "novo pedido" },
      { key: "pedido.editar", label: "Editar pedido" },
      { key: "pedido.excluir", label: "Excluir pedido", desc: "apagar" },
      { key: "pedido.importar", label: "Importar por PDF" },
      { key: "pedido.etiquetas", label: "Imprimir etiquetas" },
    ],
  },
  {
    id: "producao", titulo: "Produção", icon: "🏭", funcoes: [
      { key: "producao.iniciar", label: "Iniciar produção" },
      { key: "producao.finalizar", label: "Finalizar etapa" },
      { key: "producao.enviar", label: "Enviar p/ próximo setor" },
      { key: "producao.voltar", label: "Voltar etapa" },
      { key: "producao.defeito", label: "Marcar defeito" },
      { key: "producao.devolver", label: "Devolver com defeito" },
      { key: "producao.prioridade", label: "Definir prioridade / urgente" },
      { key: "producao.desmembrar", label: "Desmembrar produção" },
      { key: "producao.revisadora", label: "Escolher revisadora" },
      { key: "producao.historico", label: "Ver histórico" },
    ],
  },
  {
    id: "estoque", titulo: "Estoque", icon: "📊", funcoes: [
      { key: "estoque.entrada", label: "Dar entrada" },
      { key: "estoque.saida", label: "Dar saída / baixa" },
      { key: "estoque.ajuste", label: "Ajustar estoque" },
    ],
  },
  {
    id: "expedicao", titulo: "Expedição", icon: "🚚", funcoes: [
      { key: "expedicao.fase", label: "Alterar fase / status de entrega" },
      { key: "expedicao.romaneio", label: "Gerar romaneio" },
      { key: "expedicao.etiquetas", label: "Imprimir etiquetas" },
    ],
  },
  {
    id: "fiscal", titulo: "Fiscal", icon: "🧾", funcoes: [
      { key: "fiscal.frete", label: "Cotar frete" },
      { key: "fiscal.nf", label: "Marcar NF emitida" },
    ],
  },
  {
    id: "crm", titulo: "CRM / Atendimento", icon: "🤝", funcoes: [
      { key: "crm.assumir", label: "Assumir / puxar conversa" },
      { key: "crm.transferir", label: "Transferir p/ setor" },
      { key: "crm.encerrar", label: "Encerrar / reabrir" },
      { key: "crm.nota", label: "Adicionar nota" },
      { key: "crm.mover", label: "Mover no funil" },
      { key: "crm.excluir_msg", label: "Excluir mensagem" },
      { key: "crm.nova", label: "Nova conversa" },
      { key: "crm.campanha", label: "Criar / agendar campanha" },
    ],
  },
  {
    id: "relatorios", titulo: "Relatórios", icon: "📈", funcoes: [
      { key: "relatorio.acessar", label: "Acessar relatórios" },
      { key: "relatorio.exportar", label: "Exportar Excel" },
    ],
  },
  {
    id: "cadastros", titulo: "Cadastros", icon: "🗂️", funcoes: [
      { key: "cadastro.produtos", label: "Produtos" },
      { key: "cadastro.fios", label: "Fios & cores" },
      { key: "cadastro.tamanhos", label: "Tamanhos" },
      { key: "cadastro.materiais", label: "Materiais" },
      { key: "cadastro.fornecedores", label: "Fornecedores" },
      { key: "cadastro.operadores", label: "Operadores" },
    ],
  },
  {
    id: "pcp", titulo: "PCP", icon: "📋", funcoes: [
      { key: "pcp.liberar", label: "Liberar pedido bloqueado", desc: "tirar o cadeado p/ a Tecelagem" },
    ],
  },
  {
    id: "admin", titulo: "Administração", icon: "🔐", funcoes: [
      { key: "admin.usuarios", label: "Cadastrar / editar usuários" },
      { key: "admin.setores", label: "Cadastrar / editar setores" },
      { key: "admin.permissoes", label: "Alterar permissões" },
    ],
  },
];

// Todas as chaves (para "Marcar TUDO").
export const TODAS_FUNCOES: string[] = CATEGORIAS_FUNCAO.flatMap((c) => c.funcoes.map((f) => f.key));

// Setor → chaves de tela (espelha src/permissoes.ts). Usado para pré-preencher o acesso de um
// usuário legado a partir das telas que ele já enxerga, para que salvar NÃO tire acesso dele.
export const SETOR_PAGINAS: Record<string, string[]> = {
  tecelagem: ["producao"],
  passadoria: ["passadoria"],
  corte: ["corte"],
  costura: ["costura"],
  revisao: ["revisao"],
  estoque: ["estoque"],
  expedicao: ["expedicao"],
  transporte: ["transporte"],
  fiscal: ["fiscal"],
  crm: ["atendimento", "comercial"],
  pcp: [],
};

// Telas gerais (não pertencem a um setor) — controladas por checkbox no cadastro do usuário e
// derivam direto em usuarios.paginas. Setores (produção/fiscal/expedição/estoque/crm) são tratados
// à parte, com ver/editar.
export const TELAS_GERAIS: { key: string; label: string; tv?: boolean }[] = [
  { key: "pedidos", label: "Pedidos" },
  { key: "todos-pedidos", label: "Todos os Pedidos" },
  { key: "produtos", label: "Produtos" },
  { key: "romaneios", label: "Romaneios" },
  { key: "representantes", label: "Representantes" },
  { key: "vendas-dashboard", label: "Vendas (Dashboard)" },
  { key: "treinar-ia", label: "Treinar a IA (Big)" },
  { key: "atendimento-gestor", label: "Atendimento — Gestor" },
  { key: "transporte", label: "Transporte" },
  { key: "cadastros", label: "Cadastros" },
  { key: "tv-dashboard", label: "Painel TV (Dashboard)", tv: true },
  { key: "tv-tecelagem", label: "TV Tecelagem", tv: true },
  { key: "tv-costura", label: "TV Costura", tv: true },
  { key: "tv-revisao", label: "TV Revisão", tv: true },
  { key: "tv-novo-pedido", label: "TV Novo Pedido", tv: true },
];
