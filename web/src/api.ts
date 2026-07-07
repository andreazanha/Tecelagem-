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
}

export const COMPOSICOES = ["", "100% POLIÉSTER", "100% ACRÍLICO", "100% ALGODÃO"];

export interface Cor {
  nome: string;
  hex?: string | null; // cor visual da bolinha do PDF (ex.: #7a5230)
  foto_key?: string | null; // se tiver foto da cor (amostra real)
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

export const api = {
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
  listarModelos: () => fetch("/api/modelos").then((r) => j<Modelo[]>(r)),
  salvarModelo: (m: Modelo, de?: string) =>
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
  listarCores: () => fetch("/api/cores").then((r) => j<Cor[]>(r)),
  salvarCor: (cor: Cor) =>
    fetch("/api/cores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cor),
    }).then((r) => j<Cor>(r)),
  excluirCor: (nome: string) =>
    fetch(`/api/cores/${encodeURIComponent(nome)}`, { method: "DELETE" }).then((r) =>
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
  listarProdutos: (p?: { ativo?: string; busca?: string }) => {
    const q = new URLSearchParams();
    if (p?.ativo) q.set("ativo", p.ativo);
    if (p?.busca) q.set("busca", p.busca);
    return fetch(`/api/produtos${q.toString() ? "?" + q : ""}`).then((r) => j<Produto[]>(r));
  },
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
