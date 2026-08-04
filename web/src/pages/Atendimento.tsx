import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Link } from "react-router-dom";
import { api, type AtendBoard, type AtendConversa, type AtendConversaDetalhe, type ZapiConfig, type Representante, type FunilCardDetalhe, type ChatMensagem, type AtendColuna } from "../api";
import { getUser, pode } from "../auth";

// Etapas do funil (venda) mostradas dentro da conversa.
const ETAPAS_FUNIL: { id: string; label: string }[] = [
  { id: "novo-lead", label: "Novo lead" }, { id: "primeiro-contato", label: "Primeiro contato" },
  { id: "negociacao", label: "Negociação" }, { id: "aguardando-retorno", label: "Aguardando retorno" },
  { id: "pos-venda", label: "Pós-venda" }, { id: "ativo", label: "Cliente ativo" },
  { id: "inativo", label: "Inativo" }, { id: "perdido", label: "Perdido" },
];
const etapaLabel = (e?: string | null) => ETAPAS_FUNIL.find((x) => x.id === e)?.label || e || "";

// Gestor do atendimento: admin ou quem tem a permissão de gestor. Só ele vê config/relatórios.
function ehGestorAtend() { const u = getUser(); return !!u && (u.admin || pode(u, "atendimento-gestor")); }

// Renderiza o texto da mensagem como no WhatsApp: URLs viram links clicáveis e
// *texto* vira negrito. As quebras de linha já são preservadas pelo CSS (pre-wrap).
function formatarMsg(texto: string | null | undefined) {
  return String(texto ?? "").split(/(https?:\/\/[^\s]+)/g).map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      return <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{p}</a>;
    }
    return p.split(/(\*[^*\n]+\*)/g).map((s, j) =>
      /^\*[^*\n]+\*$/.test(s) ? <b key={i + "-" + j}>{s.slice(1, -1)}</b> : <span key={i + "-" + j}>{s}</span>
    );
  });
}

// Separa a fala do cliente da NOTA INTERNA da visão ("[O cliente enviou uma foto...]").
const MSG_PLACEHOLDER = /^(📷 \(foto\)|🎤 \(áudio\))$/;
function extrairIaNota(texto: string | null | undefined): { visivel: string; iaNota: string } {
  const t = String(texto ?? "");
  const m = t.match(/\[O cliente enviou uma foto[^\]]*?O que aparece nela:\s*([\s\S]*?)\]\s*$/i);
  if (!m) return { visivel: t, iaNota: "" };
  return { visivel: t.slice(0, m.index).trim(), iaNota: (m[1] || "").trim() };
}
// Corpo da mensagem já com a legenda visível + a nota da IA como notinha discreta.
function corpoMsg(texto: string | null | undefined) {
  const { visivel, iaNota } = extrairIaNota(texto);
  const vis = MSG_PLACEHOLDER.test(visivel.trim()) ? "" : visivel;
  return <>{vis && <span>{formatarMsg(vis)}</span>}{iaNota && <div className="at-ianota">🔎 IA viu: {iaNota}</div>}</>;
}

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
  // criado_em vem em UTC ("YYYY-MM-DD HH:MM:SS"); mostra no horário de Brasília.
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  }
  const mm = iso.match(/(\d{2}):(\d{2})/);
  return mm ? `${mm[1]}:${mm[2]}` : "";
}
const SETOR_EMOJI: Record<string, string> = { vendas: "🛒", financeiro: "💰", "pos-venda": "📦", outros: "💬" };

