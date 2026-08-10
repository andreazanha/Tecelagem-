import { getUser } from "./auth";
// Nome do usuário logado (para auditoria: quem gerou / quem deu retorno).
const quemSou = () => getUser()?.nome || undefined;

// Atalho para POST com corpo JSON (usado nas rotas de produtos/insumos).
const jsonPost = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export interface PedidoItem {
  id?: string;
  produto: string;
  ref?: string | null;
  cor_grade?: string | null;
  tamanho?: string | null;
  qtd: number;
  parte: string;
  kit?: boolean; // marcado como kit (pronta-entrega / estoque)
  origem?: string | null; // número do pedido de origem (OP que junta vários)
  origem_cliente?: string | null; // cliente do pedido de origem (p/ desmembrar mostrar o cliente)
  valor_unit?: number; // preço de venda unitário (qtd × valor_unit = total do item)
}

export interface Pedido {
  id: string;
  numero_erp?: string | null;
  cliente_nome: string;
  vendedor?: string | null;
  codigo_terceiro?: string | null;
  codigo_pai?: string | null;
  tipo: string;
  entrega_pe?: string | null;
  data_pedido?: string | null;
  data_entrega?: string | null;
  data_tecelagem?: string | null;
  observacao?: string | null;
  pdf_key?: string | null;
  status: string;
  created_at: string;
  itens?: number | PedidoItem[];
  pecas?: number;
}

export interface NovoPedidoBody {
  numero_erp?: string;
  cliente_nome: string;
  cliente_cnpj?: string;
  cliente_cidade?: string;
  cliente_uf?: string;
  cliente_fone?: string;
  vendedor?: string;
  codigo_terceiro?: string;
  tipo: string;
  entrega_pe?: string | null;
  reposicao?: boolean;
  data_pedido?: string;
  data_entrega?: string;
  data_tecelagem?: string;
  observacao?: string;
  itens: PedidoItem[];
}

export interface Modelo {
  nome: string;
  parte: number; // 1 ou 2
  ref?: string | null;
  composicao?: string | null; // '100% POLIÉSTER' | '100% ACRÍLICO' | '100% ALGODÃO' | ''
  tassel_peseira?: number; // qtd de tassel (peseira) por peça
  tassel_almofada?: number; // qtd de tassel (almofada) por peça
  etiqueta_colar?: number; // 1 = usa etiqueta de colar (nome·tamanho·cor)
}

export const COMPOSICOES = ["", "100% POLIÉSTER", "100% ACRÍLICO", "100% ALGODÃO"];

export interface Cor {
  nome: string;
  hex?: string | null; // cor visual da bolinha do PDF (ex.: #7a5230)
  foto_key?: string | null; // se tiver foto da cor (amostra real)
  codigo?: string | null; // código da cor (fio)
  fio_id?: string | null; // tipo de fio vinculado
  fio_nome?: string | null; // nome do tipo de fio
  fornecedor_id?: string | null; // fornecedor (via tipo de fio)
  fornecedor_nome?: string | null;
  saldo?: number; // estoque de fio dessa cor, em kg
}

// Detalhe de um produto/modelo: além dos dados básicos, as cores selecionadas
// e os tamanhos com peso (kg de fio por peça) e tempo (min de produção).
export interface ModeloMaterial {
  tamanho: string;
  material_id: string;
  quantidade: number | null;
  categoria?: string;
  nome?: string;
  unidade?: string | null;
  cor?: string | null;
  codigo?: string | null;
  variacao?: string | null;  // variação do material (tamanho do material)
  cor_produto?: string | null; // cor do tricô (produto) ligada a este material — zíper
  extra?: string | null;     // JSON dos campos do material
  preco?: number | null;     // custo unitário do material/fio
  obs?: string | null;
  status?: string | null;    // ativo|inativo
  fonte?: string | null;     // material|fio
}
export interface Colecao {
  id: string;
  nome: string;
  ordem: number;
  produtos?: number;
}
export interface ColecaoProduto {
  modelo_nome: string;
  fio_id: string | null;
  fio_nome?: string | null;
  ref?: string | null;
  parte?: number;
  composicao?: string | null;
}
export interface ModeloDetalhe extends Modelo {
  cores: string[];
  tamanhos: { tamanho: string; peso: number | null; tempo: number | null }[];
  materiais: ModeloMaterial[];
}

export interface ChatMensagem {
  id: string;
  canal: string;
  autor: string;
  texto: string;
  imagem_key?: string | null;
  midia_tipo?: "imagem" | "audio" | "arquivo" | null;
  criado_em: string;
}
export interface ChatDM { canal: string; outro: string }
export interface ChatMembro { id: string; nome: string; telefone: string; tipo?: "interno" | "externo" }
export interface TipoFio {
  id: string;
  nome: string;
  cor?: string | null;
  preco?: number | null; // custo por kg
  fornecedor_id: string | null;
  fornecedor_nome?: string | null;
}

export interface Tamanho {
  id: string;
  nome: string;
  ordem: number;
}

// Materiais (insumos). Categorias agora são CADASTRÁVEIS (slug livre).
export type MaterialCategoria = string;
export interface MaterialCategoriaDef {
  id: string;
  slug: string;
  nome: string;
  cor?: string | null;
  icone?: string | null;
  ordem: number;
  itens?: number; // quantos materiais nessa categoria
}
export interface Material {
  id: string;
  categoria: MaterialCategoria;
  nome: string;
  tamanho?: string | null;
  fornecedor_id?: string | null;
  fornecedor_nome?: string | null;
  cor?: string | null;
  cor_hex?: string | null;
  codigo?: string | null;
  unidade?: string | null;   // un|cm|kg|m
  preco?: number | null;     // custo por unidade
  saldo?: number;            // estoque atual (unidade base)
  caixas?: number;           // contagem de caixas (independente da unidade base)
  minimo?: number;           // estoque mínimo (dispara compra)
  codigo_interno?: string | null; // SKU interno
  status?: string | null;    // ativo|inativo
  obs?: string | null;       // observações
  extra?: string | null;     // JSON dos campos específicos do tipo
}
// Mapa de refil: dada a medida do produto, qual refil usar (NULL = sem refil).
export interface RefilMapa {
  medida_produto: string;
  medida_refil: string | null;
}
// Resultado do "colar em massa" (uma linha = um registro).
export interface BulkResult {
  total: number;
  criados: number;
  ignorados: number;
  sem_senha?: number; // só operadores
  ids: string[];      // ids dos registros CRIADOS (para desfazer)
}
// Sugestão de compra: material com saldo abaixo do mínimo.
export interface CompraSugestao extends Material {
  faltam: number;
}

export interface Tassel {
  cor: string;
  tamanho: string; // G | P | ...
  valor: number; // mão de obra por tassel
}

export interface Prestador {
  id?: string;
  nome: string;
  telefone?: string | null;
  servico?: string | null; // tassel | costura | outro
  obs?: string | null;
  pix?: string | null; // chave Pix (recibo de pagamento)
  cidade?: string | null; // cidade do recebedor (BR Code Pix)
}

export interface Costura {
  nome: string;
  valor: number;
  agrupamento?: string; // peseira_manta | almofada_capa | todas
}

// CRM — cadastro de cliente enriquecido + estatísticas.
export interface ClienteCrm {
  id: string;
  nome: string;
  contato?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cnpj?: string | null;
  representante?: string | null;
  instagram?: string | null;
  observacao?: string | null;
  bloqueado?: number | boolean | null;
  nascimento?: string | null;
  created_at?: string | null;
  ultimo_faturamento?: string | null;
  pedidos?: number;
  total?: number;
  ultima?: string | null;
  ticket?: number;
}
export interface ClientePedido {
  id: string;
  numero: string | null;
  data: string | null;
  valor: number;
  situacao: string;
}
export interface ClienteFicha extends ClienteCrm {
  kpis: { total: number; pedidos: number; ticket: number; ultima: string | null };
  historico: ClientePedido[];
}

// ── CRM Funil de vendas ──────────────────────────────────────────────────────
export type FunilEtapa =
  | "atendimento" | "reativacao" | "prospeccao-enviada" | "catalogo-recebido"
  | "novo-lead" | "primeiro-contato" | "negociacao" | "aguardando-retorno"
  | "pos-venda" | "ativo" | "inativo" | "perdido";
export interface FunilCardBase { conversa_id?: string | null }
export interface FunilCard extends FunilCardBase {
  id: string;
  cliente_id: string | null;
  nome: string;
  cidade: string | null;
  uf: string | null;
  whatsapp: string | null;
  etapa: FunilEtapa;
  responsavel: string | null;
  valor_estimado: number | null;
  probabilidade: number | null;
  retorno_em: string | null;
  motivo_perdido: string | null;
  tentativas: number;
  diasParado: number;
  proxTarefa: { titulo: string; vence_em: string | null } | null;
  semTarefa: boolean;
  alerta: boolean;
  vermelho: boolean;
  retornoVencido: boolean;
  diasSemComprar: number | null;
  faixa: string | null;
}
// ── Robô de atendimento (WhatsApp) ───────────────────────────────────────────
export interface AtendColuna { id: string; label: string; cor: string; custom?: boolean }
export interface AtendConversa {
  id: string; telefone: string; nome: string | null; estado: string; coluna: string;
  setor: string | null; cnpj: string | null; cidade: string | null; uf: string | null;
  lojista: number | null; cliente_id?: string | null; responsavel: string | null; atualizado_em: string; ultima_in_em?: string | null; ultima_out_em?: string | null; encerrado_em?: string | null; coluna_manual?: string | null; ultima_msg: string | null;
  tipo: string | null; representante: string | null; origem: string | null; contato_nome: string | null; autorizado: number | null; interessado: number | null;
  funil_etapa?: string | null; lembrete?: number | null; silenciado?: number | null; agendado_ia?: number | null; agendado_enviado?: number | null; agendado_msg?: string | null; foto_url?: string | null;
  remarket_em?: number | null; remarket_enviado?: number | null; transferido?: number | null;
}
export interface AtendMensagem { id: string; direcao: "in" | "out"; autor: string | null; tipo: string; texto: string | null; responder_texto?: string | null; arquivo_url?: string | null; status?: string | null; criado_em: string }
export interface ArqRapido { id: string; nome: string; nomeArq: string; key: string; ct: string; tamanho: number }
export interface AtendBoard { colunas: AtendColuna[]; conversas: AtendConversa[] }
export interface AtendConversaDetalhe extends AtendConversa { card_id: string | null; nao_perturbe: number | null; bloqueado?: number | null; interesses: string[]; pedidos_resumo: { nome: string; qtd: number; total: number; ultima: string | null } | null; mensagens: AtendMensagem[] }
export interface AtendResposta { conversa_id: string; estado: string; coluna: string; respostas: { tipo: string; texto: string }[]; notificarHumano: boolean }
export interface ZapiConfig { zapi_base: string; zapi_instance: string; zapi_token: string; zapi_client_token: string; zapi_ativo: boolean; atendimento_ativo: boolean; atendimento_ia: boolean; equipe_numeros: string; ia_prompt: string; ia_prompt_padrao: string; catalogo_url: string; catalogo_senha: string; catalogo_msg: string; atend_hora_ini: string; atend_hora_fim: string; atend_domingo: boolean; followup_ativo: boolean; followup_hora_ini: string; followup_hora_fim: string; followup_domingo: boolean; followup_ia: boolean; pos_venda_ativo: boolean; pos_venda_dias: string; recompra_ativo: boolean; recompra_dias: string; reativacao_ativo: boolean; reativacao_dias: string; reativacao_limite: string; reativacao_intervalo_seg: string; reativacao_msg: string; reativacao_msg_padrao: string; aniversario_ativo: boolean; aniversario_msg: string; aniversario_msg_padrao: string; remarket_horas: string; remarket_msg: string; remarket_msg_padrao: string; catalogo_evento_token: string; catalogo_evento_url: string; catalogo_log_url: string; webhook_url: string }

