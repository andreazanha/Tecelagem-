import { useEffect, useReducer, useState } from "react";
import { NavLink, Outlet, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { VERSION } from "../version";
import { historico } from "../historico";
import { getUser, setUser, pode } from "../auth";
import { api, type MaterialCategoriaDef } from "../api";
import { pushSuportado, pushAtivo, ativarPush, desativarPush } from "../push";
import { Icon } from "./Icon";
import { Assistente } from "./Assistente";
import { ChatInterno } from "./ChatInterno";
import { InstalarApp } from "./InstalarApp";
import { DemoMode } from "./DemoMode";

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
      {ativo ? "🔔" : "🔕"}
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
        className="ur-btn ur-ico"
        disabled={!historico.podeDesfazer()}
        title={historico.podeDesfazer() ? `Desfazer ${historico.rotuloDesfazer()} (Ctrl+Z)` : "Nada para desfazer"}
        onClick={() => historico.desfazer().catch((e) => alert((e as Error).message))}
      >
        ↶
      </button>
      <button
        className="ur-btn ur-ico"
        disabled={!historico.podeRefazer()}
        title={historico.podeRefazer() ? `Refazer ${historico.rotuloRefazer()} (Ctrl+Y)` : "Nada para refazer"}
        onClick={() => historico.refazer().catch((e) => alert((e as Error).message))}
      >
        ↷
      </button>
    </div>
  );
}

// Item do menu. `page` = permissão da tela (se ausente e sem `soon`, é livre).
// `soon` = página ainda não existe → aparece só para admin, desabilitada (sem 404).
interface MenuItem { to?: string; icon: string; label: string; page?: string; soon?: boolean; children?: MenuItem[]; dyn?: string }
interface MenuGrupo { id: string; icon: string; label: string; itens: MenuItem[] }

