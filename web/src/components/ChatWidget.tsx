import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ChatSetor, type ChatConversa, type ChatMsg } from "../api";

// CHAT INTERNO da equipe — botão flutuante + painel estilo WhatsApp. Os setores
// conversam 1 a 1 (cada setor é um contato). O setor DESTE computador é escolhido
// uma vez e fica salvo só neste navegador. Isolado: não mexe em pedido/estoque/Syntech.

const LS_SETOR = "bt_chat_setor";

function horaDe(criado: string): string {
  try { return new Date(criado.replace(" ", "T") + "Z").toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

export function ChatWidget() {
  const [setores, setSetores] = useState<ChatSetor[]>([]);
  const [meu, setMeu] = useState<string>(() => { try { return localStorage.getItem(LS_SETOR) || ""; } catch { return ""; } });
  const [aberto, setAberto] = useState(false);
  const [conversas, setConversas] = useState<ChatConversa[]>([]);
  const [com, setCom] = useState<string>("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [texto, setTexto] = useState("");
  const [trocarSetor, setTrocarSetor] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const comRef = useRef(com); comRef.current = com;
  const meuRef = useRef(meu); meuRef.current = meu;
  const abertoRef = useRef(aberto); abertoRef.current = aberto;

  const nomeSetor = (id: string) => setores.find((s) => s.id === id)?.nome || id;
  const totalNaoLidas = useMemo(() => conversas.reduce((s, c) => s + (c.nao_lidas || 0), 0), [conversas]);

  useEffect(() => { api.chatSetores().then((d) => Array.isArray(d) && setSetores(d)).catch(() => {}); }, []);

  function carregarConversas() {
    if (!meuRef.current) return;
    api.chatConversas(meuRef.current).then((d) => Array.isArray(d) && setConversas(d)).catch(() => {});
  }

  // Polling: a lista de conversas (para o aviso/badge) sempre; as mensagens da
  // conversa aberta a cada ~3,5s. Só troca o estado se chegou algo novo.
  useEffect(() => {
    if (!meu) return;
    carregarConversas();
    const t = setInterval(async () => {
      carregarConversas();
      const c = comRef.current;
      if (c && abertoRef.current) {
        try {
          const d = await api.chatMensagens(meuRef.current, c);
          if (Array.isArray(d)) setMsgs((prev) => (d.length === prev.length && d[d.length - 1]?.id === prev[prev.length - 1]?.id) ? prev : d);
        } catch { /* ok */ }
      }
    }, 3500);
    return () => clearInterval(t);
  }, [meu]);

  function scrollFim() { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }
  useEffect(() => { if (com) setTimeout(scrollFim, 30); /* eslint-disable-next-line */ }, [msgs.length, com]);

  function abrirConversa(setorId: string) {
    setCom(setorId); setMsgs([]);
    api.chatMensagens(meu, setorId).then((d) => { if (Array.isArray(d)) setMsgs(d); }).catch(() => {});
    setTimeout(carregarConversas, 300); // zera o não-lido depois de marcar leitura
  }

  async function enviar() {
    const t = texto.trim();
    if (!t || !com) return;
    setTexto("");
    try {
      const m = await api.chatEnviar(meu, com, t);
      if (m && m.id) setMsgs((prev) => [...prev, m]);
      carregarConversas();
    } catch { /* ok */ }
  }

  function escolherSetor(id: string) {
    try { localStorage.setItem(LS_SETOR, id); } catch { /* ok */ }
    setMeu(id); setTrocarSetor(false); setCom("");
  }

  const precisaSetor = !meu || trocarSetor;

  return (
    <>
      <button className={"chatfab" + (aberto ? " on" : "")} onClick={() => setAberto((v) => !v)} title="Chat da equipe" aria-label="Chat da equipe">
        {aberto
          ? <span style={{ fontSize: 22, fontWeight: 700 }}>✕</span>
          : <svg viewBox="0 0 24 24" width="27" height="27" fill="#fff"><path d="M12 2a10 10 0 0 0-8.63 15.05L2 22l5.1-1.33A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.24l-.3-.18-3 .78.8-2.92-.2-.31A8.2 8.2 0 0 1 12 3.8zM8.2 9a1 1 0 1 0 0 2h7.6a1 1 0 1 0 0-2H8.2zm0 3.4a1 1 0 1 0 0 2h4.8a1 1 0 1 0 0-2H8.2z"/></svg>}
        {!aberto && totalNaoLidas > 0 && <span className="chatfab-badge">{totalNaoLidas > 99 ? "99+" : totalNaoLidas}</span>}
      </button>

      {aberto && (
        <div className="chatpane">
          <div className="chatpane-hd">
            <div style={{ minWidth: 0 }}>
              <div className="chatpane-ttl">💬 Chat da equipe</div>
              <div className="chatpane-sub">Este PC: <b>{meu ? nomeSetor(meu) : "—"}</b>{meu && <button className="chat-mini" onClick={() => setTrocarSetor(true)}>trocar setor</button>}</div>
            </div>
            <button className="chat-x" onClick={() => setAberto(false)}>✕</button>
          </div>

          {precisaSetor ? (
            <div className="chat-setorpick">
              <p>Qual é o setor <b>deste computador</b>?</p>
              <div className="chat-setorbtns">
                {setores.map((s) => (
                  <button key={s.id} className={"chat-setorbtn" + (meu === s.id ? " sel" : "")} onClick={() => escolherSetor(s.id)}>{s.nome}</button>
                ))}
              </div>
              <div className="chat-dica">Fica salvo só neste computador. Dá pra trocar quando quiser.</div>
            </div>
          ) : !com ? (
            <div className="chat-list">
              {conversas.length === 0 && <div className="chat-vazio">Carregando conversas…</div>}
              {conversas.map((c) => (
                <button key={c.setor} className="chat-conv" onClick={() => abrirConversa(c.setor)}>
                  <span className="chat-conv-av">{c.nome.slice(0, 1)}</span>
                  <span className="chat-conv-mid">
                    <span className="chat-conv-nome">{c.nome}</span>
                    <span className="chat-conv-prev">{c.ultima ? (c.ultima.de_setor === meu ? "Você: " : "") + (c.ultima.texto || "📷 foto") : "Toque para começar"}</span>
                  </span>
                  <span className="chat-conv-rt">
                    {c.ultima && <span className="chat-conv-hora">{horaDe(c.ultima.criado_em)}</span>}
                    {c.nao_lidas > 0 && <span className="chat-conv-badge">{c.nao_lidas}</span>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="chat-conversa">
              <div className="chat-conv-top">
                <button className="chat-voltar" onClick={() => setCom("")} title="Voltar">‹</button>
                <span className="chat-conv-av sm">{nomeSetor(com).slice(0, 1)}</span>
                <b>{nomeSetor(com)}</b>
              </div>
              <div className="chat-msgs">
                {msgs.length === 0 && <div className="chat-vazio" style={{ margin: "auto" }}>Nenhuma mensagem ainda. Mande a primeira!</div>}
                {msgs.map((m) => (
                  <div key={m.id} className={"chat-bolha " + (m.de_setor === meu ? "minha" : "dele")}>
                    {m.de_setor !== meu && m.autor ? <div className="chat-autor">{m.autor}</div> : null}
                    <div className="chat-txt">{m.texto}</div>
                    <div className="chat-hora">{horaDe(m.criado_em)}</div>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>
              <div className="chat-input">
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma mensagem…" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }} />
                <button className="chat-send" onClick={enviar} disabled={!texto.trim()} title="Enviar">➤</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
