import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, type ClienteCrm, type ClienteFicha as TFicha } from "../api";
import { ConversaModal } from "./Atendimento";

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
// Normaliza uma data da planilha (Date, serial ou texto dd/mm/aaaa) para ISO YYYY-MM-DD.
function toISO(v: unknown): string {
  if (v == null || v === "") return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) { const a = m[3].length === 2 ? "20" + m[3] : m[3]; return `${a}-${pad(+m[2])}-${pad(+m[1])}`; }
  return "";
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
  const [importar, setImportar] = useState(false);
  const [agrupar, setAgrupar] = useState(true);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [conversa, setConversa] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<ClienteCrm | null>(null); // cliente aguardando "prospecção x só conversar"

  function recarregar() {
    api.listarClientesCrm().then((d) => { if (Array.isArray(d)) setLista(d); }).catch(() => {}).finally(() => setCarregando(false));
  }
  useEffect(() => { recarregar(); }, []);

  // Abre a conversa DENTRO do CRM (não abre o WhatsApp externo): acha ou cria a
  // conversa pelo telefone do cliente e mostra o chat aqui mesmo. Com criarCard=true
  // também cria um card de prospecção no funil (novo lead).
  async function atender(c: ClienteCrm, criarCard: boolean) {
    setEscolha(null);
    setAbrindo(c.id);
    try {
      const r = await api.abrirConversaDoCard({ telefone: c.whatsapp, nome: c.nome, cliente_id: c.id, criar_card: criarCard });
      if (r.id) setConversa(r.id);
      else alert(r.error || "Este cliente não tem WhatsApp no cadastro. Adicione o número em Clientes e tente de novo.");
    } catch {
      alert("Não consegui abrir a conversa agora. Tente de novo em instantes.");
    } finally { setAbrindo(null); }
  }

  const q = busca.trim().toLowerCase();
  const filtrados = useMemo(() => {
    if (!q) return lista;
    return lista.filter((c) =>
      c.nome.toLowerCase().includes(q) || (c.cidade || "").toLowerCase().includes(q) || (c.representante || "").toLowerCase().includes(q)
    );
  }, [lista, q]);

  // Agrupa por representante (ordenado; "Sem representante" por último), cada grupo com total.
  const grupos = useMemo(() => {
    const m = new Map<string, ClienteCrm[]>();
    for (const c of filtrados) {
      const k = (c.representante || "").trim() || "— Sem representante";
      (m.get(k) || m.set(k, []).get(k)!).push(c);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0].startsWith("—") ? 1 : 0) - (b[0].startsWith("—") ? 1 : 0) || a[0].localeCompare(b[0], "pt-BR"))
      .map(([rep, cls]) => ({ rep, cls, total: cls.reduce((s, c) => s + (c.total || 0), 0) }));
  }, [filtrados]);
  const toggle = (rep: string) => setColapsados((s) => { const n = new Set(s); n.has(rep) ? n.delete(rep) : n.add(rep); return n; });

  const hoje = new Date(); const mesAtual = hoje.toISOString().slice(0, 7);
  const compraram90 = lista.filter((c) => {
    if (!c.ultima) return false;
    const d = new Date(c.ultima); return (hoje.getTime() - d.getTime()) / 86400000 <= 90;
  }).length;
  const novosMes = lista.filter((c) => (c.created_at || "").slice(0, 7) === mesAtual).length;
  const somaTotal = lista.reduce((s, c) => s + (c.total || 0), 0);
  const somaPed = lista.reduce((s, c) => s + (c.pedidos || 0), 0);
  const ticketGeral = somaPed ? somaTotal / somaPed : 0;

  const linha = (c: ClienteCrm) => (
    <tr key={c.id} onClick={() => nav(`/clientes/${c.id}`)}>
      <td><div className="cli-nm">{c.nome}</div><div className="muted2">{[c.cidade, c.uf].filter(Boolean).join(" · ") || "—"}</div></td>
      <td>{c.representante ? <span className="rep-cli">🧑‍💼 {c.representante}</span> : <span className="muted2">—</span>}</td>
      <td>{c.whatsapp ? (
        <button className="wa wa-btn" disabled={abrindo === c.id} onClick={(e) => { e.stopPropagation(); setEscolha(c); }} title="Abrir conversa no CRM">
          {abrindo === c.id ? "abrindo…" : `🟢 ${c.whatsapp}`}
        </button>
      ) : <span className="muted2">—</span>}</td>
      <td style={{ textAlign: "center" }}>{c.pedidos || 0}</td>
      <td className="money">{brl(c.total)}</td>
      <td>{desde(c.ultima)}</td>
    </tr>
  );

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div><h1>Clientes</h1><div className="breadcrumb">Comercial › Clientes</div></div>
        <div className="row-gap" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input className="busca-ped" placeholder="🔎 Buscar cliente, cidade, representante…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 240 }} />
          <button className="btn btn-soft" onClick={() => setAgrupar((a) => !a)} title="Agrupar clientes por representante">{agrupar ? "☰ Lista simples" : "🗂️ Agrupar por representante"}</button>
          <button className="btn btn-soft" onClick={() => setImportar(true)}>📥 Importar planilha</button>
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
                {agrupar
                  ? grupos.map((g) => {
                      const col = colapsados.has(g.rep);
                      return (
                        <Fragment key={g.rep}>
                          <tr className="cli-grp" onClick={() => toggle(g.rep)}>
                            <td colSpan={6}>
                              <span className="cli-grp-ar">{col ? "▸" : "▾"}</span>
                              🧑‍💼 <strong>{g.rep.replace(/^—\s*/, "")}</strong>
                              <span className="cli-grp-n">{g.cls.length} cliente(s)</span>
                              {g.total > 0 && <span className="cli-grp-t">{brl(g.total)}</span>}
                            </td>
                          </tr>
                          {!col && g.cls.map((c) => linha(c))}
                        </Fragment>
                      );
                    })
                  : filtrados.map((c) => linha(c))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {novo && <ClienteModal cliente={novo} onFechar={() => setNovo(null)} onSalvo={() => { setNovo(null); recarregar(); }} />}
      {importar && <ImportarClientesModal onFechar={() => setImportar(false)} onImportou={() => { setImportar(false); recarregar(); }} />}

      {escolha && (
        <div className="modal-bg" onClick={() => setEscolha(null)}>
          <div className="modal-card" style={{ maxWidth: 460, width: "min(460px,96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Falar com {escolha.nome}</h3>
            <p className="muted" style={{ fontSize: 13.5 }}>Como você quer abrir essa conversa? Isso decide se entra no funil de vendas.</p>
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              <button className="btn btn-primary" style={{ textAlign: "left", lineHeight: 1.35, height: "auto", padding: "10px 14px" }} onClick={() => atender(escolha, true)}>
                🎯 <b>Iniciar prospecção</b><br /><small style={{ opacity: .9 }}>Cria um card de “Novo lead” no funil e abre a conversa</small>
              </button>
              <button className="btn btn-soft" style={{ textAlign: "left", lineHeight: 1.35, height: "auto", padding: "10px 14px" }} onClick={() => atender(escolha, false)}>
                💬 <b>Só conversar</b><br /><small className="muted">Ex.: fiscal, financeiro, dúvida — abre a conversa sem criar card</small>
              </button>
            </div>
            <div style={{ textAlign: "right", marginTop: 12 }}><button className="btn" onClick={() => setEscolha(null)}>Cancelar</button></div>
          </div>
        </div>
      )}
      {conversa && <ConversaModal id={conversa} onFechar={() => { setConversa(null); recarregar(); }} onMudou={recarregar} />}
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
          <div className="frow"><span className="k">Instagram</span> {f.instagram
            ? <a href={/^https?:\/\//i.test(f.instagram) ? f.instagram : `https://instagram.com/${f.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">📸 {f.instagram}</a>
            : "—"}</div>
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
            <label className="fld">Instagram<input value={f.instagram || ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@perfil ou link" /></label>
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

// ── Importar planilha de clientes (xlsx/csv) ─────────────────────────────────────
function ImportarClientesModal({ onFechar, onImportou }: { onFechar: () => void; onImportou: () => void }) {
  const [linhas, setLinhas] = useState<Record<string, string>[]>([]);
  const [rep, setRep] = useState("");
  const [nomeArq, setNomeArq] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

  async function carregar(file: File) {
    setErro(""); setMsg(""); setLinhas([]);
    setNomeArq(file.name);
    setRep((r) => r || file.name.replace(/\.[^.]+$/, "").replace(/^clientes[_\s-]*/i, "").trim());
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
      if (!rows.length) { setErro("Planilha vazia."); return; }
      const head = (rows[0] as unknown[]).map(norm);
      const col = (...ns: string[]) => head.findIndex((h) => ns.includes(h));
      const iNome = col("nome", "razaosocial", "cliente"), iFant = col("fantasia", "nomefantasia"), iUf = col("uf", "estado"),
        iCid = col("cidade"), iCel = col("celular", "whatsapp", "whats", "cel"), iDdd = col("ddd"),
        iFone = col("fones", "fone", "telefone", "tel"), iMail = col("email"), iCnpj = col("cnpjcpf", "cnpj", "cpf");
      // Data da última compra: aceita "Data Ult_Venda", "Ultima Compra" etc.
      let iUlt = col("dataultvenda", "dataultimavenda", "ultimacompra", "dataultimacompra", "ultvenda", "ultimavenda", "dataultimofaturamento");
      if (iUlt < 0) iUlt = head.findIndex((h) => h.includes("ult") && (h.includes("venda") || h.includes("compra") || h.includes("fatur")));
      if (iNome < 0) { setErro("Não achei a coluna 'Nome'. Confira o cabeçalho da planilha."); return; }
      const out: Record<string, string>[] = [];
      for (const r of rows.slice(1)) {
        const row = r as unknown[];
        const nome = String(row[iNome] ?? "").trim();
        if (!nome) continue;
        const ddd = iDdd >= 0 ? dig(row[iDdd]) : "";
        const num = dig(iCel >= 0 ? row[iCel] : "") || dig(iFone >= 0 ? row[iFone] : "");
        const wa = num ? (num.length >= 10 ? num : ddd + num) : "";
        out.push({
          nome, uf: iUf >= 0 ? String(row[iUf] ?? "").trim().toUpperCase().slice(0, 2) : "",
          cidade: iCid >= 0 ? String(row[iCid] ?? "").trim() : "", whatsapp: wa,
          email: iMail >= 0 ? String(row[iMail] ?? "").trim() : "", cnpj: iCnpj >= 0 ? String(row[iCnpj] ?? "").trim() : "",
          ultima_compra: iUlt >= 0 ? toISO(row[iUlt]) : "",
          observacao: iFant >= 0 && row[iFant] ? `Fantasia: ${String(row[iFant]).trim()}` : "",
        });
      }
      if (!out.length) { setErro("Nenhum cliente com nome encontrado."); return; }
      setLinhas(out);
    } catch { setErro("Não consegui ler o arquivo. Use .xlsx ou .csv."); }
  }

  async function importar() {
    if (!linhas.length) return;
    setBusy(true); setMsg("");
    try {
      const r = await api.importarClientes({ representante: rep.trim(), clientes: linhas });
      if (r.error) setErro(r.error);
      else { setMsg(`✓ ${r.criados || 0} novos, ${r.atualizados || 0} atualizados${rep.trim() ? ` · vinculados a ${rep.trim()}` : ""}.`); setTimeout(onImportou, 1600); }
    } catch { setErro("Erro ao importar."); } finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560, width: "min(560px,96vw)", color: "#1e293b" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>📥 Importar clientes por planilha</h2>
        <p className="muted" style={{ fontSize: 13 }}>Aceita Excel (.xlsx) ou CSV. Cabeçalho esperado: <b>Nome, Fantasia, UF, Cidade, DDD, Fones, Celular, email, CNPJ_CPF</b>. Casa com quem já existe pelo CNPJ ou nome.</p>

        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && carregar(e.target.files[0])} style={{ margin: "8px 0" }} />

        {erro && <div style={{ background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>{erro}</div>}

        {linhas.length > 0 && (
          <>
            <div style={{ background: "#ecfdf5", color: "#065f46", borderRadius: 8, padding: "8px 12px", fontSize: 13.5, margin: "8px 0" }}>
              ✅ <b>{linhas.length}</b> clientes lidos de <b>{nomeArq}</b>. Ex.: {linhas.slice(0, 3).map((l) => l.nome).join(", ")}…
            </div>
            <label className="campo"><span className="campo-label">Representante destes clientes (vincula todos)</span>
              <input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Ex.: Augusto (é criado se não existir)" /></label>
          </>
        )}

        {msg && <div style={{ background: "#ecfdf5", color: "#065f46", borderRadius: 8, padding: "8px 12px", fontSize: 13.5, marginTop: 8 }}>{msg}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-soft" onClick={onFechar}>Fechar</button>
          <button className="btn btn-primary" disabled={busy || !linhas.length} onClick={importar}>{busy ? "Importando…" : `Importar ${linhas.length || ""}`}</button>
        </div>
      </div>
    </div>
  );
}
