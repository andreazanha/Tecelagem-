import { useEffect, useReducer, useState } from "react";
import { NavLink, Outlet, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { VERSION } from "../version";
import { historico } from "../historico";
import { getUser, setUser, pode } from "../auth";
import { pushSuportado, pushAtivo, ativarPush, desativarPush } from "../push";

// Sino de avisos: liga/desliga o Web Push de "pedido novo" neste aparelho.
function SinoPush() {
  const [ativo, setAtivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    pushAtivo().then(setAtivo).catch(() => {});
  }, []);
  if (!pushSuportado()) return null;
  async function alternar() {
    setOcupado(true);
    try {
      if (ativo) {
        await desativarPush();
        setAtivo(false);
      } else {
        const r = await ativarPush();
        if (r.ok) setAtivo(true);
        else alert(r.erro || "Não foi possível ativar os avisos.");
      }
    } finally {
      setOcupado(false);
    }
  }
  return (
    <button
      className="ur-btn"
      onClick={alternar}
      disabled={ocupado}
      title={ativo ? "Avisos de pedido novo LIGADOS neste aparelho. Clique para desligar." : "Receber aviso (notificação) quando entrar pedido novo, mesmo com o sistema fechado."}
    >
      {ativo ? "🔔 Avisos on" : "🔕 Avisos"}
    </button>
  );
}

function UndoRedo() {
  const [, forcar] = useReducer((x) => x + 1, 0);
  useEffect(() => historico.subscribe(forcar), []);
  useEffect(() => {
    function k(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        historico.desfazer().catch((err) => alert((err as Error).message));
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        historico.refazer().catch((err) => alert((err as Error).message));
      }
    }
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <div className="undoredo">
      <button
        className="ur-btn"
        disabled={!historico.podeDesfazer()}
        title={historico.podeDesfazer() ? `Desfazer ${historico.rotuloDesfazer()} (Ctrl+Z)` : "Nada para desfazer"}
        onClick={() => historico.desfazer().catch((e) => alert((e as Error).message))}
      >
        ↶ Desfazer
      </button>
      <button
        className="ur-btn"
        disabled={!historico.podeRefazer()}
        title={historico.podeRefazer() ? `Refazer ${historico.rotuloRefazer()} (Ctrl+Y)` : "Nada para refazer"}
        onClick={() => historico.refazer().catch((e) => alert((e as Error).message))}
      >
        ↷ Refazer
      </button>
    </div>
  );
}

// Item do menu. `page` = permissão da tela (se ausente e sem `soon`, é livre).
// `soon` = página ainda não existe → aparece só para admin, desabilitada (sem 404).
interface MenuItem { to?: string; icon: string; label: string; page?: string; soon?: boolean }
interface MenuGrupo { id: string; icon: string; label: string; itens: MenuItem[] }

