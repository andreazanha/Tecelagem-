import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, type ClienteCrm, type ClienteFicha as TFicha } from "../api";

const brl = (n?: number) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

// "hoje / ontem / há X dias / há X meses" a partir de uma data YYYY-MM-DD.
function desde(d?: string | null): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje.getTime() - dt.getTime()) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "há 1 mês" : dias < 365 ? `há ${meses} meses` : `há ${Math.round(dias / 365)} ano(s)`;
}
function dataBr(d?: string | null): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}
// Link do WhatsApp (wa.me) — só dígitos, prefixa 55 se vier sem código do país.
function waHref(num?: string | null): string | null {
  const d = (num || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const full = d.length <= 11 ? "55" + d : d;
  return `https://wa.me/${full}`;
}
function iniciais(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
const SIT: Record<string, { l: string; c: string }> = {
  entregue: { l: "Entregue", c: "st-entregue" },
  producao: { l: "Em produção", c: "st-producao" },
  novo: { l: "Novo", c: "st-novo" },
};

// ── LISTA de clientes ─────────────────────────────────────────────────────────
export function Clientes() {
  const nav = useNavigate();
  const [lista, setLista] = useState<ClienteCrm[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState<ClienteCrm | null>(null);

  function recarregar() {
    api.listarClientesCrm().then((d) => { if (Array.isArray(d)) setLista(d); }).catch(() => {}).finally(() => setCarregando(false));
  }
  useEffect(() => { recarregar(); }, []);

  const q = busca.trim().toLowerCase();
  const filtrados = useMemo(() => {
    if (!q) return lista;
    return lista.filter((c) =>
      c.nome.toLowerCase().includes(q) || (c.cidade || "").toLowerCase().includes(q) || (c.representante || "").toLowerCase().includes(q)
    );
  }, [lista, q]);

  const hoje = new Date(); const mesAtual = hoje.toISOString().slice(0, 7);
  const compraram90 = lista.filter((c) => {
    if (!c.ultima) return false;
    const d = new Date(c.ultima); return (hoje.getTime() - d.getTime()) / 86400000 <= 90;
  }).length;
  const novosMes = lista.filter((c) => (c.created_at || "").slice(0, 7) === mesAtual).length;
  const somaTotal = lista.reduce((s, c) => s + (c.total || 0), 0);
  const somaPed = lista.reduce((s, c) => s + (c.pedidos || 0), 0);
  const ticketGeral = somaPed ? somaTotal / somaPed : 0;

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div><h1>Clientes</h1><div className="breadcrumb">Comercial › Clientes</div></div>
        <div className="row-gap" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input className="busca-ped" placeholder="🔎 Buscar cliente, cidade, representante…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 240 }} />
          <button className="btn btn-primary" onClick={() => setNovo({ id: "", nome: "" })}>＋ Novo cliente</button>
        </div>
      </div>

      <div className="crm-stats">
        <div className="crm-st"><div className="n">{lista.length}</div><div className="l">Clientes</div></div>
        <div className="crm-st"><div className="n">{compraram90}</div><div className="l">Compraram nos últimos 90d</div></div>
        <div className="crm-st"><div className="n">{novosMes}</div><div className="l">Novos no mês</div></div>
        <div className="crm-st"><div className="n">{brl(ticketGeral)}</div><div className="l">Ticket médio</div></div>
      </div>

      <div className="crm-card">
        {carregando ? (
          <div className="pad muted">Carregando…</div>
        ) : !filtrados.length ? (
          <div className="pad muted">Nenhum cliente encontrado.</div>
        ) : (
          <div className="crm-scroll">
            <table className="crm">
              <thead><tr><th>Cliente</th><th>Representante</th><th>WhatsApp</th><th style={{ textAlign: "center" }}>Pedidos</th><th>Total comprado</th><th>Última compra</th></tr></thead>
              <tbody>
                {filtrados.map((c) => {
                  const wa = waHref(c.whatsapp);
                  return (
                    <tr key={c.id} onClick={() => nav(`/clientes/${c.id}`)}>
                      <td><div className="cli-nm">{c.nome}</div><div className="muted2">{[c.cidade, c.uf].filter(Boolean).join(" · ") || "—"}</div></td>
                      <td>{c.representante ? <span className="rep-cli">🧑‍💼 {c.representante}</span> : <span className="muted2">—</span>}</td>
                      <td>{c.whatsapp ? (
                        wa ? <a className="wa" href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>🟢 {c.whatsapp}</a> : <span className="muted2">{c.whatsapp}</span>
                      ) : <span className="muted2">—</span>}</td>
                      <td style={{ textAlign: "center" }}>{c.pedidos || 0}</td>
                      <td className="money">{brl(c.total)}</td>
                      <td>{desde(c.ultima)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {novo && <ClienteModal cliente={novo} onFechar={() => setNovo(null)} onSalvo={() => { setNovo(null); recarregar(); }} />}
    </div>
  );
}

// ── FICHA 360 de um cliente ───────────────────────────────────────────────────
export function ClienteFicha() {
  const { id } = useParams();
  const [f, setF] = useState<TFicha | null>(null);
  const [erro, setErro] = useState("");
  const [editar, setEditar] = useState(false);

  function recarregar() {
    if (!id) return;
    api.obterCliente(id).then(setF).catch((e) => setErro((e as Error).message || "erro"));
  }
  useEffect(() => { setF(null); setErro(""); recarregar(); /* eslint-disable-next-line */ }, [id]);

  if (erro) return <div className="quadro-page"><div className="page-head"><div><h1>Cliente</h1><div className="breadcrumb"><Link to="/clientes">Comercial › Clientes</Link></div></div></div><div className="card pad muted">{erro}</div></div>;
  if (!f) return <div className="quadro-page"><div className="card pad">Carregando…</div></div>;
  const wa = waHref(f.whatsapp);

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div>
          <h1>{f.nome}</h1>
          <div className="breadcrumb"><Link to="/clientes">Comercial › Clientes</Link> › ficha</div>
        </div>
        <div className="row-gap" style={{ display: "flex", gap: 10 }}>
          <Link to="/clientes" className="btn">← Voltar</Link>
          <button className="btn" onClick={() => setEditar(true)}>✏️ Editar</button>
        </div>
      </div>

      <div className="ficha">
        <div className="fbox">
          <div className="fhead">
            <div className="fav-big">{iniciais(f.nome)}</div>
            <div><div style={{ fontWeight: 800, fontSize: 17 }}>{f.nome}</div><div className="muted2">Cliente desde {dataBr(f.created_at)}</div></div>
          </div>
          {wa ? (
            <a className="wa wa-big" href={wa} target="_blank" rel="noreferrer">🟢 Abrir WhatsApp</a>
          ) : (
            <div className="wa wa-big off">WhatsApp não cadastrado</div>
          )}
          <div className="frow"><span className="k">Contato</span> {f.contato || "—"}</div>
          <div className="frow"><span className="k">WhatsApp</span> {f.whatsapp || "—"}</div>
          <div className="frow"><span className="k">E-mail</span> {f.email || "—"}</div>
          <div className="frow"><span className="k">Cidade</span> {[f.cidade, f.uf].filter(Boolean).join(" · ") || "—"}</div>
          <div className="frow"><span className="k">CNPJ</span> {f.cnpj || "—"}</div>
          <div className="frow"><span className="k">Representante</span> {f.representante ? <span className="rep-cli">🧑‍💼 {f.representante}</span> : "—"}</div>
          {f.observacao && <div className="frow obs"><span className="k">Obs.</span> {f.observacao}</div>}
        </div>

        <div>
          <div className="fkpis">
            <div className="fkpi"><div className="n">{brl(f.kpis.total)}</div><div className="l">Total comprado</div></div>
            <div className="fkpi"><div className="n">{f.kpis.pedidos}</div><div className="l">Pedidos</div></div>
            <div className="fkpi"><div className="n">{brl(f.kpis.ticket)}</div><div className="l">Ticket médio</div></div>
            <div className="fkpi"><div className="n">{desde(f.kpis.ultima)}</div><div className="l">Última compra</div></div>
          </div>
          <div className="crm-card">
            <div className="crm-card-hd">Histórico de pedidos</div>
            {!f.historico.length ? (
              <div className="pad muted">Nenhum pedido registrado para este cliente ainda.</div>
            ) : (
              <div className="crm-scroll">
                <table className="crm">
                  <thead><tr><th>Data</th><th>Pedido</th><th>Valor</th><th>Situação</th></tr></thead>
                  <tbody>
                    {f.historico.map((p) => {
                      const s = SIT[p.situacao] || { l: p.situacao, c: "st-producao" };
                      return (
                        <tr key={p.id}>
                          <td>{dataBr(p.data)}</td>
                          <td>{p.numero ? "#" + p.numero : "—"}</td>
                          <td className="money">{brl(p.valor)}</td>
                          <td><span className={"stpill " + s.c}>{s.l}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {editar && <ClienteModal cliente={f} onFechar={() => setEditar(false)} onSalvo={() => { setEditar(false); recarregar(); }} />}
    </div>
  );
}

// ── Modal de novo/editar cliente ──────────────────────────────────────────────
function ClienteModal({ cliente, onFechar, onSalvo }: { cliente: Partial<ClienteCrm>; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState<Partial<ClienteCrm>>({ ...cliente });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof ClienteCrm, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function salvar() {
    if (!(f.nome || "").trim()) { alert("Informe o nome do cliente."); return; }
    setSalvando(true);
    try { await api.salvarCliente(f); onSalvo(); }
    catch (e) { alert((e as Error).message); }
    finally { setSalvando(false); }
  }
  const novo = !cliente.id;
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#4f46e5,#7c3aed)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">{novo ? "Novo cliente" : "Editar cliente"}</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
        </div>
        <div className="modal-bd">
          <div className="form-grid">
            <label className="fld full">Nome / Razão social<input value={f.nome || ""} onChange={(e) => set("nome", e.target.value)} autoFocus /></label>
            <label className="fld">Contato (pessoa)<input value={f.contato || ""} onChange={(e) => set("contato", e.target.value)} /></label>
            <label className="fld">WhatsApp<input value={f.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="(31) 9 9999-9999" /></label>
            <label className="fld">E-mail<input value={f.email || ""} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="fld">Representante<input value={f.representante || ""} onChange={(e) => set("representante", e.target.value)} /></label>
            <label className="fld">Cidade<input value={f.cidade || ""} onChange={(e) => set("cidade", e.target.value)} /></label>
            <label className="fld uf">UF<input value={f.uf || ""} onChange={(e) => set("uf", e.target.value)} maxLength={2} /></label>
            <label className="fld">CNPJ<input value={f.cnpj || ""} onChange={(e) => set("cnpj", e.target.value)} /></label>
            <label className="fld full">Observação<textarea value={f.observacao || ""} onChange={(e) => set("observacao", e.target.value)} rows={2} /></label>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn go" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