export interface FunilResumo { parados: number; semTarefa: number; retornos: number; alertas: number }
export interface FunilBoard { etapas: FunilEtapa[]; cards: FunilCard[]; resumo: FunilResumo }
export interface FunilTarefa { id: string; titulo: string; vence_em: string | null; responsavel: string | null; feita: number; criado_em: string; feito_em: string | null }
export interface FunilEvento { id: string; tipo: string; texto: string | null; autor: string | null; criado_em: string }
export interface FunilCardDetalhe extends Omit<FunilCard, "diasParado" | "proxTarefa" | "semTarefa" | "alerta" | "vermelho" | "retornoVencido" | "diasSemComprar" | "faixa"> {
  criado_em: string;
  movido_em: string;
  tarefas: FunilTarefa[];
  timeline: FunilEvento[];
  pedidos: { id: string; numero: string | null; data: string | null; valor: number; situacao: string }[];
}

export interface CardProducao {
  pedido_id: string;
  parte: string; // parte-1 | parte-2 | parte-unica | pronta-entrega
  setor?: string;
  status: string; // aguardando | tecendo | pronto | enviado
  pecas: number;
  resumo?: string | null;
  maquina?: string | null;
  operador?: string | null;
  prioridade?: number; // 1 = "passar na frente"
  iniciado_em?: string | null;
  finalizado_em?: string | null;
  numero_erp?: string | null;
  cliente_nome: string;
  codigo_terceiro?: string | null;
  codigo_pai?: string | null;
  data_pedido?: string | null;
  data_entrega?: string | null;
  data_tecelagem?: string | null;
  observacao?: string | null;
  reposicao?: boolean | number; // pedido de reposição (produzir p/ estocar)
  op?: string | null; // OP de origem quando o card foi desmembrado de uma OP consolidada
  // Inteligência de estoque (só em cards de reposição): situação do produto + ordem sugerida.
  est_estoque?: number;
  est_min?: number;
  est_rank?: number; // 1 = fazer primeiro (mais em falta)
  est_urgencia?: "critico" | "baixo" | "atencao" | "ok";
  galga?: 3 | 7; // máquina (galga) sugerida pelo produto — só na Tecelagem
  une_pe?: number; // 1 = pedido misto que se une ao kit de pronta-entrega (junto) na Revisão
  pe_tipo?: string; // "separado" = kit de pronta-entrega vindo do estoque (menu Pronta entrega)
}

// Expedição → Fiscal → Transporte
export interface Volume {
  tipo: string; // Caixa | Fardo
  altura: string;
  largura: string;
  comprimento: string;
  peso: string;
}
export interface CardExpedicao {
  pedido_id: string;
  fase: string; // expedicao | fiscal | transporte
  status: string;
  volumes: string | null; // JSON
  nf_numero: string | null;
  frete: string | null;
  transportadora: string | null;
  entrou_em: string;
  numero_erp: string | null;
  codigo_pai: string | null;
  cliente_nome: string;
  data_pedido: string | null;
  data_entrega: string | null;
  observacao: string | null;
  pecas: number | null;
  partes: string | null;
  resumos: string | null;
}
export interface PedidoTimeline {
  pedido_id: string;
  numero_erp: string | null;
  codigo_pai: string | null;
  cliente_nome: string;
  data_pedido: string | null;
  data_entrega: string | null;
  created_at: string;
  pecas: number;
  tipo: string; // ÚNICO | P1+P2 | KIT | MISTO
  faseAtual: string;
  idx: number;
  statusExp: string | null;
  transportadora: string | null;
  situacoes?: string[]; // situações (colunas) dentro do setor atual
  partesNoSetor?: string[]; // partes presentes no setor atual
  prioridade?: boolean; // tem card marcado como prioridade no setor atual
  passagens: { fase: string; entrouEm: string; duracaoMin: number; atual: boolean }[];
}
export interface ExpedicaoUpdate {
  fase?: string;
  status?: string;
  volumes?: Volume[] | null;
  nf_numero?: string | null;
  frete?: string | null;
  transportadora?: string | null;
}

// Romaneio de costura (simplificado): peseiras/mantas e almofadas/capas somadas.
export interface RomaneioPedido {
  pedido_id: string;
  numero: string;
  cliente_nome: string;
  data_pedido: string | null;
  data_entrega: string | null;
  reposicao: boolean;
  peseirasMantas: number;
  almofadasCapas: number;
  outros: number;
  totalPecas: number;
  valorEstimado?: number; // valor de costura estimado (serviços × peças, do cadastro)
  temTassel?: boolean;
  tasselTasseis?: number;
  tasselValor?: number;
}
export interface RomaneioServico {
  nome: string;
  agrupamento: string;
  qtd: number;
  valorUnit: number;
  total: number;
}
export interface TasselLinha {
  cor: string;
  tamanho: string;
  tasseis: number;
  valorUnit: number;
  total: number;
}
export interface RomaneioData extends RomaneioPedido {
  servicos: RomaneioServico[];
  totalValor: number;
  tassel: { linhas: TasselLinha[]; totalTasseis: number; totalValor: number } | null;
}
export interface RomaneioEmitido {
  pedido_id: string;
  numero: string;
  total_pecas: number;
  total_valor: number;
  data_saida: string | null;
  data_retorno: string | null;
  retornou?: number;
}
export interface DescontoLancado {
  id: string;
  pessoa: string;
  descricao: string | null;
  valor: number;
  data: string | null;
}
export interface PagamentoCostureira {
  costureira: string;
  romaneios: RomaneioEmitido[];
  totalPecas: number;
  totalValor: number;
  pendentes?: number;
  pendentePecas?: number;
  pendenteValor?: number;
  descontosValor?: number;
  liquido?: number;
  descontos?: DescontoLancado[];
}
export interface PagamentoData {
  mes: string;
  tipo?: string;
  grupos: PagamentoCostureira[];
  totalGeral: number;
}
export interface EmitidoRomaneio {
  tipo: string; // costura | tassel
  pedido_id: string;
  numero: string;
  cliente: string | null;
  pessoa: string | null;
  volumes: string | null;
  qtd: number;
  total_valor: number;
  data_saida: string | null;
  data_retorno: string | null;
  data_retorno_real: string | null;
  retornou: number;
  gerado_por?: string | null; // quem emitiu o romaneio
  retorno_por?: string | null; // quem marcou o retorno
  retorno_em?: string | null; // data/hora do retorno (UTC)
  updated_at?: string | null; // data/hora da última geração (UTC)
}

export interface Sugestao {
  numero_erp?: string;
  cliente_nome?: string;
  cliente_cnpj?: string;
  cliente_cidade?: string;
  cliente_uf?: string;
  cliente_fone?: string;
  vendedor?: string;
  data_pedido?: string;
  data_entrega?: string;
  reposicao?: boolean;
  itens: PedidoItem[];
  confianca: number;
  texto: string;
  metodo: "texto" | "ocr" | "nenhum";
}

export interface DashboardData {
  hoje: { pedidos: number; pecas: number; atrasados: number; entregaProxima: number; finalizados: number; eficiencia: number };
  producao: {
    aguardando_tecelagem: number; em_tecelagem: number;
    aguardando_passadoria: number; em_passadoria: number;
    aguardando_corte: number; em_corte: number;
    costura: number; revisao: number; expedicao: number;
  };
  urgentes: { numero: string | null; cliente: string; data_entrega: string | null; atrasado: number; etapa: string | null }[];
  ranking: { etapa: string; qtd: number }[];
  expedicao: { prontos: number; aguardando_nf: number; enviados_hoje: number };
  esteira: { setor: string; total: number; fazendo: number; aguardando: number; pecas: number }[];
  graficos: {
    pedidosPorEtapa: { etapa: string; qtd: number }[];
    pecasPorEtapa: { etapa: string; pecas: number }[];
    pedidosPorDia: { dia: string; qtd: number }[];
    pecasSemana: { dia: string; pecas: number }[];
    statusPrazo: { atrasados: number; hoje: number; amanha: number; emDia: number };
    topRepresentantes: { nome: string; qtd: number }[];
    topClientes: { nome: string; pecas: number }[];
    hojeOntem: { hoje: number; ontem: number };
    metaMes: { realizadoPedidos: number; realizadoPecas: number };
  };
  avisos: { id: string; texto: string }[];
  eventos: { tipo: "entrou" | "expedido" | "atrasado"; numero: string | null; cliente: string }[];
  ultimoPedido: { id: string; numero: string | null; cliente: string; vendedor: string | null; data_entrega: string | null; pecas: number; created_at: string } | null;
  geradoEm: string;
}

export interface TvCosturaData {
  topo: {
    costureirasAtivas: number; costureirasTotal: number; pedidosComCostureiras: number;
    pecasEmCostura: number; finalizadosHoje: number; acumuladoAno: number;
    maquinasOperacao: number; maquinasTotal: number;
  };
  status: { emCostura: number; aguardando: number; emRevisao: number; finalizadosHoje: number };
  costureiras: { nome: string; qtdPedidos: number; qtdPecas: number; emCostura: string | null; aguardando: string[]; datas: string[] }[];
  tipos: { nome: string; pedidos: number; pct: number }[];
  ultimosFinalizados: { numero: string | null; cliente: string; pecas: number; finalizado_em: string | null }[];
  proximosPrazos: { numero: string | null; cliente: string; data_entrega: string | null }[];
  avisos: { texto: string }[];
  geradoEm: string;
}

