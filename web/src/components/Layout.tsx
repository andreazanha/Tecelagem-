import { useEffect, useReducer, useState } from "react";
import { NavLink, Outlet, Link, Navigate, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { VERSION } from "../version";
import { historico } from "../historico";
import { getUser, setUser, pode } from "../auth";

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

const NAV = [
  { to: "/pedidos", icon: "📦", label: "Pedidos", page: "pedidos" },
  { to: "/producao", icon: "🧶", label: "Tecelagem", page: "producao" },
  { to: "/passadoria", icon: "🔥", label: "Passadoria", page: "passadoria" },
  { to: "/corte", icon: "✂️", label: "Corte", page: "corte" },
  { to: "/costura", icon: "🪡", label: "Costura", page: "costura" },
  { to: "/revisao", icon: "🔍", label: "Revisão", page: "revisao" },
  { to: "/estoque", icon: "📦", label: "Estoque", page: "estoque" },
  { to: "/cadastros", icon: "🏷️", label: "Cadastros", page: "cadastros" },
  { to: "/romaneios", icon: "📋", label: "Romaneios", page: "romaneios" },
];
const TVS = [
  { to: "/dashboard", icon: "📺", label: "Painel TV", page: "tv-dashboard", cls: "painel-link" },
  { to: "/tv/tecelagem", icon: "🧵", label: "TV Tecelagem", page: "tv-tecelagem", cls: "painel-link tcl-link" },
  { to: "/tv/costura", icon: "🪡", label: "TV Costura", page: "tv-costura", cls: "painel-link tcl-link" },
  { to: "/tv/revisao", icon: "🔍", label: "TV Revisão", page: "tv-revisao", cls: "painel-link tcl-link" },
  { to: "/tv/novo-pedido", icon: "🔔", label: "TV Novo Pedido", page: "tv-novo-pedido", cls: "painel-link tcl-link" },
];

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
  function sair() {
    setUser(null);
    nav("/login", { replace: true });
  }
  if (!u) return <Navigate to="/login" replace />;
  const navVisivel = NAV.filter((n) => pode(u, n.page));
  const tvsVisiveis = TVS.filter((t) => pode(u, t.page));
  const iniciais = u.nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <Logo h={30} color="#ffffff" />
          <span className="brand-sub">Rolagem de Fase</span>
        </Link>
        <div className="topbar-right">
          <UndoRedo />
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

      <aside className="sidebar">
        <div className="sidebar-title">Big Tricot</div>
        <div className="sidebar-kicker">Cadastro &amp; Produção</div>
        <nav>
          {navVisivel.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
            >
              <span className="nav-ic">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ss-cfg" title="Após esse tempo sem uso, entra em modo TV (Painel). 0 = desligado.">
          <div className="ss-cfg-top">💤 Protetor de tela</div>
          <div className="ss-cfg-row">
            <input type="number" min={0} max={240} value={ssMin} onChange={(e) => mudarSs(Number(e.target.value))} />
            <span className="ss-cfg-un">minutos</span>
          </div>
          <div className="ss-cfg-hint">0 = desligado · abre o Painel TV após esse tempo parado</div>
        </div>
        <div className="sidebar-version">{VERSION}</div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
