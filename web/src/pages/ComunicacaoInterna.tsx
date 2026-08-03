import { useEffect, useRef, useState } from "react";
import { api, type ChatMensagem, type ChatMembro } from "../api";
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

type Resumo = { outro: string; canal: string; ultima_em: string; ultimo_autor: string; nao_lido: boolean };
type Contato = { canal: string; nome: string; externo: boolean; membroId?: string };

// ── Comunicação interna: chat da equipe, idêntico ao WhatsApp (2 painéis) ──────────
export function ComunicacaoInterna() {
  const eu = getUser()?.nome || "";
  const [membrosSis, setMembrosSis] = useState<string[]>([]); // usuários do sistema
  const [membrosExt, setMembrosExt] = useState<ChatMembro[]>([]); // números externos
  const [resumo, setResumo] = useState<Resumo[]>([]);
  const [ativo, setAtivo] = useState<Contato | null>(null);
  const [busca, setBusca] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  function carregarMembros() {
    api.contatosChat().then((ms) => setMembrosSis(ms.filter((m) => m !== eu))).catch(() => {});
    api.chatMembros().then(setMembrosExt).catch(() => {});
  }
  useEffect(carregarMembros, [eu]);
  useEffect(() => {
    if (!eu) return;
    const carregar = () => api.dmResumoChat(eu).then(setResumo).catch(() => {});
    carregar(); const t = setInterval(carregar, 6000); return () => clearInterval(t);
  }, [eu]);

  // Lista unificada: usuários do sistema (canal dm:) + membros externos (canal ext:).
  const contatos: Contato[] = [
    ...membrosSis.map((n) => ({ canal: canalDM(eu, n), nome: n, externo: false })),
    ...membrosExt.map((m) => ({ canal: "ext:" + m.id, nome: m.nome, externo: true, membroId: m.id })),
  ];
  const resumoDe = (canal: string) => resumo.find((x) => x.canal === canal);
  const temNovo = (canal: string) => !!resumoDe(canal)?.nao_lido;
  const ordenados = [...contatos].sort((a, b) => {
    const ra = resumoDe(a.canal)?.ultima_em || "", rb = resumoDe(b.canal)?.ultima_em || "";
    if (ra && rb) return rb.localeCompare(ra);
    if (ra) return -1; if (rb) return 1;
    return a.nome.localeCompare(b.nome);
  });
  const lista = ordenados.filter((m) => m.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  async function abrir(ct: Contato) {
    setAtivo(ct);
    setResumo((rs) => rs.map((x) => (x.canal === ct.canal ? { ...x, nao_lido: false } : x)));
    try { await api.marcarLidoChat(eu, ct.canal); } catch { /* ignora */ }
  }

  if (!eu) return <div className="ci-wrap"><p className="muted" style={{ padding: 20 }}>Faça login para usar a comunicação interna.</p></div>;

  return (
    <div className="ci-wrap">
      <aside className="ci-lista">
        <div className="ci-busca">
          <input placeholder="🔎 Buscar na equipe…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="ci-add" onClick={() => setAddOpen(true)} title="Adicionar membro por WhatsApp (outro número)">＋</button>
        </div>
        <div className="ci-membros">
          {lista.length === 0 && <div className="muted2" style={{ padding: 14, fontSize: 12.5 }}>Ninguém encontrado.</div>}
          {lista.map((m) => {
            const r = resumoDe(m.canal);
            return (
              <button key={m.canal} className={"ci-item" + (ativo?.canal === m.canal ? " on" : "")} onClick={() => abrir(m)}>
                <div className={"ci-av" + (m.externo ? " ext" : "")}>{iniciais(m.nome)}</div>
                <div className="ci-item-info">
                  <div className="ci-item-top">
                    <span className="ci-nome">{m.nome}{m.externo && <span className="ci-tagwa" title="Membro por WhatsApp (número externo)">📱</span>}</span>
                    {r?.ultima_em && <span className="ci-hora">{hora(r.ultima_em)}</span>}
                  </div>
                  <div className="ci-item-sub">{m.externo ? "WhatsApp da equipe" : (r ? (r.ultimo_autor === eu ? "Você: " : "") + "conversa aberta" : "Iniciar conversa")}</div>
                </div>
                {temNovo(m.canal) && <span className="ci-dot" />}
              </button>
            );
          })}
        </div>
      </aside>
      <section className={"ci-chat" + (ativo ? " aberta" : "")}>
        {ativo ? <ChatPane key={ativo.canal} eu={eu} contato={ativo} onFechar={() => setAtivo(null)} /> : (
          <div className="ci-vazio">
            <div style={{ fontSize: 46 }}>💬</div>
            <p>Selecione alguém da equipe para conversar.</p>
            <p className="muted2" style={{ fontSize: 12.5 }}>É um chat interno — o cliente nunca vê nada daqui.</p>
          </div>
        )}
      </section>
      {addOpen && <AddMembroModal onFechar={() => setAddOpen(false)} onSalvo={() => { setAddOpen(false); carregarMembros(); }} onRemover={carregarMembros} membros={membrosExt} />}
    </div>
  );
}

// ── Painel de conversa (idêntico ao chat do WhatsApp) ─────────────────────────────
function ChatPane({ eu, contato, onFechar }: { eu: string; contato: Contato; onFechar: () => void }) {
  const canal = contato.canal;
  const outro = contato.nome;
  const [msgs, setMsgs] = useState<ChatMensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function carregar() { api.listarChat(canal).then(setMsgs).catch(() => {}); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 3500); return () => clearInterval(t); /* eslint-disable-next-line */ }, [canal]);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length]);
  useEffect(() => { const marcar = () => api.marcarLidoChat(eu, canal).catch(() => {}); marcar(); const t = setInterval(marcar, 4000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [canal]);

  async function enviar() {
    if (!texto.trim() || busy) return;
    setBusy(true);
    try { await api.enviarChat(canal, eu, texto.trim()); setTexto(""); carregar(); } finally { setBusy(false); }
  }
  async function enviarFoto(f: File) {
    if (contato.externo) { alert("Por enquanto, membros por WhatsApp recebem só texto por aqui."); return; }
    setBusy(true);
    try { await api.enviarFotoChat(canal, eu, f, texto.trim()); setTexto(""); carregar(); } finally { setBusy(false); }
  }

  return (
    <div className="ci-pane">
      <div className="ci-thd">
        <button className="ci-voltar" onClick={onFechar} title="Voltar / fechar conversa">←</button>
        <div className={"ci-av lg" + (contato.externo ? " ext" : "")}>{iniciais(outro)}</div>
        <div className="ci-thd-info">
          <div className="nm">👤 {outro}{contato.externo && <span className="ci-tagwa">📱</span>}</div>
          <div className="sub">{contato.externo ? "Vai pro WhatsApp dele(a) — o cliente não vê" : "Comunicação interna — o cliente não vê"}</div>
        </div>
        <button className="ci-fechar" onClick={onFechar} title="Fechar conversa">✕</button>
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
        {!contato.externo && <button className="at-attach" title="Enviar foto" onClick={() => fileRef.current?.click()}>📎</button>}
        <textarea rows={1} placeholder={"Mensagem para " + outro + "…"} value={texto} onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files)[0]; if (f && f.type.startsWith("image/")) { e.preventDefault(); enviarFoto(f); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        <button className="at-send" disabled={busy} onClick={enviar}>➤</button>
      </div>
    </div>
  );
}

// ── Modal: adicionar/remover membro por WhatsApp (número externo) ──────────────────
function AddMembroModal({ onFechar, onSalvo, onRemover, membros }: { onFechar: () => void; onSalvo: () => void; onRemover: () => void; membros: ChatMembro[] }) {
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  async function salvar() {
    if (!nome.trim() || tel.replace(/\D/g, "").length < 10) { setErro("Informe o nome e o WhatsApp com DDD."); return; }
    setBusy(true); setErro("");
    try { await api.addChatMembro(nome.trim(), tel); setNome(""); setTel(""); onSalvo(); }
    catch { setErro("Não consegui salvar. Confira o número."); } finally { setBusy(false); }
  }
  async function remover(id: string) {
    if (!confirm("Remover este membro da comunicação interna?")) return;
    try { await api.delChatMembro(id); onRemover(); } catch { alert("Não consegui remover."); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460, width: "min(460px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#25d366,#075e54)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">📱 Membro por WhatsApp</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
        </div>
        <div className="modal-bd">
          <div className="muted2" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Adicione alguém da equipe que usa <b>outro número</b> e não entra no sistema. O que você escrever pra essa pessoa vai pro <b>WhatsApp dela</b>, e a resposta dela volta aqui.
          </div>
          <label className="fld"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João (produção)" /></label>
          <label className="fld"><span>WhatsApp (com DDD)</span><input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Ex.: (46) 99999-9999" inputMode="tel" /></label>
          {erro && <div style={{ color: "#dc2626", fontSize: 12.5, marginTop: 4 }}>{erro}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button className="btn btn-soft" onClick={onFechar}>Fechar</button>
            <button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Adicionar"}</button>
          </div>
          {membros.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="muted2" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Membros por WhatsApp já cadastrados</div>
              {membros.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", borderBottom: "1px solid var(--line,#f1f5f9)" }}>
                  <div className="ci-av ext" style={{ width: 30, height: 30, fontSize: 12 }}>{iniciais(m.nome)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{m.nome}</div><div className="muted2" style={{ fontSize: 12 }}>{m.telefone}</div></div>
                  <button className="btn btn-soft" style={{ color: "#dc2626" }} onClick={() => remover(m.id)} title="Remover">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
