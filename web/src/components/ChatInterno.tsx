// Chat interno da equipe: canais por setor + conversas diretas (1:1), foto,
// @menção com autocompletar e push. Atualiza por polling.
import { useState, useEffect, useRef, useCallback } from "react";
import { getUser } from "../auth";
import { api, type ChatMensagem, type ChatDM } from "../api";

const CANAIS = [
  { id: "geral", nome: "Geral" },
  { id: "tecelagem", nome: "Tecelagem" },
  { id: "passadoria", nome: "Passadoria" },
  { id: "corte", nome: "Corte" },
  { id: "costura", nome: "Costura" },
  { id: "revisao", nome: "Revisão" },
  { id: "estoque", nome: "Estoque" },
  { id: "expedicao", nome: "Expedição" },
];
const SEEN_KEY = "chat-last-seen";

export function ChatInterno() {
  const nome = getUser()?.nome || "";
  const [open, setOpen] = useState(false);
  const [canal, setCanal] = useState("geral");
  const [msgs, setMsgs] = useState<ChatMensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [naoLidas, setNaoLidas] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [contatos, setContatos] = useState<string[]>([]);
  const [dms, setDms] = useState<ChatDM[]>([]);
  const [novaDM, setNovaDM] = useState(false);
  const [mencao, setMencao] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const nomeCanal = (id: string) => id.startsWith("dm:") ? (dms.find((d) => d.canal === id)?.outro || id.slice(3).split("|").find((p) => p !== nome) || "Direta") : (CANAIS.find((c) => c.id === id)?.nome || id);
  const marcarLido = useCallback(() => { localStorage.setItem(SEEN_KEY, new Date().toISOString()); setNaoLidas(0); }, []);
  const carregar = useCallback(() => { api.listarChat(canal).then(setMsgs).catch(() => {}); }, [canal]);

  useEffect(() => {
    if (!open) return;
    carregar();
    const t = setInterval(carregar, 4000);
    return () => clearInterval(t);
  }, [open, carregar]);

  useEffect(() => {
    if (!open || !nome) return;
    api.contatosChat().then(setContatos).catch(() => {});
    api.dmsChat(nome).then(setDms).catch(() => {});
  }, [open, nome]);

  useEffect(() => {
    if (!nome || open) return;
    const check = () => { const desde = localStorage.getItem(SEEN_KEY) || "1970-01-01"; api.naoLidasChat(desde, nome).then((r) => setNaoLidas(r.nao_lidas)).catch(() => {}); };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [nome, open]);

  useEffect(() => { if (open) marcarLido(); }, [open, canal, marcarLido]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, novaDM]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try { await api.enviarChat(canal, nome || "Anônimo", t); setTexto(""); setMencao(null); marcarLido(); carregar(); }
    catch { /* ignore */ }
    finally { setEnviando(false); }
  }
  async function enviarFoto(file: File) {
    setEnviando(true);
    try { await api.enviarFotoChat(canal, nome || "Anônimo", file, texto.trim() || undefined); setTexto(""); marcarLido(); carregar(); }
    catch (e) { alert((e as Error).message); }
    finally { setEnviando(false); }
  }
  function abrirDM(contato: string) {
    const cid = "dm:" + [nome, contato].sort().join("|");
    setDms((ds) => (ds.some((d) => d.canal === cid) ? ds : [...ds, { canal: cid, outro: contato }]));
    setCanal(cid); setNovaDM(false);
  }
  function onTexto(v: string) {
    setTexto(v);
    const m = v.match(/@([^\s@]*)$/);
    setMencao(m ? m[1].toLowerCase() : null);
  }
  function inserirMencao(n: string) { setTexto((t) => t.replace(/@([^\s@]*)$/, "@" + n + " ")); setMencao(null); }

  const hora = (iso: string) => { const d = new Date(iso.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? "" : "Z")); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  const sugestoes = mencao != null ? contatos.filter((n) => n !== nome && n.toLowerCase().includes(mencao)).slice(0, 6) : [];
  const renderTexto = (t: string) => t.split(/(@[\wÀ-ú]+)/g).map((p, i) => (p.startsWith("@") ? <span key={i} className="chat-tag">{p}</span> : p));

  if (!nome) return null;
  return (
    <>
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} title="Chat da equipe" aria-label="Chat da equipe" style={{ position: "fixed" }}>
        💬{naoLidas > 0 && <span className="chat-badge">{naoLidas > 99 ? "99+" : naoLidas}</span>}
      </button>
      {open && (
        <div className="chat-panel">
          <div className="chat-hd"><span>💬 {nomeCanal(canal)}</span><button className="chat-x" onClick={() => setOpen(false)}>✕</button></div>
          <div className="chat-canais">
            {CANAIS.map((c) => <button key={c.id} className={"chat-canal" + (c.id === canal ? " on" : "")} onClick={() => { setNovaDM(false); setCanal(c.id); }}>{c.nome}</button>)}
            {dms.map((d) => <button key={d.canal} className={"chat-canal" + (d.canal === canal ? " on" : "")} onClick={() => { setNovaDM(false); setCanal(d.canal); }}>👤 {d.outro}</button>)}
            <button className="chat-canal" title="Nova conversa direta" onClick={() => setNovaDM((v) => !v)}>＋ Direta</button>
          </div>

          {novaDM ? (
            <div className="chat-msgs">
              <p className="muted" style={{ fontSize: 12, margin: "4px 6px" }}>Escolha com quem conversar:</p>
              {contatos.filter((n) => n !== nome).map((n) => (
                <button key={n} className="chat-contato" onClick={() => abrirDM(n)}>👤 {n}</button>
              ))}
              {contatos.filter((n) => n !== nome).length === 0 && <p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 16 }}>Nenhum contato cadastrado.</p>}
            </div>
          ) : (
            <div className="chat-msgs">
              {msgs.length === 0
                ? <p className="muted" style={{ textAlign: "center", marginTop: 24, fontSize: 13 }}>Sem mensagens em <strong>{nomeCanal(canal)}</strong>. Comece a conversa!</p>
                : msgs.map((m) => {
                    const meu = m.autor === nome;
                    return (
                      <div key={m.id} className={"chat-msg" + (meu ? " meu" : "")}>
                        {!meu && <div className="chat-autor">{m.autor}</div>}
                        <div className="chat-bolha">
                          {m.imagem_key && <img src={`/api/chat/foto/${m.imagem_key}`} alt="foto" className="chat-img" />}
                          {m.texto && <div>{renderTexto(m.texto)}</div>}
                        </div>
                        <div className="chat-hora">{hora(m.criado_em)}</div>
                      </div>
                    );
                  })}
              <div ref={fim} />
            </div>
          )}

          {!novaDM && (
            <div style={{ position: "relative" }}>
              {sugestoes.length > 0 && (
                <div className="chat-mencoes">
                  {sugestoes.map((n) => <button key={n} className="chat-mencao-item" onClick={() => inserirMencao(n)}>@{n}</button>)}
                </div>
              )}
              <div className="chat-input">
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFoto(f); e.currentTarget.value = ""; }} />
                <button className="chat-foto-btn" title="Enviar foto" onClick={() => fileRef.current?.click()} disabled={enviando}>📎</button>
                <input value={texto} onChange={(e) => onTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
                  placeholder={`Mensagem em ${nomeCanal(canal)}… (@ menciona)`} spellCheck lang="pt-BR" />
                <button className="btn btn-primary" onClick={enviar} disabled={enviando || !texto.trim()}>Enviar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
