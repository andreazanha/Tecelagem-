import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { api, type ChatSetor, type ChatConversa, type ChatMsg, type ChatParResumo, type ChatFigurinha, type ChatAvatar } from "../api";
import { getUser } from "../auth";

// CHAT INTERNO da equipe — botão flutuante + painel estilo WhatsApp. Os setores
// conversam 1 a 1 (cada setor é um contato). O setor DESTE computador é escolhido
// uma vez e fica salvo só neste navegador. Isolado: não mexe em pedido/estoque/Syntech.

const LS_SETOR = "bt_chat_setor";

function horaDe(criado: string): string {
  try { return new Date(criado.replace(" ", "T") + "Z").toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}
function ehFigurinha(ik?: string | null): boolean { return !!ik && ik.startsWith("fig-"); }

export function ChatWidget() {
  const [setores, setSetores] = useState<ChatSetor[]>([]);
  const [meu, setMeu] = useState<string>(() => { try { return localStorage.getItem(LS_SETOR) || ""; } catch { return ""; } });
  const [aberto, setAberto] = useState(false);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(() => { try { const s = localStorage.getItem("bt_chat_fabpos"); return s ? JSON.parse(s) : null; } catch { return null; } });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const liveRef = useRef<{ x: number; y: number } | null>(null);
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
  const eu = getUser();
  const admin = !!eu?.admin;
  const meuUsuario = eu?.usuario || "";
  const meuNome = eu?.nome || "";
  // Só o Boss (admin) ou o acesso de montagem ("setup") podem TROCAR o setor do PC.
  // Depois de configurado, a equipe não mexe mais nisso.
  const podeTrocarSetor = admin || meuUsuario === "setup";
  const [abrirFig, setAbrirFig] = useState(false);
  const [figurinhas, setFigurinhas] = useState<ChatFigurinha[]>([]);
  const [subindoFig, setSubindoFig] = useState(false);
  const [avatares, setAvatares] = useState<ChatAvatar[]>([]);
  const [subindoAv, setSubindoAv] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const figFileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
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
        g.gain.exponentialRampToValueAtTime(0.42, ac.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + 0.34);
        o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + 0.36);
      };
      // Três toques (bem perceptível) estilo "ding-dong-ding".
      tom(880, 0); tom(1240, 0.18); tom(1040, 0.36);
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
  // Mapa nome-da-pessoa → foto (as mensagens guardam o NOME do autor).
  const avaMap = useMemo(() => { const m: Record<string, string> = {}; for (const a of avatares) if (a.nome) m[a.nome] = a.imagem_key; return m; }, [avatares]);
  const meuAvatar = useMemo(() => avatares.find((a) => a.usuario === meuUsuario)?.imagem_key || null, [avatares, meuUsuario]);
  // Bolinha com a foto do autor (ou a inicial, se ainda não tiver foto).
  function avMsg(autor: string | null) {
    const k = autor ? avaMap[autor] : null;
    return k
      ? <img className="chat-av-msg" src={`/api/chat/foto/${k}`} alt="" loading="lazy" />
      : <span className="chat-av-msg ini">{(autor || "—").slice(0, 1).toUpperCase()}</span>;
  }

  useEffect(() => { api.chatSetores().then((d) => Array.isArray(d) && setSetores(d)).catch(() => {}); }, []);
  function carregarAvatares() { api.chatAvatares().then((d) => Array.isArray(d) && setAvatares(d)).catch(() => {}); }
  useEffect(() => { carregarAvatares(); }, []);
  // Libera o som no 1º toque/tecla em qualquer lugar (regra dos navegadores), pra o
  // aviso sonoro de mensagem nova tocar mesmo sem abrir o chat antes.
  useEffect(() => {
    const unlock = () => prepararAvisos();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  // Acesso de montagem ("setup"): abre o chat sozinho pra cair direto na escolha do setor.
  useEffect(() => { try { if (getUser()?.usuario === "setup") setAberto(true); } catch { /* ok */ } }, []);
  async function subirAvatar(file?: File | null) {
    if (!file || subindoAv) return;
    setSubindoAv(true);
    try {
      const a = await api.chatSubirAvatar(file);
      if (a && a.imagem_key) setAvatares((prev) => [...prev.filter((x) => x.usuario !== a.usuario), a]);
    } catch { /* ok */ } finally { setSubindoAv(false); }
  }

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
    setCom(setorId); setMsgs([]); carregarAvatares();
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

  function carregarFigurinhas() { api.chatFigurinhas().then((d) => Array.isArray(d) && setFigurinhas(d)).catch(() => {}); }
  async function enviarFigurinha(ik: string) {
    if (!com) return;
    setAbrirFig(false);
    try {
      const m = await api.chatEnviarFigurinha(meu, com, ik);
      if (m && m.id) setMsgs((prev) => [...prev, m]);
      carregarConversas();
    } catch { /* ok */ }
  }
  async function subirFigurinha(file?: File | null) {
    if (!file || subindoFig) return;
    setSubindoFig(true);
    try {
      const f = await api.chatSubirFigurinha(file);
      if (f && f.imagem_key) setFigurinhas((prev) => [f, ...prev]);
    } catch { /* ok */ } finally { setSubindoFig(false); }
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

  // Botão flutuante ARRASTÁVEL (pra não atrapalhar no celular): toque abre/fecha o
  // chat; segurar e arrastar move o botão e salva a posição só neste aparelho.
  function fabDown(e: RPointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ok */ }
  }
  function fabMove(e: RPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current; if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 6) return;
    d.moved = true;
    const sz = e.currentTarget.offsetWidth || 58, m = 6;
    const x = Math.max(m, Math.min(window.innerWidth - sz - m, e.clientX - d.ox));
    const y = Math.max(m, Math.min(window.innerHeight - sz - m, e.clientY - d.oy));
    liveRef.current = { x, y }; setFabPos({ x, y });
  }
  function fabUp() {
    const d = dragRef.current; dragRef.current = null;
    if (d?.moved) { try { localStorage.setItem("bt_chat_fabpos", JSON.stringify(liveRef.current)); } catch { /* ok */ } }
    else { prepararAvisos(); setAberto((v) => !v); }
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

      <button className={"chatfab" + (aberto ? " on" : "")}
        style={fabPos ? { left: fabPos.x, top: fabPos.y, right: "auto", bottom: "auto" } : undefined}
        onPointerDown={fabDown} onPointerMove={fabMove} onPointerUp={fabUp}
        title="Chat da equipe (segure e arraste para mover)" aria-label="Chat da equipe">
        {aberto
          ? <span style={{ fontSize: 22, fontWeight: 700 }}>✕</span>
          : <svg viewBox="0 0 24 24" width="27" height="27" fill="#fff"><path d="M12 2a10 10 0 0 0-8.63 15.05L2 22l5.1-1.33A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.24l-.3-.18-3 .78.8-2.92-.2-.31A8.2 8.2 0 0 1 12 3.8zM8.2 9a1 1 0 1 0 0 2h7.6a1 1 0 1 0 0-2H8.2zm0 3.4a1 1 0 1 0 0 2h4.8a1 1 0 1 0 0-2H8.2z"/></svg>}
        {!aberto && totalNaoLidas > 0 && <span className="chatfab-badge">{totalNaoLidas > 99 ? "99+" : totalNaoLidas}</span>}
      </button>

      {aberto && (
        <div className="chatpane">
          <div className="chatpane-hd">
            {meuUsuario && meuUsuario !== "setup" && (
              <>
                <button className="chat-meuav" onClick={() => avatarFileRef.current?.click()} disabled={subindoAv} title="Sua foto — toque para trocar">
                  {meuAvatar ? <img src={`/api/chat/foto/${meuAvatar}`} alt="" /> : <span className="chat-meuav-ini">{(meuNome || "?").slice(0, 1).toUpperCase()}</span>}
                  <span className="chat-meuav-cam">{subindoAv ? "⏳" : "📷"}</span>
                </button>
                <input type="file" accept="image/*" ref={avatarFileRef} style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; const el = e.currentTarget; subirAvatar(f); if (el) el.value = ""; }} />
              </>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="chatpane-ttl">💬 Chat da equipe</div>
              <div className="chatpane-sub">{meuNome && meuUsuario !== "setup" ? <>Você: <b>{meuNome.split(" ")[0]}</b> · </> : null}Este PC: <b>{meu ? nomeSetor(meu) : "—"}</b>{meu && podeTrocarSetor && <button className="chat-mini" onClick={() => setTrocarSetor(true)}>trocar setor</button>}</div>
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
                    <div key={m.id} className={"chat-bolha " + (m.de_setor === parAberto.a ? "dele" : "minha") + (ehFigurinha(m.imagem_key) ? " fig" : "")}>
                      <div className="chat-autor">{avMsg(m.autor)}{m.autor || "—"} · {nomeSetor(m.de_setor)}</div>
                      {m.imagem_key ? <img className={ehFigurinha(m.imagem_key) ? "chat-sticker" : "chat-img"} src={`/api/chat/foto/${m.imagem_key}`} alt="" loading="lazy" onClick={() => window.open(`/api/chat/foto/${m.imagem_key}`, "_blank")} /> : null}
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
                  <div key={m.id} className={"chat-bolha " + (m.de_setor === meu ? "minha" : "dele") + (ehFigurinha(m.imagem_key) ? " fig" : "")}>
                    {m.de_setor !== meu && m.autor ? <div className="chat-autor">{avMsg(m.autor)}{m.autor}</div> : null}
                    {m.imagem_key ? <img className={ehFigurinha(m.imagem_key) ? "chat-sticker" : "chat-img"} src={`/api/chat/foto/${m.imagem_key}`} alt="" loading="lazy" onClick={() => window.open(`/api/chat/foto/${m.imagem_key}`, "_blank")} /> : null}
                    {m.texto ? <div className="chat-txt">{m.texto}</div> : null}
                    <div className="chat-hora">{horaDe(m.criado_em)}</div>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>
              {abrirFig && (
                <div className="chat-figpanel">
                  <div className="chat-figpanel-top">
                    <b>😀 Figurinhas</b>
                    <label className="chat-fignova">{subindoFig ? "Subindo…" : "➕ Nova figurinha"}
                      <input type="file" accept="image/*" ref={figFileRef} style={{ display: "none" }} disabled={subindoFig}
                        onChange={(e) => { const f = e.target.files?.[0]; const el = e.currentTarget; subirFigurinha(f); if (el) el.value = ""; }} />
                    </label>
                  </div>
                  <div className="chat-figgrid">
                    {figurinhas.length === 0 && <div className="chat-vazio" style={{ gridColumn: "1 / -1" }}>Nenhuma figurinha ainda. Toque em “➕ Nova figurinha”.</div>}
                    {figurinhas.map((f) => (
                      <button key={f.id} className="chat-figitem" onClick={() => enviarFigurinha(f.imagem_key)} title="Enviar figurinha">
                        <img src={`/api/chat/foto/${f.imagem_key}`} alt="figurinha" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="chat-input">
                <button className={"chat-foto" + (abrirFig ? " on" : "")} onClick={() => { const abrir = !abrirFig; setAbrirFig(abrir); if (abrir) carregarFigurinhas(); }} title="Figurinhas">😀</button>
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
