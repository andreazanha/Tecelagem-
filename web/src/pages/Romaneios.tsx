import { useEffect, useState } from "react";
import { api, type Tassel, type Prestador, type Costura, type RomaneioPedido } from "../api";

const brl = (v: number) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
const br = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};

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
      {aba === "relatorios" && (
        <div className="card pad">
          <p className="muted">
            Relatórios por prestador (total a pagar, romaneios emitidos, por período) entram numa
            próxima etapa. Me diga quais números você quer ver aqui.
          </p>
        </div>
      )}
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

function RomaneioModal({ pedido, onFechar }: { pedido: RomaneioPedido; onFechar: () => void }) {
  const [prestadores, setPrestadores] = useState<string[]>([]);
  const [prestador, setPrestador] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .listarPrestadores()
      .then((l) => setPrestadores(l.filter((x) => (x.servico || "") === "costura").map((x) => x.nome)))
      .catch(() => {});
  }, []);

  async function gerar() {
    setErro("");
    setGerando(true);
    try {
      const r = await api.gerarRomaneioCostura(pedido.pedido_id, prestador);
      window.open(r.url, "_blank");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  const linhas = [
    { servico: "Peseiras / Mantas", qtd: pedido.peseirasMantas },
    { servico: "Almofadas / Capas", qtd: pedido.almofadasCapas },
    ...(pedido.outros > 0 ? [{ servico: "Outros", qtd: pedido.outros }] : []),
  ];

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd kit">
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{pedido.numero}</span>
              <span className="modal-pill">🧾 Romaneio de Costura</span>
            </span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{pedido.cliente_nome}</span>
            {pedido.reposicao && <span className="kstatus fazendo">reposição</span>}
          </div>
        </div>

        <div className="modal-bd">
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Entrega {br(pedido.data_entrega)} · agrupado por família (sem cor/tamanho).
          </div>
          <table className="table">
            <thead>
              <tr><th>Serviço (agrupado)</th><th className="num">Qtd</th></tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.servico}>
                  <td className="strong">{l.servico}</td>
                  <td className="num strong" style={{ fontSize: 16, color: "#1d4ed8" }}>{l.qtd}</td>
                </tr>
              ))}
              <tr>
                <td className="strong">TOTAL DE PEÇAS</td>
                <td className="num strong" style={{ fontSize: 16 }}>{pedido.totalPecas}</td>
              </tr>
            </tbody>
          </table>

          <label className="campo-l" style={{ marginTop: 16, display: "block" }}>COSTUREIRA (opcional)</label>
          <select
            value={prestador}
            onChange={(e) => setPrestador(e.target.value)}
            style={{ width: "100%", padding: "11px 13px", fontSize: 15, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 4 }}
          >
            <option value="">— sem costureira (linha em branco) —</option>
            {prestadores.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {erro && <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13, marginTop: 10 }}>{erro}</div>}
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Fechar</button>
          <button className="kbtn final" disabled={gerando} onClick={gerar}>
            {gerando ? "Gerando…" : "👁 Gerar / ver PDF (2 vias)"}
          </button>
        </div>
      </div>
    </div>
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
  const [novo, setNovo] = useState<Costura>({ nome: "", valor: 0 });
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
    setNovo({ nome: "", valor: 0 });
  }
  async function remover(c: Costura) {
    await api.excluirCostura(c.nome);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Serviços de <strong>costura</strong> e o valor da mão de obra. Usados nos romaneios de costura.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Serviço de costura</th>
              <th className="num">Valor (mão de obra)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Ex.: Fechar almofada"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
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
                <td colSpan={3} className="empty pad">
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