// ── Página do robô de atendimento ────────────────────────────────────────────────
export function Atendimento() {
  const [board, setBoard] = useState<AtendBoard | null>(null);
  const [abrir, setAbrir] = useState<string | null>(null);
  const [sim, setSim] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [novaConv, setNovaConv] = useState(false);
  const [equipeOpen, setEquipeOpen] = useState(false);
  const [campanhaOpen, setCampanhaOpen] = useState(false);
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [filtroAtend, setFiltroAtend] = useState<string>("todos"); // gestor: filtra por vendedor
  const [membros, setMembros] = useState<string[]>([]); // equipe (chat interno)
  const [chatCom, setChatCom] = useState<string | null>(null); // membro com quem estou conversando
  const [dmResumo, setDmResumo] = useState<{ outro: string; ultima_em: string; ultimo_autor: string; nao_lido: boolean }[]>([]);
  const eu = getUser()?.nome || "";
  const canalDM = (o: string) => "dm:" + [eu, o].sort().join("|");
  useEffect(() => { api.contatosChat().then(setMembros).catch(() => {}); }, []);
  useEffect(() => {
    if (!eu) return;
    const carregar = () => api.dmResumoChat(eu).then(setDmResumo).catch(() => {});
    carregar(); const t = setInterval(carregar, 8000); return () => clearInterval(t);
  }, [eu]);
  // "Lido" é controlado no SERVIDOR (chat_lido), então a bolinha fica igual em qualquer aparelho.
  const temNovoDe = (o: string) => !!dmResumo.find((x) => x.outro === o)?.nao_lido;
  async function abrirChatEquipe(o: string) {
    setChatCom(o);
    setDmResumo((ds) => ds.map((x) => (x.outro === o ? { ...x, nao_lido: false } : x))); // limpa na hora
    try { await api.marcarLidoChat(eu, canalDM(o)); } catch { /* ignora */ }
  }
  // Enquanto o chat está aberto, vai marcando como lido no servidor.
  useEffect(() => {
    if (!chatCom || !eu) return;
    const marcar = () => api.marcarLidoChat(eu, canalDM(chatCom)).catch(() => {});
    marcar(); const t = setInterval(marcar, 4000); return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatCom, eu]);

  // ── Arrastar card entre colunas (pointer + listeners no window = confiável) ──
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; active: boolean; touch: boolean; timer: number | null; move?: (e: PointerEvent) => void; up?: (e: PointerEvent) => void } | null>(null);
  const arrastou = useRef(false);
  const [gerColunas, setGerColunas] = useState(false);
  function colunaEmPonto(x: number, y: number): string | null {
    for (const el of document.elementsFromPoint(x, y)) { const d = (el as HTMLElement).dataset?.coluna; if (d) return d; }
    return null;
  }
  function finalizarDrag() {
    const d = dragRef.current;
    if (d) {
      if (d.timer) clearTimeout(d.timer);
      if (d.move) window.removeEventListener("pointermove", d.move);
      if (d.up) { window.removeEventListener("pointerup", d.up); window.removeEventListener("pointercancel", d.up); }
    }
    dragRef.current = null;
    setArrastando(null); setSobre(null);
  }
  function dragDownC(e: RPointerEvent, id: string) {
    if (e.button && e.button !== 0) return;
    const move = (ev: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      if (!d.active) {
        const dx = Math.abs(ev.clientX - d.startX), dy = Math.abs(ev.clientY - d.startY);
        if (d.touch) { if (dx > 10 || dy > 10) finalizarDrag(); }              // moveu antes de segurar = rolagem
        else if (dx > 4 || dy > 4) { d.active = true; setArrastando(d.id); }    // mouse: arrasta assim que sai do lugar
        return;
      }
      ev.preventDefault();
      setSobre(colunaEmPonto(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const active = d.active;
      const alvo = active ? colunaEmPonto(ev.clientX, ev.clientY) : null;
      finalizarDrag();
      if (active) { arrastou.current = true; if (alvo) soltarConversa(alvo, id); }
    };
    const d = { id, startX: e.clientX, startY: e.clientY, active: false, touch: e.pointerType === "touch", timer: null as number | null, move, up };
    dragRef.current = d;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    if (d.touch) d.timer = window.setTimeout(() => { if (dragRef.current === d) { d.active = true; setArrastando(d.id); } }, 240);
  }
  async function soltarConversa(coluna: string, id: string) {
    const c = board?.conversas.find((x) => x.id === id);
    if (!c || c.coluna === coluna) return;
    setBoard((b) => (b ? { ...b, conversas: b.conversas.map((x) => (x.id === id ? { ...x, coluna, coluna_manual: coluna } : x)) } : b));
    try { await api.atendMoverColuna(id, coluna); recarregar(); } catch { recarregar(); }
  }
  // Card "aguardando": cliente escreveu depois da nossa última resposta (ou nunca respondemos)
  // E o atendimento não foi encerrado depois disso. Encerrar para de piscar sem mandar nada.
  // Pisca verde SÓ enquanto o cliente está esperando: a última mensagem é DELE (entrada mais
  // recente que a nossa saída) e a conversa não foi encerrada depois. Se a última mensagem for
  // NOSSA (já respondemos), para de piscar.
  const aguardando = (c: AtendConversa) => !!c.ultima_in_em && (c.ultima_in_em || "") > (c.ultima_out_em || "") && (c.ultima_in_em || "") > (c.encerrado_em || "");
  const pulsaVerde = (c: AtendConversa) => !c.silenciado && aguardando(c);

  // Fotos de perfil dos cards (busca só os primeiros e guarda em cache pra não pesar).
  const fotoCache = useRef<Record<string, string | null>>({});
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({}); // p/ pular pra coluna no mobile
  const [, setFotosV] = useState(0);
  useEffect(() => {
    if (!board) return;
    const ids = board.conversas.slice(0, 30).map((c) => c.id).filter((cid) => !(cid in fotoCache.current));
    if (!ids.length) return;
    let cancel = false;
    (async () => {
      for (const cid of ids) {
        if (cancel) break;
        fotoCache.current[cid] = null; // marca (evita buscar de novo)
        try { const r = await api.atendFotoPerfil(cid); if (!cancel && r.link) { fotoCache.current[cid] = r.link; setFotosV((v) => v + 1); } } catch { /* ignora */ }
      }
    })();
    return () => { cancel = true; };
  }, [board]);

  const [alerta, setAlerta] = useState<AtendConversa | null>(null); // banner de backup na tela
  const [toastMsg, setToastMsg] = useState<AtendConversa | null>(null); // aviso de mensagem nova
  const toastTimer = useRef<number | null>(null);
  const alertadosRef = useRef<Set<string>>(new Set());
  const primeiraRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  // Som ao chegar mensagem nova do cliente (não só quando pede humano).
  const ultimoInRef = useRef<string>("");
  const primeiraInRef = useRef(true);
  const [mudo, setMudo] = useState(() => localStorage.getItem("atend-mudo") === "1");
  const mudoRef = useRef(mudo);
  useEffect(() => { mudoRef.current = mudo; }, [mudo]);

  function recarregar() { const u = getUser(); api.atendBoard(u?.nome, ehGestorAtend()).then(setBoard).catch(() => {}); }
  // Marca/desmarca o lembrete de um card (deixa pulsando pra não esquecer de falar com o lead).
  async function toggleLembrete(id: string) {
    setBoard((b) => (b ? { ...b, conversas: b.conversas.map((c) => (c.id === id ? { ...c, lembrete: c.lembrete ? 0 : 1 } : c)) } : b));
    try { await api.atendLembrete(id); } catch { recarregar(); }
  }
  function checarConexao() { api.atendConfig().then((c) => setConectado(c.zapi_ativo && !!c.zapi_instance && !!c.zapi_token)).catch(() => setConectado(false)); }
  useEffect(() => { recarregar(); checarConexao(); const t = setInterval(recarregar, 8000); return () => clearInterval(t); }, []);

  // Libera o áudio no primeiro clique (política de autoplay) e pede permissão de notificação.
  useEffect(() => {
    const liberar = () => {
      if (!audioRef.current) { try { audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* sem áudio */ } }
      audioRef.current?.resume?.();
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      window.removeEventListener("pointerdown", liberar);
    };
    window.addEventListener("pointerdown", liberar);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    return () => window.removeEventListener("pointerdown", liberar);
  }, []);

  // Som IRRITANTE (bipes agudos alternados) gerado na hora, sem depender de arquivo.
  function tocarAlerta() {
    const ctx = audioRef.current;
    if (!ctx) return;
    try { ctx.resume?.(); } catch { /* ignore */ }
    const t0 = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square";
      o.frequency.value = i % 2 ? 1320 : 880;
      const ini = t0 + i * 0.17;
      g.gain.setValueAtTime(0.0001, ini);
      g.gain.exponentialRampToValueAtTime(0.3, ini + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ini); o.stop(ini + 0.16);
    }
  }

  // "Pop" de notificação parecido com o do WhatsApp Web: duas notas curtas
  // (aguda → um tom abaixo), senoidais, com ataque rápido e decaimento suave.
  // (O som exato do WhatsApp é proprietário; este é uma imitação sintetizada.)
  function tocarDing() {
    const ctx = audioRef.current;
    if (!ctx) return;
    try { ctx.resume?.(); } catch { /* ignore */ }
    const t0 = ctx.currentTime;
    const notas = [{ f: 1318, t: 0 }, { f: 988, t: 0.085 }]; // Mi6 → Si5
    for (const n of notas) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = n.f;
      const ini = t0 + n.t;
      g.gain.setValueAtTime(0.0001, ini);
      g.gain.exponentialRampToValueAtTime(0.34, ini + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.19);
      o.connect(g).connect(ctx.destination);
      o.start(ini); o.stop(ini + 0.2);
    }
  }

  // Toca o ding + mostra um AVISO GRANDE quando chega mensagem nova de QUALQUER cliente.
  useEffect(() => {
    if (!board) return;
    let maxIn = "";
    for (const c of board.conversas) { if (c.silenciado) continue; const t = c.ultima_in_em || ""; if (t > maxIn) maxIn = t; }
    if (primeiraInRef.current) { ultimoInRef.current = maxIn; primeiraInRef.current = false; return; }
    if (maxIn && maxIn > ultimoInRef.current) {
      ultimoInRef.current = maxIn;
      if (!mudoRef.current) tocarDing();
      const nova = board.conversas.find((c) => (c.ultima_in_em || "") === maxIn);
      if (nova) { setToastMsg(nova); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToastMsg(null), 9000); }
    }
  }, [board]);

  // Contador de conversas ESPERANDO resposta → no título da aba do navegador (bem visível).
  useEffect(() => {
    const n = board ? board.conversas.filter((c) => pulsaVerde(c)).length : 0;
    document.title = n > 0 ? `(${n}) 💬 Atendimento` : "Atendimento";
    return () => { document.title = "Atendimento"; };
  }, [board]);

  function dispararAlerta(c: AtendConversa) {
    const quem = c.nome || c.contato_nome || telBonito(c.telefone);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification("🔔 Atendimento humano!", { body: `${quem} precisa de um atendente.`, tag: "atend-" + c.id, requireInteraction: true });
        n.onclick = () => { window.focus(); setAbrir(c.id); setAlerta(null); n.close(); };
      } catch { /* alguns navegadores exigem service worker; o som + banner cobrem */ }
    }
    setAlerta(c);
    tocarAlerta();
  }

  // A cada atualização do quadro, detecta conversas NOVAS que precisam de humano (sem responsável).
  useEffect(() => {
    if (!board) return;
    const pend = board.conversas.filter((c) => c.estado === "atendimento-humano" && !c.responsavel);
    if (primeiraRef.current) { pend.forEach((c) => alertadosRef.current.add(c.id)); primeiraRef.current = false; return; }
    for (const c of pend) {
      if (!alertadosRef.current.has(c.id)) { alertadosRef.current.add(c.id); dispararAlerta(c); }
    }
    const ids = new Set(pend.map((c) => c.id));
    for (const id of Array.from(alertadosRef.current)) if (!ids.has(id)) alertadosRef.current.delete(id);
  }, [board]);

  return (
    <div className="quadro-page" style={{ maxWidth: "none" }}>
      {alerta && (
        <div onClick={() => { setAbrir(alerta.id); setAlerta(null); }} style={{ position: "fixed", top: 16, right: 16, zIndex: 200, background: "#dc2626", color: "#fff", borderRadius: 12, padding: "12px 16px", boxShadow: "0 10px 30px #0006", cursor: "pointer", maxWidth: 320, animation: "atpulse 1s ease-in-out infinite" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>🔔 Atendimento humano!</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{alerta.nome || alerta.contato_nome || telBonito(alerta.telefone)} precisa de um atendente.</div>
          <div style={{ fontSize: 11.5, marginTop: 4, opacity: .9 }}>Clique para abrir · <span onClick={(e) => { e.stopPropagation(); setAlerta(null); }} style={{ textDecoration: "underline" }}>dispensar</span></div>
        </div>
      )}
      {/* AVISO GRANDE de mensagem nova (bem mais evidente que o pontinho) — some sozinho. */}
      {toastMsg && (
        <div onClick={() => { setAbrir(toastMsg.id); setToastMsg(null); }}
          style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 210, background: "#16a34a", color: "#fff", borderRadius: 14, padding: "13px 20px", boxShadow: "0 12px 34px #0007", cursor: "pointer", maxWidth: "92vw", display: "flex", alignItems: "center", gap: 12, animation: "atToastIn .25s ease-out" }}>
          {(() => {
            const f = fotoCache.current[toastMsg.id]; const nm = toastMsg.nome || toastMsg.contato_nome || telBonito(toastMsg.telefone);
            return (
              <div style={{ position: "relative", flex: "0 0 auto" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: f ? `center/cover no-repeat url(${f})` : "rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#fff", border: "2px solid #ffffff55" }}>{f ? "" : iniciais(nm)}</div>
                <span style={{ position: "absolute", right: -3, bottom: -3, background: "#fff", borderRadius: "50%", fontSize: 13, lineHeight: 1, padding: "2px 3px", boxShadow: "0 1px 3px #0005" }}>💬</span>
              </div>
            );
          })()}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Mensagem nova — {toastMsg.nome || toastMsg.contato_nome || telBonito(toastMsg.telefone)}</div>
            <div style={{ fontSize: 12.5, marginTop: 1, opacity: .95, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{(() => { const p = extrairIaNota(toastMsg.ultima_msg || ""); return p.visivel || "toque para abrir"; })()}</div>
          </div>
          <span onClick={(e) => { e.stopPropagation(); setToastMsg(null); }} style={{ marginLeft: 6, fontSize: 18, opacity: .85, padding: "0 4px" }}>✕</span>
        </div>
      )}
      <div className="page-head">
        <div><h1>Atendimento</h1><div className="breadcrumb">Comercial › Atendimento (robô do WhatsApp)</div></div>
        <div className="row-gap at-actions" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="at-status">{conectado == null ? "…" : conectado ? "🟢 WhatsApp conectado (Z-API)" : "🟡 Z-API desligada (simulação)"}</span>
          <button className="btn btn-soft" onClick={() => setMudo((m) => { const n = !m; localStorage.setItem("atend-mudo", n ? "1" : "0"); return n; })} title={mudo ? "Som desligado — clique para ligar" : "Toca um som quando chega mensagem nova"}>{mudo ? "🔕 Som off" : "🔔 Som on"}</button>
          <button className="btn btn-primary" onClick={() => setNovaConv(true)}>➕ Nova conversa</button>
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setEquipeOpen(true)}>👥 Equipe</button>}
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setCampanhaOpen(true)}>📣 Campanha</button>}
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setCfgOpen(true)}>⚙️ Conexão</button>}
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setSim(true)}>💬 Simular cliente</button>}
        </div>
      </div>

      {/* Gestor: acompanha cada vendedor — filtra o quadro por quem está atendendo. */}
      {board && ehGestorAtend() && (() => {
        const atendentes = [...new Set(board.conversas.map((c) => c.responsavel).filter(Boolean) as string[])].sort();
        if (atendentes.length === 0) return null;
        return (
          <div className="fx-filtros" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>👀 Acompanhar:</span>
            <span className={"fx-pill" + (filtroAtend === "todos" ? " on" : "")} onClick={() => setFiltroAtend("todos")}>Todos</span>
            {atendentes.map((a) => (
              <span key={a} className={"fx-pill" + (filtroAtend === a ? " on" : "")} onClick={() => setFiltroAtend(a)}>{a}</span>
            ))}
            <span className={"fx-pill" + (filtroAtend === "__robo" ? " on" : "")} onClick={() => setFiltroAtend("__robo")}>🤖 Só robô</span>
          </div>
        );
      })()}

      {!board ? (
        <div className="card pad muted">Carregando…</div>
      ) : (
        <>
        {/* Atalho de colunas (só no celular): toque num chip pra pular direto pra coluna. */}
        <div className="fx-colnav">
          {board.colunas.map((col) => {
            const n = board.conversas.filter((c) => c.coluna === col.id).filter((c) =>
              filtroAtend === "todos" ? true : filtroAtend === "__robo" ? !c.responsavel : c.responsavel === filtroAtend
            ).length;
            return (
              <button key={col.id} className="fx-colnav-chip" onClick={() => colRefs.current[col.id]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}>
                <span className="fx-dot" style={{ background: col.cor }} />{col.label}{n > 0 && <b>{n}</b>}
              </button>
            );
          })}
        </div>
        <div className="fx-board at-board">
          {board.colunas.map((col) => {
            const cs = board.conversas.filter((c) => c.coluna === col.id).filter((c) =>
              filtroAtend === "todos" ? true : filtroAtend === "__robo" ? !c.responsavel : c.responsavel === filtroAtend
            ).sort((a, b) =>
              (Number(aguardando(b)) - Number(aguardando(a))) ||
              (b.ultima_in_em || "").localeCompare(a.ultima_in_em || "") ||
              (b.atualizado_em || "").localeCompare(a.atualizado_em || "")
            );
            return (
              <div className={"fx-col" + (sobre === col.id ? " drag-over" : "")} key={col.id} data-coluna={col.id} ref={(el) => { colRefs.current[col.id] = el; }}>
                <div className="fx-hd"><span className="fx-dot" style={{ background: col.cor }} />{col.label}<span className="ct">{cs.length}</span></div>
                <div className="fx-col-body">
                  {cs.map((c) => (
                    <ConvMini key={c.id} c={c} foto={fotoCache.current[c.id] || undefined} colunas={board.colunas} onMover={(colId) => soltarConversa(colId, c.id)} pulsando={pulsaVerde(c)} arrastando={arrastando === c.id}
                      onAbrir={() => { if (arrastou.current) { arrastou.current = false; return; } setAbrir(c.id); }}
                      onLembrete={() => toggleLembrete(c.id)}
                      onPointerDown={(e) => dragDownC(e, c.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
      {ehGestorAtend() && board && <div style={{ marginTop: 10 }}><button className="btn btn-soft" onClick={() => setGerColunas(true)}>➕ Criar / organizar colunas</button></div>}
      {gerColunas && <ColunasModal onFechar={() => setGerColunas(false)} onSalvo={() => { setGerColunas(false); recarregar(); }} />}

      {sim && <Simulador onFechar={() => setSim(false)} onMudou={recarregar} />}
      {novaConv && <NovaConversa onFechar={() => setNovaConv(false)} onAbrir={(cid) => { setNovaConv(false); setAbrir(cid); }} onMudou={recarregar} />}
      {equipeOpen && <EquipeModal onFechar={() => setEquipeOpen(false)} />}
      {campanhaOpen && <CampanhaModal onFechar={() => setCampanhaOpen(false)} />}
      {chatCom && <ChatEquipeModal outro={chatCom} onFechar={() => setChatCom(null)} />}
      {abrir && <ConversaModal id={abrir} onFechar={() => setAbrir(null)} onMudou={recarregar} />}
      {cfgOpen && <ConfigZapi onFechar={() => setCfgOpen(false)} onMudou={checarConexao} />}
    </div>
  );
}

// ── Configuração da conexão Z-API (WhatsApp não-oficial) ─────────────────────────
function ConfigZapi({ onFechar, onMudou }: { onFechar: () => void; onMudou: () => void }) {
  const [cfg, setCfg] = useState<ZapiConfig | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [telTeste, setTelTeste] = useState("");
  const [iaTeste, setIaTeste] = useState<string>("");
  const [iaTestando, setIaTestando] = useState(false);

  useEffect(() => { api.atendConfig().then(setCfg).catch(() => setMsg("Não consegui carregar a configuração.")); }, []);
  const set = (k: keyof ZapiConfig, v: string | boolean) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  async function salvar() {
    if (!cfg) return;
    setSalvando(true); setMsg("");
    try {
      await api.atendSalvarConfig({ zapi_base: cfg.zapi_base, zapi_instance: cfg.zapi_instance, zapi_token: cfg.zapi_token, zapi_client_token: cfg.zapi_client_token, zapi_ativo: cfg.zapi_ativo, atendimento_ativo: cfg.atendimento_ativo, atendimento_ia: cfg.atendimento_ia, ia_prompt: cfg.ia_prompt, catalogo_url: cfg.catalogo_url, catalogo_senha: cfg.catalogo_senha, catalogo_msg: cfg.catalogo_msg, followup_ativo: cfg.followup_ativo, followup_hora_ini: cfg.followup_hora_ini, followup_hora_fim: cfg.followup_hora_fim, followup_domingo: cfg.followup_domingo, followup_ia: cfg.followup_ia, pos_venda_ativo: cfg.pos_venda_ativo, pos_venda_dias: cfg.pos_venda_dias, recompra_ativo: cfg.recompra_ativo, recompra_dias: cfg.recompra_dias, reativacao_ativo: cfg.reativacao_ativo, reativacao_dias: cfg.reativacao_dias, reativacao_limite: cfg.reativacao_limite, reativacao_intervalo_seg: cfg.reativacao_intervalo_seg, reativacao_msg: cfg.reativacao_msg, catalogo_evento_token: cfg.catalogo_evento_token, catalogo_log_url: cfg.catalogo_log_url });
      setMsg("✓ Salvo!"); onMudou(); setTimeout(() => setMsg(""), 2500);
    } catch { setMsg("Erro ao salvar."); } finally { setSalvando(false); }
  }
  async function testar() {
    const tel = telTeste.replace(/\D/g, "");
    if (!tel) { setMsg("Digite um número (com DDD) pra testar."); return; }
    setMsg("Enviando teste…");
    try {
      const r = await api.atendTestarZapi(tel);
      setMsg(r.enviado ? "✓ Enviado! Veja o WhatsApp do número de teste." : `Falhou: ${r.motivo || "erro"}. Salvou as credenciais e ligou a conexão?`);
    } catch { setMsg("Erro ao testar."); }
  }

  async function testarIa() {
    setIaTestando(true); setIaTeste("");
    try {
      const r = await api.atendTestarIa();
      const ok = r.tentativas.find((t) => t.ok);
      if (r.erro) setIaTeste(`❌ ${r.erro}`);
      else if (ok) setIaTeste(`✅ IA funcionando! Modelo: ${ok.modelo}\nResposta de teste: "${ok.resposta}"` + (r.ia_ligada ? "" : "\n\n⚠️ Mas a IA está DESLIGADA — ligue e Salve acima."));
      else { const err = r.tentativas.map((t) => `• ${t.modelo}: ${t.erro || "sem resposta"}`).join("\n"); setIaTeste(`❌ Nenhum modelo respondeu:\n${err}`); }
    } catch { setIaTeste("❌ Erro ao chamar o teste (deploy subiu? versão nova?)."); }
    finally { setIaTestando(false); }
  }

  const [sincroCat, setSincroCat] = useState(false);
  async function sincronizarCatalogo() {
    setSincroCat(true); setMsg("");
    try { const r = await api.atendSincronizarCatalogo(); setMsg(r.logErro ? `⚠️ Não li a atividade: ${r.logErro}. URL: ${r.logUrl || "(vazia)"}` : `✓ ${r.novos} novo(s) · ${r.backfill || 0} card(s) no funil · log tem ${r.logTotal} evento(s) · ${r.catalogoConversas ?? "?"} conversa(s) de catálogo (últ. ts ${r.ultimoTs || "0"}).`); }
    catch { setMsg("Não consegui ler a atividade — confira a URL de leitura."); }
    finally { setSincroCat(false); }
  }
  const copiar = (t: string) => navigator.clipboard?.writeText(t).then(() => { setMsg("Copiado!"); setTimeout(() => setMsg(""), 2000); });

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560, width: "min(560px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>⚙️ Conexão do WhatsApp (Z-API)</h2>
        {!cfg ? <p className="muted">Carregando…</p> : (
          <>
            {/* Interruptor mestre — liga/desliga o robô com clientes reais */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 14, borderRadius: 10, border: "2px solid " + (cfg.atendimento_ativo ? "#22c55e" : "#f59e0b"), background: cfg.atendimento_ativo ? "#f0fdf4" : "#fffbeb", color: "#1e293b" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{cfg.atendimento_ativo ? "🟢 Atendimento automático LIGADO" : "🟡 Atendimento automático DESLIGADO"}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{cfg.atendimento_ativo ? "O robô responde clientes reais no WhatsApp." : "Modo teste: o robô NÃO responde clientes reais. Use o Simulador."}</div>
              </div>
              <button type="button" className={"btn " + (cfg.atendimento_ativo ? "btn-soft" : "btn-primary")} onClick={() => set("atendimento_ativo", !cfg.atendimento_ativo)}>
                {cfg.atendimento_ativo ? "Desligar" : "Ligar"}
              </button>
            </div>
            {/* IA de triagem — atende conversando antes de pedir o CNPJ */}
            <div style={{ padding: "12px 14px", marginBottom: 14, borderRadius: 10, border: "2px solid " + (cfg.atendimento_ia ? "#8b5cf6" : "#e2e8f0"), background: cfg.atendimento_ia ? "#faf5ff" : "#f8fafc", color: "#1e293b" }}>
             <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{cfg.atendimento_ia ? "🧠 Atendente com IA LIGADA" : "🧠 Atendente com IA desligada"}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{cfg.atendimento_ia ? "A IA conversa com o lead, entende o que ele quer e só depois pede loja/CNPJ. Consumidor final é direcionado a lojas parceiras." : "Sem IA: o robô usa o menu fixo (1 Vendas, 2 Financeiro…)."}</div>
              </div>
              <button type="button" className={"btn " + (cfg.atendimento_ia ? "btn-soft" : "btn-primary")} onClick={() => set("atendimento_ia", !cfg.atendimento_ia)}>
                {cfg.atendimento_ia ? "Desligar" : "Ligar"}
              </button>
             </div>
             <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
               <button type="button" className="btn btn-soft" disabled={iaTestando} onClick={testarIa}>{iaTestando ? "Testando…" : "🧪 Testar IA agora"}</button>
               <span style={{ fontSize: 12, color: "#64748b" }}>Vê na hora se a IA responde (não precisa do simulador).</span>
             </div>
             {iaTeste && <pre style={{ marginTop: 10, marginBottom: 0, whiteSpace: "pre-wrap", fontSize: 12.5, background: "#0f172a", color: "#e2e8f0", padding: "10px 12px", borderRadius: 8, fontFamily: "inherit", lineHeight: 1.5 }}>{iaTeste}</pre>}
             {cfg.atendimento_ia && (
               <div style={{ marginTop: 12 }}>
                 <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 3 }}>📝 Ajustes na conversa da Big (opcional)</div>
                 <textarea value={cfg.ia_prompt} onChange={(e) => set("ia_prompt", e.target.value)} rows={5}
                   placeholder={"Escreva do seu jeito o que a Big deve (ou não deve) fazer. Ex.:\n• Não fale de modelos/cores com consumidor final, só indique a loja parceira.\n• Seja mais objetiva, no máximo 2 linhas.\n• Sempre pergunte a quantidade que o lojista precisa."}
                   style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.45 }} />
                 <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3 }}>
                   Em branco = a Big usa as regras padrão da Big Tricot. O que você escrever aqui é <b>somado</b> às regras (não substitui) — então ela nunca "quebra".
                 </div>
                 <details style={{ marginTop: 6 }}>
                   <summary style={{ cursor: "pointer", fontSize: 11.5, color: "#8b5cf6" }}>ver as regras padrão da Big (referência)</summary>
                   <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#475569", background: "#f1f5f9", padding: "8px 10px", borderRadius: 6, marginTop: 4, maxHeight: 180, overflow: "auto", fontFamily: "inherit" }}>{cfg.ia_prompt_padrao}</pre>
                 </details>
               </div>
             )}
            </div>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 14, color: "#92400e" }}>
              API não-oficial: use um <b>chip dedicado</b> (não seu número pessoal). Há risco de bloqueio pelo WhatsApp se disparar em massa.
            </div>

            <label className="campo"><span className="campo-label">Instância (Instance ID)</span>
              <input value={cfg.zapi_instance} onChange={(e) => set("zapi_instance", e.target.value)} placeholder="cole aqui o ID da instância Z-API" /></label>
            <label className="campo"><span className="campo-label">Token da instância</span>
              <input value={cfg.zapi_token} onChange={(e) => set("zapi_token", e.target.value)} placeholder="cole o token da instância" /></label>
            <label className="campo"><span className="campo-label">Client-Token (segurança da conta)</span>
              <input value={cfg.zapi_client_token} onChange={(e) => set("zapi_client_token", e.target.value)} placeholder="Account Security Token (menu Segurança do painel)" /></label>
            <label className="campo"><span className="campo-label">URL base (deixe o padrão)</span>
              <input value={cfg.zapi_base} onChange={(e) => set("zapi_base", e.target.value)} placeholder="https://api.z-api.io" /></label>
            <label className="campo"><span className="campo-label">📒 Link do catálogo (enviado ao lojista)</span>
              <input value={cfg.catalogo_url} onChange={(e) => set("catalogo_url", e.target.value)} placeholder="cole o link público do catálogo" /></label>
            <label className="campo"><span className="campo-label">🔑 Senha do catálogo (única p/ lojistas)</span>
              <input value={cfg.catalogo_senha} onChange={(e) => set("catalogo_senha", e.target.value)} placeholder="deixe em branco se o catálogo não tem senha" /></label>
            <label className="campo"><span className="campo-label">💬 Mensagem do catálogo (cola a sua — opcional)</span>
              <textarea value={cfg.catalogo_msg} onChange={(e) => set("catalogo_msg", e.target.value)} rows={7} placeholder="Cole aqui a mensagem completa que você já manda (com o link e a senha). Se preencher, o robô envia ela igualzinha. Se deixar em branco, ele monta com o link + senha acima." style={{ resize: "vertical", fontFamily: "inherit" }} /></label>

            <label className="row-gap" style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 14px", cursor: "pointer" }}>
              <input type="checkbox" checked={cfg.zapi_ativo} onChange={(e) => set("zapi_ativo", e.target.checked)} style={{ width: 18, height: 18 }} />
              <span><b>Ligar envio real</b> pelo WhatsApp (desligado = só simulador)</span>
            </label>

            <div style={{ border: "1px solid var(--line,#e2e8f0)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>🕐 Horário de atendimento</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>das
                  <input type="number" min={0} max={23} value={cfg.atend_hora_ini} onChange={(e) => set("atend_hora_ini", e.target.value)} style={{ width: 54 }} />h</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>às
                  <input type="number" min={1} max={24} value={cfg.atend_hora_fim} onChange={(e) => set("atend_hora_fim", e.target.value)} style={{ width: 54 }} />h</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.atend_domingo} onChange={(e) => set("atend_domingo", e.target.checked)} /> atender aos domingos</label>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 7 }}>Fora desse horário, quando a conversa for pra um humano, a Big avisa o cliente sobre o horário de funcionamento.</div>
            </div>

            <div style={{ border: "1px solid var(--line,#e2e8f0)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>⏰ Mensagens automáticas (follow-up)</div>
              <label className="row-gap" style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={cfg.followup_ativo} onChange={(e) => set("followup_ativo", e.target.checked)} style={{ width: 17, height: 17 }} />
                <span>Ligar a cadência <b>24h → 3 dias → 7 dias → parar</b> (retomada de quem não respondeu)</span>
              </label>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
                <span>Horário comercial:</span>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>das
                  <input type="number" min={0} max={23} value={cfg.followup_hora_ini} onChange={(e) => set("followup_hora_ini", e.target.value)} style={{ width: 54 }} />h</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>às
                  <input type="number" min={1} max={24} value={cfg.followup_hora_fim} onChange={(e) => set("followup_hora_fim", e.target.value)} style={{ width: 54 }} />h</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.followup_domingo} onChange={(e) => set("followup_domingo", e.target.checked)} /> enviar aos domingos</label>
              </div>
              <label className="row-gap" style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={cfg.followup_ia} onChange={(e) => set("followup_ia", e.target.checked)} style={{ width: 17, height: 17 }} />
                <span>🤖 Gerar os textos por <b>IA</b> (mais naturais, variados) — desligado usa modelos prontos</span>
              </label>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 13, marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line,#e2e8f0)" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.pos_venda_ativo} onChange={(e) => set("pos_venda_ativo", e.target.checked)} /> 💛 Pós-venda após
                  <input type="number" min={1} max={90} value={cfg.pos_venda_dias} onChange={(e) => set("pos_venda_dias", e.target.value)} style={{ width: 52 }} /> dias do envio</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.recompra_ativo} onChange={(e) => set("recompra_ativo", e.target.checked)} /> 🔁 Recompra após
                  <input type="number" min={7} max={365} value={cfg.recompra_dias} onChange={(e) => set("recompra_dias", e.target.value)} style={{ width: 56 }} /> dias</label>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 7 }}>Nunca envia 2× no mesmo dia, fora do horário, na madrugada, ou para quem já respondeu.</div>
            </div>

            <div style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>🔔 Prospecção automática por catálogo (reativação)</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.reativacao_ativo} onChange={(e) => set("reativacao_ativo", e.target.checked)} /> Ativar — enviar após
                  <input type="number" min={1} max={365} value={cfg.reativacao_dias} onChange={(e) => set("reativacao_dias", e.target.value)} style={{ width: 52 }} /> dias do faturamento</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>máx.
                  <input type="number" min={1} max={500} value={cfg.reativacao_limite} onChange={(e) => set("reativacao_limite", e.target.value)} style={{ width: 56 }} /> por disparo</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>intervalo entre envios
                  <input type="number" min={5} max={300} value={cfg.reativacao_intervalo_seg} onChange={(e) => set("reativacao_intervalo_seg", e.target.value)} style={{ width: 56 }} /> seg</label>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>🛡️ Anti-banimento: NÃO manda em rajada — espaça cada envio pelo intervalo (aleatório, +0–30s) e para após ~8 min; o resto sai no próximo horário.</div>
              <label className="campo" style={{ margin: "8px 0 0" }}><span className="campo-label">Mensagem (use {"{nome}"} e {"{dias}"})</span>
                <textarea rows={3} value={cfg.reativacao_msg} onChange={(e) => set("reativacao_msg", e.target.value)} placeholder={cfg.reativacao_msg_padrao} /></label>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Manda o catálogo como “desculpa” pra reabrir conversa — só pra cliente com WhatsApp que ainda não falou com a gente. O link do catálogo é anexado sozinho e envia 1× por cliente. Vale pra cliente de representante ou não.</div>
            </div>

            <div style={{ border: "1px solid #ddd6fe", background: "#f5f3ff", color: "#1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>🔗 Catálogo — ler atividade</div>
              <div style={{ fontSize: 12.5, marginBottom: 6 }}>O CRM lê os acessos do catálogo daqui e cria os leads. Cole a <b>URL de leitura</b> (o GET <code>/log</code> com o código):</div>
              <label className="campo" style={{ margin: "0 0 8px" }}><span className="campo-label">URL de leitura da atividade (bt-atividade /log)</span>
                <input value={cfg.catalogo_log_url} onChange={(e) => set("catalogo_log_url", e.target.value)} placeholder="https://…/log?code=bigtricot2026" /></label>
              <button className="btn btn-soft" style={{ fontSize: 12.5 }} disabled={sincroCat} onClick={sincronizarCatalogo}>{sincroCat ? "Sincronizando…" : "🔄 Sincronizar agora"}</button>
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12, cursor: "pointer", color: "#6d28d9" }}>Alternativa: o catálogo empurrar (POST)</summary>
                <div style={{ fontSize: 12, marginTop: 6 }}>URL do webhook de eventos:</div>
                <div style={{ display: "flex", gap: 8, margin: "4px 0", alignItems: "center" }}>
                  <code style={{ flex: 1, background: "#fff", color: "#334155", padding: "6px 8px", borderRadius: 6, fontSize: 10.5, wordBreak: "break-all" }}>{cfg.catalogo_evento_url}</code>
                  <button className="btn btn-soft" style={{ padding: "5px 9px" }} onClick={() => copiar(cfg.catalogo_evento_url)}>Copiar</button>
                </div>
                <label className="campo" style={{ margin: 0 }}><span className="campo-label">Token (opcional)</span>
                  <input value={cfg.catalogo_evento_token} onChange={(e) => set("catalogo_evento_token", e.target.value)} placeholder="vazio = sem checagem" /></label>
              </details>
            </div>

            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", color: "#1e293b", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 14 }}>
              <b>📥 Para receber mensagens:</b> no painel Z-API, em <b>Ao receber (webhook)</b>, cole esta URL:
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                <code style={{ flex: 1, background: "#fff", color: "#334155", padding: "6px 8px", borderRadius: 6, fontSize: 11.5, wordBreak: "break-all" }}>{cfg.webhook_url}</code>
                <button className="btn btn-soft" style={{ padding: "6px 10px" }} onClick={() => copiar(cfg.webhook_url)}>Copiar</button>
              </div>
              <div style={{ marginTop: 8, fontSize: 12 }}><b>✓✓ Para os vistos (entregue/lido):</b> cole a <b>mesma URL acima</b> também no webhook <b>“Ao atualizar status da mensagem”</b> (ou “Status”) da Z-API. Sem isso os risquinhos não ficam azuis.</div>
            </div>

            <div className="row-gap" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input value={telTeste} onChange={(e) => setTelTeste(e.target.value)} placeholder="55DDDnúmero pra teste" style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={testar}>📨 Enviar teste</button>
            </div>

            <div className="row-gap" style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
              {msg && <span style={{ fontWeight: 700, fontSize: 13, color: msg.startsWith("✓") ? "#15803d" : msg.startsWith("Falhou") || msg.startsWith("Erro") ? "#b91c1c" : "#334155" }}>{msg}</span>}
              <button className="btn btn-soft" onClick={onFechar}>Fechar</button>
              <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "💾 Salvar"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Card de documento (PDF/doc) na conversa. A prévia do PDF só CARREGA quando o card entra na
// tela (conforme você rola) — assim uma conversa com muitos PDFs não carrega todos de uma vez.
function DocCard({ url, nome, pdf }: { url: string; nome: string; pdf: boolean }) {
  const [visivel, setVisivel] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!pdf) return;
    const el = ref.current; if (!el || typeof IntersectionObserver === "undefined") { setVisivel(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisivel(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [pdf]);
  return (
    <a ref={ref} href={url} target="_blank" rel="noreferrer" className="at-doc">
      {pdf && (visivel
        ? <embed src={url + "#toolbar=0&navpanes=0&view=FitH"} type="application/pdf" className="at-doc-prev" />
        : <div className="at-doc-prev at-doc-load">📄 prévia…</div>)}
      <div className="at-doc-hd"><span className="at-doc-ic">📄</span><div style={{ minWidth: 0 }}><div className="at-doc-nm">{nome}</div><div className="at-doc-sub">{pdf ? "PDF" : "Arquivo"} · toque para abrir</div></div></div>
    </a>
  );
}

function ConvMini({ c, foto, colunas, onMover, onAbrir, onLembrete, pulsando, arrastando, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { c: AtendConversa; foto?: string; colunas?: AtendColuna[]; onMover?: (colId: string) => void; onAbrir: () => void; onLembrete?: () => void; pulsando?: boolean; arrastando?: boolean; onPointerDown?: (e: RPointerEvent) => void; onPointerMove?: (e: RPointerEvent) => void; onPointerUp?: (e: RPointerEvent) => void; onPointerCancel?: (e: RPointerEvent) => void }) {
  const humano = c.estado === "atendimento-humano";
  const nome = c.nome || c.contato_nome || telBonito(c.telefone);
  const lembrete = !!c.lembrete;
  return (
    <div className={"fx-card" + (pulsando || lembrete ? " pulsando" : "") + (lembrete ? " lembrete" : "")} style={arrastando ? { opacity: 0.5 } : undefined}
      onClick={onAbrir} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="conv-av" style={foto ? { backgroundImage: `url(${foto})`, backgroundSize: "cover", backgroundPosition: "center", color: "transparent" } : undefined}>{foto ? "" : iniciais(nome)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="fx-nm">{nome}</div>
          <div className="fx-sub">{(c.nome || c.contato_nome) ? telBonito(c.telefone) : [c.cidade, c.uf].filter(Boolean).join("/") || "—"}</div>
        </div>
        {onLembrete && (
          <button onClick={(e) => { e.stopPropagation(); onLembrete(); }} onPointerDown={(e) => e.stopPropagation()}
            title={lembrete ? "Lembrete ativo — clique pra tirar (o card para de pulsar)" : "Lembrar de falar com esse lead (deixa o card pulsando)"}
            style={{ flex: "0 0 auto", background: lembrete ? "#facc15" : "transparent", border: "1px solid " + (lembrete ? "#eab308" : "var(--line)"), color: lembrete ? "#713f12" : "var(--muted)", borderRadius: 8, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "4px 6px" }}>🔔</button>
        )}
      </div>
      {c.ultima_msg && (() => { const p = extrairIaNota(c.ultima_msg); const t = MSG_PLACEHOLDER.test((p.visivel || "").trim()) ? "" : p.visivel; return <div className="at-prev">{t || (p.iaNota ? "📷 foto" : c.ultima_msg)}</div>; })()}
      <div className="fx-foot">
        {c.cliente_id && <span className="at-badge" style={{ background: "#dcfce7", color: "#15803d" }} title="Já é cliente cadastrado na base">📇 Cliente</span>}
        {c.autorizado === 0
          ? <span className="at-badge" style={{ background: "#fef3c7", color: "#92400e" }} title="Aguardando autorização da equipe">⏳ Autorizar</span>
          : <span className="at-badge">{humano ? `👤 ${c.responsavel || "humano"}` : `🤖 robô`}</span>}
        {c.funil_etapa && <span className="at-badge" style={{ background: "#ecfdf5", color: "#047857" }} title="Etapa no funil de vendas">🎯 {etapaLabel(c.funil_etapa)}</span>}
        {c.interessado === 1 && <span className="at-badge" style={{ background: "#fee2e2", color: "#b91c1c" }} title="Demonstrou interesse comercial">🔥 Interessado</span>}
        {c.representante && <span className="at-badge" style={{ background: "#eef2ff", color: "#4338ca" }} title={c.autorizado === 0 ? "Representante sugerido" : "Representante"}>🧑‍💼 {c.representante}</span>}
        {!!c.silenciado && <span className="at-badge" style={{ background: "#f1f5f9", color: "#475569" }} title="Silenciado — não pisca / sem som">🔕</span>}
        {c.setor && <span className="fx-sub">{SETOR_EMOJI[c.setor] || ""}</span>}
        <span className="fx-sub" style={{ marginLeft: "auto" }}>{hora(c.atualizado_em)}</span>
        {/* Mover pra outra coluna sem arrastar: clica e escolhe o nome da coluna */}
        {colunas && onMover && (
          <select className="fx-mover-sel" title="Mover para outra coluna" value=""
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => { if (e.target.value) onMover(e.target.value); e.currentTarget.value = ""; }}>
            <option value="">↔️</option>
            {colunas.filter((col) => col.id !== c.coluna).map((col) => <option key={col.id} value={col.id}>{col.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

// Codifica PCM (Float32) em WAV 16-bit mono. O WhatsApp NÃO toca áudio webm (formato padrão
// do navegador) — por isso a gravação sai em WAV, que a Z-API/WhatsApp aceitam em qualquer
// navegador (inclusive Chrome). Faz downsample p/ 16kHz (voz) pra o arquivo ficar leve.
function baixaAmostragem(buf: Float32Array, inRate: number, outRate: number): Float32Array {
  if (!outRate || outRate >= inRate) return buf;
  const ratio = inRate / outRate;
  const outLen = Math.floor(buf.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = buf[Math.floor(i * ratio)] || 0;
  return out;
}
function pcmParaWav(chunks: Float32Array[], inRate: number, outRate = 16000): ArrayBuffer {
  let len = 0; for (const c of chunks) len += c.length;
  const flat = new Float32Array(len); let off = 0;
  for (const c of chunks) { flat.set(c, off); off += c.length; }
  const rate = outRate && outRate < inRate ? outRate : inRate;
  const data = baixaAmostragem(flat, inRate, rate);
  const buffer = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buffer);
  const wstr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); view.setUint32(4, 36 + data.length * 2, true); wstr(8, "WAVE");
  wstr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wstr(36, "data"); view.setUint32(40, data.length * 2, true);
  let o = 44; for (let i = 0; i < data.length; i++) { const s = Math.max(-1, Math.min(1, data[i])); view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return buffer;
}

// ── Conversa (thread estilo WhatsApp + contexto + ações do atendente) ──────────────
export function ConversaModal({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const [d, setD] = useState<AtendConversaDetalhe | null>(null);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [reps, setReps] = useState<Representante[]>([]);
  const [repSel, setRepSel] = useState("");
  const [usuarios, setUsuarios] = useState<{ nome: string; usuario: string }[]>([]);
  const [respostas, setRespostas] = useState<{ titulo: string; texto: string }[]>([]);
  const [respEmpresa, setRespEmpresa] = useState<{ titulo: string; texto: string }[]>([]);
  const [mostrarResp, setMostrarResp] = useState(false);
  const [gerenciarResp, setGerenciarResp] = useState(false);
  const [editDados, setEditDados] = useState(false);
  const [formD, setFormD] = useState({ nome: "", setor: "", cnpj: "", cidade: "", uf: "", lojista: "" });
  const [respondendo, setRespondendo] = useState<{ id: string; texto: string } | null>(null);
  const [modo, setModo] = useState<"cliente" | "interno">("cliente");
  const fim = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const arqRef = useRef<HTMLInputElement>(null);
  // Anexo: primeiro mostra uma PRÉVIA (com legenda) e só envia ao confirmar.
  const [anexo, setAnexo] = useState<{ file: File; url: string; ehImg: boolean; ehAudio: boolean } | null>(null);
  const [legendaAnexo, setLegendaAnexo] = useState("");
  function escolherAnexo(file: File) {
    if (!file) return;
    // Confere o TAMANHO já na escolha (antes de tentar subir). Arquivo grande demais era
    // recusado pela Cloudflare com "Erro 413" — confuso. Aqui o aviso é claro, com o tamanho.
    const MAX_MB = 40;
    if (file.size > MAX_MB * 1024 * 1024) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      alert(`Esse arquivo tem ${mb} MB — acima do limite de ${MAX_MB} MB.\n\nPra CATÁLOGO, o melhor é enviar o LINK do catálogo (botão 📖), que abre na hora e não tem limite de tamanho.\n\nSe for outro arquivo, comprima o PDF (ex.: ilovepdf.com/pt/comprimir_pdf) e reenvie.`);
      if (arqRef.current) arqRef.current.value = "";
      return;
    }
    const ehImg = (file.type || "").startsWith("image/");
    const ehAudio = (file.type || "").startsWith("audio/");
    setAnexo((a) => { if (a?.url) URL.revokeObjectURL(a.url); return { file, url: (ehImg || ehAudio) ? URL.createObjectURL(file) : "", ehImg, ehAudio }; });
    setLegendaAnexo("");
  }
  // Gravar áudio (nota de voz) pelo microfone — captura PCM cru e gera WAV (o WhatsApp não
  // toca webm, o formato padrão do navegador). Assim o áudio abre na conversa do cliente.
  const [gravando, setGravando] = useState(false);
  const gravRef = useRef<{ ctx: AudioContext; stream: MediaStream; source: MediaStreamAudioSourceNode; processor: ScriptProcessorNode; chunks: Float32Array[]; sampleRate: number } | null>(null);
  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      source.connect(processor); processor.connect(ctx.destination);
      gravRef.current = { ctx, stream, source, processor, chunks, sampleRate: ctx.sampleRate };
      setGravando(true);
    } catch { alert("Não consegui acessar o microfone. Autorize o microfone no navegador e tente de novo."); }
  }
  function pararGravacao() {
    const g = gravRef.current; gravRef.current = null; setGravando(false);
    if (!g) return;
    try { g.processor.disconnect(); g.source.disconnect(); } catch { /* ok */ }
    g.stream.getTracks().forEach((t) => t.stop());
    try {
      const wav = pcmParaWav(g.chunks, g.sampleRate);
      if (wav.byteLength > 44) escolherAnexo(new File([wav], `audio-${Date.now()}.wav`, { type: "audio/wav" }));
    } catch { alert("Não consegui gravar o áudio. Tente de novo."); }
    g.ctx.close().catch(() => { /* ok */ });
  }
  function cancelarAnexo() { if (anexo?.url) URL.revokeObjectURL(anexo.url); setAnexo(null); setLegendaAnexo(""); if (arqRef.current) arqRef.current.value = ""; }
  async function confirmarAnexo() {
    if (!anexo) return;
    setBusy(true);
    try {
      const r = await api.atendEnviarArquivo(id, anexo.file, d?.responsavel || "Atendente", legendaAnexo.trim() || undefined);
      if (!r.enviado && r.motivo && r.motivo !== "desligado") alert("Arquivo salvo na conversa, mas não foi enviado ao cliente: " + r.motivo);
      cancelarAnexo(); carregar(); onMudou();
    } catch (e) { alert("Não consegui enviar o arquivo: " + ((e as Error)?.message || "erro") + "\n\nSe o arquivo for muito grande (acima de 40MB), tente um menor."); }
    finally { setBusy(false); }
  }
  // Vários arquivos de uma vez: manda um por um (pula os que passam de 40MB).
  async function enviarVarios(files: File[]) {
    const validos = files.filter((f) => f.size <= 40 * 1024 * 1024);
    const grandes = files.length - validos.length;
    if (!validos.length) { alert("Todos os arquivos passam de 40 MB. Comprima e tente de novo."); return; }
    if (!confirm(`Enviar ${validos.length} arquivo(s) para o cliente?` + (grandes ? `\n\n(${grandes} ignorado(s) por passar de 40 MB)` : ""))) return;
    setBusy(true);
    try {
      for (const f of validos) { try { await api.atendEnviarArquivo(id, f, d?.responsavel || "Atendente"); } catch { /* segue os próximos */ } }
      carregar(); onMudou();
    } finally { setBusy(false); }
  }
  // Faz o campo de mensagem crescer na vertical conforme digita (até um limite).
  function ajustarAltura() { const t = inputRef.current; if (!t) return; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 130) + "px"; }
  useEffect(() => { ajustarAltura(); }, [texto]);

  function abrirEdicaoDados() {
    setFormD({ nome: d?.nome || "", setor: d?.setor || "", cnpj: d?.cnpj || "", cidade: d?.cidade || "", uf: d?.uf || "", lojista: d?.lojista == null ? "" : String(d.lojista) });
    setEditDados(true);
  }
  async function salvarDados() {
    setBusy(true);
    try { await api.atendSalvarDados(id, formD); setEditDados(false); carregar(); onMudou(); }
    catch { alert("Não consegui salvar os dados."); } finally { setBusy(false); }
  }
  // Botão de 1 clique: marca/desmarca que a pessoa JÁ É cliente/lojista. Com isso a Big
  // trata como lojista (informa preço, não manda pro "onde comprar") e foto/áudio dele vai
  // direto pro humano.
  async function marcarCliente() {
    const novo = d?.lojista === 1 ? "0" : "1";
    setBusy(true);
    try { await api.atendSalvarDados(id, { lojista: novo }); carregar(); onMudou(); }
    catch { alert("Não consegui marcar."); } finally { setBusy(false); }
  }

  function carregarRespostas() {
    api.atendRespostas().then(setRespostas).catch(() => {});
    api.atendRespostasEmpresa().then(setRespEmpresa).catch(() => {});
  }
  useEffect(() => { carregarRespostas(); }, []);
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  useEffect(() => { api.atendFotoPerfil(id).then((r) => setFotoPerfil(r.link)).catch(() => {}); }, [id]);
  const [colsAtend, setColsAtend] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => { api.atendColunas().then((r) => setColsAtend(r.colunas)).catch(() => {}); }, []);
  async function moverColuna(colId: string) {
    setBusy(true);
    try { await api.atendMoverColuna(id, colId); carregar(); onMudou(); } finally { setBusy(false); }
  }
  function carregar() { api.atendConversa(id).then((c) => { setD(c); setRepSel((s) => s || c.representante || ""); }); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 5000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { api.listarRepresentantes().then((r) => setReps(r.filter((x) => x.ativo))).catch(() => {}); }, []);
  useEffect(() => { api.listarUsuarios().then((u) => setUsuarios(Array.isArray(u) ? u : [])).catch(() => {}); }, []);
  useEffect(() => { fim.current?.scrollIntoView(); }, [d?.mensagens.length]);

  // Funil (venda) trazido pra dentro da conversa.
  const [funil, setFunil] = useState<FunilCardDetalhe | null>(null);
  useEffect(() => { if (d?.card_id) api.funilCard(d.card_id).then(setFunil).catch(() => setFunil(null)); else setFunil(null); }, [d?.card_id]);
  async function moverEtapa(etapa: string) {
    if (!d?.card_id || !etapa) return;
    setBusy(true);
    try { await api.atualizarCard(d.card_id, { etapa }); setFunil(await api.funilCard(d.card_id)); onMudou(); } finally { setBusy(false); }
  }

  async function assumir() {
    const u = getUser();
    setBusy(true);
    try { await api.atendAssumir(id, u?.nome || "Atendente"); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function transferir(nome: string) {
    if (!nome) return;
    setBusy(true);
    try { await api.atendAssumir(id, nome); carregar(); onMudou(); } finally { setBusy(false); }
  }
  // Devolve a conversa pra Big (IA) — inverso do "assumir". A Big assume e, se houver uma
  // pergunta do cliente esperando, já responde agora; senão responde na próxima mensagem.
  async function devolverIa() {
    setBusy(true);
    try {
      const r = await api.atendIaAssumir(id);
      if (r && r.ia_ligada === false) alert("A conversa voltou pra Big, mas a IA de atendimento está DESLIGADA em Configurações → Conexão. Ligue-a pra ela responder.");
      carregar(); onMudou();
    } catch { alert("Não consegui devolver pra IA."); } finally { setBusy(false); }
  }
  // Menu de excluir mensagem (para mim / para todos).
  const [menuMsg, setMenuMsg] = useState<string | null>(null);
  async function excluirMsg(msgId: string, paraTodos: boolean) {
    if (paraTodos && !confirm("Apagar esta mensagem PARA TODOS? Ela some também no WhatsApp do cliente.")) return;
    setMenuMsg(null); setBusy(true);
    try {
      const r = await api.atendExcluirMsg(id, msgId, paraTodos);
      if (paraTodos && r && r.revogada === false) alert("Apaguei aqui no CRM, mas não consegui apagar no WhatsApp do cliente" + (r.motivo ? ` (${r.motivo})` : "") + ". Pode ser que já tenha passado o tempo que o WhatsApp permite apagar.");
      carregar(); onMudou();
    } catch { alert("Não consegui excluir a mensagem."); } finally { setBusy(false); }
  }
  const [sugerindo, setSugerindo] = useState(false);
  async function sugerir() {
    setSugerindo(true);
    try { const r = await api.atendSugerir(id); setTexto(r.sugestao); }
    catch { alert("Não consegui sugerir uma resposta agora."); }
    finally { setSugerindo(false); }
  }
  async function toggleNaoPerturbe() {
    if (!d) return;
    setBusy(true);
    try { await api.atendNaoPerturbe(id, !d.nao_perturbe); carregar(); onMudou(); } finally { setBusy(false); }
  }
  // Lembrete: deixa o card pulsando (amarelo) no quadro pra não esquecer de falar com o lead.
  async function toggleLembreteConv() {
    setBusy(true);
    try { await api.atendLembrete(id); carregar(); onMudou(); } finally { setBusy(false); }
  }
  // Silenciar: card não pisca e não toca som/aviso (bom pra grupo barulhento).
  async function toggleSilenciar() {
    setBusy(true);
    try { await api.atendSilenciar(id); carregar(); onMudou(); } finally { setBusy(false); }
  }
  const encerrado = !!d?.encerrado_em && (d.encerrado_em || "") >= (d.ultima_in_em || "");
  async function encerrar() {
    setBusy(true);
    try { await api.atendEncerrar(id, getUser()?.nome, encerrado); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function enviarCatalogo() {
    if (!confirm("Enviar o link do catálogo para este cliente?")) return;
    setBusy(true);
    try { await api.atendEnviarCatalogo(id); carregar(); onMudou(); }
    catch { alert("Não consegui enviar o catálogo agora."); }
    finally { setBusy(false); }
  }
  async function autorizar() {
    const rep = repSel.trim();
    if (!rep) { alert("Escolha o representante."); return; }
    if (!confirm(`Autorizar o encaminhamento para ${rep}? O cliente será avisado.`)) return;
    setBusy(true);
    try { await api.atendAutorizar(id, rep); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function enviar() {
    if (!texto.trim()) return;
    setBusy(true);
    try { await api.atendEnviar(id, { texto: texto.trim(), autor: d?.responsavel || "Atendente", responder_a: respondendo?.id }); setTexto(""); setRespondendo(null); carregar(); onMudou(); }
    finally { setBusy(false); }
  }
  // Nota interna: recado da equipe DENTRO da conversa — o cliente NÃO recebe.
  async function enviarNota() {
    if (!texto.trim()) return;
    setBusy(true);
    try { await api.atendNota(id, { texto: texto.trim(), autor: getUser()?.nome || "Equipe" }); setTexto(""); carregar(); onMudou(); }
    finally { setBusy(false); }
  }

  const humano = d?.estado === "atendimento-humano";
  const bloqueado = !!d?.bloqueado;
  // Colar um print (Ctrl+V): pega a imagem da área de transferência e abre a prévia.
  useEffect(() => {
    if (!humano || bloqueado) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items; if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith("image/")) { const f = it.getAsFile(); if (f) { e.preventDefault(); escolherAnexo(f); return; } }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humano, bloqueado]);
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card at-modal" onClick={(e) => e.stopPropagation()}>
        <div className="at-thd">
          <div className="at-av" style={fotoPerfil ? { backgroundImage: `url(${fotoPerfil})`, backgroundSize: "cover", backgroundPosition: "center", color: "transparent" } : undefined}>{fotoPerfil ? "" : iniciais(d?.nome || d?.contato_nome || d?.telefone)}</div>
          <div className="info">
            <div className="nm">{d?.nome || d?.contato_nome || (d ? telBonito(d.telefone) : "…")}</div>
            <div className="sub">{d ? telBonito(d.telefone) : ""}{d?.cidade ? ` · ${d.cidade}/${d.uf || ""}` : ""}</div>
          </div>
          {d && <span className="at-chip" style={{ background: "#eef2ff", color: "#4338ca" }}>{d.coluna.replace(/-/g, " ")}</span>}
          {bloqueado && <span className="at-chip" style={{ background: "#fee2e2", color: "#b91c1c" }} title="Mensagens bloqueadas para este cliente">🚫 bloqueado</span>}
          <button className="modal-x" onClick={onFechar}>✕</button>
        </div>

        <div className="at-body">
          <div className="at-msgs">
            {d?.mensagens.map((m) => (
              m.tipo === "sistema"
                ? <div className="at-sys" key={m.id}>⚙️ {m.texto}</div>
                : m.tipo === "nota"
                ? <div className="at-nota" key={m.id}><span className="at-nota-hd">📝 {m.autor || "Equipe"} · nota interna (o cliente não vê)</span>{formatarMsg(m.texto)}<span className="at-tm">{hora(m.criado_em)}</span></div>
                : <div key={m.id} className={"at-b " + (m.direcao === "in" ? "in" : "out")} style={{ position: "relative" }}>
                    {m.autor && m.direcao === "out" && <div className="at-aut">{m.autor === "bot" ? "🤖 Big (automático) · só você vê" : m.autor}</div>}
                    {m.responder_texto && <div className="at-quote">↪ {m.responder_texto}</div>}
                    {m.arquivo_url
                      ? <>
                          {/\.(jpg|jpeg|png|gif|webp)$/i.test(m.arquivo_url)
                            ? <a href={m.arquivo_url} target="_blank" rel="noreferrer"><img src={m.arquivo_url} alt={m.texto || "imagem"} style={{ maxWidth: 220, maxHeight: 260, borderRadius: 8, display: "block" }} /></a>
                            : /\.(ogg|opus|mp3|m4a|wav|webm|aac|amr)$/i.test(m.arquivo_url)
                              ? <audio controls src={m.arquivo_url} style={{ maxWidth: 230, display: "block" }} />
                              : (() => {
                                  const raw = (m.texto || "").trim(); const i = raw.lastIndexOf("📎");
                                  const nome = ((i >= 0 ? raw.slice(i + 1) : raw).trim() || "arquivo");
                                  const pdf = /\.pdf($|[?#])/i.test(m.arquivo_url!) || /\.pdf$/i.test(nome);
                                  return <DocCard url={m.arquivo_url!} nome={nome} pdf={pdf} />;
                                })()}
                          {/\.(jpg|jpeg|png|gif|webp|ogg|opus|mp3|m4a|wav|webm|aac|amr)$/i.test(m.arquivo_url) && m.tipo !== "arquivo" && (m.texto || "").trim() && <div style={{ marginTop: 4 }}>{corpoMsg(m.texto)}</div>}
                        </>
                      : m.tipo === "arquivo" ? <span className="at-file">📒 {m.texto}</span> : corpoMsg(m.texto)}
                    <span className="at-tm">{hora(m.criado_em)}{m.direcao === "out" && m.autor !== "sistema" && m.status && (
                      <span title={m.status === "read" ? "Visto" : m.status === "delivered" ? "Entregue" : "Enviado"} style={{ marginLeft: 4, color: m.status === "read" ? "#53bdeb" : "#8696a0", fontWeight: 700 }}>{m.status === "sent" ? "✓" : "✓✓"}</span>
                    )}</span>
                    {humano && m.direcao === "in" && m.tipo !== "arquivo" && (m.texto || "").trim() && (
                      <button className="at-reply" title="Responder esta mensagem" onClick={() => setRespondendo({ id: m.id, texto: (extrairIaNota(m.texto).visivel || "foto").slice(0, 180) })}>↩︎</button>
                    )}
                    <button title="Excluir mensagem" onClick={() => setMenuMsg(menuMsg === m.id ? null : m.id)} style={{ position: "absolute", top: 2, right: 5, background: "transparent", border: 0, cursor: "pointer", fontSize: 14, opacity: 0.5, lineHeight: 1, padding: 0 }}>⋮</button>
                    {menuMsg === m.id && (
                      <div style={{ position: "absolute", top: 18, right: 2, zIndex: 30, background: "var(--card,#fff)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 6px 16px rgba(0,0,0,.2)", overflow: "hidden", minWidth: 162 }}>
                        <button onClick={() => excluirMsg(m.id, false)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12.5, background: "transparent", border: 0, cursor: "pointer", color: "inherit" }}>🙈 Excluir para mim</button>
                        {m.direcao === "out" && m.autor !== "sistema" && (
                          <button onClick={() => excluirMsg(m.id, true)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12.5, background: "transparent", border: 0, cursor: "pointer", color: "#dc2626" }}>🗑 Excluir para todos</button>
                        )}
                        <button onClick={() => setMenuMsg(null)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12.5, background: "transparent", border: 0, cursor: "pointer", color: "var(--muted)" }}>Cancelar</button>
                      </div>
                    )}
                  </div>
            ))}
            <div ref={fim} />
          </div>

          <div className="at-ctx">
            <div className="at-block-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Dados coletados</span>
              {d && !editDados && <button className="btn btn-soft" style={{ fontSize: 11, padding: "2px 8px" }} onClick={abrirEdicaoDados} title="Preencher/corrigir à mão">✏️ Editar</button>}
            </div>
            {editDados ? (
              <div style={{ display: "grid", gap: 7, marginBottom: 6 }}>
                <label className="fld" style={{ fontSize: 11.5 }}>Loja
                  <input value={formD.nome} onChange={(e) => setFormD((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome da loja" />
                </label>
                <label className="fld" style={{ fontSize: 11.5 }}>Setor
                  <select value={formD.setor} onChange={(e) => setFormD((f) => ({ ...f, setor: e.target.value }))}>
                    <option value="">—</option>
                    <option value="vendas">🛒 Vendas</option>
                    <option value="fiscal">💰 Fiscal / Financeiro</option>
                    <option value="estoque">📦 Estoque</option>
                    <option value="pcp">🏭 Produção (PCP)</option>
                  </select>
                </label>
                <label className="fld" style={{ fontSize: 11.5 }}>CNPJ
                  <input value={formD.cnpj} onChange={(e) => setFormD((f) => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
                </label>
                <label className="fld" style={{ fontSize: 11.5 }}>Lojista?
                  <select value={formD.lojista} onChange={(e) => setFormD((f) => ({ ...f, lojista: e.target.value }))}>
                    <option value="">— não sei —</option>
                    <option value="1">✅ Sim, é lojista</option>
                    <option value="0">🙅 Não (consumidor)</option>
                  </select>
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <label className="fld" style={{ fontSize: 11.5, flex: 1 }}>Cidade
                    <input value={formD.cidade} onChange={(e) => setFormD((f) => ({ ...f, cidade: e.target.value }))} />
                  </label>
                  <label className="fld" style={{ fontSize: 11.5, width: 64 }}>UF
                    <input value={formD.uf} maxLength={2} onChange={(e) => setFormD((f) => ({ ...f, uf: e.target.value.toUpperCase() }))} style={{ textTransform: "uppercase" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-soft" style={{ flex: 1 }} disabled={busy} onClick={() => setEditDados(false)}>Cancelar</button>
                  <button className="kbtn go" style={{ flex: 1 }} disabled={busy} onClick={salvarDados}>Salvar</button>
                </div>
              </div>
            ) : (<>
              <div className="at-row"><span>Setor</span><b>{d?.setor ? (SETOR_EMOJI[d.setor] || "") + " " + d.setor : "—"}</b></div>
              <div className="at-row"><span>Loja</span><b>{d?.nome || "—"}</b></div>
              <div className="at-row"><span>CNPJ</span><b>{d?.cnpj || "—"}</b></div>
              <div className="at-row"><span>Lojista</span><b>{d?.lojista == null ? "—" : d.lojista ? "✅ sim" : "🙅 não"}</b></div>
              <div className="at-row"><span>Cidade</span><b>{[d?.cidade, d?.uf].filter(Boolean).join("/") || "—"}</b></div>
            </>)}
            {d && !editDados && (
              <button className="btn btn-soft" disabled={busy} onClick={marcarCliente}
                style={{ marginTop: 8, width: "100%", fontSize: 12.5, ...(d.lojista === 1 ? { borderColor: "#a7f3d0", background: "#ecfdf5", color: "#065f46", fontWeight: 700 } : {}) }}
                title="Marca que essa pessoa JÁ é cliente/lojista. A Big passa a tratá-la como lojista (informa preço, não manda pro 'onde comprar').">
                {d.lojista === 1 ? "📇 É cliente / lojista ✓ (desmarcar)" : "📇 Marcar como cliente / lojista"}
              </button>
            )}
            {d?.representante && d?.autorizado !== 0 && <div className="at-row"><span>Representante</span><b>🧑‍💼 {d.representante}</b></div>}
            {d && d.interesses && d.interesses.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="at-row" style={{ borderBottom: 0, paddingBottom: 2 }}><span>🔥 Interesse</span><b></b></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {d.interesses.map((t) => <span key={t} className="at-chip" style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 11.5 }}>{t}</span>)}
                </div>
              </div>
            )}

            {d?.autorizado === 0 && (
              <div style={{ marginTop: 10, padding: "10px 11px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#92400e", marginBottom: 6 }}>⏳ Aguardando autorização</div>
                <div style={{ fontSize: 12, color: "#78350f", marginBottom: 8 }}>Confira o representante e autorize pra conectar o cliente. Nada foi enviado a ninguém ainda.</div>
                <select value={repSel} onChange={(e) => setRepSel(e.target.value)} style={{ width: "100%", marginBottom: 8 }}>
                  <option value="">— escolher representante —</option>
                  {reps.map((r) => <option key={r.id} value={r.nome}>{r.nome}</option>)}
                  {d.representante && !reps.some((r) => r.nome === d.representante) && <option value={d.representante}>{d.representante} (sugerido)</option>}
                </select>
                <button className="kbtn go" style={{ width: "100%" }} disabled={busy || !repSel} onClick={autorizar}>✅ Autorizar e conectar</button>
              </div>
            )}

            {d?.pedidos_resumo && d.pedidos_resumo.qtd > 0 && (
              <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12.5, color: "#166534" }}>
                <div style={{ fontWeight: 800, color: "#15803d", marginBottom: 3 }}>🛍️ Cliente da base</div>
                <div><b>{d.pedidos_resumo.qtd}</b> pedido(s) · <b>{d.pedidos_resumo.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></div>
                {d.pedidos_resumo.ultima && <div className="muted">última compra: {new Date(d.pedidos_resumo.ultima + "T00:00:00").toLocaleDateString("pt-BR")}</div>}
              </div>
            )}
            {d?.card_id && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #a7f3d0", background: "#ecfdf5", color: "#065f46" }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>🎯 Venda (Funil)</div>
                <select value={funil?.etapa || ""} onChange={(e) => moverEtapa(e.target.value)} disabled={busy} style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid #6ee7b7", background: "#fff", color: "#065f46", fontWeight: 700 }}>
                  {ETAPAS_FUNIL.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                {funil?.valor_estimado ? <div style={{ fontSize: 12.5, marginTop: 6 }}>💰 Valor estimado: <b>R$ {Number(funil.valor_estimado).toLocaleString("pt-BR")}</b></div> : null}
                {(() => { const t = funil?.tarefas?.find((x) => !x.feita); return t ? <div style={{ fontSize: 12, marginTop: 4 }}>📌 {t.titulo}{t.vence_em ? ` · vence ${t.vence_em.slice(8, 10)}/${t.vence_em.slice(5, 7)}` : ""}</div> : null; })()}
                <Link to="/funil" className="btn btn-soft" style={{ marginTop: 8, display: "block", textAlign: "center", fontSize: 12 }}>Abrir no funil completo →</Link>
              </div>
            )}
            {/* Vendedor responsável: mostra o nome de quem atende e deixa escolher/trocar direto aqui. */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 800, marginBottom: 3 }}>🧑‍💼 Vendedor responsável</div>
              <select className={"at-sel" + (d?.responsavel ? " on" : "")} value={d?.responsavel || ""} onChange={(e) => { if (e.target.value) transferir(e.target.value); }} disabled={busy}>
                <option value="">— escolher vendedor —</option>
                {usuarios.map((u) => <option key={u.usuario} value={u.nome}>{u.nome}</option>)}
              </select>
            </div>
            {/* Mover pra outra coluna do quadro (lendo a conversa, você decide pra onde vai). */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 800, marginBottom: 3 }}>↔️ Mover para coluna</div>
              <select className="at-sel" value="" onChange={(e) => { const v = e.target.value; if (v) moverColuna(v === "__auto" ? "" : v); }} disabled={busy}>
                <option value="">{(d && colsAtend.find((x) => x.id === d.coluna)?.label) || "Escolher coluna…"}</option>
                <option value="__auto">🔄 Automático (segue o estado da conversa)</option>
                {colsAtend.filter((x) => x.id !== d?.coluna).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
            <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5, borderColor: encerrado ? "#a7f3d0" : undefined, background: encerrado ? "#ecfdf5" : undefined, color: encerrado ? "#065f46" : undefined }} disabled={busy} onClick={encerrar} title="Marca o atendimento como resolvido (para de piscar). NÃO envia nada ao cliente.">
              {encerrado ? "✅ Encerrado — reabrir" : "✅ Encerrar atendimento"}
            </button>
            {(humano || d?.responsavel) && (
              <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5, borderColor: "#ddd6fe", background: "#f5f3ff", color: "#6d28d9", fontWeight: 700 }} disabled={busy} onClick={devolverIa} title="A Big (IA) assume a conversa: se houver uma pergunta do cliente esperando, ela já responde agora; senão, responde a próxima mensagem.">
                🤖 Big (IA) assume e responde
              </button>
            )}
            <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5, ...(d?.lembrete ? { borderColor: "#eab308", background: "#fffbeb", color: "#854d0e", fontWeight: 700 } : {}) }} disabled={busy} onClick={toggleLembreteConv} title="Deixa o card pulsando (amarelo) no quadro pra você lembrar de falar com esse lead.">
              {d?.lembrete ? "🔔 Lembrete ativo — tirar (para de pulsar)" : "🔔 Lembrar de falar (deixa o card pulsando)"}
            </button>
            {(d?.origem === "grupo" || d?.estado === "grupo") && (
              <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5, ...(d?.silenciado ? { borderColor: "#94a3b8", background: "#f1f5f9", color: "#475569", fontWeight: 700 } : {}) }} disabled={busy} onClick={toggleSilenciar} title="Silencia este grupo: o card NÃO pisca e não toca som/aviso.">
                {d?.silenciado ? "🔕 Grupo silenciado — reativar" : "🔕 Silenciar este grupo"}
              </button>
            )}
            <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5 }} disabled={busy} onClick={toggleNaoPerturbe} title="Para/retoma as mensagens automáticas para este cliente">
              {d?.nao_perturbe ? "🔕 Automáticas pausadas — retomar" : "🔔 Pausar mensagens automáticas"}
            </button>
          </div>
        </div>

        <div className="at-compose" style={{ position: "relative" }}>
          {/* Prévia do anexo (foto colada ou escolhida) com legenda antes de enviar */}
          {anexo && (
            <div style={{ position: "absolute", left: 8, right: 8, bottom: "100%", marginBottom: 8, background: "var(--card,#fff)", border: "1px solid var(--line,#e2e8f0)", borderRadius: 12, boxShadow: "0 12px 32px #0002", padding: 12, zIndex: 26 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {anexo.ehImg
                  ? <img src={anexo.url} alt="prévia" style={{ maxWidth: 130, maxHeight: 130, borderRadius: 8, objectFit: "cover" }} />
                  : anexo.ehAudio
                    ? <audio controls src={anexo.url} style={{ width: 210 }} />
                    : <div className="at-file" style={{ padding: "10px 12px", background: "var(--bg-soft,#f1f5f9)", borderRadius: 8 }}>📎 {anexo.file.name}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>Enviar {anexo.ehImg ? "imagem" : anexo.ehAudio ? "áudio" : "arquivo"} para o cliente</div>
                  {!anexo.ehAudio && <textarea placeholder="Escreva uma legenda (opcional)…" value={legendaAnexo} onChange={(e) => setLegendaAnexo(e.target.value)} rows={2} autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmarAnexo(); } }}
                    style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn btn-soft" disabled={busy} onClick={cancelarAnexo}>Cancelar</button>
                <button className="kbtn go" disabled={busy} onClick={confirmarAnexo}>{busy ? "Enviando…" : "📤 Enviar"}</button>
              </div>
            </div>
          )}
          {/* Lista de respostas prontas (abre acima do campo) */}
          {mostrarResp && humano && (
            <div style={{ position: "absolute", left: 8, right: 8, bottom: "100%", marginBottom: 8, background: "var(--card,#fff)", border: "1px solid var(--line,#e2e8f0)", borderRadius: 12, boxShadow: "0 12px 32px #0002", maxHeight: 280, overflowY: "auto", zIndex: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--line,#eef2f7)" }}>
                <b style={{ fontSize: 13 }}>📋 Respostas prontas</b>
                <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => { setMostrarResp(false); setGerenciarResp(true); }}>⚙️ Gerenciar</button>
              </div>
              {respEmpresa.length === 0 && respostas.length === 0
                ? <div className="muted2" style={{ padding: "12px" }}>Nenhuma resposta salva. Clique em <b>⚙️ Gerenciar</b> para criar.</div>
                : <>
                    {respEmpresa.length > 0 && <div className="muted2" style={{ padding: "6px 12px 2px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3 }}>📌 Da empresa</div>}
                    {respEmpresa.map((r, i) => (
                      <button key={"e" + i} onClick={() => { setTexto(r.texto); setMostrarResp(false); }} title="Coloca no campo — você edita e envia"
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderTop: "1px solid var(--line,#f1f5f9)", background: "transparent", cursor: "pointer" }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.titulo || "(sem título)"}</div>
                        <div className="muted2" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.texto}</div>
                      </button>
                    ))}
                    {respostas.length > 0 && <div className="muted2" style={{ padding: "8px 12px 2px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3 }}>🙋 Minhas</div>}
                    {respostas.map((r, i) => (
                      <button key={"m" + i} onClick={() => { setTexto(r.texto); setMostrarResp(false); }} title="Coloca no campo — você edita e envia"
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderTop: "1px solid var(--line,#f1f5f9)", background: "transparent", cursor: "pointer" }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.titulo || "(sem título)"}</div>
                        <div className="muted2" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.texto}</div>
                      </button>
                    ))}
                  </>}
            </div>
          )}
          {respondendo && humano && (
            <div style={{ position: "absolute", left: 8, right: 8, bottom: "100%", marginBottom: 6, display: "flex", alignItems: "center", gap: 8, background: "var(--bg-soft,#f1f5f9)", borderLeft: "3px solid #16a34a", borderRadius: 8, padding: "6px 10px", zIndex: 15 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>↪ Respondendo</div>
                <div className="muted2" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{respondendo.texto}</div>
              </div>
              <button className="modal-x" style={{ position: "static" }} onClick={() => setRespondendo(null)} title="Cancelar resposta">✕</button>
            </div>
          )}
          {/* Alternar: falar com o CLIENTE (WhatsApp) ou deixar NOTA INTERNA (só a equipe vê) */}
          <div style={{ flexBasis: "100%", display: "flex", gap: 6, marginBottom: 4 }}>
            <button className="at-modo-pill" style={modo === "cliente" ? { background: "#25d366", color: "#fff", borderColor: "#25d366" } : {}} onClick={() => setModo("cliente")}>💬 Cliente</button>
            <button className="at-modo-pill" style={modo === "interno" ? { background: "#f59e0b", color: "#fff", borderColor: "#f59e0b" } : {}} onClick={() => setModo("interno")}>📝 Nota interna</button>
          </div>
          {modo === "cliente" && bloqueado
            ? <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", flexWrap: "wrap", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 }}>
                🚫 <b>Cliente bloqueado</b> — nenhuma mensagem é enviada pra ele. Use <b>📝 Nota interna</b> ou desbloqueie em <b>Clientes</b>.
              </div>
            : modo === "interno"
            ? <>
                <textarea ref={inputRef} rows={1} placeholder="Recado pra equipe (o cliente NÃO vê)… ex.: cobra o boleto dele" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarNota(); } }} style={{ background: "#fffbeb", borderColor: "#fde68a" }} />
                <button className="at-send" style={{ background: "#f59e0b" }} disabled={busy} onClick={enviarNota} title="Salvar nota interna">📝</button>
              </>
            : humano
            ? <>
                <button className="at-send" style={{ background: "transparent", color: "var(--accent,#7c3aed)" }} disabled={busy || sugerindo} onClick={sugerir} title="Sugerir resposta com IA (você pode editar)">{sugerindo ? "…" : "✨"}</button>
                <button className="at-send" style={{ background: "transparent" }} onClick={() => setMostrarResp((v) => !v)} title="Respostas prontas">📋</button>
                <button className="at-send" style={{ background: "transparent" }} disabled={busy} onClick={() => arqRef.current?.click()} title="Anexar arquivo (foto/documento/áudio) — ou cole um print com Ctrl+V">📎</button>
                <input ref={arqRef} type="file" multiple accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" style={{ display: "none" }} onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length === 1) escolherAnexo(fs[0]); else if (fs.length > 1) enviarVarios(fs); e.currentTarget.value = ""; }} />
                <button className="at-send" style={{ background: gravando ? "#ef4444" : "transparent", color: gravando ? "#fff" : undefined }} disabled={busy} onClick={() => (gravando ? pararGravacao() : iniciarGravacao())} title={gravando ? "Parar e ouvir antes de enviar" : "Gravar áudio (nota de voz)"}>{gravando ? "⏹" : "🎤"}</button>
                <button className="at-send" style={{ background: "transparent" }} disabled={busy} onClick={enviarCatalogo} title="Enviar o link do catálogo">📖</button>
                <textarea ref={inputRef} rows={1} placeholder="Escreva uma mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
                <button className="at-send" disabled={busy} onClick={enviar}>➤</button>
              </>
            : <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", flexWrap: "wrap" }}>
                <span className="muted2" style={{ flex: 1, minWidth: 160 }}>🤖 O robô está conduzindo.</span>
                <button className="kbtn go" disabled={busy} onClick={assumir}>🙋 Assumir e responder</button>
              </div>}
        </div>
      </div>
      {gerenciarResp && <RespostasModal onFechar={() => setGerenciarResp(false)} onSalvo={() => { setGerenciarResp(false); carregarRespostas(); }} />}
    </div>
  );
}

// ── Gerenciar respostas prontas (atalhos de texto do atendente) ───────────────────
function RespostasModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const gestor = ehGestorAtend();
  const [aba, setAba] = useState<"minhas" | "empresa">("minhas");
  const [minhas, setMinhas] = useState<{ titulo: string; texto: string }[]>([]);
  const [empresa, setEmpresa] = useState<{ titulo: string; texto: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.allSettled([api.atendRespostas(), api.atendRespostasEmpresa()]).then(([m, e]) => {
      if (m.status === "fulfilled") setMinhas(m.value);
      if (e.status === "fulfilled") setEmpresa(e.value);
    }).finally(() => setCarregando(false));
  }, []);
  const empresaMode = aba === "empresa" && gestor;
  const lista = empresaMode ? empresa : minhas;
  const setLista = empresaMode ? setEmpresa : setMinhas;
  const set = (i: number, k: "titulo" | "texto", v: string) => setLista((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const add = () => setLista((l) => [...l, { titulo: "", texto: "" }]);
  const remover = (i: number) => setLista((l) => l.filter((_, j) => j !== i));
  async function salvar() {
    setBusy(true);
    try {
      if (empresaMode) await api.atendSalvarRespostasEmpresa(empresa.filter((x) => x.texto.trim()));
      else await api.atendSalvarRespostas(minhas.filter((x) => x.texto.trim()));
      onSalvo();
    } catch { alert("Não consegui salvar as respostas."); } finally { setBusy(false); }
  }
  const tabBtn = (id: "minhas" | "empresa", label: string) => (
    <button className={"crm-tab" + (aba === id ? " on" : "")} style={{ fontSize: 12.5 }} onClick={() => setAba(id)}>{label}</button>
  );
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560, width: "min(560px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#7c3aed,#4f46e5)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">📋 Respostas prontas</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
        </div>
        <div className="modal-bd">
          {gestor && <div className="crm-tabs" style={{ marginBottom: 10 }}>{tabBtn("minhas", "🙋 Minhas")}{tabBtn("empresa", "📌 Da empresa")}</div>}
          <div className="muted2" style={{ marginBottom: 10, fontSize: 12.5 }}>
            {empresaMode
              ? <>Respostas <b>da empresa</b> — aparecem pra <b>todos os atendentes</b>. Use pros textos padrão (convite pro cadastro, horário…).</>
              : <>Estas respostas são <b>suas</b> ({getUser()?.nome || "você"}) — só você vê. As <b>da empresa</b> aparecem pra todos automaticamente. Na conversa, clique em 📋 e escolha.</>}
          </div>
          {carregando ? <p className="muted">Carregando…</p> : lista.map((r, i) => (
            <div key={i} style={{ border: "1px solid var(--line,#e2e8f0)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input placeholder="Título (ex.: Cadastro no site)" value={r.titulo} onChange={(e) => set(i, "titulo", e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-soft" style={{ color: "#dc2626" }} onClick={() => remover(i)} title="Remover">🗑️</button>
              </div>
              <textarea placeholder="Texto da mensagem…" rows={3} value={r.texto} onChange={(e) => set(i, "texto", e.target.value)} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
            </div>
          ))}
          <button className="btn btn-soft" onClick={add} style={{ width: "100%" }}>＋ Nova resposta</button>
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn go" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : (empresaMode ? "Salvar (empresa)" : "Salvar respostas")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Equipe: números do time que a Big NÃO atende automaticamente ──────────────────
function EquipeModal({ onFechar }: { onFechar: () => void }) {
  const [numeros, setNumeros] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [salvou, setSalvou] = useState(false);
  useEffect(() => { api.atendConfig().then((c) => setNumeros(c.equipe_numeros || "")).catch(() => {}).finally(() => setCarregando(false)); }, []);
  async function salvar() {
    setBusy(true);
    try { await api.atendSalvarEquipe(numeros); setSalvou(true); setTimeout(() => setSalvou(false), 2200); }
    catch { alert("Não consegui salvar."); } finally { setBusy(false); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 480, width: "96vw" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>👥 Equipe</h2>
          <button className="modal-x" onClick={onFechar}>✕</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
          Números da <b>equipe</b> que a Big <b>NÃO</b> deve atender. Assim vocês falam com esse WhatsApp (testar, avisar algo) <b>sem o robô responder</b>. Um número por linha, com DDD.
        </p>
        {carregando ? <div className="muted">Carregando…</div> : (
          <textarea value={numeros} onChange={(e) => setNumeros(e.target.value)} rows={6} placeholder={"35 9 9999-9999\n11 98888-7777"} style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }} />
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, alignItems: "center" }}>
          {salvou && <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 700 }}>✓ Salvo</span>}
          <button className="btn btn-soft" onClick={onFechar}>Fechar</button>
          <button className="btn btn-primary" disabled={busy || carregando} onClick={salvar}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Chat interno da equipe (DM) — abre da coluna "Equipe" ──────────────────────────
function ChatEquipeModal({ outro, onFechar }: { outro: string; onFechar: () => void }) {
  const nome = getUser()?.nome || "";
  const canal = "dm:" + [nome, outro].sort().join("|");
  const [msgs, setMsgs] = useState<ChatMensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  function carregar() { api.listarChat(canal).then(setMsgs).catch(() => {}); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 3500); return () => clearInterval(t); /* eslint-disable-next-line */ }, [canal]);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length]);
  async function enviar() {
    if (!texto.trim()) return;
    setBusy(true);
    try { await api.enviarChat(canal, nome, texto.trim()); setTexto(""); carregar(); } finally { setBusy(false); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card at-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="at-thd" style={{ background: "#4f46e5" }}>
          <div className="at-av" style={{ background: "#6366f1" }}>{iniciais(outro)}</div>
          <div className="info"><div className="nm">👤 {outro}</div><div className="sub">Chat interno da equipe (o cliente não vê)</div></div>
          <button className="modal-x" onClick={onFechar}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 320 }}>
          <div className="at-msgs" style={{ flex: 1 }}>
            {msgs.length === 0 && <div className="muted2" style={{ margin: "auto", fontSize: 12.5 }}>Sem mensagens ainda. Diga oi pra {outro}! 👋</div>}
            {msgs.map((m) => (
              <div key={m.id} className={"at-b " + (m.autor === nome ? "out" : "in")}>
                {m.autor !== nome && <div className="at-aut">{m.autor}</div>}
                {formatarMsg(m.texto)}
                <span className="at-tm">{hora(m.criado_em)}</span>
              </div>
            ))}
            <div ref={fim} />
          </div>
          <div className="at-compose">
            <textarea rows={1} placeholder={"Mensagem para " + outro + "…"} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
            <button className="at-send" disabled={busy} onClick={enviar}>➤</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Criar / organizar colunas do quadro (gestor) ──────────────────────────────────
function ColunasModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [colunas, setColunas] = useState<import("../api").AtendColuna[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.atendColunas().then((r) => setColunas(r.colunas)).catch(() => {}).finally(() => setCarregando(false)); }, []);
  const mover = (i: number, dir: number) => setColunas((cs) => { const n = [...cs]; const j = i + dir; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const setCampo = (i: number, k: "label" | "cor", v: string) => setColunas((cs) => cs.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  const add = () => setColunas((cs) => [...cs, { id: "col-" + Math.random().toString(36).slice(2, 9), label: "Nova coluna", cor: "#64748b", custom: true }]);
  const remover = (i: number) => setColunas((cs) => cs.filter((_, idx) => idx !== i));
  async function salvar() {
    setBusy(true);
    try {
      const extra = colunas.filter((c) => c.custom).map((c) => ({ id: c.id, label: c.label, cor: c.cor }));
      const ordem = colunas.map((c) => c.id);
      await api.atendSalvarColunas(extra, ordem);
      onSalvo();
    } catch { alert("Não consegui salvar as colunas."); } finally { setBusy(false); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 520, width: "min(520px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#0ea5e9,#4f46e5)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">🗂️ Colunas do quadro</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
        </div>
        <div className="modal-bd">
          <div className="muted2" style={{ marginBottom: 10, fontSize: 12.5 }}>Use as setas pra reordenar. Você pode <b>criar novas colunas</b> e arrastar os cards pra elas. As colunas padrão do sistema não podem ser apagadas (só reordenadas).</div>
          {carregando ? <p className="muted">Carregando…</p> : colunas.map((c, i) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 6px", borderBottom: "1px solid var(--line,#f1f5f9)" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button className="btn btn-soft" style={{ padding: "0 6px", lineHeight: 1.1 }} disabled={i === 0} onClick={() => mover(i, -1)}>▲</button>
                <button className="btn btn-soft" style={{ padding: "0 6px", lineHeight: 1.1 }} disabled={i === colunas.length - 1} onClick={() => mover(i, 1)}>▼</button>
              </div>
              <input type="color" value={/^#/.test(c.cor) ? c.cor : "#64748b"} onChange={(e) => setCampo(i, "cor", e.target.value)} disabled={!c.custom} style={{ width: 34, height: 34, padding: 0, border: "none", background: "none" }} title={c.custom ? "Cor" : "Cor da coluna padrão"} />
              <input value={c.label} onChange={(e) => setCampo(i, "label", e.target.value)} disabled={!c.custom} style={{ flex: 1 }} />
              {c.custom ? <button className="btn btn-soft" style={{ color: "#dc2626" }} onClick={() => remover(i)} title="Remover">🗑️</button> : <span className="muted2" style={{ fontSize: 10.5, width: 46, textAlign: "center" }}>padrão</span>}
            </div>
          ))}
          <button className="btn btn-soft" onClick={add} style={{ width: "100%", marginTop: 10 }}>＋ Nova coluna</button>
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn go" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Nova conversa: escolhe um contato do WhatsApp (ou digita o número) e manda a 1ª msg ──
type Contato = { nome: string; telefone: string; origem: "cliente" | "whats"; cidade?: string | null; uf?: string | null };
function NovaConversa({ onFechar, onAbrir, onMudou }: { onFechar: () => void; onAbrir: (id: string) => void; onMudou: () => void }) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Contato | null>(null);
  const [telManual, setTelManual] = useState("");
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    // Junta a BASE DE CLIENTES (nome comercial, cidade) com os contatos do WhatsApp,
    // sem repetir número. Assim dá pra achar o cliente pelo nome da loja mesmo que
    // ele não esteja salvo na agenda do celular.
    Promise.allSettled([api.listarClientesCrm(), api.atendContatosWhatsapp()]).then(([cl, w]) => {
      const lista: Contato[] = [];
      const vistos = new Set<string>();
      const add = (nome: string, tel: string, origem: "cliente" | "whats", cidade?: string | null, uf?: string | null) => {
        const d = (tel || "").replace(/\D/g, "");
        if (d.length < 10) return;
        const key = d.slice(-11);
        if (vistos.has(key)) return;
        vistos.add(key);
        lista.push({ nome: nome || telBonito(d), telefone: d, origem, cidade, uf });
      };
      if (cl.status === "fulfilled") for (const c of cl.value) add(c.nome, c.whatsapp || "", "cliente", c.cidade, c.uf);
      if (w.status === "fulfilled") for (const c of (w.value.contatos || [])) add(c.nome, c.telefone, "whats");
      lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setContatos(lista);
      if (cl.status !== "fulfilled" && w.status !== "fulfilled") setErro("Não consegui carregar os contatos agora. Digite o número abaixo.");
      else if (w.status === "fulfilled" && w.value.erro && lista.length === 0) setErro("Conecte o WhatsApp (Z-API) pra puxar sua agenda. Você ainda pode digitar o número abaixo.");
    }).finally(() => setCarregando(false));
  }, []);

  const filtrados = (() => {
    const q = busca.trim().toLowerCase();
    if (!q) return contatos.slice(0, 300);
    const dig = q.replace(/\D/g, "");
    return contatos.filter((c) =>
      c.nome.toLowerCase().includes(q) || (dig.length >= 3 && c.telefone.includes(dig))
    ).slice(0, 300);
  })();

  async function enviar() {
    const tel = (sel?.telefone || telManual).replace(/\D/g, "");
    if (tel.length < 10) { alert("Escolha um contato ou digite um número válido (com DDD)."); return; }
    if (!texto.trim()) { alert("Escreva a primeira mensagem."); return; }
    setBusy(true);
    try {
      const u = getUser();
      const r = await api.atendNovaConversa({ telefone: tel, texto: texto.trim(), nome: sel?.nome, responsavel: u?.nome || "Atendente" });
      onMudou();
      onAbrir(r.conversa_id);
    } catch (e) { alert((e as Error).message || "Não consegui enviar."); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 520, width: "96vw" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>➕ Nova conversa</h2>
          <button className="modal-x" onClick={onFechar}>✕</button>
        </div>
        {erro && <div style={{ fontSize: 12.5, marginBottom: 8, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "7px 10px" }}>{erro}</div>}
        <input placeholder="🔎 Buscar pelo nome da loja, pessoa ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus style={{ width: "100%", marginBottom: 6 }} />
        {!carregando && <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>{busca.trim() ? `${filtrados.length} resultado(s)` : `${contatos.length} contato(s) — base de clientes + WhatsApp`}</div>}
        <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 10 }}>
          {carregando ? <div className="muted" style={{ padding: 12 }}>Carregando contatos…</div>
            : filtrados.length === 0 ? <div className="muted" style={{ padding: 12 }}>Nenhum contato encontrado. Digite o número abaixo. 👇</div>
            : filtrados.map((c) => (
              <button key={c.origem + c.telefone} type="button" onClick={() => { setSel(c); setTelManual(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid var(--line)", background: sel?.telefone === c.telefone ? "#eef2ff" : "transparent", cursor: "pointer", color: "var(--ink)" }}>
                <div><b>{c.nome}</b> <span className="muted" style={{ fontSize: 12 }}>{telBonito(c.telefone)}</span></div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {c.origem === "cliente" ? "📇 Cliente da base" : "📱 WhatsApp"}{c.cidade ? ` · ${c.cidade}${c.uf ? "/" + c.uf : ""}` : ""}
                </div>
              </button>
            ))}
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>ou digite o número (com DDD):</div>
        <input placeholder="Ex.: 35 9 9999-9999" value={telManual} onChange={(e) => { setTelManual(e.target.value); setSel(null); }} style={{ width: "100%", marginBottom: 10 }} />
        <textarea placeholder="Escreva a primeira mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={enviar}>{busy ? "Enviando…" : "📤 Enviar e abrir"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Campanha: escolhe contatos e a IA envia a mensagem aos poucos (anti-ban) ───────
function CampanhaModal({ onFechar }: { onFechar: () => void }) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState("");
  const [intervalo, setIntervalo] = useState("40");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [campanhas, setCampanhas] = useState<{ id: string; nome: string | null; status: string; total: number; enviados: number; pendentes: number; falhas: number }[]>([]);
  function carregarCampanhas() { api.atendCampanhas().then(setCampanhas).catch(() => {}); }
  useEffect(() => {
    Promise.allSettled([api.listarClientesCrm(), api.atendContatosWhatsapp(), api.atendRespostasEmpresa()]).then(([cl, w, emp]) => {
      const lista: Contato[] = []; const vistos = new Set<string>();
      const add = (n: string, tel: string, origem: "cliente" | "whats", cidade?: string | null, uf?: string | null) => {
        const d = (tel || "").replace(/\D/g, ""); if (d.length < 10) return;
        const key = d.slice(-11); if (vistos.has(key)) return; vistos.add(key);
        lista.push({ nome: n || telBonito(d), telefone: d, origem, cidade, uf });
      };
      if (cl.status === "fulfilled") for (const c of cl.value) add(c.nome, c.whatsapp || "", "cliente", c.cidade, c.uf);
      if (w.status === "fulfilled") for (const c of (w.value.contatos || [])) add(c.nome, c.telefone, "whats");
      lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setContatos(lista);
      if (emp.status === "fulfilled") { const conv = emp.value.find((r) => /cadast/i.test(r.titulo)); if (conv) setMensagem(conv.texto); }
    }).finally(() => setCarregando(false));
    carregarCampanhas();
  }, []);
  const CAP_CONTATOS = 1000; // limite de exibição (perf). O resto acha-se pela busca.
  const filtrados = (() => {
    const q = busca.trim().toLowerCase(); if (!q) return contatos.slice(0, CAP_CONTATOS);
    const dig = q.replace(/\D/g, "");
    // Busca por NOME, CIDADE/UF ou NÚMERO — sobre a base TODA (não só os que estão à mostra).
    return contatos.filter((c) =>
      c.nome.toLowerCase().includes(q)
      || (c.cidade || "").toLowerCase().includes(q)
      || (c.uf || "").toLowerCase() === q
      || (dig.length >= 3 && c.telefone.includes(dig))
    ).slice(0, CAP_CONTATOS);
  })();
  const toggle = (tel: string) => setSel((s) => { const n = new Set(s); if (n.has(tel)) n.delete(tel); else n.add(tel); return n; });
  const marcarFiltrados = () => setSel((s) => { const n = new Set(s); filtrados.forEach((c) => n.add(c.telefone)); return n; });
  const limpar = () => setSel(new Set());
  async function criar() {
    if (!mensagem.trim()) { alert("Escreva a mensagem da campanha."); return; }
    if (sel.size === 0) { alert("Selecione pelo menos um contato."); return; }
    if (!confirm(`Criar campanha para ${sel.size} contato(s)? A Big vai enviando 1 a cada ${intervalo}s pra não bloquear o número.`)) return;
    setBusy(true);
    try {
      const alvos = contatos.filter((c) => sel.has(c.telefone)).map((c) => ({ telefone: c.telefone, nome: c.nome }));
      const r = await api.atendCriarCampanha({ nome: nome.trim() || undefined, mensagem: mensagem.trim(), intervalo_seg: Number(intervalo) || 40, alvos });
      if (r.error) { alert(r.error); return; }
      alert(`Campanha criada! ${r.total} contato(s). A Big começa a enviar aos poucos.`);
      setSel(new Set()); setNome(""); carregarCampanhas();
    } catch (e) { alert((e as Error).message || "Não consegui criar a campanha."); } finally { setBusy(false); }
  }
  async function mudarStatus(id: string, status: string) { await api.atendStatusCampanha(id, status).catch(() => {}); carregarCampanhas(); }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 620, width: "min(620px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#0ea5e9,#4f46e5)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">📣 Nova campanha</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
        </div>
        <div className="modal-bd">
          <div className="muted2" style={{ fontSize: 12.5, marginBottom: 8 }}>Escolha os contatos, escreva a mensagem (com o link) e a Big vai enviando <b>aos poucos</b> pra não correr risco de bloqueio.</div>
          <label className="fld full">Nome da campanha (opcional)<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Convite cadastro — agosto" /></label>
          <label className="fld full" style={{ marginTop: 8 }}>Mensagem<textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} placeholder="Escreva a mensagem com o link…" style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }} /></label>
          <label className="fld" style={{ marginTop: 8, display: "inline-flex", flexDirection: "column" }}>Enviar 1 a cada
            <span><input type="number" min={15} max={600} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} style={{ width: 70 }} /> segundos <span className="muted2">(recomendado ≥ 40s)</span></span>
          </label>
          <div style={{ marginTop: 10, marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>Contatos</b>
            <span className="at-chip" style={{ background: "#eef2ff", color: "#4338ca" }}>{sel.size} selecionado(s)</span>
            <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={marcarFiltrados}>Selecionar os {filtrados.length} da busca</button>
            {sel.size > 0 && <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={limpar}>Limpar</button>}
          </div>
          <input placeholder="🔎 Buscar por nome, cidade ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
            {carregando ? <div className="muted" style={{ padding: 12 }}>Carregando contatos…</div>
              : filtrados.length === 0 ? <div className="muted" style={{ padding: 12 }}>Nenhum contato.</div>
              : filtrados.map((c) => (
                <label key={c.origem + c.telefone} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
                  <input type="checkbox" checked={sel.has(c.telefone)} onChange={() => toggle(c.telefone)} />
                  <div><div><b>{c.nome}</b> <span className="muted" style={{ fontSize: 12 }}>{telBonito(c.telefone)}</span></div>
                    <div className="muted2" style={{ fontSize: 11 }}>{c.origem === "cliente" ? "📇 base" : "📱 zap"}{c.cidade ? ` · ${c.cidade}${c.uf ? "/" + c.uf : ""}` : ""}</div></div>
                </label>
              ))}
          </div>
          {!carregando && contatos.length > filtrados.length && (
            <div className="muted2" style={{ fontSize: 11, marginTop: 5 }}>
              Mostrando {filtrados.length} de <b>{contatos.length}</b> contatos. Pra achar qualquer um (inclusive além do que aparece aqui), <b>digite no campo acima</b> — nome, cidade ou número. A busca varre a lista toda. 🔎
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button className="kbtn go" disabled={busy} onClick={criar}>{busy ? "Criando…" : `📣 Criar campanha (${sel.size})`}</button>
          </div>

          {campanhas.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Campanhas</div>
              {campanhas.map((c) => (
                <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 12.5 }}>{c.nome || "Campanha"}</b>
                    <span className="at-chip" style={{ background: c.status === "concluida" ? "#dcfce7" : c.status === "pausada" ? "#fef3c7" : "#e0f2fe", color: "#1e293b", fontSize: 11 }}>{c.status}</span>
                    <span className="muted2" style={{ fontSize: 11.5, marginLeft: "auto" }}>{c.enviados}/{c.total} enviados{c.falhas ? ` · ${c.falhas} falha(s)` : ""}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-soft,#eef2f7)", borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${c.total ? Math.round((c.enviados / c.total) * 100) : 0}%`, background: "#22c55e" }} />
                  </div>
                  {c.status !== "concluida" && (
                    <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                      {c.status === "ativa"
                        ? <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => mudarStatus(c.id, "pausada")}>⏸ Pausar</button>
                        : <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => mudarStatus(c.id, "ativa")}>▶️ Retomar</button>}
                      <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px", color: "#dc2626" }} onClick={() => mudarStatus(c.id, "concluida")}>⏹ Encerrar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
  const [estado, setEstado] = useState("novo");
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length, busy]);

  async function mandar(t?: string) {
    const msg = (t ?? texto).trim();
    if (!msg) return;
    setMsgs((m) => [...m, { de: "cliente", texto: msg }]);
    setTexto(""); setBusy(true);
    try {
      const r = await api.atendEntrada({ telefone: tel, texto: msg });
      if (r.respostas.length === 0) {
        // O robô ficou calado de propósito: um humano assumiu ou a conversa já
        // passou da triagem. Explica e oferece o reinício em vez de tela vazia.
        setMsgs((m) => [...m, { de: "bot", texto: "🤖 (o robô não respondeu — essa conversa já está em atendimento humano ou numa etapa final. Clique em 🔄 Reiniciar pra testar do zero.)" }]);
      } else {
        setMsgs((m) => [...m, ...r.respostas.map((s) => ({ de: "bot" as const, texto: s.texto, arquivo: s.tipo === "arquivo" }))]);
      }
      setEstado(r.estado);
      onMudou();
    } catch (e) { setMsgs((m) => [...m, { de: "bot", texto: "⚠️ " + (e as Error).message }]); }
    finally { setBusy(false); }
  }
  async function reiniciar() {
    setBusy(true);
    try { await api.atendReset(tel); setMsgs([]); setEstado("novo"); onMudou(); }
    catch (e) { setMsgs((m) => [...m, { de: "bot", texto: "⚠️ " + (e as Error).message }]); }
    finally { setBusy(false); }
  }
  // Botões que acompanham a pergunta do robô — o usuário clica em vez de digitar.
  const atalhos: { label: string; val: string }[] = (() => {
    switch (estado) {
      case "novo": return [{ label: "👋 oi", val: "oi" }];
      case "ia-triagem": return [
        { label: "🏪 sou lojista", val: "sou lojista, quero revender" },
        { label: "🧶 quero ver mantas", val: "quero comprar mantas pra minha loja" },
        { label: "🙋 é pra uso pessoal", val: "é pra mim mesmo, uso pessoal" }];
      case "aguardando-setor": return [
        { label: "1️⃣ Vendas", val: "1" }, { label: "2️⃣ Financeiro", val: "2" },
        { label: "3️⃣ Pós-venda", val: "3" }, { label: "4️⃣ Outros", val: "4" }];
      case "triagem-nome": return [{ label: "🏬 Loja Encanto Decor", val: "Loja Encanto Decor" }];
      case "aguardando-cnpj": return [
        { label: "✅ CNPJ válido", val: "11.222.333/0001-81" },
        { label: "🙅 não tenho CNPJ", val: "não tenho, uso pessoal" },
        { label: "🙋 falar com atendente", val: "atendente" }];
      case "aguardando-cidade-parceiro": return [{ label: "📍 Contagem, MG", val: "Contagem, MG" }];
      default: return [];
    }
  })();

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card at-sim" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#25d366,#075e54)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">💬 Simulador — cliente</span></span><span style={{ display: "flex", gap: 8 }}><button className="modal-x" title="Apaga esta conversa de teste e começa do zero" disabled={busy} onClick={reiniciar} style={{ width: "auto", padding: "0 10px", fontSize: 13 }}>🔄 Reiniciar</button><button className="modal-x" onClick={onFechar}>✕</button></span></div>
          <div className="modal-hd-sub">Digite como se fosse o cliente no WhatsApp. Nº: <input className="at-siminput" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        </div>
        <div className="at-simscr">
          {msgs.length === 0 && <div className="muted2" style={{ textAlign: "center", padding: 20 }}>Mande "oi" pra começar o atendimento 👇</div>}
          {msgs.map((m, i) => (
            <div key={i} className={"at-b " + (m.de === "cliente" ? "out" : "in")}>
              {m.de === "bot" && <div className="at-aut">🤖 robô</div>}
              {m.arquivo ? <span className="at-file">📒 {m.texto}</span> : formatarMsg(m.texto)}
            </div>
          ))}
          {busy && (
            <div className="at-b in at-typing">
              <div className="at-aut">🤖 robô</div>
              <span className="at-dot" /><span className="at-dot" /><span className="at-dot" />
            </div>
          )}
          <div ref={fim} />
        </div>
        {atalhos.length > 0 && (
          <div className="at-simatalhos">
            <span className="muted2" style={{ fontSize: 11, alignSelf: "center", marginRight: 2 }}>clique 👉</span>
            {atalhos.map((a) => <span key={a.val} className="fx-pill" onClick={() => !busy && mandar(a.val)}>{a.label}</span>)}
          </div>
        )}
        <div className="at-compose">
          <input placeholder="Mensagem do cliente…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && mandar()} autoFocus />
          <button className="at-send" disabled={busy} onClick={() => mandar()}>➤</button>
        </div>
      </div>
    </div>
  );
}
