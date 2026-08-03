import { useEffect, useRef, useState } from "react";
import { api, type ChatMensagem } from "../api";
import { getUser } from "../auth";

// ── Helpers locais (iguais aos do WhatsApp, mas isolados aqui) ────────────────────
function iniciais(s?: string | null) {
  return (s || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function hora(iso?: string | null) {
  if (!iso) return "";
  const norm = /Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(norm);
  if (!isNaN(d.getTime())) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const mm = iso.match(/(\d{2}):(\d{2})/);
  return mm ? `${mm[1]}:${mm[2]}` : "";
}
function formatarMsg(texto: string | null | undefined) {
  return String(texto ?? "").split(/(https?:\/\/[^\s]+)/g).map((p, i) => {
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{p}</a>;
    return p.split(/(\*[^*\n]+\*)/g).map((s, j) =>
      /^\*[^*\n]+\*$/.test(s) ? <b key={i + "-" + j}>{s.slice(1, -1)}</b> : <span key={i + "-" + j}>{s}</span>
    );
  });
}
const canalDM = (a: string, b: string) => "dm:" + [a, b].sort().join("|");

type Resumo = { outro: string; ultima_em: string; ultimo_autor: string; nao_lido: boolean };

// ── Comunicação interna: chat da equipe, idêntico ao WhatsApp (2 painéis) ──────────
export function ComunicacaoInterna() {
  const eu = getUser()?.nome || "";
  const [membros, setMembros] = useState<string[]>([]);
  const [resumo, setResumo] = useState<Resumo[]>([]);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => { api.contatosChat().then((ms) => setMembros(ms.filter((m) => m !== eu))).catch(() => {}); }, [eu]);
  useEffect(() => {
    if (!eu) return;
    const carregar = () => api.dmResumoChat(eu).then(setResumo).catch(() => {});
    carregar(); const t = setInterval(carregar, 6000); return () => clearInterval(t);
  }, [eu]);

  const resumoDe = (o: string) => resumo.find((x) => x.outro === o);
  const temNovo = (o: string) => !!resumoDe(o)?.nao_lido;
  // Ordena: quem tem mensagem mais recente primeiro; quem nunca conversou, por nome.
  const ordenados = [...membros].sort((a, b) => {
    const ra = resumoDe(a)?.ultima_em || "", rb = resumoDe(b)?.ultima_em || "";
    if (ra && rb) return rb.localeCompare(ra);
    if (ra) return -1; if (rb) return 1;
    return a.localeCompare(b);
  });
  const lista = ordenados.filter((m) => m.toLowerCase().includes(busca.trim().toLowerCase()));

  async function abrir(o: string) {
    setAtivo(o);
    setResumo((rs) => rs.map((x) => (x.outro === o ? { ...x, nao_lido: false } : x)));
    try { await api.marcarLidoChat(eu, canalDM(eu, o)); } catch { /* ignora */ }
  }

  if (!eu) return <div className="ci-wrap"><p className="muted" style={{ padding: 20 }}>Faça login para usar a comunicação interna.</p></div>;

  return (
    <div className="ci-wrap">
      <aside className="ci-lista">
        <div className="ci-busca"><input placeholder="🔎 Buscar na equipe…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="ci-membros">
          {lista.length === 0 && <div className="muted2" style={{ padding: 14, fontSize: 12.5 }}>Ninguém encontrado.</div>}
          {lista.map((m) => {
            const r = resumoDe(m);
            return (
              <button key={m} className={"ci-item" + (ativo === m ? " on" : "")} onClick={() => abrir(m)}>
                <div className="ci-av">{iniciais(m)}</div>
                <div className="ci-item-info">
                  <div className="ci-item-top"><span className="ci-nome">{m}</span>{r?.ultima_em && <span className="ci-hora">{hora(r.ultima_em)}</span>}</div>
                  <div className="ci-item-sub">{r ? (r.ultimo_autor === eu ? "Você: " : "") + "conversa aberta" : "Iniciar conversa"}</div>
                </div>
                {temNovo(m) && <span className="ci-dot" />}
              </button>
            );
          })}
        </div>
      </aside>
      <section className="ci-chat">
        {ativo ? <ChatPane key={ativo} eu={eu} outro={ativo} /> : (
          <div className="ci-vazio">
            <div style={{ fontSize: 46 }}>💬</div>
            <p>Selecione alguém da equipe para conversar.</p>
            <p className="muted2" style={{ fontSize: 12.5 }}>É um chat interno — o cliente nunca vê nada daqui.</p>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Painel de conversa (idêntico ao chat do WhatsApp) ─────────────────────────────
function ChatPane({ eu, outro }: { eu: string; outro: string }) {
  const canal = canalDM(eu, outro);
  const [msgs, setMsgs] = useState<ChatMensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function carregar() { api.listarChat(canal).then(setMsgs).catch(() => {}); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 3500); return () => clearInterval(t); /* eslint-disable-next-line */ }, [canal]);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length]);
  // Enquanto o painel está aberto, marca como lido no servidor (sincroniza aparelhos).
  useEffect(() => { const marcar = () => api.marcarLidoChat(eu, canal).catch(() => {}); marcar(); const t = setInterval(marcar, 4000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [canal]);

  async function enviar() {
    if (!texto.trim() || busy) return;
    setBusy(true);
    try { await api.enviarChat(canal, eu, texto.trim()); setTexto(""); carregar(); } finally { setBusy(false); }
  }
  async function enviarFoto(f: File) {
    setBusy(true);
    try { await api.enviarFotoChat(canal, eu, f, texto.trim()); setTexto(""); carregar(); } finally { setBusy(false); }
  }

  return (
    <div className="ci-pane">
      <div className="ci-thd">
        <div className="ci-av lg">{iniciais(outro)}</div>
        <div className="ci-thd-info"><div className="nm">👤 {outro}</div><div className="sub">Comunicação interna — o cliente não vê</div></div>
      </div>
      <div className="ci-msgs">
        {msgs.length === 0 && <div className="muted2" style={{ margin: "auto", fontSize: 12.5 }}>Sem mensagens ainda. Diga oi para {outro}! 👋</div>}
        {msgs.map((m) => (
          <div key={m.id} className={"at-b " + (m.autor === eu ? "out" : "in")}>
            {m.autor !== eu && <div className="at-aut">{m.autor}</div>}
            {m.imagem_key && <img src={`/api/chat/foto/${m.imagem_key}`} alt="" style={{ maxWidth: 220, borderRadius: 8, display: "block", marginBottom: m.texto ? 4 : 0 }} />}
            {m.texto && formatarMsg(m.texto)}
            <span className="at-tm">{hora(m.criado_em)}</span>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <div className="at-compose">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFoto(f); e.target.value = ""; }} />
        <button className="at-attach" title="Enviar foto" onClick={() => fileRef.current?.click()}>📎</button>
        <textarea rows={1} placeholder={"Mensagem para " + outro + "…"} value={texto} onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files)[0]; if (f && f.type.startsWith("image/")) { e.preventDefault(); enviarFoto(f); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        <button className="at-send" disabled={busy} onClick={enviar}>➤</button>
      </div>
    </div>
  );
}