// Menu em grupos sanfonados. Itens existentes apontam para rotas reais (alguns
// para abas via ?aba=). Itens sem página ainda ficam como "em breve".
const GRUPOS: MenuGrupo[] = [
  {
    id: "comercial", icon: "🛒", label: "Comercial", itens: [
      { to: "/pedidos", icon: "📦", label: "Pedidos", page: "pedidos" },
      { to: "/todos-pedidos", icon: "📋", label: "Todos os Pedidos", page: "todos-pedidos" },
      { to: "/pedidos/novo", icon: "➕", label: "Novo Pedido", page: "pedidos" },
      { icon: "👥", label: "Clientes", soon: true },
      { to: "/comercial", icon: "🧑‍💼", label: "Representantes", page: "comercial" },
      { to: "/comercial", icon: "💵", label: "Vendas (Dashboard)", page: "comercial" },
    ],
  },
  {
    id: "producao", icon: "🏭", label: "Produção", itens: [
      { to: "/producao", icon: "🧶", label: "Tecelagem", page: "producao" },
      { to: "/passadoria", icon: "🔥", label: "Passadoria", page: "passadoria" },
      { to: "/corte", icon: "✂️", label: "Corte", page: "corte" },
      { to: "/costura", icon: "🪡", label: "Costura", page: "costura" },
      { to: "/revisao", icon: "🔍", label: "Revisão", page: "revisao" },
    ],
  },
  {
    id: "estoque", icon: "📊", label: "Estoque e Insumos", itens: [
      { to: "/estoque", icon: "📦", label: "Entradas", page: "estoque" },
      { to: "/produtos", icon: "🛍️", label: "Produtos", page: "produtos" },
      { to: "/produtos?aba=insumos", icon: "🧷", label: "Insumos", page: "produtos" },
      { to: "/produtos?aba=entradas", icon: "⬇️", label: "Entrada de Estoque", page: "produtos" },
      { to: "/produtos?aba=ficha", icon: "🧵", label: "Ficha Técnica", page: "produtos" },
    ],
  },
  {
    id: "expedicao", icon: "🚚", label: "Expedição", itens: [
      { to: "/expedicao", icon: "📮", label: "Expedição", page: "expedicao" },
      { to: "/transporte", icon: "🚚", label: "Transporte", page: "transporte" },
      { to: "/romaneios", icon: "📋", label: "Romaneios", page: "romaneios" },
      { icon: "🏷️", label: "Etiquetas", soon: true },
      { icon: "✅", label: "Conferência Final", soon: true },
    ],
  },
  {
    id: "fiscal", icon: "🧾", label: "Fiscal e Financeiro", itens: [
      { to: "/fiscal", icon: "🧾", label: "Fiscal", page: "fiscal" },
      { icon: "📄", label: "Notas Fiscais", soon: true },
      { icon: "💰", label: "Contas a Receber", soon: true },
      { icon: "📊", label: "Relatórios Fiscais", soon: true },
    ],
  },
  {
    id: "cadastros", icon: "🗂️", label: "Cadastros", itens: [
      { icon: "👥", label: "Clientes", soon: true },
      { to: "/produtos", icon: "🛍️", label: "Produtos", page: "produtos" },
      { to: "/cadastros?aba=cores", icon: "🎨", label: "Cores", page: "cadastros" },
      { icon: "📏", label: "Tamanhos", soon: true },
      { to: "/cadastros?aba=usuarios", icon: "🔐", label: "Usuários", page: "cadastros" },
      { icon: "🪡", label: "Costureiras", soon: true },
      { icon: "🤝", label: "Terceiros", soon: true },
      { icon: "🚛", label: "Fornecedores", soon: true },
    ],
  },
  {
    id: "relatorios", icon: "📈", label: "Relatórios", itens: [
      { to: "/dashboard", icon: "📺", label: "Painel Geral", page: "tv-dashboard" },
      { icon: "🏭", label: "Produção", soon: true },
      { icon: "⏰", label: "Atrasos", soon: true },
      { icon: "🔍", label: "Revisão", soon: true },
      { icon: "🪡", label: "Costureiras", soon: true },
      { icon: "📦", label: "Estoque", soon: true },
      { icon: "💵", label: "Vendas", soon: true },
    ],
  },
  {
    id: "config", icon: "⚙️", label: "Configurações", itens: [
      { to: "/cadastros?aba=usuarios", icon: "🔐", label: "Permissões", page: "cadastros" },
      { icon: "🎛️", label: "Parâmetros", soon: true },
      { icon: "💤", label: "Proteção de Tela", soon: true },
      { icon: "🔌", label: "Integrações", soon: true },
      { icon: "🕑", label: "Histórico do Sistema", soon: true },
    ],
  },
];
const TVS = [
  { to: "/dashboard", icon: "📺", label: "Painel TV", page: "tv-dashboard", cls: "painel-link" },
  { to: "/tv/tecelagem", icon: "🧵", label: "TV Tecelagem", page: "tv-tecelagem", cls: "painel-link tcl-link" },
  { to: "/tv/costura", icon: "🪡", label: "TV Costura", page: "tv-costura", cls: "painel-link tcl-link" },
  { to: "/tv/revisao", icon: "🔍", label: "TV Revisão", page: "tv-revisao", cls: "painel-link tcl-link" },
  { to: "/tv/novo-pedido", icon: "🔔", label: "TV Novo Pedido", page: "tv-novo-pedido", cls: "painel-link tcl-link" },
];

