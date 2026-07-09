import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AtendBoard, type AtendConversa, type AtendConversaDetalhe } from "../api";

function iniciais(s?: string | null) {
  return (s || "?").replace(/\D/g, "").slice(-2) || (s || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function telBonito(t: string) {
  const d = (t || "").replace(/\D/g, "");
  const n = d.startsWith("55") ? d.slice(2) : d;
  return n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3, 7)}-${n.slice(7, 11)}` : t;
}
function hora(iso?: string | null) {
  if (!iso) return "";
  const m = iso.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}
const SETOR_EMOJI: Record<string, string> = { vendas: "🛒", financeiro: "💰", "pos-venda": "📦", outros: "💬" };

// ── Página do robô de atendimento ────────────────────────────────────────────────
export function Atendimento() {
  const [board, setBoard] = useState<AtendBoard | null>(null);
  const [abrir, setAbrir] = useState<string | null>(null);
  const [sim, setSim] = useState(false);

  function recarregar() { api.atendBoard().then(setBoard).catch(() => {}); }
  useEffect(() => { recarregar(); const t = setInterval(recarregar, 8000); return () => clearInterval(t); }, []);

  return (
    <div className="quadro-page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div><h1>Atendimento</h1><div className="breadcrumb">Comercial › Atendimento (robô do WhatsApp)</div></div>
        <div className="row-gap" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="at-status">🟡 Z-API não conectada (simulação)</span>
          <button className="btn btn-primary" onClick={() => setSim(true)}>💬 Simular cliente</button>
        </div>
      </div>

      {!board ? (
        <div className="card pad muted">Carregando…</div>
      ) : (
        <div className="fx-board">
          {board.colunas.map((col) => {
            const cs = board.conversas.filter((c) => c.coluna === col.id);
            return (
              <div className="fx-col" key={col.id}>
                <div className="fx-hd"><span className="fx-dot" style={{ background: col.cor }} />{col.label}<span className="ct">{cs.length}</span></div>
                {cs.map((c) => <ConvMini key={c.id} c={c} onAbrir={() => setAbrir(c.id)} />)}
              </div>
            );
          })}
        </div>
      )}

      {sim && <Simulador onFechar={() => setSim(false)} onMudou={recarregar} />}
      {abrir && <ConversaModal id={abrir} onFechar={() => setAbrir(null)} onMudou={recarregar} />}
    </div>
  );
}

function ConvMini({ c, onAbrir }: { c: AtendConversa; onAbrir: () => void }) {
  const humano = c.coluna === "atendimento-humano";
  return (
    <div className="fx-card" onClick={onAbrir}>
      <div className="fx-nm">{c.nome || telBonito(c.telefone)}</div>
      <div className="fx-sub">{c.nome ? telBonito(c.telefone) : [c.cidade, c.uf].filter(Boolean).join("/") || "—"}</div>
      {c.ultima_msg && <div className="at-prev">{c.ultima_msg}</div>}
      <div className="fx-foot">
        <span className="at-badge">{humano ? `👤 ${c.responsavel || "humano"}` : `🤖 robô`}</span>
        {c.setor && <span className="fx-sub">{SETOR_EMOJI[c.setor] || ""}</span>}
        <span className="fx-sub" style={{ marginLeft: "auto" }}>{hora(c.atualizado_em)}</span>
      </div>
    </div>
  );
}

// ── Conversa (thread estilo WhatsApp + contexto + ações do atendente) ──────────────
function ConversaModal({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const [d, setD] = useState<AtendConversaDetalhe | null>(null);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  function carregar() { api.atendConversa(id).then(setD); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 5000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { fim.current?.scrollIntoView(); }, [d?.mensagens.length]);

  async function assumir() {
    const nome = prompt("Seu nome (atendente):", d?.responsavel || "");
    if (nome == null) return;
    setBusy(true);
    try { await api.atendAssumir(id, nome || "Atendente"); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function enviar() {
    if (!texto.trim()) return;
    setBusy(true);
    try { await api.atendEnviar(id, { texto: texto.trim(), autor: d?.responsavel || "Atendente" }); setTexto(""); carregar(); onMudou(); }
    finally { setBusy(false); }
  }

  const humano = d?.coluna === "atendimento-humano";
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card at-modal" onClick={(e) => e.stopPropagation()}>
        <div className="at-thd">
          <div className="at-av">{iniciais(d?.nome || d?.telefone)}</div>
          <div className="info">
            <div className="nm">{d?.nome || (d ? telBonito(d.telefone) : "…")}</div>
            <div className="sub">{d ? telBonito(d.telefone) : ""}{d?.cidade ? ` · ${d.cidade}/${d.uf || ""}` : ""}</div>
          </div>
          {d && <span className="at-chip" style={{ background: "#eef2ff", color: "#4338ca" }}>{d.coluna.replace(/-/g, " ")}</span>}
          <button className="modal-x" onClick={onFechar}>✕</button>
        </div>

        <div className="at-body">
          <div className="at-msgs">
            {d?.mensagens.map((m) => (
              m.tipo === "sistema"
                ? <div className="at-sys" key={m.id}>⚙️ {m.texto}</div>
                : <div key={m.id} className={"at-b " + (m.direcao === "in" ? "in" : "out")}>
                    {m.autor && m.direcao === "out" && <div className="at-aut">{m.autor === "bot" ? "🤖 robô" : m.autor}</div>}
                    {m.tipo === "arquivo" ? <span className="at-file">📒 {m.texto}</span> : m.texto}
                    <span className="at-tm">{hora(m.criado_em)}</span>
                  </div>
            ))}
            <div ref={fim} />
          </div>

          <div className="at-ctx">
            <div className="at-block-h">Dados coletados</div>
            <div className="at-row"><span>Setor</span><b>{d?.setor ? (SETOR_EMOJI[d.setor] || "") + " " + d.setor : "—"}</b></div>
            <div className="at-row"><span>Loja</span><b>{d?.nome || "—"}</b></div>
            <div className="at-row"><span>CNPJ</span><b>{d?.cnpj || "—"}</b></div>
            <div className="at-row"><span>Lojista</span><b>{d?.lojista == null ? "—" : d.lojista ? "✅ sim" : "🙅 não"}</b></div>
            <div className="at-row"><span>Cidade</span><b>{[d?.cidade, d?.uf].filter(Boolean).join("/") || "—"}</b></div>
            {d?.card_id && <Link to="/funil" className="btn" style={{ marginTop: 10, display: "block", textAlign: "center" }}>🎯 Ver no funil</Link>}
            {!humano && <button className="kbtn go" style={{ marginTop: 10, width: "100%" }} disabled={busy} onClick={assumir}>🙋 Assumir atendimento</button>}
          </div>
        </div>

        <div className="at-compose">
          {humano
            ? <><input placeholder="Escreva uma mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} /><button className="at-send" disabled={busy} onClick={enviar}>➤</button></>
            : <div className="muted2" style={{ padding: "6px 4px" }}>🤖 O robô está conduzindo. Clique em <b>Assumir</b> para responder.</div>}
        </div>
      </div>
    </div>
  );
}

// ── Simulador: você digita como se fosse o cliente no WhatsApp ─────────────────────
function Simulador({ onFechar, onMudou }: { onFechar: () => void; onMudou: () => void }) {
  const [tel, setTel] = useState("5531988887777");
  const [texto, setTexto] = useState("");
  const [msgs, setMsgs] = useState<{ de: "cliente" | "bot"; texto: string; arquivo?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length]);

  async function mandar(t?: string) {
    const msg = (t ?? texto).trim();
    if (!msg) return;
    setMsgs((m) => [...m, { de: "cliente", texto: msg }]);
    setTexto(""); setBusy(true);
    try {
      const r = await api.atendEntrada({ telefone: tel, texto: msg });
      setMsgs((m) => [...m, ...r.respostas.map((s) => ({ de: "bot" as const, texto: s.texto, arquivo: s.tipo === "arquivo" }))]);
      onMudou();
    } catch (e) { setMsgs((m) => [...m, { de: "bot", texto: "⚠️ " + (e as Error).message }]); }
    finally { setBusy(false); }
  }
  const atalhos = ["oi", "1", "Loja Encanto Decor", "12.345.678/0001-90", "não tenho, uso pessoal", "Contagem, MG"];

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card at-sim" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#25d366,#075e54)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">💬 Simulador — cliente</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
          <div className="modal-hd-sub">Digite como se fosse o cliente no WhatsApp. Nº: <input className="at-siminput" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        </div>
        <div className="at-simscr">
          {msgs.length === 0 && <div className="muted2" style={{ textAlign: "center", padding: 20 }}>Mande "oi" pra começar o atendimento 👇</div>}
          {msgs.map((m, i) => (
            <div key={i} className={"at-b " + (m.de === "cliente" ? "out" : "in")}>
              {m.de === "bot" && <div className="at-aut">🤖 robô</div>}
              {m.arquivo ? <span className="at-file">📒 {m.texto}</span> : m.texto}
            </div>
          ))}
          <div ref={fim} />
        </div>
        <div className="at-simatalhos">
          {atalhos.map((a) => <span key={a} className="fx-pill" onClick={() => mandar(a)}>{a}</span>)}
        </div>
        <div className="at-compose">
          <input placeholder="Mensagem do cliente…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && mandar()} autoFocus />
          <button className="at-send" disabled={busy} onClick={() => mandar()}>➤</button>
        </div>
      </div>
    </div>
  );
}
