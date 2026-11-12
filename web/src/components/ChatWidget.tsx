import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ChatSetor, type ChatConversa, type ChatMsg, type ChatParResumo } from "../api";
import { getUser } from "../auth";

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
  const [aviso, setAviso] = useState<{ setor: string; nome: string; autor: string | null; texto: string | null } | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [vendoTudo, setVendoTudo] = useState(false);
  const [todas, setTodas] = useState<ChatParResumo[]>([]);
  const [parAberto, setParAberto] = useState<{ a: string; b: string; nomeA: string; nomeB: string } | null>(null);
  const [msgsPar, setMsgsPar] = useState<ChatMsg[]>([]);
  const admin = !!getUser()?.admin;
  const fimRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const comRef = useRef(com); comRef.current = com;
  const meuRef = useRef(meu); meuRef.current = meu;
  const abertoRef = useRef(aberto); abertoRef.current = aberto;
  const ultimoVistoRef = useRef<string>("");   // criado_em da mensagem recebida mais nova já vista
  const iniciadoRef = useRef(false);            // 1ª carga não dispara aviso (mensagens antigas)
  const audioRef = useRef<AudioContext | null>(null);
  const avisoTimerRef = useRef<number>(0);

  // Prepara o som e pede permissão de notificação — só num clique (regra dos navegadores).
  function prepararAvisos() {
    try {
      if (!audioRef.current) { const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; if (AC) audioRef.current = new AC(); }
      if (audioRef.current?.state === "suspended") audioRef.current.resume().catch(() => {});
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    } catch { /* ok */ }
  }
  // Somzinho de aviso (dois tons), sem precisar de arquivo de áudio.
  function tocarSom() {
    try {
      const ac = audioRef.current; if (!ac) return;
      if (ac.state === "suspended") ac.resume().catch(() => {});
      const tom = (freq: number, t0: number) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination); o.type = "sine"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ac.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + 0.32);
        o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + 0.34);
      };
      tom(880, 0); tom(1240, 0.17);
    } catch { /* ok */ }
  }
  // Notificação do navegador (aparece no Windows mesmo com a aba atrás).
  function notificarNavegador(titulo: string, corpo: string) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (!document.hidden) return; // na tela, o popup já avisa — não duplica
      const n = new Notification("💬 " + titulo, { body: corpo, tag: "chat-bigtricot" });
      n.onclick = () => { try { window.focus(); } catch { /* ok */ } setAberto(true); n.close(); };
    } catch { /* ok */ }
  }
  // Detecta mensagem NOVA recebida (de outro setor) entre uma atualização e outra.
  function processarNovas(lista: ChatConversa[]) {
    let maxTs = "", nova: ChatConversa | null = null;
    for (const c of lista) {
      const u = c.ultima;
      if (u && u.de_setor !== meuRef.current && u.criado_em > maxTs) { maxTs = u.criado_em; nova = c; }
    }
    if (!iniciadoRef.current) { iniciadoRef.current = true; ultimoVistoRef.current = maxTs; return; }
    if (maxTs && maxTs > ultimoVistoRef.current && nova) {
      ultimoVistoRef.current = maxTs;
      const vendoAgora = comRef.current === nova.setor && abertoRef.current && typeof document !== "undefined" && document.hasFocus();
      if (!vendoAgora) {
        const u = nova.ultima!;
        setAviso({ setor: nova.setor, nome: nova.nome, autor: u.autor, texto: u.texto });
        tocarSom();
        notificarNavegador(nova.nome, (u.autor ? u.autor.split(" ")[0] + ": " : "") + (u.texto || "📷 foto"));
        window.clearTimeout(avisoTimerRef.current);
        avisoTimerRef.current = window.setTimeout(() => setAviso(null), 8000);
      }
    }
  }

  const nomeSetor = (id: string) => setores.find((s) => s.id === id)?.nome || id;
  const totalNaoLidas = useMemo(() => conversas.reduce((s, c) => s + (c.nao_lidas || 0), 0), [conversas]);

  useEffect(() => { api.chatSetores().then((d) => Array.isArray(d) && setSetores(d)).catch(() => {}); }, []);

  function carregarConversas() {
    if (!meuRef.current) return;
    api.chatConversas(meuRef.current).then((d) => { if (Array.isArray(d)) { setConversas(d); processarNovas(d); } }).catch(() => {});
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

  async function enviarFoto(file?: File | null) {
    if (!file || !com || enviandoFoto) return;
    setEnviandoFoto(true);
    try {
      const m = await api.chatEnviarFoto(meu, com, file, texto.trim() || undefined);
      if (m && m.id) { setMsgs((prev) => [...prev, m]); setTexto(""); }
      carregarConversas();
    } catch { /* ok */ } finally { setEnviandoFoto(false); }
  }

  // Controle do Boss (admin): abre a lista de TODAS as conversas / uma conversa qualquer (só leitura).
  function abrirVerTudo() {
    setVendoTudo(true); setParAberto(null); setCom("");
    api.chatTodas().then((d) => Array.isArray(d) && setTodas(d)).catch(() => {});
  }
  function abrirPar(p: ChatParResumo) {
    setParAberto({ a: p.a, b: p.b, nomeA: p.nomeA, nomeB: p.nomeB }); setMsgsPar([]);
    api.chatConversaPar(p.a, p.b).then((d) => { if (Array.isArray(d)) { setMsgsPar(d); setTimeout(scrollFim, 30); } }).catch(() => {});
  }

  function escolherSetor(id: string) {
    prepararAvisos();
    try { localStorage.setItem(LS_SETOR, id); } catch { /* ok */ }
    setMeu(id); setTrocarSetor(false); setCom("");
  }

  const precisaSetor = !meu || trocarSetor;

  return (
    <>
      {aviso && (
        <div className="chat-aviso" role="button" onClick={() => { setAberto(true); abrirConversa(aviso.setor); setAviso(null); }}>
          <div className="chat-aviso-ic">💬</div>
          <div className="chat-aviso-mid">
            <div className="chat-aviso-ttl">Nova mensagem — {aviso.nome}{aviso.autor ? " · " + aviso.autor.split(" ")[0] : ""}</div>
            <div className="chat-aviso-txt">{aviso.texto || "📷 foto"}</div>
            <div className="chat-aviso-cta">Toque para abrir ›</div>
          </div>
          <button className="chat-aviso-x" onClick={(e) => { e.stopPropagation(); setAviso(null); }} title="Fechar">✕</button>
        </div>
      )}

      <button className={"chatfab" + (aberto ? " on" : "")} onClick={() => { prepararAvisos(); setAberto((v) => !v); }} title="Chat da equipe" aria-label="Chat da equipe">
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
          ) : vendoTudo ? (
            parAberto ? (
              <div className="chat-conversa">
                <div className="chat-conv-top">
                  <button className="chat-voltar" onClick={() => setParAberto(null)} title="Voltar">‹</button>
                  <span className="chat-conv-av sm">👁</span>
                  <b>{parAberto.nomeA} ↔ {parAberto.nomeB}</b>
                </div>
                <div className="chat-msgs">
                  {msgsPar.length === 0 && <div className="chat-vazio" style={{ margin: "auto" }}>Sem mensagens nesta conversa.</div>}
                  {msgsPar.map((m) => (
                    <div key={m.id} className={"chat-bolha " + (m.de_setor === parAberto.a ? "dele" : "minha")}>
                      <div className="chat-autor">{m.autor || "—"} · {nomeSetor(m.de_setor)}</div>
                      {m.imagem_key ? <img className="chat-img" src={`/api/chat/foto/${m.imagem_key}`} alt="foto" loading="lazy" onClick={() => window.open(`/api/chat/foto/${m.imagem_key}`, "_blank")} /> : null}
                      {m.texto ? <div className="chat-txt">{m.texto}</div> : null}
                      <div className="chat-hora">{horaDe(m.criado_em)}</div>
                    </div>
                  ))}
                  <div ref={fimRef} />
                </div>
                <div className="chat-obs">👁 Visão do Boss — só leitura.</div>
              </div>
            ) : (
              <div className="chat-list">
                <div className="chat-conv-top"><button className="chat-voltar" onClick={() => setVendoTudo(false)} title="Voltar">‹</button><b>👁 Todas as conversas (Boss)</b></div>
                {todas.length === 0 && <div className="chat-vazio">Ainda não há conversas entre os setores.</div>}
                {todas.map((p) => (
                  <button key={p.a + "|" + p.b} className="chat-conv" onClick={() => abrirPar(p)}>
                    <span className="chat-conv-av">👁</span>
                    <span className="chat-conv-mid">
                      <span className="chat-conv-nome">{p.nomeA} ↔ {p.nomeB}</span>
                      <span className="chat-conv-prev">{p.ultima ? (p.ultima.autor ? p.ultima.autor.split(" ")[0] + ": " : "") + (p.ultima.texto || "📷 foto") : "—"}</span>
                    </span>
                    <span className="chat-conv-rt">{p.ultima && <span className="chat-conv-hora">{horaDe(p.ultima.criado_em)}</span>}</span>
                  </button>
                ))}
              </div>
            )
          ) : !com ? (
            <div className="chat-list">
              {admin && <button className="chat-vertudo" onClick={abrirVerTudo}>👁 Ver todas as conversas (Boss)</button>}
              {conversas.length === 0 && <div className="chat-vazio">Carregando conversas…</div>}
              {conversas.map((c) => (
                <button key={c.setor} className="chat-conv" onClick={() => abrirConversa(c.setor)}>
                  <span className="chat-conv-av">{c.nome.slice(0, 1)}</span>
                  <span className="chat-conv-mid">
                    <span className="chat-conv-nome">{c.nome}</span>
                    <span className="chat-conv-prev">{c.ultima ? (c.ultima.de_setor === meu ? "Você: " : (c.ultima.autor ? c.ultima.autor.split(" ")[0] + ": " : "")) + (c.ultima.texto || "📷 foto") : "Toque para começar"}</span>
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
                    {m.imagem_key ? <img className="chat-img" src={`/api/chat/foto/${m.imagem_key}`} alt="foto" loading="lazy" onClick={() => window.open(`/api/chat/foto/${m.imagem_key}`, "_blank")} /> : null}
                    {m.texto ? <div className="chat-txt">{m.texto}</div> : null}
                    <div className="chat-hora">{horaDe(m.criado_em)}</div>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>
              <div className="chat-input">
                <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; const el = e.currentTarget; enviarFoto(f); if (el) el.value = ""; }} />
                <button className="chat-foto" onClick={() => fileRef.current?.click()} disabled={enviandoFoto} title="Enviar foto">{enviandoFoto ? "⏳" : "📷"}</button>
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