// Um item aparece se: for livre, se o usuário tem a permissão, ou (se "em breve")
// apenas para admin — desabilitado, sem 404.
function itemVisivel(u: ReturnType<typeof getUser>, it: MenuItem): boolean {
  if (it.soon) return !!u?.admin;
  if (it.page) return pode(u, it.page);
  return true;
}

// Escolhe UM item ativo (match exato de aba, senão prefixo mais longo do caminho).
function itemAtivo(to: string, loc: ReturnType<typeof useLocation>): number {
  const [p, q] = to.split("?");
  const abaAtual = new URLSearchParams(loc.search).get("aba") || "";
  if (loc.pathname === p) {
    if (q) return q.replace("aba=", "") === abaAtual ? 100 : -1;
    return abaAtual ? 40 : 90;
  }
  if (loc.pathname.startsWith(p + "/")) return p.length; // sub-rota (ex.: detalhe)
  return -1;
}

// Menu lateral em grupos sanfonados + favoritos, com memória por usuário.
function SidebarMenu({ u, min }: { u: NonNullable<ReturnType<typeof getUser>>; min: boolean }) {
  const loc = useLocation();
  const chave = u.id || u.usuario || "anon";
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`menu-grupos-v2:${chave}`) || "null");
      if (s && typeof s === "object") return s;
    } catch { /* usa padrão */ }
    return Object.fromEntries(GRUPOS.map((g) => [g.id, false])); // padrão: todos FECHADOS
  });
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`menu-favs:${chave}`) || "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(`menu-grupos-v2:${chave}`, JSON.stringify(abertos)); }, [abertos, chave]);
  useEffect(() => { localStorage.setItem(`menu-favs:${chave}`, JSON.stringify(favs)); }, [favs, chave]);

  // Sanfona de UMA por vez: abrir uma categoria fecha as outras.
  const toggleGrupo = (id: string) => setAbertos((a) => (a[id] ? {} : { [id]: true }));
  const toggleFav = (to: string) => setFavs((f) => (f.includes(to) ? f.filter((x) => x !== to) : [...f, to]));

  // grupos com pelo menos um item visível
  const grupos = GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((it) => itemVisivel(u, it)) })).filter((g) => g.itens.length);
  const comLink = GRUPOS.flatMap((g) => g.itens).filter((it) => it.to);
  const favItens = favs.map((to) => comLink.find((it) => it.to === to)).filter((it): it is MenuItem => !!it && itemVisivel(u, it));

  // qual item está ativo agora (um só)
  let ativoTo = "";
  let melhor = 0;
  for (const it of comLink) {
    const s = itemAtivo(it.to!, loc);
    if (s > melhor) { melhor = s; ativoTo = it.to!; }
  }

  const Item = (it: MenuItem, ctx: string) => {
    const desativado = it.soon || !it.to;
    const fav = !!it.to && favs.includes(it.to);
    const ativo = !!it.to && it.to === ativoTo;
    const inner = (
      <>
        <span className="nav-ic">{it.icon}</span>
        {!min && <span className="nav-lbl">{it.label}</span>}
        {!min && it.soon && <span className="soon">em breve</span>}
      </>
    );
    return (
      <div className={"nav-row" + (min ? " min" : "")} key={ctx + it.label}>
        {desativado ? (
          <span className="nav-item disabled" title={it.label + (it.soon ? " — em breve" : "")}>{inner}</span>
        ) : (
          <NavLink to={it.to!} className={"nav-item" + (ativo ? " active" : "")} title={it.label}>{inner}</NavLink>
        )}
        {!min && !desativado && (
          <button
            className={"fav-star" + (fav ? " on" : "")}
            title={fav ? "Remover dos favoritos" : "Fixar nos favoritos"}
            onClick={() => toggleFav(it.to!)}
          >
            {fav ? "★" : "☆"}
          </button>
        )}
      </div>
    );
  };

  return (
    <nav className="menu">
      {favItens.length > 0 && (
        <div className="menu-favs">
          {!min && <div className="menu-sec">★ Favoritos</div>}
          {favItens.map((it) => Item(it, "fav-"))}
        </div>
      )}
      {grupos.map((g) => (
        <div className={"menu-grupo" + (abertos[g.id] ? " aberto" : "")} key={g.id}>
          <button
            className="menu-grp-hd"
            onClick={() => toggleGrupo(g.id)}
            title={abertos[g.id] ? `Fechar ${g.label}` : `Abrir ${g.label}`}
          >
            <span className="nav-ic">{g.icon}</span>
            {!min && <span className="menu-grp-lbl">{g.label}</span>}
            {!min && <span className="menu-grp-car">▸</span>}
          </button>
          <div className="menu-grp-sub"><div className="menu-grp-itens">{g.itens.map((it) => Item(it, g.id))}</div></div>
        </div>
      ))}
    </nav>
  );
}

