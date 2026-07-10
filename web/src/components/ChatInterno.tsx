// Chat interno da equipe: widget flutuante com canais por setor. Atualiza por
// polling (o Worker não segura conexão aberta). Badge de não lidas.
import { useState, useEffect, useRef, useCallback } from "react";
import { getUser } from "../auth";
import { api, type ChatMensagem } from "../api";

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
const nomeCanal = (id: string) => CANAIS.find((c) => c.id === id)?.nome || id;

export function ChatInterno() {
  const nome = getUser()?.nome || "";
  const [open, setOpen] = useState(false);
  const [canal, setCanal] = useState("geral");
  const [msgs, setMsgs] = useState<ChatMensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [naoLidas, setNaoLidas] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const marcarLido = useCallback(() => { localStorage.setItem(SEEN_KEY, new Date().toISOString()); setNaoLidas(0); }, []);
  const carregar = useCallback(() => { api.listarChat(canal).then(setMsgs).catch(() => {}); }, [canal]);

  // Mensagens do canal ativo — recarrega a cada 4s enquanto o chat está aberto.
  useEffect(() => {
    if (!open) return;
    carregar();
    const t = setInterval(carregar, 4000);
    return () => clearInterval(t);
  }, [open, carregar]);

  // Badge de não lidas — polling leve (15s) enquanto está fechado.
  useEffect(() => {
    if (!nome || open) return;
    const check = () => {
      const desde = localStorage.getItem(SEEN_KEY) || "1970-01-01";
      api.naoLidasChat(desde, nome).then((r) => setNaoLidas(r.nao_lidas)).catch(() => {});
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [nome, open]);

  useEffect(() => { if (open) marcarLido(); }, [open, canal, marcarLido]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try { await api.enviarChat(canal, nome || "Anônimo", t); setTexto(""); marcarLido(); carregar(); }
    catch { /* ignore */ }
    finally { setEnviando(false); }
  }
  const hora = (iso: string) => {
    const d = new Date(iso.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? "" : "Z"));
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  if (!nome) return null;
  return (
    <>
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} title="Chat da equipe" aria-label="Chat da equipe" style={{ position: "fixed" }}>
        💬{naoLidas > 0 && <span className="chat-badge">{naoLidas > 99 ? "99+" : naoLidas}</span>}
      </button>
      {open && (
        <div className="chat-panel">
          <div className="chat-hd"><span>💬 Chat da equipe</span><button className="chat-x" onClick={() => setOpen(false)}>✕</button></div>
          <div className="chat-canais">
            {CANAIS.map((c) => (
              <button key={c.id} className={"chat-canal" + (c.id === canal ? " on" : "")} onClick={() => setCanal(c.id)}>{c.nome}</button>
            ))}
          </div>
          <div className="chat-msgs">
            {msgs.length === 0
              ? <p className="muted" style={{ textAlign: "center", marginTop: 24, fontSize: 13 }}>Sem mensagens em <strong>{nomeCanal(canal)}</strong>. Comece a conversa!</p>
              : msgs.map((m) => {
                  const meu = m.autor === nome;
                  return (
                    <div key={m.id} className={"chat-msg" + (meu ? " meu" : "")}>
                      {!meu && <div className="chat-autor">{m.autor}</div>}
                      <div className="chat-bolha">{m.texto}</div>
                      <div className="chat-hora">{hora(m.criado_em)}</div>
                    </div>
                  );
                })}
            <div ref={fim} />
          </div>
          <div className="chat-input">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
              placeholder={`Mensagem em ${nomeCanal(canal)}…`} spellCheck lang="pt-BR" autoFocus />
            <button className="btn btn-primary" onClick={enviar} disabled={enviando || !texto.trim()}>Enviar</button>
          </div>
        </div>
      )}
    </>
  );
}
