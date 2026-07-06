import { Fragment, useEffect, useMemo, useState } from "react";
import { api, type Representante, type ComercialVendas, type ComercialDetalhe } from "../api";

type Aba = "dashboard" | "representantes";

const brl = (n: number) =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nInt = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");
const dataBr = (s?: string | null) => {
  if (!s) return "—";
  const d = s.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
};

// Primeiro e último dia do mês corrente (YYYY-MM-DD) — período padrão do dashboard.
function mesCorrente(): { de: string; ate: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const ano = d.getFullYear();
  const mes = d.getMonth();
  const primeiro = `${ano}-${p(mes + 1)}-01`;
  const ultimo = new Date(ano, mes + 1, 0);
  const ate = `${ultimo.getFullYear()}-${p(ultimo.getMonth() + 1)}-${p(ultimo.getDate())}`;
  return { de: primeiro, ate };
}

export function Comercial() {
  const [aba, setAba] = useState<Aba>(() => (localStorage.getItem("comercial-aba") as Aba) || "dashboard");
  function mudar(a: Aba) {
    setAba(a);
    localStorage.setItem("comercial-aba", a);
  }
  const abas: { id: Aba; label: string }[] = [
    { id: "dashboard", label: "📊 Dashboard" },
    { id: "representantes", label: "🧑‍💼 Representantes" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comercial</h1>
          <div className="breadcrumb">Representantes › {abas.find((a) => a.id === aba)?.label.replace(/^\S+\s/, "")}</div>
        </div>
        <div className="segmented">
          {abas.map((a) => (
            <button key={a.id} type="button" className={"seg" + (aba === a.id ? " seg-on" : "")} onClick={() => mudar(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === "dashboard" && <AbaDashboard />}
      {aba === "representantes" && <AbaRepresentantes />}
    </>
  );
}

// ── Dashboard de vendas por representante ────────────────────────────────────
function AbaDashboard() {
  const inicial = useMemo(mesCorrente, []);
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [dados, setDados] = useState<ComercialVendas | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    setCarregando(true);
    setErro("");
    api
      .vendasComercial({ de, ate })
      .then(setDados)
      .catch((e) => setErro((e as Error).message))
      .finally(() => setCarregando(false));
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lista = dados?.lista || [];
  const totais = dados?.totais || { pedidos: 0, pecas: 0, valor: 0 };
  const maxValor = lista.reduce((m, g) => Math.max(m, g.valor), 0) || 1;

  // Drill-down: pedidos do representante clicado (cliente, data, qtd, valor, novo).
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ComercialDetalhe | null>(null);
  const [carrDet, setCarrDet] = useState(false);
  function abrirDetalhe(vendedor: string) {
    if (aberto === vendedor) {
      setAberto(null);
      setDetalhe(null);
      return;
    }
    setAberto(vendedor);
    setDetalhe(null);
    setCarrDet(true);
    api
      .vendasDetalhe(vendedor, { de, ate })
      .then(setDetalhe)
      .catch((e) => setErro((e as Error).message))
      .finally(() => setCarrDet(false));
  }

  return (
    <div className="card">
      <div className="filtros" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <label className="campo">
          <span>De</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="campo">
          <span>Até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={carregar} disabled={carregando}>
          {carregando ? "Carregando…" : "Aplicar"}
        </button>
      </div>

      {erro && <div className="aviso-erro">{erro}</div>}

      <div className="cards-resumo" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="kpi">
          <div className="kpi-lbl">Faturamento</div>
          <div className="kpi-val">{brl(totais.valor)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Peças</div>
          <div className="kpi-val">{nInt(totais.pecas)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Pedidos</div>
          <div className="kpi-val">{nInt(totais.pedidos)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Representantes</div>
          <div className="kpi-val">{nInt(lista.length)}</div>
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="muted">Nenhuma venda no período.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Representante</th>
              <th style={{ textAlign: "right" }}>Pedidos</th>
              <th style={{ textAlign: "right" }}>Peças</th>
              <th style={{ textAlign: "right" }}>Faturamento</th>
              <th style={{ width: "22%" }}>Participação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((g, i) => (
              <Fragment key={g.vendedor}>
                <tr style={{ cursor: "pointer" }} onClick={() => abrirDetalhe(g.vendedor)} title="Ver os pedidos deste representante">
                  <td>{i + 1}º</td>
                  <td><span style={{ display: "inline-block", width: 14 }}>{aberto === g.vendedor ? "▾" : "▸"}</span> <strong>{g.vendedor}</strong></td>
                  <td style={{ textAlign: "right" }}>{nInt(g.pedidos)}</td>
                  <td style={{ textAlign: "right" }}>{nInt(g.pecas)}</td>
                  <td style={{ textAlign: "right" }}>{brl(g.valor)}</td>
                  <td>
                    <div style={{ background: "var(--barra-bg, #eee)", borderRadius: 6, overflow: "hidden", height: 14 }}>
                      <div style={{ width: `${Math.round((g.valor / maxValor) * 100)}%`, height: "100%", background: "var(--acento, #7a5230)" }} />
                    </div>
                  </td>
                </tr>
                {aberto === g.vendedor && (
                  <tr>
                    <td colSpan={6} style={{ background: "var(--painel-bg, #fafafa)", padding: 0 }}>
                      <DetalheRep detalhe={detalhe} carregando={carrDet} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Total</strong></td>
              <td style={{ textAlign: "right" }}><strong>{nInt(totais.pedidos)}</strong></td>
              <td style={{ textAlign: "right" }}><strong>{nInt(totais.pecas)}</strong></td>
              <td style={{ textAlign: "right" }}><strong>{brl(totais.valor)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// Detalhe (drill-down) dos pedidos de um representante.
function DetalheRep({ detalhe, carregando }: { detalhe: ComercialDetalhe | null; carregando: boolean }) {
  if (carregando) return <div style={{ padding: 16 }} className="muted">Carregando pedidos…</div>;
  if (!detalhe || detalhe.pedidos.length === 0) return <div style={{ padding: 16 }} className="muted">Sem pedidos no período.</div>;
  return (
    <div style={{ padding: 12 }}>
      <table className="table" style={{ margin: 0 }}>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Data</th>
            <th style={{ textAlign: "right" }}>Qtd</th>
            <th style={{ textAlign: "right" }}>Valor</th>
            <th style={{ textAlign: "center" }}>Cliente</th>
          </tr>
        </thead>
        <tbody>
          {detalhe.pedidos.map((p) => (
            <tr key={p.id}>
              <td>{p.numero || "—"}</td>
              <td>{p.cliente}</td>
              <td>{dataBr(p.data)}</td>
              <td style={{ textAlign: "right" }}>{nInt(p.pecas)}</td>
              <td style={{ textAlign: "right" }}>{brl(p.valor)}</td>
              <td style={{ textAlign: "center" }}>
                {p.clienteNovo ? (
                  <span className="tag" style={{ background: "#1f9d55", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>NOVO</span>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>recorrente</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}><strong>{detalhe.totais.novos} cliente(s) novo(s)</strong></td>
            <td style={{ textAlign: "right" }}><strong>{nInt(detalhe.totais.pecas)}</strong></td>
            <td style={{ textAlign: "right" }}><strong>{brl(detalhe.totais.valor)}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Cadastro de representantes ───────────────────────────────────────────────
const VAZIO: Partial<Representante> = { nome: "", whatsapp: "", email: "", observacao: "", ativo: 1 };

function AbaRepresentantes() {
  const [lista, setLista] = useState<Representante[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [edit, setEdit] = useState<Partial<Representante> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    setCarregando(true);
    api
      .listarRepresentantes()
      .then(setLista)
      .catch((e) => setErro((e as Error).message))
      .finally(() => setCarregando(false));
  }
  useEffect(carregar, []);

  async function salvar() {
    if (!edit?.nome?.trim()) {
      setErro("Informe o nome do representante.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      await api.salvarRepresentante(edit);
      setEdit(null);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }
  async function alternarAtivo(r: Representante) {
    await api.ativarRepresentante(r.id, !(r.ativo ?? 1));
    carregar();
  }
  async function excluir(r: Representante) {
    if (!confirm(`Excluir o representante "${r.nome}"? As vendas dele continuam no histórico.`)) return;
    await api.excluirRepresentante(r.id);
    carregar();
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>
          Cadastro dos representantes/vendedores. As vendas são atribuídas pelo nome que vem no pedido.
        </p>
        <button className="btn btn-primary" onClick={() => setEdit({ ...VAZIO })}>+ Novo representante</button>
      </div>

      {erro && <div className="aviso-erro">{erro}</div>}

      {carregando ? (
        <p className="muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="muted">Nenhum representante cadastrado.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>WhatsApp</th>
              <th>E-mail</th>
              <th>Situação</th>
              <th style={{ textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.id} style={{ opacity: r.ativo ?? 1 ? 1 : 0.5 }}>
                <td><strong>{r.nome}</strong>{r.observacao ? <div className="muted" style={{ fontSize: 12 }}>{r.observacao}</div> : null}</td>
                <td>{r.whatsapp || "—"}</td>
                <td>{r.email || "—"}</td>
                <td>{r.ativo ?? 1 ? "Ativo" : "Inativo"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn btn-soft" onClick={() => setEdit(r)}>Editar</button>{" "}
                  <button className="btn btn-soft" onClick={() => alternarAtivo(r)}>{r.ativo ?? 1 ? "Desativar" : "Ativar"}</button>{" "}
                  <button className="btn btn-soft" onClick={() => excluir(r)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edit && (
        <div className="modal-bg" onClick={() => setEdit(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h3>{edit.id ? "Editar representante" : "Novo representante"}</h3>
              <button className="modal-x" onClick={() => setEdit(null)}>×</button>
            </div>
            <div style={{ display: "grid", gap: 12, padding: 4 }}>
              <label className="campo">
                <span>Nome *</span>
                <input value={edit.nome || ""} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} autoFocus />
              </label>
              <label className="campo">
                <span>WhatsApp</span>
                <input value={edit.whatsapp || ""} onChange={(e) => setEdit({ ...edit, whatsapp: e.target.value })} placeholder="(00) 00000-0000" />
              </label>
              <label className="campo">
                <span>E-mail</span>
                <input value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </label>
              <label className="campo">
                <span>Observação</span>
                <textarea value={edit.observacao || ""} onChange={(e) => setEdit({ ...edit, observacao: e.target.value })} rows={2} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={!!(edit.ativo ?? 1)} onChange={(e) => setEdit({ ...edit, ativo: e.target.checked ? 1 : 0 })} />
                <span>Ativo</span>
              </label>
            </div>
            <div className="modal-ft" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn btn-soft" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