export function Layout() {
  const u = getUser();
  const nav = useNavigate();
  const [ssMin, setSsMin] = useState(() => Number(localStorage.getItem("ssMin") || "0"));
  function mudarSs(v: number) {
    const n = Math.max(0, Math.min(240, Math.floor(v) || 0));
    setSsMin(n);
    localStorage.setItem("ssMin", String(n));
  }
  // Tema claro/escuro (por dispositivo, igual ao protetor de tela).
  const [tema, setTema] = useState(() => localStorage.getItem("tema") || "claro");
  useEffect(() => {
    document.body.classList.toggle("dark", tema === "escuro");
    localStorage.setItem("tema", tema);
  }, [tema]);
  // Menu recolhido (só ícones) — por dispositivo.
  const [menuMin, setMenuMin] = useState(() => localStorage.getItem("menu-min") === "1");
  function alternarMenu() {
    setMenuMin((v) => {
      localStorage.setItem("menu-min", v ? "0" : "1");
      return !v;
    });
  }
  function sair() {
    setUser(null);
    nav("/login", { replace: true });
  }
  if (!u) return <Navigate to="/login" replace />;
  const tvsVisiveis = TVS.filter((t) => pode(u, t.page));
  const iniciais = u.nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={"app" + (menuMin ? " menu-min" : "")}>
      <header className="topbar">
        <Link to="/" className="brand">
          <img className="brand-logo" src="/logo-bigtricot.png" alt="Big Tricot Home Decor" />
          <span className="brand-sub">Rolagem de Fase</span>
        </Link>
        <div className="topbar-right">
          <UndoRedo />
          <SinoPush />
          <button
            className="ur-btn"
            onClick={() => setTema(tema === "escuro" ? "claro" : "escuro")}
            title="Alternar tema claro / escuro"
          >
            {tema === "escuro" ? "☀️ Claro" : "🌙 Escuro"}
          </button>
          {tvsVisiveis.map((t) => (
            <a key={t.to} className={t.cls} href={t.to} target="_blank" rel="noopener noreferrer" title={t.label}>
              {t.icon} {t.label}
            </a>
          ))}
          <span className="user">{u.nome}</span>
          <span className="avatar">{iniciais || "?"}</span>
          <button className="ur-btn" onClick={sair} title="Sair">Sair</button>
        </div>
      </header>

      <aside className={"sidebar" + (menuMin ? " min" : "")}>
        <div className="sidebar-head">
          {!menuMin && (
            <div>
              <div className="sidebar-title">Big Tricot</div>
              <div className="sidebar-kicker">Cadastro &amp; Produção</div>
            </div>
          )}
          <button className="menu-collapse" onClick={alternarMenu} title={menuMin ? "Expandir menu" : "Recolher menu (só ícones)"}>
            {menuMin ? "»" : "«"}
          </button>
        </div>
        <SidebarMenu u={u} min={menuMin} />
        {!menuMin && (
          <div className="ss-cfg" title="Após esse tempo sem uso, entra em modo TV (Painel). 0 = desligado.">
            <div className="ss-cfg-top">💤 Protetor de tela</div>
            <div className="ss-cfg-row">
              <input type="number" min={0} max={240} value={ssMin} onChange={(e) => mudarSs(Number(e.target.value))} />
              <span className="ss-cfg-un">minutos</span>
            </div>
            <div className="ss-cfg-hint">0 = desligado · abre o Painel TV após esse tempo parado</div>
          </div>
        )}
        <div className="sidebar-version">{menuMin ? "·" : VERSION}</div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
