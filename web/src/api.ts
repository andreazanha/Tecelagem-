export interface PedidoItem {
  id?: string;
  produto: string;
  ref?: string | null;
  cor_grade?: string | null;
  tamanho?: string | null;
  qtd: number;
  parte: string;
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
}

export interface Cor {
  nome: string;
  poliester: number | boolean; // 1/0
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
  enviarPdf: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`/api/pedidos/${id}/pdf`, { method: "POST", body: fd }).then((r) =>
      j<{ ok: boolean; pdf_key: string }>(r)
    );
  },
  listarClientes: () => fetch("/api/clientes").then((r) => j<{ id: string; nome: string }[]>(r)),
  listarModelos: () => fetch("/api/modelos").then((r) => j<Modelo[]>(r)),
  salvarModelo: (m: Modelo) =>
    fetch("/api/modelos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    }).then((r) => j<Modelo>(r)),
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
  return TIPOS.find((t) => t.value === v)?.label ?? v;
}
