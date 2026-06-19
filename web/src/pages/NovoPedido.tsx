import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PARTES, type PedidoItem, type NovoPedidoBody } from "../api";

function linhaVazia(): PedidoItem {
  return { produto: "", ref: "", cor_grade: "", tamanho: "", qtd: 0, parte: "unico" };
}

export function NovoPedido() {
  const nav = useNavigate();
  const [clientes, setClientes] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "warn"; msg: string } | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [form, setForm] = useState<NovoPedidoBody>({
    numero_erp: "",
    cliente_nome: "",
    vendedor: "",
    tipo: "auto",
    entrega_pe: null,
    data_pedido: "",
    data_entrega: "",
    observacao: "",
    itens: [linhaVazia()],
  });

  useEffect(() => {
    api
      .listarClientes()
      .then((cs) => setClientes(cs.map((c) => c.nome)))
      .catch(() => {});
  }, []);

  function set<K extends keyof NovoPedidoBody>(k: K, v: NovoPedidoBody[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function setItem(i: number, patch: Partial<PedidoItem>) {
    setForm((f) => {
      const itens = f.itens.slice();
      itens[i] = { ...itens[i], ...patch };
      return { ...f, itens };
    });
  }
  function addItem() {
    setForm((f) => ({ ...f, itens: [...f.itens, linhaVazia()] }));
  }
  function rmItem(i: number) {
    setForm((f) => ({ ...f, itens: f.itens.filter((_, idx) => idx !== i) }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!form.cliente_nome.trim()) {
      setErro("Informe o cliente.");
      return;
    }
    const itens = form.itens.filter((it) => it.produto.trim());
    if (itens.length === 0) {
      setErro("Adicione pelo menos um item.");
      return;
    }
    setSalvando(true);
    try {
      const body: NovoPedidoBody = {
        ...form,
        tipo: "auto",
        entrega_pe: null,
        itens,
      };
      const { id } = await api.criarPedido(body);
      if (pdf) {
        try {
          await api.enviarPdf(id, pdf);
        } catch {
          /* PDF é opcional; segue mesmo se falhar */
        }
      }
      nav(`/pedidos/${id}`);
    } catch (err) {
      setErro((err as Error).message);
      setSalvando(false);
    }
  }

  async function aoSelecionarPdf(file: File | null) {
    setPdf(file);
    setAviso(null);
    setPdfUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
    if (!file) return;
    setLendo(true);
    try {
      const s = await api.importarPdf(file);
      setForm((f) => {
        const itens =
          s.itens && s.itens.length
            ? s.itens.map((it) => ({
                produto: it.produto || "",
                ref: it.ref ?? "",
                cor_grade: it.cor_grade ?? "",
                tamanho: it.tamanho ?? "",
                qtd: Number(it.qtd) || 0,
                parte: it.parte || "unico",
              }))
            : f.itens;
        return {
          ...f,
          numero_erp: s.numero_erp ?? f.numero_erp,
          cliente_nome: s.cliente_nome ?? f.cliente_nome,
          vendedor: s.vendedor ?? f.vendedor,
          data_pedido: s.data_pedido ?? f.data_pedido,
          data_entrega: s.data_entrega ?? f.data_entrega,
          itens,
        };
      });
      if (s.metodo === "nenhum" || (!s.cliente_nome && s.itens.length === 0)) {
        setAviso({
          tipo: "warn",
          msg: "Não consegui ler os dados automaticamente deste PDF. Preencha manualmente — o arquivo será anexado.",
        });
      } else {
        const via = s.metodo === "ocr" ? "OCR" : "texto do PDF";
        setAviso({
          tipo: "ok",
          msg: `PDF lido por ${via} (${s.confianca}% de confiança). Confira os campos antes de salvar.`,
        });
      }
    } catch (e) {
      setAviso({ tipo: "warn", msg: "Falha ao ler o PDF: " + (e as Error).message });
    } finally {
      setLendo(false);
    }
  }

  const totalPecas = form.itens.reduce((s, it) => s + (Number(it.qtd) || 0), 0);

  return (
    <form onSubmit={salvar}>
      <div className="page-head">
        <div>
          <h1>Novo Pedido</h1>
          <div className="breadcrumb">Pedidos › Novo</div>
        </div>
        <div className="row-gap">
          <button type="button" className="btn" onClick={() => nav("/pedidos")}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : "🔒 Salvar pedido"}
          </button>
        </div>
      </div>

      {erro && <div className="card pad erro">{erro}</div>}

      <div className="grid-2">
        {/* Importação do PDF */}
        <div className="card pad">
          <h2>Importar do ERP (PDF)</h2>
          <p className="muted">
            Anexe o PDF do pedido — ele é <strong>preservado</strong>. A leitura automática (OCR)
            entra numa próxima etapa; por ora os dados são conferidos abaixo.
          </p>
          <label className="dropzone">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => aoSelecionarPdf(e.target.files?.[0] ?? null)}
            />
            {lendo ? (
              <span>⏳ Lendo o PDF…</span>
            ) : pdf ? (
              <span>📄 {pdf.name}</span>
            ) : (
              <span className="muted">Clique para selecionar o PDF (lê e preenche automático)</span>
            )}
          </label>
          {pdf && pdfUrl && (
            <div className="row-gap" style={{ marginTop: 10 }}>
              <a className="btn btn-primary" href={pdfUrl} target="_blank" rel="noreferrer">
                👁 Visualizar PDF
              </a>
              <label className="btn" style={{ cursor: "pointer" }}>
                ↻ Trocar arquivo
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => aoSelecionarPdf(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
          {aviso && (
            <div className={"aviso " + (aviso.tipo === "ok" ? "aviso-ok" : "aviso-warn")}>
              {aviso.tipo === "ok" ? "✅ " : "⚠️ "}
              {aviso.msg}
            </div>
          )}
        </div>

        {/* Dados do pedido */}
        <div className="card pad">
          <h2>Dados do pedido</h2>

          <div className="field">
            <label>Cliente *</label>
            <input
              list="clientes"
              value={form.cliente_nome}
              onChange={(e) => set("cliente_nome", e.target.value)}
              placeholder="Nome do cliente"
            />
            <datalist id="clientes">
              {clientes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Nº do pedido (ERP)</label>
              <input
                value={form.numero_erp}
                onChange={(e) => set("numero_erp", e.target.value)}
                placeholder="ex.: 8842"
              />
            </div>
            <div className="field">
              <label>Vendedor</label>
              <input
                value={form.vendedor}
                onChange={(e) => set("vendedor", e.target.value)}
                placeholder="ex.: Marcos R."
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Data do pedido</label>
              <input
                type="date"
                value={form.data_pedido}
                onChange={(e) => set("data_pedido", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Data de entrega</label>
              <input
                type="date"
                value={form.data_entrega}
                onChange={(e) => set("data_entrega", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="card">
        <div className="card-head">
          <h2>Itens do pedido</h2>
          <button type="button" className="btn btn-soft" onClick={addItem}>
            ＋ Adicionar item
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Modelo / Produto</th>
              <th>Ref (grade)</th>
              <th>Cor</th>
              <th>Tamanho</th>
              <th className="num">Qtd</th>
              <th>Parte</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {form.itens.map((it, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={it.produto}
                    onChange={(e) => setItem(i, { produto: e.target.value })}
                    placeholder="ex.: Blusa Tricô"
                  />
                </td>
                <td>
                  <input
                    className="w-sm"
                    value={it.ref ?? ""}
                    onChange={(e) => setItem(i, { ref: e.target.value })}
                    placeholder="1075"
                  />
                </td>
                <td>
                  <input
                    value={it.cor_grade ?? ""}
                    onChange={(e) => setItem(i, { cor_grade: e.target.value })}
                    placeholder="ROMENIA"
                  />
                </td>
                <td>
                  <input
                    className="w-sm"
                    value={it.tamanho ?? ""}
                    onChange={(e) => setItem(i, { tamanho: e.target.value })}
                    placeholder="90X200"
                  />
                </td>
                <td className="num">
                  <input
                    className="w-xs num"
                    type="number"
                    min={0}
                    value={it.qtd}
                    onChange={(e) => setItem(i, { qtd: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <select value={it.parte} onChange={(e) => setItem(i, { parte: e.target.value })}>
                    {PARTES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => rmItem(i)}
                    title="Remover"
                    disabled={form.itens.length === 1}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="strong">
                Total
              </td>
              <td className="num strong">{totalPecas} pç</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </form>
  );
}
