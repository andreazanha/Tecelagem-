import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type PedidoItem, type NovoPedidoBody, type Modelo } from "../api";
import { calcularPartes } from "../parte";

function linhaVazia(): PedidoItem {
  return { produto: "", ref: "", cor_grade: "", tamanho: "", qtd: 0, parte: "unico", valor_unit: 0 };
}

const brl = (v: number) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");

export function NovoPedido() {
  const nav = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const editando = !!editId;
  const [clientes, setClientes] = useState<string[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [previaUrl, setPreviaUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<{ file: File; url: string }[]>([]);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "warn"; msg: string } | null>(null);

  const [form, setForm] = useState<NovoPedidoBody>({
    numero_erp: "",
    cliente_nome: "",
    vendedor: "",
    codigo_terceiro: "",
    tipo: "auto",
    entrega_pe: "junto",
    reposicao: false,
    data_pedido: "",
    data_entrega: "",
    data_tecelagem: "",
    observacao: "",
    itens: [linhaVazia()],
  });

  useEffect(() => {
    api
      .listarClientes()
      .then((cs) => setClientes(cs.map((c) => c.nome)))
      .catch(() => {});
    api.listarModelos().then(setModelos).catch(() => {});
  }, []);

  // Modo edição: carrega o pedido e preenche o formulário.
  useEffect(() => {
    if (!editId) return;
    api
      .obterPedido(editId)
      .then((p) => {
        const its = Array.isArray(p.itens) ? (p.itens as PedidoItem[]) : [];
        setForm({
          numero_erp: p.numero_erp || "",
          cliente_nome: p.cliente_nome || "",
          vendedor: p.vendedor || "",
          codigo_terceiro: p.codigo_terceiro || "",
          tipo: "auto",
          entrega_pe: p.entrega_pe || "junto",
          reposicao: !!(p as unknown as { reposicao?: number }).reposicao,
          data_pedido: p.data_pedido || "",
          data_entrega: p.data_entrega || "",
          data_tecelagem: p.data_tecelagem || "",
          observacao: p.observacao || "",
          itens: its.length
            ? its.map((i) => ({ produto: i.produto || "", ref: i.ref || "", cor_grade: i.cor_grade || "", tamanho: i.tamanho || "", qtd: i.qtd || 0, parte: i.parte || "unico", kit: !!i.kit, origem: i.origem || "", valor_unit: i.valor_unit || 0 }))
            : [linhaVazia()],
        });
      })
      .catch((e) => setErro((e as Error).message));
  }, [editId]);

  // Classificação real (Parte 1/2/Única/Pronta Entrega) por código/nome do catálogo.
  const partes = useMemo(() => calcularPartes(form.itens, modelos), [form.itens, modelos]);
  const temKit = useMemo(() => partes.some((p) => p.value === "kit"), [partes]);

  // Vendedor: 1 pedido (ou todos do mesmo vendedor) → nome; vários vendedores diferentes → em branco.
  useEffect(() => {
    const distintos = [...new Set(vendedores.map((v) => v.trim()).filter(Boolean))];
    if (distintos.length === 1) setForm((f) => ({ ...f, vendedor: distintos[0] }));
    else if (distintos.length > 1) setForm((f) => ({ ...f, vendedor: "" }));
  }, [vendedores]);

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
      if (editando && editId) {
        await api.atualizarPedido(editId, montarBody(itens));
        nav(`/pedidos/${editId}`);
        return;
      }
      const { id } = await api.criarPedido(montarBody(itens));
      if (arquivos.length) {
        try {
          await api.enviarPdfs(id, arquivos.map((a) => a.file));
        } catch {
          /* PDFs são opcionais; segue mesmo se falhar */
        }
      }
      nav(`/pedidos/${id}`);
    } catch (err) {
      setErro((err as Error).message);
      setSalvando(false);
    }
  }

  // Monta o corpo do pedido com a parte JÁ classificada por código/nome (catálogo).
  function montarBody(itens: PedidoItem[]): NovoPedidoBody {
    const cls = calcularPartes(itens, modelos);
    return {
      ...form,
      tipo: "auto",
      // pronta-entrega: reposição não usa junto/separado; cliente usa o escolhido.
      entrega_pe: form.reposicao ? null : form.entrega_pe || "junto",
      itens: itens.map((it, i) => ({ ...it, parte: cls[i]?.value || it.parte })),
    };
  }

  // Visualiza o PDF da OP ANTES de criar o pedido (não salva nada). Mostra num modal embutido
  // (sem pop-up, que costuma ser bloqueado pelo navegador).
  async function visualizarPrevia() {
    setErro(null);
    const itens = form.itens.filter((it) => it.produto.trim());
    if (itens.length === 0) {
      setErro("Adicione pelo menos um item para visualizar o PDF.");
      return;
    }
    setPrevia(true);
    try {
      const blob = await api.previaPdf(montarBody(itens));
      setPreviaUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setErro("Falha ao gerar a prévia: " + (e as Error).message);
    } finally {
      setPrevia(false);
    }
  }
  function fecharPrevia() {
    setPreviaUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  // Sobe um OU VÁRIOS PDFs: lê cada um, JUNTA os itens (consolidação) e acumula os números
  // dos pedidos. Vários pedidos pequenos viram uma OP grande.
  async function aoAdicionarPdfs(files: File[]) {
    if (files.length === 0) return;
    setAviso(null);
    const novos = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setArquivos((prev) => [...prev, ...novos]);
    setLendo(true);
    let lidos = 0;
    let falhas = 0;
    const vends: string[] = []; // 1 por arquivo (alinha com `arquivos`)
    for (const { file } of novos) {
      try {
        const s = await api.importarPdf(file);
        vends.push(s.vendedor || "");
        const add = (s.itens || []).map((it) => ({
          produto: it.produto || "",
          ref: it.ref ?? "",
          cor_grade: it.cor_grade ?? "",
          tamanho: it.tamanho ?? "",
          qtd: Number(it.qtd) || 0,
          parte: it.parte || "unico",
          valor_unit: Number(it.valor_unit) || 0, // preço lido do PDF (editável)
          origem: s.numero_erp || "", // de qual pedido este item veio
        }));
        if (add.length || s.cliente_nome) lidos++;
        else falhas++;
        setForm((f) => {
          const base = f.itens.filter((it) => it.produto.trim());
          const nums = (f.numero_erp || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          if (s.numero_erp && !nums.includes(s.numero_erp)) nums.push(s.numero_erp);
          const itens = [...base, ...add];
          return {
            ...f,
            numero_erp: nums.join(", "),
            cliente_nome: f.cliente_nome || s.cliente_nome || "",
            data_pedido: f.data_pedido || s.data_pedido || "",
            data_entrega: f.data_entrega || s.data_entrega || "",
            reposicao: f.reposicao || !!s.reposicao, // OF de reposição → marca o pedido como reposição de estoque
            itens: itens.length ? itens : [linhaVazia()],
          };
        });
      } catch {
        vends.push("");
        falhas++;
      }
    }
    setVendedores((prev) => [...prev, ...vends]);
    setLendo(false);
    // Vários pedidos numa OP só → inventa um nome no lugar do cliente (editável).
    setForm((f) => {
      const nums = (f.numero_erp || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (nums.length >= 2) return { ...f, cliente_nome: `OP CONSOLIDADA — ${nums.length} PEDIDOS` };
      return f;
    });
    if (lidos > 0) {
      setAviso({
        tipo: "ok",
        msg:
          `${lidos} PDF(s) lido(s) e itens juntados na OP.` +
          (falhas ? ` ${falhas} não foram lidos automaticamente (anexados mesmo assim).` : "") +
          " Confira os itens antes de salvar.",
      });
    } else {
      setAviso({
        tipo: "warn",
        msg: "Não consegui ler os dados automaticamente. Preencha manualmente — os arquivos serão anexados.",
      });
    }
  }

  function removerArquivo(i: number) {
    setArquivos((prev) => {
      const a = prev[i];
      if (a) URL.revokeObjectURL(a.url);
      return prev.filter((_, idx) => idx !== i);
    });
    setVendedores((prev) => prev.filter((_, idx) => idx !== i));
  }

  const totalPecas = form.itens.reduce((s, it) => s + (Number(it.qtd) || 0), 0);
  const totalValor = form.itens.reduce((s, it) => s + (Number(it.qtd) || 0) * (Number(it.valor_unit) || 0), 0);

  return (
    <form onSubmit={salvar}>
      <div className="page-head">
        <div>
          <h1>{editando ? "Editar Pedido" : "Novo Pedido"}</h1>
          <div className="breadcrumb">Pedidos › {editando ? "Editar" : "Novo"}</div>
        </div>
        <div className="row-gap">
          <button type="button" className="btn" onClick={() => nav("/pedidos")}>
            Cancelar
          </button>
          <button type="button" className="btn btn-soft" onClick={visualizarPrevia} disabled={previa}>
            {previa ? "Gerando…" : "👁 Visualizar PDF"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : "🔒 Salvar pedido"}
          </button>
        </div>
      </div>

      {erro && <div className="card pad erro">{erro}</div>}

      <div className="grid-2">
        {/* Importação dos PDFs (vários → uma OP) */}
        <div className="card pad">
          <h2>Importar do ERP (PDF)</h2>
          <p className="muted">
            Anexe <strong>um ou vários</strong> PDFs — eles são <strong>preservados</strong>. Vários
            pedidos pequenos são <strong>juntados numa OP só</strong> (itens consolidados; os números
            entram no cabeçalho do PDF gerado).
          </p>
          <label className="dropzone">
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => {
                aoAdicionarPdfs(Array.from(e.target.files ?? []));
                e.currentTarget.value = "";
              }}
            />
            {lendo ? (
              <span>⏳ Lendo os PDFs…</span>
            ) : (
              <span className="muted">
                Clique para selecionar PDF(s) — pode escolher vários de uma vez
              </span>
            )}
          </label>

          {arquivos.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {arquivos.map((a, i) => (
                <div
                  key={i}
                  className="row-gap"
                  style={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <span className="strong" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    📄 {a.file.name}
                  </span>
                  <span className="row-gap">
                    <a className="btn btn-soft" href={a.url} target="_blank" rel="noreferrer">
                      👁 Ver
                    </a>
                    <button type="button" className="icon-btn" title="Remover" onClick={() => removerArquivo(i)}>
                      ✕
                    </button>
                  </span>
                </div>
              ))}
              <label className="btn btn-soft" style={{ cursor: "pointer", alignSelf: "flex-start" }}>
                ＋ Adicionar mais PDFs
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    aoAdicionarPdfs(Array.from(e.target.files ?? []));
                    e.currentTarget.value = "";
                  }}
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

          <div className="field">
            <label>Código de terceiro (código interno do cliente)</label>
            <input
              value={form.codigo_terceiro ?? ""}
              onChange={(e) => set("codigo_terceiro", e.target.value)}
              placeholder="Preencher se o cliente usa código próprio (opcional)"
            />
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
            <div className="field">
              <label title="Prazo interno do tear — aparece só no card da Tecelagem">🧶 Data limite da Tecelagem</label>
              <input
                type="date"
                value={form.data_tecelagem}
                onChange={(e) => set("data_tecelagem", e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label style={{ color: "#c0392b" }}>Observação (sai em vermelho no PDF)</label>
            <textarea
              value={form.observacao ?? ""}
              onChange={(e) => set("observacao", e.target.value)}
              placeholder="ex.: PRIORIDADE — entregar tassel separado"
              rows={2}
              style={{
                font: "inherit",
                padding: "9px 12px",
                border: "1px solid #fca5a5",
                borderRadius: 10,
                color: "#c0392b",
                fontWeight: 600,
                resize: "vertical",
              }}
            />
          </div>

          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, color: "#0f172a", textTransform: "none", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.reposicao} onChange={(e) => set("reposicao", e.target.checked)} />
              📦 Pedido de reposição de estoque (produzir os kits)
            </label>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Ligado: os kits passam pela produção (Tecelagem → … → Estoque · Entrada). Desligado (pedido de cliente): a pronta-entrega já está no estoque e vai direto pro Estoque.
            </div>
          </div>

          {!form.reposicao && temKit && (
            <div className="field">
              <label>Pronta-entrega deste pedido</label>
              <div className="row-gap" style={{ flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, textTransform: "none", fontSize: 14, cursor: "pointer" }}>
                  <input type="radio" name="entrega_pe" checked={form.entrega_pe === "junto"} onChange={() => set("entrega_pe", "junto")} />
                  Junto com a produção → coluna "Pronta entrega com produção"
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, textTransform: "none", fontSize: 14, cursor: "pointer" }}>
                  <input type="radio" name="entrega_pe" checked={form.entrega_pe === "separado"} onChange={() => set("entrega_pe", "separado")} />
                  Separado (vai antes) → coluna "Separação"
                </label>
              </div>
            </div>
          )}
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
              <th className="num">Valor unit.</th>
              <th className="num">Total</th>
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
                <td className="num">
                  <input
                    className="w-sm num"
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.valor_unit ?? 0}
                    onChange={(e) => setItem(i, { valor_unit: Number(e.target.value) })}
                    placeholder="0,00"
                  />
                </td>
                <td className="num strong">{brl((Number(it.qtd) || 0) * (Number(it.valor_unit) || 0))}</td>
                <td>
                  <button
                    type="button"
                    className={"chip" + (it.kit ? " chip-kit" : partes[i]?.value === "p1" ? " chip-soft" : "")}
                    title={it.kit ? "Kit (pronta-entrega → estoque). Clique para voltar ao automático." : "Classificado automaticamente. Clique para marcar como Kit (estoque)."}
                    onClick={() => setItem(i, { kit: !it.kit })}
                  >
                    {it.kit ? "KIT" : partes[i]?.label ?? "—"}
                  </button>
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
              <td></td>
              <td className="num strong">{brl(totalValor)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {erro && <div className="card pad erro">{erro}</div>}

      <div className="row-gap" style={{ justifyContent: "flex-end", marginBottom: 24 }}>
        <button type="button" className="btn" onClick={() => nav("/pedidos")}>
          Cancelar
        </button>
        <button type="button" className="btn btn-soft" onClick={visualizarPrevia} disabled={previa}>
          {previa ? "Gerando…" : "👁 Visualizar PDF"}
        </button>
        <button type="submit" className="btn btn-primary" disabled={salvando}>
          {salvando ? "Salvando…" : editando ? "💾 Salvar alterações" : "🔒 Salvar pedido"}
        </button>
      </div>

      {previaUrl && (
        <div
          onClick={fecharPrevia}
          style={{
            position: "fixed",
            inset: 0,
            background: "#0f172acc",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              width: "min(900px, 96vw)",
              height: "92vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid #eef0f4",
              }}
            >
              <strong>Prévia do PDF da OP (não salvo)</strong>
              <span className="row-gap">
                <a className="btn btn-soft" href={previaUrl} target="_blank" rel="noreferrer">
                  ⤢ Abrir em nova aba
                </a>
                <button type="button" className="btn" onClick={fecharPrevia}>
                  Fechar
                </button>
              </span>
            </div>
            <iframe src={previaUrl} title="Prévia" style={{ flex: 1, border: "none", width: "100%" }} />
          </div>
        </div>
      )}
    </form>
  );
}