export interface TvRevisaoData {
  topo: {
    revisadorasAtivas: number; revisadorasTotal: number; pedidosEmRevisao: number; pecasEmRevisao: number;
    totalDia: number; totalMes: number; totalAno: number;
  };
  status: { emRevisao: number; aguardando: number; finalizadosHoje: number };
  revisadoras: { nome: string; qtdPedidos: number; qtdPecas: number; emRevisao: string | null; aguardando: string[]; datas: string[] }[];
  ultimosFinalizados: { numero: string | null; cliente: string; pecas: number; finalizado_em: string | null }[];
  proximosPrazos: { numero: string | null; cliente: string; data_entrega: string | null }[];
  avisos: { texto: string }[];
  geradoEm: string;
}

export interface TvTecelagemData {
  topo: { aguardando: number; emTecimento: number; finalizadosHoje: number };
  pecas: { hoje: number; mes: number; ano: number; maquinasEmUso: number; maquinasTotal: number };
  emProducao: { numero: string | null; cliente: string; quantidade: number; dataInicio: string | null; previsao: string | null }[];
  pedidoAtual: { numero: string | null; cliente: string; quantidade: number; entrega: string | null; inicio: string | null } | null;
  topProdutos: { nome: string; pecas: number }[];
  atualizacoes: { numero: string | null; status: string; ts: string | null }[];
  geradoEm: string;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface RelatorioVendas {
  resumo: { pecas: number; valor: number; pedidos: number; modelos: number } | null;
  modelos: { produto: string; kit: number; pecas: number; valor: number; cores: number; tamanhos: number }[];
  cores: { cor: string; pecas: number; valor: number }[];
  tamanhos: { tamanho: string; pecas: number; valor: number }[];
  combos: { produto: string; kit: number; cor: string; tamanho: string; pecas: number; valor: number }[];
  porModeloCor: { produto: string; cor: string; pecas: number }[];
  porModeloTam: { produto: string; tamanho: string; pecas: number }[];
}

export interface MaquinaTec { id: string; nome: string; ordem: number; ativo: number }
export interface MotivoTec { id: string; codigo: string; nome: string | null; tipo: string; ordem: number; ativo: number }
export interface ResumoTec {
  mes: string;
  maquinas: {
    maquina_id: string; nome: string; media: number | null; turnos: number;
    minParada: number; minLimpeza: number; minManutencao: number; motivos: Record<string, number>;
  }[];
}

export const api = {
  relatorioVendas: (de?: string, ate?: string, kits?: "todos" | "so" | "sem") => {
    const q = new URLSearchParams();
    if (de) q.set("de", de); if (ate) q.set("ate", ate); if (kits) q.set("kits", kits);
    return fetch("/api/relatorios/vendas?" + q.toString()).then((r) => j<RelatorioVendas>(r));
  },

  // ── Controle da Tecelagem ──────────────────────────────────────────────────
  listarMaquinasTec: () => fetch("/api/tecelagem/maquinas").then((r) => j<MaquinaTec[]>(r)),
  salvarMaquinaTec: (b: { id?: string; nome: string; ordem?: number; ativo?: boolean }) =>
    jsonPost("/api/tecelagem/maquinas", b).then((r) => j<{ id: string }>(r)),
  excluirMaquinaTec: (id: string) =>
    fetch(`/api/tecelagem/maquinas/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  listarMotivosTec: () => fetch("/api/tecelagem/motivos").then((r) => j<MotivoTec[]>(r)),
  salvarMotivoTec: (b: { id?: string; codigo: string; nome?: string; tipo?: string; ordem?: number }) =>
    jsonPost("/api/tecelagem/motivos", b).then((r) => j<{ id: string; codigo: string }>(r)),
  excluirMotivoTec: (id: string) =>
    fetch(`/api/tecelagem/motivos/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  getRegistroTec: (maquina_id: string, data: string, turno: string) =>
    fetch(`/api/tecelagem/registro?maquina_id=${encodeURIComponent(maquina_id)}&data=${data}&turno=${turno}`)
      .then((r) => j<{ registro: { id: string; percentual: number | null; operador: string | null; obs: string | null } | null; paradas: Record<string, number> }>(r)),
  salvarRegistroTec: (b: { maquina_id: string; data: string; turno: string; percentual?: number | null; operador?: string; obs?: string; paradas: Record<string, number> }) =>
    jsonPost("/api/tecelagem/registro", b).then((r) => j<{ id: string }>(r)),
  resumoTec: (mes: string) => fetch(`/api/tecelagem/resumo?mes=${mes}`).then((r) => j<ResumoTec>(r)),
  listarPedidos: () => fetch("/api/pedidos").then((r) => j<Pedido[]>(r)),
  obterPedido: (id: string) => fetch(`/api/pedidos/${id}`).then((r) => j<Pedido>(r)),
  excluirPedido: (id: string) =>
    fetch(`/api/pedidos/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  criarPedido: (body: NovoPedidoBody) =>
    fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ id: string }>(r)),
  atualizarPedido: (id: string, body: NovoPedidoBody) =>
    fetch(`/api/pedidos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ ok: boolean }>(r)),
  enviarPdfs: (id: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("file", f);
    return fetch(`/api/pedidos/${id}/pdf`, { method: "POST", body: fd }).then((r) =>
      j<{ ok: boolean; total: number }>(r)
    );
  },
  listarOriginais: (id: string) =>
    fetch(`/api/pedidos/${id}/originais`).then((r) =>
      j<{ arquivos: { nome: string; url: string }[] }>(r)
    ),
  listarClientes: () => fetch("/api/clientes").then((r) => j<{ id: string; nome: string }[]>(r)),
  // CRM: lista com estatísticas, ficha 360 e salvar.
  listarClientesCrm: () => fetch("/api/clientes?crm=1").then((r) => j<ClienteCrm[]>(r)),
  obterCliente: (id: string) => fetch(`/api/clientes/${id}`).then((r) => j<ClienteFicha>(r)),
  salvarCliente: (b: Partial<ClienteCrm>) =>
    jsonPost("/api/clientes", b).then((r) => j<{ id: string; nome: string }>(r)),
  importarClientes: (b: { representante?: string; clientes: Record<string, string>[] }) =>
    jsonPost("/api/clientes/importar", b).then((r) => j<{ ok?: boolean; criados?: number; atualizados?: number; ignorados?: number; error?: string }>(r)),
  // CRM Funil de vendas
  funilBoard: () => fetch("/api/funil").then((r) => j<FunilBoard>(r)),
  sincronizarFunil: () => jsonPost("/api/funil/sincronizar", {}).then((r) => j<{ criados: number; removidos: number; ignorados: number }>(r)),
  reativarFunil: (dias?: number) => jsonPost(`/api/funil/reativacao${dias ? `?dias=${dias}` : ""}`, {}).then((r) => j<{ criados: number; dias: number }>(r)),
  assumirCliente: (cardId: string) => jsonPost(`/api/funil/${cardId}/assumir`, { autor: quemSou() }).then((r) => j<{ ok: boolean; error?: string }>(r)),
  excluirCard: (id: string) => fetch(`/api/funil/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  // Lojas parceiras (vitrine)
  parceiros: () => fetch("/api/parceiros").then((r) => j<LojaParceira[]>(r)),
  salvarParceiro: (b: Partial<LojaParceira>) => jsonPost("/api/parceiros", b).then((r) => j<{ ok: boolean; id: string }>(r)),
  excluirParceiro: (id: string) => fetch(`/api/parceiros/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  aprovarParceiro: (id: string) => jsonPost(`/api/parceiros/${encodeURIComponent(id)}/aprovar`, {}).then((r) => j<{ ok: boolean }>(r)),
  aprovarTodosParceiros: (filtro?: { uf?: string; cidade?: string }) => jsonPost("/api/parceiros/aprovar-todos", filtro ?? {}).then((r) => j<{ ok: boolean; aprovadas: number }>(r)),
  recusarParceiro: (id: string) => jsonPost(`/api/parceiros/${encodeURIComponent(id)}/recusar`, {}).then((r) => j<{ ok: boolean }>(r)),
  importarClientesParceiros: () => jsonPost("/api/parceiros/importar-clientes", {}).then((r) => j<{ ok: boolean; criados: number }>(r)),
  // Treino da Big (base de conhecimento)
  conhecimento: () => fetch("/api/atendimento/conhecimento").then((r) => j<IaConhecimento[]>(r)),
  salvarConhecimento: (b: Partial<IaConhecimento>) => jsonPost("/api/atendimento/conhecimento", b).then((r) => j<{ ok: boolean; id: string }>(r)),
  excluirConhecimento: (id: string) => fetch(`/api/atendimento/conhecimento/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  // Setores do atendimento
  atendSetores: () => fetch("/api/atendimento/setores").then((r) => j<AtendSetor[]>(r)),
  atendSalvarSetor: (b: { id?: string; nome: string; membros: string[]; ativo?: boolean }) => jsonPost("/api/atendimento/setores", b).then((r) => j<{ ok: boolean; id: string }>(r)),
  atendExcluirSetor: (id: string) => fetch(`/api/atendimento/setores/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  // Painel do gestor
  atendPainel: () => fetch("/api/atendimento/painel").then((r) => j<AtendPainel>(r)),
  abrirConversaDoCard: (b: { telefone?: string | null; nome?: string | null; card_id?: string; cliente_id?: string; criar_card?: boolean; destino?: "prospeccao" | "atendimento" }) =>
    jsonPost("/api/atendimento/abrir-conversa", b).then((r) => j<{ id?: string; card_id?: string | null; error?: string }>(r)),
  // Robô de atendimento (WhatsApp)
  atendBoard: (usuario?: string, gestor?: boolean) => fetch(`/api/atendimento?usuario=${encodeURIComponent(usuario || "")}&gestor=${gestor ? 1 : 0}`).then((r) => j<AtendBoard>(r)),
  atendColunas: () => fetch("/api/atendimento/colunas").then((r) => j<{ colunas: AtendColuna[] }>(r)),
  atendSalvarColunas: (extra: { id?: string; label: string; cor: string }[], ordem: string[]) =>
    jsonPost("/api/atendimento/colunas", { extra, ordem }).then((r) => j<{ ok: boolean; colunas: AtendColuna[] }>(r)),
  atendMoverColuna: (id: string, coluna: string) =>
    jsonPost(`/api/atendimento/${id}/coluna`, { coluna }).then((r) => j<{ ok: boolean }>(r)),
  atendEncerrar: (id: string, autor?: string, reabrir?: boolean) =>
    jsonPost(`/api/atendimento/${id}/encerrar`, { autor, reabrir }).then((r) => j<{ ok: boolean }>(r)),
  atendFotoPerfil: (id: string) => fetch(`/api/atendimento/${id}/foto-perfil`).then((r) => j<{ link: string | null }>(r)),
  atendCampanhas: () => fetch("/api/atendimento/campanhas").then((r) => j<{ id: string; nome: string | null; mensagem: string; intervalo_seg: number; status: string; criado_em: string; total: number; enviados: number; pendentes: number; falhas: number; arquivo_url: string | null; arquivo_tipo: string | null; arquivo_nome: string | null; arquivo_ext: string | null }[]>(r)),
  atendCampanhaAlvos: (id: string) => fetch(`/api/atendimento/campanhas/${id}/alvos`).then((r) => j<{ alvos: { telefone: string; nome: string | null }[] }>(r)),
  atendCriarCampanha: (b: { nome?: string; mensagem: string; intervalo_seg: number; alvos: { telefone: string; nome?: string }[]; rascunho?: boolean; arquivo_url?: string; arquivo_tipo?: string; arquivo_nome?: string; arquivo_ext?: string }) =>
    jsonPost("/api/atendimento/campanhas", b).then((r) => j<{ ok: boolean; id: string; total: number; error?: string }>(r)),
  atendCampanhaUpload: (file: File) => { const fd = new FormData(); fd.append("file", file); return fetch("/api/atendimento/campanhas/upload", { method: "POST", body: fd }).then((r) => j<{ ok: boolean; url: string; tipo: string; nome: string; ext: string; error?: string }>(r)); },
  atendInteressesContatos: () =>
    fetch("/api/atendimento/interesses-contatos").then((r) => j<{ contatos: { telefone: string; palavras: string }[] }>(r)),
  atendStatusCampanha: (id: string, status: string) =>
    jsonPost(`/api/atendimento/campanhas/${id}/status`, { status }).then((r) => j<{ ok: boolean }>(r)),
  atendDispararCampanha: (id: string) =>
    jsonPost(`/api/atendimento/campanhas/${id}/disparar`, {}).then((r) => j<{ ok: boolean; enviado?: boolean; motivo?: string }>(r)),
  atendEditarCampanha: (id: string, b: { nome?: string; mensagem: string; intervalo_seg: number; arquivo_url?: string; arquivo_tipo?: string; arquivo_nome?: string; arquivo_ext?: string }) =>
    jsonPost(`/api/atendimento/campanhas/${id}/editar`, b).then((r) => j<{ ok: boolean; error?: string }>(r)),
  atendContatosEmCampanha: () =>
    fetch("/api/atendimento/campanhas/em-campanha").then((r) => j<{ telefones: string[] }>(r)),
  atendConversa: (id: string) => fetch(`/api/atendimento/${id}`).then((r) => j<AtendConversaDetalhe>(r)),
  atendEntrada: (b: { telefone: string; texto: string }) =>
    jsonPost("/api/atendimento/entrada", b).then((r) => j<AtendResposta>(r)),
  atendReset: (telefone: string) =>
    jsonPost("/api/atendimento/reset", { telefone }).then((r) => j<{ ok: boolean; removida: boolean }>(r)),
  atendAssumir: (id: string, responsavel: string, pendente?: boolean) =>
    jsonPost(`/api/atendimento/${id}/assumir`, { responsavel, pendente }).then((r) => j<{ ok: boolean }>(r)),
  atendIaAssumir: (id: string) =>
    jsonPost(`/api/atendimento/${id}/ia-assumir`, {}).then((r) => j<{ ok: boolean; ia_ligada: boolean; respondeu: boolean }>(r)),
  atendLembrete: (id: string, on?: boolean) =>
    jsonPost(`/api/atendimento/${id}/lembrete`, on === undefined ? {} : { on }).then((r) => j<{ ok: boolean; lembrete: boolean }>(r)),
  atendSilenciar: (id: string, on?: boolean) =>
    jsonPost(`/api/atendimento/${id}/silenciar`, on === undefined ? {} : { on }).then((r) => j<{ ok: boolean; silenciado: boolean }>(r)),
  atendJuntarDuplicados: () =>
    jsonPost("/api/atendimento/juntar-duplicados", {}).then((r) => j<{ ok: boolean; mesclados: number; removidos: number }>(r)),
  atendAgendarIa: (id: string, quando: number | null, mensagem?: string) =>
    jsonPost(`/api/atendimento/${id}/agendar-ia`, quando === null ? { cancelar: true } : { quando, mensagem }).then((r) => j<{ ok: boolean; agendado: number | null }>(r)),
  atendExcluirMsg: (id: string, msgId: string, paraTodos: boolean) =>
    jsonPost(`/api/atendimento/${id}/mensagem/${msgId}/excluir`, { paraTodos }).then((r) => j<{ ok: boolean; paraTodos: boolean; revogada: boolean; motivo?: string }>(r)),
  atendEncaminharMsg: (id: string, msgId: string, dest: { telefone?: string; conversaId?: string }) =>
    jsonPost(`/api/atendimento/${id}/mensagem/${msgId}/encaminhar`, dest).then((r) => j<{ ok: boolean }>(r)),
  atendEditarMsg: (id: string, msgId: string, texto: string) =>
    jsonPost(`/api/atendimento/${id}/mensagem/${msgId}/editar`, { texto }).then((r) => j<{ ok: boolean; editadoZap: boolean; motivo?: string }>(r)),
  atendContatosWhatsapp: () =>
    fetch("/api/atendimento/contatos-whatsapp").then((r) => j<{ contatos: { nome: string; telefone: string; foto?: string | null }[]; erro?: string }>(r)),
  atendNovaConversa: (b: { telefone: string; texto: string; nome?: string; responsavel?: string }) =>
    jsonPost("/api/atendimento/nova-conversa", b).then((r) => j<{ ok: boolean; conversa_id: string; error?: string }>(r)),
  atendEnviarCatalogo: (id: string) =>
    jsonPost(`/api/atendimento/${id}/enviar-catalogo`, {}).then((r) => j<{ ok: boolean }>(r)),
  atendSalvarEquipe: (equipe_numeros: string) =>
    jsonPost("/api/atendimento/config", { equipe_numeros }).then((r) => j<{ ok: boolean }>(r)),
  atendEnviar: (id: string, b: { texto: string; autor?: string; responder_a?: string }) =>
    jsonPost(`/api/atendimento/${id}/enviar`, b).then((r) => j<{ ok: boolean }>(r)),
  atendRespostas: () =>
    fetch(`/api/atendimento/respostas?u=${encodeURIComponent(getUser()?.usuario || "")}`).then((r) => j<{ titulo: string; texto: string }[]>(r)),
  atendSalvarRespostas: (respostas: { titulo: string; texto: string }[]) =>
    jsonPost("/api/atendimento/respostas", { usuario: getUser()?.usuario || "", respostas }).then((r) => j<{ ok: boolean; respostas: { titulo: string; texto: string }[] }>(r)),
  atendRespostasEmpresa: () =>
    fetch("/api/atendimento/respostas-empresa").then((r) => j<{ titulo: string; texto: string }[]>(r)),
  atendSalvarRespostasEmpresa: (respostas: { titulo: string; texto: string }[]) =>
    jsonPost("/api/atendimento/respostas-empresa", { respostas }).then((r) => j<{ ok: boolean; respostas: { titulo: string; texto: string }[] }>(r)),
  atendAutorizar: (id: string, representante?: string) =>
    jsonPost(`/api/atendimento/${id}/autorizar`, { representante }).then((r) => j<{ ok: boolean; representante: string }>(r)),
  atendNaoPerturbe: (id: string, nao_perturbe: boolean) =>
    jsonPost(`/api/atendimento/${id}/nao-perturbe`, { nao_perturbe }).then((r) => j<{ ok: boolean }>(r)),
  atendSalvarDados: (id: string, b: { contato_nome?: string; nome?: string; setor?: string; cnpj?: string; cidade?: string; uf?: string; lojista?: string }) =>
    jsonPost(`/api/atendimento/${id}/dados`, b).then((r) => j<{ ok: boolean }>(r)),
  atendNota: (id: string, b: { texto: string; autor?: string }) =>
    jsonPost(`/api/atendimento/${id}/nota`, b).then((r) => j<{ ok: boolean }>(r)),
  atendEnviarArquivo: (id: string, file: File, autor?: string, legenda?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (autor) fd.append("autor", autor);
    if (legenda) fd.append("legenda", legenda);
    // Tempo-limite: em conexão instável (tablet), o upload podia ficar "Enviando…" pra sempre.
    // Aborta em 90s e devolve um erro claro pra o botão destravar.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90000);
    return fetch(`/api/atendimento/${id}/enviar-arquivo`, { method: "POST", body: fd, signal: ctrl.signal })
      .then((r) => j<{ ok: boolean; enviado: boolean; motivo?: string; url: string }>(r))
      .catch((e) => { if ((e as Error)?.name === "AbortError") throw new Error("demorou demais (conexão lenta). Tente de novo."); throw e; })
      .finally(() => clearTimeout(t));
  },
  atendSugerir: (id: string) =>
    jsonPost(`/api/atendimento/${id}/sugerir`, {}).then((r) => j<{ sugestao: string }>(r)),
  atendArquivosRapidos: () => fetch("/api/atendimento/arquivos-rapidos").then((r) => j<{ arquivos: ArqRapido[] }>(r)),
  atendSalvarArquivoRapido: (file: File, nome?: string) => { const fd = new FormData(); fd.append("file", file); if (nome) fd.append("nome", nome); return fetch("/api/atendimento/arquivos-rapidos", { method: "POST", body: fd }).then((r) => j<{ ok: boolean; arquivos: ArqRapido[]; error?: string }>(r)); },
  atendExcluirArquivoRapido: (aid: string) => fetch(`/api/atendimento/arquivos-rapidos/${encodeURIComponent(aid)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean; arquivos: ArqRapido[] }>(r)),
  atendEnviarRapido: (id: string, aid: string, autor?: string) => jsonPost(`/api/atendimento/${id}/enviar-rapido`, { aid, autor }).then((r) => j<{ ok: boolean; error?: string }>(r)),
  atendConfig: () => fetch("/api/atendimento/config").then((r) => j<ZapiConfig>(r)),
  atendSalvarConfig: (b: Partial<Omit<ZapiConfig, "webhook_url">>) =>
    jsonPost("/api/atendimento/config", b).then((r) => j<{ ok: boolean }>(r)),
  atendTestarZapi: (telefone: string) =>
    jsonPost("/api/atendimento/config/testar", { telefone }).then((r) => j<{ enviado: boolean; motivo?: string }>(r)),
  atendTestarIa: () =>
    jsonPost("/api/atendimento/ia-teste", {}).then((r) => j<{ ok: boolean; ia_ligada: boolean; erro?: string; tentativas: { modelo: string; ok: boolean; resposta?: string; erro?: string }[] }>(r)),
  atendSincronizarCatalogo: () =>
    jsonPost("/api/atendimento/sincronizar-catalogo", {}).then((r) => j<{ ok: boolean; novos: number; backfill?: number; logTotal?: number; logErro?: string; logUrl?: string; catalogoConversas?: number; ultimoTs?: string }>(r)),
  funilCard: (id: string) => fetch(`/api/funil/${id}`).then((r) => j<FunilCardDetalhe>(r)),
  criarCard: (b: { nome: string; whatsapp: string; cidade?: string; uf?: string; responsavel?: string; cliente_id?: string }) =>
    jsonPost("/api/funil", b).then((r) => j<{ id: string; nome: string }>(r)),
  atualizarCard: (id: string, b: Record<string, unknown>) =>
    fetch(`/api/funil/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => j<{ ok: boolean }>(r)),
  addTarefaFunil: (id: string, b: { titulo: string; vence_em?: string; responsavel?: string }) =>
    jsonPost(`/api/funil/${id}/tarefa`, b).then((r) => j<{ id: string }>(r)),
  concluirTarefaFunil: (tid: string) =>
    jsonPost(`/api/funil/tarefa/${tid}/concluir`, {}).then((r) => j<{ ok: boolean }>(r)),
  addEventoFunil: (id: string, b: { tipo: string; texto: string; autor?: string }) =>
    jsonPost(`/api/funil/${id}/evento`, b).then((r) => j<{ ok: boolean }>(r)),
  listarModelos: () => fetch("/api/modelos").then((r) => j<Modelo[]>(r)),
  // Lê um PDF de pedido (sem salvar) e devolve os itens — usado para testar a
  // impressão de etiquetas a partir de um arquivo, sem depender de pedido salvo.
  importarPedidoPdf: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/pedidos/importar", { method: "POST", body: fd }).then((r) =>
      j<{ numero_erp?: string; cliente_nome?: string; itens: { produto: string; ref?: string; cor_grade?: string; tamanho?: string; qtd: number; parte: string }[]; metodo: string }>(r));
  },
  // Etiquetas (impressão A4) de um ou mais pedidos — só itens de produção.
  etiquetasPedidos: (ids: string[]) =>
    fetch("/api/pedidos/etiquetas?ids=" + encodeURIComponent(ids.join(","))).then((r) => j<{ pedido_id: string; pedido: string | null; cliente: string; modelo: string; tamanho: string | null; cor: string | null; qtd: number; composicao: string | null; ref: string | null; kit: number }[]>(r)),
  // Estoque das etiquetas de colar (por produto · tamanho · cor).
  listarEstoqueEtiquetas: (produto: string) =>
    fetch("/api/etiquetas?produto=" + encodeURIComponent(produto)).then((r) => j<{ tamanho: string; cor: string; saldo: number; minimo: number }[]>(r)),
  entradaEtiquetas: (produto: string, itens: { tamanho: string; cor: string; quantidade: number }[]) =>
    jsonPost("/api/etiquetas/entrada", { produto, itens }).then((r) => j<{ ok: boolean; itens: number }>(r)),
  // Modelos de etiqueta (config da folha) salvos no servidor — sincronizam entre computadores.
  listarPresetsEtiqueta: () => fetch("/api/etiquetas/presets").then((r) => j<{ nome: string; cfg: Record<string, number | string> }[]>(r)),
  salvarPresetEtiqueta: (nome: string, cfg: unknown) =>
    jsonPost("/api/etiquetas/presets", { nome, cfg }).then((r) => j<{ ok: boolean; nome: string }>(r)),
  excluirPresetEtiqueta: (nome: string) =>
    fetch(`/api/etiquetas/presets/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  obterModelo: (nome: string) =>
    fetch(`/api/modelos/${encodeURIComponent(nome)}`).then((r) => j<ModeloDetalhe>(r)),
  salvarModelo: (
    m: Modelo & { cores?: string[]; tamanhos?: { tamanho: string; peso: number | null; tempo: number | null }[]; materiais?: { tamanho: string; material_id: string; quantidade: number | null; unidade?: string | null; obs?: string | null; status?: string; fonte?: string; cor_produto?: string | null }[] },
    de?: string
  ) =>
    fetch("/api/modelos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(de && de !== m.nome ? { ...m, de } : m),
    }).then((r) => j<Modelo>(r)),
  importarModelos: (itens: { nome: string; ref?: string }[]) =>
    fetch("/api/modelos/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens }),
    }).then((r) => j<{ ok: boolean; total: number }>(r)),
  excluirModelo: (nome: string) =>
    fetch(`/api/modelos/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  // ── Coleções ──────────────────────────────────────────────────────────────
  listarColecoes: () => fetch("/api/colecoes").then((r) => j<Colecao[]>(r)),
  salvarColecao: (b: { id?: string; nome: string; ordem?: number }) =>
    jsonPost("/api/colecoes", b).then((r) => j<Colecao>(r)),
  excluirColecao: (id: string) =>
    fetch(`/api/colecoes/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  produtosDaColecao: (id: string) =>
    fetch(`/api/colecoes/${encodeURIComponent(id)}/produtos`).then((r) => j<ColecaoProduto[]>(r)),
  salvarProdutosColecao: (id: string, produtos: { modelo_nome: string; fio_id?: string | null }[]) =>
    jsonPost(`/api/colecoes/${encodeURIComponent(id)}/produtos`, { produtos }).then((r) => j<{ ok: boolean; total: number }>(r)),
  listarCores: () => fetch("/api/cores").then((r) => j<Cor[]>(r)),
  // Estoque de fio por cor (kg): entrada/baixa/ajuste + extrato.
  movFio: (nome: string, b: { tipo: "entrada" | "baixa" | "ajuste"; quantidade: number; motivo?: string }) =>
    jsonPost(`/api/cores/${encodeURIComponent(nome)}/mov`, b).then((r) => j<{ nome: string; saldo: number }>(r)),
  movimentosFio: (nome: string) =>
    fetch(`/api/cores/${encodeURIComponent(nome)}/movimentos`).then((r) => j<{ tipo: string; quantidade: number; motivo: string | null; pedido_id: string | null; criado_em: string }[]>(r)),
  bulkCores: (texto: string, fio_id: string | null) =>
    jsonPost("/api/cores/bulk", { texto, fio_id }).then((r) => j<{ total: number; criados: number; ignorados: number; cores: string[] }>(r)),
  salvarCor: (cor: Cor & { de?: string }) =>
    fetch("/api/cores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cor),
    }).then((r) => j<Cor>(r)),
  excluirCor: (nome: string) =>
    fetch(`/api/cores/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  atribuirFioCores: (fio_id: string | null, cores: string[]) =>
    jsonPost("/api/cores/atribuir-fio", { fio_id, cores }).then((r) => j<{ ok: boolean; atualizadas: number }>(r)),
  // Chat interno da equipe
  listarChat: (canal: string) => fetch(`/api/chat/${encodeURIComponent(canal)}`).then((r) => j<ChatMensagem[]>(r)),
  enviarChat: (canal: string, autor: string, texto: string) =>
    jsonPost(`/api/chat/${encodeURIComponent(canal)}`, { autor, texto }).then((r) => j<{ id: string }>(r)),
  naoLidasChat: (desde: string, autor: string) =>
    fetch(`/api/chat/nao-lidas?desde=${encodeURIComponent(desde)}&autor=${encodeURIComponent(autor)}`).then((r) => j<{ nao_lidas: number; ultima: ChatMensagem | null }>(r)),
  contatosChat: () => fetch("/api/chat/contatos").then((r) => j<string[]>(r)),
  dmsChat: (me: string) => fetch(`/api/chat/dms?me=${encodeURIComponent(me)}`).then((r) => j<ChatDM[]>(r)),
  dmResumoChat: (me: string) => fetch(`/api/chat/dm-resumo?me=${encodeURIComponent(me)}`).then((r) => j<{ outro: string; canal: string; ultima_em: string; ultimo_autor: string; nao_lido: boolean }[]>(r)),
  marcarLidoChat: (usuario: string, canal: string) =>
    jsonPost("/api/chat/marcar-lido", { usuario, canal }).then((r) => j<{ ok: boolean }>(r)),
  // Membros da equipe por OUTRO número de WhatsApp (canal ext:<id>).
  chatMembros: () => fetch("/api/chat/membros").then((r) => j<ChatMembro[]>(r)),
  addChatMembro: (nome: string, telefone: string, tipo: "interno" | "externo" = "externo") =>
    jsonPost("/api/chat/membros", { nome, telefone, tipo }).then((r) => j<ChatMembro>(r)),
  delChatMembro: (id: string) => fetch(`/api/chat/membros/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  // O tipo (imagem/audio/arquivo) é deduzido no servidor pelo content-type do arquivo.
  enviarFotoChat: (canal: string, autor: string, file: File, texto?: string) => {
    const fd = new FormData();
    fd.append("file", file); fd.append("autor", autor); if (texto) fd.append("texto", texto);
    return fetch(`/api/chat/${encodeURIComponent(canal)}/foto`, { method: "POST", body: fd }).then((r) => j<{ id: string; imagem_key: string; midia_tipo: string }>(r));
  },
  listarTiposFio: () => fetch("/api/tipos-fio").then((r) => j<TipoFio[]>(r)),
  salvarTipoFio: (b: { id?: string; nome: string; fornecedor_id: string | null; cor?: string | null; preco?: number | null }) =>
    jsonPost("/api/tipos-fio", b).then((r) => j<TipoFio>(r)),
  excluirTipoFio: (id: string) =>
    fetch(`/api/tipos-fio/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  listarTamanhos: () => fetch("/api/tamanhos").then((r) => j<Tamanho[]>(r)),
  salvarTamanho: (b: { id?: string; nome: string; ordem: number }) =>
    jsonPost("/api/tamanhos", b).then((r) => j<Tamanho>(r)),
  bulkTamanhos: (texto: string) =>
    jsonPost("/api/tamanhos/bulk", { texto }).then((r) => j<{ total: number; criados: number; ignorados: number; ordenados: string[] }>(r)),
  listarMateriais: (categoria?: string) =>
    fetch("/api/materiais" + (categoria ? `?categoria=${categoria}` : "")).then((r) => j<Material[]>(r)),
  salvarMaterial: (b: Partial<Material>) =>
    jsonPost("/api/materiais", b).then((r) => j<{ id: string }>(r)),
  excluirTodosMateriais: (categoria: string) =>
    jsonPost("/api/materiais/excluir-todos", { categoria }).then((r) => j<{ ok: boolean; excluidos: number }>(r)),
  alterarMassaMateriais: (ids: string[], campo: string, valor: string) =>
    jsonPost("/api/materiais/alterar-massa", { ids, campo, valor }).then((r) => j<{ ok: boolean; alterados: number }>(r)),
  excluirMaterial: (id: string) =>
    fetch(`/api/materiais/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  // Insumos (categorias dinâmicas de material)
  listarCategoriasMaterial: () =>
    fetch("/api/materiais/categorias").then((r) => j<MaterialCategoriaDef[]>(r)),
  salvarCategoriaMaterial: (b: { id?: string; nome: string; cor?: string | null; icone?: string | null; ordem?: number }) =>
    jsonPost("/api/materiais/categorias", b).then((r) => j<MaterialCategoriaDef>(r)),
  excluirCategoriaMaterial: (id: string) =>
    fetch(`/api/materiais/categorias/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  // Movimenta estoque do material (entrada de compra, baixa, ajuste)
  movMaterial: (id: string, b: { tipo: "entrada" | "baixa" | "ajuste"; quantidade: number; motivo?: string; alvo?: "saldo" | "caixas" }) =>
    jsonPost(`/api/materiais/${encodeURIComponent(id)}/mov`, b).then((r) => j<{ id: string; saldo: number; caixas: number }>(r)),
  movimentosMaterial: (id: string) =>
    fetch(`/api/materiais/${encodeURIComponent(id)}/movimentos`).then((r) => j<{ tipo: string; quantidade: number; motivo: string | null; pedido_id: string | null; fonte: string | null; criado_em: string }[]>(r)),
  // Sugestão de compras (saldo abaixo do mínimo)
  comprasMateriais: () =>
    fetch("/api/materiais/compras").then((r) => j<CompraSugestao[]>(r)),
  // Mapa de refil (medida do produto → medida do refil)
  listarRefilMapa: () =>
    fetch("/api/materiais/refil-mapa").then((r) => j<RefilMapa[]>(r)),
  salvarRefilMapa: (b: RefilMapa) =>
    jsonPost("/api/materiais/refil-mapa", b).then((r) => j<RefilMapa>(r)),
  excluirRefilMapa: (medida: string) =>
    fetch(`/api/materiais/refil-mapa/${encodeURIComponent(medida)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  // Colar em massa (uma linha = um registro; colunas por Tab/;/,)
  bulkMateriais: (categoria: string, texto: string, opts?: { colunas?: string[]; labels?: string[]; nomeTemplate?: string; defaults?: Record<string, string> }) =>
    jsonPost("/api/materiais/bulk", { categoria, texto, ...(opts || {}) }).then((r) => j<BulkResult>(r)),
  bulkTiposFio: (texto: string) =>
    jsonPost("/api/tipos-fio/bulk", { texto }).then((r) => j<BulkResult>(r)),
  bulkOperadores: (texto: string) =>
    jsonPost("/api/operadores/bulk", { texto }).then((r) => j<BulkResult>(r)),
  bulkFornecedores: (texto: string) =>
    jsonPost("/api/fornecedores/bulk", { texto }).then((r) => j<BulkResult>(r)),
  excluirTamanho: (id: string) =>
    fetch(`/api/tamanhos/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  enviarFotoCor: (nome: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`/api/cores/${encodeURIComponent(nome)}/foto`, { method: "POST", body: fd }).then(
      (r) => j<{ ok: boolean; foto_key: string }>(r)
    );
  },
  excluirFotoCor: (nome: string) =>
    fetch(`/api/cores/${encodeURIComponent(nome)}/foto`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  fotoCorUrl: (nome: string) => `/api/cores/${encodeURIComponent(nome)}/foto`,
  listarTasseis: () => fetch("/api/tasseis").then((r) => j<Tassel[]>(r)),
  salvarTassel: (t: Tassel) =>
    fetch("/api/tasseis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    }).then((r) => j<Tassel>(r)),
  excluirTassel: (cor: string, tamanho: string) =>
    fetch(`/api/tasseis/${encodeURIComponent(cor)}/${encodeURIComponent(tamanho)}`, {
      method: "DELETE",
    }).then((r) => j<{ ok: boolean }>(r)),
  listarProducao: (setor = "tecelagem") =>
    fetch(`/api/producao?setor=${encodeURIComponent(setor)}`).then((r) => j<CardProducao[]>(r)),
  dashboard: () => fetch("/api/dashboard").then((r) => j<DashboardData>(r)),
  tvTecelagem: () => fetch("/api/dashboard/tecelagem").then((r) => j<TvTecelagemData>(r)),
  tvCostura: () => fetch("/api/dashboard/costura").then((r) => j<TvCosturaData>(r)),
  tvRevisao: () => fetch("/api/dashboard/revisao").then((r) => j<TvRevisaoData>(r)),
  addAviso: (texto: string) =>
    fetch("/api/dashboard/avisos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    }).then((r) => j<{ id: string; texto: string }>(r)),
  removerAviso: (id: string) =>
    fetch(`/api/dashboard/avisos/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  detalheProducao: (pedido_id: string, parte: string) =>
    fetch(`/api/producao/${pedido_id}/${encodeURIComponent(parte)}`).then((r) =>
      j<
        CardProducao & {
          vendedor?: string | null;
          observacao?: string | null;
          codigo_terceiro?: string | null;
          blocos: { modelo: string; ref: string; comp: string; cor: string; total: number; sizes: { tipo: string; tamanho: string; qtd: number }[] }[];
        }
      >(r)
    ),
  salvarCodigoTerceiro: (pedido_id: string, codigo: string) =>
    fetch(`/api/pedidos/${pedido_id}/codigo-terceiro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    }).then((r) => j<{ ok: boolean; codigo_terceiro: string | null }>(r)),
  atualizarProducao: (
    pedido_id: string,
    parte: string,
    body: { status: string; setor?: string; maquina?: string; operador?: string }
  ) =>
    fetch(`/api/producao/${pedido_id}/${encodeURIComponent(parte)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ ok: boolean; desmembrou?: boolean }>(r)),
  desmembrarProducao: (pedido_id: string, parte: string) =>
    fetch(`/api/producao/${pedido_id}/${encodeURIComponent(parte)}/desmembrar`, { method: "POST" }).then((r) => j<{ ok: boolean; criados: number }>(r)),
  concluirProducao: (pedido_id: string, parte: string) =>
    fetch(`/api/producao/${pedido_id}/${encodeURIComponent(parte)}/concluir`, { method: "POST" }).then((r) => j<{ ok: boolean }>(r)),
  definirClienteCard: (pedido_id: string, parte: string, cliente: string) =>
    fetch(`/api/producao/${pedido_id}/${encodeURIComponent(parte)}/cliente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente }),
    }).then((r) => j<{ ok: boolean; cliente: string | null }>(r)),
  definirPrioridade: (pedido_id: string, parte: string, prioridade: number) =>
    fetch(`/api/producao/${pedido_id}/${encodeURIComponent(parte)}/prioridade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prioridade }),
    }).then((r) => j<{ ok: boolean; prioridade: number }>(r)),
  historicoProducao: (pedido_id: string, parte: string) =>
    fetch(`/api/producao/${pedido_id}/${encodeURIComponent(parte)}/historico`).then((r) =>
      j<{
        criadoEm: string;
        agora: string;
        totalMin: number;
        passagens: { setor: string; status: string; operador: string | null; entrouEm: string; saiuEm: string | null; duracaoMin: number; atual: boolean }[];
      }>(r)
    ),
  listarExpedicao: (fase: string) =>
    fetch(`/api/expedicao?fase=${encodeURIComponent(fase)}`).then((r) => j<CardExpedicao[]>(r)),
  atualizarExpedicao: (pedido_id: string, body: ExpedicaoUpdate) =>
    fetch(`/api/expedicao/${pedido_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ ok: boolean }>(r)),
  todosPedidos: (params?: { mes?: string; setor?: string }) => {
    const q = new URLSearchParams();
    if (params?.mes) q.set("mes", params.mes);
    if (params?.setor) q.set("setor", params.setor);
    const qs = q.toString();
    return fetch(`/api/expedicao/todos${qs ? `?${qs}` : ""}`).then((r) => j<PedidoTimeline[]>(r));
  },
  listarRomaneiosPedidos: () => fetch("/api/romaneios/pedidos").then((r) => j<RomaneioPedido[]>(r)),
  obterRomaneio: (id: string) => fetch(`/api/romaneios/${id}`).then((r) => j<RomaneioData>(r)),
  pagamentoCostura: (mes?: string, tipo: "costura" | "tassel" = "costura", costureira = "") => {
    const q = new URLSearchParams({ tipo });
    if (mes) q.set("mes", mes);
    if (costureira) q.set("costureira", costureira);
    return fetch(`/api/romaneios/pagamento?${q.toString()}`).then((r) => j<PagamentoData>(r));
  },
  gerarRomaneioCostura: (
    id: string,
    opts?: { prestador?: string; volumes?: string; dataRetorno?: string; registrar?: boolean; servicos?: { nome: string; qtd: number }[] }
  ) =>
    fetch(`/api/romaneios/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(opts || {}), usuario: quemSou() }),
    }).then((r) => j<{ ok: boolean; url: string; totalValor: number; peseirasMantas: number; almofadasCapas: number; outros: number; totalPecas: number }>(r)),
  listarPrestadores: () => fetch("/api/prestadores").then((r) => j<Prestador[]>(r)),
  salvarPrestador: (p: Prestador) =>
    fetch("/api/prestadores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    }).then((r) => j<Prestador>(r)),
  excluirPrestador: (nome: string) =>
    fetch(`/api/prestadores/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  listarCostura: () => fetch("/api/costura").then((r) => j<Costura[]>(r)),
  salvarCostura: (cst: Costura) =>
    fetch("/api/costura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cst),
    }).then((r) => j<Costura>(r)),
  excluirCostura: (nome: string) =>
    fetch(`/api/costura/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) =>
      j<{ ok: boolean }>(r)
    ),
  listarOperadores: (setor?: string) =>
    fetch(`/api/operadores${setor ? `?setor=${encodeURIComponent(setor)}` : ""}`).then((r) =>
      j<{ id: string; nome: string; setor: string | null }[]>(r)
    ),
  salvarOperador: (b: { nome: string; senha: string; setor?: string }) =>
    fetch("/api/operadores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }).then((r) => j<{ id: string; nome: string; setor: string | null }>(r)),
  removerOperador: (id: string) =>
    fetch(`/api/operadores/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  login: async (usuario: string, senha: string) => {
    const r = await fetch("/api/usuarios/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, senha }),
    });
    if (r.status === 401) return { ok: false as const };
    return j<{ ok: boolean; user: import("./auth").Usuario }>(r);
  },
  listarUsuarios: () =>
    fetch("/api/usuarios").then((r) => j<import("./auth").Usuario[]>(r)),
  salvarUsuario: (b: { id?: string; nome: string; usuario: string; senha?: string; admin: boolean; paginas: string[] }) =>
    fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }).then((r) => j<import("./auth").Usuario>(r)),
  removerUsuario: (id: string) =>
    fetch(`/api/usuarios/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  validarOperador: async (id: string, senha: string) => {
    const r = await fetch("/api/operadores/validar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, senha }),
    });
    if (r.status === 401) return { ok: false as const };
    return j<{ ok: boolean; nome?: string }>(r);
  },
  gerarRomaneioTassel: (
    id: string,
    opts?: { prestador?: string; volumes?: string; dataRetorno?: string; registrar?: boolean; linhas?: { cor: string; tamanho: string; qtd: number }[] }
  ) =>
    fetch(`/api/romaneios/${id}/tassel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(typeof opts === "string" ? { prestador: opts } : opts || {}), usuario: quemSou() }),
    }).then((r) => j<{ ok: boolean; url: string; totalTasseis: number; totalValor: number }>(r)),
  listarEmitidos: (params?: { tipo?: string; status?: string; costureira?: string }) => {
    const q = new URLSearchParams();
    if (params?.tipo) q.set("tipo", params.tipo);
    if (params?.status) q.set("status", params.status);
    if (params?.costureira) q.set("costureira", params.costureira);
    const qs = q.toString();
    return fetch(`/api/romaneios/emitidos${qs ? `?${qs}` : ""}`).then((r) => j<EmitidoRomaneio[]>(r));
  },
  marcarRetornoRomaneio: (tipo: string, id: string, retornou: boolean) =>
    fetch(`/api/romaneios/emitido/${tipo}/${id}/retorno`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retornou, usuario: quemSou() }),
    }).then((r) =>
      j<{ ok: boolean; retornou: boolean; tipo: string; numero: string; cliente: string; pessoa: string }>(r)
    ),
  excluirEmitido: (tipo: string, id: string, excluido: boolean) =>
    fetch(`/api/romaneios/emitido/${tipo}/${id}/excluir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluido }),
    }).then((r) => j<{ ok: boolean; excluido: boolean }>(r)),
  editarEmitido: (tipo: string, id: string, body: { prestador?: string; volumes?: string; dataRetorno?: string }) =>
    fetch(`/api/romaneios/emitido/${tipo}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ ok: boolean; url: string }>(r)),
  relatorioPagamentoUrl: (mes: string, tipo: "costura" | "tassel", costureira: string) => {
    const q = new URLSearchParams({ tipo });
    if (mes) q.set("mes", mes);
    if (costureira) q.set("costureira", costureira);
    return `/api/romaneios/pagamento/pdf?${q.toString()}`;
  },
  reciboPagamentoUrl: (mes: string, tipo: "costura" | "tassel", costureira: string) => {
    const q = new URLSearchParams({ tipo, costureira });
    if (mes) q.set("mes", mes);
    return `/api/romaneios/recibo/pdf?${q.toString()}`;
  },
  listarDescontosFixos: () => fetch("/api/romaneios/descontos-fixos").then((r) => j<{ nome: string; valor: number }[]>(r)),
  salvarDescontoFixo: (b: { nome: string; valor: number }) =>
    fetch("/api/romaneios/descontos-fixos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => j<{ nome: string; valor: number }>(r)),
  excluirDescontoFixo: (nome: string) =>
    fetch(`/api/romaneios/descontos-fixos/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  listarDescontos: (params: { mes?: string; tipo?: string; pessoa?: string }) => {
    const q = new URLSearchParams();
    if (params.mes) q.set("mes", params.mes);
    if (params.tipo) q.set("tipo", params.tipo);
    if (params.pessoa) q.set("pessoa", params.pessoa);
    return fetch(`/api/romaneios/descontos?${q.toString()}`).then((r) => j<DescontoLancado[]>(r));
  },
  lancarDesconto: (b: { pessoa: string; tipo: string; descricao?: string; valor: number; data?: string }) =>
    fetch("/api/romaneios/descontos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => j<{ id: string }>(r)),
  excluirDesconto: (id: string, excluido: boolean) =>
    fetch(`/api/romaneios/descontos/${id}/excluir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excluido }) }).then((r) => j<{ ok: boolean }>(r)),
  gerarRomaneioAvulso: (body: {
    tipo: "costura" | "tassel";
    cliente?: string;
    numero?: string;
    prestador?: string;
    volumes?: string;
    dataRetorno?: string;
    linhas: { nome?: string; cor?: string; tamanho?: string; qtd: number }[];
  }) =>
    fetch(`/api/romaneios/avulso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, usuario: quemSou() }),
    }).then((r) => j<{ ok: boolean; url: string; totalValor: number }>(r)),
  classificarPedido: (id: string) =>
    fetch(`/api/pedidos/${id}/classificar`).then((r) =>
      j<{
        modo: "unica" | "split";
        temKit: boolean;
        contagem: { parteUnica: number; parte1: number; parte2: number; kits: number };
      }>(r)
    ),
  listarPdfsGerados: (id: string) =>
    fetch(`/api/pedidos/${id}/pdfs`).then((r) =>
      j<{ arquivos: { tipo: string; label: string; url: string }[] }>(r)
    ),
  kitsPedidos: (id: string) =>
    fetch(`/api/pedidos/${id}/kits-pedidos`).then((r) =>
      j<{ pedidos: { numero: string; pecas: number }[] }>(r)
    ),
  gerarPdfs: (
    id: string,
    opts?: { kit?: "junto" | "separado"; entregas?: Record<string, string> }
  ) =>
    fetch(`/api/pedidos/${id}/gerar-pdfs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts || {}),
    }).then((r) =>
      j<{ modo: string; temKit: boolean; arquivos: { tipo: string; label: string; url: string }[] }>(
        r
      )
    ),
  previaPdf: async (body: NovoPedidoBody) => {
    const res = await fetch("/api/pedidos/previa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.blob();
  },
  importarPdf: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/pedidos/importar", { method: "POST", body: fd }).then((r) =>
      j<Sugestao>(r)
    );
  },

  // ── Produtos ────────────────────────────────────────────────────────────
  listarProdutos: (p?: { ativo?: string; busca?: string; estoque?: string }) => {
    const q = new URLSearchParams();
    if (p?.ativo) q.set("ativo", p.ativo);
    if (p?.busca) q.set("busca", p.busca);
    if (p?.estoque) q.set("estoque", p.estoque);
    return fetch(`/api/produtos${q.toString() ? "?" + q : ""}`).then((r) => j<Produto[]>(r));
  },
  toggleEstoqueProduto: (id: string, on: boolean) =>
    jsonPost(`/api/produtos/${id}/estoque-flag`, { on, usuario: quemSou() }).then((r) => j<{ ok: boolean; controla_estoque: boolean }>(r)),
  obterProduto: (id: string) => fetch(`/api/produtos/${id}`).then((r) => j<Produto & { ficha: FichaItem[]; kit: KitComponente[] }>(r)),
  salvarProduto: (p: Partial<Produto>) =>
    jsonPost("/api/produtos", { ...p, usuario: quemSou() }).then((r) => j<{ id: string }>(r)),
  cadastrarProdutosPorVariacoes: (body: { nome: string; ref?: string; categoria?: string; unidade?: string; tipo?: string; estoque_min?: number; reposicao_qtd?: number; cores: string[]; tamanhos: string[] }) =>
    jsonPost("/api/produtos/bulk-cores", { ...body, usuario: quemSou() }).then((r) => j<{ ok: boolean; criados: { nome: string; cor: string | null; tamanho: string | null }[]; pulados: number }>(r)),
  ativarProduto: (id: string, ativo: boolean) =>
    jsonPost(`/api/produtos/${id}/ativo`, { ativo, usuario: quemSou() }).then((r) => j<{ ok: boolean }>(r)),
  excluirProduto: (id: string) =>
    fetch(`/api/produtos/${id}?usuario=${encodeURIComponent(quemSou() || "")}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  enviarFotoProduto: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`/api/produtos/${id}/foto`, { method: "POST", body: fd }).then((r) => j<{ ok: boolean; foto_key: string }>(r));
  },
  removerFotoProduto: (id: string) => fetch(`/api/produtos/${id}/foto`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  movProduto: (id: string, body: { tipo: string; origem: string; qtd: number; observacao?: string }) =>
    jsonPost(`/api/produtos/${id}/mov`, { ...body, usuario: quemSou() }).then((r) => j<{ ok: boolean; mov_id: string; estoque: number }>(r)),
  movsProduto: (id: string) => fetch(`/api/produtos/${id}/movs`).then((r) => j<ProdutoMov[]>(r)),
  listarMovimentacoes: (p?: { tipo?: string; origem?: string }) => {
    const q = new URLSearchParams();
    if (p?.tipo) q.set("tipo", p.tipo);
    if (p?.origem) q.set("origem", p.origem);
    return fetch(`/api/produtos/movimentacoes${q.toString() ? "?" + q : ""}`).then((r) => j<ProdutoMov[]>(r));
  },
  salvarFicha: (id: string, itens: FichaItem[]) =>
    jsonPost(`/api/produtos/${id}/ficha`, { itens, usuario: quemSou() }).then((r) => j<{ ok: boolean; total: number }>(r)),
  salvarKitComposicao: (id: string, itens: KitComponente[]) =>
    jsonPost(`/api/produtos/${id}/kit`, { itens, usuario: quemSou() }).then((r) => j<{ ok: boolean; total: number }>(r)),
  itensPedidoParaEstoque: (pedidoId: string) =>
    fetch(`/api/produtos/pedido/${pedidoId}/itens`).then((r) =>
      j<{ pedido: { id: string; numero: string }; itens: ItemPedidoEstoque[]; producao: { parte: string; setor: string; status: string }[] }>(r)
    ),
  entradaPorPedido: (body: { pedido_id: string; pedido_numero: string; itens: { produto_id: string; qtd: number }[] }) =>
    jsonPost("/api/produtos/entrada-pedido", { ...body, usuario: quemSou() }).then((r) => j<{ ok: boolean }>(r)),
  cadastrarProdutosDoPedido: (pedidoId: string) =>
    jsonPost("/api/produtos/cadastrar-do-pedido", { pedido_id: pedidoId, usuario: quemSou() }).then((r) => j<{ ok: boolean; criados: number; nomes: string[] }>(r)),
  baixaPreview: (movId: string) => fetch(`/api/produtos/mov/${movId}/baixa-preview`).then((r) => j<BaixaPreview>(r)),
  baixarInsumos: (movId: string) =>
    jsonPost(`/api/produtos/mov/${movId}/baixar-insumos`, { usuario: quemSou() }).then((r) => j<{ ok: boolean; baixados: number }>(r)),
  listarLogProdutos: (tipo?: string) =>
    fetch(`/api/produtos/log${tipo ? "?tipo=" + tipo : ""}`).then((r) => j<ProdutoLog[]>(r)),
  listarReposicao: () => fetch("/api/produtos/reposicao").then((r) => j<RepAlerta[]>(r)),
  aprovarReposicao: (alertaId: string) =>
    jsonPost(`/api/produtos/reposicao/${alertaId}/aprovar`, { usuario: quemSou() }).then((r) => j<{ ok: boolean; pedido_id: string; numero: string }>(r)),
  ignorarReposicao: (alertaId: string) =>
    jsonPost(`/api/produtos/reposicao/${alertaId}/ignorar`, {}).then((r) => j<{ ok: boolean }>(r)),

  // ── Comercial / Representantes ───────────────────────────────────────────
  listarRepresentantes: () => fetch("/api/representantes").then((r) => j<Representante[]>(r)),
  salvarRepresentante: (rep: Partial<Representante>) =>
    jsonPost("/api/representantes", rep).then((r) => j<{ id: string; nome: string }>(r)),
  ativarRepresentante: (id: string, ativo: boolean) =>
    jsonPost(`/api/representantes/${id}/ativo`, { ativo }).then((r) => j<{ ok: boolean }>(r)),
  excluirRepresentante: (id: string) =>
    fetch(`/api/representantes/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  vendasComercial: (params?: { de?: string; ate?: string }) => {
    const q = new URLSearchParams();
    if (params?.de) q.set("de", params.de);
    if (params?.ate) q.set("ate", params.ate);
    return fetch(`/api/comercial/vendas${q.toString() ? "?" + q : ""}`).then((r) => j<ComercialVendas>(r));
  },
  vendasDetalhe: (vendedor: string, params?: { de?: string; ate?: string }) => {
    const q = new URLSearchParams({ vendedor });
    if (params?.de) q.set("de", params.de);
    if (params?.ate) q.set("ate", params.ate);
    return fetch(`/api/comercial/vendas/detalhe?${q}`).then((r) => j<ComercialDetalhe>(r));
  },

  // ── Insumos ─────────────────────────────────────────────────────────────
  listarInsumos: (p?: { ativo?: string; busca?: string }) => {
    const q = new URLSearchParams();
    if (p?.ativo) q.set("ativo", p.ativo);
    if (p?.busca) q.set("busca", p.busca);
    return fetch(`/api/insumos${q.toString() ? "?" + q : ""}`).then((r) => j<Insumo[]>(r));
  },
  salvarInsumo: (i: Partial<Insumo>) =>
    jsonPost("/api/insumos", { ...i, usuario: quemSou() }).then((r) => j<{ id: string }>(r)),
  cadastrarInsumosPorCores: (body: { base: string; cores: string[]; categoria?: string; unidade?: string; estoque_min?: number; codigo?: string; fornecedor_id?: string | null; observacao?: string }) =>
    jsonPost("/api/insumos/bulk-cores", { ...body, usuario: quemSou() }).then((r) => j<{ ok: boolean; criados: { nome: string; cor: string }[]; pulados: number }>(r)),
  ativarInsumo: (id: string, ativo: boolean) =>
    jsonPost(`/api/insumos/${id}/ativo`, { ativo, usuario: quemSou() }).then((r) => j<{ ok: boolean }>(r)),
  excluirInsumo: (id: string) =>
    fetch(`/api/insumos/${id}?usuario=${encodeURIComponent(quemSou() || "")}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  movInsumo: (id: string, body: { tipo: string; origem: string; qtd: number; observacao?: string }) =>
    jsonPost(`/api/insumos/${id}/mov`, { ...body, usuario: quemSou() }).then((r) => j<{ ok: boolean; estoque: number }>(r)),
  movsInsumo: (id: string) => fetch(`/api/insumos/${id}/movs`).then((r) => j<InsumoMov[]>(r)),
  // listas próprias do insumo (categorias e cores, separadas das cores de produto)
  listarInsumoCategorias: () => fetch("/api/insumos/categorias").then((r) => j<{ id: string; nome: string }[]>(r)),
  addInsumoCategoria: (nome: string) => jsonPost("/api/insumos/categorias", { nome }).then((r) => j<{ id: string; nome: string }>(r)),
  excluirInsumoCategoria: (nome: string) => fetch(`/api/insumos/categorias/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  listarInsumoCores: () => fetch("/api/insumos/cores").then((r) => j<{ id: string; nome: string }[]>(r)),
  addInsumoCor: (nome: string) => jsonPost("/api/insumos/cores", { nome }).then((r) => j<{ id: string; nome: string }>(r)),
  excluirInsumoCor: (nome: string) => fetch(`/api/insumos/cores/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),

  // ── Assistente (IA) ─────────────────────────────────────────────────────
  perguntarAssistente: (pergunta: string) =>
    jsonPost("/api/assistente", { pergunta }).then((r) => j<{ resposta: string; dados: string }>(r)),

  // ── Fornecedores ────────────────────────────────────────────────────────
  listarFornecedores: () => fetch("/api/fornecedores").then((r) => j<Fornecedor[]>(r)),
  salvarFornecedor: (f: Partial<Fornecedor>) => jsonPost("/api/fornecedores", f).then((r) => j<{ id: string; nome: string }>(r)),
  excluirFornecedor: (id: string) => fetch(`/api/fornecedores/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
};

export const TIPOS: { value: string; label: string; pe?: boolean }[] = [
  { value: "unico", label: "Único" },
  { value: "unico_pe", label: "Único + Pronta Entrega", pe: true },
  { value: "p1p2", label: "Parte 1 + Parte 2" },
  { value: "p1p2_pe", label: "P1 + P2 + Pronta Entrega", pe: true },
  { value: "estoque", label: "Estoque" },
  { value: "pronta_entrega", label: "Pronta Entrega" },
];

export const PARTES: { value: string; label: string }[] = [
  { value: "unico", label: "Único" },
  { value: "p1", label: "Parte 1" },
  { value: "p2", label: "Parte 2" },
  { value: "kit", label: "Kit" },
  { value: "pe", label: "Pronta Entrega" },
  { value: "estoque", label: "Estoque" },
];

export function tipoLabel(v: string) {
  if (v === "auto" || !v) return "Classificação automática";
  return TIPOS.find((t) => t.value === v)?.label ?? v;
}

// ── Tipos da área de Produtos ────────────────────────────────────────────────
export interface Produto {
  id: string;
  nome: string;
  ref?: string | null;
  categoria?: string | null;
  tamanho?: string | null;
  cor?: string | null;
  tipo_fio?: string | null;
  unidade?: string;
  tipo?: string; // 'avulso' | 'kit'
  foto_key?: string | null;
  ativo?: number;
  observacao?: string | null;
  estoque?: number;
  estoque_min?: number;
  reposicao_qtd?: number;
  controla_estoque?: number;
  criado_em?: string;
  atualizado_em?: string;
}
export interface RepAlerta {
  id: string;
  produto_id: string;
  qtd_sugerida: number;
  estoque_no_alerta: number;
  estoque_min: number;
  criado_em: string;
  produto_nome: string;
  ref?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  unidade?: string | null;
  estoque: number;
  pedido_id?: string | null;
  pedido_numero?: string | null;
}
export interface Representante {
  id: string;
  nome: string;
  whatsapp?: string | null;
  email?: string | null;
  ativo?: number;
  observacao?: string | null;
  ufs?: string | null;
  instagram?: string | null;
  cidades?: string | null;
  comissao?: number | null;
}
export interface VendaRep {
  vendedor: string;
  pedidos: number;
  pecas: number;
  valor: number;
}
export interface ComercialVendas {
  lista: VendaRep[];
  totais: { pedidos: number; pecas: number; valor: number };
}
export interface PedidoVenda {
  id: string;
  numero: string | null;
  cliente: string;
  data: string | null;
  pecas: number;
  valor: number;
  clienteNovo: boolean;
}
export interface ComercialDetalhe {
  vendedor: string;
  pedidos: PedidoVenda[];
  totais: { pedidos: number; pecas: number; valor: number; novos: number };
}
export interface KitComponente {
  id?: string;
  componente_id?: string | null;
  nome: string;
  qtd: number;
  observacao?: string | null;
}
export interface FichaItem {
  id?: string;
  insumo_id?: string | null;
  nome: string;
  tipo?: string | null;
  qtd_por_unidade: number;
  unidade?: string | null;
  observacao?: string | null;
}
export interface ProdutoMov {
  id: string;
  produto_id: string;
  tipo: string; // entrada | saida
  origem: string; // avulsa | pedido | ajuste
  qtd: number;
  pedido_id?: string | null;
  pedido_numero?: string | null;
  usuario?: string | null;
  observacao?: string | null;
  insumos_baixados?: number;
  criado_em: string;
  produto_nome?: string | null;
  produto_ref?: string | null;
  produto_unidade?: string | null;
}
export interface Insumo {
  id: string;
  nome: string;
  categoria?: string | null;
  cor?: string | null;
  unidade?: string;
  codigo?: string | null;
  estoque?: number;
  estoque_min?: number;
  fornecedor_id?: string | null;
  fornecedor_nome?: string | null;
  ativo?: number;
  observacao?: string | null;
}
export interface Fornecedor {
  id: string;
  nome: string;
  contato?: string | null;
  telefone?: string | null;
  email?: string | null;
  cnpj?: string | null;
  observacao?: string | null;
  ativo?: number;
}
export interface InsumoMov {
  id: string;
  insumo_id: string;
  tipo: string;
  origem: string;
  qtd: number;
  usuario?: string | null;
  observacao?: string | null;
  criado_em: string;
}
export interface ProdutoLog {
  id: string;
  tipo: string;
  descricao: string;
  usuario?: string | null;
  ref_id?: string | null;
  criado_em: string;
}
export interface IaConhecimento {
  id: string; pergunta: string; resposta: string; ativo: number; criado_em?: string;
}
export interface AtendSetor { id: string; nome: string; membros: string | null; ativo: number; criado_em?: string }
export interface AtendPainel {
  gerais: { novas_hoje?: number; em_humano?: number; nao_assumidas?: number; catalogos_hoje?: number; leads_hoje?: number; indicados_hoje?: number };
  fila: { id: string; telefone: string; nome: string | null; setor: string | null; responsavel: string | null; ultima_in_em: string | null; espera_min: number }[];
  atendentes: { atendente: string; total: number; aguardando: number }[];
  setores: { setor: string; total: number }[];
  tempoResposta: { atendente: string; media_min: number; respostas: number }[];
}
export interface LojaParceira {
  id: string; nome: string; endereco: string | null; cidade: string | null; uf: string | null;
  whatsapp: string | null; instagram: string | null; site: string | null; ativo: number; loja_online?: number; criado_em?: string;
  pendente?: number; cliente_id?: string | null;
}
export interface ItemPedidoEstoque {
  ref?: string | null;
  produto: string;
  cor?: string | null;
  tamanho?: string | null;
  qtd: number;
  produto_id: string | null;
  produto_nome: string | null;
}
export interface BaixaPreview {
  ja_baixado: boolean;
  qtd_entrada: number;
  linhas: {
    insumo_id?: string | null;
    nome: string;
    tipo?: string | null;
    unidade?: string | null;
    qtd_por_unidade: number;
    qtd_total: number;
    estoque_atual: number | null;
    vinculado: boolean;
  }[];
}
