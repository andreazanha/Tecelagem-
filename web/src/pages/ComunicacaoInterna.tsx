import { useEffect, useRef, useState } from "react";
import { api, type ChatMensagem, type ChatMembro } from "../api";
import { getUser } from "../auth";
import { iniciarGravacaoWav, pararGravacaoWav, type GravadorWav } from "../wav";

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
type Contato = { canal: string; nome: string; externo: boolean; membroId: string };

// ── Comunicação interna: chat da equipe (começa vazio; você adiciona quem quiser) ──
export function ComunicacaoInterna() {
  const eu = getUser()?.nome || "";
  const [membros, setMembros] = useState<ChatMembro[]>([]);     // adicionados (interno/externo)
  const [usuariosSis, setUsuariosSis] = useState<string[]>([]); // usuários do sistema (p/ o picker)
  const [resumo, setResumo] = useState<Resumo[]>([]);
  const [ativo, setAtivo] = useState<Contato | null>(null);
  const [busca, setBusca] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  function carregar() {
    api.chatMembros().then(setMembros).catch(() => {});
    api.contatosChat().then((ms) => setUsuariosSis(ms.filter((m) => m !== eu))).catch(() => {});
  }
  useEffect(carregar, [eu]);
  useEffect(() => {
    if (!eu) return;
    const f = () => api.dmResumoChat(eu).then(setResumo).catch(() => {});
    f(); const t = setInterval(f, 6000); return () => clearInterval(t);
  }, [eu]);

  // Lista = SÓ os membros adicionados (interno usa DM; externo usa canal ext:).
  const contatos: Contato[] = membros.map((m) => (m.tipo === "interno"
    ? { canal: canalDM(eu, m.nome), nome: m.nome, externo: false, membroId: m.id }
    : { canal: "ext:" + m.id, nome: m.nome, externo: true, membroId: m.id }));
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
          <input placeholder="🔎 Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="ci-add" onClick={() => setAddOpen(true)} title="Adicionar pessoa à comunicação interna">＋</button>
        </div>
        <div className="ci-membros">
          {membros.length === 0 && <div className="muted2" style={{ padding: 16, fontSize: 12.5, textAlign: "center" }}>Ninguém aqui ainda.<br />Toque no <b>＋</b> pra adicionar as pessoas da equipe.</div>}
          {membros.length > 0 && lista.length === 0 && <div className="muted2" style={{ padding: 14, fontSize: 12.5 }}>Ninguém encontrado.</div>}
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
                  <div className="ci-item-sub">{m.externo ? "WhatsApp da equipe" : (r ? (r.ultimo_autor === eu ? "Você: " : "") + "conversa aberta" : "Usa o sistema")}</div>
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
      {addOpen && <AddMembroModal onFechar={() => setAddOpen(false)} onMudou={carregar} membros={membros} usuariosSis={usuariosSis} />}
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
  const [gravando, setGravando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<GravadorWav | null>(null);

  function carregar() { api.listarChat(canal).then(setMsgs).catch(() => {}); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 3500); return () => clearInterval(t); /* eslint-disable-next-line */ }, [canal]);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length]);
  useEffect(() => { const marcar = () => api.marcarLidoChat(eu, canal).catch(() => {}); marcar(); const t = setInterval(marcar, 4000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [canal]);

  async function enviar() {
    if (!texto.trim() || busy) return;
    setBusy(true);
    try { await api.enviarChat(canal, eu, texto.trim()); setTexto(""); carregar(); } finally { setBusy(false); }
  }
  // Envia qualquer arquivo (foto, PDF, doc…) — o servidor deduz o tipo e, se for membro
  // externo, encaminha pro WhatsApp dele. Confere o tamanho antes (16MB).
  async function enviarArquivo(f: File) {
    if (f.size > 40 * 1024 * 1024) {
      alert(`Esse arquivo tem ${(f.size / 1024 / 1024).toFixed(1)} MB — acima do limite de 40 MB.\n\nComprima e reenvie.`);
      return;
    }
    setBusy(true);
    try { await api.enviarFotoChat(canal, eu, f, texto.trim() || undefined); setTexto(""); carregar(); } finally { setBusy(false); }
  }
  async function gravar() {
    if (gravando) {
      const f = pararGravacaoWav(recRef.current); recRef.current = null; setGravando(false);
      if (f) await enviarArquivo(f);
      return;
    }
    try { recRef.current = await iniciarGravacaoWav(); setGravando(true); }
    catch { alert("Não consegui acessar o microfone. Autorize o microfone no navegador e tente de novo."); }
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
            {m.imagem_key && (m.midia_tipo === "audio"
              ? <audio controls src={`/api/chat/foto/${m.imagem_key}`} style={{ maxWidth: 230, display: "block", marginBottom: m.texto ? 4 : 0 }} />
              : m.midia_tipo === "arquivo"
                ? <a href={`/api/chat/foto/${m.imagem_key}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "inherit", textDecoration: "none", background: "var(--bg-soft,#f1f5f9)", padding: "8px 11px", borderRadius: 8, marginBottom: m.texto ? 4 : 0 }}>📎 {m.texto || "arquivo"}</a>
                : <img src={`/api/chat/foto/${m.imagem_key}`} alt="" style={{ maxWidth: 220, borderRadius: 8, display: "block", marginBottom: m.texto ? 4 : 0 }} />)}
            {m.texto && m.midia_tipo !== "arquivo" && formatarMsg(m.texto)}
            <span className="at-tm">{hora(m.criado_em)}</span>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <div className="at-compose">
        <input ref={fileRef} type="file" multiple accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" hidden onChange={(e) => { const fs = Array.from(e.target.files || []); e.currentTarget.value = ""; (async () => { for (const f of fs) await enviarArquivo(f); })(); }} />
        <button className="at-attach" title="Enviar foto, PDF ou arquivo" onClick={() => fileRef.current?.click()}>📎</button>
        <button className={"at-attach" + (gravando ? " gravando" : "")} title={gravando ? "Parar e enviar áudio" : "Gravar áudio"} onClick={gravar}>{gravando ? "⏹️" : "🎤"}</button>
        <textarea rows={1} placeholder={gravando ? "Gravando áudio…" : "Mensagem para " + outro + "…"} value={texto} onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files)[0]; if (f && f.type.startsWith("image/")) { e.preventDefault(); enviarArquivo(f); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        <button className="at-send" disabled={busy} onClick={enviar}>➤</button>
      </div>
    </div>
  );
}

// ── Modal: adicionar pessoa (usa o sistema OU outro número de WhatsApp) ────────────
function AddMembroModal({ onFechar, onMudou, membros, usuariosSis }: { onFechar: () => void; onMudou: () => void; membros: ChatMembro[]; usuariosSis: string[] }) {
  const [modo, setModo] = useState<"interno" | "externo">("interno");
  const [nomeSis, setNomeSis] = useState("");
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  // Usuários do sistema ainda não adicionados.
  const jaInternos = new Set(membros.filter((m) => m.tipo === "interno").map((m) => m.nome));
  const disponiveis = usuariosSis.filter((u) => !jaInternos.has(u));

  async function salvar() {
    setErro("");
    if (modo === "interno") {
      if (!nomeSis) { setErro("Escolha uma pessoa da lista."); return; }
      setBusy(true);
      try { await api.addChatMembro(nomeSis, "", "interno"); setNomeSis(""); onMudou(); } catch { setErro("Não consegui adicionar."); } finally { setBusy(false); }
    } else {
      if (!nome.trim() || tel.replace(/\D/g, "").length < 10) { setErro("Informe o nome e o WhatsApp com DDD."); return; }
      setBusy(true);
      try { await api.addChatMembro(nome.trim(), tel, "externo"); setNome(""); setTel(""); onMudou(); } catch { setErro("Não consegui salvar. Confira o número."); } finally { setBusy(false); }
    }
  }
  async function remover(id: string) {
    if (!confirm("Remover esta pessoa da comunicação interna?")) return;
    try { await api.delChatMembro(id); onMudou(); } catch { alert("Não consegui remover."); }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 470, width: "min(470px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#25d366,#075e54)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">➕ Adicionar à equipe</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
        </div>
        <div className="modal-bd">
          <div className="ci-modo">
            <button className={"ci-modo-b" + (modo === "interno" ? " on" : "")} onClick={() => setModo("interno")}>💻 Usa o sistema</button>
            <button className={"ci-modo-b" + (modo === "externo" ? " on" : "")} onClick={() => setModo("externo")}>📱 Outro número (WhatsApp)</button>
          </div>
          {modo === "interno" ? (
            <>
              <div className="muted2" style={{ fontSize: 12.5, margin: "10px 0" }}>Pessoa que <b>faz login no sistema</b>. A conversa fica só dentro do app.</div>
              <label className="fld"><span>Quem?</span>
                <select className="at-sel" value={nomeSis} onChange={(e) => setNomeSis(e.target.value)}>
                  <option value="">— escolher pessoa —</option>
                  {disponiveis.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              {disponiveis.length === 0 && <div className="muted2" style={{ fontSize: 12 }}>Todo mundo do sistema já foi adicionado.</div>}
            </>
          ) : (
            <>
              <div className="muted2" style={{ fontSize: 12.5, margin: "10px 0" }}>Alguém da equipe que usa <b>outro número</b> e não entra no sistema. O que você escrever vai pro <b>WhatsApp dela</b>, e a resposta volta aqui.</div>
              <label className="fld"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João (produção)" /></label>
              <label className="fld"><span>WhatsApp (com DDD)</span><input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Ex.: (46) 99999-9999" inputMode="tel" /></label>
            </>
          )}
          {erro && <div style={{ color: "#dc2626", fontSize: 12.5, marginTop: 4 }}>{erro}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button className="btn btn-soft" onClick={onFechar}>Fechar</button>
            <button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Adicionar"}</button>
          </div>
          {membros.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="muted2" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Já na comunicação interna</div>
              {membros.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", borderBottom: "1px solid var(--line,#f1f5f9)" }}>
                  <div className={"ci-av" + (m.tipo === "externo" ? " ext" : "")} style={{ width: 30, height: 30, fontSize: 12 }}>{iniciais(m.nome)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{m.nome} {m.tipo === "externo" ? "📱" : "💻"}</div><div className="muted2" style={{ fontSize: 12 }}>{m.tipo === "externo" ? m.telefone : "usa o sistema"}</div></div>
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
