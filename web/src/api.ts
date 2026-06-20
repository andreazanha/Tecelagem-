export interface PedidoItem {
  id?: string;
  produto: string;
  ref?: string | null;
  cor_grade?: string | null;
  tamanho?: string | null;
  qtd: number;
  parte: string;
  origem?: string | null; // número do pedido de origem (OP que junta vários)
}

export interface Pedido {
  id: string;
  numero_erp?: string | null;
  cliente_nome: string;
  vendedor?: string | null;
  tipo: string;
  entrega_pe?: string | null;
  data_pedido?: string | null;
  data_entrega?: string | null;
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
  tipo: string;
  entrega_pe?: string | null;
  data_pedido?: string;
  data_entrega?: string;
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
}

export interface Costura {
  nome: string;
  valor: number;
}

export interface CardProducao {
  pedido_id: string;
  parte: string; // parte-1 | parte-2 | parte-unica | pronta-entrega
  status: string; // aguardando | tecendo | pronto | enviado
  pecas: number;
  resumo?: string | null;
  maquina?: string | null;
  operador?: string | null;
  iniciado_em?: string | null;
  finalizado_em?: string | null;
  numero_erp?: string | null;
  cliente_nome: string;
  data_pedido?: string | null;
  data_entrega?: string | null;
}

export interface Sugestao {
  numero_erp?: string;
  cliente_nome?: string;
  vendedor?: string;
  data_pedido?: string;
  data_entrega?: string;
  itens: PedidoItem[];
  confianca: number;
  texto: string;
  metodo: "texto" | "ocr" | "nenhum";
}

export interface DashboardData {
  hoje: { pedidos: number; pecas: number; atrasados: number; entregaProxima: number; finalizados: number };
  producao: {
    aguardando_tecelagem: number; em_tecelagem: number;
    aguardando_passadoria: number; em_passadoria: number;
    aguardando_corte: number; em_corte: number;
    costura: number; revisao: number; expedicao: number;
  };
  urgentes: { numero: string | null; cliente: string; data_entrega: string | null; atrasado: number; etapa: string | null }[];
  ranking: { etapa: string; qtd: number }[];
  expedicao: { prontos: number; aguardando_nf: number; enviados_hoje: number };
  avisos: { id: string; texto: string }[];
  ultimoPedido: { id: string; numero: string | null; cliente: string; vendedor: string | null; data_entrega: string | null; pecas: number; created_at: string } | null;
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
  criarPedido: (body: NovoPedidoBody) =>
    fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ id: string }>(r)),
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
          blocos: { modelo: string; ref: string; comp: string; cor: string; total: number; sizes: { tipo: string; tamanho: string; qtd: number }[] }[];
        }
      >(r)
    ),
  atualizarProducao: (
    pedido_id: string,
    parte: string,
    body: { status: string; maquina?: string; operador?: string }
  ) =>
    fetch(`/api/producao/${pedido_id}/${encodeURIComponent(parte)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ ok: boolean }>(r)),
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
  gerarRomaneioTassel: (id: string, prestador: string) =>
    fetch(`/api/pedidos/${id}/romaneio-tassel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prestador }),
    }).then((r) => j<{ ok: boolean; url: string; totalTasseis: number; totalValor: number }>(r)),
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
