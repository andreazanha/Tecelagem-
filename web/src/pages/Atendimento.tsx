import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, type AtendBoard, type AtendConversa, type AtendConversaDetalhe, type ZapiConfig, type Representante, type FunilCardDetalhe, type ChatMensagem, type AtendColuna, type RespostaPronta } from "../api";
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
  const n = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;   // celular (9 dígitos)
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;    // fixo/antigo (8 dígitos)
  return t;
}
// Núcleo do telefone (DDD + últimos 8 dígitos) — mesma pessoa mesmo com/sem o 9º dígito ou o 55.
// Usado pra NÃO repetir o contato na lista da campanha.
function nucleoTel(t: string): string {
  let d = (t || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : d;
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
// Emojis mais usados no atendimento (estilo WhatsApp) — pro seletor do campo de mensagem.
const EMOJIS = "😀 😁 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😗 😋 😎 🤩 🥳 🤗 🤔 🤝 👍 👎 👌 ✌️ 🙏 👏 🙌 💪 👋 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 🔥 ✨ ⭐ 🎉 🎊 🎁 💐 🌹 😅 😌 😏 😴 😅 😢 😭 😔 😟 😕 🙃 😬 😳 🥺 😱 😤 😡 🤦 🤷 💰 🛒 📦 🚚 ✅ ❌ ⚠️ 📌 📎 📷 🎤 ⏰ 📢 🤑 🥂".split(" ");
// Data + hora pro card (fechado): "hoje 09:08", "ontem 17:26" ou "10/08 14:22". Horário de Brasília.
function horaData(iso?: string | null) {
  if (!iso) return "";
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return hora(iso);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  const hhmm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  // Dia (em Brasília) do card e de hoje, pra decidir "hoje/ontem/data".
  const diaBr = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const hojeStr = diaBr(new Date()), cardStr = diaBr(d);
  const ontem = new Date(Date.now() - 864e5);
  if (cardStr === hojeStr) return `hoje ${hhmm}`;
  if (cardStr === diaBr(ontem)) return `ontem ${hhmm}`;
  const dm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dm} ${hhmm}`;
}
// Dia (Brasília) de um timestamp UTC — "DD/MM/AAAA". Usado pra separar mensagens por dia na conversa.
function diaBrasilia(iso?: string | null): string {
  if (!iso) return "";
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
// Rótulo do separador de dia: "Hoje", "Ontem" ou a data.
function rotuloDia(iso?: string | null): string {
  const dia = diaBrasilia(iso);
  if (!dia) return "";
  const hojeD = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const ontemD = new Date(Date.now() - 864e5).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (dia === hojeD) return "Hoje";
  if (dia === ontemD) return "Ontem";
  return dia;
}
const SETOR_EMOJI: Record<string, string> = { vendas: "🛒", financeiro: "💰", "pos-venda": "📦", outros: "💬" };
// Cor fixa por nome (pra o avatar do vendedor ficar sempre com a mesma cor).
function corDoNome(nome: string): string {
  const cores = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  let h = 0; for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return cores[h % cores.length];
}
// Fonte/origem do contato (mostra no card só quando NÃO é WhatsApp direto — pra destacar de onde veio).
const FONTE_LABEL: Record<string, string> = { campanha: "📣 Campanha", catalogo: "📖 Catálogo", reativacao: "🔁 Reativação", manual: "✍️ Manual", instagram: "📸 Instagram", formulario: "📝 Formulário" };
// RELAÇÃO DE COMPRA (jornada) — marcada à mão. É SEPARADA do perfil (lojista/consumidor): um lojista
// pode ainda não ter comprado (Lead). Vira selo no card + seletor no painel da conversa.
const STATUS_CLIENTE: Record<string, { label: string; bg: string; cor: string }> = {
  "lead": { label: "👀 Lead (não comprou)", bg: "#f5f3ff", cor: "#6d28d9" },
  "primeira-compra": { label: "🆕 1ª compra", bg: "#dbeafe", cor: "#1e40af" },
  "recorrente": { label: "🔁 Recorrente", bg: "#dcfce7", cor: "#15803d" },
  "fiel": { label: "⭐ Fiel", bg: "#fef9c3", cor: "#854d0e" },
  "inativo": { label: "💤 Inativo (sumiu)", bg: "#f1f5f9", cor: "#475569" },
};
const STATUS_CLIENTE_ORDEM = ["lead", "primeira-compra", "recorrente", "fiel", "inativo"];

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
  const [busca, setBusca] = useState<string>(""); // busca de conversa no quadro (nome/loja/telefone/cidade)
  const [buscaServ, setBuscaServ] = useState<{ id: string; telefone: string; nome: string | null; contato_nome: string | null; cidade: string | null; uf: string | null; coluna: string; ultima_msg: string | null }[] | null>(null);
  const [buscandoServ, setBuscandoServ] = useState(false);
  async function buscarNoServidor() {
    const q = busca.trim();
    if (q.length < 2) return;
    setBuscandoServ(true);
    try { const r = await api.atendBuscarTudo(q); setBuscaServ(r.resultados); } catch { setBuscaServ([]); } finally { setBuscandoServ(false); }
  }
  const [membros, setMembros] = useState<string[]>([]); // equipe (chat interno)
  const [chatCom, setChatCom] = useState<string | null>(null); // membro com quem estou conversando
  const [dmResumo, setDmResumo] = useState<{ outro: string; ultima_em: string; ultimo_autor: string; nao_lido: boolean }[]>([]);
  const eu = getUser()?.nome || "";
  const canalDM = (o: string) => "dm:" + [eu, o].sort().join("|");
  useEffect(() => { api.contatosChat().then(setMembros).catch(() => {}); }, []);
  useEffect(() => {
    if (!eu) return;
    let carregando = false; // não empilha (rede lenta)
    const carregar = () => { if (carregando) return; carregando = true; api.dmResumoChat(eu).then(setDmResumo).catch(() => {}).finally(() => { carregando = false; }); };
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
    let marcando = false; // não empilha POSTs de "lido" em rede lenta
    const marcar = () => { if (marcando) return; marcando = true; api.marcarLidoChat(eu, canalDM(chatCom)).catch(() => {}).finally(() => { marcando = false; }); };
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
    movePend.current.set(id, coluna); movePendSince.current.set(id, Date.now()); // segura o card no lugar até confirmar
    setBoard((b) => (b ? { ...b, conversas: b.conversas.map((x) => (x.id === id ? { ...x, coluna, coluna_manual: coluna } : x)) } : b));
    try { await api.atendMoverColuna(id, coluna); }
    catch { movePend.current.delete(id); movePendSince.current.delete(id); alert("Não consegui mover o card agora. Verifique a conexão e tente de novo."); }
    recarregar();
  }
  // Card "aguardando": cliente escreveu depois da nossa última resposta (ou nunca respondemos)
  // E o atendimento não foi encerrado depois disso. Encerrar para de piscar sem mandar nada.
  // Pisca verde SÓ enquanto o cliente está esperando: a última mensagem é DELE (entrada mais
  // recente que a nossa saída) e a conversa não foi encerrada depois. Se a última mensagem for
  // NOSSA (já respondemos), para de piscar.
  const aguardando = (c: AtendConversa) => !!c.ultima_in_em && (c.ultima_in_em || "") > (c.ultima_out_em || "") && (c.ultima_in_em || "") > (c.encerrado_em || "");
  // Card em TRIAGEM com cliente ativo (a IA está atendendo): TAMBÉM pisca — pra o time VER toda
  // conversa em triagem e poder entrar (o lead não fica "preso" com a IA sem vocês saberem).
  // Não pisca autorresposta de campanha (é robô de loja, não gente). Silenciar tira o piscar.
  const emTriagemAtiva = (c: AtendConversa) => c.coluna === "triagem" && c.origem !== "campanha" && !!c.ultima_in_em && (c.ultima_in_em || "") > (c.encerrado_em || "");
  // GRUPO nunca pisca (mensagem o tempo todo): detecta pelo estado/origem — não só pela coluna, porque
  // um grupo com msg nova o sistema joga pra "Aguardando humano" e aí voltava a piscar. Assim o grupo
  // importante continua RECEBENDO (não é silenciar), só não fica piscando.
  const ehGrupoCard = (c: AtendConversa) => c.estado === "grupo" || c.origem === "grupo" || c.coluna === "grupos";
  // A coluna "Campanhas" também nunca pisca: é autorresposta de loja (robô), não gente esperando.
  // (Quando um card de campanha vira atendimento de verdade, sai pra "Aguardando humano" e aí sim pisca.)
  // AGUARDANDO HUMANO: pisca SEMPRE enquanto está nessa fila — mesmo que a ÚLTIMA mensagem tenha sido
  // da IA (a saudação/transferência da triagem). Antes, essa saída da IA fazia o card parar de piscar
  // sem ninguém ter atendido. Só para quando um humano RESPONDE (o card sai pra "Em atendimento"),
  // quando você silencia (🔕) ou encerra. Assim nenhum lead transferido fica esquecido sem piscar.
  const emEsperaHumano = (c: AtendConversa) => c.coluna === "aguardando-humano";
  const pulsaVerde = (c: AtendConversa) => !c.silenciado && !ehGrupoCard(c) && c.coluna !== "campanha" && (aguardando(c) || emTriagemAtiva(c) || emEsperaHumano(c));

  // Busca do quadro: um card "bate" com a busca por nome/loja/cidade/UF/representante ou pelo telefone
  // (a partir de 3 dígitos). Vazio = mostra todos.
  const casaBusca = (c: AtendConversa) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const texto = [c.contato_nome, c.nome, c.cidade, c.uf, c.representante, c.setor].filter(Boolean).join(" ").toLowerCase();
    if (texto.includes(q)) return true;
    // Busca por NÚMERO: pega só os dígitos e compara ignorando o "55" (país) e o 9º dígito, pra
    // achar em qualquer formato — com/sem DDI, com/sem o 9, com ou sem parênteses/traço.
    const dig = q.replace(/\D/g, "");
    if (dig.length >= 3) {
      const alvo = dig.replace(/^55/, "");
      const tel = (c.telefone || "").replace(/\D/g, "").replace(/^55/, "");
      if (tel.includes(alvo) || nucleoTel(c.telefone || "").includes(nucleoTel(dig))) return true;
    }
    return false;
  };

  // Agrupa as conversas por coluna UMA vez por render (já filtrado por busca/vendedor e ordenado),
  // em vez de refazer 3 filtros × cada coluna × 2 laços a cada atualização (4s) — pesava no tablet.
  const gruposPorColuna = useMemo(() => {
    const m = new Map<string, AtendConversa[]>();
    if (!board) return m;
    const passaFiltro = (c: AtendConversa) => casaBusca(c) && (filtroAtend === "todos" ? true : filtroAtend === "__robo" ? !c.responsavel : c.responsavel === filtroAtend);
    for (const c of board.conversas) {
      if (!passaFiltro(c)) continue;
      const arr = m.get(c.coluna); if (arr) arr.push(c); else m.set(c.coluna, [c]);
    }
    for (const arr of m.values()) arr.sort((a, b) =>
      (Number(aguardando(b)) - Number(aguardando(a))) ||
      (b.ultima_in_em || "").localeCompare(a.ultima_in_em || "") ||
      (b.atualizado_em || "").localeCompare(a.atualizado_em || "")
    );
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, busca, filtroAtend]);

  // Fotos de perfil dos cards (busca só os primeiros e guarda em cache pra não pesar).
  const fotoCache = useRef<Record<string, string | null>>({});
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({}); // p/ pular pra coluna no mobile
  const [, setFotosV] = useState(0);
  // Busca as fotos de perfil de TODOS os contatos — numa fila persistente (uma por vez, com uma
  // folga pra não sobrecarregar a Z-API). Cada foto é buscada só UMA vez e fica em cache; a fila
  // NÃO é cancelada a cada refresh do quadro, então as fotos não "somem" mais no meio do caminho.
  const filaFoto = useRef<string[]>([]);
  const buscandoFotos = useRef(false);
  useEffect(() => {
    if (!board) return;
    const naFila = new Set(filaFoto.current);
    for (const c of board.conversas) {
      // Foto já veio em cache do servidor → mostra NA HORA (não some no reload).
      if (c.foto_url && !(c.id in fotoCache.current)) fotoCache.current[c.id] = c.foto_url;
      if (!(c.id in fotoCache.current) && !naFila.has(c.id)) { filaFoto.current.push(c.id); naFila.add(c.id); }
    }
    if (buscandoFotos.current || !filaFoto.current.length) return;
    buscandoFotos.current = true;
    (async () => {
      while (filaFoto.current.length) {
        const cid = filaFoto.current.shift()!;
        if (cid in fotoCache.current) continue;
        try { const r = await api.atendFotoPerfil(cid); fotoCache.current[cid] = r.link || null; if (r.link) setFotosV((v) => v + 1); }
        catch { fotoCache.current[cid] = null; }
        await new Promise((res) => setTimeout(res, 120));
      }
      buscandoFotos.current = false;
    })();
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

  // Agendamentos "Chamar IA" recém-feitos: guarda o valor esperado (id → ms | null) até o
  // servidor refletir. Assim um refresh que chegou ANTES do POST persistir não desfaz o
  // movimento do card pra coluna de follow-up (a corrida que fazia o card "voltar").
  const agendaPend = useRef<Map<string, number | null>>(new Map());
  const agendaPendSince = useRef<Map<string, number>>(new Map()); // p/ o TTL: nunca prender o card pra sempre
  const movePend = useRef<Map<string, string>>(new Map());        // id → coluna alvo (arrasto otimista)
  const movePendSince = useRef<Map<string, number>>(new Map());
  const PEND_TTL_MS = 15000; // se o servidor não confirmar em 15s, desiste do otimista (evita card preso)
  const recarregandoRef = useRef(false); // evita EMPILHAR polls quando a rede está lenta (tablet travava)
  function recarregar() {
    // Se o poll anterior ainda não voltou (rede lenta do tablet), NÃO dispara outro por cima —
    // era isso que empilhava requisições e travava o aparelho. Espera o atual terminar.
    if (recarregandoRef.current) return;
    recarregandoRef.current = true;
    const u = getUser();
    api.atendBoard(u?.nome, ehGestorAtend()).then((bd) => {
      const agora = Date.now();
      const pend = agendaPend.current, pendSince = agendaPendSince.current;
      const mv = movePend.current, mvSince = movePendSince.current;
      if (pend.size || mv.size) {
        bd = { ...bd, conversas: bd.conversas.map((c) => {
          let cc = c;
          // "Chamar IA" agendado (otimista): mantém o card em follow-up até o servidor confirmar.
          if (pend.has(cc.id)) {
            const want = pend.get(cc.id) ?? null;
            const has = cc.agendado_ia ?? null;
            const igual = want ? (!!has && Math.abs(Number(has) - want) < 1000) : !has;
            const expirou = agora - (pendSince.get(cc.id) ?? agora) > PEND_TTL_MS; // TTL: nunca prende pra sempre
            if (igual || expirou) { pend.delete(cc.id); pendSince.delete(cc.id); }
            else cc = { ...cc, agendado_ia: want, coluna: want ? "contato-followup" : cc.coluna };
          }
          // Arrasto de coluna (otimista): mantém o card na coluna alvo até o servidor refletir —
          // era o poll chegando ANTES do POST persistir que fazia o card "voltar e pular".
          if (mv.has(cc.id)) {
            const alvo = mv.get(cc.id)!;
            const expirou = agora - (mvSince.get(cc.id) ?? agora) > PEND_TTL_MS;
            if (cc.coluna === alvo || expirou) { mv.delete(cc.id); mvSince.delete(cc.id); }
            else cc = { ...cc, coluna: alvo, coluna_manual: alvo };
          }
          return cc;
        }) };
      }
      setBoard(bd);
    }).catch(() => {}).finally(() => { recarregandoRef.current = false; });
  }
  // Marca/desmarca o lembrete de um card (deixa pulsando pra não esquecer de falar com o lead).
  async function toggleLembrete(id: string) {
    setBoard((b) => (b ? { ...b, conversas: b.conversas.map((c) => (c.id === id ? { ...c, lembrete: c.lembrete ? 0 : 1 } : c)) } : b));
    try { await api.atendLembrete(id); } catch { recarregar(); }
  }
  // "Chamar IA": agenda (ou cancela) a saudação automática pro dia/horário escolhido.
  // Ao agendar, já MOVE o card pra coluna "⏰ Contato follow-up" na hora (sem esperar o refresh).
  async function agendarIa(id: string, quando: number | null, mensagem?: string) {
    agendaPend.current.set(id, quando); agendaPendSince.current.set(id, Date.now());
    setBoard((b) => (b ? { ...b, conversas: b.conversas.map((c) => (c.id === id ? { ...c, agendado_ia: quando, agendado_msg: mensagem ?? null, coluna: quando ? "contato-followup" : c.coluna } : c)) } : b));
    try { await api.atendAgendarIa(id, quando, mensagem); } catch { agendaPend.current.delete(id); agendaPendSince.current.delete(id); }
    recarregar();
  }
  async function juntarDuplicados() {
    if (!confirm("Juntar os cards duplicados do mesmo contato (número com/sem o 9º dígito)?\n\nO histórico é preservado no card mais antigo e os repetidos são removidos.")) return;
    try { const r = await api.atendJuntarDuplicados(); alert(r.mesclados ? `✓ ${r.mesclados} contato(s) juntados, ${r.removidos} card(s) duplicado(s) removido(s).` : "Nenhum duplicado encontrado. 👍"); recarregar(); }
    catch { alert("Não consegui juntar os duplicados agora. Tente de novo."); }
  }
  const [cruzando, setCruzando] = useState(false);
  async function cruzarBase() {
    setCruzando(true);
    try {
      const r = await api.atendCruzarBase();
      const p: string[] = [];
      if (r.ligados) p.push(`${r.ligados} ligado(s) à base de clientes (nome/CNPJ/cidade)`);
      if (r.nomes) p.push(`${r.nomes} nome(s) puxado(s) da agenda do WhatsApp`);
      alert(p.length ? "✓ " + p.join("\n✓ ") : "Nada novo pra preencher — já está tudo cruzado. 👍");
      recarregar();
    }
    catch { alert("Não consegui cruzar com a base agora. Tente de novo."); }
    finally { setCruzando(false); }
  }
  function checarConexao() { api.atendConfig().then((c) => setConectado(c.zapi_ativo && !!c.zapi_instance && !!c.zapi_token)).catch(() => setConectado(false)); }
  useEffect(() => {
    recarregar(); checarConexao();
    const t = setInterval(recarregar, 4000);
    // O navegador CONGELA o timer quando a aba fica em segundo plano — por isso "às vezes" a
    // mensagem só aparecia depois. Ao voltar pra aba (ou focar a janela), atualiza NA HORA.
    const aoVoltar = () => { if (!document.hidden) { recarregar(); checarConexao(); try { audioRef.current?.resume?.(); } catch { /* ok */ } } };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); window.removeEventListener("focus", aoVoltar); };
  }, []);

  // Libera o áudio no primeiro clique (política de autoplay) e pede permissão de notificação.
  useEffect(() => {
    const liberar = () => {
      if (!audioRef.current) { try { audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* sem áudio */ } }
      audioRef.current?.resume?.();
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
      window.removeEventListener("touchstart", liberar);
    };
    window.addEventListener("pointerdown", liberar);
    window.addEventListener("keydown", liberar);
    window.addEventListener("touchstart", liberar);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    return () => { window.removeEventListener("pointerdown", liberar); window.removeEventListener("keydown", liberar); window.removeEventListener("touchstart", liberar); };
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
    // Toca o som/aviso mesmo em card "não pisca": parar de piscar é só VISUAL, a notificação continua
    // (foi o pedido do Pedro). Só GRUPO fica sem som (é barulhento demais e já não pisca).
    for (const c of board.conversas) { if (ehGrupoCard(c)) continue; const t = c.ultima_in_em || ""; if (t > maxIn) maxIn = t; }
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
          <button className="btn btn-soft" onClick={() => setMudo((m) => { const n = !m; localStorage.setItem("atend-mudo", n ? "1" : "0"); if (!n) { try { if (!audioRef.current) audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* ok */ } audioRef.current?.resume?.(); setTimeout(() => tocarDing(), 60); } return n; })} title={mudo ? "Som desligado — clique para ligar (toca um teste)" : "Toca um som quando chega mensagem nova. Clique para desligar."}>{mudo ? "🔕 Som off" : "🔔 Som on"}</button>
          <button className="btn btn-primary" onClick={() => setNovaConv(true)}>➕ Nova conversa</button>
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setEquipeOpen(true)}>👥 Equipe</button>}
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setCampanhaOpen(true)}>📣 Campanha</button>}
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setCfgOpen(true)}>⚙️ Conexão</button>}
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setSim(true)}>💬 Simular cliente</button>}
          {ehGestorAtend() && <button className="btn btn-soft" onClick={juntarDuplicados} title="Junta cards repetidos do mesmo contato (número com/sem o 9º dígito) num só, preservando o histórico">🧹 Juntar duplicados</button>}
          {ehGestorAtend() && <button className="btn btn-soft" disabled={cruzando} onClick={cruzarBase} title="Liga os contatos à base de clientes E puxa os nomes salvos na sua agenda do WhatsApp (preenche nome/CNPJ/cidade/UF sozinho). O sistema também faz isso automático 3x/dia.">{cruzando ? "Cruzando…" : "🔗 Cruzar com a base"}</button>}
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

      {/* Busca de conversa no quadro: filtra os cards por nome, loja, telefone ou cidade. */}
      {board && (() => {
        const q = busca.trim().toLowerCase();
        const dig = q.replace(/\D/g, "");
        const total = q ? board.conversas.filter((c) => casaBusca(c)).length : 0;
        return (
          <div style={{ position: "relative", marginBottom: 10, maxWidth: 460 }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.6, pointerEvents: "none" }}>🔎</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa por nome, loja, telefone ou cidade…"
              style={{ width: "100%", padding: "9px 34px 9px 32px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5 }} />
            {busca && <button onClick={() => setBusca("")} title="Limpar" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, cursor: "pointer", fontSize: 15, opacity: 0.6, lineHeight: 1 }}>✕</button>}
            {q && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{total} conversa(s) no quadro{dig.length >= 3 ? "" : ""} — <button onClick={buscarNoServidor} disabled={buscandoServ || busca.trim().length < 2} style={{ background: "transparent", border: 0, color: "var(--accent,#2563eb)", fontWeight: 700, cursor: "pointer", fontSize: 11.5, padding: 0, textDecoration: "underline" }}>{buscandoServ ? "procurando…" : "🔎 procurar em TODAS as conversas"}</button></div>}
            {buscaServ && (
              <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 6, background: "var(--card,#fff)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 12px 32px #0003", zIndex: 30, maxHeight: 380, overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
                  <b>{buscaServ.length} resultado(s) no servidor</b>
                  <button onClick={() => setBuscaServ(null)} style={{ background: "transparent", border: 0, cursor: "pointer", fontSize: 15, opacity: 0.6 }}>✕</button>
                </div>
                {buscaServ.length === 0 && <div className="muted2" style={{ padding: 12, fontSize: 12.5 }}>Nada encontrado. Confere o nome ou o número.</div>}
                {buscaServ.map((r) => {
                  const lbl = board.colunas.find((x) => x.id === r.coluna)?.label || r.coluna;
                  return (
                    <button key={r.id} onClick={() => { setAbrir(r.id); setBuscaServ(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: 0, borderTop: "1px solid var(--line)", background: "transparent", cursor: "pointer" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.contato_nome || r.nome || telBonito(r.telefone)} <span className="muted" style={{ fontWeight: 400 }}>· {telBonito(r.telefone)}</span></div>
                      <div className="muted2" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {lbl}{r.ultima_msg ? " · " + r.ultima_msg : ""}</div>
                    </button>
                  );
                })}
              </div>
            )}
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
            const n = (gruposPorColuna.get(col.id) || []).length;
            return (
              <button key={col.id} className="fx-colnav-chip" onClick={() => colRefs.current[col.id]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}>
                <span className="fx-dot" style={{ background: col.cor }} />{col.label}{n > 0 && <b>{n}</b>}
              </button>
            );
          })}
        </div>
        <div className="fx-board at-board">
          {board.colunas.map((col) => {
            const cs = gruposPorColuna.get(col.id) || [];
            return (
              <div className={"fx-col" + (sobre === col.id ? " drag-over" : "")} key={col.id} data-coluna={col.id} ref={(el) => { colRefs.current[col.id] = el; }}>
                <div className="fx-hd"><span className="fx-dot" style={{ background: col.cor }} />{col.label}<span className="ct">{cs.length}</span></div>
                <div className="fx-col-body">
                  {cs.map((c) => (
                    <ConvMini key={c.id} c={c} foto={fotoCache.current[c.id] || undefined} colunas={board.colunas} onMover={(colId) => soltarConversa(colId, c.id)} pulsando={pulsaVerde(c)} arrastando={arrastando === c.id}
                      onAbrir={() => { if (arrastou.current) { arrastou.current = false; return; } setAbrir(c.id); }}
                      onLembrete={() => toggleLembrete(c.id)}
                      onAgendar={(quando, mensagem) => agendarIa(c.id, quando, mensagem)}
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
      await api.atendSalvarConfig({ zapi_base: cfg.zapi_base, zapi_instance: cfg.zapi_instance, zapi_token: cfg.zapi_token, zapi_client_token: cfg.zapi_client_token, zapi_ativo: cfg.zapi_ativo, atendimento_ativo: cfg.atendimento_ativo, atendimento_ia: cfg.atendimento_ia, ia_prompt: cfg.ia_prompt, catalogo_url: cfg.catalogo_url, catalogo_senha: cfg.catalogo_senha, catalogo_msg: cfg.catalogo_msg, followup_ativo: cfg.followup_ativo, followup_hora_ini: cfg.followup_hora_ini, followup_hora_fim: cfg.followup_hora_fim, followup_domingo: cfg.followup_domingo, followup_ia: cfg.followup_ia, pos_venda_ativo: cfg.pos_venda_ativo, pos_venda_dias: cfg.pos_venda_dias, recompra_ativo: cfg.recompra_ativo, recompra_dias: cfg.recompra_dias, reativacao_ativo: cfg.reativacao_ativo, reativacao_dias: cfg.reativacao_dias, reativacao_limite: cfg.reativacao_limite, reativacao_intervalo_seg: cfg.reativacao_intervalo_seg, reativacao_msg: cfg.reativacao_msg, aniversario_ativo: cfg.aniversario_ativo, aniversario_msg: cfg.aniversario_msg, catalogo_evento_token: cfg.catalogo_evento_token, catalogo_log_url: cfg.catalogo_log_url });
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

            <div style={{ border: "1px solid #fbcfe8", background: "#fdf2f8", color: "#1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>🎂 Parabéns de aniversário</div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={cfg.aniversario_ativo} onChange={(e) => set("aniversario_ativo", e.target.checked)} /> Ativar — manda parabéns no aniversário do cliente
              </label>
              <label className="campo" style={{ margin: "8px 0 0" }}><span className="campo-label">Mensagem (use {"{nome}"})</span>
                <textarea rows={2} value={cfg.aniversario_msg} onChange={(e) => set("aniversario_msg", e.target.value)} placeholder={cfg.aniversario_msg_padrao} /></label>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Todo dia de manhã, manda a mensagem pros clientes que fazem aniversário no dia (precisa da <b>data de nascimento</b> preenchida no cadastro do cliente). Envia 1× por cliente, espaçado.</div>
            </div>

            <div style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>✅ Mensagem de encerramento</div>
              <label className="campo" style={{ margin: 0 }}><span className="campo-label">Enviada ao cliente quando o atendimento é encerrado (use {"{nome}"})</span>
                <textarea rows={2} value={cfg.encerramento_msg} onChange={(e) => set("encerramento_msg", e.target.value)} placeholder={cfg.encerramento_msg_padrao} /></label>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Ao clicar em <b>Encerrar atendimento</b>, o cliente recebe essa mensagem (aparece na conversa com ✓). Não é enviada em grupos. Deixe em branco pra usar o texto padrão mostrado acima.</div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, marginTop: 10 }}>
                <input type="checkbox" checked={cfg.fechar_inativos_ativo} onChange={(e) => set("fechar_inativos_ativo", e.target.checked)} /> Encerrar automaticamente quem ficar <b>24h sem conversa</b> (e mandar essa despedida)
              </label>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Só fecha cards em <b>atendimento humano</b> parados há 24h. <b>Não</b> mexe em grupos, reclamações, clientes finais, nem em <b>Montando pedido / Orçando</b> (venda em andamento). Roda algumas vezes ao dia, em horário comercial.</div>
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

// Converte um AudioBuffer (já decodificado) num WAV 16-bit LIMPO, em MONO e 16 kHz (voz). Regravar
// assim: (1) conserta arquivos que o <audio> nativo recusava; (2) deixa o arquivo LEVE (16 kHz mono
// ≈ 32 KB/s) — em 48 kHz estéreo um áudio de poucos minutos passava dos 40 MB e dava "muito grande".
function audioBufferParaWav(buf: AudioBuffer): ArrayBuffer {
  const outRate = 16000;
  const inRate = buf.sampleRate;
  const numCh = buf.numberOfChannels || 1;
  const inLen = buf.length;
  // 1) Downmix pra MONO.
  const mono = new Float32Array(inLen);
  for (let c = 0; c < numCh; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < inLen; i++) mono[i] += ch[i] / numCh;
  }
  // 2) Reamostra pra 16 kHz (interpolação linear) — só se a taxa de entrada for maior.
  let data: Float32Array, rate: number;
  if (inRate > outRate) {
    const ratio = inRate / outRate;
    const outLen = Math.floor(inLen / ratio);
    data = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio, i0 = Math.floor(pos), frac = pos - i0;
      const a = mono[i0] || 0, b = mono[i0 + 1] ?? a;
      data[i] = a + (b - a) * frac;
    }
    rate = outRate;
  } else { data = mono; rate = inRate; }
  // 3) Escreve WAV 16-bit mono.
  const dataSize = data.length * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const wstr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); wstr(8, "WAVE");
  wstr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wstr(36, "data"); view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return ab;
}
// Áudio (nota de voz). DECODIFICA com Web Audio (abre arquivos que o <audio> engasga), REGRAVA num
// WAV limpo e entrega pro PLAYER NATIVO do navegador — que cuida de tocar, da barra e do tempo SOZINHO
// (mais confiável que qualquer player que eu desenhe). Damos largura suficiente pra não virar "bola".
// Cache do WAV já decodificado por URL de origem: a conversa recarrega a cada 5s e você rola a
// lista o tempo todo — sem cache, cada áudio era RE-BAIXADO e RE-DECODIFICADO toda vez (pesado no
// tablet) e ainda vazava blobs. Com o cache, decodifica UMA vez e reaproveita.
const wavCache = new Map<string, string>();
function AudioMsg({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [src, setSrc] = useState<string | null>(() => wavCache.get(url) ?? null);
  const [erro, setErro] = useState<string>("");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisivel(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisivel(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visivel) return;
    const cached = wavCache.get(url);
    if (cached) { setSrc(cached); return; } // já decodificado antes → reaproveita na hora
    let vivo = true;
    (async () => {
      let ctx: AudioContext | null = null;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("http " + r.status);
        const ab = await r.arrayBuffer();
        if (!ab.byteLength) throw new Error("vazio");
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        const audioBuf = await ctx.decodeAudioData(ab.slice(0));
        const wav = audioBufferParaWav(audioBuf);
        const bu = wavCache.get(url) ?? URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
        wavCache.set(url, bu); // guarda no cache (fica pela vida da página; não revoga pra poder reusar)
        if (vivo) setSrc(bu);
      } catch { if (vivo) setErro("não abriu"); }
      finally { if (ctx) ctx.close().catch(() => {}); }
    })();
    return () => { vivo = false; };
  }, [visivel, url]);

  // Player CUSTOM estilo WhatsApp (bolinha verde + ondinha + tempo). A reprodução usa um <audio>
  // ESCONDIDO (confiável); a barrinha só reflete o estado dele. Assim fica com a cara do WhatsApp
  // sem perder a robustez de tocar que a gente sofreu pra acertar.
  const aud = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  // Ondinha: alturas fixas (determinísticas) — só pra visual, como o WhatsApp faz.
  const barras = [38, 62, 45, 80, 55, 90, 48, 70, 40, 85, 52, 66, 44, 78, 58, 92, 46, 72, 50, 84, 42, 68, 56, 60];
  const pct = dur > 0 ? cur / dur : 0;
  function fmt(s: number) { const t = Math.max(0, Math.floor(s || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; }
  function toggle() { const a = aud.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); }
  function buscar(i: number) { const a = aud.current; if (!a || !dur) return; a.currentTime = Math.min(dur, (i / barras.length) * dur); }
  return (
    <div ref={ref} style={{ maxWidth: 260 }}>
      {src
        ? <div className="at-audio">
            <button className="at-audio-play" onClick={toggle} aria-label={tocando ? "Pausar" : "Tocar"}>
              {tocando
                ? <svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>
                : <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <div className="at-audio-wave">
              {barras.map((h, i) => <i key={i} className={(i + 0.5) / barras.length <= pct ? "on" : ""} style={{ height: h + "%" }} onClick={() => buscar(i)} />)}
            </div>
            <span className="at-audio-time">{tocando || cur > 0 ? fmt(cur) : fmt(dur)}</span>
            <audio ref={aud} src={src} preload="metadata" style={{ display: "none" }}
              onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d)) setDur(d); }}
              onTimeUpdate={(e) => setCur(e.currentTarget.currentTime || 0)}
              onPlay={() => setTocando(true)} onPause={() => setTocando(false)}
              onEnded={() => { setTocando(false); setCur(0); }} />
          </div>
        : <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(148,163,184,.16)", borderRadius: 12, padding: "9px 12px", fontSize: 12.5, color: "var(--muted,#64748b)" }}>
            <span style={{ fontSize: 15 }}>🎤</span> {erro ? "não consegui abrir o áudio aqui" : "carregando áudio…"}
          </div>}
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

// Data local "YYYY-MM-DD" e hora local "HH:MM" — pros seletores fáceis do "Chamar IA".
function dataLocalStr(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}
function horaLocalStr(ms: number): string {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Rótulo curto "05/08 às 09:00" pro agendamento.
function agendadoLabel(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Baixa uma foto/documento da conversa. Os arquivos são do mesmo domínio
// (/api/atendimento/arquivo/…), então o atributo download força o salvamento; se for de outra
// origem (campanha etc.), abre em nova aba pra salvar. Nome do arquivo = final da URL (já com extensão).
function baixarArquivo(url: string) {
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = (url.split("/").pop() || "arquivo").split("?")[0];
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch { window.open(url, "_blank"); }
}
// Horários "de bater o olho e clicar" (horário comercial).
const HORAS_AG = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
function ConvMini({ c, foto, colunas, onMover, onAbrir, onLembrete, onAgendar, pulsando, arrastando, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { c: AtendConversa; foto?: string; colunas?: AtendColuna[]; onMover?: (colId: string) => void; onAbrir: () => void; onLembrete?: () => void; onAgendar?: (quando: number | null, mensagem?: string) => void; pulsando?: boolean; arrastando?: boolean; onPointerDown?: (e: RPointerEvent) => void; onPointerMove?: (e: RPointerEvent) => void; onPointerUp?: (e: RPointerEvent) => void; onPointerCancel?: (e: RPointerEvent) => void }) {
  const humano = c.estado === "atendimento-humano";
  const [agOpen, setAgOpen] = useState(false);
  const [agDia, setAgDia] = useState("");   // "YYYY-MM-DD"
  const [agHora, setAgHora] = useState(""); // "HH:MM"
  const [agMsg, setAgMsg] = useState("");   // mensagem própria (opcional)
  const [agRespostas, setAgRespostas] = useState<RespostaPronta[]>([]); // respostas prontas p/ escolher no agendamento
  useEffect(() => {
    if (!agOpen || agRespostas.length) return; // carrega só quando abre a telinha (e uma vez)
    Promise.allSettled([api.atendRespostasEmpresa(), api.atendRespostas()]).then(([e, m]) => {
      const emp = e.status === "fulfilled" ? e.value : [];
      const min = m.status === "fulfilled" ? m.value : [];
      setAgRespostas([...emp, ...min].filter((r) => r.texto.trim())); // só as que têm TEXTO (agendamento manda texto)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agOpen]);
  // No card: nome da PESSOA em cima (quem está no WhatsApp) e, embaixo, o nome da LOJA.
  // Se só um dos dois existe, ele vira a linha de cima sozinho (sem duplicar embaixo).
  const pessoa = c.contato_nome || c.nome || telBonito(c.telefone);
  const loja = c.contato_nome && c.nome && c.nome !== c.contato_nome ? c.nome : "";
  const lembrete = !!c.lembrete;
  // Faixa colorida na lateral esquerda = cor da coluna onde o card está (só quando não está
  // piscando/lembrete, que já têm cor própria de destaque).
  const corColuna = colunas?.find((col) => col.id === c.coluna)?.cor;
  const cidadeUf = [c.cidade, c.uf].filter(Boolean).join("/");
  const linhaLoja = [loja ? `🏬 ${loja}` : "", cidadeUf].filter(Boolean).join(" · ");
  return (
    <div className={"fx-card" + (pulsando || lembrete ? " pulsando" : "") + (lembrete ? " lembrete" : "")}
      style={{ ...(arrastando ? { opacity: 0.5 } : {}), ...(!pulsando && !lembrete && corColuna ? { borderLeftColor: corColuna } : {}) }}
      onClick={onAbrir} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div className="conv-av" style={foto ? { backgroundImage: `url(${foto})`, backgroundSize: "cover", backgroundPosition: "center", color: "transparent" } : undefined}>{foto ? "" : iniciais(pessoa)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="fx-nm">{pessoa}</div>
          {linhaLoja && <div className="fx-sub">{linhaLoja}</div>}
          <div className="fx-tel">📞 {telBonito(c.telefone)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "0 0 auto" }}>
          {onAgendar && (
            <button onClick={(e) => { e.stopPropagation(); const base = c.agendado_ia || (Date.now() + 3600e3); setAgDia(dataLocalStr(base)); setAgHora(c.agendado_ia ? horaLocalStr(base) : "09:00"); setAgMsg(c.agendado_msg || ""); setAgOpen((v) => !v); }} onPointerDown={(e) => e.stopPropagation()}
              title={c.agendado_ia ? (c.agendado_enviado ? "IA já chamou — aguardando o cliente responder" : `IA vai chamar em ${agendadoLabel(c.agendado_ia)}`) : "Chamar IA — agendar uma saudação (bom dia/boa tarde) pra um dia e horário"}
              style={{ background: c.agendado_ia ? "#dbeafe" : "transparent", border: "1px solid " + (c.agendado_ia ? "#60a5fa" : "var(--line)"), color: c.agendado_ia ? "#1d4ed8" : "var(--muted)", borderRadius: 8, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "5px 7px" }}>⏰</button>
          )}
          {onLembrete && (
            <button onClick={(e) => { e.stopPropagation(); onLembrete(); }} onPointerDown={(e) => e.stopPropagation()}
              title={lembrete ? "Lembrete ativo — clique pra tirar (o card para de pulsar)" : "Lembrar de falar com esse lead (deixa o card pulsando)"}
              style={{ background: lembrete ? "#facc15" : "transparent", border: "1px solid " + (lembrete ? "#eab308" : "var(--line)"), color: lembrete ? "#713f12" : "var(--muted)", borderRadius: 8, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "5px 7px" }}>🔔</button>
          )}
        </div>
      </div>
      {onAgendar && agOpen && (() => {
        const hoje = dataLocalStr(Date.now()), amanha = dataLocalStr(Date.now() + 864e5);
        const ms = agDia && agHora ? new Date(`${agDia}T${agHora}`).getTime() : 0;
        const valido = !!ms && !isNaN(ms) && ms > Date.now();
        // Modal centralizado via PORTAL (renderiza no <body>): assim não é "cortado" por nenhum
        // ancestral com transform/overflow (o card/coluna), que antes prendia o position:fixed.
        return createPortal((
          <div onClick={(e) => { e.stopPropagation(); setAgOpen(false); }} onPointerDown={(e) => e.stopPropagation()}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 340, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--card, #fff)", color: "var(--ink)", display: "grid", gap: 10, boxShadow: "0 12px 32px rgba(0,0,0,.3)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>⏰ Quando a IA deve chamar {pessoa}?</div>
                <button onClick={() => setAgOpen(false)} title="Fechar"
                  style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 2 }}>✕</button>
              </div>
              {/* Dia: atalhos Hoje/Amanhã + calendário simples pra outro dia */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button className={"at-chip" + (agDia === hoje ? " on" : "")} onClick={() => setAgDia(hoje)}>Hoje</button>
                <button className={"at-chip" + (agDia === amanha ? " on" : "")} onClick={() => setAgDia(amanha)}>Amanhã</button>
                <input className="at-dt" type="date" value={agDia} min={hoje} onChange={(e) => setAgDia(e.target.value)}
                  style={{ fontSize: 13, padding: "5px 7px", borderRadius: 8, border: "1px solid var(--line)", flex: 1, minWidth: 130 }} />
              </div>
              {/* Hora: é só clicar no horário */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                {HORAS_AG.map((h) => (
                  <button key={h} className={"at-chip" + (agHora === h ? " on" : "")} onClick={() => setAgHora(h)}>{h}</button>
                ))}
              </div>
              {/* Escolher uma RESPOSTA PRONTA: joga o texto dela no campo abaixo (dá pra editar depois). */}
              {agRespostas.length > 0 && (
                <select defaultValue="" onChange={(e) => { const r = agRespostas[Number(e.target.value)]; if (r) setAgMsg(r.texto); e.currentTarget.selectedIndex = 0; }}
                  style={{ width: "100%", fontSize: 13, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-soft,#fff)", color: "var(--ink)", fontFamily: "inherit", boxSizing: "border-box" }}>
                  <option value="">📋 Usar uma resposta pronta…</option>
                  {agRespostas.map((r, i) => <option key={i} value={i}>{r.titulo || r.texto.slice(0, 40)}</option>)}
                </select>
              )}
              {/* Mensagem própria (opcional): se vazio, a IA manda a saudação padrão */}
              <textarea value={agMsg} onChange={(e) => setAgMsg(e.target.value)} rows={3}
                placeholder="Mensagem (opcional). Use {nome} pra puxar o nome do cliente. Se deixar vazio, mando um bom dia/boa tarde automático."
                style={{ width: "100%", fontSize: 13, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", resize: "vertical", fontFamily: "inherit", background: "var(--bg-soft,#fff)", color: "var(--ink)", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button disabled={!valido} onClick={() => { if (!valido) return; onAgendar(ms, agMsg.trim() || undefined); setAgOpen(false); }}
                  style={{ flex: 1, background: valido ? "#2563eb" : "#93c5fd", color: "#fff", border: "none", borderRadius: 8, padding: "9px", cursor: valido ? "pointer" : "default", fontSize: 13, fontWeight: 700 }}>
                  {valido ? `📅 Chamar IA — ${agendadoLabel(ms)}` : "Escolha dia e horário"}</button>
                {c.agendado_ia && (
                  <button onClick={() => { onAgendar(null); setAgOpen(false); }}
                    style={{ background: "transparent", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                )}
              </div>
            </div>
          </div>
        ), document.body);
      })()}
      {c.ultima_msg && (() => { const p = extrairIaNota(c.ultima_msg); const t = MSG_PLACEHOLDER.test((p.visivel || "").trim()) ? "" : p.visivel; return <div className="at-prev">{t || (p.iaNota ? "📷 foto" : c.ultima_msg)}</div>; })()}
      <div className="fx-div" />
      <div className="fx-foot">
        {c.origem && FONTE_LABEL[c.origem] && <span className="at-badge" style={{ background: "#f5f3ff", color: "#6d28d9" }} title="De onde veio o contato">{FONTE_LABEL[c.origem]}</span>}
        {/* PERFIL (lojista x consumidor) — separado da relação de compra. */}
        {(c.lojista === 1 || c.tipo === "lojista") && <span className="at-badge" style={{ background: "#e0e7ff", color: "#3730a3" }} title="Perfil: lojista (revende / compra no atacado)">🏪 Lojista</span>}
        {(c.lojista === 0 || c.tipo === "consumidor") && <span className="at-badge" style={{ background: "#fff7ed", color: "#9a3412" }} title="Perfil: consumidor final (não é lojista)">🏠 Consumidor</span>}
        {c.cliente_id && <span className="at-badge" style={{ background: "#dcfce7", color: "#15803d" }} title="Já cadastrado na base de clientes">📇 Na base</span>}
        {/* RELAÇÃO DE COMPRA (jornada) — marcada à mão. */}
        {c.status_cliente && STATUS_CLIENTE[c.status_cliente] && <span className="at-badge" style={{ background: STATUS_CLIENTE[c.status_cliente].bg, color: STATUS_CLIENTE[c.status_cliente].cor }} title="Relação de compra (marcada à mão)">{STATUS_CLIENTE[c.status_cliente].label}</span>}
        {c.autorizado === 0
          ? <span className="at-badge" style={{ background: "#fef3c7", color: "#92400e" }} title="Aguardando autorização da equipe">⏳ Autorizar</span>
          : <span className="at-badge">{c.responsavel ? `👤 ${c.responsavel}` : humano ? "👤 humano" : "🤖 robô"}</span>}
        {!!c.transferido && <span className="at-badge" style={{ background: "#e0e7ff", color: "#4338ca" }} title="Transferido — aguardando o responsável pegar">↗️ transferido</span>}
        {/* Card parado em atendimento humano: aviso graduado (a partir de ~10h) que fica URGENTE perto de
            encerrar sozinho (24h). Vale pra "Em atendimento" e "Aguardando humano". */}
        {(c.coluna === "em-atendimento" || c.coluna === "aguardando-humano") && (() => {
          const ult = [c.ultima_in_em, c.ultima_out_em].filter(Boolean).map(String).sort().pop() || c.atualizado_em;
          const ms = ult ? Date.parse(String(ult).replace(" ", "T") + "Z") : 0;
          if (!ms) return null;
          const h = Math.floor((Date.now() - ms) / 3600e3);
          if (h < 10) return null;
          const urgente = h >= 20;
          return <span className={"at-badge" + (urgente ? " at-parado" : "")} style={urgente ? undefined : { background: "#fef9c3", color: "#854d0e", fontWeight: 700 }}
            title={urgente ? "Parado — vai encerrar sozinho em breve (24h sem conversa). Responda ou finalize." : "Atendimento parado — responda ou finalize a conversa."}>⏳ parado {h >= 24 ? "+24h" : h + "h"}{urgente ? " · fecha logo" : ""}</span>;
        })()}
        {c.funil_etapa && <span className="at-badge" style={{ background: "#ecfdf5", color: "#047857" }} title="Etapa no funil de vendas">🎯 {etapaLabel(c.funil_etapa)}</span>}
        {c.interessado === 1 && <span className="at-badge" style={{ background: "#fee2e2", color: "#b91c1c" }} title="Demonstrou interesse comercial">🔥 Interessado</span>}
        {c.representante && <span className="at-badge" style={{ background: "#eef2ff", color: "#4338ca" }} title={c.autorizado === 0 ? "Representante sugerido" : "Representante"}>🧑‍💼 {c.representante}</span>}
        {!!c.silenciado && <span className="at-badge" style={{ background: "#f1f5f9", color: "#475569" }} title="Não pisca (mas você continua sendo avisado com som). Grupo fica sem som.">🔕</span>}
        {c.agendado_ia ? (c.agendado_enviado
          ? <span className="at-badge" style={{ background: "#dcfce7", color: "#15803d" }} title="IA já mandou a saudação — aguardando o cliente responder">⏰ chamado · aguardando</span>
          : <span className="at-badge" style={{ background: "#dbeafe", color: "#1d4ed8" }} title="IA vai enviar uma saudação neste horário">⏰ {agendadoLabel(c.agendado_ia)}</span>) : null}
        {c.setor && <span className="fx-sub">{SETOR_EMOJI[c.setor] || ""}</span>}
        <span className="fx-sub" style={{ marginLeft: "auto" }}>{horaData([c.ultima_in_em, c.ultima_out_em].filter(Boolean).map(String).sort().pop() || c.atualizado_em)}</span>
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


// ── Conversa (thread estilo WhatsApp + contexto + ações do atendente) ──────────────
export function ConversaModal({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const [d, setD] = useState<AtendConversaDetalhe | null>(null);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [reps, setReps] = useState<Representante[]>([]);
  const [repSel, setRepSel] = useState("");
  const [usuarios, setUsuarios] = useState<{ nome: string; usuario: string }[]>([]);
  const [respostas, setRespostas] = useState<RespostaPronta[]>([]);
  const [respEmpresa, setRespEmpresa] = useState<RespostaPronta[]>([]);
  const [mostrarResp, setMostrarResp] = useState(false);
  const [gerenciarResp, setGerenciarResp] = useState(false);
  const [arqRapidoOpen, setArqRapidoOpen] = useState(false);
  const [transfOpen, setTransfOpen] = useState(false); // picker do botão "Transferir para outro vendedor"
  const [anexoMenu, setAnexoMenu] = useState(false); // menu do clipe (📎): opções de anexo, como no WhatsApp
  const [movMenu, setMovMenu] = useState(false); // "Mover para coluna": submenu recolhível (deixa a tela limpa)
  const [emojiOpen, setEmojiOpen] = useState(false); // seletor de emojis (😊) do campo de mensagem
  // Agendar mensagem (mandar mais tarde) — reaproveita o agendamento do "Chamar IA": no horário, o
  // sistema envia a mensagem escolhida (se vazia, manda uma saudação da IA). Útil pra não mandar de madrugada.
  const [agOpen, setAgOpen] = useState(false);
  const [agDia, setAgDia] = useState("");
  const [agHora, setAgHora] = useState("09:00");
  const [agMsg, setAgMsg] = useState("");
  const [repEnvOpen, setRepEnvOpen] = useState(false); // picker "enviar contato pro representante"
  const [editDados, setEditDados] = useState(false);
  const [formD, setFormD] = useState({ contato_nome: "", nome: "", setor: "", cnpj: "", cidade: "", uf: "", lojista: "" });
  const [respondendo, setRespondendo] = useState<{ id: string; texto: string } | null>(null);
  const [modo, setModo] = useState<"cliente" | "interno">("cliente");
  const fim = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const arqRef = useRef<HTMLInputElement>(null);
  const enviandoRef = useRef(false); // trava anti-duplicado (evita mandar o arquivo 2×)
  const carregandoRef = useRef(false); // evita empilhar o poll da conversa (rede lenta do tablet)
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
    // Se você já tinha digitado um texto no campo de mensagem, ele VIRA a legenda da foto/arquivo
    // (antes esse texto ficava esquecido no campo e não ia junto). Áudio não leva legenda.
    if (ehAudio) setLegendaAnexo("");
    else { setLegendaAnexo(texto.trim()); if (texto.trim()) setTexto(""); }
  }
  // Gravar áudio (nota de voz) pelo microfone. Grava com o MediaRecorder (confiável, NÃO derruba
  // pedaços do áudio — o método antigo, ScriptProcessor, picotava e o cliente reclamava que "cortava").
  // Depois converte pra WAV limpo (o WhatsApp não toca webm) via decodeAudioData → audioBufferParaWav.
  const [gravando, setGravando] = useState(false);
  const [gravSeg, setGravSeg] = useState(0); // cronômetro da gravação (segundos)
  const [processandoAudio, setProcessandoAudio] = useState(false); // convertendo o áudio (mostra "preparando…")
  const gravRef = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: BlobPart[]; mime: string } | null>(null);
  // Conta o tempo enquanto grava (mostra 0:07 do lado do botão). Zera ao parar.
  useEffect(() => {
    if (!gravando) { setGravSeg(0); return; }
    setGravSeg(0);
    const t = setInterval(() => setGravSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      // Preferimos formatos que o WhatsApp TOCA direto (mp4/m4a, ogg/opus) ANTES do webm: assim, se a
      // conversão pra WAV falhar e cair no fallback (manda como gravou), o áudio ainda toca pro cliente.
      // No Chrome só o webm/opus é suportado — mas aí a conversão pra WAV (caminho normal) resolve.
      const tipos = ["audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
      const mime = tipos.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) || "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(); // sem timeslice: entrega tudo de uma vez ao parar (menos chance de picotar)
      gravRef.current = { rec, stream, chunks, mime: rec.mimeType || mime || "audio/webm" };
      setGravando(true);
    } catch { alert("Não consegui acessar o microfone. Autorize o microfone no navegador e tente de novo."); }
  }
  function pararGravacao() {
    const g = gravRef.current; gravRef.current = null; setGravando(false);
    if (!g) return;
    setProcessandoAudio(true);
    g.rec.onstop = async () => {
      let ctx: AudioContext | null = null;
      try {
        const blob = new Blob(g.chunks, { type: g.mime });
        if (blob.size < 200) throw new Error("vazio");
        const ab = await blob.arrayBuffer();
        const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        // Converter (decode + regravar WAV) é PESADO em tablet/celular fraco e o Safari às vezes
        // TRAVA no decode. Timeout de 15s: se demorar, cai no fallback (manda o áudio como gravou).
        const audioBuf = await Promise.race([
          ctx.decodeAudioData(ab.slice(0)),
          new Promise<AudioBuffer>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
        ]);
        const wav = audioBufferParaWav(audioBuf);
        if (wav.byteLength <= 44) throw new Error("vazio");
        if (wav.byteLength > 40 * 1024 * 1024) {
          // Gravação longa: o WAV passou de 40MB (limite do envio). Em vez de PERDER o áudio, manda o
          // gravado (opus/mp4, bem mais leve). Melhor mandar comprimido do que jogar fora a gravação.
          const mm = (g.mime || "").toLowerCase();
          const ext = mm.includes("mp4") ? "m4a" : mm.includes("ogg") ? "ogg" : mm.includes("mpeg") ? "mp3" : "webm";
          escolherAnexo(new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type || "audio/webm" }));
          if (ext === "webm") alert("⚠️ Áudio longo: enviei no formato leve, mas neste aparelho ele pode não tocar no WhatsApp do cliente. Se puder, grave pelo computador.");
        } else {
          escolherAnexo(new File([wav], `audio-${Date.now()}.wav`, { type: "audio/wav" }));
        }
      } catch {
        // FALLBACK (tablet/Safari): se a conversão travar/falhar, manda o áudio GRAVADO como veio
        // (comprimido, leve) — sem re-encodar. Melhor mandar assim do que travar/perder o áudio.
        try {
          const blob = new Blob(g.chunks, { type: g.mime });
          if (blob.size > 200) {
            const mm = (g.mime || "").toLowerCase();
            const ext = mm.includes("mp4") ? "m4a" : mm.includes("ogg") ? "ogg" : mm.includes("mpeg") ? "mp3" : "webm";
            escolherAnexo(new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type || "audio/webm" }));
            // webm é o único formato que o WhatsApp NÃO toca como nota de voz. Avisa (mesmo tocando aqui
            // na prévia, pode não tocar no celular do cliente) pra o atendente regravar pelo computador.
            if (ext === "webm") alert("⚠️ Consegui gravar, mas neste aparelho o áudio pode NÃO tocar no WhatsApp do cliente.\n\nSe puder, grave pelo computador — lá ele sai no formato certo.");
          } else { alert("Não consegui gravar o áudio. Tente de novo."); }
        } catch { alert("Não consegui gravar o áudio. Tente de novo."); }
      } finally {
        try { ctx?.close(); } catch { /* ok */ }
        g.stream.getTracks().forEach((t) => t.stop());
        setProcessandoAudio(false);
      }
    };
    try { g.rec.stop(); } catch { g.stream.getTracks().forEach((t) => t.stop()); setProcessandoAudio(false); }
  }
  const uploadAbort = useRef<AbortController | null>(null); // pra o "Cancelar" ABORTAR o envio em andamento
  function cancelarAnexo() {
    if (uploadAbort.current) { try { uploadAbort.current.abort(); } catch { /* ok */ } uploadAbort.current = null; }
    if (anexo?.url) URL.revokeObjectURL(anexo.url);
    setAnexo(null); setLegendaAnexo(""); if (arqRef.current) arqRef.current.value = "";
    enviandoRef.current = false; setBusy(false); // destrava na hora, mesmo se estava enviando
  }
  async function confirmarAnexo() {
    if (!anexo || enviandoRef.current) return; // trava: não deixa mandar 2× (clique duplo / Enter)
    enviandoRef.current = true; setBusy(true);
    const ctrl = new AbortController(); uploadAbort.current = ctrl;
    try {
      const r = await api.atendEnviarArquivo(id, anexo.file, d?.responsavel || "Atendente", legendaAnexo.trim() || undefined, ctrl.signal);
      if (!r.enviado && r.motivo && r.motivo !== "desligado") alert("Arquivo salvo na conversa, mas não foi enviado ao cliente: " + r.motivo);
      cancelarAnexo(); carregar(); onMudou();
    } catch (e) {
      if (!ctrl.signal.aborted) alert("Não consegui enviar o arquivo: " + ((e as Error)?.message || "erro") + "\n\nSe o arquivo for muito grande (acima de 40MB), tente um menor.");
      // se foi cancelado pelo usuário (aborted), não mostra erro — o cancelarAnexo já limpou tudo.
    }
    finally {
      // Só destrava se ESTE envio ainda é o atual. Se o usuário cancelou este e já começou outro,
      // não podemos zerar a trava anti-duplicado do NOVO envio (senão dava pra reenviar 2×).
      if (uploadAbort.current === ctrl) { uploadAbort.current = null; setBusy(false); enviandoRef.current = false; }
    }
  }
  // Vários arquivos de uma vez: manda um por um (pula os que passam de 40MB).
  async function enviarVarios(files: File[]) {
    if (enviandoRef.current) return;
    const validos = files.filter((f) => f.size <= 40 * 1024 * 1024);
    const grandes = files.length - validos.length;
    if (!validos.length) { alert("Todos os arquivos passam de 40 MB. Comprima e tente de novo."); return; }
    if (!confirm(`Enviar ${validos.length} arquivo(s) para o cliente?` + (grandes ? `\n\n(${grandes} ignorado(s) por passar de 40 MB)` : ""))) return;
    enviandoRef.current = true; setBusy(true);
    try {
      for (const f of validos) { try { await api.atendEnviarArquivo(id, f, d?.responsavel || "Atendente"); } catch { /* segue os próximos */ } }
      carregar(); onMudou();
    } finally { setBusy(false); enviandoRef.current = false; }
  }
  // Faz o campo de mensagem crescer na vertical conforme digita (até um limite).
  function ajustarAltura() { const t = inputRef.current; if (!t) return; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 130) + "px"; }
  useEffect(() => { ajustarAltura(); }, [texto]);

  function abrirEdicaoDados() {
    setFormD({ contato_nome: d?.contato_nome || "", nome: d?.nome || "", setor: d?.setor || "", cnpj: d?.cnpj || "", cidade: d?.cidade || "", uf: d?.uf || "", lojista: d?.lojista == null ? "" : String(d.lojista) });
    setEditDados(true);
  }
  async function salvarDados() {
    setBusy(true);
    try { await api.atendSalvarDados(id, formD); setEditDados(false); carregar(); onMudou(); }
    catch { alert("Não consegui salvar os dados."); } finally { setBusy(false); }
  }
  // Varredura pelo CNPJ: digita o CNPJ (num lead vazio) e busca nome/cidade/UF na BASE própria
  // e, se não achar, na RECEITA. Preenche só os campos vazios do formulário — depois é só Salvar.
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  async function buscarPorCnpj() {
    const cnpj = formD.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) { alert("Digite o CNPJ completo (14 dígitos) antes de buscar."); return; }
    setBuscandoCnpj(true);
    try {
      const r = await api.atendConsultarCnpj(cnpj);
      if (!r.achou) { alert(r.erro_rede ? "Não consegui consultar a Receita agora. Tente de novo em instantes." : "CNPJ não encontrado — nem na sua base, nem na Receita."); return; }
      setFormD((f) => ({ ...f, nome: f.nome || r.nome || "", cidade: f.cidade || r.cidade || "", uf: f.uf || r.uf || "", lojista: f.lojista || "1" }));
      const onde = r.na_base ? "sua base de clientes" : "Receita Federal";
      alert(`✓ Achei na ${onde}: ${r.nome || "(sem nome)"}${r.cidade ? " · " + r.cidade + "/" + (r.uf || "") : ""}${r.representante ? "\nRepresentante: " + r.representante : ""}.${r.ativa === false ? "\n\n⚠️ Atenção: consta INATIVO/baixado na Receita." : ""}\n\nConfira e clique em Salvar.`);
    } catch { alert("Não consegui buscar agora. Tente de novo."); }
    finally { setBuscandoCnpj(false); }
  }
  // Botão de 1 clique: marca/desmarca o PERFIL lojista (revende/atacado). Com isso a Big trata
  // como lojista (informa preço, não manda pro "onde comprar") e foto/áudio dele vai direto pro
  // humano. Se já é cliente/comprou é outra coisa — isso vai no campo "Relação de compra".
  async function marcarLojista() {
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
  // Escolher uma resposta pronta na conversa: se ela TEM anexo, ENVIA na hora (arquivo + texto como
  // legenda); se for só texto, joga no campo pra você revisar e mandar.
  async function escolherResposta(r: RespostaPronta) {
    setMostrarResp(false);
    if (r.arquivo_key) {
      if (!confirm(`Enviar "${r.titulo || r.arquivo_nome || "anexo"}" para o cliente agora?`)) return;
      setBusy(true);
      try { await api.atendEnviarResposta(id, { arquivo_key: r.arquivo_key, arquivo_nome: r.arquivo_nome, texto: r.texto, autor: d?.responsavel || getUser()?.nome || "Atendente" }); carregar(); onMudou(); }
      catch { alert("Não consegui enviar a resposta com anexo. Confira a conexão do WhatsApp."); }
      finally { setBusy(false); }
    } else {
      setTexto(r.texto);
    }
  }
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  useEffect(() => { api.atendFotoPerfil(id).then((r) => setFotoPerfil(r.link)).catch(() => {}); }, [id]);
  const [colsAtend, setColsAtend] = useState<AtendColuna[]>([]);
  useEffect(() => { api.atendColunas().then((r) => setColsAtend(r.colunas)).catch(() => {}); }, []);
  async function moverColuna(colId: string) {
    setBusy(true);
    try { await api.atendMoverColuna(id, colId); carregar(); onMudou(); } finally { setBusy(false); }
  }
  // Status do cliente (Primeira compra / Compra recorrente / etc.) — marca à mão; vira selo no card.
  async function mudarStatusCliente(status: string) {
    setD((x) => (x ? { ...x, status_cliente: status || null } : x));   // otimista
    try { await api.atendStatusCliente(id, status); onMudou(); } catch { carregar(); }
  }
  function carregar() {
    if (carregandoRef.current) return; // não empilha requisição por cima da anterior (tablet lento)
    carregandoRef.current = true;
    api.atendConversa(id).then((c) => { setD(c); setRepSel((s) => s || c.representante || ""); }).catch(() => {}).finally(() => { carregandoRef.current = false; });
  }
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
    try { await api.atendAssumir(id, u?.nome || "Atendente", false); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function transferir(nome: string) {
    if (!nome) return;
    // Transferir pra OUTRA pessoa = pendente (aparece pra ela em "Aguardando atendimento humano").
    // Escolher a si mesmo = assumir (vai direto pra "Em atendimento").
    const pendente = nome !== (getUser()?.nome || "");
    setBusy(true);
    try { await api.atendAssumir(id, nome, pendente); carregar(); onMudou(); } finally { setBusy(false); }
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
  const [imgZoom, setImgZoom] = useState<string | null>(null); // imagem aberta em tela cheia (lightbox)
  const [encMsg, setEncMsg] = useState<string | null>(null); // mensagem sendo encaminhada
  async function excluirMsg(msgId: string, paraTodos: boolean) {
    if (paraTodos && !confirm("Apagar esta mensagem PARA TODOS? Ela some também no WhatsApp do cliente.")) return;
    setMenuMsg(null); setBusy(true);
    try {
      const r = await api.atendExcluirMsg(id, msgId, paraTodos);
      if (paraTodos && r && r.revogada === false) alert("Apaguei aqui no CRM, mas não consegui apagar no WhatsApp do cliente" + (r.motivo ? ` (${r.motivo})` : "") + ". Pode ser que já tenha passado o tempo que o WhatsApp permite apagar.");
      carregar(); onMudou();
    } catch { alert("Não consegui excluir a mensagem."); } finally { setBusy(false); }
  }
  async function editarMsg(msgId: string, textoAtual: string) {
    const novo = prompt("Corrigir a mensagem (o WhatsApp permite editar por ~15 min depois de enviada):", textoAtual);
    if (novo == null) return;
    const t = novo.trim();
    if (!t || t === textoAtual.trim()) { setMenuMsg(null); return; }
    setMenuMsg(null); setBusy(true);
    try {
      const r = await api.atendEditarMsg(id, msgId, t);
      if (r && r.editadoZap === false) alert("Corrigi aqui no CRM, mas não consegui editar no WhatsApp do cliente" + (r.motivo ? ` (${r.motivo})` : "") + ". O WhatsApp só deixa editar por cerca de 15 minutos.");
      carregar(); onMudou();
    } catch { alert("Não consegui editar a mensagem."); } finally { setBusy(false); }
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
    const estavaEncerrado = encerrado;
    setBusy(true);
    try {
      await api.atendEncerrar(id, getUser()?.nome, encerrado); onMudou();
      if (!estavaEncerrado) { onFechar(); return; }   // acabou de encerrar → fecha o card sozinho
      carregar();
    } finally { setBusy(false); }
  }
  // Catálogo: NÃO envia automático. Joga o texto (link + senha) no campo de mensagem pra você
  // EDITAR antes e mandar pelo botão de enviar normal. Se já tiver algo digitado, acrescenta embaixo.
  async function enviarCatalogo() {
    setBusy(true);
    try {
      const r = await api.atendCatalogoTexto(id);
      const cat = (r.texto || "").trim();
      if (!cat) { alert("O catálogo ainda não está configurado (link/mensagem). Preencha em Configurações → Catálogo."); return; }
      setTexto((t) => t.trim() ? (t.replace(/\s+$/, "") + "\n\n" + cat) : cat);
      setTimeout(() => { const t = inputRef.current; if (t) { t.focus(); ajustarAltura(); } }, 0);
    } catch { alert("Não consegui montar o texto do catálogo agora."); }
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
    if (!texto.trim() || enviandoRef.current) return; // trava anti-duplicado: Enter 2-3× rápido mandava a MESMA msg várias vezes
    enviandoRef.current = true; setBusy(true);
    // Manda em NOME do vendedor responsável (o cliente conhece ele). Só usa quem está logado
    // quando ainda NÃO tem responsável (aí quem responde primeiro assume). Antes ia sempre como
    // o usuário logado (ex.: Administrador), mesmo com o Pedro escolhido como responsável.
    try { await api.atendEnviar(id, { texto: texto.trim(), autor: d?.responsavel || getUser()?.nome || "Atendente", responder_a: respondendo?.id }); setTexto(""); setRespondendo(null); carregar(); onMudou(); }
    catch { alert("Não consegui enviar a mensagem agora. Verifique a conexão e tente de novo (seu texto continua no campo)."); }
    finally { setBusy(false); enviandoRef.current = false; }
  }
  // Agendar mensagem: em vez de mandar agora, guarda pra enviar no dia/horário escolhido (mesmo
  // motor do "Chamar IA"). Se "mensagem" vazia, o sistema manda uma saudação da IA no horário.
  async function agendarMensagem(quando: number | null, mensagem?: string) {
    setBusy(true);
    try { await api.atendAgendarIa(id, quando, mensagem); setTexto(""); setAgOpen(false); carregar(); onMudou(); }
    catch { alert("Não consegui agendar a mensagem agora. Verifique a conexão e tente de novo."); }
    finally { setBusy(false); }
  }
  // Envia o contato do cliente pro WhatsApp de um representante (ele atende pelo número dele).
  async function enviarRepresentante(repId: string) {
    setBusy(true);
    try {
      const r = await api.atendEnviarRepresentante(id, repId);
      if (r.error) { alert(r.error); return; }
      setRepEnvOpen(false); carregar(); onMudou();
      alert(`✓ Contato enviado pro representante ${r.representante}. Ele vai falar com o cliente pelo número dele.`);
    } catch { alert("Não consegui enviar agora. Verifique a conexão e tente de novo."); }
    finally { setBusy(false); }
  }
  // Nota interna: recado da equipe DENTRO da conversa — o cliente NÃO recebe.
  async function enviarNota() {
    if (!texto.trim() || enviandoRef.current) return; // mesma trava anti-duplicado da mensagem
    enviandoRef.current = true; setBusy(true);
    try { await api.atendNota(id, { texto: texto.trim(), autor: getUser()?.nome || "Equipe" }); setTexto(""); carregar(); onMudou(); }
    catch { alert("Não consegui salvar a nota agora. Tente de novo (seu texto continua no campo)."); }
    finally { setBusy(false); enviandoRef.current = false; }
  }
  // Insere o emoji no ponto do cursor (ou no fim) e mantém o foco no campo.
  function inserirEmoji(emo: string) {
    const el = inputRef.current;
    if (el) {
      const s = el.selectionStart ?? texto.length, e = el.selectionEnd ?? texto.length;
      const novo = texto.slice(0, s) + emo + texto.slice(e);
      setTexto(novo);
      requestAnimationFrame(() => { try { el.focus(); const p = s + emo.length; el.setSelectionRange(p, p); } catch { /* ok */ } });
    } else setTexto(texto + emo);
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
            {d?.mensagens.map((m, i, arr) => {
              // Separador de DIA (estilo WhatsApp): mostra "Hoje / Ontem / data" quando muda o dia.
              const sep = (i === 0 || diaBrasilia(arr[i - 1].criado_em) !== diaBrasilia(m.criado_em))
                ? <div className="at-diasep"><span>{rotuloDia(m.criado_em)}</span></div> : null;
              const corpo = (
              m.tipo === "sistema"
                ? <div className="at-sys" key={m.id}>⚙️ {m.texto}</div>
                : m.tipo === "nota"
                ? <div className="at-nota" key={m.id}><span className="at-nota-hd">📝 {m.autor || "Equipe"} · nota interna (o cliente não vê)</span>{formatarMsg(m.texto)}<span className="at-tm">{hora(m.criado_em)}</span></div>
                : <div key={m.id} className={"at-b " + (m.direcao === "in" ? "in" : "out")} style={{ position: "relative" }}>
                    {m.autor && m.direcao === "out" && (m.autor === "bot"
                      ? <div className="at-aut">🤖 Big (automático) · só você vê</div>
                      : <div className="at-aut" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ display: "inline-flex", width: 17, height: 17, borderRadius: "50%", background: corDoNome(m.autor), color: "#fff", fontSize: 8.5, fontWeight: 800, alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{iniciais(m.autor)}</span>
                          {m.autor}
                        </div>)}
                    {m.responder_texto && <div className="at-quote">↪ {m.responder_texto}</div>}
                    {m.arquivo_url
                      ? <>
                          {/\.(jpg|jpeg|png|gif|webp)$/i.test(m.arquivo_url)
                            ? <img src={m.arquivo_url} alt={m.texto || "imagem"} onClick={() => setImgZoom(m.arquivo_url!)} style={{ maxWidth: 220, maxHeight: 260, borderRadius: 8, display: "block", cursor: "zoom-in" }} />
                            : /\.(mp4|mov|3gp|m4v)$/i.test(m.arquivo_url)
                              ? <video controls preload="metadata" src={m.arquivo_url} style={{ maxWidth: 240, maxHeight: 300, borderRadius: 8, display: "block" }} />
                            : /\.(ogg|opus|mp3|m4a|wav|webm|aac|amr)$/i.test(m.arquivo_url)
                              ? <AudioMsg url={m.arquivo_url} />
                              : (() => {
                                  const raw = (m.texto || "").trim(); const i = raw.lastIndexOf("📎");
                                  const nome = ((i >= 0 ? raw.slice(i + 1) : raw).trim() || "arquivo");
                                  const pdf = /\.pdf($|[?#])/i.test(m.arquivo_url!) || /\.pdf$/i.test(nome);
                                  return <DocCard url={m.arquivo_url!} nome={nome} pdf={pdf} />;
                                })()}
                          {/\.(jpg|jpeg|png|gif|webp|mp4|mov|3gp|m4v|ogg|opus|mp3|m4a|wav|webm|aac|amr)$/i.test(m.arquivo_url) && m.tipo !== "arquivo" && (m.texto || "").trim() && !/^🎬 \(vídeo/.test((m.texto || "").trim()) && <div style={{ marginTop: 4 }}>{corpoMsg(m.texto)}</div>}
                        </>
                      : m.tipo === "arquivo" ? <span className="at-file">📒 {m.texto}</span> : corpoMsg(m.texto)}
                    <span className="at-tm">{hora(m.criado_em)}{m.direcao === "out" && m.autor !== "sistema" && m.status && (
                      m.status === "falha"
                        ? <span title="NÃO foi entregue ao cliente (WhatsApp recusou). Tente reenviar." style={{ marginLeft: 4, color: "#dc2626", fontWeight: 700 }}>⚠️ não entregue</span>
                        : <span title={m.status === "read" ? "Visto" : m.status === "delivered" ? "Entregue" : "Enviado"} style={{ marginLeft: 4, color: m.status === "read" ? "#53bdeb" : "#8696a0", fontWeight: 700 }}>{m.status === "sent" ? "✓" : "✓✓"}</span>
                    )}</span>
                    {humano && m.direcao === "in" && m.tipo !== "arquivo" && (m.texto || "").trim() && (
                      <button className="at-reply" title="Responder esta mensagem" onClick={() => setRespondendo({ id: m.id, texto: (extrairIaNota(m.texto).visivel || "foto").slice(0, 180) })}>↩︎</button>
                    )}
                    <button title="Excluir mensagem" onClick={() => setMenuMsg(menuMsg === m.id ? null : m.id)} style={{ position: "absolute", top: 3, right: 4, background: "rgba(148,163,184,.22)", border: 0, borderRadius: 6, cursor: "pointer", fontSize: 14, opacity: 0.9, lineHeight: 1, padding: "2px 5px", fontWeight: 800 }}>⋮</button>
                    {menuMsg === m.id && (
                      <div className="at-msgmenu">
                        <button onClick={() => { setRespondendo({ id: m.id, texto: (extrairIaNota(m.texto).visivel || (m.arquivo_url ? "arquivo" : "mensagem")).slice(0, 180) }); setMenuMsg(null); }}>↩️ Responder</button>
                        {m.arquivo_url && (
                          <button onClick={() => { baixarArquivo(m.arquivo_url!); setMenuMsg(null); }}>⤓ Baixar arquivo</button>
                        )}
                        {m.direcao === "out" && m.autor !== "sistema" && !m.arquivo_url && (m.texto || "").trim() && (
                          <button onClick={() => editarMsg(m.id, m.texto || "")}>✏️ Editar (corrigir erro)</button>
                        )}
                        <button onClick={() => { setEncMsg(m.id); setMenuMsg(null); }}>↪️ Encaminhar</button>
                        <button onClick={() => excluirMsg(m.id, false)}>🙈 Excluir para mim</button>
                        {m.direcao === "out" && m.autor !== "sistema" && (
                          <button className="danger" onClick={() => excluirMsg(m.id, true)}>🗑 Excluir para todos</button>
                        )}
                        <button className="cancel" onClick={() => setMenuMsg(null)}>Cancelar</button>
                      </div>
                    )}
                  </div>
              );
              return <Fragment key={m.id}>{sep}{corpo}</Fragment>;
            })}
            <div ref={fim} />
          </div>

          <div className="at-ctx">
            <div className="at-block-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Dados coletados</span>
              {d && !editDados && <button className="btn btn-soft" style={{ fontSize: 11, padding: "2px 8px" }} onClick={abrirEdicaoDados} title="Preencher/corrigir à mão">✏️ Editar</button>}
            </div>
            {editDados ? (
              <div style={{ display: "grid", gap: 7, marginBottom: 6 }}>
                <label className="fld" style={{ fontSize: 11.5 }}>Nome (pessoa)
                  <input value={formD.contato_nome} onChange={(e) => setFormD((f) => ({ ...f, contato_nome: e.target.value }))} placeholder="Nome de quem está no WhatsApp" />
                </label>
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
                <button type="button" className="btn btn-soft" style={{ fontSize: 11.5, borderColor: "#bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }} disabled={busy || buscandoCnpj} onClick={buscarPorCnpj}
                  title="Busca nome, cidade e UF pelo CNPJ — primeiro na sua base de clientes, senão na Receita Federal. Preenche os campos vazios; depois é só Salvar.">
                  {buscandoCnpj ? "🔎 Buscando…" : "🔎 Buscar dados pelo CNPJ"}
                </button>
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
              <div className="at-row"><span>Nome</span><b>{d?.contato_nome || "—"}</b></div>
              <div className="at-row"><span>Setor</span><b>{d?.setor ? (SETOR_EMOJI[d.setor] || "") + " " + d.setor : "—"}</b></div>
              <div className="at-row"><span>Loja</span><b>{d?.nome || "—"}</b></div>
              <div className="at-row"><span>CNPJ</span><b>{d?.cnpj || "—"}</b></div>
              <div className="at-row"><span>Lojista</span><b>{d?.lojista == null ? "—" : d.lojista ? "✅ sim" : "🙅 não"}</b></div>
              <div className="at-row"><span>Cidade</span><b>{[d?.cidade, d?.uf].filter(Boolean).join("/") || "—"}</b></div>
            </>)}
            {d && !editDados && (
              <button className="btn btn-soft" disabled={busy} onClick={marcarLojista}
                style={{ marginTop: 8, width: "100%", fontSize: 12.5, ...(d.lojista === 1 ? { borderColor: "#a7f3d0", background: "#ecfdf5", color: "#065f46", fontWeight: 700 } : {}) }}
                title="Marca o PERFIL como lojista (revende/atacado). A Big passa a tratá-la como lojista: informa preço e não manda pro 'onde comprar'. Se já comprou ou não, você marca em 'Relação de compra'.">
                {d.lojista === 1 ? "🏪 É lojista ✓ (desmarcar)" : "🏪 Marcar como lojista"}
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
            {/* RELAÇÃO DE COMPRA (jornada), separada do perfil lojista/consumidor. Vira selo no card. */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 800, marginBottom: 3 }}>🏷️ Relação de compra</div>
              <select className={"at-sel" + (d?.status_cliente ? " on" : "")} value={d?.status_cliente || ""} onChange={(e) => mudarStatusCliente(e.target.value)} disabled={busy}>
                <option value="">— não definido —</option>
                {STATUS_CLIENTE_ORDEM.map((k) => <option key={k} value={k}>{STATUS_CLIENTE[k].label}</option>)}
              </select>
            </div>
            {/* Vendedor responsável: mostra o nome de quem atende e deixa escolher/trocar direto aqui. */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 800, marginBottom: 3 }}>🧑‍💼 Vendedor responsável</div>
              <select className={"at-sel" + (d?.responsavel ? " on" : "")} value={d?.responsavel || ""} onChange={(e) => { if (e.target.value) transferir(e.target.value); }} disabled={busy}>
                <option value="">— escolher vendedor —</option>
                {usuarios.map((u) => <option key={u.usuario} value={u.nome}>{u.nome}</option>)}
              </select>
            </div>
            {/* Botão dedicado de TRANSFERIR: manda a conversa pra outro vendedor (cai na fila
                "Aguardando atendimento humano" dele, piscando, pra ele pegar). */}
            <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5, borderColor: "#bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }} disabled={busy} onClick={() => setTransfOpen((v) => !v)} title="Transferir esta conversa para outro vendedor — cai na fila 'Aguardando atendimento humano' dele.">
              🔄 Transferir para outro vendedor
            </button>
            {transfOpen && (
              <div style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 10, padding: 6, display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                {usuarios.filter((u) => u.nome !== d?.responsavel).map((u) => (
                  <button key={u.usuario} className="btn btn-soft" style={{ fontSize: 12.5, textAlign: "left", padding: "7px 10px" }} disabled={busy}
                    onClick={async () => { await transferir(u.nome); setTransfOpen(false); alert(`✓ Conversa transferida para ${u.nome}. Ela aparece pra ${u.nome} em "Aguardando atendimento humano".`); }}>
                    👤 {u.nome}
                  </button>
                ))}
                {usuarios.filter((u) => u.nome !== d?.responsavel).length === 0 && <div className="muted" style={{ fontSize: 12, padding: "4px 6px" }}>Nenhum outro vendedor cadastrado.</div>}
              </div>
            )}
            {/* Mover pra outra coluna do quadro (lendo a conversa, você decide pra onde vai).
               Lista de botões (um embaixo do outro) — vê todas as colunas de uma vez e clica direto. */}
            <div style={{ marginTop: 10 }}>
              {/* Cabeçalho clicável: mostra a coluna atual e ABRE/FECHA a lista. Recolhido por padrão
                 pra não poluir a tela (são muitas colunas). */}
              {(() => { const colAtual = colsAtend.find((x) => x.id === d?.coluna); return (
              <button type="button" onClick={() => setMovMenu((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "var(--card, #fff)", color: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <span style={{ fontSize: 11, fontWeight: 800 }}>↔️</span>
                <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  {colAtual
                    ? <><span className="fx-dot" style={{ background: colAtual.cor || "#94a3b8", flex: "0 0 auto" }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colAtual.label}</span></>
                    : <span style={{ color: "var(--muted)" }}>Mover para coluna</span>}
                </span>
                <span style={{ fontSize: 10, color: "var(--muted)", display: "inline-block", transform: movMenu ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
              </button>
              ); })()}
              {movMenu && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  <button type="button" className="at-colbtn" disabled={busy} onClick={() => { moverColuna(""); setMovMenu(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "var(--card, #fff)", color: "inherit", fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
                    <span style={{ fontSize: 13 }}>🔄</span>
                    <span style={{ flex: 1 }}>Automático (segue o estado da conversa)</span>
                  </button>
                  {colsAtend.map((x) => {
                    const atual = x.id === d?.coluna;
                    return (
                      <button type="button" key={x.id} className="at-colbtn" disabled={busy || atual} onClick={() => { moverColuna(x.id); setMovMenu(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 8, border: atual ? "1px solid #1f7a53" : "1px solid var(--border, #e5e7eb)", background: atual ? "#ecfdf5" : "var(--card, #fff)", color: atual ? "#065f46" : "inherit", fontSize: 12.5, fontWeight: atual ? 800 : 600, cursor: (busy || atual) ? "default" : "pointer" }}>
                        <span className="fx-dot" style={{ background: x.cor || "#94a3b8", flex: "0 0 auto" }} />
                        <span style={{ flex: 1 }}>{x.label}</span>
                        {atual && <span style={{ fontSize: 11, fontWeight: 800 }}>✓ aqui</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5, fontWeight: 700, borderColor: encerrado ? "#a7f3d0" : "#1f7a53", background: encerrado ? "#ecfdf5" : "#1f7a53", color: encerrado ? "#065f46" : "#fff" }} disabled={busy} onClick={encerrar} title="Marca o atendimento como resolvido (para de piscar). NÃO envia nada ao cliente.">
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
            <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5, ...(d?.silenciado ? { borderColor: "#94a3b8", background: "#f1f5f9", color: "#475569", fontWeight: 700 } : {}) }} disabled={busy} onClick={toggleSilenciar} title="O card para de PISCAR (mas você continua sendo avisado com som quando o cliente escreve). Em grupo, também tira o som.">
              {d?.silenciado
                ? ((d?.origem === "grupo" || d?.estado === "grupo") ? "🔕 Grupo silenciado — reativar" : "🔕 Não pisca — voltar a piscar")
                : ((d?.origem === "grupo" || d?.estado === "grupo") ? "🔕 Silenciar este grupo" : "🔕 Parar de piscar este card")}
            </button>
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
                <button className="btn btn-soft" onClick={cancelarAnexo}>Cancelar</button>
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
                      <button key={"e" + i} onClick={() => escolherResposta(r)} title={r.arquivo_key ? "Envia o anexo + texto pro cliente" : "Coloca no campo — você edita e envia"}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderTop: "1px solid var(--line,#f1f5f9)", background: "transparent", cursor: "pointer" }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.arquivo_key ? "📎 " : ""}{r.titulo || "(sem título)"}</div>
                        <div className="muted2" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.texto || (r.arquivo_key ? (r.arquivo_nome || "anexo") : "")}</div>
                      </button>
                    ))}
                    {respostas.length > 0 && <div className="muted2" style={{ padding: "8px 12px 2px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3 }}>🙋 Minhas</div>}
                    {respostas.map((r, i) => (
                      <button key={"m" + i} onClick={() => escolherResposta(r)} title={r.arquivo_key ? "Envia o anexo + texto pro cliente" : "Coloca no campo — você edita e envia"}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderTop: "1px solid var(--line,#f1f5f9)", background: "transparent", cursor: "pointer" }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.arquivo_key ? "📎 " : ""}{r.titulo || "(sem título)"}</div>
                        <div className="muted2" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.texto || (r.arquivo_key ? (r.arquivo_nome || "anexo") : "")}</div>
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
          {/* Input de arquivo ÚNICO — fica sempre no DOM pra os dois modos (robô e humano) acionarem. */}
          <input ref={arqRef} type="file" multiple accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" style={{ display: "none" }} onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length === 1) escolherAnexo(fs[0]); else if (fs.length > 1) enviarVarios(fs); e.currentTarget.value = ""; }} />
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
                {/* Clipe (📎): abre o menu de anexos/ações, como no WhatsApp. */}
                <div style={{ position: "relative", flex: "0 0 auto" }}>
                  <button className="at-send" style={{ background: anexoMenu ? "rgba(0,128,105,.12)" : "transparent" }} disabled={busy} onClick={() => setAnexoMenu((v) => !v)} title="Anexar / mais opções">
                    <svg viewBox="0 0 24 24" width="23" height="23" fill="#54656f"><path d="M16.5 6v11a4.5 4.5 0 01-9 0V5a3 3 0 016 0v10a1.5 1.5 0 01-3 0V6H9v9a3 3 0 006 0V5a4.5 4.5 0 00-9 0v12a6 6 0 0012 0V6z"/></svg>
                  </button>
                  {anexoMenu && (<>
                    <div onClick={() => setAnexoMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
                    <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 12px 32px #0003", zIndex: 20, minWidth: 218, overflow: "hidden", paddingBlock: 4 }}>
                      <button className="at-anexo-opt" disabled={busy} onClick={() => { setAnexoMenu(false); arqRef.current?.click(); }}>🖼️ Foto ou documento</button>
                      <button className="at-anexo-opt" disabled={busy} onClick={() => { setAnexoMenu(false); enviarCatalogo(); }} title="Coloca o texto do catálogo (link + senha) no campo de mensagem pra você editar e enviar">📖 Catálogo (editar e enviar)</button>
                      <button className="at-anexo-opt" disabled={busy} onClick={() => { setAnexoMenu(false); setArqRapidoOpen(true); }}>📚 Arquivos rápidos</button>
                      <button className="at-anexo-opt" onClick={() => { setAnexoMenu(false); setMostrarResp(true); }}>📋 Respostas prontas</button>
                      <button className="at-anexo-opt" disabled={busy || sugerindo} onClick={() => { setAnexoMenu(false); sugerir(); }}>✨ Sugerir resposta (IA)</button>
                      <button className="at-anexo-opt" disabled={busy} onClick={() => { setAnexoMenu(false); const base = d?.agendado_ia || (Date.now() + 3600e3); setAgDia(dataLocalStr(base)); setAgHora(d?.agendado_ia ? horaLocalStr(base) : "09:00"); setAgMsg(texto.trim()); setAgOpen(true); }}>⏰ Agendar mensagem (mandar mais tarde)</button>
                      <button className="at-anexo-opt" disabled={busy} onClick={() => { setAnexoMenu(false); setRepEnvOpen(true); }}>📤 Enviar contato pro representante</button>
                    </div>
                  </>)}
                </div>
                {/* Emojis (😊): abre um painel pra clicar, como no WhatsApp do computador. */}
                <div style={{ position: "relative", flex: "0 0 auto" }}>
                  <button className="at-send" style={{ background: emojiOpen ? "rgba(0,128,105,.12)" : "transparent" }} disabled={busy} onClick={() => setEmojiOpen((v) => !v)} title="Emojis">
                    <svg viewBox="0 0 24 24" width="23" height="23" fill="#54656f"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-3.5-9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm7 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 17.5c2.03 0 3.8-1.11 4.74-2.75a.75.75 0 00-1.3-.75A3.98 3.98 0 0112 16a3.98 3.98 0 01-3.44-1.99.75.75 0 10-1.3.74A5.48 5.48 0 0012 17.5z"/></svg>
                  </button>
                  {emojiOpen && (<>
                    <div onClick={() => setEmojiOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
                    <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 12px 32px #0003", zIndex: 20, width: 268, maxHeight: 210, overflowY: "auto", padding: 8, display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2 }}>
                      {EMOJIS.map((emo, i) => (
                        <button key={i} onClick={() => inserirEmoji(emo)} title={emo} style={{ background: "transparent", border: 0, cursor: "pointer", fontSize: 21, lineHeight: 1, padding: "4px 0", borderRadius: 6 }}>{emo}</button>
                      ))}
                    </div>
                  </>)}
                </div>
                <textarea ref={inputRef} rows={1} placeholder="Escreva uma mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
                {gravando && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#ef4444", fontWeight: 800, fontSize: 13, fontVariantNumeric: "tabular-nums", flex: "0 0 auto" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "atpulse 1s ease-in-out infinite" }} />{mmss(gravSeg)}</span>}
                {/* Direita: digitando → enviar (➤); vazio → gravar áudio (🎤), como no WhatsApp. */}
                {texto.trim() && !gravando
                  ? <button className="at-send" disabled={busy} onClick={enviar} title="Enviar"><svg viewBox="0 0 24 24" width="21" height="21" fill="#fff"><path d="M3 20.5l18.5-8.5L3 3.5v6.6l12 1.9-12 1.9z"/></svg></button>
                  : <button className="at-send" style={{ background: gravando ? "#ef4444" : "transparent" }} disabled={busy || processandoAudio} onClick={() => (gravando ? pararGravacao() : iniciarGravacao())} title={processandoAudio ? "Preparando o áudio…" : gravando ? "Parar e ouvir antes de enviar" : "Gravar áudio (nota de voz)"}>
                      {processandoAudio
                        ? <span style={{ fontSize: 17 }}>⏳</span>
                        : gravando
                          ? <svg viewBox="0 0 24 24" width="17" height="17" fill="#fff"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>
                          : <svg viewBox="0 0 24 24" width="22" height="22" fill="#54656f"><path d="M12 15a3.5 3.5 0 003.5-3.5V6a3.5 3.5 0 00-7 0v5.5A3.5 3.5 0 0012 15zm6-3.5a6 6 0 01-12 0H4a8 8 0 007 7.94V23h2v-3.56a8 8 0 007-7.94h-2z"/></svg>}
                    </button>}
              </>
            : <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", flexWrap: "wrap" }}>
                <span className="muted2" style={{ flex: 1, minWidth: 120 }}>🤖 O robô está conduzindo.</span>
                <button className="btn btn-soft" disabled={busy} onClick={() => arqRef.current?.click()} title="Enviar foto ou arquivo pro cliente agora (sem precisar assumir)">📎 Anexar</button>
                <button className="kbtn go" disabled={busy} onClick={assumir}>🙋 Assumir e responder</button>
              </div>}
        </div>
      </div>
      {gerenciarResp && <RespostasModal onFechar={() => setGerenciarResp(false)} onSalvo={() => { setGerenciarResp(false); carregarRespostas(); }} />}
      {arqRapidoOpen && <ArquivosRapidosModal convId={id} autor={d?.responsavel || "Atendente"} onFechar={() => setArqRapidoOpen(false)} onEnviado={() => { setArqRapidoOpen(false); carregar(); onMudou(); }} />}
      {encMsg && <EncaminharModal convId={id} msgId={encMsg} onFechar={() => setEncMsg(null)} />}
      {imgZoom && createPortal((
        <div onClick={() => setImgZoom(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <button onClick={() => setImgZoom(null)} title="Fechar" style={{ position: "fixed", top: 16, right: 20, width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.3)", fontSize: 24, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>×</button>
          <a href={imgZoom} target="_blank" rel="noreferrer" download onClick={(e) => e.stopPropagation()} title="Baixar imagem" style={{ position: "fixed", top: 16, right: 74, height: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 22, background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.3)", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>⤓ Baixar</a>
          <img src={imgZoom} alt="imagem" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "94vw", maxHeight: "90vh", borderRadius: 10, boxShadow: "0 10px 40px rgba(0,0,0,.6)" }} />
        </div>
      ), document.body)}
      {agOpen && createPortal((() => {
        const hoje = dataLocalStr(Date.now()), amanha = dataLocalStr(Date.now() + 864e5);
        const ms = agDia && agHora ? new Date(`${agDia}T${agHora}`).getTime() : 0;
        const valido = !!ms && !isNaN(ms) && ms > Date.now();
        const agResps = [...respEmpresa, ...respostas].filter((r) => r.texto?.trim());
        return (
          <div onClick={() => setAgOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, padding: 16, border: "1px solid var(--line)", borderRadius: 14, background: "var(--card,#fff)", color: "var(--ink)", display: "grid", gap: 11, boxShadow: "0 16px 40px rgba(0,0,0,.35)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 14.5, fontWeight: 800 }}>⏰ Agendar mensagem</div>
                <button onClick={() => setAgOpen(false)} title="Fechar" style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 2 }}>✕</button>
              </div>
              {/* Dia: atalhos Hoje/Amanhã + calendário */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button className={"at-chip" + (agDia === hoje ? " on" : "")} onClick={() => setAgDia(hoje)}>Hoje</button>
                <button className={"at-chip" + (agDia === amanha ? " on" : "")} onClick={() => setAgDia(amanha)}>Amanhã</button>
                <input type="date" value={agDia} min={hoje} onChange={(e) => setAgDia(e.target.value)} style={{ fontSize: 13, padding: "5px 7px", borderRadius: 8, border: "1px solid var(--line)", flex: 1, minWidth: 130 }} />
              </div>
              {/* Hora: clique no horário */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                {HORAS_AG.map((h) => (<button key={h} className={"at-chip" + (agHora === h ? " on" : "")} onClick={() => setAgHora(h)}>{h}</button>))}
              </div>
              {/* Escolher uma resposta pronta → joga o texto no campo (dá pra editar) */}
              {agResps.length > 0 && (
                <select defaultValue="" onChange={(e) => { const r = agResps[Number(e.target.value)]; if (r) setAgMsg(r.texto); e.currentTarget.selectedIndex = 0; }} style={{ width: "100%", fontSize: 13, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-soft,#fff)", color: "var(--ink)", fontFamily: "inherit", boxSizing: "border-box" }}>
                  <option value="">📋 Usar uma resposta pronta…</option>
                  {agResps.map((r, i) => <option key={i} value={i}>{r.titulo || r.texto.slice(0, 40)}</option>)}
                </select>
              )}
              <textarea value={agMsg} onChange={(e) => setAgMsg(e.target.value)} rows={3} placeholder="Mensagem que vai ser enviada no horário. Use {nome} pro nome do cliente. Se deixar vazio, mando um bom dia/boa tarde automático." style={{ width: "100%", fontSize: 13, padding: "8px 9px", borderRadius: 8, border: "1px solid var(--line)", resize: "vertical", fontFamily: "inherit", background: "var(--bg-soft,#fff)", color: "var(--ink)", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button disabled={!valido || busy} onClick={() => { if (valido) agendarMensagem(ms, agMsg.trim() || undefined); }} style={{ flex: 1, background: valido && !busy ? "#2563eb" : "#93c5fd", color: "#fff", border: "none", borderRadius: 8, padding: "10px", cursor: valido && !busy ? "pointer" : "default", fontSize: 13.5, fontWeight: 700 }}>{valido ? `📅 Agendar — ${agendadoLabel(ms)}` : "Escolha dia e horário"}</button>
                {d?.agendado_ia ? (<button disabled={busy} onClick={() => agendarMensagem(null)} style={{ background: "transparent", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>) : null}
              </div>
              {d?.agendado_ia ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Já há um agendamento pra {agendadoLabel(d.agendado_ia)} — agendar de novo substitui.</div> : null}
            </div>
          </div>
        );
      })(), document.body)}
      {repEnvOpen && createPortal((
        <div onClick={() => setRepEnvOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, maxHeight: "80vh", display: "flex", flexDirection: "column", padding: 16, border: "1px solid var(--line)", borderRadius: 14, background: "var(--card,#fff)", color: "var(--ink)", boxShadow: "0 16px 40px rgba(0,0,0,.35)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>📤 Enviar contato pro representante</div>
              <button onClick={() => setRepEnvOpen(false)} title="Fechar" style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>
            <div className="muted2" style={{ fontSize: 12, marginBottom: 8 }}>O representante recebe os dados de <b>{d?.nome || d?.contato_nome || "cliente"}</b> no WhatsApp dele e fala com o cliente pelo próprio número.</div>
            <div style={{ overflowY: "auto", display: "grid", gap: 4 }}>
              {reps.filter((r) => (r.whatsapp || "").replace(/\D/g, "").length >= 10).map((r) => (
                <button key={r.id} disabled={busy} onClick={() => enviarRepresentante(r.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-soft,#fff)", color: "var(--ink)", cursor: "pointer", fontSize: 13 }}>
                  🧑‍💼 <b>{r.nome}</b>{r.ufs ? <span className="muted2"> · {r.ufs}</span> : null}
                </button>
              ))}
              {reps.filter((r) => (r.whatsapp || "").replace(/\D/g, "").length >= 10).length === 0 && <div className="muted2" style={{ fontSize: 12.5, padding: "6px 2px" }}>Nenhum representante com WhatsApp cadastrado. Preencha o WhatsApp em <b>Representantes</b>.</div>}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

// ── Encaminhar mensagem: escolhe um contato (busca) ou digita um número e reenvia ──
function EncaminharModal({ convId, msgId, onFechar }: { convId: string; msgId: string; onFechar: () => void }) {
  const [contatos, setContatos] = useState<AtendConversa[]>([]);
  const [busca, setBusca] = useState("");
  const [numero, setNumero] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const u = getUser();
    api.atendBoard(u?.nome, ehGestorAtend()).then((b) => setContatos(b.conversas.filter((c) => c.id !== convId && c.estado !== "grupo"))).catch(() => {});
  }, [convId]);
  async function enviar(dest: { telefone?: string; conversaId?: string }) {
    setBusy(true); setMsg("");
    try { await api.atendEncaminharMsg(convId, msgId, dest); setMsg("✓ Encaminhada!"); setTimeout(onFechar, 900); }
    catch { setMsg("Não consegui encaminhar. Confira o número/conexão."); setBusy(false); }
  }
  const termo = busca.trim().toLowerCase();
  const filtrados = (termo
    ? contatos.filter((c) => [c.contato_nome, c.nome, c.telefone].some((x) => String(x ?? "").toLowerCase().includes(termo)))
    : contatos).slice(0, 40);
  return (
    <div className="modal-bg" onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card,#fff)", color: "var(--ink,#0f172a)", borderRadius: 14, width: "100%", maxWidth: 420, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <b>↪️ Encaminhar mensagem</b>
          <button onClick={onFechar} style={{ background: "transparent", border: 0, fontSize: 18, cursor: "pointer", color: "var(--muted)" }}>✕</button>
        </div>
        {msg && <div style={{ padding: "8px 14px", fontSize: 13, color: msg[0] === "✓" ? "#15803d" : "#b91c1c" }}>{msg}</div>}
        <div style={{ padding: "10px 14px", display: "grid", gap: 8, borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Enviar para um número novo:</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="(35) 9 9999-9999" style={{ flex: 1, fontSize: 13, padding: "7px 8px", borderRadius: 8, border: "1px solid var(--line)" }} />
            <button disabled={busy || numero.replace(/\D/g, "").length < 10} onClick={() => enviar({ telefone: numero })}
              style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12.5 }}>Enviar</button>
          </div>
        </div>
        <div style={{ padding: "10px 14px 6px" }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar contato pelo nome ou número…" style={{ width: "100%", fontSize: 13, padding: "7px 8px", borderRadius: 8, border: "1px solid var(--line)" }} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 8px 10px" }}>
          {filtrados.map((c) => {
            const nm = c.contato_nome || c.nome || telBonito(c.telefone);
            return (
              <button key={c.id} disabled={busy} onClick={() => enviar({ conversaId: c.id })}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", background: "transparent", border: 0, borderRadius: 8, cursor: "pointer", color: "inherit" }}>
                <span className="conv-av" style={{ width: 30, height: 30, fontSize: 12 }}>{iniciais(nm)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nm}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)" }}>{telBonito(c.telefone)}</span>
                </span>
              </button>
            );
          })}
          {filtrados.length === 0 && <div style={{ padding: 12, fontSize: 12.5, color: "var(--muted)" }}>Nenhum contato encontrado.</div>}
        </div>
      </div>
    </div>
  );
}

// ── Gerenciar respostas prontas (atalhos de texto do atendente) ───────────────────
// Arquivos rápidos: catálogos/PDFs salvos pra mandar com 1 clique (como "respostas prontas", de arquivo).
function ArquivosRapidosModal({ convId, autor, onFechar, onEnviado }: { convId: string; autor: string; onFechar: () => void; onEnviado: () => void }) {
  const [lista, setLista] = useState<import("../api").ArqRapido[]>([]);
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const upRef = useRef<HTMLInputElement>(null);
  useEffect(() => { api.atendArquivosRapidos().then((r) => setLista(r.arquivos || [])).catch(() => {}).finally(() => setCarregando(false)); }, []);
  async function subir(f: File) {
    if (f.size > 40 * 1024 * 1024) { alert(`Esse arquivo tem ${(f.size / 1024 / 1024).toFixed(1)} MB — acima de 40 MB.`); return; }
    setBusy(true);
    try { const r = await api.atendSalvarArquivoRapido(f); if (r.error) alert(r.error); else setLista(r.arquivos || []); }
    catch { alert("Não consegui salvar o arquivo."); } finally { setBusy(false); if (upRef.current) upRef.current.value = ""; }
  }
  async function excluir(aid: string, nome: string) {
    if (!confirm(`Remover "${nome}" dos arquivos rápidos?`)) return;
    setBusy(true);
    try { const r = await api.atendExcluirArquivoRapido(aid); setLista(r.arquivos || []); } catch { /* ignora */ } finally { setBusy(false); }
  }
  async function enviar(aid: string) {
    if (busy) return; setBusy(true);
    try { const r = await api.atendEnviarRapido(convId, aid, autor); if (r.error) { alert(r.error); return; } onEnviado(); }
    catch { alert("Não consegui enviar."); } finally { setBusy(false); }
  }
  const icone = (ct: string) => ct.startsWith("image/") ? "🖼️" : ct.startsWith("audio/") ? "🎵" : "📄";
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 520, width: "min(520px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>📚 Arquivos rápidos</h3>
        <p className="muted" style={{ fontSize: 13 }}>Salve aqui os catálogos/PDFs que você mais manda. Depois é só clicar em <b>Enviar</b> pra mandar pro cliente desta conversa — sem procurar na pasta toda vez.</p>
        <input ref={upRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }} />
        <button className="btn btn-primary" disabled={busy} onClick={() => upRef.current?.click()} style={{ marginBottom: 12 }}>➕ Adicionar arquivo</button>
        {carregando ? <div className="muted">Carregando…</div>
          : lista.length === 0 ? <div className="muted" style={{ padding: "10px 0" }}>Nenhum arquivo salvo ainda. Adicione seus catálogos acima. 📎</div>
          : <div style={{ display: "grid", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
              {lista.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px" }}>
                  <span style={{ fontSize: 20 }}>{icone(a.ct)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</div>
                    <div className="muted2" style={{ fontSize: 11 }}>{(a.tamanho / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                  <button className="kbtn go" disabled={busy} onClick={() => enviar(a.id)} style={{ fontSize: 12, padding: "5px 10px" }}>📤 Enviar</button>
                  <button className="btn btn-soft" disabled={busy} onClick={() => excluir(a.id, a.nome)} style={{ fontSize: 12, padding: "5px 8px" }} title="Remover">🗑</button>
                </div>
              ))}
            </div>}
        <div style={{ textAlign: "right", marginTop: 14 }}><button className="btn" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}

function RespostasModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const gestor = ehGestorAtend();
  // Padrão: "Da empresa" pro gestor (assim toda resposta nova já nasce compartilhada com a equipe).
  // Quem não é gestor só tem as pessoais mesmo.
  const [aba, setAba] = useState<"minhas" | "empresa">(gestor ? "empresa" : "minhas");
  const [minhas, setMinhas] = useState<RespostaPronta[]>([]);
  const [empresa, setEmpresa] = useState<RespostaPronta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [subindoIdx, setSubindoIdx] = useState<number | null>(null);
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
  const setArq = (i: number, campos: Partial<RespostaPronta>) => setLista((l) => l.map((x, j) => (j === i ? { ...x, ...campos } : x)));
  const add = () => setLista((l) => [...l, { titulo: "", texto: "" }]);
  const remover = (i: number) => setLista((l) => l.filter((_, j) => j !== i));
  async function anexar(i: number, file: File) {
    if (file.size > 40 * 1024 * 1024) { alert("Esse arquivo passa de 40 MB. Comprima e tente de novo."); return; }
    setSubindoIdx(i);
    try {
      const r = await api.atendRespostaUpload(file);
      if (r.error || !r.key) { alert("Não consegui subir o anexo: " + (r.error || "erro")); return; }
      setArq(i, { arquivo_key: r.key, arquivo_nome: r.nome, arquivo_ct: r.ct });
    } catch { alert("Não consegui subir o anexo."); } finally { setSubindoIdx(null); }
  }
  async function salvar() {
    setBusy(true);
    try {
      // Guarda respostas que têm texto OU anexo (uma foto sem legenda vale).
      const limpar = (l: RespostaPronta[]) => l.filter((x) => x.texto.trim() || x.arquivo_key);
      if (empresaMode) await api.atendSalvarRespostasEmpresa(limpar(empresa));
      else await api.atendSalvarRespostas(limpar(minhas));
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
              <textarea placeholder="Texto da mensagem… (pode deixar vazio se for só o anexo)" rows={3} value={r.texto} onChange={(e) => set(i, "texto", e.target.value)} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
              {/* Anexo opcional: foto/arquivo que vai junto quando você escolher esta resposta na conversa. */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                {r.arquivo_key
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg-soft,#f1f5f9)", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, maxWidth: "100%" }}>
                      {r.arquivo_ct?.startsWith("image/") ? "🖼️" : r.arquivo_ct?.startsWith("audio/") ? "🎤" : "📎"}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{r.arquivo_nome || "anexo"}</span>
                      <button onClick={() => setArq(i, { arquivo_key: undefined, arquivo_nome: undefined, arquivo_ct: undefined })} title="Remover anexo" style={{ background: "transparent", border: 0, cursor: "pointer", color: "#dc2626", fontSize: 14, lineHeight: 1 }}>✕</button>
                    </span>
                  : <label className="btn btn-soft" style={{ fontSize: 12, cursor: subindoIdx === i ? "default" : "pointer" }}>
                      {subindoIdx === i ? "Subindo…" : "📎 Anexar foto/arquivo"}
                      <input type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,audio/*" style={{ display: "none" }} disabled={subindoIdx != null} onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(i, f); e.currentTarget.value = ""; }} />
                    </label>}
              </div>
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
  const carregandoChat = useRef(false);
  function carregar() {
    if (carregandoChat.current) return; // não empilha o poll em rede lenta
    carregandoChat.current = true;
    api.listarChat(canal).then(setMsgs).catch(() => {}).finally(() => { carregandoChat.current = false; });
  }
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
type Contato = { nome: string; telefone: string; origem: "cliente" | "whats" | "colado" | "crm" | "catalogo"; cidade?: string | null; uf?: string | null; falou?: boolean; palavras?: string; emCamp?: boolean; foto?: string | null; rep?: string | null; ultimaSaida?: string | null };
function NovaConversa({ onFechar, onAbrir, onMudou }: { onFechar: () => void; onAbrir: (id: string) => void; onMudou: () => void }) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Contato | null>(null);
  const [telManual, setTelManual] = useState("");
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [respostas, setRespostas] = useState<RespostaPronta[]>([]);   // respostas prontas p/ escolher
  const [anexo, setAnexo] = useState<File | null>(null);              // anexo opcional (arquivo local)
  const [respAnexo, setRespAnexo] = useState<{ arquivo_key: string; arquivo_nome?: string; arquivo_ct?: string } | null>(null); // anexo da resposta pronta escolhida
  useEffect(() => {
    Promise.allSettled([api.atendRespostasEmpresa(), api.atendRespostas()]).then(([e, m]) => {
      const emp = e.status === "fulfilled" ? e.value : [];
      const min = m.status === "fulfilled" ? m.value : [];
      // Inclui respostas que têm TEXTO ou ANEXO (uma resposta pode ser só um vídeo/foto).
      setRespostas([...emp, ...min].filter((r) => r.texto.trim() || r.arquivo_key));
    });
  }, []);

  useEffect(() => {
    // Junta a BASE DE CLIENTES (nome comercial, cidade) com os contatos do WhatsApp,
    // sem repetir número. Assim dá pra achar o cliente pelo nome da loja mesmo que
    // ele não esteja salvo na agenda do celular.
    Promise.allSettled([api.listarClientesCrm(), api.atendContatosWhatsapp()]).then(([cl, w]) => {
      const lista: Contato[] = [];
      const vistos = new Set<string>();
      const add = (nome: string, tel: string, origem: "cliente" | "whats", cidade?: string | null, uf?: string | null, foto?: string | null) => {
        const d = (tel || "").replace(/\D/g, "");
        if (d.length < 10) return;
        const key = d.slice(-11);
        if (vistos.has(key)) return;
        vistos.add(key);
        lista.push({ nome: nome || telBonito(d), telefone: d, origem, cidade, uf, foto: foto || null });
      };
      if (cl.status === "fulfilled") for (const c of cl.value) add(c.nome, c.whatsapp || "", "cliente", c.cidade, c.uf);
      if (w.status === "fulfilled") for (const c of (w.value.contatos || [])) add(c.nome, c.telefone, "whats", null, null, c.foto);
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
    if (!texto.trim() && !anexo && !respAnexo) { alert("Escreva a primeira mensagem ou anexe um arquivo."); return; }
    setBusy(true);
    try {
      const u = getUser();
      const autor = u?.nome || "Atendente";
      // Se a resposta pronta escolhida tem ANEXO (vídeo/foto), a conversa abre SEM texto e o
      // anexo + texto vão juntos via enviar-resposta (mídia + texto como mensagem separada).
      const r = await api.atendNovaConversa({ telefone: tel, texto: respAnexo ? undefined : (texto.trim() || undefined), nome: sel?.nome, responsavel: autor });
      if (respAnexo) {
        try { await api.atendEnviarResposta(r.conversa_id, { arquivo_key: respAnexo.arquivo_key, arquivo_nome: respAnexo.arquivo_nome, texto: texto.trim(), autor }); }
        catch (e) { alert("Conversa criada, mas não consegui enviar o anexo da resposta: " + ((e as Error)?.message || "erro")); }
      }
      if (anexo) {
        try { await api.atendEnviarArquivo(r.conversa_id, anexo, autor); }
        catch (e) { alert("Conversa criada, mas não consegui enviar o anexo: " + ((e as Error)?.message || "erro")); }
      }
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
              <button key={c.origem + c.telefone} type="button" onClick={() => { setSel(c); setTelManual(""); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid var(--line)", background: sel?.telefone === c.telefone ? "#eef2ff" : "transparent", cursor: "pointer", color: "var(--ink)" }}>
                <span style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", overflow: "hidden", background: c.foto ? "#e5e7eb" : corDoNome(c.nome), color: "#fff", fontSize: 12.5, fontWeight: 800 }}>
                  {c.foto ? <img src={c.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : iniciais(c.nome)}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><b>{c.nome}</b> <span className="muted" style={{ fontSize: 12 }}>{telBonito(c.telefone)}</span></div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {c.origem === "cliente" ? "📇 Cliente da base" : "📱 WhatsApp"}{c.cidade ? ` · ${c.cidade}${c.uf ? "/" + c.uf : ""}` : ""}
                  </div>
                </span>
              </button>
            ))}
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>ou digite o número (com DDD):</div>
        <input placeholder="Ex.: 35 9 9999-9999" value={telManual} onChange={(e) => { setTelManual(e.target.value); setSel(null); }} style={{ width: "100%", marginBottom: 10 }} />
        {/* Escolher uma RESPOSTA PRONTA: joga o texto no campo (dá pra editar). */}
        {respostas.length > 0 && (
          <select defaultValue="" onChange={(e) => { const r = respostas[Number(e.target.value)]; if (r) { setTexto(r.texto); setRespAnexo(r.arquivo_key ? { arquivo_key: r.arquivo_key, arquivo_nome: r.arquivo_nome, arquivo_ct: r.arquivo_ct } : null); } e.currentTarget.selectedIndex = 0; }}
            style={{ width: "100%", marginBottom: 6, fontSize: 13, padding: "8px 9px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-soft,#fff)", color: "var(--ink)", fontFamily: "inherit" }}>
            <option value="">📋 Usar uma resposta pronta…</option>
            {respostas.map((r, i) => <option key={i} value={i}>{(r.arquivo_key ? "📎 " : "") + (r.titulo || r.texto.slice(0, 40) || "anexo")}</option>)}
          </select>
        )}
        {respAnexo && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, color: "#155e75" }}>
            {respAnexo.arquivo_ct?.startsWith("image/") ? "🖼️" : respAnexo.arquivo_ct?.startsWith("video/") ? "🎬" : "📎"}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>Anexo da resposta: {respAnexo.arquivo_nome || "arquivo"} — vai junto</span>
            <button onClick={() => setRespAnexo(null)} title="Não enviar o anexo" style={{ background: "transparent", border: 0, cursor: "pointer", color: "#0e7490", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>
        )}
        <textarea placeholder="Escreva a primeira mensagem… (opcional se anexar arquivo)" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} />
        {/* Anexo opcional (foto/arquivo) — enviado logo depois da mensagem. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          {anexo
            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg-soft,#f1f5f9)", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, maxWidth: "100%" }}>
                {anexo.type.startsWith("image/") ? "🖼️" : anexo.type.startsWith("video/") ? "🎬" : "📎"}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{anexo.name}</span>
                <button onClick={() => setAnexo(null)} title="Remover anexo" style={{ background: "transparent", border: 0, cursor: "pointer", color: "#dc2626", fontSize: 14, lineHeight: 1 }}>✕</button>
              </span>
            : <label className="btn btn-soft" style={{ fontSize: 12.5, cursor: "pointer" }}>📎 Anexar foto/arquivo
                <input type="file" accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,audio/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 40 * 1024 * 1024) { alert("Arquivo acima de 40 MB. Comprima e tente de novo."); } else setAnexo(f); } e.currentTarget.value = ""; }} />
              </label>}
        </div>
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
  const [avisarDias, setAvisarDias] = useState("3");   // avisa se JÁ enviei mensagem nos últimos N dias
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [colar, setColar] = useState("");           // prospecção: colar lista de números
  const [mostrarColar, setMostrarColar] = useState(false);
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);  // puxar quem viu o catálogo
  const [diasCat, setDiasCat] = useState("60");
  const [puxando, setPuxando] = useState(false);
  const [anexo, setAnexo] = useState<{ url: string; tipo: string; nome: string; ext: string } | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);   // editando uma campanha existente
  const arqRef = useRef<HTMLInputElement>(null);
  async function subirAnexo(file: File) {
    if (file.size > 40 * 1024 * 1024) { alert("Arquivo muito grande (máx. 40MB)."); return; }
    setSubindo(true);
    try { const r = await api.atendCampanhaUpload(file); if (r.error) { alert(r.error); return; } setAnexo({ url: r.url, tipo: r.tipo, nome: r.nome, ext: r.ext }); }
    catch { alert("Não consegui subir o arquivo."); } finally { setSubindo(false); }
  }
  const [campanhas, setCampanhas] = useState<{ id: string; nome: string | null; mensagem: string; status: string; total: number; enviados: number; pendentes: number; falhas: number; iniciar_em: string | null; arquivo_url: string | null; arquivo_tipo: string | null; arquivo_nome: string | null; arquivo_ext: string | null }[]>([]);
  function carregarCampanhas() { api.atendCampanhas().then(setCampanhas).catch(() => {}); }
  useEffect(() => {
    const u = getUser();
    Promise.allSettled([api.listarClientesCrm(), api.atendContatosWhatsapp(), api.atendRespostasEmpresa(), api.atendBoard(u?.nome, ehGestorAtend()), api.atendInteressesContatos(), api.atendContatosEmCampanha()]).then(([cl, w, emp, bd, ie, ec]) => {
      const lista: Contato[] = []; const idx = new Map<string, Contato>();
      const add = (n: string, tel: string, origem: Contato["origem"], cidade?: string | null, uf?: string | null, falou = false, ultimaSaida?: string | null) => {
        const d = (tel || "").replace(/\D/g, ""); if (d.length < 10 || d.length > 13) return;  // fora do tamanho BR: ignora
        const key = nucleoTel(d); const ex = idx.get(key);
        if (ex) { if (falou) ex.falou = true; if (ultimaSaida && (!ex.ultimaSaida || ultimaSaida > ex.ultimaSaida)) ex.ultimaSaida = ultimaSaida; if ((!ex.nome || ex.nome === telBonito(ex.telefone)) && n) ex.nome = n; return; }
        const c: Contato = { nome: n || telBonito(d), telefone: d, origem, cidade, uf, falou, ultimaSaida: ultimaSaida || null };
        idx.set(key, c); lista.push(c);
      };
      if (cl.status === "fulfilled") for (const c of cl.value) add(c.nome, c.whatsapp || "", "cliente", c.cidade, c.uf);
      // "Já falaram com a gente": conversas do CRM com mensagem RECEBIDA do cliente. Guarda também a
      // ÚLTIMA SAÍDA (ultima_out_em) pra avisar se você já mandou mensagem recente pra esse contato.
      if (bd.status === "fulfilled") for (const cv of bd.value.conversas) if (cv.telefone && cv.ultima_in_em && cv.estado !== "grupo") add(cv.contato_nome || cv.nome || "", cv.telefone, "crm", cv.cidade, cv.uf, true, cv.ultima_out_em);
      if (w.status === "fulfilled") for (const c of (w.value.contatos || [])) add(c.nome, c.telefone, "whats");
      // Palavras-chave (interesses + última mensagem) pra busca por assunto.
      if (ie.status === "fulfilled") for (const p of (ie.value.contatos || [])) { const ex = idx.get(nucleoTel(p.telefone || "")); if (ex) ex.palavras = (p.palavras || "").toLowerCase(); }
      // Quem já está em alguma campanha → marca pra você não mandar de novo sem querer.
      if (ec.status === "fulfilled") for (const tel of (ec.value.telefones || [])) { const ex = idx.get(nucleoTel(tel || "")); if (ex) ex.emCamp = true; }
      lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setContatos(lista);
      if (emp.status === "fulfilled") { const conv = emp.value.find((r) => /cadast/i.test(r.titulo)); if (conv) setMensagem(conv.texto); }
    }).finally(() => setCarregando(false));
    carregarCampanhas();
  }, []);
  const [fonte, setFonte] = useState<"todos" | "cliente" | "falou" | "colado" | "catalogo">("todos");
  const CAP_CONTATOS = 1000; // limite de exibição (perf). O resto acha-se pela busca.
  const casaFonte = (c: Contato, f: typeof fonte) => f === "todos" || (f === "cliente" ? c.origem === "cliente" : f === "falou" ? !!c.falou : f === "catalogo" ? c.origem === "catalogo" : c.origem === "colado");
  const porFonte = (c: Contato) => casaFonte(c, fonte);
  const filtrados = (() => {
    const q = busca.trim().toLowerCase();
    const base = contatos.filter(porFonte);
    if (!q) return base.slice(0, CAP_CONTATOS);
    const dig = q.replace(/\D/g, "");
    // Busca por NOME, CIDADE/UF ou NÚMERO — sobre a fonte escolhida (não só os que estão à mostra).
    return base.filter((c) =>
      c.nome.toLowerCase().includes(q)
      || (c.cidade || "").toLowerCase().includes(q)
      || (c.uf || "").toLowerCase() === q
      || (c.palavras || "").includes(q)          // palavra-chave: assunto/interesse/última mensagem
      || (dig.length >= 3 && c.telefone.includes(dig))
    ).slice(0, CAP_CONTATOS);
  })();
  const contarFonte = (f: typeof fonte) => contatos.filter((c) => casaFonte(c, f)).length;
  // "Enviei recente?": true se a ÚLTIMA saída pra esse contato foi dentro dos últimos N dias (0 = desliga o aviso).
  const diasRecente = Math.max(0, Number(avisarDias) || 0);
  const ehRecente = (c: Contato) => !!c.ultimaSaida && diasRecente > 0 && (Date.now() - new Date(String(c.ultimaSaida).replace(" ", "T") + "Z").getTime()) < diasRecente * 864e5;
  // PROSPECÇÃO: cola uma lista de números (1 por linha, ou separados por vírgula) — inclusive de
  // quem NÃO está na base. Vira contato selecionado na campanha. Aceita "Nome, número" ou só número.
  function adicionarColados() {
    const linhas = colar.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const existentes = new Map(contatos.map((c) => [nucleoTel(c.telefone), c] as const));
    const novos: Contato[] = [];
    const selNovos = new Set<string>();
    const vistos = new Set<string>();
    let add = 0, jaTinha = 0;
    for (const raw of linhas) {
      // Tira numeração de lista no começo ("95." / "95)" / "95 -") pra não colar no telefone.
      const ln = raw.replace(/^\s*\d{1,3}\s*[.):\-]\s+/, "");
      // "Nome | número" ou "Nome, número": separa a parte do número (a última) do nome.
      const partes = ln.split(/[|;]/);
      const telParte = partes.length > 1 ? partes[partes.length - 1] : ln;
      const nomeParte = partes.length > 1 ? partes.slice(0, -1).join(" ") : "";
      let dig = telParte.replace(/\D/g, "");
      // 12-13 dígitos que NÃO começam com 55 = provavelmente tem lixo colado na frente
      // (ex.: o número da lista "95"): fica com os últimos 11.
      if (dig.length >= 12 && !dig.startsWith("55")) dig = dig.slice(-11);
      if (dig.length < 10 || dig.length > 13) continue;      // fora do tamanho de telefone BR: ignora
      const tel = dig.length <= 11 ? "55" + dig : dig;       // sem DDI → assume Brasil
      let nm = (nomeParte || ln).replace(/[+\d()\-.,;|]/g, " ").replace(/\s+/g, " ").trim();
      if (/^sem nome$/i.test(nm)) nm = "";
      const key = nucleoTel(tel);
      const ex = existentes.get(key);
      if (ex) { selNovos.add(ex.telefone); jaTinha++; continue; }   // já está na lista → só seleciona
      if (vistos.has(key)) continue; vistos.add(key);
      novos.push({ nome: nm || telBonito(tel), telefone: tel, origem: "colado" });
      selNovos.add(tel); add++;
    }
    if (!add && !jaTinha) { alert("Não encontrei números válidos (precisa de DDD + número, ex.: (11) 99999-8888)."); return; }
    if (novos.length) setContatos((cs) => [...novos, ...cs]);
    setSel((s) => { const n = new Set(s); selNovos.forEach((t) => n.add(t)); return n; });
    setColar("");
    alert(`✓ ${add} número(s) novo(s) adicionado(s)` + (jaTinha ? ` e ${jaTinha} que já estava(m) na base foram selecionados.` : "."));
  }
  // CATÁLOGO: puxa quem VISUALIZOU o catálogo (últimos N dias) e adiciona à lista, já selecionados.
  // O backend já tira bloqueados e descadastrados. Nome do vendedor/região vão pra busca (palavras).
  async function puxarCatalogo() {
    setPuxando(true);
    try {
      const r = await api.atendFonteCatalogo(Math.max(1, Number(diasCat) || 60));
      if (r.error) { alert(r.error); return; }
      if (!r.viewers?.length) { alert(`Ninguém visualizou o catálogo nos últimos ${r.dias} dias (ou o log está vazio).`); return; }
      const idx = new Map(contatos.map((c) => [nucleoTel(c.telefone), c] as const));
      const novos: Contato[] = []; const selNovos = new Set<string>();
      for (const v of r.viewers) {
        const d = (v.telefone || "").replace(/\D/g, ""); if (d.length < 10 || d.length > 13) continue;
        const palavras = [v.rep, v.regiao].filter(Boolean).join(" ").toLowerCase();  // busca por vendedor/região
        const ex = idx.get(nucleoTel(d));
        if (ex) { selNovos.add(ex.telefone); if (palavras) ex.palavras = ((ex.palavras || "") + " " + palavras).trim(); continue; }
        if (novos.some((n) => nucleoTel(n.telefone) === nucleoTel(d))) continue;
        novos.push({ nome: v.nome || telBonito(d), telefone: d, origem: "catalogo", uf: v.regiao || null, rep: v.rep || null, palavras });
        selNovos.add(d);
      }
      if (novos.length) setContatos((cs) => [...novos, ...cs]);
      setSel((s) => { const n = new Set(s); selNovos.forEach((t) => n.add(t)); return n; });
      setFonte("catalogo"); setMostrarCatalogo(false);
      const extra = (r.bloqueados || r.optout) ? ` (pulei ${r.bloqueados} bloqueado[s] e ${r.optout} descadastrado[s])` : "";
      alert(`✓ ${selNovos.size} contato(s) que viram o catálogo nos últimos ${r.dias} dias, já selecionados${extra}. Escreva a mensagem e crie a campanha.`);
    } catch (e) { alert((e as Error).message || "Não consegui puxar a lista do catálogo."); } finally { setPuxando(false); }
  }
  const toggle = (tel: string) => setSel((s) => { const n = new Set(s); if (n.has(tel)) n.delete(tel); else n.add(tel); return n; });
  const marcarFiltrados = () => setSel((s) => { const n = new Set(s); filtrados.forEach((c) => n.add(c.telefone)); return n; });
  const limpar = () => setSel(new Set());
  async function criar(rascunho = false) {
    if (!mensagem.trim() && !anexo) { alert("Escreva a mensagem ou anexe uma foto/arquivo."); return; }
    if (sel.size === 0) { alert("Selecione pelo menos um contato."); return; }
    const jaEmCamp = contatos.filter((c) => sel.has(c.telefone) && c.emCamp).length;
    if (jaEmCamp && !confirm(`⚠️ ${jaEmCamp} contato(s) selecionado(s) JÁ estão em outra campanha. Quer incluir mesmo assim?`)) return;
    // Aviso: contatos que JÁ receberam mensagem sua nos últimos N dias (pra não parecer spam).
    const recentes = contatos.filter((c) => sel.has(c.telefone) && ehRecente(c)).length;
    if (recentes && !confirm(`⚠️ ${recentes} contato(s) selecionado(s) JÁ receberam uma mensagem sua nos últimos ${diasRecente} dia(s). Mandar a campanha pra eles também?`)) return;
    if (!rascunho && !confirm(`Criar e ENVIAR a campanha para ${sel.size} contato(s)? A Big vai enviando 1 a cada ${intervalo}s pra não bloquear o número.`)) return;
    setBusy(true);
    try {
      const alvos = contatos.filter((c) => sel.has(c.telefone)).map((c) => ({ telefone: c.telefone, nome: c.nome }));
      const r = await api.atendCriarCampanha({ nome: nome.trim() || undefined, mensagem: mensagem.trim(), intervalo_seg: Number(intervalo) || 40, alvos, rascunho, arquivo_url: anexo?.url, arquivo_tipo: anexo?.tipo, arquivo_nome: anexo?.nome, arquivo_ext: anexo?.ext });
      if (r.error) { alert(r.error); return; }
      alert(rascunho
        ? `Campanha salva como rascunho (${r.total} contato[s]). Ela NÃO envia até você clicar em "▶️ Ativar" na lista abaixo.`
        : `Campanha criada! ${r.total} contato(s). A Big começa a enviar aos poucos.`);
      setSel(new Set()); setNome(""); setAnexo(null); carregarCampanhas();
    } catch (e) { alert((e as Error).message || "Não consegui criar a campanha."); } finally { setBusy(false); }
  }
  async function mudarStatus(id: string, status: string) { await api.atendStatusCampanha(id, status).catch(() => {}); carregarCampanhas(); }
  function editar(cmp: typeof campanhas[number]) {
    setEditandoId(cmp.id);
    setNome(cmp.nome || "");
    setMensagem(cmp.mensagem || "");
    setAnexo(cmp.arquivo_url ? { url: cmp.arquivo_url, tipo: cmp.arquivo_tipo || "arquivo", nome: cmp.arquivo_nome || "anexo", ext: cmp.arquivo_ext || "bin" } : null);
    setSel(new Set());
    const el = document.querySelector(".modal-card"); if (el) el.scrollTop = 0;
  }
  function cancelarEdicao() { setEditandoId(null); setNome(""); setMensagem(""); setAnexo(null); }
  async function salvarEdicao() {
    if (!editandoId) return;
    if (!mensagem.trim() && !anexo) { alert("Escreva a mensagem ou anexe uma foto/arquivo."); return; }
    setBusy(true);
    try {
      const r = await api.atendEditarCampanha(editandoId, { nome: nome.trim() || undefined, mensagem: mensagem.trim(), intervalo_seg: Number(intervalo) || 40, arquivo_url: anexo?.url, arquivo_tipo: anexo?.tipo, arquivo_nome: anexo?.nome, arquivo_ext: anexo?.ext });
      if (r.error) { alert(r.error); return; }
      alert("✓ Campanha atualizada! (o texto/foto novos valem pros contatos que ainda não receberam)");
      cancelarEdicao(); carregarCampanhas();
    } catch { alert("Não consegui salvar as alterações."); } finally { setBusy(false); }
  }
  async function dispararAgora(id: string) {
    try {
      const r = await api.atendDispararCampanha(id);
      if (r.enviado) alert("✓ Enviei já a próxima mensagem! O resto segue sozinho, 1 a cada X segundos.");
      else alert("Não enviou agora — motivo: " + (r.motivo || "desconhecido") + ".");
      carregarCampanhas();
    } catch { alert("Não consegui disparar agora."); }
  }
  // Reusar uma campanha: carrega a MESMA lista de contatos e pré-preenche texto/foto pra você
  // só alterar e disparar de novo (sem re-selecionar tudo).
  async function reusar(cmp: typeof campanhas[number]) {
    setBusy(true);
    try {
      const r = await api.atendCampanhaAlvos(cmp.id);
      const novos: Contato[] = []; const selNovos = new Set<string>();
      const idx = new Map(contatos.map((c) => [nucleoTel(c.telefone), c] as const));
      for (const a of (r.alvos || [])) {
        const d = (a.telefone || "").replace(/\D/g, ""); if (d.length < 10 || d.length > 13) continue;
        const ex = idx.get(nucleoTel(d));
        if (ex) { selNovos.add(ex.telefone); continue; }
        if (novos.some((n) => nucleoTel(n.telefone) === nucleoTel(d))) continue;
        novos.push({ nome: a.nome || telBonito(d), telefone: d, origem: "colado" }); selNovos.add(d);
      }
      if (novos.length) setContatos((cs) => [...novos, ...cs]);
      setSel(selNovos);
      setNome(cmp.nome ? `${cmp.nome} (cópia)` : "");
      setMensagem(cmp.mensagem || "");
      setAnexo(cmp.arquivo_url ? { url: cmp.arquivo_url, tipo: cmp.arquivo_tipo || "arquivo", nome: cmp.arquivo_nome || "anexo", ext: cmp.arquivo_ext || "bin" } : null);
      alert(`Lista da campanha carregada (${selNovos.size} contato[s]). Altere o texto/foto e clique em "📣 Criar e enviar".`);
    } catch { alert("Não consegui carregar a lista dessa campanha."); } finally { setBusy(false); }
  }
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
          {/* Anexo (foto/arquivo) opcional — vai pra todos os contatos */}
          <input ref={arqRef} type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) subirAnexo(f); e.currentTarget.value = ""; }} />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!anexo
              ? <button className="btn btn-soft" disabled={subindo} onClick={() => arqRef.current?.click()}>{subindo ? "Subindo…" : "📎 Anexar foto/arquivo"}</button>
              : <span style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, background: "var(--bg-soft,#f8fafc)" }}>
                  {anexo.tipo === "imagem" ? "🖼️" : anexo.tipo === "audio" ? "🎤" : "📎"} {anexo.nome}
                  <button onClick={() => setAnexo(null)} title="Remover anexo" style={{ background: "transparent", border: 0, cursor: "pointer", color: "#b91c1c", fontSize: 14 }}>✕</button>
                </span>}
            {anexo && <span className="muted2" style={{ fontSize: 11.5 }}>{anexo.tipo === "imagem" ? "A mensagem vai como legenda da foto." : "A foto/arquivo vai primeiro; a mensagem em seguida."}</span>}
          </div>
          {anexo && anexo.tipo === "imagem" && <img src={anexo.url} alt="anexo" style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8, marginTop: 6, border: "1px solid var(--line)" }} />}
          <label className="fld" style={{ marginTop: 8, display: "inline-flex", flexDirection: "column" }}>Enviar 1 a cada
            <span><input type="number" min={15} max={600} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} style={{ width: 70 }} /> segundos <span className="muted2">(recomendado ≥ 40s)</span></span>
          </label>
          <label className="fld" style={{ marginTop: 8, display: "inline-flex", flexDirection: "column" }}>⚠️ Avisar se já enviei nos últimos
            <span><input type="number" min={0} max={90} value={avisarDias} onChange={(e) => setAvisarDias(e.target.value)} style={{ width: 70 }} /> dia(s) <span className="muted2">(0 = não avisar)</span></span>
          </label>
          <div style={{ marginTop: 10, marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>Contatos</b>
            <span className="at-chip" style={{ background: "#eef2ff", color: "#4338ca" }}>{sel.size} selecionado(s)</span>
            <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={marcarFiltrados}>Selecionar os {filtrados.length} da busca</button>
            <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => setMostrarColar((v) => !v)}>📋 Colar lista de números</button>
            <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => setMostrarCatalogo((v) => !v)}>📖 Puxar quem viu o catálogo</button>
            {sel.size > 0 && <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={limpar}>Limpar</button>}
          </div>
          {mostrarCatalogo && (
            <div style={{ margin: "0 0 8px", padding: 10, border: "1px dashed var(--line)", borderRadius: 10, background: "var(--bg-soft,#f8fafc)" }}>
              <div className="muted2" style={{ fontSize: 12, marginBottom: 6 }}>Puxa <b>quem visualizou o catálogo</b> (do log do catálogo). Já tira <b>bloqueados</b> e <b>descadastrados</b>. Depois, pra filtrar por <b>vendedor</b> ou <b>região</b>, é só digitar no campo de busca abaixo.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label className="muted2" style={{ fontSize: 12.5 }}>Últimos <input type="number" min={1} max={365} value={diasCat} onChange={(e) => setDiasCat(e.target.value)} style={{ width: 64, margin: "0 4px" }} /> dias</label>
                <button className="btn btn-primary" style={{ fontSize: 12.5 }} disabled={puxando} onClick={puxarCatalogo}>{puxando ? "Puxando…" : "📖 Puxar e selecionar"}</button>
              </div>
            </div>
          )}
          {mostrarColar && (
            <div style={{ margin: "0 0 8px", padding: 10, border: "1px dashed var(--line)", borderRadius: 10, background: "var(--bg-soft,#f8fafc)" }}>
              <div className="muted2" style={{ fontSize: 12, marginBottom: 6 }}>Cole os números (1 por linha, ou separados por vírgula). Pode ser <b>"Nome, número"</b> ou só o número. Serve pra prospecção — <b>inclusive de quem ainda não está na base</b>.</div>
              <textarea value={colar} onChange={(e) => setColar(e.target.value)} rows={4} placeholder={"Ex.:\nMaria, (11) 99999-8888\n(31) 98888-7777\n5541977776666"} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={adicionarColados}>➕ Adicionar à lista</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {([["todos", "Todos"], ["cliente", "📇 Base de clientes"], ["falou", "💬 Já falaram aqui"], ["catalogo", "📖 Viram o catálogo"], ["colado", "📋 Colados"]] as const).map(([f, lb]) => (
              <button key={f} className={"at-chip" + (fonte === f ? " on" : "")} onClick={() => setFonte(f)}>{lb} ({contarFonte(f)})</button>
            ))}
          </div>
          <input placeholder="🔎 Buscar por nome, cidade, número ou palavra-chave (ex.: manta, almofada)…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
            {carregando ? <div className="muted" style={{ padding: 12 }}>Carregando contatos…</div>
              : filtrados.length === 0 ? <div className="muted" style={{ padding: 12 }}>Nenhum contato.</div>
              : filtrados.map((c) => (
                <label key={c.origem + c.telefone} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
                  <input type="checkbox" checked={sel.has(c.telefone)} onChange={() => toggle(c.telefone)} />
                  <div><div><b>{c.nome}</b> <span className="muted" style={{ fontSize: 12 }}>{telBonito(c.telefone)}</span>
                    {c.emCamp && <span className="at-chip" style={{ background: "#fef3c7", color: "#92400e", fontSize: 10, marginLeft: 6 }} title="Este contato já está em outra campanha">📣 já em campanha</span>}
                    {ehRecente(c) && <span className="at-chip" style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 10, marginLeft: 6 }} title={`Você já enviou mensagem pra este contato nos últimos ${diasRecente} dia(s)`}>⚠️ enviado recente</span>}</div>
                    <div className="muted2" style={{ fontSize: 11 }}>{c.origem === "cliente" ? "📇 base" : c.origem === "colado" ? "📋 colado" : c.origem === "crm" ? "💬 já falou" : c.origem === "catalogo" ? "📖 viu o catálogo" : "📱 zap"}{c.rep ? ` · 👤 ${c.rep}` : ""}{c.falou && c.origem !== "crm" ? " · 💬 já falou" : ""}{c.cidade ? ` · ${c.cidade}${c.uf ? "/" + c.uf : ""}` : (c.uf ? ` · ${c.uf}` : "")}</div></div>
                </label>
              ))}
          </div>
          {!carregando && contatos.length > filtrados.length && (
            <div className="muted2" style={{ fontSize: 11, marginTop: 5 }}>
              Mostrando {filtrados.length} de <b>{contatos.length}</b> contatos. Pra achar qualquer um (inclusive além do que aparece aqui), <b>digite no campo acima</b> — nome, cidade ou número. A busca varre a lista toda. 🔎
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            {editandoId ? (<>
              <span className="muted2" style={{ fontSize: 12, alignSelf: "center", marginRight: "auto" }}>✏️ Editando campanha (a lista de contatos não muda)</span>
              <button className="btn btn-soft" disabled={busy} onClick={cancelarEdicao}>Cancelar</button>
              <button className="kbtn go" disabled={busy} onClick={salvarEdicao}>{busy ? "Salvando…" : "💾 Salvar alterações"}</button>
            </>) : (<>
              <button className="btn btn-soft" disabled={busy} onClick={() => criar(true)} title="Salva a campanha sem enviar. Você ativa depois na lista abaixo.">💾 Salvar rascunho</button>
              <button className="kbtn go" disabled={busy} onClick={() => criar(false)}>{busy ? "Criando…" : `📣 Criar e enviar (${sel.size})`}</button>
            </>)}
          </div>

          {campanhas.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Campanhas</div>
              {campanhas.map((c) => (
                <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 12.5 }}>{c.nome || "Campanha"}</b>
                    <span className="at-chip" style={{ background: c.status === "concluida" ? "#dcfce7" : c.status === "pausada" ? "#fef3c7" : "#e0f2fe", color: "#1e293b", fontSize: 11 }}>{c.status}</span>
                    {(() => { const ini = c.iniciar_em ? Date.parse(c.iniciar_em.replace(" ", "T") + "Z") : 0; return ini && ini > Date.now() && c.enviados === 0 ? <span className="at-chip" style={{ background: "#dbeafe", color: "#1d4ed8", fontSize: 11 }}>⏰ agendada: {new Date(ini).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span> : null; })()}
                    <span className="muted2" style={{ fontSize: 11.5, marginLeft: "auto" }}>{c.enviados}/{c.total} enviados{c.falhas ? ` · ${c.falhas} falha(s)` : ""}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-soft,#eef2f7)", borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${c.total ? Math.round((c.enviados / c.total) * 100) : 0}%`, background: "#22c55e" }} />
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {c.status !== "concluida" && (c.status === "ativa"
                      ? <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => mudarStatus(c.id, "pausada")}>⏸ Pausar</button>
                      : <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => mudarStatus(c.id, "ativa")}>▶️ Retomar</button>)}
                    {c.status !== "concluida" && c.pendentes > 0 && <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px", color: "#15803d", fontWeight: 700 }} onClick={() => dispararAgora(c.id)} title="Manda já a próxima mensagem (sem esperar o cron de 5 min)">🚀 Disparar agora</button>}
                    {c.status !== "concluida" && <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => editar(c)} title="Editar o texto/foto/nome desta campanha (a lista de contatos não muda)">✏️ Editar</button>}
                    {c.status !== "concluida" && <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px", color: "#dc2626" }} onClick={() => mudarStatus(c.id, "concluida")}>⏹ Encerrar</button>}
                    <button className="btn btn-soft" style={{ fontSize: 11.5, padding: "3px 8px", color: "#2563eb" }} disabled={busy} onClick={() => reusar(c)} title="Usa a MESMA lista de contatos numa campanha nova — você só altera o texto/foto">♻️ Reusar (mesma lista)</button>
                  </div>
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
