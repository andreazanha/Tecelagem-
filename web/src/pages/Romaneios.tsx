import { useEffect, useState } from "react";
import { api, type Tassel, type Prestador, type Costura, type RomaneioPedido, type RomaneioData } from "../api";

const brl = (v: number) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
const br = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};
// Famílias de peças que um serviço de costura pode cobrar.
const AGRUP: { id: string; label: string }[] = [
  { id: "peseira_manta", label: "Peseiras / Mantas" },
  { id: "almofada_capa", label: "Almofadas / Capas" },
  { id: "todas", label: "Todas as peças" },
];
const agrupLabel = (id?: string) => AGRUP.find((a) => a.id === id)?.label || "Todas as peças";

export function Romaneios() {
  const [aba, setAba] = useState<"romaneios" | "tasseis" | "costura" | "prestadores" | "relatorios">("romaneios");
  const abas: { id: typeof aba; label: string }[] = [
    { id: "romaneios", label: "🧾 Romaneios" },
    { id: "tasseis", label: "🧶 Tasseis" },
    { id: "costura", label: "🪡 Costura" },
    { id: "prestadores", label: "👷 Prestadores" },
    { id: "relatorios", label: "📊 Relatórios" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Romaneios</h1>
          <div className="breadcrumb">Prestadores de serviço › {abas.find((a) => a.id === aba)?.label}</div>
        </div>
        <div className="segmented">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              className={"seg" + (aba === a.id ? " seg-on" : "")}
              onClick={() => setAba(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === "romaneios" && <RomaneiosPedidos />}
      {aba === "tasseis" && <TasseisCadastro />}
      {aba === "costura" && <CosturaCadastro />}
      {aba === "prestadores" && <PrestadoresCadastro />}
      {aba === "relatorios" && <RelatoriosPagamento />}
    </>
  );
}

// ── Romaneios de produção (lista de pedidos + romaneio de costura preenchido) ──
function RomaneiosPedidos() {
  const [itens, setItens] = useState<RomaneioPedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<RomaneioPedido | null>(null);

  useEffect(() => {
    api.listarRomaneiosPedidos().then(setItens).catch(() => {}).finally(() => setCarregando(false));
  }, []);

  const q = busca.trim().toLowerCase();
  const lista = q
    ? itens.filter((p) => p.numero.toLowerCase().includes(q) || (p.cliente_nome || "").toLowerCase().includes(q))
    : itens;

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Pedidos que vão para <strong>produção</strong>. Clique para abrir o romaneio de costura já preenchido —{" "}
        <strong>Peseiras + Mantas</strong> e <strong>Almofadas + Capas</strong> somadas (sem cor/tamanho). Kits de
        reposição são desmembrados nas duas famílias.
      </p>
      <div className="row-gap" style={{ marginBottom: 12 }}>
        <input className="busca-ped" placeholder="🔎 Pedido, OP ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Pedido / OP</th>
              <th>Cliente</th>
              <th>Entrega</th>
              <th className="num">Peseiras/Mantas</th>
              <th className="num">Almofadas/Capas</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={7} className="empty pad">Carregando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={7} className="empty pad">Nenhum pedido de produção.</td></tr>
            ) : (
              lista.map((p) => (
                <tr key={p.pedido_id} style={{ cursor: "pointer" }} onClick={() => setAberto(p)}>
                  <td className="strong">
                    {p.numero} {p.reposicao && <span className="chip" style={{ marginLeft: 6 }}>reposição</span>}
                  </td>
                  <td>{p.cliente_nome}</td>
                  <td>{br(p.data_entrega)}</td>
                  <td className="num strong">{p.peseirasMantas}</td>
                  <td className="num strong">{p.almofadasCapas}</td>
                  <td className="num">{p.totalPecas}</td>
                  <td><button className="btn btn-soft" onClick={(e) => { e.stopPropagation(); setAberto(p); }}>Abrir romaneio</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {aberto && <RomaneioModal pedido={aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}

function selCss(): React.CSSProperties {
  return { width: "100%", maxWidth: 320, padding: "10px 12px", fontSize: 14, borderRadius: 10, border: "1px solid #e2e8f0" };
}

function RomaneioModal({ pedido, onFechar }: { pedido: RomaneioPedido; onFechar: () => void }) {
  const [data, setData] = useState<RomaneioData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [costureiras, setCostureiras] = useState<string[]>([]);
  const [tasselistas, setTasselistas] = useState<string[]>([]);
  const [costureira, setCostureira] = useState("");
  const [prestadorTassel, setPrestadorTassel] = useState("");
  const [volumes, setVolumes] = useState("");
  const [dataRetorno, setDataRetorno] = useState("");
  const [gerando, setGerando] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.obterRomaneio(pedido.pedido_id).then(setData).catch((e) => setErro((e as Error).message)).finally(() => setCarregando(false));
    api.listarPrestadores().then((l) => {
      setCostureiras(l.filter((x) => (x.servico || "") === "costura").map((x) => x.nome));
      setTasselistas(l.filter((x) => (x.servico || "") === "tassel").map((x) => x.nome));
    }).catch(() => {});
  }, [pedido.pedido_id]);

  async function gerarCostura() {
    setErro(""); setGerando("costura");
    try {
      const r = await api.gerarRomaneioCostura(pedido.pedido_id, { prestador: costureira, volumes, dataRetorno });
      window.open(r.url, "_blank");
    } catch (e) { setErro((e as Error).message); } finally { setGerando(""); }
  }
  async function gerarTassel() {
    setErro(""); setGerando("tassel");
    try {
      const r = await api.gerarRomaneioTassel(pedido.pedido_id, prestadorTassel);
      window.open(r.url, "_blank");
    } catch (e) { setErro((e as Error).message); } finally { setGerando(""); }
  }

  const temServicos = !!data?.servicos.length;

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card rom-grande" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd kit">
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">ROMANEIO Nº {pedido.numero}</span>
              {pedido.reposicao && <span className="modal-pill">reposição</span>}
            </span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{pedido.cliente_nome}</span>
            <span className="kstatus fazendo">{pedido.totalPecas} pç · entrega {br(pedido.data_entrega)}</span>
          </div>
        </div>

        <div className="modal-bd">
          {erro && <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{erro}</div>}
          {carregando || !data ? (
            <div className="muted">Carregando…</div>
          ) : (
            <>
              {/* ───── Romaneio de Costura ───── */}
              <div className="rom-sec">
                <div className="rom-sec-hd">
                  <h3>🪡 Romaneio de Costura <span className="muted">→ costureira</span></h3>
                  <button className="kbtn final" disabled={gerando === "costura"} onClick={gerarCostura}>
                    {gerando === "costura" ? "Gerando…" : "👁 Visualizar / PDF (2 vias)"}
                  </button>
                </div>
                <div className="rom-campos">
                  <label>
                    <span>COSTUREIRA</span>
                    <select value={costureira} onChange={(e) => setCostureira(e.target.value)}>
                      <option value="">— escolher —</option>
                      {costureiras.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>DATA RETORNO (devolução)</span>
                    <input type="date" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} />
                  </label>
                  <label>
                    <span>VOLUMES</span>
                    <input type="number" min={0} placeholder="ex.: 2" value={volumes} onChange={(e) => setVolumes(e.target.value)} />
                  </label>
                </div>
                <table className="table">
                  <thead>
                    <tr><th>Serviço</th><th className="num">Qtd</th><th className="num">Vl Unit.</th><th className="num">Vl Total</th></tr>
                  </thead>
                  <tbody>
                    {temServicos ? (
                      data.servicos.map((s) => (
                        <tr key={s.nome}>
                          <td className="strong">{s.nome} <span className="muted" style={{ fontWeight: 400 }}>· {agrupLabel(s.agrupamento)}</span></td>
                          <td className="num strong">{s.qtd}</td>
                          <td className="num">{brl(s.valorUnit)}</td>
                          <td className="num strong">{brl(s.total)}</td>
                        </tr>
                      ))
                    ) : (
                      <>
                        <tr><td className="strong">Peseiras / Mantas</td><td className="num strong">{data.peseirasMantas}</td><td className="num muted">—</td><td className="num muted">—</td></tr>
                        <tr><td className="strong">Almofadas / Capas</td><td className="num strong">{data.almofadasCapas}</td><td className="num muted">—</td><td className="num muted">—</td></tr>
                      </>
                    )}
                    <tr className="rom-total">
                      <td className="strong">TOTAL GERAL</td>
                      <td className="num strong">{data.totalPecas} pç</td>
                      <td></td>
                      <td className="num strong">{temServicos ? brl(data.totalValor) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
                {!temServicos && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    💡 Cadastre os serviços com valor na aba <strong>🪡 Costura</strong> (com o agrupamento) para os valores saírem pré-fixados.
                  </p>
                )}
              </div>

              {/* ───── Romaneio de Tassel (se houver) ───── */}
              {data.tassel && (
                <div className="rom-sec">
                  <div className="rom-sec-hd">
                    <h3>🧶 Romaneio de Tassel <span className="muted">→ prestador de tassel</span></h3>
                    <div className="row-gap">
                      <select value={prestadorTassel} onChange={(e) => setPrestadorTassel(e.target.value)} style={selCss()}>
                        <option value="">— prestador (opcional) —</option>
                        {tasselistas.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button className="kbtn tecer" disabled={gerando === "tassel"} onClick={gerarTassel}>
                        {gerando === "tassel" ? "Gerando…" : "👁 PDF (3 vias)"}
                      </button>
                    </div>
                  </div>
                  <table className="table">
                    <thead>
                      <tr><th>Cor</th><th>Tam</th><th className="num">Tasseis</th><th className="num">Vl Unit.</th><th className="num">Vl Total</th></tr>
                    </thead>
                    <tbody>
                      {data.tassel.linhas.map((l) => (
                        <tr key={l.cor + l.tamanho}>
                          <td className="strong">{l.cor || "—"}</td>
                          <td>{l.tamanho}</td>
                          <td className="num strong">{l.tasseis}</td>
                          <td className="num">{l.valorUnit ? brl(l.valorUnit) : "—"}</td>
                          <td className="num strong">{l.total ? brl(l.total) : "—"}</td>
                        </tr>
                      ))}
                      <tr className="rom-total">
                        <td className="strong" colSpan={2}>TOTAL</td>
                        <td className="num strong">{data.tassel.totalTasseis}</td>
                        <td></td>
                        <td className="num strong">{brl(data.tassel.totalValor)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="muted" style={{ fontSize: 12 }}>3 vias · só a 1ª (Empresa) tem assinatura · 2ª Prestador · 3ª Caixa.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── Relatório de pagamento por costureira (fim do mês) ───────────────────────
function RelatoriosPagamento() {
  const [data, setData] = useState<import("../api").PagamentoData | null>(null);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    api.pagamentoCostura(mes).then(setData).catch(() => {}).finally(() => setCarregando(false));
  }, [mes]);

  const mesLabel = (m: string) => {
    const [y, mm] = m.split("-");
    const nomes = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomes[Number(mm)] || mm} / ${y}`;
  };

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Pagamento das <strong>costureiras</strong> no fim do mês — soma os romaneios emitidos (saída no mês).
      </p>
      <div className="row-gap" style={{ marginBottom: 14, alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#94a3b8" }}>MÊS (data de saída)</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
        {data && <div className="muted" style={{ marginLeft: "auto", fontSize: 14 }}>Total do mês: <strong style={{ color: "#1d4ed8" }}>{brl(data.totalGeral)}</strong></div>}
      </div>

      {carregando || !data ? (
        <div className="card pad">Carregando…</div>
      ) : data.grupos.length === 0 ? (
        <div className="card pad muted">Nenhum romaneio emitido em {mesLabel(mes)}.</div>
      ) : (
        data.grupos.map((g) => (
          <div className="card" key={g.costureira} style={{ marginBottom: 14 }}>
            <div className="card-head" style={{ paddingBottom: 12 }}>
              <h2 style={{ margin: 0 }}>👩‍🔧 {g.costureira}</h2>
              <span className="chip" style={{ fontSize: 14, fontWeight: 800 }}>
                {g.totalPecas} pç · {brl(g.totalValor)}
              </span>
            </div>
            <table className="table">
              <thead>
                <tr><th>Romaneio / Pedido</th><th>Saída</th><th>Retorno previsto</th><th className="num">Peças</th><th className="num">Valor</th></tr>
              </thead>
              <tbody>
                {g.romaneios.map((r) => (
                  <tr key={r.pedido_id}>
                    <td className="strong">Nº {r.numero}</td>
                    <td>{br(r.data_saida)}</td>
                    <td>{br(r.data_retorno)}</td>
                    <td className="num">{r.total_pecas}</td>
                    <td className="num strong">{brl(r.total_valor)}</td>
                  </tr>
                ))}
                <tr className="rom-total">
                  <td className="strong" colSpan={3}>TOTAL A PAGAR</td>
                  <td className="num strong">{g.totalPecas} pç</td>
                  <td className="num strong">{brl(g.totalValor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  );
}

// ── Tasseis (cor + tamanho + valor da mão de obra) ───────────────────────────
function TasseisCadastro() {
  const [itens, setItens] = useState<Tassel[]>([]);
  const [novo, setNovo] = useState<Tassel>({ cor: "", tamanho: "G", valor: 0 });
  function recarregar() {
    api.listarTasseis().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(t: Tassel) {
    try {
      await api.salvarTassel(t);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.cor.trim()) return;
    await salvar(novo);
    setNovo({ cor: "", tamanho: "G", valor: 0 });
  }
  async function remover(t: Tassel) {
    await api.excluirTassel(t.cor, t.tamanho);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Tassel por <strong>cor</strong> e <strong>tamanho</strong> (G = peseira, P = almofada) e o{" "}
        <strong>valor da mão de obra</strong> por tassel. O romaneio soma tudo automaticamente.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Cor</th>
              <th>Tamanho</th>
              <th className="num">Valor (mão de obra)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Cor (ex.: AREIA)"
                  value={novo.cor}
                  onChange={(e) => setNovo({ ...novo, cor: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <select value={novo.tamanho} onChange={(e) => setNovo({ ...novo, tamanho: e.target.value })}>
                  <option value="G">G (peseira)</option>
                  <option value="P">P (almofada)</option>
                </select>
              </td>
              <td className="num">
                <input
                  className="w-sm num"
                  type="number"
                  min={0}
                  step="0.01"
                  value={novo.valor}
                  onChange={(e) => setNovo({ ...novo, valor: Number(e.target.value) })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((t) => (
              <tr key={t.cor + "|" + t.tamanho}>
                <td className="strong">{t.cor}</td>
                <td>{t.tamanho}</td>
                <td className="num">
                  <input
                    className="w-sm num"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={t.valor}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== t.valor) salvar({ ...t, valor: v });
                    }}
                  />
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {brl(t.valor)}
                  </span>
                </td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(t)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={4} className="empty pad">
                  Nenhum tassel cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Costura (serviço + valor) ────────────────────────────────────────────────
function CosturaCadastro() {
  const [itens, setItens] = useState<Costura[]>([]);
  const [novo, setNovo] = useState<Costura>({ nome: "", valor: 0, agrupamento: "todas" });
  function recarregar() {
    api.listarCostura().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(c: Costura) {
    try {
      await api.salvarCostura(c);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.nome.trim()) return;
    await salvar(novo);
    setNovo({ nome: "", valor: 0, agrupamento: "todas" });
  }
  async function remover(c: Costura) {
    await api.excluirCostura(c.nome);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Serviços de <strong>costura</strong> com <strong>valor pré-fixado</strong>. O{" "}
        <strong>agrupamento</strong> diz qual família cada serviço cobra — o romaneio usa essa qtd × valor.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Serviço de costura</th>
              <th>Agrupamento (cobra qual família)</th>
              <th className="num">Valor unitário</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Ex.: Capas tricô / Etiqueta"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <select value={novo.agrupamento} onChange={(e) => setNovo({ ...novo, agrupamento: e.target.value })}>
                  {AGRUP.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </td>
              <td className="num">
                <input
                  className="w-sm num"
                  type="number"
                  min={0}
                  step="0.01"
                  value={novo.valor}
                  onChange={(e) => setNovo({ ...novo, valor: Number(e.target.value) })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((c) => (
              <tr key={c.nome}>
                <td className="strong">{c.nome}</td>
                <td>
                  <select
                    defaultValue={c.agrupamento || "todas"}
                    onChange={(e) => salvar({ ...c, agrupamento: e.target.value })}
                  >
                    {AGRUP.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    className="w-sm num"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={c.valor}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== c.valor) salvar({ ...c, valor: v });
                    }}
                  />
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {brl(c.valor)}
                  </span>
                </td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(c)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={4} className="empty pad">
                  Nenhum serviço de costura cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Prestadores de serviço ───────────────────────────────────────────────────
function PrestadoresCadastro() {
  const [itens, setItens] = useState<Prestador[]>([]);
  const [novo, setNovo] = useState<Prestador>({ nome: "", telefone: "", servico: "tassel", obs: "" });
  function recarregar() {
    api.listarPrestadores().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(p: Prestador) {
    try {
      await api.salvarPrestador(p);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.nome.trim()) return;
    await salvar(novo);
    setNovo({ nome: "", telefone: "", servico: "tassel", obs: "" });
  }
  async function remover(p: Prestador) {
    await api.excluirPrestador(p.nome);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Quem faz o serviço (tassel, costura…). Aparecem para escolha ao gerar o romaneio.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Serviço</th>
              <th>Observação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Nome do prestador"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <input
                  placeholder="(00) 00000-0000"
                  value={novo.telefone ?? ""}
                  onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
                />
              </td>
              <td>
                <select value={novo.servico ?? ""} onChange={(e) => setNovo({ ...novo, servico: e.target.value })}>
                  <option value="tassel">Tassel</option>
                  <option value="costura">Costura</option>
                  <option value="outro">Outro</option>
                </select>
              </td>
              <td>
                <input
                  placeholder="Observação"
                  value={novo.obs ?? ""}
                  onChange={(e) => setNovo({ ...novo, obs: e.target.value })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((p) => (
              <tr key={p.nome}>
                <td className="strong">{p.nome}</td>
                <td>{p.telefone || "—"}</td>
                <td>
                  <span className="chip">{p.servico || "—"}</span>
                </td>
                <td>{p.obs || "—"}</td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(p)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={5} className="empty pad">
                  Nenhum prestador cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