// Menu em grupos sanfonados. Itens existentes apontam para rotas reais (alguns
// para abas via ?aba=). Itens sem página ainda ficam como "em breve".
const GRUPOS: MenuGrupo[] = [
  {
    id: "comercial", icon: "🛒", label: "Comercial", itens: [
      { to: "/pedidos", icon: "📦", label: "Pedidos", page: "pedidos" },
      { to: "/pedidos/novo", icon: "➕", label: "Novo Pedido", page: "pedidos" },
      { to: "/clientes", icon: "👥", label: "Clientes", page: "comercial" },
      { to: "/funil", icon: "🎯", label: "Funil de Vendas", page: "comercial" },
      { to: "/atendimento", icon: "💬", label: "Atendimento (WhatsApp)", page: "comercial" },
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
    id: "estoque", icon: "📊", label: "Estoque", itens: [
      { to: "/estoque", icon: "📦", label: "Entradas", page: "estoque" },
      { to: "/fio-por-cor", icon: "🧵", label: "Estoque de fios", page: "estoque" },
      { to: "/estoque-materiais", icon: "🧷", label: "Estoque de materiais", page: "estoque" },
      { to: "/produtos?aba=estoque", icon: "📊", label: "Estoque de Produtos", page: "produtos" },
      { to: "/produtos?aba=reposicao", icon: "⚠️", label: "Reposição", page: "produtos" },
      { to: "/cadastros?aba=materiais", icon: "🧷", label: "Materiais", page: "cadastros" },
      { to: "/produtos?aba=entradas", icon: "⬇️", label: "Entrada de Estoque", page: "produtos" },
      { to: "/produtos?aba=ficha", icon: "🧵", label: "Ficha Técnica", page: "produtos" },
      { to: "/produtos?aba=historico", icon: "🕑", label: "Histórico", page: "produtos" },
    ],
  },
  {
    id: "expedicao", icon: "🚚", label: "Expedição", itens: [
      { to: "/expedicao", icon: "📮", label: "Expedição", page: "expedicao" },
      { to: "/transporte", icon: "🚚", label: "Transporte", page: "transporte" },
      { to: "/romaneios", icon: "📋", label: "Romaneios", page: "romaneios" },
      { to: "/impressao-etiquetas", icon: "🏷️", label: "Impressão de etiquetas", page: "expedicao" },
      { icon: "✅", label: "Conferência Final", soon: true },
    ],
  },
  {
    id: "fiscal", icon: "🧾", label: "Fiscal", itens: [
      { to: "/fiscal", icon: "🧾", label: "Fiscal", page: "fiscal" },
      { icon: "📄", label: "Notas Fiscais", soon: true },
      { icon: "💰", label: "Contas a Receber", soon: true },
      { icon: "📊", label: "Relatórios Fiscais", soon: true },
    ],
  },
  {
    id: "cadastros", icon: "🗂️", label: "Cadastros", itens: [
      { to: "/cadastros?aba=produtos", icon: "📦", label: "Produtos", page: "cadastros" },
      { to: "/cadastros?aba=tamanhos", icon: "📏", label: "Tamanhos", page: "cadastros" },
      // Materiais: submenu dinâmico (Fios + insumos cadastrados + Compras), montado em TopNav.
      { icon: "🧷", label: "Materiais", page: "cadastros", dyn: "materiais", children: [] },
      { to: "/cadastros?aba=fornecedores", icon: "🚛", label: "Fornecedores", page: "cadastros" },
      { to: "/cadastros?aba=usuarios", icon: "🔐", label: "Usuários", page: "cadastros" },
    ],
  },
  {
    id: "relatorios", icon: "📈", label: "Relatórios", itens: [
      { to: "/todos-pedidos", icon: "📋", label: "Todos os Pedidos", page: "todos-pedidos" },
      { to: "/relatorio-vendas", icon: "🏆", label: "Vendas (o que vende mais)", page: "todos-pedidos" },
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

// className como FUNÇÃO (não string) no NavLink: impede o react-router de marcar
// sozinho todos os links do mesmo caminho (/produtos?aba=…) — só o nosso `ativo` vale.
const ddClasse = (ativo: boolean) => () => "topnav-dd-i" + (ativo ? " active" : "");

// Menu no TOPO: grupos como abas horizontais na barra azul; cada grupo abre um
// dropdown com seus itens. Sem barra lateral — o conteúdo usa a largura toda.
function TopNav({ u }: { u: NonNullable<ReturnType<typeof getUser>> }) {
  const loc = useLocation();
  const [aberto, setAberto] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Insumos (categorias de material) cadastrados → viram sub-itens do menu Materiais.
  const [insumos, setInsumos] = useState<MaterialCategoriaDef[]>([]);
  useEffect(() => { api.listarCategoriasMaterial().then(setInsumos).catch(() => {}); }, []);
  // Monta os filhos do menu Materiais: Fios + cada insumo cadastrado + Compras.
  const matChildren = (): MenuItem[] => [
    { to: "/cadastros?aba=tipos-fio", icon: "🎨", label: "Fios", page: "cadastros" },
    ...insumos.map((c) => ({ to: `/cadastros?aba=materiais&mat=${c.slug}`, icon: c.icone || "🔹", label: c.nome, page: "cadastros" })),
    { to: "/cadastros?aba=materiais&mat=__compras", icon: "🛒", label: "Compras", page: "cadastros" },
  ];
  const comDyn = (it: MenuItem): MenuItem => (it.dyn === "materiais" ? { ...it, children: matChildren() } : it);

  // Fecha ao navegar (troca de rota/aba).
  useEffect(() => { setAberto(null); setMobileOpen(false); }, [loc.pathname, loc.search]);
  // Fecha o dropdown ao clicar fora do menu.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest?.(".topnav")) setAberto(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const grupos = GRUPOS.map((g) => ({ ...g, itens: g.itens.map(comDyn).filter((it) => itemVisivel(u, it)) })).filter((g) => g.itens.length);
  // inclui os filhos (submenus) na detecção de item ativo
  const comLink = GRUPOS.flatMap((g) => g.itens.map(comDyn)).flatMap((it) => [it, ...(it.children || [])]).filter((it) => it.to);

  // qual item está ativo agora (um só) e a que grupo ele pertence
  let ativoTo = "";
  let melhor = 0;
  for (const it of comLink) {
    const s = itemAtivo(it.to!, loc);
    if (s > melhor) { melhor = s; ativoTo = it.to!; }
  }
  const grupoAtivo = grupos.find((g) => g.itens.some((it) => it.to === ativoTo || (it.children || []).some((ch) => ch.to === ativoTo)))?.id;

  const DDItem = (it: MenuItem, ctx: string) => {
    const inner = (
      <>
        <span className="tn-dd-ic"><Icon emoji={it.icon} /></span>
        <span className="tn-dd-lbl">{it.label}</span>
        {it.soon && <span className="tn-soon">em breve</span>}
      </>
    );
    // Item com submenu: abre um segundo nível ao passar o mouse.
    if (it.children && it.children.length) {
      const subAtivo = it.children.some((ch) => !!ch.to && ch.to === ativoTo);
      return (
        <div className={"topnav-dd-i has-sub" + (subAtivo ? " active" : "")} key={ctx + it.label} title={it.label}>
          {inner}
          <span className="tn-sub-car">▸</span>
          <div className="topnav-sub">{it.children.map((ch) => DDItem(ch, ctx + it.label))}</div>
        </div>
      );
    }
    const desativado = it.soon || !it.to;
    const ativo = !!it.to && it.to === ativoTo;
    return desativado ? (
      <span className="topnav-dd-i disabled" key={ctx + it.label} title={it.label + (it.soon ? " — em breve" : "")}>{inner}</span>
    ) : (
      <NavLink to={it.to!} key={ctx + it.label} className={ddClasse(ativo)} title={it.label}>{inner}</NavLink>
    );
  };

  return (
    <nav className={"topnav" + (mobileOpen ? " open" : "")}>
      <button className="topnav-burger" onClick={() => setMobileOpen((v) => !v)} title="Menu" aria-label="Abrir menu">☰</button>
      <div className="topnav-groups">
        {grupos.map((g) => (
          <div className={"topnav-grp" + (aberto === g.id ? " open" : "")} key={g.id}>
            <button
              className={"topnav-btn" + (grupoAtivo === g.id ? " on" : "")}
              onClick={() => setAberto((a) => (a === g.id ? null : g.id))}
              title={g.label}
            >
              <span className="tn-ic"><Icon emoji={g.icon} /></span>
              {g.label && <span className="tn-lbl">{g.label}</span>}
              <span className="tn-car">▾</span>
            </button>
            {aberto === g.id && (
              <div className="topnav-dd">{g.itens.map((it) => DDItem(it, g.id))}</div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

// Menu "Painel TV" no topo: um botão que abre a lista de telas de TV.
function TvMenu({ tvs }: { tvs: typeof TVS }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest?.(".tvmenu")) setAberto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  if (!tvs.length) return null;
  return (
    <div className="tvmenu">
      <button className="ur-btn" onClick={() => setAberto((v) => !v)} title="Painéis de TV">📺 TV ▾</button>
      {aberto && (
        <div className="topnav-dd tv">
          {tvs.map((t) => (
            <a key={t.to} className="topnav-dd-i" href={t.to} target="_blank" rel="noopener noreferrer" onClick={() => setAberto(false)}>
              <span className="tn-dd-ic"><Icon emoji={t.icon} /></span>
              <span className="tn-dd-lbl">{t.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const u = getUser();
  const nav = useNavigate();
  const [ssMin, setSsMin] = useState(() => Number(localStorage.getItem("ssMin") || "0"));
  const [ssOpen, setSsOpen] = useState(false);
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
  function sair() {
    setUser(null);
    nav("/login", { replace: true });
  }
  // Rodando como app instalado (PWA/standalone)? Aí não tem o F5 do navegador,
  // então mostramos um botão "Atualizar" que recarrega igual F5.
  const ehApp = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  if (!u) return <Navigate to="/login" replace />;
  const tvsVisiveis = TVS.filter((t) => pode(u, t.page));
  const iniciais = u.nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="app topnav-app">
      <header className="topbar">
        <Link to="/" className="brand" title="Início">
          <img className="brand-logo" src="/logo-bigtricot.png" alt="Big Tricot Home Decor" />
        </Link>
        <TopNav u={u} />
        <div className="topbar-right">
          <UndoRedo />
          {ehApp && (
            <button className="ur-btn" onClick={() => window.location.reload()} title="Atualizar (recarregar, igual F5)">⟳ Atualizar</button>
          )}
          <SinoPush />
          <button
            className="ur-btn"
            onClick={() => setTema(tema === "escuro" ? "claro" : "escuro")}
            title="Alternar tema claro / escuro"
          >
            {tema === "escuro" ? "☀️ Claro" : "🌙 Escuro"}
          </button>
          <TvMenu tvs={tvsVisiveis} />
          {/* Protetor de tela (abre para baixo aqui no topo). */}
          <div className="ss-wrap">
            <button
              className={"ur-btn ss-mini" + (ssOpen ? " on" : "")}
              onClick={() => setSsOpen((o) => !o)}
              title="Protetor de tela: após esse tempo sem uso, abre o Painel TV. Clique para ajustar."
            >
              💤<span className="ss-mini-v">{ssMin > 0 ? `${ssMin} min` : "off"}</span>
            </button>
            {ssOpen && (
              <>
                <div className="ss-pop-bg" onClick={() => setSsOpen(false)} />
                <div className="ss-pop down" onClick={(e) => e.stopPropagation()}>
                  <div className="ss-pop-top">💤 Protetor de tela</div>
                  <div className="ss-pop-row">
                    <input type="number" min={0} max={240} value={ssMin} onChange={(e) => mudarSs(Number(e.target.value))} autoFocus />
                    <span>minutos</span>
                  </div>
                  <div className="ss-pop-hint">0 = desligado. Abre o Painel TV após esse tempo parado.</div>
                </div>
              </>
            )}
          </div>
          <InstalarApp />
          <span className="avatar" title={`${u.nome} · ${VERSION}`}>{iniciais || "?"}</span>
          <span className="app-ver" title="Versão do sistema">{VERSION}</span>
          <button className="ur-btn" onClick={sair} title="Sair">Sair</button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <Assistente />
      <ChatInterno />
      <DemoMode />
    </div>
  );
}
